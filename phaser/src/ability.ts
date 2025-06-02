import { Ability, EFFECT_TYPE } from "game2-contract";
import { fontStyle } from "./main";

export class AbilityWidget extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    ability: Ability;

    constructor(scene: Phaser.Scene, x: number, y: number, ability: Ability) {
        super(scene, x, y);
        this.setSize(48, 48);
        this.bg = scene.add.nineslice(0, 0, 'stone_button', undefined, 48, 48, 8, 8, 8, 8);
        this.ability = ability;

        this.add(this.bg);
        if (ability.effect.is_some) {
            switch (ability.effect.value.effect_type) {
                case EFFECT_TYPE.attack_fire:
                    this.add(scene.add.image(0, 0, 'fire'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.attack_ice:
                    this.add(scene.add.image(0, 0, 'ice'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.attack_phys:
                    this.add(scene.add.image(0, 0, 'physical'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.block:
                    this.add(scene.add.image(0, 0, 'block'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
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