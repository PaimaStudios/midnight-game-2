import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Button } from "../widgets/button";
import { AbilityWidget } from "../widgets/ability";
import { BattleConfig, BattleRewards, pureCircuits } from "game2-contract";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { TestMenu } from "../menus/main";
import { RetreatButton } from "../widgets/retreat-button";
import { RetreatOverlay } from "../widgets/retreat-overlay";

// Legacy layout functions - TODO: replace this with layout manager usage
const abilityIdleY = () => GAME_HEIGHT * 0.75;

export class UIStateManager {
    private scene: Phaser.Scene;
    private api: DeployedGame2API;
    private fightButton: Button | null = null;
    private abilityIcons: AbilityWidget[] = [];
    private retreatButton: RetreatButton | null = null;
    private retreatOverlay: RetreatOverlay | null = null;

    constructor(scene: Phaser.Scene, api: DeployedGame2API) {
        this.scene = scene;
        this.api = api;
    }

    public createFightButton(onFightCallback: () => void) {
        // Prevent duplicate buttons
        if (this.fightButton) return;
        
        this.fightButton = new Button(
            this.scene,
            GAME_WIDTH / 2,
            GAME_HEIGHT * 0.90,
            200,
            48,
            'Fight',
            12,
            onFightCallback
        );
    }

    public removeFightButton() {
        if (this.fightButton) {
            this.fightButton.destroy();
            this.fightButton = null;
        }
    }

    public createAbilityIcons(state: Game2DerivedState, battle: BattleConfig): AbilityWidget[] {
        const battleConfig = state.activeBattleConfigs.get(pureCircuits.derive_battle_id(battle));
        const battleState = state.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        
        if (!battleConfig || !battleState) return [];
        
        // Clean up existing ability cards
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        // Create ability cards
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => state.allAbilities.get(id)!);
        this.abilityIcons = abilities.map((ability, i) => 
            new AbilityWidget(this.scene, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability)
        );
        
        return this.abilityIcons;
    }

    public refreshAbilityIconsForNextRound(state: Game2DerivedState, battle: BattleConfig): AbilityWidget[] {
        const battleConfig = state.activeBattleConfigs.get(pureCircuits.derive_battle_id(battle));
        const battleState = state.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        
        if (!battleConfig || !battleState) return [];
        
        // Clean up existing ability cards
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => state.allAbilities.get(id)!);
        
        // Create new ability cards for the next round
        this.abilityIcons = abilities.map((ability, i) => 
            new AbilityWidget(this.scene, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability)
        );
        
        return this.abilityIcons;
    }

    public destroyAbilityIcons() {
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
    }

    public getAbilityIcons(): AbilityWidget[] {
        return this.abilityIcons;
    }

    public showBattleEndScreen(circuit: BattleRewards, state: Game2DerivedState) {
        if (circuit.alive) {
            this.scene.sound.play('battle-win', { volume: 0.9 });
        } else {
            this.scene.sound.play('battle-lose', { volume: 0.9 });
        }
        const returnButtonText = 'Return to Hub';
        const battleOverText = circuit.alive ? `You won ${circuit.gold} gold!` : `You Died :(`;
        this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.52, battleOverText, fontStyle(16)).setOrigin(0.5, 0.5);
        new Button(this.scene, GAME_WIDTH / 2, GAME_HEIGHT * 0.72, GAME_WIDTH * 0.5, GAME_HEIGHT * 0.2, returnButtonText, 16, () => {
            // Stop battle music when returning to hub
            const battleMusic = this.scene.sound.get('boss-battle-music');
            if (battleMusic) {
                battleMusic.stop();
                battleMusic.destroy();
            }

            this.scene.scene.remove('TestMenu');
            this.scene.scene.add('TestMenu', new TestMenu(this.api, state));
            this.scene.scene.start('TestMenu');
        });
        
        if (circuit.alive && circuit.ability.is_some) {
            new AbilityWidget(this.scene, GAME_WIDTH / 2, GAME_HEIGHT * 0.35, state?.allAbilities.get(circuit.ability.value)!);
            this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'New ability available', fontStyle(12)).setOrigin(0.5, 0.5);
        }
    }

    public createRetreatButton(battle: BattleConfig, state: Game2DerivedState, onRetreatStart: () => void) {
        if (this.retreatButton) return;

        this.retreatButton = new RetreatButton(
            this.scene,
            GAME_WIDTH,
            0,
            () => this.showRetreatConfirmation(battle, state, onRetreatStart)
        );
        this.retreatButton.setDepth(100);
    }

    public removeRetreatButton() {
        if (this.retreatButton) {
            this.retreatButton.destroy();
            this.retreatButton = null;
        }
    }

    private showRetreatConfirmation(battle: BattleConfig, state: Game2DerivedState, onRetreatStart: () => void) {
        // Don't allow multiple overlays
        if (this.retreatOverlay) {
            return;
        }

        // Disable retreat button while overlay is shown
        this.retreatButton?.setEnabled(false);

        this.retreatOverlay = new RetreatOverlay(
            this.scene,
            () => this.executeRetreat(battle, state, onRetreatStart),
            () => {
                // On cancel, re-enable the button
                this.retreatButton?.setEnabled(true);
                this.retreatOverlay = null;
            }
        );
    }

    private async executeRetreat(battle: BattleConfig, state: Game2DerivedState, onRetreatStart: () => void) {
        logger.combat.info('Retreating from battle');

        // Call the callback to disable interactions in the battle scene
        onRetreatStart();

        // Disable retreat button
        this.retreatButton?.setEnabled(false);

        try {
            const battleId = pureCircuits.derive_battle_id(battle);

            // Call the retreat API
            await this.api.retreat_from_battle(battleId);

            // Stop battle music
            const battleMusic = this.scene.sound.get('boss-battle-music');
            if (battleMusic) {
                battleMusic.stop();
                battleMusic.destroy();
            }

            // Cleanup retreat button and overlay
            this.removeRetreatButton();
            this.retreatOverlay = null;

            // Return to hub
            this.scene.scene.remove('TestMenu');
            this.scene.scene.add('TestMenu', new TestMenu(this.api, state));
            this.scene.scene.start('TestMenu');
        } catch (err) {
            logger.network.error(`Error retreating from battle: ${err}`);
            // Re-enable interactions on error
            this.retreatButton?.setEnabled(true);
            this.retreatOverlay = null;
        }
    }
}