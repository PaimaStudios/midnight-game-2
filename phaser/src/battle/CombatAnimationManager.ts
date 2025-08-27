import { EFFECT_TYPE, Ability, BattleConfig } from "game2-contract";
import { AbilityWidget, energyTypeToColor, SpiritWidget, effectTypeFileAffix } from "../widgets/ability";
import { SPIRIT_ANIMATION_DURATIONS, chargeAnimKey, orbAuraIdleKey, spiritAuraIdleKey } from "../animations/spirit";
import { addScaledImage, scale } from "../utils/scaleImage";
import { colorToNumber } from "../constants/colors";
import { BattleLayout } from "./BattleLayout";
import { CombatCallbacks } from "../battle/logic";
import { logger } from "../main";
import { BattleEffect } from "../widgets/BattleEffect";
import { Actor } from "./EnemyManager";

export class CombatAnimationManager {
    private scene: Phaser.Scene;
    private layout: BattleLayout;
    private spirits: SpiritWidget[];
    private abilityIcons: AbilityWidget[];
    private enemies: Actor[];
    private player: Actor;
    private battle: BattleConfig

    constructor(
        scene: Phaser.Scene,
        layout: BattleLayout,
        spirits: SpiritWidget[],
        abilityIcons: AbilityWidget[],
        enemies: Actor[],
        player: Actor,
        battle: BattleConfig
    ) {
        this.scene = scene;
        this.layout = layout;
        this.spirits = spirits;
        this.abilityIcons = abilityIcons;
        this.enemies = enemies;
        this.player = player;
        this.battle = battle;
    }

    public updateReferences(
        spirits: SpiritWidget[],
        abilityIcons: AbilityWidget[],
        enemies: Actor[],
        player: Actor
    ) {
        this.spirits = spirits;
        this.abilityIcons = abilityIcons;
        this.enemies = enemies;
        this.player = player;
    }

    public createCombatCallbacks(): CombatCallbacks {
        return {
            onEnemyBlock: (enemy: number, amount: number) => new Promise((resolve) => {
                logger.combat.debug(`enemy [${enemy}] blocked for ${amount} | ${this.enemies.length}`);
                this.enemies[enemy].addBlock(amount);
                
                // Show block effect on enemy
                new BattleEffect(
                    this.scene, 
                    this.layout.enemyX(this.battle, enemy), 
                    this.layout.enemyY() - 20, 
                    EFFECT_TYPE.block, 
                    amount, 
                    () => resolve()
                );
                this.scene.add.existing(this.scene.children.list[this.scene.children.list.length - 1]);
            }),

            onEnemyAttack: (enemy: number, amount: number) => new Promise((resolve) => {
                this.enemies[enemy].performAttackAnimation().then(() => {
                    const fist = addScaledImage(this.scene, this.layout.enemyX(this.battle, enemy), this.layout.enemyY(), 'physical');
                    this.scene.tweens.add({
                        targets: fist,
                        x: this.layout.playerX(),
                        y: this.layout.playerY(),
                        duration: 100,
                        onComplete: () => {
                            fist.destroy();
                            this.player?.damage(amount);
                            
                            // Show damage effect on player
                            new BattleEffect(
                                this.scene, 
                                this.layout.playerX(), 
                                this.layout.playerY() - 20, 
                                EFFECT_TYPE.attack_phys, 
                                amount, 
                                () => resolve()
                            );
                            this.scene.add.existing(this.scene.children.list[this.scene.children.list.length - 1]);
                        }
                    });
                });
            }),

            onPlayerEffect: (source: number, targets: number[], effectType: EFFECT_TYPE, amounts: number[]) => new Promise((resolve) => {
                let damageType = undefined;
                switch (effectType) {
                    case EFFECT_TYPE.attack_fire:
                        damageType = 'fire';
                        break;
                    case EFFECT_TYPE.attack_ice:
                        damageType = 'ice';
                        break;
                    case EFFECT_TYPE.attack_phys:
                        damageType = 'physical';
                        break;
                    case EFFECT_TYPE.block:
                        this.player?.addBlock(amounts[0]);
                        // Show block effect
                        new BattleEffect(
                            this.scene, 
                            this.layout.playerX(), 
                            this.layout.playerY() - 20, 
                            effectType, 
                            amounts[0], 
                            () => {}
                        );
                        this.scene.add.existing(this.scene.children.list[this.scene.children.list.length - 1]);
                        break;
                }
                if (damageType != undefined) {
                    for (let i = 0; i < targets.length; ++i) {
                        const target = targets[i];
                        const amount = amounts[i];
                        const bullet = addScaledImage(this.scene, this.layout.spiritX(source), this.layout.spiritY(), damageType);
                        this.scene.tweens.add({
                            targets: bullet,
                            x: this.layout.enemyX(this.battle, target),
                            y: this.layout.enemyY(),
                            duration: 150,
                            onComplete: () => {
                                this.enemies[target].damage(amount);
                                this.enemies[target].takeDamageAnimation();
                                bullet.destroy();
                                
                                // Show damage number effect
                                new BattleEffect(
                                    this.scene, 
                                    this.layout.enemyX(this.battle, target), 
                                    this.layout.enemyY() - 20, 
                                    effectType, 
                                    amount, 
                                    () => resolve()
                                );
                                this.scene.add.existing(this.scene.children.list[this.scene.children.list.length - 1]);
                            },
                        });
                    }
                } else {
                    // Resolve immediately for block effects
                    resolve();
                }
            }),

            onDrawAbilities: (abilities: Ability[]) => new Promise((resolve) => {
                // Only create ability cards if they don't already exist (from targeting phase)
                if (this.abilityIcons.length === 0) {
                    this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this.scene, (this.scene.game.config.width as number) * (i + 0.5) / abilities.length, this.layout.abilityIdleY(), ability).setAlpha(0));
                } else {
                    // Ability cards already exist from targeting, just ensure they're positioned correctly and visible
                    this.abilityIcons.forEach((abilityIcon, i) => {
                        abilityIcon.x = (this.scene.game.config.width as number) * (i + 0.5) / abilities.length;
                        abilityIcon.y = this.layout.abilityIdleY();
                        abilityIcon.setAlpha(1);
                    });
                }
                
                // Only create spirits if they don't already exist (from targeting phase)
                if (this.spirits.length === 0) {
                    this.spirits = abilities.map((ability, i) => new SpiritWidget(this.scene, (this.scene.game.config.width as number) * (i + 0.5) / abilities.length, this.layout.spiritY(), ability).setAlpha(0));
                } else {
                    // Spirits already exist from targeting, just ensure they're positioned correctly and visible
                    this.spirits.forEach((spirit, i) => {
                        spirit.x = (this.scene.game.config.width as number) * (i + 0.5) / abilities.length;
                        spirit.y = this.layout.spiritY();
                        spirit.setAlpha(1);
                    });
                }
                
                this.scene.tweens.add({
                    targets: [...this.abilityIcons, ...this.spirits],
                    alpha: 1,
                    duration: 500,
                    onComplete: () => {
                        resolve();
                    },
                });
            }),

            onUseAbility: (abilityIndex: number, energy?: number) => new Promise((resolve) => {
                const abilityIcon = this.abilityIcons[abilityIndex];
                const spirit = this.spirits[abilityIndex];
                
                if (spirit && spirit.spirit) {
                    const spiritType = effectTypeFileAffix(spirit.ability.effect.value.effect_type);
                    const attackAnimKey = `spirit-${spiritType}-attack`;
                    const idleAnimKey = `spirit-${spiritType}`;
                    if (this.scene.anims.exists(attackAnimKey)) {
                        spirit.spirit.anims.play(attackAnimKey);
                        this.scene.time.delayedCall(1000, () => {
                            if (spirit.spirit && this.scene.anims.exists(idleAnimKey)) {
                                spirit.spirit.anims.play(idleAnimKey);
                            }
                        });
                    }
                }
                
                this.scene.tweens.add({
                    targets: [abilityIcon],
                    y: this.layout.abilityInUseY(),
                    delay: 150,
                    duration: 250,
                    onComplete: () => {
                        const uiElement = energy != undefined ? abilityIcon.energyEffectUI[energy] : abilityIcon.baseEffectUI;
                        this.scene.tweens.add({
                            targets: energy != undefined ? [uiElement, spirit.orbs[energy]?.aura] : [uiElement],
                            scale: 1.5,
                            yoyo: true,
                            delay: 100,
                            duration: 200,
                            onComplete: () => resolve(),
                        });
                    },
                });
                if (energy != undefined) {
                    const orb = this.spirits[abilityIndex].orbs[energy]!;
                    this.scene.tweens.add({
                        targets: orb,
                        scale: 1,
                        duration: 250,
                    });
                }
            }),

            afterUseAbility: (abilityIndex: number) => new Promise((resolve) => {
                this.scene.tweens.add({
                    targets: [this.abilityIcons[abilityIndex]],
                    y: this.layout.abilityIdleY(),
                    delay: 150,
                    duration: 250,
                    onComplete: () => {
                        resolve();
                    },
                });
            }),

            onEnergyTrigger: (source: number, color: number) => new Promise((resolve) => {
                const aura = this.spirits[source].aura!;
                const targets = [0, 1, 2]
                    .filter((a) => a != source && this.spirits[a].orbs[color] != undefined);
                if (targets.length > 0) {
                    logger.animation.debug(`[ENERGY-UI] charge!`);
                    aura.anims.play(chargeAnimKey);
                    this.scene.tweens.add({
                        targets: this.scene,
                        delay: 250,
                        duration: SPIRIT_ANIMATION_DURATIONS.charge,
                        completeDelay: 350,
                        onComplete: () => {
                            logger.animation.debug(`[ENERGY-UI] ...charged...`);
                            aura.anims.play(spiritAuraIdleKey);
                            targets.forEach((a) => {
                                logger.animation.debug(`[ENERGY-UI] CREATING BULLET ${source} -> ${a}`);
                                const target = this.spirits[a];
                                const bullet = scale(this.scene.add.sprite(this.layout.spiritX(source), this.layout.spiritY(), 'orb-aura'))
                                    .setTint(colorToNumber(energyTypeToColor(color)));
                                bullet.anims.play(orbAuraIdleKey);
                                this.scene.tweens.add({
                                    targets: bullet,
                                    delay: 100,
                                    duration: 500,
                                    x: target.x,
                                    onUpdate: (tween) => {
                                        bullet.y = this.layout.spiritY() + 32 * Math.sin((tween.progress + (source - a)) * Math.PI);
                                    },
                                    onComplete: () => {
                                        logger.animation.debug(`[ENERGY-UI] DESTROYED BULLET ${source} -> ${a}`);
                                        bullet.destroy();
                                        resolve();
                                        const orb = target.orbs[color]!;
                                        this.scene.tweens.add({
                                            targets: orb,
                                            scale: 1.5,
                                            duration: 500,
                                        });
                                    },
                                });
                            });
                        },
                    });
                } else {
                    resolve();
                }
            }),

            onEndOfRound: () => new Promise((resolve) => {
                this.enemies.forEach((enemy) => enemy.endOfRound());
                this.player?.endOfRound();
                resolve();
            }),
        };
    }
}