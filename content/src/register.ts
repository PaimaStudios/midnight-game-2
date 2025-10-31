/**
 * Shared content registration logic
 * Used by both CLI tools and Phaser app
 */

import { type DeployedGame2API } from 'game2-api';
import { BOSS_TYPE, type EnemiesConfig, type EnemyStats, type Level, pureCircuits } from 'game2-contract';
import { type Logger } from 'pino';

// Biome IDs
export const BIOME_ID = {
  grasslands: 0,
  desert: 1,
  tundra: 2,
  cave: 3,
} as const;

// Defense values
export const Def = {
  SUPEREFFECTIVE: 0n,
  EFFECTIVE: 1n,
  NEUTRAL: 2n,
  WEAK: 3n,
  IMMUNE: 4n,
} as const;

export type EnemyMoveConfig = {
  attack?: number;
  block_self?: number;
  block_allies?: number;
  heal_self?: number;
  heal_allies?: number;
};

export type EnemyStatsConfig = {
  boss_type?: BOSS_TYPE;
  enemy_type: number;
  hp: number;
  moves: EnemyMoveConfig[];
  physical_def: bigint;
  fire_def: bigint;
  ice_def: bigint;
};

function configToEnemyStats(config: EnemyStatsConfig): EnemyStats {
  return {
    boss_type: config.boss_type ?? BOSS_TYPE.normal,
    enemy_type: BigInt(config.enemy_type),
    hp: BigInt(config.hp),
    moves: config.moves
      .map((move) => {
        return {
          attack: BigInt(move.attack ?? 0),
          block_self: BigInt(move.block_self ?? 0),
          block_allies: BigInt(move.block_allies ?? 0),
          heal_self: BigInt(move.heal_self ?? 0),
          heal_allies: BigInt(move.heal_allies ?? 0),
        };
      })
      .concat(new Array(3 - config.moves.length).fill(pureCircuits.filler_move())),
    move_count: BigInt(config.moves.length),
    physical_def: config.physical_def,
    fire_def: config.fire_def,
    ice_def: config.ice_def,
  };
}

function makeEnemiesConfig(stats: EnemyStats[]): EnemiesConfig {
  const padding = new Array(3 - stats.length).fill(pureCircuits.filler_enemy_stats());
  return {
    stats: [...stats, ...padding],
    count: BigInt(stats.length),
  };
}

/**
 * Register all game content - bosses, levels, and enemy configurations
 * @param api - The deployed Game API
 * @param minimalOnly - If true, only register minimal content (Grasslands Frontiers)
 * @param logger - Logger for progress messages
 */
export async function registerStartingContent(
  api: DeployedGame2API,
  minimalOnly: boolean,
  logger: Logger | Pick<Console, 'log'> | { info: (msg: string) => void }
): Promise<void> {
  // Helper to log at info level for progress visibility
  const log = (msg: string) => {
    if ('info' in logger && typeof logger.info === 'function') {
      logger.info(msg);
    } else if ('log' in logger && typeof logger.log === 'function') {
      logger.log(msg);
    }
  };

  // BOSSES
  const dragon: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 0,
    hp: 300,
    moves: [{ attack: 30 }, { attack: 15, block_self: 15 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.WEAK,
    ice_def: Def.EFFECTIVE,
  };
  const dragonStrong: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 0,
    hp: 450,
    moves: [{ attack: 45 }, { attack: 22, block_self: 22 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.WEAK,
    ice_def: Def.EFFECTIVE,
  };
  const dragonElite: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 0,
    hp: 600,
    moves: [{ attack: 60 }, { attack: 30, block_self: 30 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.WEAK,
    ice_def: Def.EFFECTIVE,
  };

  const enigma: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 1,
    hp: 42,
    moves: [{ attack: 30, block_self: 30 }],
    physical_def: Def.WEAK,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const enigmaStrong: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 1,
    hp: 64,
    moves: [{ attack: 45, block_self: 45 }],
    physical_def: Def.WEAK,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const enigmaElite: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 1,
    hp: 86,
    moves: [{ attack: 60, block_self: 60 }],
    physical_def: Def.WEAK,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };

  const abominable: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 2,
    hp: 400,
    moves: [{ attack: 20, block_self: 20 }, { attack: 30 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.SUPEREFFECTIVE,
    ice_def: Def.WEAK,
  };
  const abominableStrong: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 2,
    hp: 600,
    moves: [{ attack: 30, block_self: 30 }, { attack: 45 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.SUPEREFFECTIVE,
    ice_def: Def.WEAK,
  };
  const abominableElite: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 2,
    hp: 800,
    moves: [{ attack: 40, block_self: 40 }, { attack: 60 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.SUPEREFFECTIVE,
    ice_def: Def.WEAK,
  };

  const sphinx: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 3,
    hp: 400,
    moves: [{ attack: 35, block_self: 10 }, { attack: 20, block_self: 20 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const sphinxStrong: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 3,
    hp: 600,
    moves: [{ attack: 50, block_self: 15 }, { attack: 30, block_self: 30 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const sphinxElite: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 3,
    hp: 800,
    moves: [{ attack: 70, block_self: 20 }, { attack: 40, block_self: 40 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };

  // NORMAL ENEMIES
  const goblin: EnemyStatsConfig = {
    enemy_type: 0,
    hp: 30,
    moves: [{ attack: 5, block_self: 5 }, { attack: 10 }, { block_self: 10 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const goblinStrong: EnemyStatsConfig = {
    enemy_type: 0,
    hp: 45,
    moves: [{ attack: 10, block_self: 5 }, { attack: 15 }, { block_self: 15 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const goblinElite: EnemyStatsConfig = {
    enemy_type: 0,
    hp: 60,
    moves: [{ attack: 10, block_self: 10 }, { attack: 20 }, { block_self: 20 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };

  const fireSprite: EnemyStatsConfig = {
    enemy_type: 1,
    hp: 25,
    moves: [{ attack: 20 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.IMMUNE,
    ice_def: Def.EFFECTIVE,
  };
  const fireSpriteStrong: EnemyStatsConfig = {
    enemy_type: 1,
    hp: 38,
    moves: [{ attack: 30 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.IMMUNE,
    ice_def: Def.EFFECTIVE,
  };
  const fireSpriteElite: EnemyStatsConfig = {
    enemy_type: 1,
    hp: 50,
    moves: [{ attack: 40 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.IMMUNE,
    ice_def: Def.EFFECTIVE,
  };

  const coyote: EnemyStatsConfig = {
    enemy_type: 3,
    hp: 50,
    moves: [{ attack: 20 }],
    physical_def: Def.EFFECTIVE,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const coyoteStrong: EnemyStatsConfig = {
    enemy_type: 3,
    hp: 75,
    moves: [{ attack: 30, block_self: 1 }],
    physical_def: Def.EFFECTIVE,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const coyoteElite: EnemyStatsConfig = {
    enemy_type: 3,
    hp: 100,
    moves: [{ attack: 40, block_self: 2 }],
    physical_def: Def.EFFECTIVE,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };

  const pyramid: EnemyStatsConfig = {
    enemy_type: 4,
    hp: 50,
    moves: [{ attack: 20 }, { block_allies: 10 }, { heal_allies: 10 }],
    physical_def: Def.IMMUNE,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.EFFECTIVE,
  };
  const pyramidStrong: EnemyStatsConfig = {
    enemy_type: 4,
    hp: 75,
    moves: [{ attack: 30 }, { block_allies: 15 }, { heal_allies: 15 }],
    physical_def: Def.IMMUNE,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.EFFECTIVE,
  };
  const pyramidElite: EnemyStatsConfig = {
    enemy_type: 4,
    hp: 100,
    moves: [{ attack: 40 }, { block_allies: 20 }, { heal_allies: 20 }],
    physical_def: Def.IMMUNE,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.EFFECTIVE,
  };

  const hellspawn: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.miniboss,
    enemy_type: 6,
    hp: 80,
    moves: [{ attack: 40, block_self: 1 }, { attack: 30, heal_self: 10 }],
    physical_def: Def.IMMUNE,
    fire_def: Def.WEAK,
    ice_def: Def.SUPEREFFECTIVE,
  };
  const hellspawnStrong: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.miniboss,
    enemy_type: 6,
    hp: 120,
    moves: [{ attack: 60, block_self: 2 }, { attack: 45, heal_self: 15 }],
    physical_def: Def.IMMUNE,
    fire_def: Def.WEAK,
    ice_def: Def.SUPEREFFECTIVE,
  };
  const hellspawnElite: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.miniboss,
    enemy_type: 6,
    hp: 160,
    moves: [{ attack: 80, block_self: 5 }, { attack: 60, heal_self: 20 }],
    physical_def: Def.IMMUNE,
    fire_def: Def.WEAK,
    ice_def: Def.SUPEREFFECTIVE,
  };

  const goblinPriest: EnemyStatsConfig = {
    enemy_type: 7,
    hp: 30,
    moves: [{ block_self: 5, block_allies: 10 }, { heal_allies: 15 }, { attack: 10, block_allies: 5 }],
    physical_def: Def.SUPEREFFECTIVE,
    fire_def: Def.WEAK,
    ice_def: Def.WEAK,
  };
  const goblinPriestStrong: EnemyStatsConfig = {
    enemy_type: 7,
    hp: 45,
    moves: [{ block_self: 7, block_allies: 15 }, { heal_allies: 23 }, { attack: 15, block_allies: 8 }],
    physical_def: Def.SUPEREFFECTIVE,
    fire_def: Def.WEAK,
    ice_def: Def.WEAK,
  };
  const goblinPriestElite: EnemyStatsConfig = {
    enemy_type: 7,
    hp: 60,
    moves: [{ block_self: 10, block_allies: 20 }, { heal_allies: 30 }, { attack: 20, block_allies: 10 }],
    physical_def: Def.SUPEREFFECTIVE,
    fire_def: Def.WEAK,
    ice_def: Def.WEAK,
  };

  const goblinSwordmaster: EnemyStatsConfig = {
    enemy_type: 8,
    hp: 20,
    moves: [{ attack: 10, block_self: 2 }, { attack: 10 }, { attack: 15 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const goblinSwordmasterStrong: EnemyStatsConfig = {
    enemy_type: 8,
    hp: 35,
    moves: [{ attack: 25, block_self: 5 }, { attack: 15 }, { attack: 23 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };
  const goblinSwordmasterElite: EnemyStatsConfig = {
    enemy_type: 8,
    hp: 50,
    moves: [{ attack: 45, block_self: 9 }, { attack: 20 }, { attack: 30 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };

  const iceGolem: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.miniboss,
    enemy_type: 0,
    hp: 80,
    moves: [{ attack: 5, block_self: 15 }, { block_self: 40 }, { attack: 10, block_self: 10 }],
    physical_def: Def.WEAK,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.IMMUNE,
  };
  const iceGolemStrong: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.miniboss,
    enemy_type: 0,
    hp: 120,
    moves: [{ attack: 8, block_self: 22 }, { block_self: 60 }, { attack: 15, block_self: 15 }],
    physical_def: Def.WEAK,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.IMMUNE,
  };
  const iceGolemElite: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.miniboss,
    enemy_type: 0,
    hp: 160,
    moves: [{ attack: 10, block_self: 30 }, { block_self: 80 }, { attack: 20, block_self: 20 }],
    physical_def: Def.WEAK,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.IMMUNE,
  };

  const snowman: EnemyStatsConfig = {
    enemy_type: 3,
    hp: 25,
    moves: [{ attack: 20 }, { attack: 15, block_self: 5 }, { attack: 10 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.WEAK,
  };
  const snowmanStrong: EnemyStatsConfig = {
    enemy_type: 3,
    hp: 38,
    moves: [{ attack: 30 }, { attack: 22, block_self: 8 }, { attack: 15 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.WEAK,
  };
  const snowmanElite: EnemyStatsConfig = {
    enemy_type: 3,
    hp: 50,
    moves: [{ attack: 40 }, { attack: 30, block_self: 10 }, { attack: 20 }],
    physical_def: Def.NEUTRAL,
    fire_def: Def.EFFECTIVE,
    ice_def: Def.WEAK,
  };

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

  const levels: [Level, EnemyStatsConfig[]][] = [[grass1, [dragon]]];
  const enemyConfigs: [Level, EnemyStatsConfig[]][] = [
    // TODO: change back to 3x goblin once damage icons work
    [grass1, [goblin, goblinPriest]],
  ];

  // Register full content if not minimal
  if (!minimalOnly) {
    levels.push(
      // Grasslands
      // [grass1, [dragon]], // grass1 IS ALREADY ADDED ABOVE IN `levels` DEFINITION SO THIS IS UNNEEDED. 
      [grass2, [dragonStrong]],
      [grass3, [dragonElite]],

      // Desert
      [desert1, [sphinx]],
      [desert2, [sphinxStrong]],
      [desert3, [sphinxElite]],

      // Tundra
      [tundra1, [abominable]],
      [tundra2, [abominableStrong]],
      [tundra3, [abominableElite]],

      // Cave
      [cave1, [enigma]],
      [cave2, [enigmaStrong]],
      [cave3, [enigmaElite]]
    );

    enemyConfigs.push(
      // Grasslands
      [grass1, [snowman, fireSprite]],
      [grass1, [goblinSwordmaster, goblin, goblinSwordmaster]],

      [grass2, [goblinStrong, goblinPriestStrong, goblinStrong]],
      [grass2, [snowmanStrong, fireSpriteStrong]],
      [grass2, [iceGolemStrong, goblinStrong]],
      [grass2, [goblinSwordmasterStrong, goblinSwordmasterStrong, goblinPriestStrong]],

      [grass3, [goblinElite, goblinPriestElite, goblinElite]],
      [grass3, [snowmanElite, fireSpriteElite]],
      [grass3, [iceGolemElite, goblinElite]],
      [grass3, [goblinSwordmasterElite, goblinSwordmasterElite, goblinSwordmasterElite]],

      // Desert
      [desert1, [fireSprite, fireSprite]],
      [desert1, [goblin, fireSprite, coyote]],
      [desert1, [pyramid, coyote, goblinPriest]],
      [desert1, [hellspawn, coyote]],
      [desert1, [goblinSwordmaster, coyote, goblinSwordmaster]],

      [desert2, [fireSpriteStrong, fireSpriteStrong, coyoteStrong]],
      [desert2, [goblinStrong, fireSpriteStrong, goblinPriestStrong]],
      [desert2, [goblinStrong, fireSpriteStrong, pyramidStrong]],
      [desert2, [fireSpriteStrong, fireSpriteStrong, goblinStrong]],
      [desert1, [hellspawnStrong, coyoteStrong]],
      [desert2, [goblinSwordmasterStrong, pyramidStrong, goblinSwordmasterStrong]],

      [desert3, [fireSpriteElite, fireSpriteElite]],
      [desert3, [goblinElite, fireSpriteElite, coyoteElite]],
      [desert3, [fireSpriteElite, goblinPriestElite, goblinElite]],
      [desert3, [fireSpriteElite, pyramidElite, goblinElite]],
      [desert1, [hellspawnElite, coyoteElite]],
      [desert3, [goblinSwordmasterElite, coyoteElite, goblinSwordmasterElite]],

      // Tundra
      [tundra1, [snowman, snowman, snowman]],
      [tundra1, [iceGolem, snowman]],

      [tundra2, [snowmanStrong, snowmanStrong, snowmanStrong]],
      [tundra2, [iceGolemStrong, snowmanStrong]],
      [tundra2, [iceGolemStrong, iceGolemStrong]],

      [tundra3, [snowmanElite, snowmanElite, snowmanElite]],
      [tundra3, [iceGolemElite, snowmanElite]],
      [tundra3, [iceGolemElite, iceGolemElite]],

      // Cave
      [cave1, [goblin, fireSprite, goblin]],
      [cave1, [goblin, goblin, goblin]],
      [cave1, [goblin, goblinPriest, goblin]],
      [cave1, [goblin, hellspawn]],
      [cave1, [goblin, hellspawn, goblinPriest]],
      [cave1, [goblinSwordmaster, goblinSwordmaster, goblinPriest]],

      [cave2, [goblinStrong, fireSpriteStrong, goblinStrong]],
      [cave2, [goblinStrong, goblinStrong, goblinStrong]],
      [cave2, [goblinStrong, goblinPriestStrong, goblinStrong]],
      [cave2, [iceGolemStrong, fireSpriteStrong]],
      [cave2, [hellspawnStrong, goblinStrong, goblinPriestStrong]],
      [cave2, [goblinSwordmasterStrong, goblinSwordmasterStrong, goblinSwordmasterStrong]],

      [cave3, [goblinElite, fireSpriteElite, goblinElite]],
      [cave3, [goblinElite, goblinElite, goblinElite]],
      [cave3, [goblinElite, goblinPriestElite, goblinElite]],
      [cave3, [iceGolemElite, fireSpriteElite]],
      [cave3, [hellspawnElite, goblinElite]],
      [cave3, [hellspawnElite, goblinElite, goblinPriestElite]],
      [cave3, [goblinSwordmasterElite, goblinPriestElite, goblinSwordmasterElite]]
    );
  }

  // Register all levels and enemy configs
  log(`Starting content registration (${minimalOnly ? 'minimal' : 'full'} mode)`);
  log(`Registering ${levels.length} levels...`);

  for (let i = 0; i < levels.length; ++i) {
    log(`  Level ${i + 1} / ${levels.length}`);
    await api.admin_level_new(levels[i][0], makeEnemiesConfig(levels[i][1].map(configToEnemyStats)));
  }

  log(`Registering ${enemyConfigs.length} enemy configurations...`);
  for (let i = 0; i < enemyConfigs.length; ++i) {
    log(`  Enemy config ${i + 1} / ${enemyConfigs.length}`);
    await api.admin_level_add_config(
      enemyConfigs[i][0],
      makeEnemiesConfig(enemyConfigs[i][1].map(configToEnemyStats))
    );
  }

  log(`Content registration complete! Registered ${levels.length} levels and ${enemyConfigs.length} enemy configs.`);
}
