/**
 * Active battle scene and relevant files.
 */
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH } from "../main";
import { Button } from "../widgets/button";
import { Ability, BattleConfig, EFFECT_TYPE, ENEMY_TYPE, EnemyStats, pureCircuits } from "game2-contract";
import { TestMenu } from "./main";
import { Subscription } from "rxjs";
import { AbilityWidget, energyTypeToColor, SpiritWidget } from "../widgets/ability";
import { CHARGE_ANIM_TIME, chargeAnimKey, orbAuraIdleKey, spiritAuraIdleKey } from "../animations/spirit";
import { combat_round_logic } from "../battle/logic";
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

export class ActiveBattle extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    battle: BattleConfig;
    state: Game2DerivedState;
    player: Actor | undefined;
    enemies: Actor[];
    abilityIcons: AbilityWidget[];
    spirits: SpiritWidget[];

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
        console.assert(this.battle.enemy_count <= BigInt(3));
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

        // attack button
        const button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.80, 250, 48, this.getAttackButtonString(this.battle), 10, async () => {
            const id = pureCircuits.derive_battle_id(this.battle);
            const clonedState = structuredClone(this.state!);
            let apiDone = false;
            let loaderStarted = false;

            button.visible = false;
            
            const retryCombatRound = async (): Promise<any> => {
                try {
                    const result = await this.api.combat_round(id);
                    apiDone = true;
                    if (loaderStarted) {
                        this.scene.resume().stop('Loader');
                    }
                    return result;
                } catch (err) {
                    if (loaderStarted) {
                        loader.setText("Error connecting to network.. Retrying");
                    }
                    console.error(`Network Error during combat_round: ${err}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return retryCombatRound();
                }
            };
            const apiPromise = retryCombatRound();
            
            const uiPromise = combat_round_logic(id, clonedState, {
                onEnemyBlock: (enemy: number, amount: number) => new Promise((resolve) => {
                    console.log(`enemy [${enemy}] blocked for ${amount} | ${this.enemies.length}`);
                    this.enemies[enemy].addBlock(amount);
                    this.add.existing(new BattleEffect(this, enemyX(this.battle, enemy), enemyY() - 32, EFFECT_TYPE.block, amount, resolve));
                }),
                onEnemyAttack: (enemy: number, amount: number) => new Promise((resolve) => {
                    // Play enemy attack animation
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
                    console.log(`onPlayerEffect(${targets}, ${effectType}, ${amounts})`);
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
                                    //console.log(`enemy ${target} took ${effect.amount} damage`);
                                    this.enemies[target].damage(amount);
                                    // Play damage animation
                                    this.enemies[target].takeDamageAnimation();
                                    this.add.existing(new BattleEffect(this, bullet.x, bullet.y - 32, effectType, amount, resolve));
                                    bullet.destroy();
                                },
                            });
                        }
                    } else {
                        // TODO: why was this here? in case we forgot to code something???
                        this.add.existing(new BattleEffect(this, playerX(), playerY() - 32, effectType, amounts[0], resolve));
                    }
                }),
                onDrawAbilities: (abilities: Ability[]) => new Promise((resolve) => {
                    this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, abilityIdleY(), ability).setAlpha(0));
                    this.spirits = abilities.map((ability, i) => new SpiritWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, spiritY(), ability).setAlpha(0));
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
                    this.tweens.add({
                        targets: [abilityIcon/*, spirit*/],
                        y: abilityInUseY(),
                        delay: 150,
                        duration: 250,
                        onComplete: () => {
                            const uiElement = energy != undefined ? abilityIcon.energyEffectUI[energy] : abilityIcon.baseEffectUI;
                            this.tweens.add({
                                // TODO: do something to the spirit too
                                targets: energy != undefined ? [uiElement, spirit.orbs[energy]?.aura] : [uiElement, spirit],
                                scale: 1.5,
                                yoyo: true,
                                delay: 100,
                                duration: 200,
                                onComplete: () => resolve(),
                            });
                        },
                    });
                    // shrink orb after use
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
                        targets: [this.abilityIcons[abilityIndex]/*, this.spirits[abilityIndex]*/],
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
                    console.log(`[ENERGY-UI] onEnergyTrigger(${source}) -> ${targets}`);
                    if (targets.length > 0) {
                        console.log(`[ENERGY-UI] charge!`);
                        aura.anims.play(chargeAnimKey);
                        this.tweens.add({
                            targets: this,// ignored since it changes no properties, just to not crash
                            delay: 250,
                            duration: CHARGE_ANIM_TIME,
                            completeDelay: 350,
                            onComplete: () => {
                                console.log(`[ENERGY-UI] ...charged...`);
                                aura.anims.play(spiritAuraIdleKey);
                                targets.forEach((a) => {
                                    console.log(`[ENERGY-UI] CREATING BULLET ${source} -> ${a}`);
                                    const target = this.spirits[a];
                                    const bullet = scale(this.add.sprite(spiritX(source), spiritY(), 'orb-aura'))
                                        .setTint(colorToNumber(energyTypeToColor(color)));
                                    bullet.anims.play(orbAuraIdleKey);
                                    this.tweens.add({
                                        targets: bullet,
                                        delay: 100,
                                        duration: 500, // TODO: vary based on distance?
                                        // TODO; target orb instead and compute position it'll be in in 1100ms?
                                        x: target.x,
                                        onUpdate: (tween) => {
                                            // sin-arcs over or below the other spirits (alternates so avoid overlap)
                                            bullet.y = spiritY() + 32 * Math.sin((tween.progress + (source - a)) * Math.PI);
                                        },
                                        onComplete: () => {
                                            console.log(`[ENERGY-UI] DESTROYED BULLET ${source} -> ${a}`);
                                            bullet.destroy();
                                            resolve();
                                            // grow orb to show it has been triggered
                                            const orb = target.orbs[color]!;
                                            this.tweens.add({
                                                targets: orb,
                                                scale: 1.5, // do we want 1.5 or 2x? 1.5 x base(2) is 3 so still whole-integer scalingi
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
                    // just resolve instantly, it's not a big deal if the game continues during the second or so the animations play
                    resolve();
                }),
            }).then(result => {
                if (!apiDone) {
                    // Display the loading scene if the API call is not done yet
                    loaderStarted = true;
                    
                    this.scene.pause().launch('Loader');
                    loader.setText("Waiting on chain update");
                }
                return result;
            });

            // Wait for both API and UI to finish
            const [circuit, ui] = await Promise.all([apiPromise, uiPromise]);

            this.player?.setBlock(0);
            for (const enemy of this.enemies) {
                enemy.setBlock(0);
            }
            this.abilityIcons.forEach((a) => a.destroy());
            this.abilityIcons = [];
            this.spirits.forEach((s) => s.destroy());
            this.spirits = [];
            //console.log(`UI:      ui: ${this.state?.ui}, circuit: ${this.state?.circuit}`);
            //console.log(`CIRCUIT: ui: ${(this.api as MockGame2API).mockState.ui}, circuit: ${(this.api as MockGame2API).mockState.circuit}`);
            console.log(`------------------ BATTLE DONE --- BOTH UI AND LOGIC ----------------------`);
            // TODO: check consistency (either here or in onStateChange())
            //
            // TODO: move this out of here? it gets reset by onStateChange() and also results in an error:
            //
            //    Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'updatePenManager')
            //       at BBCodeText.updateText (index-eba13966.js:322545:24)
            //       at BBCodeText.setText (index-eba13966.js:322484:14)
            //       at index-eba13966.js:393191:23
            console.log(`UI REWARDS: ${safeJSONString(ui ?? { none: 'none' })}`);
            console.log(`CIRCUIT REWARDS: ${safeJSONString(circuit ?? { none: 'none' })}`);
            button.visible = true;
            if (circuit != undefined) {
                button.destroy();

                const battleOverText = circuit.alive ? `You won ${circuit.gold} gold!\nClick to Return.` : `You Died :(\nClick to Return.`;
                new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.4, battleOverText, 16, () => {
                    this.scene.remove('TestMenu');
                    this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                    this.scene.start('TestMenu');
                });
                if (circuit.alive && circuit.ability.is_some) {
                    new AbilityWidget(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.7, this.state?.allAbilities.get(circuit.ability.value)!);
                    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.9, 'New ability available', fontStyle(12)).setOrigin(0.5, 0.5);
                }
            } else {
                button.text.setText(this.getAttackButtonString(this.battle));
            }
        });
    }

    private getAttackButtonString(battle: BattleConfig): string {
        const buttonDefaultText = `Click to Attack`;
        if (this.state != undefined) {
            console.log(`Trying to get ${pureCircuits.derive_battle_id(battle)} [${this.state?.activeBattleStates.get(pureCircuits.derive_battle_id(battle)) != undefined}][${this.state?.activeBattleConfigs.get(pureCircuits.derive_battle_id(battle)) != undefined}] there are ${this.state!.activeBattleConfigs.size} | ${this.state!.activeBattleStates.size}`);
        } else {
            console.log(`We dont have the state yet`);
            return buttonDefaultText;
        }
        const state = this.state?.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        return state != undefined ? buttonDefaultText : '404';
    }

    private onStateChange(state: Game2DerivedState) {
        console.log(`ActiveBattle.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);
    }

}

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
            let texture = 'enemy-goblin';
            if (stats.fire_def > stats.physical_def && stats.fire_def > stats.ice_def) {
                texture = 'enemy-fire-sprite';
            } else if (stats.ice_def > stats.physical_def && stats.ice_def > stats.physical_def) {
                texture = 'enemy-snowman';
            }
            if (stats.enemy_type == ENEMY_TYPE.boss) {
                switch (Number((scene as ActiveBattle).battle.biome)) {
                    case BIOME_ID.cave:
                    case BIOME_ID.grasslands:
                        texture = 'enemy-boss-dragon-1';
                        break;
                    case BIOME_ID.desert:
                    case BIOME_ID.tundra:
                        texture = 'enemy-boss-enigma-1';
                        break;
                }
                
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
            switch (stats.enemy_type) {
                case ENEMY_TYPE.miniboss:
                    healthbarWidth = GAME_WIDTH * 0.5;
                    break;
                case ENEMY_TYPE.boss:
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
                x: this.x + 20,
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