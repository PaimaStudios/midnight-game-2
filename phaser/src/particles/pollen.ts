import { ParticleSystem } from './particle-system';
import { Color, colorToNumber } from '../constants/colors';

export class PollenParticleSystem extends ParticleSystem {
    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
        super(scene, x, y, width, height, 'pollen-texture');
    }

    protected createTexture() {
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(colorToNumber(Color.Yellow));
        
        // Create maltese cross pollen pattern (5 pixels, each 2x2: center, top, bottom, left, right)
        graphics.fillRect(2, 0, 2, 2); // top
        graphics.fillRect(0, 2, 2, 2); // left
        graphics.fillRect(2, 2, 2, 2); // center
        graphics.fillRect(4, 2, 2, 2); // right
        graphics.fillRect(2, 4, 2, 2); // bottom
        
        graphics.generateTexture(this.texture, 6, 6);
        graphics.destroy();
    }

    protected getParticleConfig(width: number, height: number): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {
        return {
            // Emission area
            x: { min: -width/2, max: width/2 },
            y: { min: -height/2, max: height/2 },
            
            // Movement properties for gentle drifting
            speedX: { min: -15, max: 15 },
            speedY: { min: 10, max: 30 },
            accelerationY: -5,
            
            // Gentle swaying motion
            frequency: 200,
            quantity: 1,
            
            // Long but finite lifespan (around 15 seconds)
            lifespan: { min: 12000, max: 18000 },
            
            // Fade in and out
            alpha: { start: 0.2, end: 0, ease: 'Quad.easeOut' },
            
            // Slight scale variation
            scale: { min: 0.8, max: 1.2 },
            
            // Gentle rotation
            rotate: { min: 0, max: 360 }
        };
    }

}