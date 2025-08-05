/**
 * Pre-Battle and Pre-Quest ability selection screen
 */
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
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
import { addScaledImage } from "../utils/scaleImage";
import { tweenDownAlpha, tweenUpAlpha } from "../utils/tweens";
import { table } from "console";
import { BIOME_ID, biomeToBackground } from "../battle/biome";

const MAX_ABILITIES = 7; // Maximum number of abilities a player can select for a battle

/// gets the inner Ability from an element of the ability panels
function getAbility(widget: Phaser.GameObjects.GameObject): Ability {
    return ((widget as Phaser.GameObjects.Container).list[0] as AbilityWidget).ability;
}

export class StartBattleMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    loadout: PlayerLoadout;
    subscription: Subscription;
    available: AbilityWidget[];
    startButton: Button | undefined;
    abilitySlots: Phaser.GameObjects.GameObject[];
    isQuest: boolean;
    biome: BIOME_ID;
    loader: Loader | undefined;
    errorText: Phaser.GameObjects.Text | undefined;
    spiritPreviews: (SpiritWidget | null)[];
    summoningTablets: Phaser.GameObjects.Image[];
    activeAbilityPanel: ScrollablePanel | undefined;
    inactiveAbilityPanel: ScrollablePanel | undefined;

    constructor(api: DeployedGame2API, biome: BIOME_ID, isQuest: boolean, state: Game2DerivedState) {
        super('StartBattleMenu');
        this.api = api;
        this.loadout = {
            abilities: [],
        };
        this.available = [];
        this.abilitySlots = [];
        this.summoningTablets = [];
        this.spiritPreviews = new Array(MAX_ABILITIES).map((_) => null);
        this.isQuest = isQuest;
        this.biome = biome;
        this.state = state;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    onStateChange(state: Game2DerivedState) {
        // this.state = state;
        this.events.emit('stateChange', state);
    }

    create() {
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, biomeToBackground(this.biome)).setDepth(-10);

        this.activeAbilityPanel = new ScrollablePanel(this, GAME_WIDTH/2, GAME_HEIGHT * 0.46, GAME_WIDTH*0.96, 128, false);
        this.inactiveAbilityPanel = new ScrollablePanel(this, GAME_WIDTH/2, GAME_HEIGHT * 0.805, GAME_WIDTH*0.96, 128);
        const onMovedChild = (panel: ScrollablePanel, child: Phaser.GameObjects.GameObject) => {
            // Determine which abilities are selected
            const activeAbilities = this.getOrderedActiveAbilities();
            this.loadout.abilities = activeAbilities.map((a) => pureCircuits.derive_ability_id(a.ability));

            this.refreshPreviews();

            // Enable the start button if we have enough abilities selected
            this.startButton?.setEnabled(this.loadout.abilities.length == MAX_ABILITIES);
        }
        this.activeAbilityPanel.enableDraggable({
            onMovedChild,
            onDragEnd: () => {
                this.resetAllSlots();
                this.refreshPreviews();
            },
            maxElements: MAX_ABILITIES
        });
        this.inactiveAbilityPanel.enableDraggable({
            onMovedChild,
            onDragEnd: () => {
                this.resetAllSlots()
            },
        });

        this.errorText = this.add.text(82, GAME_HEIGHT - 96, '', fontStyle(12, { color: Color.Red }));

        const abilities = sortedAbilities(this.state);
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];

            const abilityWidget = new AbilityWidget(this, 0, 2, ability);
            const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, abilityWidget.height);
            abilityContainer.add(abilityWidget);

            // Add new child to scrollable panel
            this.inactiveAbilityPanel.addChild(abilityContainer);

            this.available.push(abilityWidget);
        }

        // Add placeholder slots for active abilities
        this.abilitySlots = [];
        for (let i = 0; i < MAX_ABILITIES; ++i) {
            const x = 61 + (i * 0.98 * GAME_WIDTH/MAX_ABILITIES);
            const y = GAME_HEIGHT * 0.47;
            this.summoningTablets.push(addScaledImage(this, x, y - 116, 'tablet-round').setDepth(1));
            const slot = this.rexUI.add.roundRectangle(x, y, 71, 125, 20, colorToNumber(Color.Purple));
            this.add.existing(slot);
            this.abilitySlots.push(slot);
        }

        // Set up drag-over animations for ability slots
        this.activeAbilityPanel.addDragTargets(this.abilitySlots, {
            onDragOver: (slot) => this.animateSlotEnlarge(slot),
            onDragOut: (slot) => this.animateSlotShrink(slot)
        });
        
        this.inactiveAbilityPanel.addDragTargets(this.abilitySlots, {
            onDragOver: (slot) => this.animateSlotEnlarge(slot),
            onDragOut: (slot) => this.animateSlotShrink(slot)
        });

        const topButtonY = 24;
        const buttonWidth = 128;
        const buttonHeight = 40;
        const buttonFontSize = 10;
        const LAST_LOADOUT_KEY = 'last-loadout';
        // TODO: allow multiple configs in the future
        const SAVED_CONFIG_KEY = 'saved-loadout';
        new Button(this, GAME_WIDTH * (2.5 / 24), topButtonY, buttonWidth, buttonHeight, 'Use Last', buttonFontSize, () => {
            this.loadCurrentLoadout(LAST_LOADOUT_KEY);
        });
        new Button(this, GAME_WIDTH * (7.25 / 24), topButtonY, buttonWidth, buttonHeight, 'Clear', buttonFontSize, () => {
            this.clearSelectedAbilities();
        });

        this.startButton = new Button(this, GAME_WIDTH * (12 / 24), topButtonY, buttonWidth, buttonHeight, 'Start', buttonFontSize, () => {
            if (this.loadout.abilities.length == MAX_ABILITIES) {
                this.saveCurrentLoadout(LAST_LOADOUT_KEY);
                if (this.isQuest) {
                    // TODO: control difficulty
                    this.api.start_new_quest(this.loadout, BigInt(this.biome), BigInt(1)).then((questId) => {
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
                    this.api.start_new_battle(this.loadout, BigInt(this.biome)).then((battle) => {
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

        new Button(this, GAME_WIDTH * (16.75 / 24), topButtonY, buttonWidth, buttonHeight, 'Load', buttonFontSize, () => {
            this.loadCurrentLoadout(SAVED_CONFIG_KEY);
        });
        new Button(this, GAME_WIDTH * (21.5 / 24), topButtonY, buttonWidth, buttonHeight, 'Save', buttonFontSize, () => {
            this.saveCurrentLoadout(SAVED_CONFIG_KEY);
        });
    }

    private clearSelectedAbilities() {
        this.activeAbilityPanel?.getChildren().forEach((c) => {
            this.activeAbilityPanel?.moveChildTo(c, this.inactiveAbilityPanel!);
        });
    }

    private loadCurrentLoadout(key: string) {
        const raw = localStorage.getItem(key);
        if (raw != null) {
            this.clearSelectedAbilities();
            const ids: bigint[] = raw.split(',').map((s) => BigInt(s));
            const children = ids
                .map((id) => this.inactiveAbilityPanel?.getChildren().find((c) => pureCircuits.derive_ability_id(getAbility(c)) == id))
                .filter((c) => c != undefined);
            console.log(`Loaded ${children.length} / ${ids.length} abilities from '${key}'`);
            children.forEach((c) => this.inactiveAbilityPanel?.moveChildTo(c, this.activeAbilityPanel!));
        }
    }

    private saveCurrentLoadout(key: string) {
        const ids = this
                .activeAbilityPanel!
                .getChildren()
                .map((c) => pureCircuits.derive_ability_id(getAbility(c)));
                console.log(`Saved ${ids.length} abilities to '${key}'`);
        localStorage.setItem(key, ids.join(','));
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
            // Always shrink and reset hover state, regardless of current hover state
            this.animateSlotShrink(slot);
            (slot as any).setData('isHovered', false);
        });
    }

    private refreshPreviews() {
        const activeAbilities = this.getOrderedActiveAbilities();
        for (let i = 0; i < MAX_ABILITIES; ++i) {
            const newAbility = activeAbilities.at(i)?.ability;
            if (this.spiritPreviews[i]?.ability != newAbility) {
                let tweens = [];
                // destroy old
                const oldPreview = this.spiritPreviews[i];
                if (oldPreview != null) {
                    tweens.push({
                        ...tweenDownAlpha(oldPreview),
                        onComplete: () => {
                            oldPreview.destroy();
                        },
                    });
                }
                // create new
                if (newAbility != undefined) {
                    const tablet = this.summoningTablets[i];
                    const newPreview = new SpiritWidget(this, tablet.x, tablet.y - 24, newAbility)
                                .setDepth(2)
                                .setAlpha(0);
                    this.spiritPreviews[i] = newPreview;
                    tweens.push({
                        ...tweenUpAlpha(newPreview),
                    });
                } else {
                    // Clear reference if no new ability
                    this.spiritPreviews[i] = null;
                }
                if (tweens.length > 0) {
                    this.tweens.chain({
                        targets: this, // this doesn't seem to do anything (always overridden?) but if you pass null it errors
                        tweens,
                    });
                }
            }
        }
    }

    private getOrderedActiveAbilities(): AbilityWidget[] {
        return this
            .activeAbilityPanel!
            .getChildren()
            .map((widget) => (widget as Phaser.GameObjects.Container))
            .map(((container) => container.list[0] as AbilityWidget));
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
