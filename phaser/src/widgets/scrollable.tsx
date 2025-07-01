import {Colors, colorToNumber} from '../constants/colors';
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
    x: number, y: number, width: number, height: number

): RexUIPlugin.ScrollablePanel {
    const panel = scene.rexUI.add.sizer({
        orientation: 'x',
        space: { item: 10, top: 200, bottom: 10 }
    })

    const scrollablePanel = scene.rexUI.add.scrollablePanel({
            x, y, width, height,
            scrollMode: 1,
            panel: {
                child: panel,
            },
            slider: {
                track: scene.rexUI.add.roundRectangle(0, 0, 20, 10, 10, colorToNumber(Colors.DeepPlum)),
                thumb: scene.rexUI.add.roundRectangle(0, 0, 0, 0, 13, colorToNumber(Colors.Tan)),
            },
            mouseWheelScroller: {
                focus: false,
                speed: 0.5,
            },
        }).layout()

    return scrollablePanel;
}
