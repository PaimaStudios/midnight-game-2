// ---------------------------------------------------------------------------
// game-db.ts — Database schema, ledger sync, and query functions
// ---------------------------------------------------------------------------
//
// Verified payload layout (from GAME_DB_DEBUG=1 output):
//
// payload["0"]:
//   [0] all_abilities        (Map<Field, Ability>)           — map[0], 8 keys
//   [1] ability_base_phys_id (scalar)
//   [2] ability_base_block_id (scalar)
//   [3] ability_base_fire_aoe_id (scalar)
//
// payload["1"]:
//   [0] ability_base_ice_id (scalar)
//   [1] ability_reward_id (scalar)
//   [2] ability_demo_starting_1_id (scalar)
//   [3] ability_demo_starting_2_id (scalar)
//   [4] ability_demo_starting_3_id (scalar)
//   [5] active_battle_states (Map<Field, BattleState>)       — map[1]
//   [6] active_battle_configs(Map<Field, BattleConfig>)      — map[2]
//   [7] quests               (Map<Field, QuestConfig>)       — map[3]
//   [8] players              (Map<Field, Player>)            — map[4]
//   [9] player_abilities     (Map<Field, Map<Field, Uint32>>)— map[5]
//  [10] player_boss_progress (Map<Field, Map<...>>)          — map[6]
//  [11] deployer (scalar)
//  [12] levels               (Map<Level, Map<...>>)          — map[7]
//  [13] bosses               (Map<Level, EnemiesConfig>)     — map[8]
//  [14] quest_duration (scalar, 0)
//
// Struct values are packed as single LE-byte scalars by the Compact compiler.
// Player{gold: Uint<32>, rng: Bytes<32>} → gold is bits 0-31
// BattleState{round, deck_indices[3], damage_to_player, damage_to_enemy_0/1/2,
//             enemy_move_index_0/1/2} → all Uint<32>, each 32 bits
// BattleConfig{level, enemies, player_pub_key, loadout} → packed, config is huge
// QuestConfig{level, player_pub_key, loadout, start_time} → packed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Packed struct helpers
// ---------------------------------------------------------------------------

/** Extract a 32-bit unsigned field from a packed LE bigint at a given field index (0-based). */
function extractU32(packed: bigint, fieldIndex: number): number {
  return Number((packed >> BigInt(fieldIndex * 32)) & 0xFFFFFFFFn);
}

/** Safely convert a value (number, bigint, or string) to BigInt. */
function toBigInt(value: any): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export async function ensureTables(db: any): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_players (
      player_id       TEXT PRIMARY KEY,
      gold            BIGINT NOT NULL DEFAULT 0,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_player_abilities (
      player_id       TEXT NOT NULL,
      ability_id      TEXT NOT NULL,
      quantity        INTEGER NOT NULL DEFAULT 0,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, ability_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_boss_progress (
      player_id       TEXT NOT NULL,
      biome           INTEGER NOT NULL,
      difficulty      INTEGER NOT NULL,
      completed       BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, biome, difficulty)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_battles (
      battle_id           TEXT PRIMARY KEY,
      player_id           TEXT NOT NULL,
      biome               INTEGER NOT NULL,
      difficulty          INTEGER NOT NULL,
      round               INTEGER NOT NULL DEFAULT 0,
      damage_to_player    INTEGER NOT NULL DEFAULT 0,
      damage_to_enemy_0   INTEGER NOT NULL DEFAULT 0,
      damage_to_enemy_1   INTEGER NOT NULL DEFAULT 0,
      damage_to_enemy_2   INTEGER NOT NULL DEFAULT 0,
      raw_state           TEXT,
      raw_config          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_quests (
      quest_id        TEXT PRIMARY KEY,
      player_id       TEXT NOT NULL,
      biome           INTEGER NOT NULL,
      difficulty      INTEGER NOT NULL,
      start_time      BIGINT NOT NULL,
      raw_config      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// ---------------------------------------------------------------------------
// Payload extraction
// ---------------------------------------------------------------------------

interface PayloadIndices {
  players: Record<string, any>;
  playerAbilities: Record<string, any>;
  playerBossProgress: Record<string, any>;
  activeBattleStates: Record<string, any>;
  activeBattleConfigs: Record<string, any>;
  quests: Record<string, any>;
}

let indicesLogged = false;
let debugDumped = false;

function extractMaps(payload: any): PayloadIndices | null {
  // Debug dump on first call
  if (!debugDumped) {
    debugDumped = true;
    if (Deno.env.get("GAME_DB_DEBUG") === "1") {
      console.log("[game-db] DEBUG — raw payload structure:");
      const replacer = (_key: string, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value;
      console.log(JSON.stringify(payload, replacer, 2));
    }
  }

  // Flatten payload entries (payload is { "0": [...], "1": [...] })
  const allEntries: any[] = [];
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const keys = Object.keys(payload).sort((a, b) => Number(a) - Number(b));
    for (const key of keys) {
      const val = payload[key];
      if (Array.isArray(val)) {
        allEntries.push(...val);
      } else {
        allEntries.push(val);
      }
    }
  } else if (Array.isArray(payload)) {
    for (const item of payload) {
      if (Array.isArray(item)) allEntries.push(...item);
      else allEntries.push(item);
    }
  }

  // Collect map-like objects (non-null, non-array objects) in order
  const maps: Record<string, any>[] = [];
  for (const entry of allEntries) {
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      maps.push(entry);
    }
  }

  if (!indicesLogged) {
    indicesLogged = true;
    console.log(`[game-db] Found ${maps.length} map entries in payload, ${allEntries.length} total entries`);
    for (let i = 0; i < maps.length; i++) {
      console.log(`[game-db]   map[${i}]: ${Object.keys(maps[i]).length} keys`);
    }
  }

  if (maps.length < 7) {
    console.warn(`[game-db] Expected at least 7 maps in payload, got ${maps.length}. Skipping.`);
    return null;
  }

  // Verified map indices (see layout comment at top of file):
  //   map[0] = all_abilities        (8 keys)
  //   map[1] = active_battle_states (1 key)
  //   map[2] = active_battle_configs(1 key)
  //   map[3] = quests               (0 keys)
  //   map[4] = players              (1 key)
  //   map[5] = player_abilities     (1 key, nested maps)
  //   map[6] = player_boss_progress (1 key, nested maps)
  //   map[7] = levels               (12 keys)
  //   map[8] = bosses               (12 keys)
  return {
    activeBattleStates: maps[1] ?? {},
    activeBattleConfigs: maps[2] ?? {},
    quests: maps[3] ?? {},
    players: maps[4] ?? {},
    playerAbilities: maps[5] ?? {},
    playerBossProgress: maps[6] ?? {},
  };
}

// ---------------------------------------------------------------------------
// Snapshot deduplication
// ---------------------------------------------------------------------------

let lastSnapshotKey: string | null = null;

// ---------------------------------------------------------------------------
// Ledger snapshot processing
// ---------------------------------------------------------------------------

export async function processLedgerSnapshot(db: any, payload: any): Promise<void> {
  const extracted = extractMaps(payload);
  if (!extracted) return;

  const { players, playerAbilities, playerBossProgress, activeBattleStates, activeBattleConfigs, quests } = extracted;

  // Dedup: skip if nothing changed
  const replacer = (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value;
  const snapshotKey = JSON.stringify({ players, activeBattleStates, quests }, replacer);
  if (snapshotKey === lastSnapshotKey) return;
  lastSnapshotKey = snapshotKey;

  await syncPlayers(db, players);
  await syncPlayerAbilities(db, playerAbilities);
  await syncBossProgress(db, playerBossProgress);
  await syncBattles(db, activeBattleStates, activeBattleConfigs);
  await syncQuests(db, quests);
}

// ---------------------------------------------------------------------------
// Sync: Players
// ---------------------------------------------------------------------------

async function syncPlayers(
  db: any,
  playersMap: Record<string, any>,
): Promise<void> {
  const entries = Object.entries(playersMap);
  if (entries.length === 0) return;

  // Player is a packed struct: { gold: Uint<32>, rng: Bytes<32> }
  // gold occupies bits 0-31 of the packed LE value
  const parsed = entries.map(([playerId, value]) => {
    const packed = toBigInt(value);
    const gold = extractU32(packed, 0);
    return { playerId, gold };
  });

  // Fetch known
  const ids = parsed.map((p) => p.playerId);
  const { rows: knownRows } = await db.query(
    `SELECT player_id, gold FROM d2d_players WHERE player_id = ANY($1)`,
    [ids],
  ) as { rows: Array<{ player_id: string; gold: number }> };
  const known = new Map(knownRows.map((r: any) => [r.player_id, Number(r.gold)]));

  // Diff
  const toUpsert = parsed.filter(
    (p) => known.get(p.playerId) === undefined || known.get(p.playerId) !== p.gold,
  );

  if (toUpsert.length === 0) return;

  const placeholders = toUpsert
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
    .join(", ");
  const values = toUpsert.flatMap((p) => [p.playerId, p.gold]);

  await db.query(
    `INSERT INTO d2d_players (player_id, gold)
     VALUES ${placeholders}
     ON CONFLICT (player_id) DO UPDATE
       SET gold = EXCLUDED.gold,
           updated_at = now()`,
    values,
  );

  console.log(`[game-db] Upserted ${toUpsert.length} player(s)`);
}

// ---------------------------------------------------------------------------
// Sync: Player Abilities
// ---------------------------------------------------------------------------

async function syncPlayerAbilities(
  db: any,
  abilitiesMap: Record<string, any>,
): Promise<void> {
  // abilitiesMap: playerId -> { abilityId -> quantity }
  const entries: Array<{ playerId: string; abilityId: string; quantity: number }> = [];

  for (const [playerId, innerMap] of Object.entries(abilitiesMap)) {
    if (innerMap && typeof innerMap === "object" && !Array.isArray(innerMap)) {
      for (const [abilityId, qty] of Object.entries(innerMap)) {
        entries.push({ playerId, abilityId, quantity: Number(qty) });
      }
    }
  }

  if (entries.length === 0) return;

  // Fetch known
  const playerIds = [...new Set(entries.map((e) => e.playerId))];
  const { rows: knownRows } = await db.query(
    `SELECT player_id, ability_id, quantity FROM d2d_player_abilities WHERE player_id = ANY($1)`,
    [playerIds],
  ) as { rows: Array<{ player_id: string; ability_id: string; quantity: number }> };
  const knownMap = new Map(
    knownRows.map((r: any) => [`${r.player_id}:${r.ability_id}`, Number(r.quantity)]),
  );

  // Diff
  const toUpsert = entries.filter(
    (e) => knownMap.get(`${e.playerId}:${e.abilityId}`) !== e.quantity,
  );

  if (toUpsert.length === 0) return;

  const placeholders = toUpsert
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(", ");
  const values = toUpsert.flatMap((e) => [e.playerId, e.abilityId, e.quantity]);

  await db.query(
    `INSERT INTO d2d_player_abilities (player_id, ability_id, quantity)
     VALUES ${placeholders}
     ON CONFLICT (player_id, ability_id) DO UPDATE
       SET quantity = EXCLUDED.quantity,
           updated_at = now()`,
    values,
  );

  // Remove abilities no longer on-chain for these players
  const onChainKeys = new Set(entries.map((e) => `${e.playerId}:${e.abilityId}`));
  const toDelete = knownRows.filter(
    (r: any) => !onChainKeys.has(`${r.player_id}:${r.ability_id}`) && playerIds.includes(r.player_id),
  );
  if (toDelete.length > 0) {
    for (const row of toDelete) {
      await db.query(
        `DELETE FROM d2d_player_abilities WHERE player_id = $1 AND ability_id = $2`,
        [row.player_id, row.ability_id],
      );
    }
  }

  console.log(`[game-db] Upserted ${toUpsert.length} player ability entries, removed ${toDelete.length}`);
}

// ---------------------------------------------------------------------------
// Sync: Boss Progress
// ---------------------------------------------------------------------------

async function syncBossProgress(
  db: any,
  progressMap: Record<string, any>,
): Promise<void> {
  // progressMap: playerId -> { biome -> { difficulty -> completed } }
  const entries: Array<{ playerId: string; biome: number; difficulty: number; completed: boolean }> = [];

  for (const [playerId, biomeMap] of Object.entries(progressMap)) {
    if (biomeMap && typeof biomeMap === "object" && !Array.isArray(biomeMap)) {
      for (const [biome, diffMap] of Object.entries(biomeMap)) {
        if (diffMap && typeof diffMap === "object" && !Array.isArray(diffMap)) {
          for (const [difficulty, completed] of Object.entries(diffMap as Record<string, any>)) {
            entries.push({
              playerId,
              biome: Number(biome),
              difficulty: Number(difficulty),
              completed: Boolean(completed),
            });
          }
        }
      }
    }
  }

  if (entries.length === 0) return;

  const placeholders = entries
    .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
    .join(", ");
  const values = entries.flatMap((e) => [e.playerId, e.biome, e.difficulty, e.completed]);

  await db.query(
    `INSERT INTO d2d_boss_progress (player_id, biome, difficulty, completed)
     VALUES ${placeholders}
     ON CONFLICT (player_id, biome, difficulty) DO UPDATE
       SET completed = EXCLUDED.completed,
           updated_at = now()`,
    values,
  );
}

// ---------------------------------------------------------------------------
// Sync: Battles
// ---------------------------------------------------------------------------

async function syncBattles(
  db: any,
  battleStates: Record<string, any>,
  battleConfigs: Record<string, any>,
): Promise<void> {
  const battleIds = new Set([
    ...Object.keys(battleStates),
    ...Object.keys(battleConfigs),
  ]);

  if (battleIds.size === 0) {
    // No active battles — clean up any stale DB entries
    await db.query(`DELETE FROM d2d_battles`);
    return;
  }

  // BattleState is packed LE: each Uint<32> field = 32 bits
  //   field 0: round
  //   field 1-3: deck_indices[0..2]
  //   field 4: damage_to_player
  //   field 5: damage_to_enemy_0
  //   field 6: damage_to_enemy_1
  //   field 7: damage_to_enemy_2
  //   field 8-10: enemy_move_index_0..2
  //
  // BattleConfig is packed LE:
  //   field 0: biome (Uint<32>)
  //   field 1: difficulty (Uint<32>)
  //   ... enemies (EnemiesConfig, very large) ...
  //   then player_pub_key (Field, 256 bits)
  //   then loadout (7 Fields)
  //
  // We extract biome/difficulty from config bits 0-63.
  // player_pub_key offset is hard to determine statically due to
  // variable-width EnemiesConfig, so we store raw_config for later use.

  const toUpsert: Array<{
    battleId: string;
    playerId: string;
    biome: number;
    difficulty: number;
    round: number;
    damageToPlayer: number;
    damageToEnemy0: number;
    damageToEnemy1: number;
    damageToEnemy2: number;
    rawState: string;
    rawConfig: string;
  }> = [];

  for (const battleId of battleIds) {
    const stateVal = battleStates[battleId];
    const configVal = battleConfigs[battleId];

    const statePacked = toBigInt(stateVal ?? 0);
    const configPacked = toBigInt(configVal ?? 0);

    // Extract BattleState fields
    const round = extractU32(statePacked, 0);
    const damageToPlayer = extractU32(statePacked, 4);
    const dmg0 = extractU32(statePacked, 5);
    const dmg1 = extractU32(statePacked, 6);
    const dmg2 = extractU32(statePacked, 7);

    // Extract Level from BattleConfig (first two Uint<32> fields)
    const biome = extractU32(configPacked, 0);
    const difficulty = extractU32(configPacked, 1);

    // player_pub_key is deep inside the packed config after EnemiesConfig;
    // for now, store "unknown" and use raw_config for debugging
    const playerId = "unknown";

    toUpsert.push({
      battleId,
      playerId,
      biome,
      difficulty,
      round,
      damageToPlayer,
      damageToEnemy0: dmg0,
      damageToEnemy1: dmg1,
      damageToEnemy2: dmg2,
      rawState: statePacked.toString(),
      rawConfig: configPacked.toString(),
    });
  }

  if (toUpsert.length > 0) {
    const placeholders = toUpsert
      .map((_, i) => {
        const base = i * 11;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
      })
      .join(", ");
    const values = toUpsert.flatMap((b) => [
      b.battleId, b.playerId, b.biome, b.difficulty,
      b.round, b.damageToPlayer, b.damageToEnemy0, b.damageToEnemy1, b.damageToEnemy2,
      b.rawState, b.rawConfig,
    ]);

    await db.query(
      `INSERT INTO d2d_battles (battle_id, player_id, biome, difficulty, round, damage_to_player, damage_to_enemy_0, damage_to_enemy_1, damage_to_enemy_2, raw_state, raw_config)
       VALUES ${placeholders}
       ON CONFLICT (battle_id) DO UPDATE
         SET player_id = EXCLUDED.player_id,
             biome = EXCLUDED.biome,
             difficulty = EXCLUDED.difficulty,
             round = EXCLUDED.round,
             damage_to_player = EXCLUDED.damage_to_player,
             damage_to_enemy_0 = EXCLUDED.damage_to_enemy_0,
             damage_to_enemy_1 = EXCLUDED.damage_to_enemy_1,
             damage_to_enemy_2 = EXCLUDED.damage_to_enemy_2,
             raw_state = EXCLUDED.raw_state,
             raw_config = EXCLUDED.raw_config,
             updated_at = now()`,
      values,
    );

    // Remove battles no longer on-chain
    const activeBattleIds = toUpsert.map((b) => b.battleId);
    await db.query(
      `DELETE FROM d2d_battles WHERE NOT (battle_id = ANY($1))`,
      [activeBattleIds],
    );

    console.log(`[game-db] Synced ${toUpsert.length} battle(s)`);
  }
}

// ---------------------------------------------------------------------------
// Sync: Quests
// ---------------------------------------------------------------------------

async function syncQuests(
  db: any,
  questsMap: Record<string, any>,
): Promise<void> {
  const entries = Object.entries(questsMap);

  if (entries.length === 0) {
    // No active quests — clean up stale DB entries
    await db.query(`DELETE FROM d2d_quests`);
    return;
  }

  // QuestConfig is packed LE:
  //   field 0: biome (Uint<32>)
  //   field 1: difficulty (Uint<32>)
  //   then player_pub_key (Field), loadout (7 Fields), start_time (Uint<64>)
  //
  // start_time is at the end after variable-width fields, so we store
  // raw_config and extract what we can from the leading bits.

  const toUpsert: Array<{
    questId: string;
    playerId: string;
    biome: number;
    difficulty: number;
    startTime: number;
    rawConfig: string;
  }> = [];

  for (const [questId, value] of entries) {
    const packed = toBigInt(value);
    const biome = extractU32(packed, 0);
    const difficulty = extractU32(packed, 1);

    // player_pub_key and start_time offsets depend on struct packing;
    // store raw for now
    toUpsert.push({
      questId,
      playerId: "unknown",
      biome,
      difficulty,
      startTime: 0,
      rawConfig: packed.toString(),
    });
  }

  if (toUpsert.length > 0) {
    const placeholders = toUpsert
      .map((_, i) => {
        const base = i * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
      })
      .join(", ");
    const values = toUpsert.flatMap((q) => [
      q.questId, q.playerId, q.biome, q.difficulty, q.startTime, q.rawConfig,
    ]);

    await db.query(
      `INSERT INTO d2d_quests (quest_id, player_id, biome, difficulty, start_time, raw_config)
       VALUES ${placeholders}
       ON CONFLICT (quest_id) DO UPDATE
         SET player_id = EXCLUDED.player_id,
             biome = EXCLUDED.biome,
             difficulty = EXCLUDED.difficulty,
             start_time = EXCLUDED.start_time,
             raw_config = EXCLUDED.raw_config,
             updated_at = now()`,
      values,
    );

    // Remove quests no longer on-chain
    const activeQuestIds = toUpsert.map((q) => q.questId);
    await db.query(
      `DELETE FROM d2d_quests WHERE NOT (quest_id = ANY($1))`,
      [activeQuestIds],
    );

    console.log(`[game-db] Synced ${toUpsert.length} quest(s)`);
  }
}

// ---------------------------------------------------------------------------
// Query functions (for API endpoints)
// ---------------------------------------------------------------------------

export async function getPlayers(db: any): Promise<any[]> {
  const { rows } = await db.query(
    `SELECT player_id, gold, updated_at FROM d2d_players ORDER BY updated_at DESC`,
  );
  return rows;
}

export async function getPlayerDetail(db: any, playerId: string): Promise<any> {
  const { rows: playerRows } = await db.query(
    `SELECT player_id, gold, updated_at FROM d2d_players WHERE player_id = $1`,
    [playerId],
  );
  if (playerRows.length === 0) return null;

  const { rows: abilityRows } = await db.query(
    `SELECT ability_id, quantity FROM d2d_player_abilities WHERE player_id = $1`,
    [playerId],
  );

  const { rows: progressRows } = await db.query(
    `SELECT biome, difficulty, completed FROM d2d_boss_progress WHERE player_id = $1`,
    [playerId],
  );

  return {
    ...playerRows[0],
    abilities: abilityRows,
    bossProgress: progressRows,
  };
}

export async function getActiveBattles(db: any, playerId?: string): Promise<any[]> {
  if (playerId) {
    const { rows } = await db.query(
      `SELECT * FROM d2d_battles WHERE player_id = $1 ORDER BY updated_at DESC`,
      [playerId],
    );
    return rows;
  }
  const { rows } = await db.query(
    `SELECT * FROM d2d_battles ORDER BY updated_at DESC`,
  );
  return rows;
}

export async function getActiveQuests(db: any, playerId?: string): Promise<any[]> {
  if (playerId) {
    const { rows } = await db.query(
      `SELECT * FROM d2d_quests WHERE player_id = $1 ORDER BY updated_at DESC`,
      [playerId],
    );
    return rows;
  }
  const { rows } = await db.query(
    `SELECT * FROM d2d_quests ORDER BY updated_at DESC`,
  );
  return rows;
}

export async function getGameStats(db: any): Promise<any> {
  const { rows: [playerCount] } = await db.query(`SELECT COUNT(*)::int AS count FROM d2d_players`);
  const { rows: [battleCount] } = await db.query(`SELECT COUNT(*)::int AS count FROM d2d_battles`);
  const { rows: [questCount] } = await db.query(`SELECT COUNT(*)::int AS count FROM d2d_quests`);

  return {
    totalPlayers: playerCount?.count ?? 0,
    activeBattles: battleCount?.count ?? 0,
    activeQuests: questCount?.count ?? 0,
  };
}
