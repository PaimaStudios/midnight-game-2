/**
 * Pre-Battle and Pre-Quest ability selection screen
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Ability, PlayerLoadout, pureCircuits } from "game2-contract";
import { AbilityWidget } from "../widgets/ability";
import { Button } from "../widgets/button";
import { GAME_HEIGHT, GAME_WIDTH } from "../main";
import { TestMenu } from "./main";
import { ActiveBattle } from "./battle";
import { Subscription } from "rxjs";
import { Loader } from "./loader";
import { fontStyle } from "../main";
import { Color } from "../constants/colors";
import { createScrollablePanel, setDraggable } from "../widgets/scrollable";

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
        const activeAbilityPanel = createScrollablePanel(this, GAME_WIDTH/2, GAME_HEIGHT * 0.1, GAME_WIDTH*0.95, 500);
        setDraggable(activeAbilityPanel);
        const activeAbilityPanelElement = activeAbilityPanel.getElement('panel') as Phaser.GameObjects.Container;
        const inactiveAbilityPanel = createScrollablePanel(this, GAME_WIDTH/2, GAME_HEIGHT * 0.45, GAME_WIDTH*0.95, 500);
        setDraggable(inactiveAbilityPanel);
        const inactiveAbilityPanelElement = inactiveAbilityPanel.getElement('panel') as Phaser.GameObjects.Container;

        this.errorText = this.add.text(82, GAME_HEIGHT - 96, '', fontStyle(12, { color: Color.Red }));

        const abilities = sortedAbilities(this.state);
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];

            const abilityContainer = this.add.container(0, 0).setSize(84, 128);
            const abilityWidget = new AbilityWidget(this, 0, 70, ability);

            // Add new child to scrollable panel
            abilityContainer.add(abilityWidget);
            inactiveAbilityPanelElement.add(
                this.rexUI.add.fixWidthSizer({
                    space: { item: 0, line: 0 }
                }).add(abilityContainer)
            );

            // Refresh the layout after adding children
            inactiveAbilityPanel.layout()

            this.available.push(abilityWidget);
            this.chosen.push(false);

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

// TODO: is this a performance issue?
export const isStartingAbility = (ability: Ability) => {
    const id = pureCircuits.derive_ability_id(ability);
    const phys_id = pureCircuits.derive_ability_id(pureCircuits.ability_base_phys());
    const block_id = pureCircuits.derive_ability_id(pureCircuits.ability_base_block());
    return id == phys_id || id == block_id;
};

export function sortedAbilitiesById(state: Game2DerivedState): bigint[] {
    let abilities = [];
    console.log(`player abilities: ${state.playerAbilities.entries().map((a, c) => `${c} x ${a}`).toArray().join(', ')}`);
    for (const [id, count] of state.playerAbilities) {
        for (let i = 0; i < count; ++i) {
            abilities.push(id);
        }
    }
    return abilities.sort((a, b) => Number(pureCircuits.ability_score(state.allAbilities.get(b)!) - pureCircuits.ability_score(state.allAbilities.get(a)!)));
}

export function sortedAbilities(state: Game2DerivedState): Ability[] {
    return sortedAbilitiesById(state).map((id) => state.allAbilities.get(id)!);
}
