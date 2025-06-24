/**
 * All frontend functionality related to Abilities (outside of battle?)
 */
import { Ability, Effect, EFFECT_TYPE } from "game2-contract";
import { fontStyle } from "./main";
import addScaledImage from "./utils/addScaledImage";

/// Adjusts contract-level damage numbers to a base/average amount
export function contractDamageToBaseUI(amount: number | bigint): number {
    return Number(amount) * 5;
}

function addEffectIcons(container: Phaser.GameObjects.Container, effect: Effect, xOffset: number, yOffset: number): Phaser.GameObjects.GameObject[] {
    console.log(`addEffectIcons(${effect.effect_type}, ${effect.amount})`);
    let uiComponents = [];
    if (effect.is_aoe) {
        uiComponents.push(addScaledImage(container.scene, xOffset + 24, yOffset - 6, 'aoe'));
    }
    switch (effect.effect_type) {
        case EFFECT_TYPE.attack_fire:
            uiComponents.push(addScaledImage(container.scene, xOffset + 24, yOffset, 'fire'));
            uiComponents.push(container.scene.add.text(xOffset - 4, yOffset - 6, contractDamageToBaseUI(effect.amount).toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.attack_ice:
            uiComponents.push(addScaledImage(container.scene, xOffset + 24, yOffset, 'ice'));
            uiComponents.push(container.scene.add.text(xOffset - 4, yOffset - 6, contractDamageToBaseUI(effect.amount).toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.attack_phys:
            uiComponents.push(addScaledImage(container.scene, xOffset + 24, yOffset, 'physical'));
            uiComponents.push(container.scene.add.text(xOffset - 4, yOffset - 6, contractDamageToBaseUI(effect.amount).toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.block:
            uiComponents.push(addScaledImage(container.scene, xOffset + 24, yOffset, 'block'));
            uiComponents.push(container.scene.add.text(xOffset - 4, yOffset - 6, effect.amount.toString(), fontStyle(8)).setOrigin(0.5, 0.5));
            break;
        case EFFECT_TYPE.generate:
            uiComponents.push(addScaledImage(container.scene, xOffset + 24, yOffset, `energy_${effect.amount}`));
            break;
    }
    uiComponents.forEach((comp) => container.add(comp));
    return uiComponents;
}

export class AbilityWidget extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    ability: Ability;
    baseEffectUI: Phaser.GameObjects.GameObject[];
    energyEffectUI: Phaser.GameObjects.GameObject[][];

    constructor(scene: Phaser.Scene, x: number, y: number, ability: Ability) {
        super(scene, x, y);
        this.setSize(96, 150);
        this.bg = scene.add.nineslice(0, 0, 'stone_button', undefined, 96, 150, 8, 8, 8, 8);
        this.ability = ability;
        this.baseEffectUI = [];
        this.energyEffectUI = [[], [], []];

        this.add(this.bg);
        if (ability.effect.is_some) {
            this.baseEffectUI = addEffectIcons(this, ability.effect.value, -6, -32);
        }
        for (let i = 0; i < ability.on_energy.length; ++i) {
            if (ability.on_energy[i].is_some) {
                const energyY = 24 * i;
                this.add(addScaledImage(scene, -32, energyY, `energy_${i}`));
                this.add(addScaledImage(scene, -16, energyY, 'arrow'));
                this.energyEffectUI[i] = addEffectIcons(this, ability.on_energy[i].value, 7, energyY);
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