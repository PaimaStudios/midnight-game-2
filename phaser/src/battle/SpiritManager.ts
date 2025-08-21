import { Game2DerivedState } from "game2-api";
import { BattleConfig, pureCircuits } from "game2-contract";
import { SpiritWidget } from "../widgets/ability";
import { BattleLayout } from "./BattleLayout";

export class SpiritManager {
    private scene: Phaser.Scene;
    private layout: BattleLayout;
    private spirits: SpiritWidget[] = [];

    constructor(scene: Phaser.Scene, layout: BattleLayout) {
        this.scene = scene;
        this.layout = layout;
    }

    public createSpirits(state: Game2DerivedState, battle: BattleConfig): SpiritWidget[] {
        // Clean up existing spirits first
        this.cleanupSpirits();

        const battleConfig = state.activeBattleConfigs.get(pureCircuits.derive_battle_id(battle));
        const battleState = state.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        
        if (!battleConfig || !battleState) return this.spirits;
        
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => state.allAbilities.get(id)!);
        
        // Create new spirits
        this.spirits = abilities.map((ability, i) => new SpiritWidget(
            this.scene, 
            this.layout.spiritX(i), 
            this.layout.spiritY(), 
            ability
        ));

        return this.spirits;
    }

    public getSpirits(): SpiritWidget[] {
        return this.spirits;
    }

    public cleanupSpirits() {
        this.spirits.forEach((s) => s.destroy());
        this.spirits = [];
    }

    public refreshSpiritsForNextRound(state: Game2DerivedState, battle: BattleConfig): SpiritWidget[] {
        return this.createSpirits(state, battle);
    }

    public updateReferences(newSpirits: SpiritWidget[]) {
        this.spirits = newSpirits;
    }
}