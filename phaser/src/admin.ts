/// TODO: this needs to be moved into its own tool as part of https://github.com/PaimaStudios/midnight-game-2/issues/77

import { DeployedGame2API } from "game2-api";
import { BIOME_ID } from "./constants/biome";
import { BOSS_TYPE, EnemiesConfig, EnemyStats, pureCircuits } from "game2-contract";
import { Def } from "./constants/def";

export async function registerStartingContent(api: DeployedGame2API): Promise<void> {
    const dragon: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(300), attack: BigInt(15), block: BigInt(15), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.WEAK), ice_def: BigInt(Def.EFFECTIVE) };
    const enigma: EnemyStats = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(42), attack: BigInt(30), block: BigInt(30), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };

    const goblin: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(30), attack: BigInt(10), block: BigInt(5), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.NEUTRAL), ice_def: BigInt(Def.NEUTRAL) };
    const fireSprite: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(1), hp: BigInt(25), attack: BigInt(20), block: BigInt(0), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.IMMUNE), ice_def: BigInt(Def.EFFECTIVE) };
    const iceGolem: EnemyStats = { boss_type: BOSS_TYPE.miniboss, enemy_type: BigInt(0), hp: BigInt(80), attack: BigInt(5), block: BigInt(15), physical_def: BigInt(Def.WEAK), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    const snowman: EnemyStats = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(3), hp: BigInt(25), attack: BigInt(20), block: BigInt(0), physical_def: BigInt(Def.NEUTRAL), fire_def: BigInt(Def.EFFECTIVE), ice_def: BigInt(Def.WEAK) };
    

    // Grasslands 1
    const grass1 = { biome: BigInt(BIOME_ID.grasslands), difficulty: BigInt(1) };
    await api.admin_level_new(grass1, makeEnemiesConfig([dragon]));
    await api.admin_level_add_config(grass1, makeEnemiesConfig([goblin, goblin, goblin]));
    await api.admin_level_add_config(grass1, makeEnemiesConfig([snowman, fireSprite]));

    // Desert 1
    const desert1 = { biome: BigInt(BIOME_ID.desert), difficulty: BigInt(1) };
    await api.admin_level_new(desert1, makeEnemiesConfig([enigma]));
    await api.admin_level_add_config(desert1, makeEnemiesConfig([fireSprite, fireSprite]));
    await api.admin_level_add_config(desert1, makeEnemiesConfig([goblin, fireSprite]));

    // Tundra 1
    const tundra1 = { biome: BigInt(BIOME_ID.tundra), difficulty: BigInt(1) };
    await api.admin_level_new(tundra1, makeEnemiesConfig([enigma]));
    await api.admin_level_add_config(tundra1, makeEnemiesConfig([snowman, snowman, snowman]));
    await api.admin_level_add_config(tundra1, makeEnemiesConfig([iceGolem, snowman]));

    // Cave 1
    const cave1 = { biome: BigInt(BIOME_ID.cave), difficulty: BigInt(1) };
    await api.admin_level_new(cave1, makeEnemiesConfig([dragon]));
    await api.admin_level_add_config(cave1, makeEnemiesConfig([goblin, fireSprite, goblin]));
    await api.admin_level_add_config(cave1, makeEnemiesConfig([goblin, goblin, goblin]));
}

function makeEnemiesConfig(stats: EnemyStats[]): EnemiesConfig {
    const padding = new Array(3 - stats.length).fill(pureCircuits.filler_enemy_stats());
    return {
        stats: [...stats, ...padding],
        count: BigInt(stats.length),
    }
}
