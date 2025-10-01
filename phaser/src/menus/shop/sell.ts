import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { pureCircuits } from "game2-contract";
import { Subscription } from "rxjs";
import { AbilityWidget, SpiritWidget } from "../../widgets/ability";
import { createSpiritAnimations } from "../../animations/spirit";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../../main";
import { Button } from "../../widgets/button";
import { Loader } from "../loader";
import { Color } from "../../constants/colors";
import { isStartingAbility, sortedAbilities } from "../pre-battle";
import { addScaledImage } from "../../utils/scaleImage";
import { ScrollablePanel } from "../../widgets/scrollable";
import { TopBar } from "../../widgets/top-bar";
import { addTooltip } from "../../widgets/tooltip";
import { ShopMenu } from "./shop";

// Constants
const UNSELLABLE_TOOLTIP_TEXT = "Starting spirits cannot be sold";

// Layout constants
const PANEL_WIDTH_RATIO = 0.95;
const PANEL_HEIGHT = 350;
const PANEL_Y_RATIO = 0.6;

const ABILITY_BUTTON_WIDTH = 100;
const BUTTON_FONT_SIZE = 8;
const ABILITY_WIDGET_Y = 80;
const ABILITY_CONTAINER_HEIGHT = 128;
const SELL_BUTTON_Y = -39;
const SELL_BUTTON_HEIGHT = 64;
const SPIRIT_WIDGET_Y = -120;

const TOOLTIP_WIDTH = 300;
const TOOLTIP_HEIGHT = 400;

export class SellSpiritsMenu extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    state: Game2DerivedState;
    ui: Phaser.GameObjects.GameObject[];
    loader: Loader | undefined;
    topBar: TopBar | undefined;
    errorText: Phaser.GameObjects.Text | undefined;
    waitingForSell: boolean = false;

    constructor(api: DeployedGame2API, state: Game2DerivedState) {
        super("SellSpiritsMenu");
        
        this.api = api;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.state = state;
        this.ui = [];
    }

    create() {
        this.errorText = this.add.text(82, 32, '', fontStyle(12, { color: Color.Red }));
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-grass').setDepth(-10);
        createSpiritAnimations(this);

        this.topBar = new TopBar(this, true, this.api, this.state)
            .back(() => {
                this.scene.remove('ShopMenu');
                this.scene.add('ShopMenu', new ShopMenu(this.api, this.state));
                this.scene.start('ShopMenu');
            }, 'Back to Shop');

        this.onStateChange(this.state);
    }

    shutdown() {
        this.subscription?.unsubscribe();
    }

    private onStateChange(state: Game2DerivedState) {
        logger.gameState.debug(`ShopMenu.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);
        if (this.waitingForSell) {
            this.waitingForSell = false;
            if (this.loader != undefined) {
                this.scene.resume().stop('Loader');
                this.loader = undefined;
            }
        }

        this.ui.forEach((o) => o.destroy());
        this.ui = [];

        const scrollablePanel = new ScrollablePanel(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * PANEL_Y_RATIO,
            GAME_WIDTH * PANEL_WIDTH_RATIO,
            PANEL_HEIGHT
        );
        this.ui.push(scrollablePanel.panel);

        const abilities = sortedAbilities(state);
        for (const ability of abilities) {
            const value = Number(pureCircuits.ability_value(ability));
            const isStarting = isStartingAbility(ability);

            const abilityWidget = new AbilityWidget(this, 0, ABILITY_WIDGET_Y, ability);
            const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, ABILITY_CONTAINER_HEIGHT);
            abilityContainer.add(abilityWidget);

            const sellButton = new Button(
                this,
                0,
                SELL_BUTTON_Y,
                ABILITY_BUTTON_WIDTH - 8,
                SELL_BUTTON_HEIGHT,
                `Sell\n$${value}`,
                BUTTON_FONT_SIZE,
                () => {
                    if (!isStarting) {
                        this.handleSellAbility(ability);
                    }
                }
            );

            const spiritWidget = new SpiritWidget(this, 0, SPIRIT_WIDGET_Y, ability);

            if (isStarting) {
                sellButton.setEnabled(false);
                abilityWidget.setAlpha(0.5);
                spiritWidget.setAlpha(0.5);

                addTooltip(this, abilityWidget, UNSELLABLE_TOOLTIP_TEXT, TOOLTIP_WIDTH, TOOLTIP_HEIGHT);
                addTooltip(this, sellButton, UNSELLABLE_TOOLTIP_TEXT, TOOLTIP_WIDTH, TOOLTIP_HEIGHT);
                addTooltip(this, spiritWidget, UNSELLABLE_TOOLTIP_TEXT, TOOLTIP_WIDTH, TOOLTIP_HEIGHT);
            }

            abilityContainer.add(sellButton);
            abilityContainer.add(spiritWidget);
            this.ui.push(abilityContainer);

            scrollablePanel.addChild(abilityContainer);
        }
    }

    private handleSellAbility(ability: any) {
        this.scene.pause().launch('Loader');
        this.loader = this.scene.get('Loader') as Loader;
        this.loader.setText("Submitting Proof");
        this.waitingForSell = true;
        this.api.sell_ability(ability).then(() => {
            this.loader?.setText("Waiting on chain update");
        }).catch((e) => {
            this.waitingForSell = false;
            this.errorText?.setText('Error Talking to the network. Try again...');
            logger.network.error(`Error selling ability: ${e}`);
            this.scene.resume().stop('Loader');
        });
    }
}