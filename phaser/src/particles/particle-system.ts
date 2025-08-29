export abstract class ParticleSystem {
    protected scene: Phaser.Scene;
    protected particleManager!: Phaser.GameObjects.Particles.ParticleEmitter;
    protected texture: string;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, textureName: string) {
        this.scene = scene;
        this.texture = textureName;
        this.createTexture();
        this.createParticleSystem(x, y, width, height);
    }

    protected abstract createTexture(): void;

    protected createParticleSystem(x: number, y: number, width: number, height: number) {
        const config = this.getParticleConfig(width, height);
        this.particleManager = this.scene.add.particles(x, y, this.texture, config);
        this.particleManager.setDepth(-5);
        this.setupWindEffect();
    }

    protected abstract getParticleConfig(width: number, height: number): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

    protected setupWindEffect() {
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

    public setDepth(depth: number) {
        this.particleManager.setDepth(depth);
    }
}