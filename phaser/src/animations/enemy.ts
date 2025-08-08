/**
 * Enemy animation definitions and creation functions
 */

// Animation timing constants
export const ENEMY_ANIMATION_DURATIONS = {
    idle: 1200,
    attack: 1200,
    hurt: 400,
    death: 1500
};

export enum SPRITE_SHEET_ENEMIES {
    GOBLIN = 'goblin',
    SNOWMAN = 'snowman',
    FIRE_SPRITE = 'fire-sprite'
}

export function createEnemyAnimations(scene: Phaser.Scene): void {
    // Enemies with 2-frame sprite sheets
    const spriteSheetEnemies = Object.values(SPRITE_SHEET_ENEMIES);
    
    for (const enemyType of spriteSheetEnemies) {
        const textureKey = `enemy-${enemyType}`;
        
        // Only create animations if the texture exists
        if (!scene.textures.exists(textureKey)) {
            continue;
        }

        // Create 2-frame idle animation
        scene.anims.create({
            key: `${enemyType}-idle`,
            frames: [0, 1].map((i) => { return { frame: i, key: textureKey }; }),
            repeat: -1,
            duration: ENEMY_ANIMATION_DURATIONS.idle
        });

        // Create attack animation
        scene.anims.create({
            key: `${enemyType}-attack`, 
            frames: [{ frame: 2, key: textureKey }],
            repeat: 0,
            duration: ENEMY_ANIMATION_DURATIONS.attack
        });

        // Create hurt animation (quick flash between frames)
        scene.anims.create({
            key: `${enemyType}-hurt`,
            frames: [1, 0].map((i) => { return { frame: i, key: textureKey }; }),
            repeat: 0, 
            duration: ENEMY_ANIMATION_DURATIONS.hurt
        });

        // Create death animation (fade to second frame)
        scene.anims.create({
            key: `${enemyType}-death`,
            frames: [{ frame: 1, key: textureKey }],
            repeat: 0,
            duration: ENEMY_ANIMATION_DURATIONS.death
        });
    }
    
    // Single-frame boss enemies (fallback to static animations)
    const singleFrameEnemies = ['boss-dragon-1', 'boss-enigma-1'];
    
    for (const enemyType of singleFrameEnemies) {
        const baseName = enemyType.replace(/-1$/, '');
        const textureKey = `enemy-${enemyType}`;
        
        // Only create animations if the texture exists
        if (!scene.textures.exists(textureKey)) {
            continue;
        }

        // Create idle animation (single frame)
        scene.anims.create({
            key: `${baseName}-idle`,
            frames: [{ frame: 0, key: textureKey }],
            repeat: -1,
            duration: ENEMY_ANIMATION_DURATIONS.idle
        });

        // Create attack animation (single frame)
        scene.anims.create({
            key: `${baseName}-attack`, 
            frames: [{ frame: 2, key: textureKey }],
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
