/**
 * Generic Button UI object. Taken from pvp-arena. Might be replaced with rex-ui
 */
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, rootObject } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';
import { BG_TYPE, makeWidgetBackground, WidgetBackground } from "./widget-background";


export class Button extends Phaser.GameObjects.Container {
    bg: WidgetBackground & Phaser.GameObjects.GameObject;
    enabled: boolean = true;
    text: BBCodeText;
    helpText: Phaser.GameObjects.Text | null;
    helpTween: Phaser.Tweens.Tween | null;
    soundOnClick: boolean;

    constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, fontSize: number, onClick: () => void, helpText?: string, soundOnClick = true) {
        super(scene, x, y);
        
        this.helpText = null;
        this.helpTween = null;
        this.soundOnClick = soundOnClick;

        this.bg = makeWidgetBackground(scene, 0, 0, w, h, BG_TYPE.Stone);
        this.add(this.bg);

        // this.text = scene.add.text(0, 0, text, fontStyle(fontSize, { wordWrap: { width: w - 8 } })).setOrigin(0.5, 0.65)
        // the -3 is to have it be centered in the top surface of the stone tablet as there is a side texture in the bottom of the sprite
        // @ts-expect-error
        this.text = scene.add.rexBBCodeText(0, -3, text, fontStyle(fontSize, { color: this.bg.textColor, wordWrap: { width: w - 8 } }))
            .setOrigin(0.5, 0.65);

        this.add(this.text);

        this.setSize(w, h);
        this.setInteractive();
        if (helpText != null) {
            this.helpText = scene.add.text(0, 0, helpText, fontStyle(10))
                .setAlpha(0)
                .setVisible(false)
                .setOrigin(0.5, 0.5);
            this.add(this.helpText);
        }
        this.on('pointerup', () => {
            if (this.enabled) {
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'default';
                if (this.soundOnClick) {
                    this.scene.sound.play('button-press-1', { volume: 0.7 });
                }   
                onClick();
            }
        });
        this.on('pointerover', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
            if (this.enabled) {
                this.bg.onMouseOver();
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'pointer';
                this.text.setColor(this.bg.textColorOver);
                if (this.helpText != null) {
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
            }
        });
        this.on('pointerout', () => {
            if (this.enabled) {
                this.bg.onMouseOff();
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'default';
                this.text.setColor(this.bg.textColor);
                if (this.helpText != null) {
                    this.helpText.visible = false;
                    this.helpText.alpha = 0;
                    this.helpTween?.destroy();
                    this.helpTween = null;
                }
            }
        });

        scene.add.existing(this);

        this.bg.tweenIn({
            onUpdate: (tween: Phaser.Tweens.Tween) => {
                this.text.alpha = tween.progress;
                this.text.scaleX = tween.progress;
            },
            duration: 500,
        });
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        this.bg.setEnabled(enabled);
        return this;
    }

    preUpdate() {
        if (this.helpText != null && this.helpText.visible) {
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