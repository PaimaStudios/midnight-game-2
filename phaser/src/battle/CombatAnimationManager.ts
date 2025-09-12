import { EFFECT_TYPE, Ability, BattleConfig } from "game2-contract";
import { AbilityWidget, energyTypeToColor, SpiritWidget, effectTypeFileAffix } from "../widgets/ability";
import { SPIRIT_ANIMATION_DURATIONS, chargeAnimKey, orbAuraIdleKey, spiritAuraIdleKey } from "../animations/spirit";
import { addScaledImage, scale } from "../utils/scaleImage";
import { colorToNumber, Color } from "../constants/colors";
import { BattleLayout } from "./BattleLayout";
import { CombatCallbacks } from "../battle/logic";
import { logger, fontStyle } from "../main";
import { BattleEffect } from "../widgets/BattleEffect";
import { Actor } from "./EnemyManager";
import { RainbowText } from "../widgets/rainbow-text";

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

    private shakeScreen(intensity: number = 5, duration: number = 500) {
        // Get all game objects except background (assuming background is first child or has specific name)
        const objectsToShake = this.scene.children.list.filter((_, index) => {
            // Skip the first object(should be background)
            return index > 0;
        }).filter(child => 'x' in child && 'y' in child) as Array<Phaser.GameObjects.GameObject & { x: number, y: number }>;
        
        if (objectsToShake.length === 0) return;
        
        // Store original positions
        const originalPositions = objectsToShake.map(obj => ({ x: obj.x, y: obj.y }));
        
        // Create shake effect with easing out
        const shakeData = { intensity: intensity, progress: 0 };
        this.scene.tweens.add({
            targets: shakeData,
            intensity: 0,
            progress: 1,
            duration: duration,
            ease: 'Power2.easeOut',
            onUpdate: () => {
                objectsToShake.forEach((obj, i) => {
                    const original = originalPositions[i];
                    const currentIntensity = shakeData.intensity;
                    obj.x = original.x + Phaser.Math.Between(-currentIntensity, currentIntensity);
                    obj.y = original.y + Phaser.Math.Between(-currentIntensity, currentIntensity);
                });
            },
            onComplete: () => {
                // Reset all objects to original positions
                objectsToShake.forEach((obj, i) => {
                    const original = originalPositions[i];
                    obj.x = original.x;
                    obj.y = original.y;
                });
            }
        });
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

    private showEffectivenessText(x: number, y: number, baseAmount: number, actualAmount: number) {
        // Calculate effectiveness based on damage multiplier
        // damage * (4 - def) where def: 4=immune, 3=weak, 2=neutral, 1=effective, 0=very effective
        const multiplier = actualAmount / baseAmount;
        
        let text = "";
        let color = Color.White;
        let useRainbow = false;
        
        if (multiplier === 0) {
            text = "IMMUNE";
            color = Color.Blue;
        } else if (multiplier === 1) {
            text = "WEAK";
            color = Color.Red;
        } else if (multiplier === 3) {
            text = "EFFECTIVE";
            color = Color.Green;
        } else if (multiplier === 4) {
            text = "SUPER\nEFFECTIVE";
            useRainbow = true;
        }

        // No special text for neutral defense attacks
        if (text) {
            const effectivenessText = useRainbow 
                ? new RainbowText(this.scene, x, y - 40, text, 6, fontStyle(16), true)
                : new Phaser.GameObjects.Text(this.scene, x, y - 40, text, {
                    ...fontStyle(16),
                    color: color,
                    align: 'center'
                }).setOrigin(0.5).setStroke(Color.Licorice, 10);
            
            this.scene.add.existing(effectivenessText);
            
            // Animate the text
            this.scene.tweens.add({
                targets: effectivenessText,
                alpha: 0,
                y: y - 80,
                duration: 2000,
                ease: 'Power2',
                onComplete: () => effectivenessText.destroy()
            });
        }
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
                            
                            // Shake screen when player is attacked
                            this.shakeScreen(4, 200);
                            
                            // Play neutral attack sound when player is hit
                            this.scene.sound.play('attack-neutral', { volume: 0.5 });
                            
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

            onPlayerEffect: (source: number, targets: number[], effectType: EFFECT_TYPE, amounts: number[], baseAmounts?: number[]) => new Promise((resolve) => {
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
                        const baseAmount = baseAmounts ? baseAmounts[i] : amount;
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
                                
                                // Show effectiveness text and shake for super effective
                                if (baseAmounts && baseAmount > 0) {
                                    const multiplier = amount / baseAmount;
                                    
                                    // Play appropriate sound and shake screen based on effectiveness
                                    let shakeIntensity = 0;
                                    let shakeDuration = 0;
                                    if (multiplier === 0) {
                                        this.scene.sound.play('attack-immune', { volume: 0.8 });
                                    } else if (multiplier === 1) {
                                        this.scene.sound.play('attack-weak', { volume: 0.8 });
                                    } else if (multiplier === 2) {
                                        this.scene.sound.play('attack-neutral', { volume: 0.8 });
                                        shakeIntensity = 2;
                                        shakeDuration = 100;
                                    } else if (multiplier === 3) {
                                        this.scene.sound.play('attack-effective', { volume: 1.0 });
                                        shakeIntensity = 3;
                                        shakeDuration = 300;
                                    } else if (multiplier === 4) {
                                        this.scene.sound.play('attack-supereffective', { volume: 1.0 });
                                        shakeIntensity = 5;
                                        shakeDuration = 400;
                                    }
                                    
                                    // Shake screen for stronger attacks
                                    if (shakeIntensity && shakeDuration) {
                                        this.shakeScreen(shakeIntensity, shakeDuration);
                                    }
                                    
                                    this.showEffectivenessText(
                                        this.layout.enemyX(this.battle, target),
                                        this.layout.enemyY(),
                                        baseAmount,
                                        amount
                                    );
                                }
                                
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
                    
                    // Play attack sound when spirit animation starts
                    if (spiritType === 'atk-phys') {
                        this.scene.sound.play('battle-phys-attack', { volume: 0.8 });
                    }
                    else if (spiritType === 'atk-ice') {
                        this.scene.sound.play('battle-ice-attack', { volume: 0.8 });
                    } 
                    else if (spiritType === 'atk-fire') {
                        this.scene.sound.play('battle-fire-attack', { volume: 0.8 });
                    }
                    else if (spiritType === 'def') {
                        this.scene.sound.play('battle-def', { volume: 0.8 });
                    }

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