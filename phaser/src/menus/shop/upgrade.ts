import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { Ability, pureCircuits } from "game2-contract";
import { Subscription } from "rxjs";
import { AbilityWidget, SpiritWidget } from "../../widgets/ability";
import { createSpiritAnimations } from "../../animations/spirit";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../../main";
import { Button } from "../../widgets/button";
import { Loader } from "../loader";
import { Color, colorToNumber } from "../../constants/colors";
import { isStartingAbility, sortedAbilities } from "../pre-battle";
import { addScaledImage } from "../../utils/scaleImage";
import { ScrollablePanel } from "../../widgets/scrollable";
import { TopBar } from "../../widgets/top-bar";
import { addTooltip } from "../../widgets/tooltip";
import { ShopMenu } from "./shop";

const UNSELLABLE_TOOLTIP_TEXT = "Starting spirits cannot be used for upgrading";
const STARTING_SPIRITS_COUNT = 8;

export class UpgradeSpiritsMenu extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    state: Game2DerivedState;
    ui: Phaser.GameObjects.GameObject[];
    loader: Loader | undefined;
    topBar: TopBar | undefined;
    errorText: Phaser.GameObjects.Text | undefined;

    upgradingSlot: Phaser.GameObjects.GameObject | undefined;
    sacrificingSlot: Phaser.GameObjects.GameObject | undefined;
    upgradingSpirit: Ability | undefined;
    sacrificingSpirit: Ability | undefined;
    upgradingSpiritContainer: Phaser.GameObjects.Container | undefined;
    sacrificingSpiritContainer: Phaser.GameObjects.Container | undefined;
    upgradeButton: Button | undefined;

    spiritPanel: ScrollablePanel | undefined;

    constructor(api: DeployedGame2API, state: Game2DerivedState) {
        super("UpgradeSpiritsMenu");

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

        // Create the two upgrade slots
        this.createUpgradeSlots();

        // Create spirits panel
        this.createSpiritsPanel();

        // Create upgrade button (initially disabled)
        this.upgradeButton = new Button(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * 0.34,
            150,
            60,
            'Upgrade',
            12,
            () => this.performUpgrade()
        ).setEnabled(false);

        this.onStateChange(this.state);
    }

    shutdown() {
        this.subscription?.unsubscribe();
    }

    private createUpgradeSlots() {
        const slotY = GAME_HEIGHT * 0.35;
        const slotWidth = 120;
        const slotHeight = 160;
        const titleOffsetY = 100;

        // Upgrading slot (left side)
        this.upgradingSlot = this.rexUI.add.roundRectangle(
            GAME_WIDTH * 0.3,
            slotY,
            slotWidth,
            slotHeight,
            20,
            colorToNumber(Color.Blue)
        );
        this.add.existing(this.upgradingSlot);

        // Make slot interactive and set as drop zone
        this.upgradingSlot.setInteractive().setData('slotType', 'upgrading');

        // Add label for upgrading slot
        this.add.text(GAME_WIDTH * 0.3, slotY - titleOffsetY, 'Upgrading Spirit',
            fontStyle(10, { color: Color.White })).setOrigin(0.5);

        // Sacrificing slot (right side)
        this.sacrificingSlot = this.rexUI.add.roundRectangle(
            GAME_WIDTH * 0.7,
            slotY,
            slotWidth,
            slotHeight,
            20,
            colorToNumber(Color.Red)
        );
        this.add.existing(this.sacrificingSlot);

        // Make slot interactive and set as drop zone
        this.sacrificingSlot.setInteractive().setData('slotType', 'sacrificing');

        // Add label for sacrificing slot
        this.add.text(GAME_WIDTH * 0.7, slotY - titleOffsetY, 'Sacrificing Spirit',
            fontStyle(10, { color: Color.White })).setOrigin(0.5);
    }

    private createSpiritsPanel() {
        this.spiritPanel = new ScrollablePanel(this, GAME_WIDTH/2.0, GAME_HEIGHT * 0.8, GAME_WIDTH*0.95, 180);
        this.ui.push(this.spiritPanel.panel);

        // Enable drag functionality for the spirits panel
        this.spiritPanel.enableDraggable({
            onMovedChild: (panel, child) => {
                // Handle when spirits are moved within the panel
            },
            onDragEnd: () => {
                // Reset any visual feedback
            }
        });

        // Add drag targets (the upgrade slots) for visual feedback
        this.spiritPanel.addDragTargets([this.upgradingSlot!, this.sacrificingSlot!], {
            onDragOver: (slot) => this.animateSlotEnlarge(slot),
            onDragOut: (slot) => this.animateSlotShrink(slot)
        });

        // Set up proper drop zones
        this.setupSlotDropZones();
    }

    private setupSlotDropZones() {
        // Enable the slots as drop zones for Phaser's drag system
        this.upgradingSlot?.setInteractive().setData('drop', true);
        this.sacrificingSlot?.setInteractive().setData('drop', true);

        // Add global drag event listener to the scene
        this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropped: boolean) => {
            logger.ui.debug(`Dragend event: dropped=${dropped}, pointer=(${pointer.x}, ${pointer.y})`);

            if (!dropped) {
                // Check if the drag ended over one of our slots
                const dragEndX = pointer.x;
                const dragEndY = pointer.y;

                // Check upgrading slot bounds
                if (this.upgradingSlot) {
                    const upgradingBounds = (this.upgradingSlot as any).getBounds();
                    logger.ui.debug(`Upgrading slot bounds:`, upgradingBounds);

                    if (Phaser.Geom.Rectangle.Contains(upgradingBounds, dragEndX, dragEndY)) {
                        logger.ui.debug('Drag ended over upgrading slot');
                        this.handleSpiritDropOnSlot('upgrading', gameObject);
                        this.animateSlotShrink(this.upgradingSlot);
                        return;
                    }
                }

                // Check sacrificing slot bounds
                if (this.sacrificingSlot) {
                    const sacrificingBounds = (this.sacrificingSlot as any).getBounds();
                    logger.ui.debug(`Sacrificing slot bounds:`, sacrificingBounds);

                    if (Phaser.Geom.Rectangle.Contains(sacrificingBounds, dragEndX, dragEndY)) {
                        logger.ui.debug('Drag ended over sacrificing slot');
                        this.handleSpiritDropOnSlot('sacrificing', gameObject);
                        this.animateSlotShrink(this.sacrificingSlot);
                        return;
                    }
                }

                logger.ui.debug('Drag ended outside of slots');
            } else {
                logger.ui.debug('Spirit was dropped on a drop zone (not our slots)');
            }
        });
    }

    private handleSpiritDropOnSlot(slotType: 'upgrading' | 'sacrificing', draggedObject: any) {
        logger.ui.info(`Spirit dropped on ${slotType} slot`);
        logger.ui.debug('Dropped object type:', draggedObject.constructor.name);

        // The dragged object is a FixWidthSizer wrapper, we need to unwrap it
        let spiritContainer: Phaser.GameObjects.Container;

        if (draggedObject.type === 'rexFixWidthSizer') {
            // Extract the actual container from the FixWidthSizer
            const children = draggedObject.getAll();
            if (children.length > 0) {
                spiritContainer = children[0] as Phaser.GameObjects.Container;
                logger.ui.debug('Unwrapped container type:', spiritContainer.constructor.name);
            } else {
                logger.ui.error('FixWidthSizer has no children');
                return;
            }
        } else if (draggedObject instanceof Phaser.GameObjects.Container) {
            spiritContainer = draggedObject;
        } else {
            logger.ui.error('Unknown dragged object type:', draggedObject);
            return;
        }

        if (!spiritContainer) {
            logger.ui.error('Could not extract spirit container');
            return;
        }

        let ability: Ability;
        try {
            ability = this.getAbilityFromContainer(spiritContainer);
        } catch (error) {
            logger.ui.error('Failed to extract ability from container:', error);
            return;
        }

        if (isStartingAbility(ability)) {
            logger.ui.warn('Cannot use starting abilities for upgrading');
            return;
        }

        // If the slot is already occupied, return the existing spirit to the panel first
        if (slotType === 'upgrading' && this.upgradingSpirit) {
            logger.ui.info('Upgrading slot is occupied, replacing existing spirit');
            this.returnSpiritToPanel(this.upgradingSpirit);
            this.removeFromUpgradingSlot();
        }

        if (slotType === 'sacrificing' && this.sacrificingSpirit) {
            logger.ui.info('Sacrificing slot is occupied, replacing existing spirit');
            this.returnSpiritToPanel(this.sacrificingSpirit);
            this.removeFromSacrificingSlot();
        }

        // Check if this exact spirit instance is already in the other slot
        if (slotType === 'upgrading' && this.sacrificingSpiritContainer === spiritContainer) {
            logger.ui.warn('Cannot use the same spirit instance for both slots');
            return;
        }

        if (slotType === 'sacrificing' && this.upgradingSpiritContainer === spiritContainer) {
            logger.ui.warn('Cannot use the same spirit instance for both slots');
            return;
        }

        // Remove the spirit from the scrollable panel
        this.removeFromScrollablePanel(spiritContainer);

        // Place the spirit in the appropriate slot
        if (slotType === 'upgrading') {
            this.placeSpiritInUpgradingSlot(spiritContainer, ability);
        } else {
            this.placeSpiritInSacrificingSlot(spiritContainer, ability);
        }
    }

    private removeFromScrollablePanel(spiritContainer: Phaser.GameObjects.Container) {
        if (!this.spiritPanel || !this.spiritPanel.hasChild(spiritContainer)) {
            return;
        }

        // Remove from the scrollable panel sizer
        const sizer = this.spiritPanel.getPanelElement();
        const items = (sizer as any).getElement?.('items');

        if (items && Array.isArray(items)) {
            const wrappedChildIndex = items.findIndex((item: any) => {
                const children = item.getAll();
                return children.length > 0 && children[0] === spiritContainer;
            });

            if (wrappedChildIndex !== -1) {
                const wrappedChild = items[wrappedChildIndex];
                (sizer as any).remove(wrappedChild);
                this.spiritPanel.panel.layout();
                spiritContainer.destroy();
            }
        }
    }

    private onStateChange(state: Game2DerivedState) {
        logger.gameState.debug(`UpgradeSpiritsMenu.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);

        // Clear existing spirits from panel
        const existingChildren = this.spiritPanel?.getChildren() || [];
        existingChildren.forEach(child => {
            child.destroy();
        });

        // Clear the panel by removing all children from the sizer
        if (this.spiritPanel) {
            const sizer = this.spiritPanel.getPanelElement();
            const items = (sizer as any).getElement?.('items');
            if (items && Array.isArray(items)) {
                items.forEach((item: any) => {
                    (sizer as any).remove(item);
                });
            }
            this.spiritPanel.panel.layout();
        }

        const abilities = this.sortedAbilitiesWithStartingLast(state);
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            const isStarting = isStartingAbility(ability);

            // Only create ability widgets for the scrollable panel
            const abilityWidget = new AbilityWidget(this, 0, 0, ability);
            const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, abilityWidget.height);
            abilityContainer.add(abilityWidget);

            if (isStarting) {
                // Grey out starting abilities and add tooltips
                abilityWidget.setAlpha(0.5);
                addTooltip(this, abilityWidget, UNSELLABLE_TOOLTIP_TEXT, 300, 400);
            }

            // Add to scrollable panel
            this.spiritPanel?.addChild(abilityContainer);
        }
    }



    private placeSpiritInUpgradingSlot(spiritContainer: Phaser.GameObjects.Container, ability: Ability) {
        this.upgradingSpirit = ability;
        this.upgradingSpiritContainer = spiritContainer;

        // Create an ability card representation in the slot
        const abilityWidget = new AbilityWidget(this, (this.upgradingSlot as any).x, (this.upgradingSlot as any).y, ability);
        abilityWidget.setInteractive()
            .on('pointerover', () => {
                (this.game.canvas as HTMLCanvasElement).style.cursor = 'pointer';
            })
            .on('pointerout', () => {
                (this.game.canvas as HTMLCanvasElement).style.cursor = 'default';
            })
            .on('pointerdown', () => {
                this.removeFromUpgradingSlot();
                this.returnSpiritToPanel(ability);
            });

        // Create a spirit display to the left of the upgrading slot
        const spiritWidget = new SpiritWidget(this, (this.upgradingSlot as any).x - 100, (this.upgradingSlot as any).y, ability);

        this.ui.push(abilityWidget);
        this.ui.push(spiritWidget);
        this.checkUpgradeButtonState();
    }

    private placeSpiritInSacrificingSlot(spiritContainer: Phaser.GameObjects.Container, ability: Ability) {
        this.sacrificingSpirit = ability;
        this.sacrificingSpiritContainer = spiritContainer;

        // Create an ability card representation in the slot
        const abilityWidget = new AbilityWidget(this, (this.sacrificingSlot as any).x, (this.sacrificingSlot as any).y, ability);
        abilityWidget.setInteractive()
            .on('pointerover', () => {
                (this.game.canvas as HTMLCanvasElement).style.cursor = 'pointer';
            })
            .on('pointerout', () => {
                (this.game.canvas as HTMLCanvasElement).style.cursor = 'default';
            })
            .on('pointerdown', () => {
                this.removeFromSacrificingSlot();
                this.returnSpiritToPanel(ability);
            });

        // Create a spirit display to the right of the sacrificing slot
        const spiritWidget = new SpiritWidget(this, (this.sacrificingSlot as any).x + 100, (this.sacrificingSlot as any).y, ability);

        this.ui.push(abilityWidget);
        this.ui.push(spiritWidget);
        this.checkUpgradeButtonState();
    }

    private removeFromUpgradingSlot() {
        this.upgradingSpirit = undefined;
        this.upgradingSpiritContainer = undefined;
        this.removeSlotSpirit(this.upgradingSlot!);
        this.checkUpgradeButtonState();
    }

    private removeFromSacrificingSlot() {
        this.sacrificingSpirit = undefined;
        this.sacrificingSpiritContainer = undefined;
        this.removeSlotSpirit(this.sacrificingSlot!);
        this.checkUpgradeButtonState();
    }

    private removeSlotSpirit(slot: Phaser.GameObjects.GameObject) {
        // Remove any ability widgets and spirit widgets near this slot
        this.ui = this.ui.filter(obj => {
            if (obj instanceof AbilityWidget || obj instanceof SpiritWidget) {
                const distance = Math.abs(obj.x - (slot as any).x) + Math.abs(obj.y - (slot as any).y);
                if (distance < 150) { // Increased range to catch spirit widgets positioned further away
                    obj.destroy();
                    return false;
                }
            }
            return true;
        });
    }

    private returnSpiritToPanel(ability: Ability) {
        // Recreate the ability container and add it back to the scrollable panel
        const isStarting = isStartingAbility(ability);

        const abilityWidget = new AbilityWidget(this, 0, 0, ability);
        const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, abilityWidget.height);
        abilityContainer.add(abilityWidget);

        if (isStarting) {
            // Grey out starting abilities and add tooltips
            abilityWidget.setAlpha(0.5);
            addTooltip(this, abilityWidget, UNSELLABLE_TOOLTIP_TEXT, 300, 400);
        }

        // Add back to scrollable panel in correct position (before starting spirits)
        this.insertSpiritBeforeStartingSpirits(abilityContainer, ability);
    }

    private insertSpiritBeforeStartingSpirits(abilityContainer: Phaser.GameObjects.Container, ability: Ability) {
        if (!this.spiritPanel) {
            return;
        }

        const isStarting = isStartingAbility(ability);

        // If it's a starting spirit, just append it at the end
        if (isStarting) {
            this.spiritPanel.addChild(abilityContainer);
            return;
        }

        // For non-starting spirits, insert before the starting spirits block
        // Since there are always exactly STARTING_SPIRITS_COUNT starting spirits at the end
        const existingChildren = this.spiritPanel.getChildren();
        const insertIndex = Math.max(0, existingChildren.length - STARTING_SPIRITS_COUNT);

        const sizer = this.spiritPanel.getPanelElement();
        const wrappedChild = this.rexUI.add.fixWidthSizer({}).add(abilityContainer);

        // Insert at the calculated position (right before starting spirits)
        (sizer as any).insert(insertIndex, wrappedChild, { expand: true });
        this.spiritPanel.panel.layout();
    }

    private sortedAbilitiesWithStartingLast(state: Game2DerivedState): Ability[] {
        const abilities = sortedAbilities(state);
        const nonStartingAbilities: Ability[] = [];
        const startingAbilities: Ability[] = [];

        // Single pass to separate abilities - more efficient than double filter
        for (const ability of abilities) {
            if (isStartingAbility(ability)) {
                startingAbilities.push(ability);
            } else {
                nonStartingAbilities.push(ability);
            }
        }

        // Return non-starting abilities first, then starting abilities
        return [...nonStartingAbilities, ...startingAbilities];
    }

    private checkUpgradeButtonState() {
        const canUpgrade = this.upgradingSpirit !== undefined && this.sacrificingSpirit !== undefined;
        this.upgradeButton?.setEnabled(canUpgrade);
    }

    private performUpgrade() {
        // Placeholder for upgrade functionality - will be implemented in part 2
        logger.ui.info('Upgrade button clicked - functionality to be implemented');
        this.errorText?.setText('Upgrade functionality coming soon!');
    }

    private getAbilityFromContainer(container: Phaser.GameObjects.Container): Ability {
        if (!container.list || container.list.length === 0) {
            throw new Error('Invalid container structure');
        }

        // Find AbilityWidget in the container's children
        for (const child of container.list) {
            if (child instanceof AbilityWidget) {
                return child.ability;
            }
        }

        throw new Error('No AbilityWidget found in container');
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
}