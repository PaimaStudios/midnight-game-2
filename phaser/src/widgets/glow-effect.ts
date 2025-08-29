import { Color, colorToNumber } from "../constants/colors";

/**
 * Creates a subtle glow effect with pulsing animation.
 * Can be positioned anywhere and provides a magical ambient glow.
 */
export class GlowEffect {
    private scene: Phaser.Scene;
    private graphics: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene, centerX: number, centerY: number, width?: number, height?: number) {
        this.scene = scene;
        this.graphics = this.scene.add.graphics();
        this.createGlow(centerX, centerY, width, height);
    }

    private createGlow(centerX: number, centerY: number, width?: number, height?: number) {
        // Create multiple concentric ellipses for a smooth glow effect, centered at 0,0
        // Use original fixed radii but keep parameterized structure
        const glowRadii = [120, 100, 80, 60, 40];
        const glowAlphas = [0.05, 0.08, 0.12, 0.18, 0.25];
        const glowColor = Color.Yellow; // Golden color matching portal

        for (let i = 0; i < glowRadii.length; i++) {
            this.graphics.fillStyle(colorToNumber(glowColor), glowAlphas[i]);
            // Draw centered at 0,0 so scaling works from center
            this.graphics.fillEllipse(0, 0, glowRadii[i] * 2, glowRadii[i] * 1.6);
        }
        
        // Position the graphics at the specified center
        this.graphics.setPosition(centerX, centerY);

        // Set depth between background and UI elements
        this.graphics.setDepth(-8);

        // Add subtle pulsing animation (alpha and scale)
        this.scene.tweens.add({
            targets: this.graphics,
            alpha: 0.7,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 3000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * Set the visibility of the glow
     */
    public setVisible(visible: boolean): void {
        this.graphics.setVisible(visible);
    }

    /**
     * Set the depth/z-index of the glow
     */
    public setDepth(depth: number): void {
        this.graphics.setDepth(depth);
    }

    /**
     * Move the glow to a new position
     */
    public setPosition(x: number, y: number): void {
        this.graphics.setPosition(x, y);
    }

    /**
     * Clean up the glow and remove it from the scene
     */
    public destroy(): void {
        this.scene.tweens.killTweensOf(this.graphics);
        this.graphics.destroy();
    }
}