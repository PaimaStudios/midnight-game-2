/**
 * Spirit animation definitions and creation functions
 */

export const spiritAuraIdleKey = 'spirit-aura-idle';
export const chargeAnimKey = 'charge';
export const orbAuraIdleKey = 'orb-aura';

const SPIRIT_AURA_IDLE_ANIM_TIME = 4500;
const SPIRIT_IDLE_ANIM_TIME = 650;
const ORB_AURA_IDLE_ANIM_TIME = 1000;
export const CHARGE_ANIM_TIME = 1000;
const SPIRIT_ATTACK_ANIM_TIME = 1000;

export function createSpiritAnimations(scene: Phaser.Scene) {
    scene.anims.create({
        key: spiritAuraIdleKey,
        frames: [0, 1, 2, 1, 2, 1, 0, 1, 0, 1].map((i) => { return { frame: i, key: 'spirit-aura' }; }),
        repeat: -1,
        duration: SPIRIT_AURA_IDLE_ANIM_TIME,
    });

    scene.anims.create({
        key: chargeAnimKey,
        frames: [0, 1, 2, 3, 5].map((i) => { return { frame: i, key: 'spirit-aura' }; }),
        repeat: 0,
        duration: CHARGE_ANIM_TIME,
    });

    scene.anims.create({
        key: orbAuraIdleKey,
        frames: [0, 1, 2, 3].map((i) => { return { frame: i, key: orbAuraIdleKey }; }),
        repeat: -1,
        duration: ORB_AURA_IDLE_ANIM_TIME,
    });
    const affixes = ['atk-fire', 'atk-ice', 'atk-phys', 'def'];
    // spirit idle
    for (const affix of affixes) {
        const key = `spirit-${affix}`;
        scene.anims.create({
            key,
            frames: [0, 1].map((i) => { return { frame: i, key }; }),
            repeat: -1,
            duration: SPIRIT_IDLE_ANIM_TIME,
        });
    }
    
    // spirit attack
    for (const affix of affixes) {
        const key = `spirit-${affix}`;
        scene.anims.create({
            key: `${key}-attack`,
            frames: [2, 3].map((i) => { return { frame: i, key }; }),
            repeat: 0,
            duration: SPIRIT_ATTACK_ANIM_TIME,
        });
    }
}