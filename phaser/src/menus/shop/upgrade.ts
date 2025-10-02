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
import { UpgradeSparkleParticleSystem } from "../../particles/upgrade-sparkle";
import { SacrificeDissolveParticleSystem } from "../../particles/sacrifice-dissolve";

// Constants
const STARTING_SPIRITS_COUNT = 8;
const UNUPGRADEABLE_TOOLTIP_TEXT = "Starting spirits cannot be used for upgrading";
const MAX_UPGRADE_LEVEL = 3;
const FULLY_UPGRADED_TOOLTIP_TEXT = "Spirit is fully upgraded";
const INSUFFICIENT_VALUE_TOOLTIP_TEXT = "Spirit value too low for upgrading ability";

// Layout constants
const STAR_SPACING = 20;
const STAR_Y_OFFSET = -85;
const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 160;
const SLOT_Y_RATIO = 0.35;
const SLOT_LEFT_X_RATIO = 0.3;
const SLOT_RIGHT_X_RATIO = 0.7;
const SLOT_TITLE_OFFSET_Y = 115;
const SLOT_SPIRIT_OFFSET_X = 100;
const SLOT_PROXIMITY_THRESHOLD = 150;

const PANEL_WIDTH_RATIO = 0.95;
const PANEL_HEIGHT = 190;
const PANEL_Y_RATIO = 0.78;

const BUTTON_WIDTH = 150;
const BUTTON_HEIGHT = 60;
const BUTTON_Y_RATIO = 0.34;
const BUTTON_FONT_SIZE = 12;

const TOOLTIP_WIDTH = 300;
const TOOLTIP_HEIGHT = 400;

// Helper function to get ability upgrade level
// TODO: This should read from the actual ability data once upgrade levels are tracked
function getAbilityUpgradeLevel(ability: Ability): number {
    // Placeholder: returns 0 for now, will be connected to real data later
    return 0;
}

// Helper function to create star indicators above an ability
function createUpgradeStars(
    scene: Phaser.Scene,
    x: number,
    y: number,
    upgradeLevel: number
): Phaser.GameObjects.Image[] {
    const stars: Phaser.GameObjects.Image[] = [];
    const starStartX = -(MAX_UPGRADE_LEVEL - 1) * STAR_SPACING / 2;

    for (let i = 0; i < MAX_UPGRADE_LEVEL; i++) {
        const starX = x + starStartX + i * STAR_SPACING;
        const starImage = i < upgradeLevel ? 'upgrade-star' : 'upgrade-star-slot';
        const star = addScaledImage(scene, starX, y + STAR_Y_OFFSET, starImage);
        stars.push(star);
    }

    return stars;
}

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
    sacrificingSlotTitle: Phaser.GameObjects.Text | undefined;
    upgradingSpirit: Ability | undefined;
    sacrificingSpirit: Ability | undefined;
    upgradingSpiritContainer: Phaser.GameObjects.Container | undefined;
    sacrificingSpiritContainer: Phaser.GameObjects.Container | undefined;
    upgradeButton: Button | undefined;
    upgradeCostLabel: Phaser.GameObjects.Text | undefined;
    upgradeCostAmount: Phaser.GameObjects.Text | undefined;

    spiritPanel: ScrollablePanel | undefined;

    constructor(api: DeployedGame2API, state: Game2DerivedState) {
        super("UpgradeSpiritsMenu");

        this.api = api;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.state = state;
        this.ui = [];
    }

    create() {
        this.errorText = this.add.text(82, GAME_HEIGHT * 0.5, '', fontStyle(12, { color: Color.Red })).setStroke(Color.Licorice, 6);
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-shop').setDepth(-10);
        createSpiritAnimations(this);

        this.topBar = new TopBar(this, true, this.api, this.state)
            .back(() => {
                this.scene.remove('ShopMenu');
                this.scene.add('ShopMenu', new ShopMenu(this.api, this.state));
                this.scene.start('ShopMenu');
            }, 'Back to Shop');

        this.createUpgradeSlots();
        this.createSpiritsPanel();

        this.upgradeButton = new Button(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * BUTTON_Y_RATIO,
            BUTTON_WIDTH,
            BUTTON_HEIGHT,
            'Upgrade',
            BUTTON_FONT_SIZE,
            () => this.performUpgrade()
        ).setEnabled(false);

        const costY = GAME_HEIGHT * BUTTON_Y_RATIO + BUTTON_HEIGHT / 2;
        this.upgradeCostLabel = this.add.text(
            GAME_WIDTH / 2 - 55,
            costY,
            'Cost: ',
            fontStyle(10, { color: Color.White })
        ).setVisible(false).setStroke(Color.Licorice, 4);

        this.upgradeCostAmount = this.add.text(
            GAME_WIDTH / 2 + 10,
            costY,
            '',
            fontStyle(10, { color: Color.Yellow })
        ).setVisible(false).setStroke(Color.Licorice, 4);

        this.onStateChange(this.state);
    }

    shutdown() {
        this.subscription?.unsubscribe();
    }

    private createUpgradeSlots() {
        const slotY = GAME_HEIGHT * SLOT_Y_RATIO;

        this.upgradingSlot = this.rexUI.add.roundRectangle(
            GAME_WIDTH * SLOT_LEFT_X_RATIO,
            slotY,
            SLOT_WIDTH,
            SLOT_HEIGHT,
            20,
            colorToNumber(Color.Blue)
        );
        this.add.existing(this.upgradingSlot);
        this.upgradingSlot.setInteractive().setData('slotType', 'upgrading');

        this.add.text(GAME_WIDTH * SLOT_LEFT_X_RATIO, slotY - SLOT_TITLE_OFFSET_Y, 'Upgrading Spirit',
            fontStyle(10, { color: Color.White })).setStroke(Color.Licorice, 6).setOrigin(0.5);

        this.sacrificingSlot = this.rexUI.add.roundRectangle(
            GAME_WIDTH * SLOT_RIGHT_X_RATIO,
            slotY,
            SLOT_WIDTH,
            SLOT_HEIGHT,
            20,
            colorToNumber(Color.Red)
        );
        this.add.existing(this.sacrificingSlot);
        this.sacrificingSlot.setInteractive().setData('slotType', 'sacrificing');

        this.sacrificingSlotTitle = this.add.text(
            GAME_WIDTH * SLOT_RIGHT_X_RATIO,
            slotY - SLOT_TITLE_OFFSET_Y,
            'Sacrificing Spirit',
            fontStyle(10, { color: Color.White })
        ).setStroke(Color.Licorice, 6).setOrigin(0.5);

        // Initially hide the sacrificing slot and title
        (this.sacrificingSlot as any).setVisible(false);
        this.sacrificingSlotTitle.setVisible(false);
    }

    private createSpiritsPanel() {
        this.spiritPanel = new ScrollablePanel(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * PANEL_Y_RATIO,
            GAME_WIDTH * PANEL_WIDTH_RATIO,
            PANEL_HEIGHT,
            true,
            { bottom: 0 }
        );
        this.ui.push(this.spiritPanel.panel);

        this.spiritPanel.enableDraggable({
            onMovedChild: (panel, child) => {},
            onDragEnd: () => {}
        });

        this.spiritPanel.addDragTargets([this.upgradingSlot!, this.sacrificingSlot!], {
            onDragOver: (slot) => this.animateSlotEnlarge(slot),
            onDragOut: (slot) => this.animateSlotShrink(slot)
        });

        this.setupSlotDropZones();
    }

    private setupSlotDropZones() {
        this.upgradingSlot?.setInteractive().setData('drop', true);
        this.sacrificingSlot?.setInteractive().setData('drop', true);

        this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropped: boolean) => {
            logger.ui.debug(`Dragend event: dropped=${dropped}, pointer=(${pointer.x}, ${pointer.y})`);

            if (!dropped) {
                const dragEndX = pointer.x;
                const dragEndY = pointer.y;

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

        const spiritContainer = this.extractSpiritContainer(draggedObject);
        if (!spiritContainer) return;

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

        const upgradeLevel = getAbilityUpgradeLevel(ability);
        if (upgradeLevel >= MAX_UPGRADE_LEVEL) {
            logger.ui.warn('Cannot upgrade fully upgraded abilities');
            return;
        }

        // Don't allow placing in sacrificing slot if no upgrading spirit is present
        if (slotType === 'sacrificing' && !this.upgradingSpirit) {
            logger.ui.warn('Must select an upgrading spirit first');
            return;
        }

        // Check value constraints when placing in sacrificing slot
        if (slotType === 'sacrificing' && this.upgradingSpirit) {
            const upgradingValue = pureCircuits.ability_value(this.upgradingSpirit);
            const sacrificingValue = pureCircuits.ability_value(ability);
            if (sacrificingValue < upgradingValue) {
                logger.ui.warn('Sacrificing ability value too low');
                return;
            }
        }

        // Check value constraints when placing in upgrading slot (if sacrificing already placed)
        if (slotType === 'upgrading' && this.sacrificingSpirit) {
            const upgradingValue = pureCircuits.ability_value(ability);
            const sacrificingValue = pureCircuits.ability_value(this.sacrificingSpirit);
            if (sacrificingValue < upgradingValue) {
                logger.ui.warn('Sacrificing ability value too low for this upgrading spirit');
                return;
            }
        }

        if (slotType === 'upgrading' && this.upgradingSpirit) {
            logger.ui.info('Upgrading slot is occupied, replacing existing spirit');
            this.removeFromUpgradingSlot();
        }

        if (slotType === 'sacrificing' && this.sacrificingSpirit) {
            logger.ui.info('Sacrificing slot is occupied, replacing existing spirit');
            this.removeFromSacrificingSlot();
        }

        if (slotType === 'upgrading' && this.sacrificingSpiritContainer === spiritContainer) {
            logger.ui.warn('Cannot use the same spirit instance for both slots');
            return;
        }

        if (slotType === 'sacrificing' && this.upgradingSpiritContainer === spiritContainer) {
            logger.ui.warn('Cannot use the same spirit instance for both slots');
            return;
        }

        this.removeFromScrollablePanel(spiritContainer);

        if (slotType === 'upgrading') {
            this.placeSpiritInUpgradingSlot(spiritContainer, ability);
        } else {
            this.placeSpiritInSacrificingSlot(spiritContainer, ability);
        }
    }

    private extractSpiritContainer(draggedObject: any): Phaser.GameObjects.Container | null {
        if (draggedObject.type === 'rexFixWidthSizer') {
            const children = draggedObject.getAll();
            if (children.length > 0) {
                const container = children[0] as Phaser.GameObjects.Container;
                logger.ui.debug('Unwrapped container type:', container.constructor.name);
                return container;
            } else {
                logger.ui.error('FixWidthSizer has no children');
                return null;
            }
        } else if (draggedObject instanceof Phaser.GameObjects.Container) {
            return draggedObject;
        } else {
            logger.ui.error('Unknown dragged object type:', draggedObject);
            return null;
        }
    }

    private removeFromScrollablePanel(spiritContainer: Phaser.GameObjects.Container) {
        if (!this.spiritPanel || !this.spiritPanel.hasChild(spiritContainer)) return;

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

        this.refreshSpiritsPanel();
    }

    private refreshSpiritsPanel() {
        // Destroy the old panel and create a new one to avoid layout issues
        if (this.spiritPanel) {
            this.spiritPanel.panel.destroy();
        }

        this.spiritPanel = new ScrollablePanel(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * PANEL_Y_RATIO,
            GAME_WIDTH * PANEL_WIDTH_RATIO,
            PANEL_HEIGHT,
            true,
            { bottom: 0 }
        );
        this.ui.push(this.spiritPanel.panel);

        // Re-setup drag targets for the new panel
        this.spiritPanel.addDragTargets([this.upgradingSlot!, this.sacrificingSlot!], {
            onDragOver: (slot) => this.animateSlotEnlarge(slot),
            onDragOut: (slot) => this.animateSlotShrink(slot)
        });

        this.spiritPanel.enableDraggable({
            onMovedChild: () => {},
            onDragEnd: () => {}
        });

        const abilities = this.sortedAbilitiesWithStartingLast(this.state);

        // Separate abilities into groups based on usability
        const usableAbilities: Ability[] = [];
        const unusableAbilities: Ability[] = [];

        for (const ability of abilities) {
            const isStarting = isStartingAbility(ability);
            const upgradeLevel = getAbilityUpgradeLevel(ability);
            const isFullyUpgraded = upgradeLevel >= MAX_UPGRADE_LEVEL;
            const hasInsufficientValue = this.upgradingSpirit !== undefined &&
                pureCircuits.ability_value(ability) < pureCircuits.ability_value(this.upgradingSpirit);

            if (isStarting || isFullyUpgraded || hasInsufficientValue) {
                unusableAbilities.push(ability);
            } else {
                usableAbilities.push(ability);
            }
        }

        // Add usable abilities first
        for (const ability of usableAbilities) {
            this.addAbilityToPanel(ability, false, null);
        }

        // Add unusable abilities at the end
        for (const ability of unusableAbilities) {
            const isStarting = isStartingAbility(ability);
            const upgradeLevel = getAbilityUpgradeLevel(ability);
            const isFullyUpgraded = upgradeLevel >= MAX_UPGRADE_LEVEL;
            const hasInsufficientValue = this.upgradingSpirit !== undefined &&
                pureCircuits.ability_value(ability) < pureCircuits.ability_value(this.upgradingSpirit);

            let tooltipText: string | null = null;
            if (isStarting) {
                tooltipText = UNUPGRADEABLE_TOOLTIP_TEXT;
            } else if (isFullyUpgraded) {
                tooltipText = FULLY_UPGRADED_TOOLTIP_TEXT;
            } else if (hasInsufficientValue) {
                tooltipText = INSUFFICIENT_VALUE_TOOLTIP_TEXT;
            }

            this.addAbilityToPanel(ability, true, tooltipText);
        }
    }

    private addAbilityToPanel(ability: Ability, greyedOut: boolean, tooltipText: string | null) {
        const upgradeLevel = getAbilityUpgradeLevel(ability);
        const abilityWidget = new AbilityWidget(this, 0, 0, ability);
        const abilityContainer = this.add.container(0, 0).setSize(abilityWidget.width, abilityWidget.height);
        abilityContainer.add(abilityWidget);

        // Add upgrade stars above the ability card
        const stars = createUpgradeStars(this, 0, 0, upgradeLevel);
        abilityContainer.add(stars);

        if (greyedOut) {
            abilityWidget.setAlpha(0.5);
            if (tooltipText) {
                addTooltip(this, abilityWidget, tooltipText, TOOLTIP_WIDTH, TOOLTIP_HEIGHT);
            }
        }

        this.spiritPanel?.addChild(abilityContainer);
    }



    private placeSpiritInUpgradingSlot(spiritContainer: Phaser.GameObjects.Container, ability: Ability) {
        this.upgradingSpirit = ability;
        this.upgradingSpiritContainer = spiritContainer;

        const slotX = (this.upgradingSlot as any).x;
        const slotY = (this.upgradingSlot as any).y;

        const abilityWidget = new AbilityWidget(this, slotX, slotY, ability);
        this.setupSlotWidgetInteractivity(abilityWidget, () => {
            this.removeFromUpgradingSlot();
        });

        const spiritWidget = new SpiritWidget(this, slotX - SLOT_SPIRIT_OFFSET_X, slotY, ability);

        // Add upgrade stars above the ability widget
        const upgradeLevel = getAbilityUpgradeLevel(ability);
        const stars = createUpgradeStars(this, slotX, slotY, upgradeLevel);
        this.ui.push(...stars);

        this.ui.push(abilityWidget, spiritWidget);
        this.checkUpgradeButtonState();

        // Show sacrificing slot now that upgrading spirit is present
        (this.sacrificingSlot as any)?.setVisible(true);
        this.sacrificingSlotTitle?.setVisible(true);

        // Refresh panel to update greyed out abilities based on new upgrading spirit value
        this.refreshSpiritsPanel();
    }

    private placeSpiritInSacrificingSlot(spiritContainer: Phaser.GameObjects.Container, ability: Ability) {
        this.sacrificingSpirit = ability;
        this.sacrificingSpiritContainer = spiritContainer;

        const slotX = (this.sacrificingSlot as any).x;
        const slotY = (this.sacrificingSlot as any).y;

        const abilityWidget = new AbilityWidget(this, slotX, slotY, ability);
        this.setupSlotWidgetInteractivity(abilityWidget, () => {
            this.removeFromSacrificingSlot();
        });

        const spiritWidget = new SpiritWidget(this, slotX + SLOT_SPIRIT_OFFSET_X, slotY, ability);

        // Add upgrade stars above the ability widget
        const upgradeLevel = getAbilityUpgradeLevel(ability);
        const stars = createUpgradeStars(this, slotX, slotY, upgradeLevel);
        this.ui.push(...stars);

        this.ui.push(abilityWidget, spiritWidget);
        this.checkUpgradeButtonState();
    }

    private setupSlotWidgetInteractivity(widget: AbilityWidget, onClick: () => void) {
        widget.setInteractive()
            .on('pointerover', () => {
                (this.game.canvas as HTMLCanvasElement).style.cursor = 'pointer';
            })
            .on('pointerout', () => {
                (this.game.canvas as HTMLCanvasElement).style.cursor = 'default';
            })
            .on('pointerdown', onClick);
    }

    private removeFromUpgradingSlot() {
        this.upgradingSpirit = undefined;
        this.upgradingSpiritContainer = undefined;
        this.removeSlotSpirit(this.upgradingSlot!);

        // If there was a sacrificing spirit, remove it since it's no longer valid
        if (this.sacrificingSpirit) {
            this.removeFromSacrificingSlot();
        }

        this.checkUpgradeButtonState();

        // Hide sacrificing slot since no upgrading spirit is present
        (this.sacrificingSlot as any)?.setVisible(false);
        this.sacrificingSlotTitle?.setVisible(false);

        // Refresh panel to remove greyed out state from abilities
        this.refreshSpiritsPanel();
    }

    private removeFromSacrificingSlot() {
        this.sacrificingSpirit = undefined;
        this.sacrificingSpiritContainer = undefined;
        this.removeSlotSpirit(this.sacrificingSlot!);
        this.checkUpgradeButtonState();
    }

    private removeSlotSpirit(slot: Phaser.GameObjects.GameObject) {
        this.ui = this.ui.filter(obj => {
            if (obj instanceof AbilityWidget || obj instanceof SpiritWidget || obj instanceof Phaser.GameObjects.Image) {
                const distance = Math.abs(obj.x - (slot as any).x) + Math.abs(obj.y - (slot as any).y);
                if (distance < SLOT_PROXIMITY_THRESHOLD) {
                    obj.destroy();
                    return false;
                }
            }
            return true;
        });
    }


    private sortedAbilitiesWithStartingLast(state: Game2DerivedState): Ability[] {
        const abilities = sortedAbilities(state);
        const nonStartingAbilities: Ability[] = [];
        const startingAbilities: Ability[] = [];

        for (const ability of abilities) {
            if (isStartingAbility(ability)) {
                startingAbilities.push(ability);
            } else {
                nonStartingAbilities.push(ability);
            }
        }

        return [...nonStartingAbilities, ...startingAbilities];
    }

    private checkUpgradeButtonState() {
        const bothSpiritsSelected = this.upgradingSpirit !== undefined && this.sacrificingSpirit !== undefined;

        if (bothSpiritsSelected && this.upgradingSpirit && this.sacrificingSpirit) {
            const cost = 100; // Placeholder fixed cost for now
            const currentGold = this.state.player?.gold ?? BigInt(0);
            const hasEnoughGold = currentGold >= BigInt(cost);

            this.upgradeCostLabel?.setVisible(true);
            this.upgradeCostAmount?.setText(`${cost}`);
            this.upgradeCostAmount?.setVisible(true);

            // Change cost color based on affordability
            if (hasEnoughGold) {
                this.upgradeCostAmount?.setColor(Color.Yellow);
            } else {
                this.upgradeCostAmount?.setColor(Color.Red);
            }

            // Enable button only if player has enough gold
            this.upgradeButton?.setEnabled(hasEnoughGold);

            // Add/remove tooltip based on gold availability
            if (!hasEnoughGold && this.upgradeButton) {
                addTooltip(this, this.upgradeButton, `Not enough gold! Need ${cost}, have ${currentGold}`, TOOLTIP_WIDTH, TOOLTIP_HEIGHT);
            }
        } else {
            this.upgradeCostLabel?.setVisible(false);
            this.upgradeCostAmount?.setVisible(false);
            this.upgradeButton?.setEnabled(false);
        }
    }

    private performUpgrade() {
        if (!this.upgradingSpirit) {
            logger.ui.error('No upgrading spirit selected');
            return;
        }

        const upgradeLevel = getAbilityUpgradeLevel(this.upgradingSpirit);
        if (upgradeLevel >= MAX_UPGRADE_LEVEL) {
            logger.ui.warn('Cannot upgrade - spirit is already fully upgraded');
            this.errorText?.setText('This spirit is already fully upgraded!');
            return;
        }

        // Play upgrade animations
        this.playUpgradeAnimation();
        this.playSacrificeAnimation();

        // Placeholder for upgrade functionality - will be implemented in part 2
        logger.ui.info('Upgrade button clicked - functionality to be implemented');
        this.errorText?.setText('Upgrade functionality coming soon!');
    }

    private playUpgradeAnimation() {
        if (!this.upgradingSlot) return;

        const slotX = (this.upgradingSlot as any).x;
        const slotY = (this.upgradingSlot as any).y;

        // Create golden sparkle/upgrade particles
        const particles = new UpgradeSparkleParticleSystem(this, slotX, slotY);
        particles.setDepth(100); // Ensure particles are on top
        particles.burst();

        // Intense flash and scale effect on the slot
        this.tweens.add({
            targets: this.upgradingSlot,
            alpha: { from: 1, to: 0.2 },
            scale: { from: 1, to: 1.4 },
            duration: 250,
            yoyo: true,
            repeat: 3,
            ease: 'Bounce.easeOut',
        });

        // Add a bright flash overlay
        const flash = this.add.circle(slotX, slotY, 80, 0xFFFFFF, 0.8);
        this.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 3,
            duration: 600,
            ease: 'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });

        // Stop particles after animation
        this.time.delayedCall(1500, () => {
            particles.destroy();
        });
    }

    private playSacrificeAnimation() {
        if (!this.sacrificingSlot) return;

        const slotX = (this.sacrificingSlot as any).x;
        const slotY = (this.sacrificingSlot as any).y;

        // Create dark/purple dissolve particles
        const particles = new SacrificeDissolveParticleSystem(this, slotX, slotY);
        particles.setDepth(100); // Ensure particles are on top
        particles.burst();

        // Intense fade and shrink effect on the slot
        this.tweens.add({
            targets: this.sacrificingSlot,
            alpha: { from: 1, to: 0.1 },
            scale: { from: 1, to: 0.6 },
            duration: 350,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut',
        });

        // Add a dark purple pulse overlay
        const pulse = this.add.circle(slotX, slotY, 80, 0x8B00FF, 0.7);
        this.tweens.add({
            targets: pulse,
            alpha: 0,
            scale: 2.5,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => pulse.destroy(),
        });

        // Stop particles after animation
        this.time.delayedCall(1500, () => {
            particles.destroy();
        });
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