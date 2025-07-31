/**
 * Enemy animation definitions and creation functions
 */

// Animation timing constants
export const ENEMY_ANIMATION_DURATIONS = {
    idle: 1000,
    attack: 600,
    hurt: 400,
    death: 1500
};

export function createEnemyAnimations(scene: Phaser.Scene): void {
    // For now, create placeholder animations that work with single-frame sprites
    // These can be expanded when sprite sheets are available
    
    const enemyTypes = [
        'goblin',
        'snowman', 
        'fire-sprite',
        'boss-dragon-1',
        'boss-enigma-1'
    ];
    
    for (const enemyType of enemyTypes) {
        const baseName = enemyType.replace(/-1$/, '');
        const textureKey = `enemy-${enemyType}`;
        
        // Only create animations if the texture exists
        if (!scene.textures.exists(textureKey)) {
            continue;
        }

        // Create idle animation (single frame for now, can be expanded to multi-frame)
        scene.anims.create({
            key: `${baseName}-idle`,
            frames: [{ frame: 0, key: textureKey }],
            repeat: -1,
            duration: ENEMY_ANIMATION_DURATIONS.idle
        });

        // Create attack animation (single frame with different timing)
        scene.anims.create({
            key: `${baseName}-attack`, 
            frames: [{ frame: 0, key: textureKey }],
            repeat: 0,
            duration: ENEMY_ANIMATION_DURATIONS.attack
        });

        // Create hurt animation (single frame)
        scene.anims.create({
            key: `${baseName}-hurt`,
            frames: [{ frame: 0, key: textureKey }],
            repeat: 0, 
            duration: ENEMY_ANIMATION_DURATIONS.hurt
        });

        // Create death animation (single frame)
        scene.anims.create({
            key: `${baseName}-death`,
            frames: [{ frame: 0, key: textureKey }],
            repeat: 0,
            duration: ENEMY_ANIMATION_DURATIONS.death
        });
    }
}

// Future expansion: when sprite sheets become available, this function can be extended
export function createEnemySpriteSheetAnimations(scene: Phaser.Scene): void {
    // Example for when multi-frame sprite sheets are available:
    /*
    scene.anims.create({
        key: 'goblin-idle',
        frames: scene.anims.generateFrameNumbers('enemy-goblin-sheet', { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1
    });
    
    scene.anims.create({
        key: 'goblin-attack',
        frames: scene.anims.generateFrameNumbers('enemy-goblin-sheet', { start: 4, end: 7 }),
        frameRate: 10,
        repeat: 0
    });
    */
}