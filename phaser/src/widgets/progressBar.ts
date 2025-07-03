import Phaser from 'phaser';
import {Color, colorToNumber} from '../constants/colors';

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
}

export class ProgressBar extends Phaser.GameObjects.Container {
    protected bar: Phaser.GameObjects.Rectangle;
    protected bg: Phaser.GameObjects.Rectangle;
    protected min: number;
    protected max: number;
    protected _value: number;
    protected widthPx: number;
    protected heightPx: number;

    constructor(config: ProgressBarConfig) {
        super(config.scene, config.x, config.y);

        // Add border rectangle
        const border = config.scene.add.rectangle(
            0, 0, 
            config.width, config.height
        );
        const borderWidth = config.borderWidth ?? 2; // Default border width
        const borderColor = config.borderColor ?? Color.White;
        border.setStrokeStyle(borderWidth, colorToNumber(borderColor)); // 3px white border
        border.setOrigin(0, 0);

        this.add(border);
        this.min = config.min ?? 0;
        this.max = config.max ?? 100;
        this._value = config.value ?? this.max;
        this.widthPx = config.width;
        this.heightPx = config.height;

        this.bg = config.scene.add.rectangle(0, 0, this.widthPx, this.heightPx, config.bgColor ?? colorToNumber(Color.DeepPlum));
        this.bg.setOrigin(0, 0);

        this.bar = config.scene.add.rectangle(0, 0, this.widthPx, this.heightPx, config.barColor ?? colorToNumber(Color.Turquoise));
        this.bar.setOrigin(0, 0);

        this.add(this.bg);
        this.add(this.bar);

        config.scene.add.existing(this);

        this.setValue(this._value);
    }

    setValue(value: number) {
        this._value = Phaser.Math.Clamp(value, this.min, this.max);
        const percent = (this._value - this.min) / (this.max - this.min);
        this.bar.width = this.widthPx * percent;
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