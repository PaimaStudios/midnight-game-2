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
            GAME_HEIGHT - 80,
            200,
            50,
            'Upgrade Spirit',
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
        this.add.text(GAME_WIDTH * 0.3, slotY - 100, 'Upgrading Spirit',
            fontStyle(12, { color: Color.White })).setOrigin(0.5);

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
        this.add.text(GAME_WIDTH * 0.7, slotY - 100, 'Sacrificing Spirit',
            fontStyle(12, { color: Color.White })).setOrigin(0.5);
    }

    private createSpiritsPanel() {
        this.spiritPanel = new ScrollablePanel(this, GAME_WIDTH/2.0, GAME_HEIGHT * 0.75, GAME_WIDTH*0.95, 200);
        this.ui.push(this.spiritPanel.panel);

        // Enable drag functionality for the spirits panel
        this.spiritPanel.enableDraggable({
            onMovedChild: (panel, child) => {
                // Handle when spirits are moved within the panel
            },
            onDragEnd: () => {
                // Reset any visual feedback
            },
            onDoubleClick: (panel, child) => {
                // Try to place spirit in available slot
                this.tryPlaceSpiritInSlot(child as Phaser.GameObjects.Container);
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
        this.upgradingSlot.setInteractive().setData('drop', true);
        this.sacrificingSlot.setInteractive().setData('drop', true);

        // Add global drag event listener to the scene
        this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropped: boolean) => {
            logger.ui.debug(`Dragend event: dropped=${dropped}, pointer=(${pointer.x}, ${pointer.y})`);

            if (!dropped) {
                // Check if the drag ended over one of our slots
                const dragEndX = pointer.x;
                const dragEndY = pointer.y;

                // Check upgrading slot bounds
                const upgradingBounds = this.upgradingSlot.getBounds();
                logger.ui.debug(`Upgrading slot bounds:`, upgradingBounds);

                if (Phaser.Geom.Rectangle.Contains(upgradingBounds, dragEndX, dragEndY)) {
                    logger.ui.debug('Drag ended over upgrading slot');
                    this.handleSpiritDropOnSlot('upgrading', gameObject);
                    this.animateSlotShrink(this.upgradingSlot);
                    return;
                }

                // Check sacrificing slot bounds
                const sacrificingBounds = this.sacrificingSlot.getBounds();
                logger.ui.debug(`Sacrificing slot bounds:`, sacrificingBounds);

                if (Phaser.Geom.Rectangle.Contains(sacrificingBounds, dragEndX, dragEndY)) {
                    logger.ui.debug('Drag ended over sacrificing slot');
                    this.handleSpiritDropOnSlot('sacrificing', gameObject);
                    this.animateSlotShrink(this.sacrificingSlot);
                    return;
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
        logger.ui.debug('Attempting to remove spirit container from scrollable panel');

        if (!this.spiritPanel) {
            logger.ui.warn('No spirit panel available');
            return;
        }

        if (this.spiritPanel.hasChild(spiritContainer)) {
            logger.ui.debug('Found spirit container in scrollable panel, removing...');

            // Remove from the scrollable panel sizer
            const sizer = this.spiritPanel.getPanelElement();
            const items = (sizer as any).getElement?.('items');

            if (items && Array.isArray(items)) {
                const wrappedChildIndex = items.findIndex((item: any) => {
                    // Access the inner child from the wrapper
                    const children = item.getAll();
                    if (children.length > 0) {
                        return children[0] === spiritContainer;
                    }
                    return false;
                });

                if (wrappedChildIndex !== -1) {
                    const wrappedChild = items[wrappedChildIndex];
                    logger.ui.debug(`Found wrapped child at index ${wrappedChildIndex}, removing...`);

                    // Remove the wrapped child from the sizer
                    (sizer as any).remove(wrappedChild);
                    this.spiritPanel.panel.layout();

                    // Also destroy the spirit container to remove it visually
                    spiritContainer.destroy();

                    logger.ui.debug('Successfully removed spirit from scrollable panel');
                } else {
                    logger.ui.warn('Could not find wrapped child in items array');
                }
            } else {
                logger.ui.warn('Could not access items array from sizer');
            }
        } else {
            logger.ui.debug('Spirit container not found in scrollable panel');
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

            const abilityWidget = new AbilityWidget(this, 0, 2, ability);
            const spiritWidget = new SpiritWidget(this, 0, -60, ability);
            const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, 128);

            abilityContainer.add(abilityWidget);
            abilityContainer.add(spiritWidget);

            if (isStarting) {
                // Grey out starting abilities and add tooltips
                abilityWidget.setAlpha(0.5);
                spiritWidget.setAlpha(0.5);

                addTooltip(this, abilityWidget, UNSELLABLE_TOOLTIP_TEXT, 300, 400);
                addTooltip(this, spiritWidget, UNSELLABLE_TOOLTIP_TEXT, 300, 400);
            }

            // Add to scrollable panel
            this.spiritPanel?.addChild(abilityContainer);
        }
    }

    private tryPlaceSpiritInSlot(spiritContainer: Phaser.GameObjects.Container) {
        let ability: Ability;
        try {
            ability = this.getAbilityFromContainer(spiritContainer);
        } catch (error) {
            logger.ui.error('Failed to extract ability from container in double-click:', error);
            return;
        }

        if (isStartingAbility(ability)) {
            return; // Can't use starting abilities
        }

        // Check if this exact spirit instance is already in use
        if (this.upgradingSpiritContainer === spiritContainer) {
            logger.ui.warn('This spirit instance is already being used for upgrading');
            return;
        }
        if (this.sacrificingSpiritContainer === spiritContainer) {
            logger.ui.warn('This spirit instance is already being used for sacrificing');
            return;
        }

        // Try upgrading slot first, then sacrificing slot
        if (!this.upgradingSpirit) {
            this.removeFromScrollablePanel(spiritContainer);
            this.placeSpiritInUpgradingSlot(spiritContainer, ability);
        } else if (!this.sacrificingSpirit) {
            this.removeFromScrollablePanel(spiritContainer);
            this.placeSpiritInSacrificingSlot(spiritContainer, ability);
        } else {
            // Both slots are occupied, replace the upgrading slot by default
            logger.ui.info('Both slots occupied, replacing upgrading slot');
            this.returnSpiritToPanel(this.upgradingSpirit);
            this.removeFromUpgradingSlot();
            this.removeFromScrollablePanel(spiritContainer);
            this.placeSpiritInUpgradingSlot(spiritContainer, ability);
        }
    }


    private placeSpiritInUpgradingSlot(spiritContainer: Phaser.GameObjects.Container, ability: Ability) {
        this.upgradingSpirit = ability;
        this.upgradingSpiritContainer = spiritContainer;

        // Create a visual representation in the slot
        const spiritWidget = new SpiritWidget(this, this.upgradingSlot!.x, this.upgradingSlot!.y, ability);
        spiritWidget.setInteractive().on('pointerdown', () => {
            this.removeFromUpgradingSlot();
            this.returnSpiritToPanel(ability);
        });

        this.ui.push(spiritWidget);
        this.checkUpgradeButtonState();
    }

    private placeSpiritInSacrificingSlot(spiritContainer: Phaser.GameObjects.Container, ability: Ability) {
        this.sacrificingSpirit = ability;
        this.sacrificingSpiritContainer = spiritContainer;

        // Create a visual representation in the slot
        const spiritWidget = new SpiritWidget(this, this.sacrificingSlot!.x, this.sacrificingSlot!.y, ability);
        spiritWidget.setInteractive().on('pointerdown', () => {
            this.removeFromSacrificingSlot();
            this.returnSpiritToPanel(ability);
        });

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
        // Remove any spirit widgets near this slot
        this.ui = this.ui.filter(obj => {
            if (obj instanceof SpiritWidget) {
                const distance = Math.abs(obj.x - slot.x) + Math.abs(obj.y - slot.y);
                if (distance < 50) {
                    obj.destroy();
                    return false;
                }
            }
            return true;
        });
    }

    private returnSpiritToPanel(ability: Ability) {
        // Recreate the spirit container and add it back to the scrollable panel
        const isStarting = isStartingAbility(ability);

        const abilityWidget = new AbilityWidget(this, 0, 2, ability);
        const spiritWidget = new SpiritWidget(this, 0, -60, ability);
        const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, 128);

        abilityContainer.add(abilityWidget);
        abilityContainer.add(spiritWidget);

        if (isStarting) {
            // Grey out starting abilities and add tooltips
            abilityWidget.setAlpha(0.5);
            spiritWidget.setAlpha(0.5);
            addTooltip(this, abilityWidget, 'Starting spirits cannot be used for upgrading', 300, 400);
            addTooltip(this, spiritWidget, 'Starting spirits cannot be used for upgrading', 300, 400);
        }

        // Add back to scrollable panel in the correct sorted position
        this.insertSpiritInSortedOrder(abilityContainer, ability);
    }

    private insertSpiritInSortedOrder(abilityContainer: Phaser.GameObjects.Container, newAbility: Ability) {
        if (!this.spiritPanel) {
            return;
        }

        const isNewStarting = isStartingAbility(newAbility);
        const newScore = Number(pureCircuits.ability_score(newAbility));

        // Get all existing children from the scrollable panel
        const existingChildren = this.spiritPanel.getChildren();

        // Find the correct insertion position
        let insertIndex = 0;

        for (let i = 0; i < existingChildren.length; i++) {
            const existingContainer = existingChildren[i] as Phaser.GameObjects.Container;
            const existingAbility = this.getAbilityFromContainer(existingContainer);
            const isExistingStarting = isStartingAbility(existingAbility);
            const existingScore = Number(pureCircuits.ability_score(existingAbility));

            // If the new spirit is not starting but the existing one is, insert before it
            if (!isNewStarting && isExistingStarting) {
                insertIndex = i;
                break;
            }

            // If both are starting or both are not starting, sort by score (descending)
            if (isNewStarting === isExistingStarting) {
                if (newScore > existingScore) {
                    insertIndex = i;
                    break;
                }
            }

            // If we made it through all items, insert at the end
            insertIndex = i + 1;
        }

        // Insert at the calculated position
        this.insertSpiritAtIndex(abilityContainer, insertIndex);
    }

    private insertSpiritAtIndex(abilityContainer: Phaser.GameObjects.Container, index: number) {
        if (!this.spiritPanel) {
            return;
        }

        const sizer = this.spiritPanel.getPanelElement();
        const wrappedChild = this.rexUI.add.fixWidthSizer({}).add(abilityContainer);

        // Insert at the specified index
        (sizer as any).insert(index, wrappedChild, { expand: true });
        this.spiritPanel.panel.layout();

        logger.ui.debug(`Inserted spirit at index ${index}`);
    }

    private sortedAbilitiesWithStartingLast(state: Game2DerivedState): Ability[] {
        const abilities = sortedAbilities(state);

        // Separate starting and non-starting abilities
        const nonStartingAbilities = abilities.filter(ability => !isStartingAbility(ability));
        const startingAbilities = abilities.filter(ability => isStartingAbility(ability));

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
        // Debug logging to understand the structure
        logger.ui.debug('Container structure:', container);
        logger.ui.debug('Container list:', container.list);

        if (!container.list || container.list.length === 0) {
            logger.ui.error('Container has no list or empty list');
            throw new Error('Invalid container structure');
        }

        // Try to find AbilityWidget in the container's children
        for (let i = 0; i < container.list.length; i++) {
            const child = container.list[i];
            if (child instanceof AbilityWidget) {
                logger.ui.debug(`Found AbilityWidget at index ${i}`);
                return child.ability;
            }
        }

        // If no AbilityWidget found, log the structure for debugging
        logger.ui.error('No AbilityWidget found in container. Children types:',
            container.list.map(child => child.constructor.name));

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