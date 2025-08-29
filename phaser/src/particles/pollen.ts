export class PollenParticleSystem {
    private scene: Phaser.Scene;
    private particleManager!: Phaser.GameObjects.Particles.ParticleEmitter;
    private texture: string = 'pollen-texture';

    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
        this.scene = scene;
        this.createPollenTexture();
        this.createParticleSystem(x, y, width, height);
    }

    private createPollenTexture() {
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(0xFFFF99);
        
        // Create maltese cross pattern (5 pixels, each 2x2: center, top, bottom, left, right)
        graphics.fillRect(2, 0, 2, 2); // top
        graphics.fillRect(0, 2, 2, 2); // left
        graphics.fillRect(2, 2, 2, 2); // center
        graphics.fillRect(4, 2, 2, 2); // right
        graphics.fillRect(2, 4, 2, 2); // bottom
        
        graphics.generateTexture(this.texture, 6, 6);
        graphics.destroy();
    }

    private createParticleSystem(x: number, y: number, width: number, height: number) {
        this.particleManager = this.scene.add.particles(x, y, this.texture, {
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
        });
        
        // Set particle depth
        this.particleManager.setDepth(-5);

        // Add subtle wind effect
        this.scene.time.addEvent({
            delay: 3000,
            callback: () => {
                const windStrength = Phaser.Math.Between(-10, 10);
                this.particleManager.setConfig({
                    speedX: { min: windStrength - 5, max: windStrength + 5 }
                });
            },
            loop: true
        });
    }

    public start() {
        this.particleManager.start();
    }

    public stop() {
        this.particleManager.stop();
    }

    public destroy() {
        this.particleManager.destroy();
    }

    public setPosition(x: number, y: number) {
        this.particleManager.setPosition(x, y);
    }

    public setVisible(visible: boolean) {
        this.particleManager.setVisible(visible);
    }
}