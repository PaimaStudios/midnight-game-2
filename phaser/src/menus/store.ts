import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { BattleConfig, pureCircuits } from "game2-contract";
import { Subscription } from "rxjs";
import { AbilityWidget } from "../ability";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH } from "../main";
import { Button } from "./button";
import { Loader } from "./loader";
import Colors from "../constants/colors";
import { sortedAbilities } from "./pre-battle";

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
        this.goldText = this.add.text(32, 32, '', fontStyle(12));
        this.errorText = this.add.text(82, 10, '', fontStyle(12, { color: Colors.Red }));

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
        let index = 0;
        const abilities = sortedAbilities(state);
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            const value = Number(pureCircuits.ability_value(ability));

            this.ui.push(new AbilityWidget(this,  32 + i * 48, GAME_HEIGHT * 0.75, ability));
            this.ui.push(new Button(this, 32 + i * 48, GAME_HEIGHT * 0.75 - 64, 48, 24, `Sell\n$${value}`, 10, () => {
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
        this.ui.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 128, 32, 'Back', 14, () => {
            this.scene.remove('Store');
            this.scene.add('Store', new Store(this.api!, state));
            this.scene.start('Store');
        }));
    }
}