import {Colors, colorToNumber} from '../constants/colors';
import 'phaser';
import RexUIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';

declare module 'phaser' {
  interface Scene {
    rexUI: RexUIPlugin;
  }
}

class Demo extends Phaser.Scene {
    constructor() {
        super({
            key: 'examples'
        })
    }

    preload() { 
        this.load.scenePlugin({
            key: 'rexuiplugin',
            url: 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexuiplugin.min.js',
            sceneKey: 'rexUI'
        });
    }
    create() {
        const panel = createScrollablePanel(this, 400, 300, 600);
        const panelElement = panel.getElement('panel');
        
        // Add new child
        if (panelElement != undefined) {
            panelElement
                .add(
                    createPanelElement(this,
                        'GGGG',
                        this.rexUI.add.roundRectangle(0, 0, 200, 400, 20, colorToNumber(Colors.Pink))
                    )
                )
            panel.layout()     
        }
    }

    update() { }
}

export const createScrollablePanel = function (
    scene: Phaser.Scene,
    x: number, y: number, width: number,

): RexUIPlugin.ScrollablePanel {
    const panel = scene.rexUI.add.sizer({
        orientation: 'x',
        space: { item: 50, top: 20, bottom: 20 }
    })

    const contentList = ['AAAA', 'BBBB', 'CCCC', 'DDDDD', 'EEEEE', 'FFFFF'];
    for (var i = 0, cnt = contentList.length; i < cnt; i++) {
        panel
            .add(
                createPanelElement(scene,
                    contentList[i],
                    scene.rexUI.add.roundRectangle(0, 0, 200, 400, 20, colorToNumber(Colors.Pink)))
            )
    }

    const scrollablePanel = scene.rexUI.add.scrollablePanel({
            x: 400, y: 300,
            width: 600,

            scrollMode: 1,

            panel: {
                child: panel,
            },

            slider: {
                track: scene.rexUI.add.roundRectangle(0, 0, 20, 10, 10, colorToNumber(Colors.DeepPlum)),
                thumb: scene.rexUI.add.roundRectangle(0, 0, 0, 0, 13, colorToNumber(Colors.Tan)),
            },
        })
            .layout()

    return scrollablePanel;
}

export const createPanelElement = function (scene: Phaser.Scene, content: string, background: any) {
    return scene.rexUI.add.label({
        orientation: 'y',
        width: background.displayWidth,
        height: background.displayHeight,

        background: background,
        text: scene.add.text(0, 0, content),

        align: 'center'
    })
}