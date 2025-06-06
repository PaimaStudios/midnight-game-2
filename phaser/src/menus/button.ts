/**
 * Generic Button UI object. Taken from pvp-arena. Might be replaced with rex-ui
 */
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, rootObject } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';

export class Button extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    bgOver: Phaser.GameObjects.NineSlice;
    text: BBCodeText;
    helpText: Phaser.GameObjects.Text | undefined;
    helpTween: Phaser.Tweens.Tween | undefined;

    constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, fontSize: number, onClick: () => void, helpText?: string) {
        super(scene, x, y);
        this.bg = scene.add.nineslice(0, 0, 'stone_button', undefined, w, h, 8, 8, 8, 8);
        this.add(this.bg);
        this.bgOver = scene.add.nineslice(0, 0, 'stone_button_over', undefined, w + 4, h + 4, 8, 8, 8, 8);
        this.bgOver.visible = false;
        this.add(this.bgOver);
        // this.text = scene.add.text(0, 0, text, fontStyle(fontSize, { wordWrap: { width: w - 8 } })).setOrigin(0.5, 0.65)
        // @ts-expect-error
        this.text = scene.add.rexBBCodeText(0, 0, text, fontStyle(fontSize, { wordWrap: { width: w - 8 } })).setOrigin(0.5, 0.65);

        this.add(this.text);

        this.setSize(w, h);
        this.setInteractive({
            useHandCursor: true,
            // hitArea: new Phaser.Geom.Rectangle(x, y, w, h),
            // hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        });
        if (helpText != undefined) {
            this.helpText = scene.add.text(0, 0, helpText, fontStyle(10))
                .setAlpha(0)
                .setVisible(false)
                .setOrigin(0.5, 0.5);
            this.add(this.helpText);
        }
        this.on('pointerup', () => {
            onClick();
        });
        this.on('pointerover', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
            this.bg.visible = false;
            this.bgOver.visible = true;
            this.text.setColor('#bbbbb3');
            if (this.helpText != undefined) {
                if (this.helpText.visible == false) {
                    this.helpText.visible = true;
                    this.helpTween = this.scene.tweens.add({
                        targets: this.helpText,
                        alpha: 1,
                        delay: 800,
                        duration: 800,
                    });
                }
            }
        });
        this.on('pointerout', () => {
            this.bg.visible = true;
            this.bgOver.visible = false;
            this.text.setColor('#f5f5ed');
            if (this.helpText != undefined) {
                this.helpText.visible = false;
                this.helpText.alpha = 0;
                this.helpTween?.destroy();
                this.helpTween = undefined;
            }
        });

        scene.add.existing(this);
    }

    preUpdate() {
        if (this.helpText != undefined && this.helpText.visible) {
            const parent = rootObject(this);
            const mx = this.scene.input.activePointer.worldX;
            const my = this.scene.input.activePointer.worldY;
            this.helpText.setPosition(
                Math.min(GAME_WIDTH - this.helpText.width / 2, Math.max(mx, 16 + this.helpText.width / 2)) - parent.x,
                Math.min(GAME_HEIGHT - this.helpText.height / 2, my - 32 > this.helpText.height / 2 ? my - 32 : my + 32) - parent.y,
            );
        }
    }
}