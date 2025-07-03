import Phaser from 'phaser';
import {Color, colorToNumber} from '../constants/colors';
import {fontStyle} from '../main';

export interface ProgressBarConfig {
    x: number;
    y: number;
    width: number;
    height: number;
    min?: number;
    max?: number;
    value?: number;
    barColor?: number;
    bgColor?: number;
    borderWidth?: number;
    borderColor?: Color;
    scene: Phaser.Scene;
    displayTotalCompleted?: boolean; // If true, render the total completed value in text as "{value}/{max}""
    labelText?: string; // Optional text to display in the label
    fontStyle?: Phaser.Types.GameObjects.Text.TextStyle;
}

export class ProgressBar extends Phaser.GameObjects.Container {
    protected bar: Phaser.GameObjects.Rectangle;
    protected bg: Phaser.GameObjects.Rectangle;
    protected min: number;
    protected max: number;
    protected _value: number;
    protected widthPx: number;
    protected heightPx: number;
    protected label: Phaser.GameObjects.Text;
    protected labelText: string = '';
    protected displayTotalCompleted: boolean = false;

    constructor(config: ProgressBarConfig) {
        super(config.scene, config.x, config.y);

        // Add border rectangle
        const border = config.scene.add.rectangle(
            0, 0, 
            config.width, config.height
        );
        const borderWidth = config.borderWidth ?? 8; // Default border width
        const borderColor = config.borderColor ?? Color.White;
        border.setStrokeStyle(borderWidth, colorToNumber(borderColor));
        border.setOrigin(0, 0);

        this.add(border);
        this.min = config.min ?? 0;
        this.max = config.max ?? 100;
        this._value = config.value ?? this.max;
        this.widthPx = config.width;
        this.heightPx = config.height;
        this.displayTotalCompleted = config.displayTotalCompleted ?? false;

        this.bg = config.scene.add.rectangle(0, 0, this.widthPx, this.heightPx, config.bgColor ?? colorToNumber(Color.DeepPlum));
        this.bg.setOrigin(0, 0);

        this.bar = config.scene.add.rectangle(0, 0, this.widthPx, this.heightPx, config.barColor ?? colorToNumber(Color.Turquoise));
        this.bar.setOrigin(0, 0);

        this.add(this.bg);
        this.add(this.bar);

        // Display total completed text if enabled
        this.label = config.scene.add.text(
            this.widthPx / 2,
            this.heightPx / 2 - 4,
            `${this._value} / ${this.max}`,
            config.fontStyle ?? fontStyle(10),
        ).setOrigin(0.5, 0.5);
        this.add(this.label);

        config.scene.add.existing(this);

        this.setValue(this._value);
    }

    setValue(value: number) {
        const newValue = Phaser.Math.Clamp(value, this.min, this.max);
        const newPercent = (newValue - this.min) / (this.max - this.min);
        this._value = newValue;

        // Animate the bar width
        this.scene.tweens.add({
            targets: this.bar,
            width: this.widthPx * newPercent,
            duration: 250,
            ease: 'Cubic.Out',
        });

        if (this.shouldDisplayLabel()) {
            this.label.setVisible(true);
            if (this.labelText) {
                this.setLabel(this.labelText);
            } else if (this.displayTotalCompleted) {
                this.setLabel(`${this._value} / ${this.max}`);
            }
        } else {
            this.label.setVisible(false);
        }
    }

    setLabel(label: string) {
        this.label.setText(label);
        this.label.setVisible(true);
    }

    private shouldDisplayLabel(): boolean {
        return !!(this.labelText || this.displayTotalCompleted);
    }

    get value() {
        return this._value;
    }
}

export class HealthBar extends ProgressBar {
    constructor(config: ProgressBarConfig) {
        super({
            ...config,
            barColor: config.barColor ?? colorToNumber(Color.Red),
            bgColor: config.bgColor ?? colorToNumber(Color.Licorice),
        });
    }
}