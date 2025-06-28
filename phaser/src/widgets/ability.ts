/**
 * All frontend functionality related to Abilities (outside of battle?)
 */
import { Ability, Effect, EFFECT_TYPE } from "game2-contract";
import { Button } from "./button";
import { fontStyle } from "../main";
import addScaledImage from "../utils/addScaledImage";
import { Colors } from "../constants/colors";

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
    }
    uiComponents.forEach((comp) => container.add(comp));
    return uiComponents;
}

export function energyToHexColor(energyColor: number | undefined): Colors {
    switch (energyColor) {
        case 0:
            return Colors.Blue;
        case 1:
            return Colors.Green;
        case 2:
            return Colors.Violet;
    }
    return Colors.Black;
}

export class AbilityWidget extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    ability: Ability;
    baseEffectUI: Phaser.GameObjects.GameObject[];
    energyEffectUI: Phaser.GameObjects.GameObject[][];

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        ability: Ability,
     ) {
        super(scene, x, y);
        this.setSize(96, 150);
        this.bg = scene.add.nineslice(0, 0, 'stone_button', undefined, 96, 150, 8, 8, 8, 8);
        if (ability.generate_color.is_some) {
            // TODO: replace with colors.colorToNumber once https://github.com/PaimaStudios/midnight-game-2/pull/25 is merged
            this.bg.setTint(Phaser.Display.Color.HexStringToColor(energyToHexColor(Number(ability.generate_color.value))).color);
        }
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

// Ability Widget with optional button
export class AbilityWidgetContainer extends Phaser.GameObjects.Container {
    abilityWidget: AbilityWidget;
    button: Button | undefined;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        abilityWidget: AbilityWidget,
        button: Button | undefined = undefined,
    ) {
        super(scene, x, y)
        this.setSize(96, 150);
        this.abilityWidget = abilityWidget;
        abilityWidget.setPosition(0, 0);
        this.add(abilityWidget);
        if (button != undefined) {
            this.button = button;
            // Position the button below the abilityWidget, adjust y as needed
            button.setPosition(0, abilityWidget.height ? abilityWidget.height / 2 + (button.height ? button.height / 2 + 8 : 32) : 96);
            this.add(button);
        }
        scene.add.existing(this);
    }
}
