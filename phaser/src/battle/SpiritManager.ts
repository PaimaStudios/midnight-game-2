import { Game2DerivedState } from "game2-api";
import { BattleConfig, pureCircuits } from "game2-contract";
import { SpiritWidget } from "../widgets/ability";
import { Actor } from "../battle/EnemyManager";
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
    private enemies: Actor[] = [];
    
    // Targeting state
    private battlePhase: BattlePhase = BattlePhase.SPIRIT_TARGETING;
    private currentSpiritIndex: number = 0;
    private spiritTargets: (number | null)[] = [null, null, null];
    
    // Mouse tracking for spirit leaning
    private mouseMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
    
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
        
        // Disable mouse tracking
        this.disableMouseTracking();
        
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

    private resetSpiritToDefault(spiritIndex: number) {
        if (spiritIndex < 0 || spiritIndex >= this.spirits.length) return;
        
        const spirit = this.spirits[spiritIndex];
        if (spirit) {
            this.scene.tweens.add({
                targets: spirit,
                y: this.layout.spiritY(),
                duration: 400,
                ease: 'Power2.easeOut'
            });
            if (spirit.spirit) {
                spirit.spirit.clearTint();
                spirit.spirit.setScale(2);
            }
        }
    }

    private selectSpirit(index: number) {
        if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) return;
        
        const previousIndex = this.currentSpiritIndex;
        this.currentSpiritIndex = index;
        
        // Reset the previously selected spirit if it's different
        if (previousIndex !== index) {
            this.resetSpiritToDefault(previousIndex);
        }
        
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
        const previousIndex = this.currentSpiritIndex;
        let nextIndex = (this.currentSpiritIndex + 1) % 3;
        let attempts = 0;
        
        // Find next spirit without a target
        while (this.spiritTargets[nextIndex] !== null && attempts < 3) {
            nextIndex = (nextIndex + 1) % 3;
            attempts++;
        }
        
        if (attempts < 3) {
            this.currentSpiritIndex = nextIndex;
        } else {
            // All spirits have targets, no need to highlight
            this.currentSpiritIndex = -1;  
        }

        // Reset the previously selected spirit to default position
        this.resetSpiritToDefault(previousIndex);

        this.highlightCurrentSpirit();
    }

    private highlightCurrentSpirit() {
        // Disable mouse tracking for the previous spirit
        this.disableMouseTracking();
        
        // Reset visual state for spirits that aren't current and don't have targets
        this.spirits.forEach((spirit, index) => {
            if (spirit.spirit) {
                // Only reset spirits that aren't currently selected and don't have targets
                if (index !== this.currentSpiritIndex && this.spiritTargets[index] === null) {
                    spirit.spirit.clearTint();
                    spirit.spirit.setScale(2);
                }
            }
        });
        
        // Highlight and bring forward the current spirit
        const currentSpirit = this.spirits[this.currentSpiritIndex];
        if (currentSpirit && currentSpirit.spirit) {
            logger.combat.debug(`Found current spirit, enabling mouse tracking`);
            
            // Smoothly transition to highlighted state
            this.scene.tweens.add({
                targets: currentSpirit.spirit,
                scale: 2.5,
                duration: 400,
                ease: 'Back.easeOut',
                onComplete: () => {
                    // Add the pulsing animation after the initial scale tween
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
            });
            
            // Smoothly apply yellow tint
            this.scene.tweens.addCounter({
                from: 0,
                to: 1,
                duration: 400,
                ease: 'Power2.easeOut',
                onUpdate: (tween) => {
                    const progress = tween.progress;
                    const tintValue = Phaser.Display.Color.Interpolate.ColorWithColor(
                        Phaser.Display.Color.ValueToColor(0xffffff),
                        Phaser.Display.Color.ValueToColor(colorToNumber(Color.Yellow)),
                        1,
                        progress
                    );
                    currentSpirit.spirit.setTint(Phaser.Display.Color.GetColor(tintValue.r, tintValue.g, tintValue.b));
                }
            });
            
            // Move forward and up slightly
            this.scene.tweens.add({
                targets: currentSpirit,
                y: this.layout.spiritY() - 30,
                duration: 400,
                ease: 'Back.easeOut'
            });
            
            // Enable mouse tracking for the current spirit
            this.enableMouseTrackingForSpirit(currentSpirit);
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


    private enableMouseTrackingForSpirit(spirit: SpiritWidget) {
        if (!spirit || !spirit.spirit) {
            return;
        }
        
        // Remove any existing handler first
        this.removeMouseHandler();
        
        // Store the original highlighted position (base position for lean calculations)
        const baseX = this.layout.spiritX(this.currentSpiritIndex);
        const baseY = this.layout.spiritY() - 30; // Account for highlight offset
        
        // Create and store the mouse move handler
        this.mouseMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (this.battlePhase !== BattlePhase.SPIRIT_TARGETING) return;
            if (this.spirits[this.currentSpiritIndex] !== spirit) return;
            
            // Simple lean toward cursor
            const deltaX = pointer.x - baseX;
            const deltaY = pointer.y - baseY;
            const leanX = deltaX * 0.04; // 4% of the distance
            const leanY = deltaY * 0.04;
            
            // Apply position to the container - always relative to base position
            this.scene.tweens.add({
                targets: spirit,
                x: baseX + leanX,
                y: baseY + leanY,
                duration: 100,
                ease: 'Power2.easeOut'
            });
        };
        
        // Add the handler
        this.scene.input.on('pointermove', this.mouseMoveHandler);
    }

    private removeMouseHandler() {
        if (this.mouseMoveHandler) {
            this.scene.input.removeListener('pointermove', this.mouseMoveHandler);
            this.mouseMoveHandler = undefined;
        }
    }

    private disableMouseTracking() {
        // Remove the specific handler
        this.removeMouseHandler();
        
        // Reset position on all spirits
        this.spirits.forEach((spirit, index) => {
            if (spirit) {
                // Reset position to layout position
                spirit.x = this.layout.spiritX(index);
                spirit.y = this.layout.spiritY();
            }
        });
    }
}