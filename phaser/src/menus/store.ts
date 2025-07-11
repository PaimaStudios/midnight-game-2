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

export class Store extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    state: Game2DerivedState;
    ui: Phaser.GameObjects.GameObject[];
    loader: Loader | undefined;
    goldText: Phaser.GameObjects.Text | undefined;
    errorText: Phaser.GameObjects.Text | undefined;
    

    constructor(api: DeployedGame2API, state: Game2DerivedState) {
        super("Store");
        
        this.api = api;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.state = state;
        this.ui = [];
    }

    create() {
        this.goldText = this.add.text(32, GAME_HEIGHT - 64, '', fontStyle(12));
        this.errorText = this.add.text(82, GAME_HEIGHT - 96, '', fontStyle(12, { color: Color.Red }));
        // this is just here to show some contrast since we won't have a black background. TOOD: replace with a specific background
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'grass').setDepth(-10);
        createSpiritAnimations(this);

        this.onStateChange(this.state);
    }

    private onStateChange(state: Game2DerivedState) {
        console.log(`Store.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);
        if (this.loader != undefined) {
            this.scene.resume().stop('Loader');
            this.loader = undefined;
        }

        this.ui.forEach((o) => o.destroy());
        this.ui = [];
        const abilityButtonWidth = 100;
        const abilities = sortedAbilities(state).filter((a) => !isStartingAbility(a));
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            const value = Number(pureCircuits.ability_value(ability));

            this.ui.push(new SpiritWidget(this, 32 + i * abilityButtonWidth, GAME_HEIGHT * 0.3, ability));
            this.ui.push(new AbilityWidget(this,  32 + i * abilityButtonWidth, GAME_HEIGHT * 0.75, ability));
            this.ui.push(new Button(this, 32 + i * abilityButtonWidth, GAME_HEIGHT * 0.75 - 128, abilityButtonWidth - 8, 64, `Sell\n$${value}`, 8, () => {
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
        }
        this.goldText?.setText(`Gold: ${state.player!.gold}`);
        this.ui.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 256, 64, 'Back', 14, () => {
            // TODO: this does NOT address https://github.com/PaimaStudios/midnight-game-2/issues/45
            //this.tweens.killAll();
            this.scene.remove('TestMenu');
            this.scene.add('TestMenu', new TestMenu(this.api, state));
            this.scene.start('TestMenu');
        }));
    }
}