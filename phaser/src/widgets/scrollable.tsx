import {Color, colorToNumber} from '../constants/colors';
import 'phaser';
import RexUIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';

declare module 'phaser' {
  interface Scene {
    rexUI: RexUIPlugin;
  }
}

//
// ScrollablePanel Class
//
// A class-based wrapper for creating scrollable panels with drag-and-drop functionality.
// Usage:
//   const scrollablePanel = new ScrollablePanel(this, 400, 300, 600, 400);
//   scrollablePanel.addChild(yourGameObject1);
//   scrollablePanel.addChild(yourGameObject2);
//   scrollablePanel.enableDraggable(5); // Max 5 elements allowed to be dragged into the panel
//
export class ScrollablePanel {
    public scene: Phaser.Scene;
    public panel: RexUIPlugin.ScrollablePanel;
    public maxElements?: number;

    constructor(
        scene: Phaser.Scene,
        x: number, 
        y: number, 
        width: number, 
        height: number,
        scrollbarEnabled: boolean = true,
    ) {
        this.scene = scene;
        
        const sizer = scene.rexUI.add.sizer({
            orientation: 'x',
            space: { item: 10, top: 10, bottom: 10 },
        });

        let scrollbarConfig = {};
        if (scrollbarEnabled) {
            scrollbarConfig = {
                slider: {
                    track: scene.rexUI.add.roundRectangle(0, 0, 20, 10, 10, colorToNumber(Color.StoneShadowLight)).setStrokeStyle(2, colorToNumber(Color.StoneShadowDark)),
                    thumb: scene.rexUI.add.roundRectangle(0, 0, 0, 0, 13, colorToNumber(Color.Cream)),
                },
                mouseWheelScroller: {
                    focus: false,
                    speed: 0.5,
                },
            };
        }

        this.panel = scene.rexUI.add.scrollablePanel({
            x, y, width, height,
            scrollMode: 1,
            panel: {
                child: sizer,
            },
            align: {
                panel: 'bottom',
            },
            ...scrollbarConfig,
        }).layout()

        this.panel.setScrollerEnable(scrollbarEnabled);
    }

    // Adds a child element to the scrollable panel
    // All child elements are wrapped in a fixWidthSizer for layout purposes
    public addChild(child: Phaser.GameObjects.GameObject): void {
        const wrappedChild = this.wrapElement(child);
        this.getPanelElement().add(wrappedChild);
        this.panel.layout();
    }

    // Gets the panel element container for adding child objects
    public getPanelElement(): Phaser.GameObjects.Container {
        return this.panel.getElement('panel') as Phaser.GameObjects.Container;
    }

    // Gets all child objects in the panel
    public getChildren(): Phaser.GameObjects.GameObject[] {
        return this.getPanelElement().getAll().map((child) => this.unwrapElement(child as Phaser.GameObjects.Container));
    }

    // Gets the number of child objects in the panel
    public getChildCount(): number {
        return this.getChildren().length;
    }

    // Wraps a Phaser GameObject in a fixWidthSizer for layout purposes
    private wrapElement(element: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject {
        return this.scene.rexUI.add.fixWidthSizer({}).add(element)
    }

    // Unwraps a Phaser GameObject from a fixWidthSizer, returning the inner container
    private unwrapElement(element: Phaser.GameObjects.Container): Phaser.GameObjects.Container {
        const children = element.getAll();
        if (children.length > 0) {
            return children[0] as Phaser.GameObjects.Container;
        }
        return element as Phaser.GameObjects.Container;
    }

    //
    // enableDraggable
    //
    // Adds draggable functionality to the scrollable panel.
    // maxElements: The maximum number of elements allowed on the panel. 
    //              Additional elements dragged to the panel will not succeed, and will return to their previous panel.
    //
    public enableDraggable(options?: {
        onMovedChild?: (panel: ScrollablePanel, child: Phaser.GameObjects.GameObject) => void,
        maxElements?: number
    }): void {
        const maxElements = options?.maxElements;
        const onMovedChild = options?.onMovedChild;
        
        this.maxElements = maxElements;
        const dragBehavior = this.scene.plugins.get('rexdragplugin') as any;
        
        // Store maxElements on the scrollable panel for later reference
        if (maxElements !== undefined) {
            this.panel.setData('maxElements', maxElements);
        }

        this.panel
            .setChildrenInteractive({
                targets: [this.getPanelElement()],
                dropZone: true,
            })
            .on('child.over', (child: any) => {
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'grab';
            })
            .on('child.out', (child: any) => {
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'default';
            })
            .on('child.down', (child: any) => {
                if (!child.drag) {
                    child.drag = dragBehavior.add(child);
                    child
                        .on('dragstart', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
                            const currentSizer = child.getParentSizer();
                            // Save start sizer and index
                            child.setData({
                                sizer: currentSizer,
                                index: currentSizer.getChildIndex(child)
                            });
                            currentSizer.remove(child);
                            // Don't layout currentSizer in this moment,
                            // just clear mask manually
                            child.clearMask();

                            this.onChildDragStart(child);
                        })
                        .on('dragend', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number, dropped: boolean) => {
                            if (dropped) { // Process 'drop' event
                                return;
                            }

                            const previousSizer = child.getData('sizer');
                            this.onChildDragEnd(child);

                            // Insert back to previous sizer if not dropping on another panel
                            previousSizer.insert(child.getData('index'), child, { expand: true });
                            this.arrangeItems(previousSizer);
                        })
                        .on('drop', (pointer: Phaser.Input.Pointer, dropZone: any) => {
                            // Drop at another sizer
                            this.onChildDragEnd(child);

                            const currentSizer = dropZone.getTopmostSizer().getElement('panel');
                            const previousSizer = child.getData('sizer');

                            // Check if maxElements limit would be exceeded
                            const targetMaxElements = dropZone.getTopmostSizer().getData('maxElements');
                            if (targetMaxElements && currentSizer !== previousSizer && currentSizer.getElement('items').length >= targetMaxElements) {
                                // Return to previous sizer if limit would be exceeded
                                previousSizer.insert(child.getData('index'), child, { expand: true });
                                this.arrangeItems(previousSizer);
                                return;
                            }

                            // Layout previous sizer
                            if (previousSizer !== currentSizer) {
                                this.arrangeItems(previousSizer);
                            }

                            // Item is placed to new position in current sizer
                            currentSizer.insertAtPosition(
                                pointer.x, pointer.y,
                                child,
                                { expand: true }
                            );

                            // Call onMovedChild callback if child was moved to a different panel
                            if (previousSizer !== currentSizer && onMovedChild) {
                                onMovedChild(this, this.unwrapElement(child));
                            }
                            
                            this.arrangeItems(currentSizer);
                        });
                }

                // Enable interactive before try-dragging
                child.setInteractive();
                child.drag.drag();
            });
    }

    private onChildDragStart(child: any): void {
        child.setDepth(1);
    }

    private onChildDragEnd(child: any): void {
        child.setDepth(0);

        // Disable interactive, so that scrollablePanel could be scrolling
        child.disableInteractive();
    }


    private arrangeItems(sizer: any): void {
        const children = sizer.getElement('items');
        // Save current position
        children.forEach((child: any) => {
            child.setData({ startX: child.x, startY: child.y });
        });
        // Item is placed to new position in sizer
        sizer.getTopmostSizer().layout();
        // Move child from start position to new position
        children.forEach((child: any) => {
            const fromX = child.getData('startX');
            const fromY = child.getData('startY');
            console.log('Child position:', child.x, child.y);
            console.log('Saved position:', fromX, fromY);
            if ((child.x !== fromX) || (child.y !== fromY)) {
                child.moveFrom({ x: fromX, y: fromY, speed: 300 });
            }
        });
    }
}