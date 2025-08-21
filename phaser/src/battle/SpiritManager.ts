import { Game2DerivedState } from "game2-api";
import { BattleConfig, pureCircuits } from "game2-contract";
import { SpiritWidget } from "../widgets/ability";
import { BattleLayout } from "./BattleLayout";
import { Color, colorToNumber } from "../constants/colors";
import { logger } from "../main";

export enum BattlePhase {
    SPIRIT_TARGETING,
    COMBAT_ANIMATION
}

export class SpiritManager {
    private scene: Phaser.Scene;
    private layout: BattleLayout;
    private spirits: SpiritWidget[] = [];
    private enemies: any[] = []; // Actor type
    
    // Targeting state
    private battlePhase: BattlePhase = BattlePhase.SPIRIT_TARGETING;
    private currentSpiritIndex: number = 0;
    private spiritTargets: (number | null)[] = [null, null, null];
    
    // Callbacks
    private onAllSpiritsTargeted?: () => void;
    private onSpiritSelected?: (index: number) => void;
    private onTargetingStarted?: () => void;

    constructor(scene: Phaser.Scene, layout: BattleLayout) {
        this.scene = scene;
        this.layout = layout;
    }

    public createSpirits(state: Game2DerivedState, battle: BattleConfig): SpiritWidget[] {
        // Clean up existing spirits first
        this.cleanupSpirits();

        const battleConfig = state.activeBattleConfigs.get(pureCircuits.derive_battle_id(battle));
        const battleState = state.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        
        if (!battleConfig || !battleState) return this.spirits;
        
        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => state.allAbilities.get(id)!);
        
        // Create new spirits
        this.spirits = abilities.map((ability, i) => new SpiritWidget(
            this.scene, 
            this.layout.spiritX(i), 
            this.layout.spiritY(), 
            ability
        ));

        return this.spirits;
    }

    public getSpirits(): SpiritWidget[] {
        return this.spirits;
    }

    public cleanupSpirits() {
        this.spirits.forEach((s) => s.destroy());
        this.spirits = [];
    }

    public refreshSpiritsForNextRound(state: Game2DerivedState, battle: BattleConfig): SpiritWidget[] {
        return this.createSpirits(state, battle);
    }

    public updateReferences(newSpirits: SpiritWidget[]) {
        this.spirits = newSpirits;
    }

    // === TARGETING FUNCTIONALITY ===

    public setCallbacks(callbacks: {
        onAllSpiritsTargeted?: () => void;
        onSpiritSelected?: (index: number) => void;
        onTargetingStarted?: () => void;
    }) {
        this.onAllSpiritsTargeted = callbacks.onAllSpiritsTargeted;
        this.onSpiritSelected = callbacks.onSpiritSelected;
        this.onTargetingStarted = callbacks.onTargetingStarted;
    }

    public startTargeting() {
        // Safety check: don't start targeting if no enemies are alive
        const aliveEnemies = this.enemies.filter(enemy => enemy.hp > 0);
        if (aliveEnemies.length === 0) {
            logger.combat.error(`Attempted to start targeting with no alive enemies! Enemy HP: [${this.enemies.map(e => e.hp).join(',')}]`);
            return;
        }
        
        this.battlePhase = BattlePhase.SPIRIT_TARGETING;
        this.currentSpiritIndex = 0;
        
        // Reset targeting state
        this.spiritTargets = [null, null, null];
        
        // Notify that targeting has started (e.g., to remove fight button)
        this.onTargetingStarted?.();
        
        // Setup interactions
        this.setupSpiritInteractions();
        this.setupEnemyInteractions();
        
        // Highlight the first spirit
        this.highlightCurrentSpirit();
    }

    public getTargets(): (number | null)[] {
        return [...this.spiritTargets];
    }

    public getBattlePhase(): BattlePhase {
        return this.battlePhase;
    }

    public setBattlePhase(phase: BattlePhase) {
        this.battlePhase = phase;
    }

    public disableInteractions() {
        this.spirits.forEach(spirit => spirit.disableInteractive());
        this.enemies.forEach(enemy => enemy.disableInteractive());
        
        // Remove spirit highlights and animations
        this.spirits.forEach((spirit) => {
            this.scene.tweens.killTweensOf(spirit);
            this.scene.tweens.killTweensOf(spirit.spirit);
            spirit.y = this.layout.spiritY();
            if (spirit.spirit) {
                spirit.spirit.clearTint();
                spirit.spirit.setScale(2);
            }
        });
    }

    public reset() {
        this.battlePhase = BattlePhase.SPIRIT_TARGETING;
        this.currentSpiritIndex = 0;
        this.spiritTargets = [null, null, null];
    }

    public updateTargetingReferences(spirits: SpiritWidget[], enemies: any[]) {
        this.spirits = spirits;
        this.enemies = enemies;
    }

    private setupSpiritInteractions() {
        this.spirits.forEach((spirit, index) => {
            // Check if spirit is still valid and has a scene
            if (!spirit || !spirit.scene) {
                logger.combat.error(`Spirit ${index} is invalid or has no scene`);
                return;
            }
            
            spirit.removeAllListeners();
            
            spirit.setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.selectSpirit(index));
        });
    }

    private setupEnemyInteractions() {
        this.enemies.forEach((enemy, index) => {
            // Check if enemy is still valid and has a scene
            if (!enemy || !enemy.scene) {
                logger.combat.error(`Enemy ${index} is invalid or has no scene`);
                return;
            }
            
            enemy.removeAllListeners();
            
            // Only make alive enemies interactive
            if (enemy.hp > 0) {
                enemy.setInteractive({ useHandCursor: true })
                    .on('pointerdown', () => this.targetEnemy(index))
                    .on('pointerover', () => {
                        if (this.battlePhase === BattlePhase.SPIRIT_TARGETING) {
                            if (enemy.sprite) {
                                enemy.sprite.setTint(colorToNumber(Color.Green));
                            } else if (enemy.image) {
                                enemy.image.setTint(colorToNumber(Color.Green));
                            }
                        }
                    })
                    .on('pointerout', () => {
                        if (enemy.sprite) {
                            enemy.sprite.clearTint();
                        } else if (enemy.image) {
                            enemy.image.clearTint();
                        }
                    });
            } else {
                // Make sure dead enemies are completely non-interactive
                enemy.disableInteractive();
                // Remove any existing interactive area completely
                if (enemy.input) {
                    enemy.removeInteractive();
                }
            }
        });
    }

    private selectSpirit(index: number) {
        if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) return;
        
        this.currentSpiritIndex = index;
        this.highlightCurrentSpirit();
        this.onSpiritSelected?.(index);
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
            this.scene.tweens.killTweensOf(spirit);
            if (spirit.spirit) {
                spirit.spirit.clearTint();
                spirit.spirit.setScale(2);
            }
            // Move non-current spirits back
            if (index !== this.currentSpiritIndex) {
                this.scene.tweens.add({
                    targets: spirit,
                    y: this.layout.spiritY(),
                    duration: 200,
                    ease: 'Power2.easeOut'
                });
            }
        });
        
        // Highlight and bring forward the current spirit
        const currentSpirit = this.spirits[this.currentSpiritIndex];
        if (currentSpirit && currentSpirit.spirit) {
            // Yellow tint and larger scale
            currentSpirit.spirit.setTint(colorToNumber(Color.Yellow));
            currentSpirit.spirit.setScale(2.5);
            
            // Move forward and up slightly
            this.scene.tweens.add({
                targets: currentSpirit,
                y: this.layout.spiritY() - 30,
                duration: 300,
                ease: 'Back.easeOut'
            });
            
            // Add a subtle pulsing animation
            this.scene.tweens.add({
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
        if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) {
            return;
        }
        
        const allTargeted = this.spiritTargets.every(target => target !== null);
        
        if (allTargeted) {
            this.onAllSpiritsTargeted?.();
        }
    }
}