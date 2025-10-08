/// TODO: this needs to be moved into its own tool as part of https://github.com/PaimaStudios/midnight-game-2/issues/77

import { DeployedGame2API } from "game2-api";
import { BIOME_ID } from "./constants/biome";
import { BOSS_TYPE, EnemiesConfig, EnemyStats, Level, pureCircuits } from "game2-contract";
import { Def } from "./constants/def";
import { logger } from './logger';

export async function registerStartingContent(api: DeployedGame2API): Promise<void> {
    // Define enemy stats for different power levels


    // BOSSES
    const dragon: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(300), attack: BigInt(15), block: BigInt(15), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.WEAK), ice_def: BigInt(Def.EFFECTIVE) };
    const dragonStrong: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(450), attack: BigInt(22), block: BigInt(22), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.WEAK), ice_def: BigInt(Def.EFFECTIVE) };
    const dragonElite: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(600), attack: BigInt(30), block: BigInt(30), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.WEAK), ice_def: BigInt(Def.EFFECTIVE) };

    const enigma: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(42), attack: BigInt(30), block: BigInt(30), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const enigmaStrong: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(65), attack: BigInt(45), block: BigInt(45), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const enigmaElite: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(85), attack: BigInt(60), block: BigInt(60), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };

    const abominable: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(2), hp: BigInt(400), attack: BigInt(20), block: BigInt(20), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.SUPEREFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const abominableStrong: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(2), hp: BigInt(600), attack: BigInt(30), block: BigInt(30), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.SUPEREFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const abominableElite: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(2), hp: BigInt(800), attack: BigInt(40), block: BigInt(40), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.SUPEREFFECTIVE), ice_def: BigInt(Def.WEAK) };

    // MINIBOSSES
    const iceGolem: EnemyStats = { boss_type: BOSS_TYPE.miniboss, enemy_type: BigInt(0), hp: BigInt(80), attack: BigInt(5), block: BigInt(15), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const iceGolemStrong: EnemyStats = { boss_type: BOSS_TYPE.miniboss, enemy_type: BigInt(0), hp: BigInt(120), attack: BigInt(8), block: BigInt(22), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const iceGolemElite: EnemyStats = { boss_type: BOSS_TYPE.miniboss, enemy_type: BigInt(0), hp: BigInt(160), attack: BigInt(12), block: BigInt(30), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };

    // NORMAL ENEMIES
    const goblin: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(30), attack: BigInt(/*10*/5), block: BigInt(5), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const goblinStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(45), attack: BigInt(15), block: BigInt(8), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const goblinElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(60), attack: BigInt(20), block: BigInt(12), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };

    const fireSprite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(1), hp: BigInt(25), attack: BigInt(20), block: BigInt(0), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.IMMUNE), ice_def: BigInt(Def.EFFECTIVE) };
    const fireSpriteStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(1), hp: BigInt(38), attack: BigInt(30), block: BigInt(3), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.IMMUNE), ice_def: BigInt(Def.EFFECTIVE) };
    const fireSpriteElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(1), hp: BigInt(50), attack: BigInt(40), block: BigInt(5), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.IMMUNE), ice_def: BigInt(Def.EFFECTIVE) };

    const snowman: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(2), hp: BigInt(25), attack: BigInt(25), block: BigInt(0), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.SUPEREFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const snowmanStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(2), hp: BigInt(38), attack: BigInt(35), block: BigInt(2), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.SUPEREFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const snowmanElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(2), hp: BigInt(50), attack: BigInt(50), block: BigInt(4), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.SUPEREFFECTIVE), ice_def: BigInt(Def.WEAK) };

    const coyote: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(3), hp: BigInt(50), attack: BigInt(20), block: BigInt(0), physical_def: BigInt(Def.EFFECTIVE), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const coyoteStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(3), hp: BigInt(75), attack: BigInt(30), block: BigInt(1), physical_def: BigInt(Def.EFFECTIVE), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const coyoteElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(3), hp: BigInt(100), attack: BigInt(40), block: BigInt(2), physical_def: BigInt(Def.EFFECTIVE), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };

    const pyramid: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(4), hp: BigInt(50), attack: BigInt(20), block: BigInt(0), physical_def: BigInt(Def.IMMUNE), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.EFFECTIVE) };
    const pyramidStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(4), hp: BigInt(75), attack: BigInt(30), block: BigInt(1), physical_def: BigInt(Def.IMMUNE), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.EFFECTIVE) };
    const pyramidElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(4), hp: BigInt(100), attack: BigInt(40), block: BigInt(2), physical_def: BigInt(Def.IMMUNE), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.EFFECTIVE) };

    // Define all level configurations
    const grass1 = { biome: BigInt(BIOME_ID.grasslands), difficulty: BigInt(1) };
    const grass2 = { biome: BigInt(BIOME_ID.grasslands), difficulty: BigInt(2) };
    const grass3 = { biome: BigInt(BIOME_ID.grasslands), difficulty: BigInt(3) };
    const desert1 = { biome: BigInt(BIOME_ID.desert), difficulty: BigInt(1) };
    const desert2 = { biome: BigInt(BIOME_ID.desert), difficulty: BigInt(2) };
    const desert3 = { biome: BigInt(BIOME_ID.desert), difficulty: BigInt(3) };
    const tundra1 = { biome: BigInt(BIOME_ID.tundra), difficulty: BigInt(1) };
    const tundra2 = { biome: BigInt(BIOME_ID.tundra), difficulty: BigInt(2) };
    const tundra3 = { biome: BigInt(BIOME_ID.tundra), difficulty: BigInt(3) };
    const cave1 = { biome: BigInt(BIOME_ID.cave), difficulty: BigInt(1) };
    const cave2 = { biome: BigInt(BIOME_ID.cave), difficulty: BigInt(2) };
    const cave3 = { biome: BigInt(BIOME_ID.cave), difficulty: BigInt(3) };

    const levels: [Level, EnemiesConfig][] = [
        [grass1, makeEnemiesConfig([dragon])],
    ];
    const enemyConfigs: [Level, EnemiesConfig][] = [
        [grass1, makeEnemiesConfig([goblin, goblin, goblin])],
    ];
    // TODO: until https://github.com/PaimaStudios/midnight-game-2/issues/77 is resolved
    // it is prohibitively slow to register all content every single time you test the game
    // on-chain so we register the minimum (Grasslands Frontiers only)
    // run using `npm run build-mock` to register all content
    if (import.meta.env.VITE_API_FORCE_DEPLOY == 'mock') {
        levels.push(
            // Grasslands        
            [grass1, makeEnemiesConfig([dragon])],
            [grass2, makeEnemiesConfig([dragonStrong])],
            [grass3, makeEnemiesConfig([dragonElite])],

            // Desert
            [desert1, makeEnemiesConfig([enigma])],
            [desert2, makeEnemiesConfig([enigmaStrong])],
            [desert3, makeEnemiesConfig([enigmaElite])],

            // Tundra
            [tundra1, makeEnemiesConfig([abominable])],
            [tundra2, makeEnemiesConfig([abominableStrong])],
            [tundra3, makeEnemiesConfig([abominableElite])],

            // Cave
            [cave1, makeEnemiesConfig([dragon])],
            [cave2, makeEnemiesConfig([dragonStrong])],
            [cave3, makeEnemiesConfig([dragonElite])],
        );

        enemyConfigs.push(
            // Grasslands
            [grass1, makeEnemiesConfig([snowman, fireSprite])],

            [grass2, makeEnemiesConfig([goblinStrong, goblinStrong, goblinStrong])],
            [grass2, makeEnemiesConfig([snowmanStrong, fireSpriteStrong])],
            [grass2, makeEnemiesConfig([iceGolemStrong, goblinStrong])],

            [grass3, makeEnemiesConfig([goblinElite, goblinElite, goblinElite])],
            [grass3, makeEnemiesConfig([snowmanElite, fireSpriteElite])],
            [grass3, makeEnemiesConfig([iceGolemElite, goblinElite])],

            // Desert
            [desert1, makeEnemiesConfig([fireSprite, fireSprite])],
            [desert1, makeEnemiesConfig([goblin, fireSprite, coyote])],
            [desert1, makeEnemiesConfig([pyramid, coyote])],

            [desert2, makeEnemiesConfig([fireSpriteStrong, fireSpriteStrong, coyoteStrong])],
            [desert2, makeEnemiesConfig([goblinStrong, fireSpriteStrong])],
            [desert2, makeEnemiesConfig([goblinStrong, fireSpriteStrong, pyramidStrong])],
            [desert2, makeEnemiesConfig([fireSpriteStrong, fireSpriteStrong, goblinStrong])],

            [desert3, makeEnemiesConfig([fireSpriteElite, fireSpriteElite])],
            [desert3, makeEnemiesConfig([goblinElite, fireSpriteElite, coyoteElite])],
            [desert3, makeEnemiesConfig([fireSpriteElite, fireSpriteElite, goblinElite])],
            [desert3, makeEnemiesConfig([fireSpriteElite, pyramidElite, goblinElite])],

            // Tundra
            [tundra1, makeEnemiesConfig([snowman, snowman, snowman])],
            [tundra1, makeEnemiesConfig([iceGolem, snowman])],

            [tundra2, makeEnemiesConfig([snowmanStrong, snowmanStrong, snowmanStrong])],
            [tundra2, makeEnemiesConfig([iceGolemStrong, snowmanStrong])],
            [tundra2, makeEnemiesConfig([iceGolemStrong, iceGolemStrong])],

            [tundra3, makeEnemiesConfig([snowmanElite, snowmanElite, snowmanElite])],
            [tundra3, makeEnemiesConfig([iceGolemElite, snowmanElite])],
            [tundra3, makeEnemiesConfig([iceGolemElite, iceGolemElite])],

            // Cave
            [cave1, makeEnemiesConfig([goblin, fireSprite, goblin])],
            [cave1, makeEnemiesConfig([goblin, goblin, goblin])],

            [cave2, makeEnemiesConfig([goblinStrong, fireSpriteStrong, goblinStrong])],
            [cave2, makeEnemiesConfig([goblinStrong, goblinStrong, goblinStrong])],
            [cave2, makeEnemiesConfig([iceGolemStrong, fireSpriteStrong])],

            [cave3, makeEnemiesConfig([goblinElite, fireSpriteElite, goblinElite])],
            [cave3, makeEnemiesConfig([goblinElite, goblinElite, goblinElite])],
            [cave3, makeEnemiesConfig([iceGolemElite, fireSpriteElite])]
        );
    }
    // concurrency doesn't matter for performance since multiple requests would slow it down (batcher)
    // or don't matter at all (mockapi)
    for (let i = 0; i < levels.length; ++i) {
        logger.network.debug(`Registering level ${i + 1} / ${levels.length}`);
        await api.admin_level_new(levels[i][0], levels[i][1]);
    }
    for (let i = 0; i < enemyConfigs.length; ++i) {
        logger.network.debug(`Registering enemy config ${i + 1} / ${enemyConfigs.length}`);
        await api.admin_level_add_config(enemyConfigs[i][0], enemyConfigs[i][1]);
    }
}

function makeEnemiesConfig(stats: EnemyStats[]): EnemiesConfig {
    const padding = new Array(3 - stats.length).fill(pureCircuits.filler_enemy_stats());
    return {
        stats: [...stats, ...padding],
        count: BigInt(stats.length),
    }
}
