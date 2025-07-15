import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { pureCircuits } from "game2-contract";
import { Subscription } from "rxjs";
import { AbilityWidget, createSpiritAnimations, SpiritWidget } from "../widgets/ability";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH } from "../main";
import { Button } from "../widgets/button";
import { Loader } from "./loader";
import { Color } from "../constants/colors";
import { isStartingAbility, sortedAbilities } from "./pre-battle";
import { TestMenu } from "./main";
import { addScaledImage } from "../utils/scaleImage";
import { createScrollablePanel } from "../widgets/scrollable";

export class ShopMenu extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    state: Game2DerivedState;
    ui: Phaser.GameObjects.GameObject[];
    loader: Loader | undefined;
    goldText: Phaser.GameObjects.Text | undefined;
    errorText: Phaser.GameObjects.Text | undefined;

    constructor(api: DeployedGame2API, state: Game2DerivedState) {
        super("ShopMenu");
        
        this.api = api;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.state = state;
        this.ui = [];
    }

    create() {
        this.add.text(32, 8, 'Gold: ', fontStyle(12));
        this.goldText = this.add.text(100, 8, '', fontStyle(12, { color: Color.Yellow }));
        this.errorText = this.add.text(82, 32, '', fontStyle(12, { color: Color.Red }));
        // this is just here to show some contrast since we won't have a black background. TOOD: replace with a specific background
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'grass').setDepth(-10);
        createSpiritAnimations(this);

        this.onStateChange(this.state);
    }

    private onStateChange(state: Game2DerivedState) {
        console.log(`ShopMenu.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);
        if (this.loader != undefined) {
            this.scene.resume().stop('Loader');
            this.loader = undefined;
        }

        this.ui.forEach((o) => o.destroy());
        this.ui = [];

        const scrollablePanel = createScrollablePanel(this, GAME_WIDTH/2.0, GAME_HEIGHT/2.0 - 25, GAME_WIDTH*0.95, 500);
        const scrollablePanelElement = scrollablePanel.getElement('panel') as Phaser.GameObjects.Container;
        this.ui.push(scrollablePanel);

        const abilityButtonWidth = 100;
        const abilities = sortedAbilities(state).filter((a) => !isStartingAbility(a));
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            const value = Number(pureCircuits.ability_value(ability));

            const abilityWidget = new AbilityWidget(this, 0, 70, ability);
            const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, 128);
            abilityContainer.add(abilityWidget);
            abilityContainer.add(new Button(this, 0, -35, abilityButtonWidth - 8, 64, `Sell\n$${value}`, 8, () => {
                this.scene.pause().launch('Loader');
                this.loader = this.scene.get('Loader') as Loader;
                this.loader.setText("Submitting Proof");
                this.api.sell_ability(ability).then(() => {
                    this.loader?.setText("Waiting on chain update");
                }).catch((e) => {
                    this.errorText?.setText('Error Talking to the network. Try again...');
                    console.error(`Error selling ability: ${e}`);
                    this.scene.resume().stop('Loader');
                });
            }));
            abilityContainer.add(new SpiritWidget(this, 0, -120, ability));
            this.ui.push(abilityContainer);

            // Add new child to scrollable panel
            scrollablePanelElement.add(abilityContainer);
        }
        // Update scrollable panel layout after adding all children
        scrollablePanel.layout()

        this.goldText?.setText(`${state.player!.gold}`);
        this.ui.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 256, 64, 'Back', 14, () => {
            // TODO: this does NOT address https://github.com/PaimaStudios/midnight-game-2/issues/45
            //this.tweens.killAll();
            this.scene.remove('TestMenu');
            this.scene.add('TestMenu', new TestMenu(this.api, state));
            this.scene.start('TestMenu');
        }));
    }
}