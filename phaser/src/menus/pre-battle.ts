/**
 * Pre-Battle and Pre-Quest ability selection screen
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { PlayerLoadout, pureCircuits } from "game2-contract";
import { AbilityWidget } from "../ability";
import { Button } from "./button";
import { GAME_HEIGHT, GAME_WIDTH } from "../main";
import { TestMenu } from "./main";
import { ActiveBattle } from "./battle";
import { Subscription } from "rxjs";
import { Loader } from "./loader";
import { fontStyle } from "../main";
import Colors from "../constants/colors";

export class StartBattleMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    loadout: PlayerLoadout;
    subscription: Subscription;
    available: AbilityWidget[];
    chosen: boolean[];
    isQuest: boolean;
    loader: Loader | undefined;
    errorText: Phaser.GameObjects.Text | undefined;

    constructor(api: DeployedGame2API, isQuest: boolean, state: Game2DerivedState) {
        super('StartBattleMenu');
        this.api = api;
        this.loadout = {
            abilities: [],
        };
        this.available = [];
        this.chosen = [];
        this.isQuest = isQuest;
        this.state = state;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    onStateChange(state: Game2DerivedState) {
        // this.state = state;
        this.events.emit('stateChange', state);
    }

    create() {
        this.errorText = this.add.text(82, 10, '', fontStyle(12, { color: Colors.Red }));

        let abilities = [];
        console.log(`player abilities: ${this.state.playerAbilities.entries().map((a, c) => `${c} x ${a}`).toArray().join(', ')}`);
        for (const [id, count] of this.state.playerAbilities) {
            for (let i = 0; i < count; ++i) {
                abilities.push(id);
            }
        }

        const abilityButtonWidth = 96;
        abilities = abilities.sort((a, b) => Number(pureCircuits.ability_score(this.state.allAbilities.get(b)!) - pureCircuits.ability_score(this.state.allAbilities.get(a)!)));
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            const abilityWidget = new AbilityWidget(this, 32 + i * abilityButtonWidth, GAME_HEIGHT * 0.75, this.state.allAbilities.get(ability)!);
            this.available.push(abilityWidget);
            this.chosen.push(false);
            const button = new Button(this, 32 + i * abilityButtonWidth, GAME_HEIGHT * 0.75 - 105, abilityButtonWidth, 48, '^', 10, () => {
                if (this.chosen[i]) {
                    abilityWidget.y += 48 + 160;
                    button.text.text = '^';
                } else {
                    abilityWidget.y -= 48 + 160;
                    button.text.text = 'v';
                }
                this.chosen[i] = !this.chosen[i];
            });
        }
        new Button(this, GAME_WIDTH / 2, 64, 100, 60, 'Start', 10, () => {
            this.loadout.abilities = [];
            for (let i = 0; i < this.chosen.length; ++i) {
                if (this.chosen[i]) {
                    this.loadout.abilities.push(pureCircuits.derive_ability_id(this.available[i].ability));
                }
            }
            if (this.loadout.abilities.length == 7) {
                if (this.isQuest) {
                    // TODO: control difficulty
                    this.api.start_new_quest(this.loadout, BigInt(1)).then((questId) => {
                        this.scene.remove('TestMenu');
                        this.scene.add('TestMenu', new TestMenu(this.api));
                        this.scene.start('TestMenu');
                    });
                } else {
                    // Start a new battle
                    console.log(`starting new battle...`);
                    // Launch the loader scene to display during the API call
                    this.scene.pause().launch('Loader');
                    this.loader = this.scene.get('Loader') as Loader;
                    this.loader.setText("Submitting Proof");
                    this.api.start_new_battle(this.loadout).then((battle) => {
                        if (this.loader) {
                            this.loader.setText("Waiting on chain update");
                        }
                        this.events.on('stateChange', () => {
                            this.scene.stop('Loader');
                            this.scene.remove('ActiveBattle');
                            this.scene.add('ActiveBattle', new ActiveBattle(this.api, battle, this.state));
                            this.scene.start('ActiveBattle');
                        });
                    }).catch((e) => {
                        this.errorText?.setText('Error Talking to the network. Try again...');
                        console.error(`Error starting battle: ${e}`);
                        this.scene.resume().stop('Loader');
                    });
                }
            } else {
                console.log(`finish selecting abilities (selected ${this.loadout.abilities.length}, need 7)`);
            }
        });
    }
}
