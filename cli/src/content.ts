/**
 * Content registration logic extracted from phaser/src/admin.ts
 * This can be used by both the CLI tool and the phaser app
 */

import { type DeployedGame2API } from 'game2-api';
import { BOSS_TYPE, type EnemiesConfig, type EnemyStats, type Level, pureCircuits } from 'game2-contract';
import { type Logger } from 'pino';

// Biome IDs
const BIOME_ID = {
  grasslands: 0,
  desert: 1,
  tundra: 2,
  cave: 3,
} as const;

// Defense values
const Def = {
  IMMUNE: 0n,
  WEAK: 1n,
  NEUTRAL: 2n,
  EFFECTIVE: 3n,
  SUPEREFFECTIVE: 4n,
} as const;

type EnemyMoveConfig = {
  attack?: number;
  block_self?: number;
  block_allies?: number;
  heal_self?: number;
  heal_allies?: number;
};

type EnemyStatsConfig = {
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
 */
export async function registerAllContent(
  api: DeployedGame2API,
  minimalOnly: boolean,
  logger: Logger
): Promise<void> {
  // Define boss configurations
  const dragon: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 0,
    hp: 300,
    moves: [{ attack: 30 }, { attack: 15, block_self: 15 }],
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

  const abominable: EnemyStatsConfig = {
    boss_type: BOSS_TYPE.boss,
    enemy_type: 2,
    hp: 400,
    moves: [{ attack: 20, block_self: 20 }, { attack: 30 }],
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

  // Define normal enemy configurations
  const goblin: EnemyStatsConfig = {
    enemy_type: 0,
    hp: 30,
    moves: [{ attack: 5, block_self: 5 }, { attack: 10 }, { block_self: 10 }],
    physical_def: Def.WEAK,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };

  const goblinPriest: EnemyStatsConfig = {
    enemy_type: 7,
    hp: 30,
    moves: [{ block_self: 5, block_allies: 10 }, { heal_allies: 15 }, { attack: 10, block_allies: 5 }],
    physical_def: Def.SUPEREFFECTIVE,
    fire_def: Def.WEAK,
    ice_def: Def.WEAK,
  };

  const goblin2: EnemyStatsConfig = {
    enemy_type: 8,
    hp: 100,
    moves: [{ heal_self: 1 }],
    physical_def: Def.WEAK,
    fire_def: Def.NEUTRAL,
    ice_def: Def.NEUTRAL,
  };

  // Define level coordinates
  const grass1 = { biome: BigInt(BIOME_ID.grasslands), difficulty: BigInt(1) };

  // Minimal content for quick testing
  const levels: [Level, EnemyStatsConfig[]][] = [[grass1, [dragon]]];

  const enemyConfigs: [Level, EnemyStatsConfig[]][] = [[grass1, [goblin, goblinPriest, goblin2]]];

  // Full content for production
  if (!minimalOnly) {
    // Add all other bosses, levels, and enemy configurations here
    // This would include all the content from phaser/src/admin.ts
    logger.info('Full content registration not yet implemented - registering minimal content only');
  }

  // Register levels (bosses)
  for (let i = 0; i < levels.length; ++i) {
    logger.info(`Registering level ${i + 1} / ${levels.length}`);
    await api.admin_level_new(levels[i][0], makeEnemiesConfig(levels[i][1].map(configToEnemyStats)));
  }

  // Register enemy configurations
  for (let i = 0; i < enemyConfigs.length; ++i) {
    logger.info(`Registering enemy config ${i + 1} / ${enemyConfigs.length}`);
    await api.admin_level_add_config(
      enemyConfigs[i][0],
      makeEnemiesConfig(enemyConfigs[i][1].map(configToEnemyStats))
    );
  }

  logger.info('Content registration complete!');
}
