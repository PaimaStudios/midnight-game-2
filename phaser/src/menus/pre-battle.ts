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
import { Loader } from "./loader";

export class StartBattleMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    loadout: PlayerLoadout;
    available: AbilityWidget[];
    chosen: boolean[];
    isQuest: boolean;

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
    }

    create() {
        let abilities = [];
        console.log(`player abilities: ${this.state.playerAbilities.entries().map((a, c) => `${c} x ${a}`).toArray().join(', ')}`);
        for (const [id, count] of this.state.playerAbilities) {
            for (let i = 0; i < count; ++i) {
                abilities.push(id);
            }
        }
        abilities = abilities.sort((a, b) => Number(pureCircuits.ability_score(this.state.allAbilities.get(b)!) - pureCircuits.ability_score(this.state.allAbilities.get(a)!)));
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            const abilityWidget = new AbilityWidget(this, 32 + i * 48, GAME_HEIGHT * 0.75, this.state.allAbilities.get(ability)!);
            this.available.push(abilityWidget);
            this.chosen.push(false);
            const button = new Button(this, 32 + i * 48, GAME_HEIGHT * 0.75 - 64, 48, 24, '^', 10, () => {
                if (this.chosen[i]) {
                    abilityWidget.y += 48 + 80;
                    button.text.text = '^';
                } else {
                    abilityWidget.y -= 48 + 80;
                    button.text.text = 'v';
                }
                this.chosen[i] = !this.chosen[i];
            });
        }
        new Button(this, GAME_WIDTH / 2, 64, 64, 24, 'Start', 10, async () => {
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
                    const loader = this.scene.get('Loader') as Loader;
                    loader.setText("Submitting Proof");
                    await this.api.start_new_battle(this.loadout).then((battle) => {
                        this.scene.stop('Loader');
                        this.scene.remove('ActiveBattle');
                        this.scene.add('ActiveBattle', new ActiveBattle(this.api, battle));
                        this.scene.start('ActiveBattle');
                    });
                }
            } else {
                console.log(`finish selecting abilities (selected ${this.loadout.abilities.length}, need 7)`);
            }
        });
    }
}
