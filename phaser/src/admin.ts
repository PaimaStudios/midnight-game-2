/// TODO: this needs to be moved into its own tool as part of https://github.com/PaimaStudios/midnight-game-2/issues/77

import { DeployedGame2API } from "game2-api";
import { BIOME_ID } from "./constants/biome";
import { BOSS_TYPE, EnemiesConfig, EnemyStats, pureCircuits } from "game2-contract";
import { Def } from "./constants/def";

export async function registerStartingContent(api: DeployedGame2API): Promise<void> {
    // Define enemy stats for different power levels
    const dragon: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(300), attack: BigInt(15), block: BigInt(15), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.WEAK), ice_def: BigInt(Def.EFFECTIVE) };
    const dragonStrong: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(450), attack: BigInt(22), block: BigInt(22), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.WEAK), ice_def: BigInt(Def.EFFECTIVE) };
    const dragonElite: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(600), attack: BigInt(30), block: BigInt(30), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.WEAK), ice_def: BigInt(Def.EFFECTIVE) };

    const enigma: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(42), attack: BigInt(30), block: BigInt(30), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const enigmaStrong: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(65), attack: BigInt(45), block: BigInt(45), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const enigmaElite: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(85), attack: BigInt(60), block: BigInt(60), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };

    const goblin: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(30), attack: BigInt(10), block: BigInt(5), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const goblinStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(45), attack: BigInt(15), block: BigInt(8), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const goblinElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(60), attack: BigInt(20), block: BigInt(12), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };

    const fireSprite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(1), hp: BigInt(25), attack: BigInt(20), block: BigInt(0), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.IMMUNE), ice_def: BigInt(Def.EFFECTIVE) };
    const fireSpriteStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(1), hp: BigInt(38), attack: BigInt(30), block: BigInt(3), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.IMMUNE), ice_def: BigInt(Def.EFFECTIVE) };
    const fireSpriteElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(1), hp: BigInt(50), attack: BigInt(40), block: BigInt(5), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.IMMUNE), ice_def: BigInt(Def.EFFECTIVE) };

    const iceGolem: EnemyStats = { boss_type: BOSS_TYPE.miniboss, enemy_type: BigInt(0), hp: BigInt(80), attack: BigInt(5), block: BigInt(15), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const iceGolemStrong: EnemyStats = { boss_type: BOSS_TYPE.miniboss, enemy_type: BigInt(0), hp: BigInt(120), attack: BigInt(8), block: BigInt(22), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const iceGolemElite: EnemyStats = { boss_type: BOSS_TYPE.miniboss, enemy_type: BigInt(0), hp: BigInt(160), attack: BigInt(12), block: BigInt(30), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };

    const snowman: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(3), hp: BigInt(25), attack: BigInt(20), block: BigInt(0), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const snowmanStrong: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(3), hp: BigInt(38), attack: BigInt(30), block: BigInt(3), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const snowmanElite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(3), hp: BigInt(50), attack: BigInt(40), block: BigInt(5), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };

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

    const levels = [
        api.admin_level_new(grass1, makeEnemiesConfig([dragon]))
    ];
    const enemyConfigs = [
        api.admin_level_add_config(grass1, makeEnemiesConfig([goblin, goblin, goblin]))
    ];
    // TODO: until https://github.com/PaimaStudios/midnight-game-2/issues/77 is resolved
    // it is prohibitively slow to register all content every single time you test the game
    // on-chain so we register the minimum (Grasslands Frontiers only)
    // run using `npm run build-mock` to register all content
    if (import.meta.env.VITE_API_FORCE_DEPLOY == 'mock') {
        levels.push(
            // Grasslands        
            api.admin_level_new(grass2, makeEnemiesConfig([dragonStrong])),
            api.admin_level_new(grass3, makeEnemiesConfig([dragonElite])),

            // Desert
            api.admin_level_new(desert1, makeEnemiesConfig([enigma])),
            api.admin_level_new(desert2, makeEnemiesConfig([enigmaStrong])),
            api.admin_level_new(desert3, makeEnemiesConfig([enigmaElite])),

            // Tundra
            api.admin_level_new(tundra1, makeEnemiesConfig([enigma])),
            api.admin_level_new(tundra2, makeEnemiesConfig([enigmaStrong])),
            api.admin_level_new(tundra3, makeEnemiesConfig([enigmaElite])),

            // Cave
            api.admin_level_new(cave1, makeEnemiesConfig([dragon])),
            api.admin_level_new(cave2, makeEnemiesConfig([dragonStrong])),
            api.admin_level_new(cave3, makeEnemiesConfig([dragonElite])),
        );

        enemyConfigs.push(
            // Grasslands
            api.admin_level_add_config(grass1, makeEnemiesConfig([snowman, fireSprite])),

            api.admin_level_add_config(grass2, makeEnemiesConfig([goblinStrong, goblinStrong, goblinStrong])),
            api.admin_level_add_config(grass2, makeEnemiesConfig([snowmanStrong, fireSpriteStrong])),
            api.admin_level_add_config(grass2, makeEnemiesConfig([iceGolemStrong, goblinStrong])),

            api.admin_level_add_config(grass3, makeEnemiesConfig([goblinElite, goblinElite, goblinElite])),
            api.admin_level_add_config(grass3, makeEnemiesConfig([snowmanElite, fireSpriteElite])),
            api.admin_level_add_config(grass3, makeEnemiesConfig([iceGolemElite, goblinElite])),

            // Desert
            api.admin_level_add_config(desert1, makeEnemiesConfig([fireSprite, fireSprite])),
            api.admin_level_add_config(desert1, makeEnemiesConfig([goblin, fireSprite])),

            api.admin_level_add_config(desert2, makeEnemiesConfig([fireSpriteStrong, fireSpriteStrong])),
            api.admin_level_add_config(desert2, makeEnemiesConfig([goblinStrong, fireSpriteStrong])),
            api.admin_level_add_config(desert2, makeEnemiesConfig([fireSpriteStrong, fireSpriteStrong, goblinStrong])),

            api.admin_level_add_config(desert3, makeEnemiesConfig([fireSpriteElite, fireSpriteElite])),
            api.admin_level_add_config(desert3, makeEnemiesConfig([goblinElite, fireSpriteElite])),
            api.admin_level_add_config(desert3, makeEnemiesConfig([fireSpriteElite, fireSpriteElite, goblinElite])),

            // Tundra
            api.admin_level_add_config(tundra1, makeEnemiesConfig([snowman, snowman, snowman])),
            api.admin_level_add_config(tundra1, makeEnemiesConfig([iceGolem, snowman])),

            api.admin_level_add_config(tundra2, makeEnemiesConfig([snowmanStrong, snowmanStrong, snowmanStrong])),
            api.admin_level_add_config(tundra2, makeEnemiesConfig([iceGolemStrong, snowmanStrong])),
            api.admin_level_add_config(tundra2, makeEnemiesConfig([iceGolemStrong, iceGolemStrong])),

            api.admin_level_add_config(tundra3, makeEnemiesConfig([snowmanElite, snowmanElite, snowmanElite])),
            api.admin_level_add_config(tundra3, makeEnemiesConfig([iceGolemElite, snowmanElite])),
            api.admin_level_add_config(tundra3, makeEnemiesConfig([iceGolemElite, iceGolemElite])),

            // Cave
            api.admin_level_add_config(cave1, makeEnemiesConfig([goblin, fireSprite, goblin])),
            api.admin_level_add_config(cave1, makeEnemiesConfig([goblin, goblin, goblin])),

            api.admin_level_add_config(cave2, makeEnemiesConfig([goblinStrong, fireSpriteStrong, goblinStrong])),
            api.admin_level_add_config(cave2, makeEnemiesConfig([goblinStrong, goblinStrong, goblinStrong])),
            api.admin_level_add_config(cave2, makeEnemiesConfig([iceGolemStrong, fireSpriteStrong])),

            api.admin_level_add_config(cave3, makeEnemiesConfig([goblinElite, fireSpriteElite, goblinElite])),
            api.admin_level_add_config(cave3, makeEnemiesConfig([goblinElite, goblinElite, goblinElite])),
            api.admin_level_add_config(cave3, makeEnemiesConfig([iceGolemElite, fireSpriteElite]))
        );
    }
    await Promise.all(levels);
    // we need levels registered before we do this
    await Promise.all(enemyConfigs);
}

function makeEnemiesConfig(stats: EnemyStats[]): EnemiesConfig {
    const padding = new Array(3 - stats.length).fill(pureCircuits.filler_enemy_stats());
    return {
        stats: [...stats, ...padding],
        count: BigInt(stats.length),
    }
}
