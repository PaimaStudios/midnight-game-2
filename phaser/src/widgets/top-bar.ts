/**
 * Top menu bar for back button / gold / etc
 */

import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Subscription } from "rxjs";
import { fontStyle } from "../main";
import { Color } from "../constants/colors";
import { Button } from "./button";

export const TOP_BAR_WIDTH = 40;
export const TOP_BAR_OFFSET = 24;

export class TopBar extends Phaser.GameObjects.Container {
    api: DeployedGame2API;
    subscription: Subscription | undefined;
    goldLabel: Phaser.GameObjects.Text | undefined;
    goldText: Phaser.GameObjects.Text | undefined;

    constructor(
        scene: Phaser.Scene,
        showGold: boolean,
        api: DeployedGame2API,
        initialState?: Game2DerivedState
    ) {
        super(scene, 0, 0);

        this.api = api;

        if (showGold) {
            this.goldLabel = scene.add.text(96, TOP_BAR_OFFSET, 'Gold: ', fontStyle(12, { align: 'left' }))
                .setOrigin(0.5, 0.65)
                .setVisible(false);
            this.goldText = scene.add.text(192, TOP_BAR_OFFSET, '', fontStyle(12, { color: Color.Yellow, align: 'right' }))
                .setOrigin(0.5, 0.65)
                .setVisible(false);
            if (initialState != undefined) {
                this.onStateChange(initialState);
            }
            this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        }
    }

    /// Enable the back button for the top bar
    public back(onBack: () => void, backDescription?: string): TopBar {
        new Button(this.scene, TOP_BAR_OFFSET, TOP_BAR_OFFSET, TOP_BAR_WIDTH, TOP_BAR_WIDTH, '<', 12, onBack, backDescription ?? 'Back');
        return this;
    }

    private onStateChange(state: Game2DerivedState) {
        if (state.player != undefined) {
            this.goldLabel?.setVisible(true);
            this.goldText?.setVisible(true);
            this.goldText?.setText(state.player.gold.toString());
        }
    }
}