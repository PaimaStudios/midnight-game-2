import {Color, colorToNumber} from '../constants/colors';
import 'phaser';
import RexUIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';

declare module 'phaser' {
  interface Scene {
    rexUI: RexUIPlugin;
  }
}

//
// Returns a scrollable panel with a horizontal scrollbar.
// Usage:
//   const scrollablePanel = createScrollablePanel(this, 400, 300, 600);
//   const scrollablePanelElement = scrollablePanel.getElement('panel');
//   scrollablePanelElement.add(yourGameObject1);
//   scrollablePanelElement.add(yourGameObject2);
//   scrollablePanelElement.add(yourGameObject3);
//
export const createScrollablePanel = function (
    scene: Phaser.Scene,
    x: number, y: number, width: number, height: number,
    scrollbar: boolean=true,
): RexUIPlugin.ScrollablePanel {

    const panel = scene.rexUI.add.sizer({
        orientation: 'x',
        space: { item: 10, top: 10, bottom: 10 },
    })

    let scrollbarConfig = {}
    if (scrollbar) {
        scrollbarConfig = {
            slider: {
                track: scene.rexUI.add.roundRectangle(0, 0, 20, 10, 10, colorToNumber(Color.DeepPlum)),
                thumb: scene.rexUI.add.roundRectangle(0, 0, 0, 0, 13, colorToNumber(Color.Tan)),
            },
            mouseWheelScroller: {
                focus: false,
                speed: 0.5,
            },
        }

    }

    const scrollablePanel = scene.rexUI.add.scrollablePanel({
            x, y, width, height,
            scrollMode: 1,
            panel: {
                child: panel,
            },
            align: {
                panel: 'bottom',
            },
            ...scrollbarConfig,
        }).layout()

    return scrollablePanel;
}

export const getScrollablePanelElement = function (scrollablePanel: RexUIPlugin.ScrollablePanel): Phaser.GameObjects.Container {
    return scrollablePanel.getElement('panel') as Phaser.GameObjects.Container;
}

export function setDraggable(scrollablePanel: RexUIPlugin.ScrollablePanel): void {
    const scene = scrollablePanel.scene;
    const dragBehavior = scene.plugins.get('rexdragplugin') as any;
    scrollablePanel
        .setChildrenInteractive({
            targets: [
                getScrollablePanelElement(scrollablePanel),
            ],
            dropZone: true,
        })
        .on('child.down', (child: any) => {
            if (!child.drag) {
                child.drag = dragBehavior.add(child);
                console.log(child);
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

                        onChildDragStart(child);
                    })
                    .on('dragend', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number, dropped: boolean) => {
                        if (dropped) { // Process 'drop' event
                            return;
                        }

                        const previousSizer = child.getData('sizer');

                        onChildDragEnd(child);

                        // Insert back to previous sizer if not dropping on another panel
                        previousSizer.insert(child.getData('index'), child, { expand: true });
                        arrangeItems(previousSizer);
                    })
                    .on('drop', (pointer: Phaser.Input.Pointer, dropZone: any) => {
                        // Drop at another sizer
                        onChildDragEnd(child);

                        const currentSizer = dropZone.getTopmostSizer().getElement('panel');
                        const previousSizer = child.getData('sizer');

                        // Layout previous sizer
                        if (previousSizer !== currentSizer) {
                            arrangeItems(previousSizer);
                        }

                        // Item is placed to new position in current sizer
                        currentSizer.insertAtPosition(
                            pointer.x, pointer.y,
                            child,
                            { expand: true }
                        );
                        arrangeItems(currentSizer);
                    });
            }

            // Enable interactive before try-dragging
            child.setInteractive();
            child.drag.drag();
        });
}

function onChildDragStart(child: any): void {
    child.setDepth(1);
    // child.getElement('background').setStrokeStyle(3, 0xff0000);
}

function onChildDragEnd(child: any): void {
    child.setDepth(0);
    // child.getElement('background').setStrokeStyle();

    // Disable interactive, so that scrollablePanel could be scrolling
    child.disableInteractive();
}

function arrangeItems(sizer: any): void {
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