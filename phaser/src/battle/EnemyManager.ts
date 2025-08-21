import { BattleConfig, BOSS_TYPE, EnemyStats, pureCircuits } from "game2-contract";
import { Game2DerivedState } from "game2-api";
import { logger } from "../main";
import { addScaledImage, BASE_SPRITE_SCALE } from "../utils/scaleImage";
import { HealthBar } from "../widgets/progressBar";
import { GAME_WIDTH, GAME_HEIGHT, fontStyle } from "../main";
import { BattleLayout } from "./BattleLayout";

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

export class Actor extends Phaser.GameObjects.Container {
    hp: number;
    maxHp: number;
    hpBar: HealthBar;
    block: number;
    image: Phaser.GameObjects.Image | undefined;
    sprite: Phaser.GameObjects.Sprite | undefined;
    animationTick: number;
    textureKey: string = '';

    constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats | null) {
        super(scene, x, y);

        this.animationTick = Math.random() * 2 * Math.PI;

        let healtBarYOffset = 0;
        let healthbarWidth = 180;
        if (stats != null) {
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

        for (let i = 0; i < battle.enemy_count; ++i) {
            const stats = battle.stats[i];
            const actor = new Actor(
                this.scene, 
                this.layout.enemyX(battle, i), 
                this.layout.enemyY() + enemyYOffsets[Number(battle.enemy_count) - 1][i], 
                stats
            );
            this.enemies.push(actor);
        }

        return this.enemies;
    }

    public getEnemies(): Actor[] {
        return this.enemies;
    }

    public synchronizeEnemyHP(state: Game2DerivedState, battle: BattleConfig) {
        const battleState = state.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        if (!battleState) return;
        
        const battleStateHP = [battleState.enemy_hp_0, battleState.enemy_hp_1, battleState.enemy_hp_2];
        
        for (let i = 0; i < this.enemies.length && i < battleStateHP.length; i++) {
            const newHP = Number(battleStateHP[i]);
            if (this.enemies[i].hp !== newHP) {
                const currentHP = this.enemies[i].hp;
                if (newHP < currentHP) {
                    this.enemies[i].damage(currentHP - newHP);
                } else if (newHP > currentHP) {
                    // Healing - directly set HP (rare case)
                    this.enemies[i].hp = newHP;
                    this.enemies[i].hpBar.setValue(newHP);
                }
            }
        }
    }

    public clearBlocks() {
        this.enemies.forEach(enemy => enemy.setBlock(0));
    }

    public updateReferences(newEnemies: Actor[]) {
        this.enemies = newEnemies;
    }
}