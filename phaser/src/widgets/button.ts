/**
 * Generic Button UI object. Taken from pvp-arena. Might be replaced with rex-ui
 */
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, rootObject } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';
import { Color, colorToNumber } from '../constants/colors';
import { BASE_SPRITE_SCALE } from "../utils/scaleImage";
import { ParchmentScroll } from "./parchment-scroll";



export class Button extends Phaser.GameObjects.Container {
    scroll: ParchmentScroll;
    text: BBCodeText;
    helpText: Phaser.GameObjects.Text | null;
    helpTween: Phaser.Tweens.Tween | null;

    constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, fontSize: number, onClick: () => void, helpText?: string) {
        super(scene, x, y);
        
        this.helpText = null;
        this.helpTween = null;

        this.scroll = new ParchmentScroll(scene, 0, 0, w, h, false);
        this.add(this.scroll);

        // this.text = scene.add.text(0, 0, text, fontStyle(fontSize, { wordWrap: { width: w - 8 } })).setOrigin(0.5, 0.65)
        // @ts-expect-error
        this.text = scene.add.rexBBCodeText(0, 0, text, fontStyle(fontSize, { color: Color.Brown, wordWrap: { width: w - 8 } }))
            .setOrigin(0.5, 0.65);

        this.add(this.text);

        this.setSize(w, h);
        this.setInteractive({
            useHandCursor: true,
            // hitArea: new Phaser.Geom.Rectangle(x, y, w, h),
            // hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        });
        if (helpText != null) {
            this.helpText = scene.add.text(0, 0, helpText, fontStyle(10))
                .setAlpha(0)
                .setVisible(false)
                .setOrigin(0.5, 0.5);
            this.add(this.helpText);
        }
        this.on('pointerup', () => {
            // TODO: this does NOT address https://github.com/PaimaStudios/midnight-game-2/issues/45
            //this.scroll.tween?.destroy();
            onClick();
        });
        this.on('pointerover', (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
            this.scroll.unfurl();
            this.scroll.setTint(colorToNumber(Color.Tan));
            this.text.setColor(Color.Black);
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
        });
        this.on('pointerout', () => {
            this.scroll.rollUp();
            this.scroll.setTint();
            this.text.setColor(Color.Brown);
            if (this.helpText != null) {
                this.helpText.visible = false;
                this.helpText.alpha = 0;
                this.helpTween?.destroy();
                this.helpTween = null;
            }
        });

        scene.add.existing(this);

        this.scroll.unfurl({
            onUpdate: (tween: Phaser.Tweens.Tween) => {
                this.text.alpha = tween.progress;
                this.text.scaleX = tween.progress;
            },
            duration: 500,
        });
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