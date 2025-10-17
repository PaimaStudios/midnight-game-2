import { fontStyle, logger } from "../main";
import { BASE_SPRITE_SCALE } from "../utils/scaleImage";

export enum BattleEffectType {
    ATTTACK_FIRE = 0,
    ATTACK_ICE = 1,
    ATTACK_PHYS = 2,
    BLOCK = 3,
    HEAL = 4,
}

export function effectTypeToIcon(effectType: BattleEffectType): string {
    switch (effectType) {
        case BattleEffectType.ATTTACK_FIRE:
            return 'fire';
        case BattleEffectType.ATTACK_ICE:
            return 'ice';
        case BattleEffectType.ATTACK_PHYS:
            return 'physical';
        case BattleEffectType.BLOCK:
            return 'block';
        case BattleEffectType.HEAL:
            return 'heal';
    }
}

export class BattleEffect extends Phaser.GameObjects.Container {
    constructor(scene: Phaser.Scene, x: number, y: number, effectType: BattleEffectType, amount: number, onComplete: () => void) {
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
                logger.animation.debug(`BattleEffect.onComplete(): ${effectType} | ${amount} at (${x}, ${y})`);
                onComplete();
            },
        });
    }
}