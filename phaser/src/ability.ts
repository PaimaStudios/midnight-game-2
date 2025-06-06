import { Ability, Effect, EFFECT_TYPE } from "game2-contract";
import { fontStyle } from "./main";

function addEffectIcons(container: Phaser.GameObjects.Container, effect: Effect, xOffset: number, yOffset: number) {
    console.log(`addEffectIcons(${effect.effect_type}, ${effect.amount})`);
    if (effect.is_aoe) {
        container.add(container.scene.add.image(xOffset + 8, yOffset - 4, 'aoe'));
    }
    switch (effect.effect_type) {
        case EFFECT_TYPE.attack_fire:
            container.add(container.scene.add.image(xOffset + 8, yOffset, 'fire'));
            container.add(container.scene.add.text(xOffset - 2, yOffset - 3, effect.amount.toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.attack_ice:
            container.add(container.scene.add.image(xOffset + 8, yOffset, 'ice'));
            container.add(container.scene.add.text(xOffset - 2, yOffset - 3, effect.amount.toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.attack_phys:
            container.add(container.scene.add.image(xOffset + 8, yOffset, 'physical'));
            container.add(container.scene.add.text(xOffset - 2, yOffset - 3, effect.amount.toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.block:
            container.add(container.scene.add.image(xOffset + 8, yOffset, 'block'));
            container.add(container.scene.add.text(xOffset - 2, yOffset - 3, effect.amount.toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.generate:
            container.add(container.scene.add.image(xOffset + 8, yOffset, `energy_${effect.amount}`));
            break;
    }
}

export class AbilityWidget extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    ability: Ability;

    constructor(scene: Phaser.Scene, x: number, y: number, ability: Ability) {
        super(scene, x, y);
        this.setSize(48, 96);
        this.bg = scene.add.nineslice(0, 0, 'stone_button', undefined, 48, 96, 8, 8, 8, 8);
        this.ability = ability;

        this.add(this.bg);
        if (ability.effect.is_some) {
            addEffectIcons(this, ability.effect.value, -6, -32);
        }
        for (let i = 0; i < ability.on_energy.length; ++i) {
            if (ability.on_energy[i].is_some) {
                const energyY = 16 + 24 * i - 32;
                this.add(scene.add.image(-16, energyY, `energy_${i}`));
                this.add(scene.add.image(-5, energyY, 'arrow'));
                addEffectIcons(this, ability.on_energy[i].value, 7, energyY);
            }
        }

        scene.add.existing(this);
    }
}

function randomAbility(): Ability {
    const randomEffect = (enabled: boolean) => {
        return {
            is_some: enabled,
            value: { effect_type: Phaser.Math.Between(0, 3) as EFFECT_TYPE, amount: BigInt(Phaser.Math.Between(1, 4)), is_aoe: false},
        };
    };
    return {
        effect: randomEffect(true),
        on_energy: [randomEffect(false), randomEffect(false), randomEffect(false)],
    };
}