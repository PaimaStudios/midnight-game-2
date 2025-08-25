import { EFFECT_TYPE } from "game2-contract";
import { fontStyle } from "../main";
import { BASE_SPRITE_SCALE } from "../utils/scaleImage";

export function effectTypeToIcon(effectType: EFFECT_TYPE): string {
    switch (effectType) {
        case EFFECT_TYPE.attack_fire:
            return 'fire';
        case EFFECT_TYPE.attack_ice:
            return 'ice';
        case EFFECT_TYPE.attack_phys:
            return 'physical';
        case EFFECT_TYPE.block:
            return 'block';
    }
}

export class BattleEffect extends Phaser.GameObjects.Container {
    constructor(scene: Phaser.Scene, x: number, y: number, effectType: EFFECT_TYPE, amount: number, onComplete: () => void) {
        super(scene, x, y);

        this.add(scene.add.text(12, 0, amount.toString(), fontStyle(12)));
        this.add(scene.add.sprite(-12, 0, effectTypeToIcon(effectType)).setScale(BASE_SPRITE_SCALE));

        this.setSize(48, 48);
        scene.tweens.add({
            targets: this,
            alpha: 0,
            delay: 250,
            duration: 1500,
            onComplete: () => {
                onComplete();
            },
        });
    }
}