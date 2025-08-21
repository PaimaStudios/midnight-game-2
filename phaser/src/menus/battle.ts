/**
 * Active battle scene and relevant files.
 */
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { Button } from "../widgets/button";
import { BattleConfig, BOSS_TYPE, EnemyStats, pureCircuits } from "game2-contract";
import { TestMenu } from "./main";
import { Subscription } from "rxjs";
import { AbilityWidget, SpiritWidget } from "../widgets/ability";
import { Loader } from "./loader";
import { addScaledImage } from "../utils/scaleImage";
import { BIOME_ID, biomeToBackground } from "../battle/biome";
import { SpiritTargetingManager, BattlePhase } from "../battle/SpiritTargetingManager";
import { BattleLayout } from "../battle/BattleLayout";
import { CombatAnimationManager } from "../battle/CombatAnimationManager";
import { EnemyManager, Actor } from "../battle/EnemyManager";
import { SpiritManager } from "../battle/SpiritManager";
import { combat_round_logic_with_targets } from "../battle/logic";

// Legacy layout functions - TODO: replace these with layout manager usage
const abilityIdleY = () => GAME_HEIGHT * 0.75;
const playerX = () => GAME_WIDTH / 2;
const playerY = () => GAME_HEIGHT * 0.95;

export class ActiveBattle extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    battle: BattleConfig;
    state: Game2DerivedState;
    player: Actor | undefined;
    enemies: Actor[];
    abilityIcons: AbilityWidget[];
    spirits: SpiritWidget[];
    
    // Managers
    private layout: BattleLayout;
    private spiritTargetingManager!: SpiritTargetingManager;
    private combatAnimationManager!: CombatAnimationManager;
    private enemyManager!: EnemyManager;
    private spiritManager!: SpiritManager;
    private fightButton: Button | null = null;

    constructor(api: DeployedGame2API, battle: BattleConfig, state: Game2DerivedState) {
        super("ActiveBattle");

        this.api = api;
        this.battle = battle;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.enemies = [];
        this.abilityIcons = [];
        this.spirits = [];
        this.state = state;
        
        // Initialize managers
        this.layout = new BattleLayout(GAME_WIDTH, GAME_HEIGHT);
        this.enemyManager = new EnemyManager(this, this.layout);
        this.spiritManager = new SpiritManager(this, this.layout);
    }

    create() {
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, biomeToBackground(Number(this.battle.biome) as BIOME_ID)).setDepth(-10);

        this.player = new Actor(this, playerX(), playerY(), null);
        this.enemies = this.enemyManager.createEnemies(this.battle);

        // Initialize spirits and start targeting immediately
        this.initializeSpiritsForTargeting();
    }

    private onStateChange(state: Game2DerivedState) {
        logger.gameState.debug(`ActiveBattle.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);
    }

    private initializeSpiritsForTargeting() {
        if (!this.state || !this.battle) return;
        
        const battleConfig = this.state.activeBattleConfigs.get(pureCircuits.derive_battle_id(this.battle));
        const battleState = this.state.activeBattleStates.get(pureCircuits.derive_battle_id(this.battle));
        
        if (!battleConfig || !battleState) return;
        
        // Clean up existing ability cards
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        // Create spirits using SpiritManager
        this.spirits = this.spiritManager.createSpirits(this.state, this.battle);
        
        // Create ability cards
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => this.state!.allAbilities.get(id)!);
        this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability));
        
        // Initialize managers
        this.spiritTargetingManager = new SpiritTargetingManager(this, this.spirits, this.enemies, this.layout);
        this.spiritTargetingManager.setCallbacks({
            onAllSpiritsTargeted: () => this.createFightButton(),
            onSpiritSelected: () => {
                // Optional: could add additional spirit selection logic here
            },
            onTargetingStarted: () => this.removeFightButton()
        });
        
        this.combatAnimationManager = new CombatAnimationManager(
            this,
            this.layout,
            this.spirits,
            this.abilityIcons,
            this.enemies,
            this.player,
            this.battle
        );
        
        // Start targeting phase
        this.spiritTargetingManager.startTargeting();
        
    }




    private createFightButton() {
        // Prevent duplicate buttons
        if (this.fightButton) return;
        
        this.fightButton = new Button(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * 0.90,
            200,
            48,
            'Fight',
            12,
            () => this.executeCombatWithTargets()
        );
    }

    private removeFightButton() {
        if (this.fightButton) {
            this.fightButton.destroy();
            this.fightButton = null;
        }
    }

    private async executeCombatWithTargets() {
        if (this.spiritTargetingManager.getBattlePhase() !== BattlePhase.SPIRIT_TARGETING) return;
        if (!this.spiritTargetingManager.getTargets().every(target => target !== null)) return;
        
        // Immediately remove the fight button to prevent double-clicks
        this.removeFightButton();
        
        this.spiritTargetingManager.setBattlePhase(BattlePhase.COMBAT_ANIMATION);
        this.spiritTargetingManager.disableInteractions();
        
        // Execute combat round with selected targets
        await this.runCombatWithTargets();
    }


    private resetSpiritTargeting() {
        // Reset and start targeting for next round
        // The fight button will be removed by the onTargetingStarted callback
        this.spiritTargetingManager.reset();
        this.spiritTargetingManager.startTargeting();
    }

    private async runCombatWithTargets() {
        const id = pureCircuits.derive_battle_id(this.battle);
        const clonedState = structuredClone(this.state!);
        let loaderStarted = false;
        
        const retryCombatRound = async (): Promise<any> => {
            try {
                const targets = this.spiritTargetingManager.getTargets().map(t => BigInt(t!)) as [bigint, bigint, bigint];
                const result = await (this.api as any).combat_round(id, targets);
                if (loaderStarted) {
                    this.scene.resume().stop('Loader');
                }
                return result;
            } catch (err) {
                if (loaderStarted) {
                    const loader = this.scene.get('Loader') as Loader;
                    loader.setText("Error connecting to network.. Retrying");
                }
                logger.network.error(`Network Error during combat_round: ${err}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return retryCombatRound();
            }
        };
        const apiPromise = retryCombatRound();
        
        // Combat logic to use selected targets
        const uiPromise = this.runCombatLogicWithTargets(id, clonedState);
        
        // Wait for both API and UI to finish
        const [circuit, ui] = await Promise.all([apiPromise, uiPromise]);
        
        // Reset for next round or end battle
        this.handleCombatComplete(circuit, ui);
    }

    private runCombatLogicWithTargets(id: bigint, clonedState: Game2DerivedState) {
        const targetsCopy = this.spiritTargetingManager.getTargets().map(target => target!) as number[];
        
        // Update animation manager references and use its callbacks
        this.combatAnimationManager.updateReferences(this.spirits, this.abilityIcons, this.enemies, this.player);
        
        // Use the imported combat logic with targets
        return combat_round_logic_with_targets(id, clonedState, targetsCopy, this.combatAnimationManager.createCombatCallbacks());
    }

    private handleCombatComplete(circuit: any, ui: any) {
        // Synchronize visual actor HP with battle state HP
        
        this.player?.setBlock(0);
        this.enemyManager.clearBlocks();
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        logger.combat.info(`------------------ BATTLE DONE --- BOTH UI AND LOGIC ----------------------`);
        logger.combat.debug(`UI REWARDS: ${safeJSONString(ui ?? { none: 'none' })}`);
        logger.combat.debug(`CIRCUIT REWARDS: ${safeJSONString(circuit ?? { none: 'none' })}`);
        
        if (circuit != undefined) {
            // Battle is over, show end-of-battle screen
            this.spiritManager.cleanupSpirits();

            const battleOverText = circuit.alive ? `You won ${circuit.gold} gold!\nClick to Return.` : `You Died :(\nClick to Return.`;
            new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.72, GAME_WIDTH * 0.64, GAME_HEIGHT * 0.3, battleOverText, 16, () => {
                this.scene.remove('TestMenu');
                this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                this.scene.start('TestMenu');
            });
            if (circuit.alive && circuit.ability.is_some) {
                new AbilityWidget(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.35, this.state?.allAbilities.get(circuit.ability.value)!);
                this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'New ability available', fontStyle(12)).setOrigin(0.5, 0.5);
            }
        } else {
            // Battle continues, reset targeting state for next round
            // First, refresh spirits for the new round (abilities might have changed)
            this.spirits = this.spiritManager.refreshSpiritsForNextRound(this.state, this.battle);
            this.refreshAbilityIconsForNextRound();
            
            // Update manager references to the new spirits
            this.spiritTargetingManager.updateReferences(this.spirits, this.enemies);
            this.combatAnimationManager.updateReferences(this.spirits, this.abilityIcons, this.enemies, this.player);
            
            this.resetSpiritTargeting();
        }
    }

    private refreshAbilityIconsForNextRound() {
        if (!this.state || !this.battle) return;
        
        const battleConfig = this.state.activeBattleConfigs.get(pureCircuits.derive_battle_id(this.battle));
        const battleState = this.state.activeBattleStates.get(pureCircuits.derive_battle_id(this.battle));
        
        if (!battleConfig || !battleState) return;
        
        // Clean up existing ability cards
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => this.state!.allAbilities.get(id)!);
        
        // Create new ability cards for the next round
        this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability));
    }


}

