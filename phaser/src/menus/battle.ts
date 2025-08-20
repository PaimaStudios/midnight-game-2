/**
 * Active battle scene and relevant files.
 */
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { Button } from "../widgets/button";
import { Ability, BattleConfig, EFFECT_TYPE, BOSS_TYPE, EnemyStats, pureCircuits, BattleRewards, Effect } from "game2-contract";
import { TestMenu } from "./main";
import { Subscription } from "rxjs";
import { AbilityWidget, energyTypeToColor, SpiritWidget, effectTypeFileAffix } from "../widgets/ability";
import { SPIRIT_ANIMATION_DURATIONS, chargeAnimKey, orbAuraIdleKey, spiritAuraIdleKey } from "../animations/spirit";
import { CombatCallbacks } from "../battle/logic";
import { Loader } from "./loader";
import { addScaledImage, BASE_SPRITE_SCALE, scale } from "../utils/scaleImage";
import { colorToNumber } from "../constants/colors";
import { HealthBar } from "../widgets/progressBar";
import { BIOME_ID, biomeToBackground } from "../battle/biome";

const abilityInUseY = () => GAME_HEIGHT * 0.7;
const abilityIdleY = () => GAME_HEIGHT * 0.75;

const enemyX = (config: BattleConfig, enemyIndex: number): number => {
    return GAME_WIDTH * (enemyIndex + 0.5) / Number(config.enemy_count);
}
const enemyY = () => GAME_HEIGHT * 0.23;

// TODO: keep this? is it an invisible player? or show it somewhere?
const playerX = () => GAME_WIDTH / 2;
const playerY = () => GAME_HEIGHT * 0.95;

const spiritX = (spiritIndex: number): number => {
    return GAME_WIDTH * (spiritIndex + 0.5) / 3;
}
const spiritY = () => GAME_HEIGHT * 0.5;

enum BattlePhase {
    SPIRIT_TARGETING,
    COMBAT_ANIMATION
}

export class ActiveBattle extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    battle: BattleConfig;
    state: Game2DerivedState;
    player: Actor | undefined;
    enemies: Actor[];
    abilityIcons: AbilityWidget[];
    spirits: SpiritWidget[];
    
    // Spirit targeting state
    private battlePhase: BattlePhase = BattlePhase.SPIRIT_TARGETING;
    private currentSpiritIndex: number = 0;
    private spiritTargets: (number | null)[] = [null, null, null];
    private fightButton: Button | null = null;

    constructor(api: DeployedGame2API, battle: BattleConfig, state: Game2DerivedState) {
        super("ActiveBattle");

        this.api = api;
        this.battle = battle;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.enemies = [];
        this.abilityIcons = [];
        this.spirits = [];
        this.state = state;
    }

    create() {
        const loader = this.scene.get('Loader') as Loader;
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, biomeToBackground(Number(this.battle.biome) as BIOME_ID)).setDepth(-10);

        this.player = new Actor(this, playerX(), playerY(), null);
        logger.debugging.info(`Asserting enemy count <= 3: ${this.battle.enemy_count}`);
        const enemyYOffsets = [
            [0],
            [0, 16],
            [25, 0, 25]
        ];
        for (let i = 0; i < this.battle.enemy_count; ++i) {
            const stats = this.battle.stats[i];
            const actor = new Actor(this, enemyX(this.battle, i), enemyY() + enemyYOffsets[Number(this.battle.enemy_count) - 1][i], stats);
            this.enemies.push(actor);
        }

        // Initialize spirits and start targeting immediately
        this.initializeSpiritsForTargeting();
    }

    private onStateChange(state: Game2DerivedState) {
        logger.gameState.debug(`ActiveBattle.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);
    }

    private initializeSpiritsForTargeting() {
        if (!this.state || !this.battle) return;
        
        const battleConfig = this.state.activeBattleConfigs.get(pureCircuits.derive_battle_id(this.battle));
        const battleState = this.state.activeBattleStates.get(pureCircuits.derive_battle_id(this.battle));
        
        if (!battleConfig || !battleState) return;
        
        // Clean up existing spirits and ability cards first
        this.spirits.forEach((s) => s.destroy());
        this.spirits = [];
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => this.state!.allAbilities.get(id)!);
        
        // Create spirits and ability cards immediately
        this.spirits = abilities.map((ability, i) => new SpiritWidget(this, spiritX(i), spiritY(), ability));
        this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability));
        
        // Start targeting phase
        this.startSpiritTargeting();
        
    }

    private startSpiritTargeting() {
        this.battlePhase = BattlePhase.SPIRIT_TARGETING;
        this.currentSpiritIndex = 0;
        
        // Force a completely new array to avoid any reference issues
        this.spiritTargets = [];
        this.spiritTargets.push(null, null, null);
        
        logger.combat.info(`[RESET] startSpiritTargeting: reset spiritTargets to ${JSON.stringify(this.spiritTargets)}`);
        logger.combat.info(`[RESET] startSpiritTargeting: setting currentSpiritIndex to 0`);
        
        // Ensure no fight button exists
        if (this.fightButton) {
            this.fightButton.destroy();
            this.fightButton = null;
        }
        
        // Make spirits and enemies interactive
        this.setupSpiritInteractions();
        this.setupEnemyInteractions();
        
        // Highlight the current spirit
        this.highlightCurrentSpirit();
        
        // Debug: Log final initial state
        logger.combat.info(`[RESET] startSpiritTargeting complete: currentSpirit=${this.currentSpiritIndex}, spiritTargets=${JSON.stringify(this.spiritTargets)}`);
    }

    private setupSpiritInteractions() {
        this.spirits.forEach((spirit, index) => {
            // Remove any existing listeners first
            spirit.removeAllListeners();
            
            spirit.setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.selectSpirit(index));
        });
    }

    private setupEnemyInteractions() {
        this.enemies.forEach((enemy, index) => {
            // Remove any existing listeners first
            enemy.removeAllListeners();
            
            enemy.setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.targetEnemy(index))
                .on('pointerover', () => {
                    if (this.battlePhase === BattlePhase.SPIRIT_TARGETING && enemy.hp > 0) {
                        // Highlight enemy on hover
                        if (enemy.sprite) {
                            enemy.sprite.setTint(0x88ff88); // Light green tint
                        } else if (enemy.image) {
                            enemy.image.setTint(0x88ff88);
                        }
                    }
                })
                .on('pointerout', () => {
                    // Remove highlight
                    if (enemy.sprite) {
                        enemy.sprite.clearTint();
                    } else if (enemy.image) {
                        enemy.image.clearTint();
                    }
                });
        });
    }

    private selectSpirit(index: number) {
        if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) return;
        
        this.currentSpiritIndex = index;
        this.highlightCurrentSpirit();
    }

    private targetEnemy(enemyIndex: number) {
        if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) return;
        if (this.enemies[enemyIndex].hp <= 0) return; // Can't target dead enemies
        
        // Set target for current spirit
        this.spiritTargets[this.currentSpiritIndex] = enemyIndex;
        
        // Move to next spirit that doesn't have a target
        this.moveToNextUntagetedSpirit();
        
        // Check if all spirits have targets
        this.checkAllSpiritsTargeted();
    }

    private moveToNextUntagetedSpirit() {
        let nextIndex = (this.currentSpiritIndex + 1) % 3;
        let attempts = 0;
        
        // Find next spirit without a target
        while (this.spiritTargets[nextIndex] !== null && attempts < 3) {
            nextIndex = (nextIndex + 1) % 3;
            attempts++;
        }
        
        if (attempts < 3) {
            this.currentSpiritIndex = nextIndex;
            this.highlightCurrentSpirit();
        }
    }

    private highlightCurrentSpirit() {
        // Remove existing highlights and reset positions
        this.spirits.forEach((spirit, index) => {
            this.tweens.killTweensOf(spirit);
            if (spirit.spirit) {
                spirit.spirit.clearTint();
                spirit.spirit.setScale(2); // Reset to normal scale
            }
            // Move non-current spirits back
            if (index !== this.currentSpiritIndex) {
                this.tweens.add({
                    targets: spirit,
                    y: spiritY(),
                    duration: 200,
                    ease: 'Power2.easeOut'
                });
            }
        });
        
        // Highlight and bring forward the current spirit
        const currentSpirit = this.spirits[this.currentSpiritIndex];
        if (currentSpirit && currentSpirit.spirit) {
            // Yellow tint and larger scale
            currentSpirit.spirit.setTint(0xffff00);
            currentSpirit.spirit.setScale(2.5);
            
            // Move forward and up slightly
            this.tweens.add({
                targets: currentSpirit,
                y: spiritY() - 30,
                duration: 300,
                ease: 'Back.easeOut'
            });
            
            // Add a subtle pulsing animation
            this.tweens.add({
                targets: currentSpirit.spirit,
                scaleX: 2.8,
                scaleY: 2.8,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    private checkAllSpiritsTargeted() {
        // Only check if we're in the targeting phase
        if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) {
            return;
        }
        
        const allTargeted = this.spiritTargets.every(target => target !== null);
        
        if (allTargeted && !this.fightButton) {
            this.createFightButton();
        } else if (!allTargeted && this.fightButton) {
            this.fightButton.destroy();
            this.fightButton = null;
        }
    }

    private createFightButton() {
        this.fightButton = new Button(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * 0.90,
            200,
            48,
            'Fight',
            12,
            () => this.executeCombatWithTargets()
        );
    }

    private async executeCombatWithTargets() {
        if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) return;
        if (!this.spiritTargets.every(target => target !== null)) return;
        
        this.battlePhase = BattlePhase.COMBAT_ANIMATION;
        
        // Hide fight button and disable interactions
        if (this.fightButton) {
            this.fightButton.destroy();
            this.fightButton = null;
        }
        
        this.disableInteractions();
        
        // Execute combat round with selected targets
        await this.runCombatWithTargets();
    }

    private disableInteractions() {
        this.spirits.forEach(spirit => spirit.disableInteractive());
        this.enemies.forEach(enemy => enemy.disableInteractive());
        
        // Remove spirit highlights and animations
        this.spirits.forEach((spirit) => {
            this.tweens.killTweensOf(spirit);
            this.tweens.killTweensOf(spirit.spirit);
            spirit.y = spiritY();
            if (spirit.spirit) {
                spirit.spirit.clearTint();
                spirit.spirit.setScale(2); // Reset to normal scale
            }
        });
    }

    private resetSpiritTargeting() {
        this.battlePhase = BattlePhase.SPIRIT_TARGETING;
        this.currentSpiritIndex = 0;
        
        // Force a completely new array to avoid any reference issues
        this.spiritTargets = [];
        this.spiritTargets.push(null, null, null);
        
        logger.combat.info(`[RESET] resetSpiritTargeting: reset spiritTargets to ${JSON.stringify(this.spiritTargets)}`);
        logger.combat.info(`[RESET] resetSpiritTargeting: setting currentSpiritIndex to 0`);
        
        if (this.fightButton) {
            this.fightButton.destroy();
            this.fightButton = null;
        }
        
        this.disableInteractions();
        
        // Re-enable targeting for next round
        if (this.spirits.length > 0) {
            this.setupSpiritInteractions();
            this.setupEnemyInteractions();
            this.highlightCurrentSpirit();
        }
    }

    private async runCombatWithTargets() {
        const id = pureCircuits.derive_battle_id(this.battle);
        const clonedState = structuredClone(this.state!);
        let loaderStarted = false;
        
        const retryCombatRound = async (): Promise<any> => {
            try {
                // Use new combat_round_with_targets method when available
                // For now, fall back to original method since contract needs to be updated
                const result = await this.api.combat_round(id);
                // TODO: Uncomment when contract is deployed with new method:
                // const targets = this.spiritTargets.map(t => BigInt(t!)) as [bigint, bigint, bigint];
                // const result = await this.api.combat_round_with_targets(id, targets);
                if (loaderStarted) {
                    this.scene.resume().stop('Loader');
                }
                return result;
            } catch (err) {
                if (loaderStarted) {
                    const loader = this.scene.get('Loader') as Loader;
                    loader.setText("Error connecting to network.. Retrying");
                }
                logger.network.error(`Network Error during combat_round: ${err}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return retryCombatRound();
            }
        };
        const apiPromise = retryCombatRound();
        
        // Modified combat logic to use selected targets
        const uiPromise = this.runCombatLogicWithTargets(id, clonedState);
        
        // Wait for both API and UI to finish
        const [circuit, ui] = await Promise.all([apiPromise, uiPromise]);
        
        // Reset for next round or end battle
        this.handleCombatComplete(circuit, ui);
    }

    private runCombatLogicWithTargets(id: bigint, clonedState: Game2DerivedState) {
        // Modify the combat logic to use our selected targets instead of random ones
        // Create a copy of spiritTargets to avoid any reference issues
        const targetsCopy = this.spiritTargets.map(target => target!) as number[];
        logger.combat.debug(`runCombatLogicWithTargets: using targets ${JSON.stringify(targetsCopy)}`);
        
        return this.modifiedCombatRoundLogic(id, clonedState, targetsCopy, {
            onEnemyBlock: (enemy: number, amount: number) => new Promise((resolve) => {
                logger.combat.debug(`enemy [${enemy}] blocked for ${amount} | ${this.enemies.length}`);
                this.enemies[enemy].addBlock(amount);
                this.add.existing(new BattleEffect(this, enemyX(this.battle, enemy), enemyY() - 32, EFFECT_TYPE.block, amount, resolve));
            }),
            onEnemyAttack: (enemy: number, amount: number) => new Promise((resolve) => {
                this.enemies[enemy].performAttackAnimation().then(() => {
                    const fist = addScaledImage(this, enemyX(this.battle, enemy), enemyY(), 'physical');
                    this.tweens.add({
                        targets: fist,
                        x: playerX(),
                        y: playerY(),
                        duration: 100,
                        onComplete: () => {
                            fist.destroy();
                            this.player?.damage(amount);
                            this.add.existing(new BattleEffect(this, playerX(), playerY() - 32, EFFECT_TYPE.attack_phys, amount, resolve));
                        }
                    });
                });
            }),
            onPlayerEffect: (source: number, targets: number[], effectType: EFFECT_TYPE, amounts: number[]) => new Promise((resolve) => {
                logger.combat.debug(`onPlayerEffect(${targets}, ${effectType}, ${amounts})`);
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
                        break;
                }
                if (damageType != undefined) {
                    for (let i = 0; i < targets.length; ++i) {
                        const target = targets[i];
                        const amount = amounts[i];
                        const bullet = addScaledImage(this, spiritX(source), spiritY(), damageType);
                        this.tweens.add({
                            targets: bullet,
                            x: enemyX(this.battle, target),
                            y: enemyY(),
                            duration: 150,
                            onComplete: () => {
                                this.enemies[target].damage(amount);
                                this.enemies[target].takeDamageAnimation();
                                this.add.existing(new BattleEffect(this, bullet.x, bullet.y - 32, effectType, amount, resolve));
                                bullet.destroy();
                            },
                        });
                    }
                } else {
                    this.add.existing(new BattleEffect(this, playerX(), playerY() - 32, effectType, amounts[0], resolve));
                }
            }),
            onDrawAbilities: (abilities: Ability[]) => new Promise((resolve) => {
                // Only create ability cards if they don't already exist (from targeting phase)
                if (this.abilityIcons.length === 0) {
                    this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability).setAlpha(0));
                } else {
                    // Ability cards already exist from targeting, just ensure they're positioned correctly and visible
                    this.abilityIcons.forEach((abilityIcon, i) => {
                        abilityIcon.x = GAME_WIDTH * (i + 0.5) / abilities.length;
                        abilityIcon.y = abilityIdleY();
                        abilityIcon.setAlpha(1);
                    });
                }
                
                // Only create spirits if they don't already exist (from targeting phase)
                if (this.spirits.length === 0) {
                    this.spirits = abilities.map((ability, i) => new SpiritWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, spiritY(), ability).setAlpha(0));
                } else {
                    // Spirits already exist from targeting, just ensure they're positioned correctly and visible
                    this.spirits.forEach((spirit, i) => {
                        spirit.x = GAME_WIDTH * (i + 0.5) / abilities.length;
                        spirit.y = spiritY();
                        spirit.setAlpha(1);
                    });
                }
                
                this.tweens.add({
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
                    if (this.anims.exists(attackAnimKey)) {
                        spirit.spirit.anims.play(attackAnimKey);
                        this.time.delayedCall(1000, () => {
                            if (spirit.spirit && this.anims.exists(idleAnimKey)) {
                                spirit.spirit.anims.play(idleAnimKey);
                            }
                        });
                    }
                }
                
                this.tweens.add({
                    targets: [abilityIcon],
                    y: abilityInUseY(),
                    delay: 150,
                    duration: 250,
                    onComplete: () => {
                        const uiElement = energy != undefined ? abilityIcon.energyEffectUI[energy] : abilityIcon.baseEffectUI;
                        this.tweens.add({
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
                    this.tweens.add({
                        targets: orb,
                        scale: 1,
                        duration: 250,
                    });
                }
            }),
            afterUseAbility: (abilityIndex: number) => new Promise((resolve) => {
                this.tweens.add({
                    targets: [this.abilityIcons[abilityIndex]],
                    y: abilityIdleY(),
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
                logger.animation.debug(`[ENERGY-UI] onEnergyTrigger(${source}) -> ${targets}`);
                if (targets.length > 0) {
                    logger.animation.debug(`[ENERGY-UI] charge!`);
                    aura.anims.play(chargeAnimKey);
                    this.tweens.add({
                        targets: this,
                        delay: 250,
                        duration: SPIRIT_ANIMATION_DURATIONS.charge,
                        completeDelay: 350,
                        onComplete: () => {
                            logger.animation.debug(`[ENERGY-UI] ...charged...`);
                            aura.anims.play(spiritAuraIdleKey);
                            targets.forEach((a) => {
                                logger.animation.debug(`[ENERGY-UI] CREATING BULLET ${source} -> ${a}`);
                                const target = this.spirits[a];
                                const bullet = scale(this.add.sprite(spiritX(source), spiritY(), 'orb-aura'))
                                    .setTint(colorToNumber(energyTypeToColor(color)));
                                bullet.anims.play(orbAuraIdleKey);
                                this.tweens.add({
                                    targets: bullet,
                                    delay: 100,
                                    duration: 500,
                                    x: target.x,
                                    onUpdate: (tween) => {
                                        bullet.y = spiritY() + 32 * Math.sin((tween.progress + (source - a)) * Math.PI);
                                    },
                                    onComplete: () => {
                                        logger.animation.debug(`[ENERGY-UI] DESTROYED BULLET ${source} -> ${a}`);
                                        bullet.destroy();
                                        resolve();
                                        const orb = target.orbs[color]!;
                                        this.tweens.add({
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
        });
    }

    private handleCombatComplete(circuit: any, ui: any) {
        this.player?.setBlock(0);
        for (const enemy of this.enemies) {
            enemy.setBlock(0);
        }
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        logger.combat.info(`------------------ BATTLE DONE --- BOTH UI AND LOGIC ----------------------`);
        logger.combat.debug(`UI REWARDS: ${safeJSONString(ui ?? { none: 'none' })}`);
        logger.combat.debug(`CIRCUIT REWARDS: ${safeJSONString(circuit ?? { none: 'none' })}`);
        
        if (circuit != undefined) {
            // Battle is over, show end-of-battle screen
            this.spirits.forEach((s) => s.destroy());
            this.spirits = [];

            const battleOverText = circuit.alive ? `You won ${circuit.gold} gold!\nClick to Return.` : `You Died :(\nClick to Return.`;
            new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.72, GAME_WIDTH * 0.64, GAME_HEIGHT * 0.3, battleOverText, 16, () => {
                this.scene.remove('TestMenu');
                this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                this.scene.start('TestMenu');
            });
            if (circuit.alive && circuit.ability.is_some) {
                new AbilityWidget(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.35, this.state?.allAbilities.get(circuit.ability.value)!);
                this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'New ability available', fontStyle(12)).setOrigin(0.5, 0.5);
            }
        } else {
            // Battle continues, reset targeting state for next round
            // First, refresh spirits for the new round (abilities might have changed)
            this.refreshSpiritsForNextRound();
            this.resetSpiritTargeting();
        }
    }

    private refreshSpiritsForNextRound() {
        if (!this.state || !this.battle) return;
        
        const battleConfig = this.state.activeBattleConfigs.get(pureCircuits.derive_battle_id(this.battle));
        const battleState = this.state.activeBattleStates.get(pureCircuits.derive_battle_id(this.battle));
        
        if (!battleConfig || !battleState) return;
        
        // Clean up existing spirits and ability cards
        this.spirits.forEach((s) => s.destroy());
        this.spirits = [];
        this.abilityIcons.forEach((a) => a.destroy());
        this.abilityIcons = [];
        
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => this.state!.allAbilities.get(id)!);
        
        // Create new spirits and ability cards for the next round
        this.spirits = abilities.map((ability, i) => new SpiritWidget(this, spiritX(i), spiritY(), ability));
        this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability));
    }

    /**
     * Modified combat round logic that uses player-selected targets instead of random ones
     */
    private modifiedCombatRoundLogic(battle_id: bigint, gameState: Game2DerivedState, playerTargets: number[], uiHooks?: CombatCallbacks): Promise<BattleRewards | undefined> {
        return new Promise(async (resolve) => {
            logger.combat.debug(`modifiedCombatRoundLogic with targets: ${playerTargets}`);
            const battleConfig = gameState.activeBattleConfigs.get(battle_id)!;
            const battleState = gameState.activeBattleStates.get(battle_id)!;
            
            if (uiHooks != undefined) {
                gameState.ui = true;
            } else {
                gameState.circuit = true;
            }

            const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
            const abilities = abilityIds.map((id) => gameState.allAbilities.get(id)!)

            let player_block = BigInt(0);
            const enemy_count = Number(battleConfig.enemy_count);
            let player_damage = new Array(enemy_count).fill(BigInt(0));
            let enemy_damage = BigInt(0);

            const handleEndOfRound = () => {
                logger.combat.debug(`handleEndOfRound.player_damage = ${player_damage}`);
                uiHooks?.onEndOfRound();
                if (enemy_damage > player_block) {
                    battleState.player_hp -= enemy_damage - player_block;
                }
                if (player_damage[0] > battleConfig.stats[0].block) {
                    battleState.enemy_hp_0 = BigInt(Math.max(0, Number(battleState.enemy_hp_0 + battleConfig.stats[0].block - player_damage[0])));
                }
                if (player_damage[1] > battleConfig.stats[1].block) {
                    battleState.enemy_hp_1 = BigInt(Math.max(0, Number(battleState.enemy_hp_1 + battleConfig.stats[1].block - player_damage[1])));
                }
                if (player_damage[2] > battleConfig.stats[2].block) {
                    battleState.enemy_hp_2 = BigInt(Math.max(0, Number(battleState.enemy_hp_2 + battleConfig.stats[2].block - player_damage[2])));
                }
                logger.combat.debug(`Player HP ${battleState.player_hp} | Enemy HP: ${battleState.enemy_hp_0} / ${battleState.enemy_hp_1} / ${battleState.enemy_hp_2}`);
                if (battleState.player_hp <= 0) {
                    logger.combat.info(`YOU DIED`);
                    resolve({ alive: false, gold: BigInt(0), ability: { is_some: false, value: BigInt(0) } });
                }
                else if (battleState.enemy_hp_0 <= 0 && (battleState.enemy_hp_1 <= 0 || battleConfig.enemy_count < 2) && (battleState.enemy_hp_2 <= 0 || battleConfig.enemy_count < 3)) {
                    logger.combat.info(`YOU WON`);
                    let abilityReward = { is_some: false, value: BigInt(0) };
                    for (let i = 0; i < battleConfig.enemy_count; ++i) {
                        if (battleConfig.stats[i].boss_type != BOSS_TYPE.normal) {
                            // For UI, we don't generate random abilities - let the circuit handle rewards
                            break;
                        }
                    }
                    resolve({ alive: true, gold: BigInt(100), ability: abilityReward });
                } else {
                    logger.combat.info(`CONTINUE BATTLE`);
                    resolve(undefined);
                }
            }

            await uiHooks?.onDrawAbilities(abilities);

            // Enemy block phase
            let enemy_hp = [battleState.enemy_hp_0, battleState.enemy_hp_1, battleState.enemy_hp_2];
            for (let i = 0; i < battleConfig.enemy_count; ++i) {
                if (enemy_hp[i] > 0) {
                    const block = Number(battleConfig.stats[i].block);
                    if (block != 0) {
                        await uiHooks?.onEnemyBlock(i, block);
                    }
                }
            }

            const aliveTargets = new Array(Number(battleConfig.enemy_count))
                .fill(0)
                .map((_, i) => i)
                .filter((i) => enemy_hp[i] > BigInt(0));

            // Player abilities with selected targets
            const resolveEffect = async (effect: { is_some: boolean, value: Effect }, source: number, target: number) => {
                if (effect.is_some) {
                    const targets = effect.value.is_aoe ? aliveTargets : [target];
                    switch (effect.value.effect_type) {
                        case EFFECT_TYPE.attack_fire:
                        case EFFECT_TYPE.attack_ice:
                        case EFFECT_TYPE.attack_phys:
                            const amounts = targets.map((enemy) => {
                                const dmg = pureCircuits.effect_damage(effect.value, battleConfig.stats[enemy]);
                                player_damage[enemy] += dmg;
                                logger.combat.debug(`player_damage[${enemy}] = ${player_damage[enemy]} // took ${dmg} damage`);
                                return Number(dmg)
                            });
                            await uiHooks?.onPlayerEffect(source, targets, effect.value.effect_type, amounts);
                            break;
                        case EFFECT_TYPE.block:
                            await uiHooks?.onPlayerEffect(source, targets, effect.value.effect_type, [Number(effect.value.amount)]);
                            player_block += effect.value.amount;
                            break;
                    }
                }
            };

            // Use player-selected targets, but validate they're alive
            const targets = playerTargets.map((selectedTarget) => {
                // If selected target is dead, fall back to first alive target
                if (aliveTargets.includes(selectedTarget)) {
                    return selectedTarget;
                } else {
                    return aliveTargets[0]; // Fallback to first alive enemy
                }
            });
            
            const allEnemiesDead = () => {
                return (player_damage[0] > battleConfig.stats[0].block + battleState.enemy_hp_0)
                                      && (player_damage[1] > battleConfig.stats[1].block + battleState.enemy_hp_1 || enemy_count < 2)
                                      && (player_damage[2] > battleConfig.stats[2].block + battleState.enemy_hp_2 || enemy_count < 3);
            };
            
            // Base effects with player-selected targets
            for (let i = 0; i < abilities.length; ++i) {
                const ability = abilities[i];
                await uiHooks?.onUseAbility(i, undefined);
                if (ability.generate_color.is_some) {
                    await uiHooks?.onEnergyTrigger(i, Number(ability.generate_color.value));
                }
                await resolveEffect(ability.effect, i, targets[i]);
                await uiHooks?.afterUseAbility(i);
                if (allEnemiesDead()) {
                    return handleEndOfRound();
                }
            }
            
            // Energy triggers - use the same targets as base effects
            for (let i = 0; i < abilities.length; ++i) {
                const ability = abilities[i];
                for (let c = 0; c < 3; ++c) {
                    if (ability.on_energy[c].is_some && abilities.some((a2, j) => i != j && a2.generate_color.is_some && Number(a2.generate_color.value) == c)) {
                        await uiHooks?.onUseAbility(i, c);
                        await resolveEffect(ability.on_energy[c], i, targets[i]); // Use same target as base effect
                        await uiHooks?.afterUseAbility(i);
                        if (allEnemiesDead()) {
                            return handleEndOfRound();
                        }
                    }
                }
            }

            // Enemy damage phase
            for (let i = 0; i < battleConfig.enemy_count; ++i) {
                if (enemy_hp[i] > 0) {
                    const damage = battleConfig.stats[i].attack;
                    enemy_damage += damage;
                    if (Number(damage) != 0) {
                        await uiHooks?.onEnemyAttack(i, Number(damage));
                    }
                }
            }

            handleEndOfRound();
        });
    }

}

const ENEMY_TEXTURES = [
    'enemy-goblin',
    'enemy-fire-sprite',
    'enemy-ice-golem',
    'enemy-snowman'
];

const BOSS_TEXTURES = [
    'enemy-boss-dragon',
    'enemy-boss-enigma'
];

class Actor extends Phaser.GameObjects.Container {
    hp: number;
    maxHp: number;
    hpBar: HealthBar;
    block: number;
    image: Phaser.GameObjects.Image | undefined;
    sprite: Phaser.GameObjects.Sprite | undefined;
    animationTick: number;
    textureKey: string = '';

    // TODO: ActorConfig or Stats or whatever
    constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats | null) {
        super(scene, x, y);

        this.animationTick = Math.random() * 2 * Math.PI;

        let healtBarYOffset = 0;
        let healthbarWidth = 180;
        if (stats != null) {
            // TODO: replace this with other measures? how should we decide this? for now this works though
            let texture = ENEMY_TEXTURES[Math.min(ENEMY_TEXTURES.length - 1, Number(stats.enemy_type))];
            if (stats.boss_type == BOSS_TYPE.boss) {
                texture = BOSS_TEXTURES[Math.min(BOSS_TEXTURES.length - 1, Number(stats.enemy_type))];

                healtBarYOffset = 80;  // Move healthbar for large enemies (bosses)
            }
            
            this.textureKey = texture;
            
            // Try to create animated sprite first, fallback to static image
            if (scene.anims.exists(this.getAnimationKey('idle'))) {
                this.sprite = scene.add.sprite(0, 0, texture);
                this.sprite.setScale(BASE_SPRITE_SCALE);
                this.sprite.anims.play(this.getAnimationKey('idle'));
                this.add(this.sprite);
                healtBarYOffset -= this.sprite.height * 1.5 + 22;
            } else {
                this.image = addScaledImage(scene, 0, 0, texture);
                healtBarYOffset -= this.image.height * 1.5 + 22;
                this.add(this.image);
            }
            switch (stats.boss_type) {
                case BOSS_TYPE.miniboss:
                    healthbarWidth = GAME_WIDTH * 0.5;
                    break;
                case BOSS_TYPE.boss:
                    healthbarWidth = GAME_WIDTH * 0.75;
                    break;
            }
            this.maxHp = Number(stats.hp);
        } else {
            // TOOD: do we need the ActorConfig/ActorStats struct or is this fine?
            this.maxHp = 100;
            healthbarWidth = GAME_WIDTH * 0.5;
        }

        this.hp = this.maxHp;
        this.hpBar = new HealthBar({
            scene,
            x: 0,
            y: healtBarYOffset,
            width: healthbarWidth,
            height: 32,
            max: this.maxHp,
            displayTotalCompleted: true,
        });
        this.block = 0;

        this.add(this.hpBar);

        this.setHp(this.hp);
        this.setSize(64, 64);

        scene.add.existing(this);
    }

    public addBlock(amount: number) {
        this.setBlock(this.block + amount);
    }

    public damage(amount: number) {
        if (amount > this.block) {
            this.setHp(this.hp - amount + this.block);
            this.setBlock(0);
        } else {
            this.setBlock(this.block - amount);
        }
    }

    public endOfRound() {
        this.hpBar.finalizeTempProgress(() => {
            if (this.hp <= 0) {
                this.hpBar.setLabel('DEAD');
                // Play death animation when enemy dies
                this.dieAnimation();
            }
        });
    }

    private setHp(hp: number) {
        this.hp = Math.max(0, hp);
        this.hpBar.setValue(this.hp);
        if (this.hp <= 0) {
            // do we do anything here?
            this.image?.setAlpha(0.5);
            this.sprite?.setAlpha(0.5);
        }
    }

    public setBlock(block: number) {
        this.block = block;
        this.hpBar.setBlock(block);
    }

    preUpdate() {
        // Add subtle breathing animation for living enemies
        if (this.hp > 0 && this.sprite) {
            this.animationTick += 0.005;
            const breathe = Math.sin(this.animationTick) * 2;
            this.sprite.setY(breathe);
        }
    }

    private getAnimationKey(animationType: 'idle' | 'attack' | 'hurt' | 'death'): string {
        const baseName = this.textureKey.replace('enemy-', '').replace(/-1$/, '');
        return `${baseName}-${animationType}`;
    }

    public playAnimation(animationType: 'idle' | 'attack' | 'hurt' | 'death'): void {
        if (this.sprite) {
            const animKey = this.getAnimationKey(animationType);
            if (this.scene.anims.exists(animKey)) {
                this.sprite.anims.play(animKey);
            }
        }
    }

    public takeDamageAnimation(): Promise<void> {
        return new Promise((resolve) => {
            const target = this.sprite || this.image;
            if (!target) {
                resolve();
                return;
            }

            // Flash red and play hurt animation
            target.setTint(0xff0000);
            this.playAnimation('hurt');

            // Scale effect for impact
            this.scene.tweens.add({
                targets: target,
                scaleX: target.scaleX * 1.1,
                scaleY: target.scaleY * 0.9,
                duration: 100,
                yoyo: true,
                onComplete: () => {
                    target.clearTint();
                    if (this.hp > 0) {
                        this.playAnimation('idle');
                    }
                    resolve();
                }
            });
        });
    }

    public performAttackAnimation(): Promise<void> {
        return new Promise((resolve) => {
            this.playAnimation('attack');

            // Lunge forward slightly
            this.scene.tweens.add({
                targets: this,
                x: this.x + 12,
                duration: 200,
                yoyo: true,
                onComplete: () => {
                    this.playAnimation('idle');
                    resolve();
                }
            });
        });
    }

    public dieAnimation(): Promise<void> {
        return new Promise((resolve) => {
            this.playAnimation('death');
            const target = this.sprite || this.image;
            
            if (target) {
                // Fade out and fall
                this.scene.tweens.add({
                    targets: [target, this.hpBar],
                    alpha: 0,
                    angle: 90,
                    y: target.y + 50,
                    duration: 1000,
                    onComplete: () => resolve()
                });
            } else {
                resolve();
            }
        });
    }
}

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