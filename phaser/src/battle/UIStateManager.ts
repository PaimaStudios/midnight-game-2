import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Button } from "../widgets/button";
import { AbilityWidget } from "../widgets/ability";
import { BattleConfig, BattleRewards, pureCircuits } from "game2-contract";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH } from "../main";
import { TestMenu } from "../menus/main";

// Legacy layout functions - TODO: replace this with layout manager usage
const abilityIdleY = () => GAME_HEIGHT * 0.75;

export class UIStateManager {
    private scene: Phaser.Scene;
    private api: DeployedGame2API;
    private fightButton: Button | null = null;
    private abilityIcons: AbilityWidget[] = [];

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
        const returnButtonText = 'Return to Hub';
        const battleOverText = circuit.alive ? `You won ${circuit.gold} gold!` : `You Died :(`;
        this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.52, battleOverText, fontStyle(16)).setOrigin(0.5, 0.5);
        new Button(this.scene, GAME_WIDTH / 2, GAME_HEIGHT * 0.72, GAME_WIDTH * 0.5, GAME_HEIGHT * 0.2, returnButtonText, 16, () => {
            this.scene.scene.remove('TestMenu');
            this.scene.scene.add('TestMenu', new TestMenu(this.api, state));
            this.scene.scene.start('TestMenu');
        });
        
        if (circuit.alive && circuit.ability.is_some) {
            new AbilityWidget(this.scene, GAME_WIDTH / 2, GAME_HEIGHT * 0.35, state?.allAbilities.get(circuit.ability.value)!);
            this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'New ability available', fontStyle(12)).setOrigin(0.5, 0.5);
        }
    }
}