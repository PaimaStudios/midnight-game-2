import { BattleConfig, BOSS_TYPE, EnemyStats, EFFECT_TYPE } from "game2-contract";
import { addScaledImage, BASE_SPRITE_SCALE } from "../utils/scaleImage";
import { HealthBar } from "../widgets/progressBar";
import { GAME_WIDTH } from "../main";
import { BattleLayout } from "./BattleLayout";
import { Color, colorToNumber } from "../constants/colors";
import { Def } from "../constants/def";
import { SPRITE_SHEET_ENEMIES } from "../animations/enemy";

// Generate texture names from enemy constants
const ENEMY_TEXTURES = Object.values(SPRITE_SHEET_ENEMIES).map(enemy => `enemy-${enemy}`);

type AnimationType = 'idle' | 'attack' | 'hurt' | 'death';

export class Actor extends Phaser.GameObjects.Container {
    hp: number;
    maxHp: number;
    hpBar: HealthBar;
    block: number;
    image: Phaser.GameObjects.Image | undefined;
    sprite: Phaser.GameObjects.Sprite | undefined;
    animationTick: number;
    textureKey: string = '';
    stats: EnemyStats | null;

    constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats | null) {
        super(scene, x, y);

        this.stats = stats;
        this.animationTick = Math.random() * 2 * Math.PI;

        let healtBarYOffset = 0;
        let healthbarWidth = 180;
        if (stats != null) {
            let texture = ENEMY_TEXTURES[Math.min(ENEMY_TEXTURES.length - 1, Number(stats.enemy_type))];
            if (stats.boss_type == BOSS_TYPE.boss) {
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
            // Player stats
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
                this.dieAnimation();
            }
        });
    }

    private setHp(hp: number) {
        this.hp = Math.max(0, hp);
        this.hpBar.setValue(this.hp);
        if (this.hp <= 0) {
            this.image?.setAlpha(0.5);
            this.sprite?.setAlpha(0.5);
        }
    }

    public setBlock(block: number) {
        this.block = block;
        this.hpBar.setBlock(block);
    }

    public getDefenseAgainst(effectType: EFFECT_TYPE): Def {
        if (!this.stats) {
            return Def.NEUTRAL; // Default for player or enemies without stats
        }

        switch (effectType) {
            case EFFECT_TYPE.attack_fire:
                return Number(this.stats.fire_def) as Def;
            case EFFECT_TYPE.attack_ice:
                return Number(this.stats.ice_def) as Def;
            case EFFECT_TYPE.attack_phys:
                return Number(this.stats.physical_def) as Def;
            case EFFECT_TYPE.block:
            default:
                return Def.NEUTRAL;
        }
    }

    preUpdate() {
        // Add subtle breathing animation for living enemies
        if (this.hp > 0 && this.sprite) {
            this.animationTick += 0.005;
            const breathe = Math.sin(this.animationTick) * 2;
            this.sprite.setY(breathe);
        }
    }

    private getAnimationKey(animationType: AnimationType): string {
        const baseName = this.textureKey.replace('enemy-', '').replace(/-1$/, '');
        return `${baseName}-${animationType}`;
    }

    public playAnimation(animationType: AnimationType): void {
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
            target.setTint(colorToNumber(Color.Red));
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

export class EnemyManager {
    private scene: Phaser.Scene;
    private layout: BattleLayout;
    private enemies: Actor[] = [];

    constructor(scene: Phaser.Scene, layout: BattleLayout) {
        this.scene = scene;
        this.layout = layout;
    }

    public createEnemies(battle: BattleConfig): Actor[] {
        // Clear existing enemies
        this.enemies.forEach(enemy => enemy.destroy());
        this.enemies = [];

        const enemyYOffsets = [
            [0],
            [0, 16],
            [25, 0, 25]
        ];

        for (let i = 0; i < battle.enemies.count; ++i) {
            const stats = battle.enemies.stats[i];
            const actor = new Actor(
                this.scene, 
                this.layout.enemyX(battle, i), 
                this.layout.enemyY() + enemyYOffsets[Number(battle.enemies.count) - 1][i],
                stats
            );
            this.enemies.push(actor);
        }

        return this.enemies;
    }

    public getEnemies(): Actor[] {
        return this.enemies;
    }

    public clearBlocks() {
        this.enemies.forEach(enemy => enemy.setBlock(0));
    }

    public updateReferences(newEnemies: Actor[]) {
        this.enemies = newEnemies;
    }
}