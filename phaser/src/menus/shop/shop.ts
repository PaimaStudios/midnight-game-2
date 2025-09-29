import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Subscription } from "rxjs";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../../main";
import { Button } from "../../widgets/button";
import { Color } from "../../constants/colors";
import { TestMenu } from "../main";
import { addScaledImage } from "../../utils/scaleImage";
import { TopBar } from "../../widgets/top-bar";
import { SellSpiritsMenu } from "./sell";
import { UpgradeSpiritsMenu } from "./upgrade";

export class ShopMenu extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    state: Game2DerivedState;
    topBar: TopBar | undefined;

    constructor(api: DeployedGame2API, state: Game2DerivedState) {
        super("ShopMenu");

        this.api = api;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.state = state;
    }

    create() {
        // Background
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-grass').setDepth(-10);

        // Top bar with back navigation
        this.topBar = new TopBar(this, true, this.api, this.state)
            .back(() => {
                this.scene.remove('TestMenu');
                this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                this.scene.start('TestMenu');
            }, 'Return to Hub');

        // Title
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.15, 'Spirit Shop',
            fontStyle(24, { color: Color.White, stroke: Color.Licorice, strokeThickness: 8 })).setOrigin(0.5);

        // Button styling
        const buttonWidth = 300;
        const buttonHeight = 80;
        const buttonSpacing = 100;
        const buttonFontSize = 16;

        // Upgrade button
        new Button(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT / 2 - buttonSpacing / 2,
            buttonWidth,
            buttonHeight,
            'Upgrade',
            buttonFontSize,
            () => {
                logger.ui.info('Navigating to Upgrade Spirits');
                this.scene.remove('UpgradeSpiritsMenu');
                this.scene.add('UpgradeSpiritsMenu', new UpgradeSpiritsMenu(this.api, this.state));
                this.scene.start('UpgradeSpiritsMenu');
            }
        );

        // Sell button
        new Button(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT / 2 + buttonSpacing / 2,
            buttonWidth,
            buttonHeight,
            'Sell',
            buttonFontSize,
            () => {
                logger.ui.info('Navigating to Sell Spirits');
                this.scene.remove('SellSpiritsMenu');
                this.scene.add('SellSpiritsMenu', new SellSpiritsMenu(this.api, this.state));
                this.scene.start('SellSpiritsMenu');
            }
        );

        this.onStateChange(this.state);
    }

    shutdown() {
        this.subscription?.unsubscribe();
    }

    private onStateChange(state: Game2DerivedState) {
        this.state = structuredClone(state);
    }
}