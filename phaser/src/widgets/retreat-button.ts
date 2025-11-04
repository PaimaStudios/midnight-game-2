/**
 * RetreatButton - A button that peeks from the corner and expands on hover
 */
import { fontStyle } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';
import { BG_TYPE, makeWidgetBackground, WidgetBackground } from "./widget-background";

export class RetreatButton extends Phaser.GameObjects.Container {
    bg: WidgetBackground & Phaser.GameObjects.GameObject;
    enabled: boolean = true;
    text: BBCodeText;
    soundOnClick: boolean;
    private isExpanded: boolean = false;
    private expandTween: Phaser.Tweens.Tween | null = null;

    private readonly buttonWidth = 120;
    private readonly buttonHeight = 40;
    private readonly peekAmount = 20; // How much of the button is visible when collapsed

    constructor(scene: Phaser.Scene, x: number, y: number, onClick: () => void, soundOnClick = true) {
        super(scene, x, y);

        this.soundOnClick = soundOnClick;

        this.bg = makeWidgetBackground(scene, 0, 0, this.buttonWidth, this.buttonHeight, BG_TYPE.Stone);
        this.add(this.bg);

        // @ts-expect-error
        this.text = scene.add.rexBBCodeText(0, -3, 'Retreat', fontStyle(10, { color: this.bg.textColor, wordWrap: { width: this.buttonWidth - 8 } }))
            .setOrigin(0.5, 0.65);

        this.add(this.text);

        this.setSize(this.buttonWidth, this.buttonHeight);
        this.setInteractive();

        // Position initially - mostly off screen, peeking from corner
        this.setPosition(x + this.buttonWidth - this.peekAmount, y + this.buttonHeight - this.peekAmount);

        this.on('pointerdown', () => {
            if (this.enabled) {
                if (this.soundOnClick) {
                    this.scene.sound.play('button-press-1', { volume: 0.5 });
                }
            }
        });
        this.on('pointerup', () => {
            if (this.enabled) {
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'default';
                onClick();
            }
        });
        this.on('pointerover', () => {
            if (this.enabled) {
                this.expandButton();
                this.bg.onMouseOver();
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'pointer';
                this.text.setColor(this.bg.textColorOver);
            }
        });
        this.on('pointerout', () => {
            if (this.enabled) {
                this.collapseButton();
                this.bg.onMouseOff();
                (this.scene.game.canvas as HTMLCanvasElement).style.cursor = 'default';
                this.text.setColor(this.bg.textColor);
            }
        });

        scene.add.existing(this);
    }

    private expandButton() {
        if (this.isExpanded) return;

        this.isExpanded = true;

        // Cancel any existing tween
        if (this.expandTween) {
            this.expandTween.stop();
        }

        // Get the target position (fully visible)
        const targetX = this.x - (this.buttonWidth - this.peekAmount);
        const targetY = this.y - (this.buttonHeight - this.peekAmount);

        this.expandTween = this.scene.tweens.add({
            targets: this,
            x: targetX,
            y: targetY,
            duration: 200,
            ease: 'Back.easeOut'
        });
    }

    private collapseButton() {
        if (!this.isExpanded) return;

        this.isExpanded = false;

        // Cancel any existing tween
        if (this.expandTween) {
            this.expandTween.stop();
        }

        // Get the target position (peeking)
        const targetX = this.x + (this.buttonWidth - this.peekAmount);
        const targetY = this.y + (this.buttonHeight - this.peekAmount);

        this.expandTween = this.scene.tweens.add({
            targets: this,
            x: targetX,
            y: targetY,
            duration: 200,
            ease: 'Back.easeIn'
        });
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        this.bg.setEnabled(enabled);
        return this;
    }

    destroy() {
        if (this.expandTween) {
            this.expandTween.stop();
        }
        super.destroy();
    }
}
