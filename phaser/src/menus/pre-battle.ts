/**
 * Pre-Battle and Pre-Quest ability selection screen
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Ability, PlayerLoadout, pureCircuits } from "game2-contract";
import { AbilityWidget, SpiritWidget } from "../widgets/ability";
import { Button } from "../widgets/button";
import { GAME_HEIGHT, GAME_WIDTH } from "../main";
import { TestMenu } from "./main";
import { ActiveBattle } from "./battle";
import { Subscription } from "rxjs";
import { Loader } from "./loader";
import { fontStyle } from "../main";
import { Color, colorToNumber } from "../constants/colors";
import { ScrollablePanel } from "../widgets/scrollable";

const MAX_ABILITIES = 7; // Maximum number of abilities a player can select for a battle

export class StartBattleMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    loadout: PlayerLoadout;
    subscription: Subscription;
    available: AbilityWidget[];
    startButton: Button | undefined;
    abilitySlots: Phaser.GameObjects.GameObject[];
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
        this.isQuest = isQuest;
        this.state = state;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    onStateChange(state: Game2DerivedState) {
        // this.state = state;
        this.events.emit('stateChange', state);
    }

    create() {
        const activeAbilityPanel = new ScrollablePanel(this, GAME_WIDTH/2, GAME_HEIGHT * 0.35, GAME_WIDTH*0.95, 150, false);
        const inactiveAbilityPanel = new ScrollablePanel(this, GAME_WIDTH/2, GAME_HEIGHT * 0.685, GAME_WIDTH*0.95, 150);
        const onMovedChild = (panel: ScrollablePanel, child: Phaser.GameObjects.GameObject) => {
            // Determine which abilities are selected
            const activeAbilities = activeAbilityPanel.getChildren();
            this.loadout.abilities = activeAbilities.map((c) => 
                pureCircuits.derive_ability_id(((c as Phaser.GameObjects.Container).list[0] as AbilityWidget).ability)
            );

            // Enable the start button if we have enough abilities selected
            this.startButton?.setEnabled(this.loadout.abilities.length == MAX_ABILITIES);
        }
        activeAbilityPanel.enableDraggable({
            onMovedChild,
            maxElements: MAX_ABILITIES
        });
        inactiveAbilityPanel.enableDraggable({onMovedChild});

        this.errorText = this.add.text(82, GAME_HEIGHT - 96, '', fontStyle(12, { color: Color.Red }));

        const abilities = sortedAbilities(this.state);
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];

            const abilityWidget = new AbilityWidget(this, 0, 60, ability);
            const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, 248);
            abilityContainer.add(abilityWidget);
            abilityContainer.add(new SpiritWidget(this, 0, -60, ability));

            // Add new child to scrollable panel
            inactiveAbilityPanel.addChild(abilityContainer);

            this.available.push(abilityWidget);
        }

        // Add placeholder slots for active abilities
        this.abilitySlots = [];
        for (let i = 0; i < MAX_ABILITIES; ++i) {
            const slot = this.rexUI.add.roundRectangle(61 + (i * 0.98 * GAME_WIDTH/MAX_ABILITIES), GAME_HEIGHT * 0.47, 71, 125, 20, colorToNumber(Color.Purple));
            this.add.existing(slot);
            this.abilitySlots.push(slot);
        }

        // Set up drag-over animations for ability slots
        this.setupSlotDragAnimations([activeAbilityPanel, inactiveAbilityPanel]);

        this.startButton = new Button(this, GAME_WIDTH / 2, 24, 100, 40, 'Start', 10, () => {
            if (this.loadout.abilities.length == MAX_ABILITIES) {
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
        }).setEnabled(false);
    }

    private setupSlotDragAnimations(panels: ScrollablePanel[]) {
        // Hook into the existing child event system that ScrollablePanel uses
        panels.forEach(panel => {
            const panelUI = (panel as any).panel; // Get the Rex UI panel
            
            // Hook into the existing child.down event to add our drag listeners
            panelUI.on('child.down', (child: any) => {
                console.log('Child down detected, setting up drag listeners');
                // Add a small delay to ensure the drag behavior has been added
                this.time.delayedCall(10, () => {
                    if (child.drag) {
                        console.log('Adding drag listeners to child');
                        // Remove any existing listeners to avoid duplicates
                        child.off('drag', this.onChildDrag);
                        child.off('dragend', this.onChildDragEnd);
                        
                        // Add our listeners
                        child.on('drag', this.onChildDrag, this);
                        child.on('dragend', this.onChildDragEnd, this);
                    } else {
                        console.log('Child does not have drag behavior yet');
                    }
                });
            });
        });
    }

    private onChildDrag = (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        console.log('Drag detected at:', dragX, dragY);
        this.checkSlotDragOver(dragX, dragY);
    }

    private onChildDragEnd = () => {
        console.log('Drag ended');
        this.resetAllSlots();
    }

    private checkSlotDragOver(dragX: number, dragY: number) {
        this.abilitySlots.forEach((slot, index) => {
            const bounds = (slot as any).getBounds();
            const isOver = Phaser.Geom.Rectangle.Contains(bounds, dragX, dragY);
            
            if (isOver && !(slot as any).getData('isHovered')) {
                console.log(`Slot ${index} - hovering started`);
                this.animateSlotEnlarge(slot);
                (slot as any).setData('isHovered', true);
            } else if (!isOver && (slot as any).getData('isHovered')) {
                console.log(`Slot ${index} - hovering ended`);
                this.animateSlotShrink(slot);
                (slot as any).setData('isHovered', false);
            }
        });
    }

    private animateSlotEnlarge(slot: Phaser.GameObjects.GameObject) {
        this.tweens.add({
            targets: slot,
            scaleX: 1.2,
            scaleY: 1.2,
            alpha: 0.8,
            duration: 200,
            ease: 'Power2'
        });
    }

    private animateSlotShrink(slot: Phaser.GameObjects.GameObject) {
        this.tweens.add({
            targets: slot,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: 200,
            ease: 'Power2'
        });
    }

    private resetAllSlots() {
        this.abilitySlots.forEach(slot => {
            if ((slot as any).getData('isHovered')) {
                this.animateSlotShrink(slot);
                (slot as any).setData('isHovered', false);
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
