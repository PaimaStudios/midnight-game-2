/**
 * Active battle scene and relevant files.
 */
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { BattleConfig, pureCircuits } from "game2-contract";
import { Subscription } from "rxjs";
import { AbilityWidget, SpiritWidget } from "../widgets/ability";
import { Loader } from "./loader";
import { addScaledImage } from "../utils/scaleImage";
import { BIOME_ID, biomeToBackground } from "../battle/biome";
import { BattleLayout } from "../battle/BattleLayout";
import { CombatAnimationManager } from "../battle/CombatAnimationManager";
import { EnemyManager, Actor } from "../battle/EnemyManager";
import { SpiritManager, BattlePhase } from "../battle/SpiritManager";
import { UIStateManager } from "../battle/UIStateManager";
import { combat_round_logic } from "../battle/logic";

// Legacy layout functions - TODO: replace these with layout manager usage
const playerX = () => GAME_WIDTH / 2;
const playerY = () => GAME_HEIGHT * 0.95;

export class ActiveBattle extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    battle: BattleConfig;
    state: Game2DerivedState;
    player!: Actor;
    enemies: Actor[];
    abilityIcons: AbilityWidget[];
    spirits: SpiritWidget[];
    background!: Phaser.GameObjects.GameObject;
    
    // Managers
    private layout: BattleLayout;
    private combatAnimationManager!: CombatAnimationManager;
    private enemyManager!: EnemyManager;
    private spiritManager!: SpiritManager;
    private uiStateManager!: UIStateManager;

    constructor(api: DeployedGame2API, battle: BattleConfig, state: Game2DerivedState) {
        super("ActiveBattle");
        
        logger.combat.debug('ActiveBattle constructor called');
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
        this.uiStateManager = new UIStateManager(this, this.api);
    }

    create() {
        const loader = this.scene.get('Loader') as Loader;
        logger.combat.debug('ActiveBattle.create() called');
        
        // Stop menu music when entering battle
        const menuMusic = this.sound.get('menu-music');
        if (menuMusic) {
            menuMusic.stop();
            menuMusic.destroy();
        }
        
        this.background = addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, biomeToBackground(Number(this.battle.level.biome) as BIOME_ID)).setDepth(-10);

        // Create player after scene is initialized
        this.player = new Actor(this, playerX(), playerY(), null);
        this.enemies = this.enemyManager.createEnemies(this.battle);

        // Initialize spirits and start targeting
        this.initializeSpirits();
    }

    private onStateChange(state: Game2DerivedState) {
        logger.gameState.debug(`ActiveBattle.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);
    }

    private initializeSpirits() {
        logger.combat.debug('initializeSpirits called');
        if (!this.state || !this.battle) {
            logger.combat.debug('No state or battle found');
            return;
        }
        
        const battleConfig = this.state.activeBattleConfigs.get(pureCircuits.derive_battle_id(this.battle));
        const battleState = this.state.activeBattleStates.get(pureCircuits.derive_battle_id(this.battle));
        
        if (!battleConfig || !battleState) {
            logger.combat.debug('No battleConfig or battleState found');
            return;
        }
        
        // Create spirits using SpiritManager
        this.spirits = this.spiritManager.createSpirits(this.state, this.battle);
        
        // Create ability cards using UIStateManager
        this.abilityIcons = this.uiStateManager.createAbilityIcons(this.state, this.battle);
        
        // Set up spirit manager for targeting
        this.spiritManager.updateTargetingReferences(this.spirits, this.enemies);
        this.spiritManager.setCallbacks({
            onAllSpiritsTargeted: () => this.uiStateManager.createFightButton(() => this.executeCombat()),
            onSpiritSelected: () => {
                // We can add additional spirit selection logic here
            },
            onTargetingStarted: () => this.uiStateManager.removeFightButton()
        });
        
        this.combatAnimationManager = new CombatAnimationManager(
            this,
            this.layout,
            this.spirits,
            this.uiStateManager.getAbilityIcons(),
            this.enemies,
            this.player,
            this.battle,
            this.background
        );
        
        // Start targeting phase
        this.spiritManager.startTargeting();
        
    }

    private async executeCombat() {
        if (this.spiritManager.getBattlePhase() !== BattlePhase.SPIRIT_TARGETING) return;
        if (!this.spiritManager.getTargets().every(target => target !== null)) return;  
        
        // Immediately remove the fight button to prevent double-clicks
        this.uiStateManager.removeFightButton();
        
        this.spiritManager.setBattlePhase(BattlePhase.COMBAT_ANIMATION);
        this.spiritManager.disableInteractions();
        
        // Execute combat round with selected targets
        await this.runCombat();
    }


    private resetSpirits() {
        // Reset and start targeting for next round
        this.spiritManager.reset();
        this.spiritManager.startTargeting();
    }

    private async runCombat() {
        const id = pureCircuits.derive_battle_id(this.battle);
        const clonedState = structuredClone(this.state!);
        let loaderStarted = false;
        
        const retryCombatRound = async (): Promise<any> => {
            try {
                const targets = this.spiritManager.getTargets().map(t => BigInt(t!)) as [bigint, bigint, bigint];
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
        const uiPromise = this.runCombatLogic(id, clonedState);
        
        // Wait for both API and UI to finish
        const [circuit, ui] = await Promise.all([apiPromise, uiPromise]);
        
        // Reset for next round or end battle
        this.handleCombatComplete(circuit, ui);
    }

    private runCombatLogic(id: bigint, clonedState: Game2DerivedState) {
        const targetsCopy = this.spiritManager.getTargets().map(target => target!) as number[];
        
        // Update animation manager references and use its callbacks
        this.combatAnimationManager.updateReferences(this.spirits, this.uiStateManager.getAbilityIcons(), this.enemies, this.player);
        
        // Use the imported combat logic with targets
        return combat_round_logic(id, clonedState, targetsCopy, this.combatAnimationManager.createCombatCallbacks());
    }

    private handleCombatComplete(circuit: any, ui: any) {
        // Synchronize visual actor HP with battle state HP
        
        this.player?.setBlock(0);
        this.enemyManager.clearBlocks();
        this.uiStateManager.destroyAbilityIcons();
        
        logger.combat.info(`------------------ BATTLE DONE --- BOTH UI AND LOGIC ----------------------`);
        logger.combat.debug(`UI REWARDS: ${safeJSONString(ui ?? { none: 'none' })}`);
        logger.combat.debug(`CIRCUIT REWARDS: ${safeJSONString(circuit ?? { none: 'none' })}`);
        
        if (circuit != undefined) {
            // Battle is over, show end-of-battle screen
            this.spiritManager.cleanupSpirits();
            this.uiStateManager.showBattleEndScreen(circuit, this.state);
        } else {
            // Battle continues, reset targeting state for next round
            // First, refresh spirits for the new round (abilities might have changed)
            this.spirits = this.spiritManager.refreshSpiritsForNextRound(this.state, this.battle);
            this.abilityIcons = this.uiStateManager.refreshAbilityIconsForNextRound(this.state, this.battle);
            
            // Update manager references to the new spirits
            this.spiritManager.updateTargetingReferences(this.spirits, this.enemies);
            this.combatAnimationManager.updateReferences(this.spirits, this.uiStateManager.getAbilityIcons(), this.enemies, this.player);
            
            this.resetSpirits();
        }
    }



}

