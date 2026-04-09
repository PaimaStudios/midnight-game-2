// ---------------------------------------------------------------------------
// game-db.ts — Database schema, ledger sync, and query functions
// ---------------------------------------------------------------------------
//
// Verified payload layout (from GAME_DB_DEBUG=1 output):
//
// payload["0"]:
//   [0] all_abilities        (Map<Field, Ability>)           — map[0], 9 keys
//   [1] ability_base_phys_id (scalar)
//   [2] ability_base_block_id (scalar)
//   [3] ability_base_fire_aoe_id (scalar)
//   [4] ability_base_ice_id (scalar)
//
// payload["1"]:
//   [0] ability_reward_id (scalar)
//   [1] ability_demo_starting_1_id (scalar)
//   [2] ability_demo_starting_2_id (scalar)
//   [3] ability_demo_starting_3_id (scalar)
//   [4] active_battle_states (Map<Field, BattleState>)       — map[1]
//   [5] active_battle_configs(Map<Field, BattleConfig>)      — map[2]
//   [6] quests               (Map<Field, QuestConfig>)       — map[3]
//   [7] players              (Map<Field, Player>)            — map[4]
//   [8] player_abilities     (Map<Field, Map<Field, Uint32>>)— map[5]
//   [9] player_boss_progress (Map<Field, Map<...>>)          — map[6]
//  [10] deployer (scalar)
//  [11] levels               (Map<Level, Map<...>>)          — map[7]
//  [12] bosses               (Map<Level, EnemiesConfig>)     — map[8]
//  [13] quest_durations      (Map<Level, Uint64>)            — map[9]
//  [14] delegations          (Map<Field, Field>)             — map[10]
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

/** Extract a single byte from a packed LE bigint at a given byte offset. */
function extractByte(packed: bigint, byteOffset: number): number {
  return Number((packed >> BigInt(byteOffset * 8)) & 0xFFn);
}

/** Extract a 32-bit LE value from a packed bigint at a given byte offset. */
function extractU32AtByte(packed: bigint, byteOffset: number): number {
  return Number((packed >> BigInt(byteOffset * 8)) & 0xFFFFFFFFn);
}

// ---------------------------------------------------------------------------
// Ability struct extraction (31 bytes, LE packed)
// ---------------------------------------------------------------------------
// Byte layout (from Compact compiled alignment):
//   [0]     effect.is_some     (1 byte, Boolean)
//   [1]     effect.effect_type (1 byte, EFFECT_TYPE enum: 0=phys, 1=fire, 2=ice, 3=block)
//   [2-5]   effect.amount      (4 bytes, Uint<32> LE)
//   [6]     effect.is_aoe      (1 byte, Boolean)
//   [7-13]  on_energy[0]       (Maybe<Effect>, 7 bytes)
//   [14-20] on_energy[1]       (Maybe<Effect>, 7 bytes)
//   [21-27] on_energy[2]       (Maybe<Effect>, 7 bytes)
//   [28]    generate_color.is_some (1 byte)
//   [29]    generate_color.value   (1 byte, Uint<0..5>)
//   [30]    upgrade_level          (1 byte, Uint<0..5>)

interface ParsedAbility {
  hasEffect: boolean;
  effectType: number;  // 0=phys, 1=fire, 2=ice, 3=block
  effectAmount: number;
  isAoe: boolean;
  onEnergy: Array<{ hasEffect: boolean; effectType: number; effectAmount: number; isAoe: boolean }>;
  hasGenerateColor: boolean;
  generateColor: number;
  upgradeLevel: number;
}

function parseAbility(packed: bigint): ParsedAbility {
  const hasEffect = extractByte(packed, 0) !== 0;
  const effectType = extractByte(packed, 1);
  const effectAmount = extractU32AtByte(packed, 2);
  const isAoe = extractByte(packed, 6) !== 0;

  const onEnergy: ParsedAbility["onEnergy"] = [];
  for (let i = 0; i < 3; i++) {
    const base = 7 + i * 7;
    onEnergy.push({
      hasEffect: extractByte(packed, base) !== 0,
      effectType: extractByte(packed, base + 1),
      effectAmount: extractU32AtByte(packed, base + 2),
      isAoe: extractByte(packed, base + 6) !== 0,
    });
  }

  return {
    hasEffect,
    effectType,
    effectAmount,
    isAoe,
    onEnergy,
    hasGenerateColor: extractByte(packed, 28) !== 0,
    generateColor: extractByte(packed, 29),
    upgradeLevel: extractByte(packed, 30),
  };
}

/** Parse all abilities from the raw all_abilities map. */
function parseAllAbilities(allAbilities: Record<string, any>): Map<string, ParsedAbility> {
  const result = new Map<string, ParsedAbility>();
  for (const [abilityId, value] of Object.entries(allAbilities)) {
    result.set(abilityId, parseAbility(toBigInt(value)));
  }
  return result;
}

// ---------------------------------------------------------------------------
// BattleConfig loadout extraction (7 ability Field IDs)
// ---------------------------------------------------------------------------
// BattleConfig byte layout:
//   [0-7]     Level: biome(4) + difficulty(4)
//   [8-236]   EnemiesConfig: Vector<3, EnemyStats>(3×76) + count(1) = 229 bytes
//   [237-268] player_pub_key: Field (32 bytes)
//   [269-492] loadout: Vector<7, Field> (7×32 = 224 bytes)
//
// EnemyStats (76 bytes): boss_type(1) + enemy_type(4) + hp(4) +
//   moves(Vector<3, EnemyMove>)(3×20) + move_count(4) +
//   physical_def(1) + fire_def(1) + ice_def(1)
// EnemyMove (20 bytes): attack(4) + block_self(4) + block_allies(4) +
//   heal_self(4) + heal_allies(4)

const BATTLE_CONFIG_LOADOUT_START_BYTE = 269; // 8 + 229 + 32
const FIELD_SIZE_BYTES = 32;
const FIELD_MASK_256 = (1n << 256n) - 1n;

function extractLoadoutFromBattleConfig(configPacked: bigint): string[] {
  const loadout: string[] = [];
  for (let i = 0; i < 7; i++) {
    const bitOffset = BigInt((BATTLE_CONFIG_LOADOUT_START_BYTE + i * FIELD_SIZE_BYTES) * 8);
    const fieldVal = (configPacked >> bitOffset) & FIELD_MASK_256;
    // Convert to hex string matching the payload map key format
    loadout.push("0x" + fieldVal.toString(16));
  }
  return loadout;
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
      biome           BIGINT NOT NULL,
      difficulty      BIGINT NOT NULL,
      completed       BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, biome, difficulty)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_battles (
      battle_id           TEXT PRIMARY KEY,
      player_id           TEXT NOT NULL,
      biome               BIGINT NOT NULL,
      difficulty          BIGINT NOT NULL,
      round               BIGINT NOT NULL DEFAULT 0,
      damage_to_player    BIGINT NOT NULL DEFAULT 0,
      damage_to_enemy_0   BIGINT NOT NULL DEFAULT 0,
      damage_to_enemy_1   BIGINT NOT NULL DEFAULT 0,
      damage_to_enemy_2   BIGINT NOT NULL DEFAULT 0,
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
      biome           BIGINT NOT NULL,
      difficulty      BIGINT NOT NULL,
      start_time      BIGINT NOT NULL,
      raw_config      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Track completed battles (wins/losses) for leaderboard scoring
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_battle_results (
      battle_id       TEXT PRIMARY KEY,
      player_id       TEXT NOT NULL,
      biome           BIGINT NOT NULL,
      difficulty      BIGINT NOT NULL,
      won             BOOLEAN NOT NULL,
      ended_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Delegation mapping: game address -> wallet address
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_delegations (
      from_address    TEXT PRIMARY KEY,
      to_address      TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Player stats (DB counters tracked via payload diffs)
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_player_stats (
      player_id           TEXT PRIMARY KEY,
      quests_completed    INTEGER NOT NULL DEFAULT 0,
      quests_failed       INTEGER NOT NULL DEFAULT 0,
      bosses_defeated     INTEGER NOT NULL DEFAULT 0,
      battles_won         INTEGER NOT NULL DEFAULT 0,
      battles_retreated   INTEGER NOT NULL DEFAULT 0,
      enemies_defeated    INTEGER NOT NULL DEFAULT 0,
      rounds_played       INTEGER NOT NULL DEFAULT 0,
      total_gold_earned   BIGINT NOT NULL DEFAULT 0,
      total_gold_spent    BIGINT NOT NULL DEFAULT 0,
      abilities_upgraded  INTEGER NOT NULL DEFAULT 0,
      abilities_sold      INTEGER NOT NULL DEFAULT 0,
      boss_win_streak     INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt  BIGINT NOT NULL DEFAULT 0,
      phys_sold           INTEGER NOT NULL DEFAULT 0,
      fire_sold           INTEGER NOT NULL DEFAULT 0,
      ice_sold            INTEGER NOT NULL DEFAULT 0,
      block_sold          INTEGER NOT NULL DEFAULT 0,
      phys_upgraded       INTEGER NOT NULL DEFAULT 0,
      fire_upgraded       INTEGER NOT NULL DEFAULT 0,
      ice_upgraded        INTEGER NOT NULL DEFAULT 0,
      block_upgraded      INTEGER NOT NULL DEFAULT 0,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Track pending boss fights (quest finalized → boss battle in progress)
  // Used to detect losses and retreats when the battle resolves
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_pending_boss_fights (
      player_id       TEXT NOT NULL,
      biome           BIGINT NOT NULL,
      difficulty      BIGINT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, biome, difficulty)
    )
  `);

  // Track failed boss fights per player (for Persistence achievement)
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_boss_failures (
      player_id       TEXT NOT NULL,
      biome           BIGINT NOT NULL,
      difficulty      BIGINT NOT NULL,
      failed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, biome, difficulty)
    )
  `);

  // Achievement definitions (populated by migration)
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_achievements (
      name            TEXT PRIMARY KEY,
      display_name    TEXT NOT NULL,
      description     TEXT NOT NULL,
      category        TEXT NOT NULL,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);

  // Player achievements (unlocked)
  await db.query(`
    CREATE TABLE IF NOT EXISTS d2d_player_achievements (
      player_id       TEXT NOT NULL,
      achievement     TEXT NOT NULL REFERENCES d2d_achievements(name),
      unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, achievement)
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
  delegations: Record<string, any>;
}

let indicesLogged = false;
let debugDumped = false;

function extractMaps(payload: any): PayloadIndices | null {
  // Debug dump on first call
  //if (!debugDumped) {
  //  debugDumped = true;
  //  if (Deno.env.get("GAME_DB_DEBUG") === "1") {
      console.log("[game-db] DEBUG — raw payload structure:");
      const replacer = (_key: string, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value;
      console.log(JSON.stringify(payload, replacer, 2));
  //  }
  //}

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
  //   map[9] = quest_durations
  //   map[10] = delegations
  return {
    allAbilities: maps[0] ?? {},
    activeBattleStates: maps[1] ?? {},
    activeBattleConfigs: maps[2] ?? {},
    quests: maps[3] ?? {},
    players: maps[4] ?? {},
    playerAbilities: maps[5] ?? {},
    playerBossProgress: maps[6] ?? {},
    delegations: maps[10] ?? {},
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

  const { allAbilities, players, playerAbilities, playerBossProgress, activeBattleStates, activeBattleConfigs, quests, delegations } = extracted;

  // Dedup: skip if nothing changed
  const replacer = (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value;
  const snapshotKey = JSON.stringify({ players, activeBattleStates, quests, delegations }, replacer);
  if (snapshotKey === lastSnapshotKey) return;
  lastSnapshotKey = snapshotKey;

  const parsedAbilities = parseAllAbilities(allAbilities);

  await syncPlayers(db, players);
  await syncPlayerAbilities(db, playerAbilities, parsedAbilities);
  const newBossCompletions = await syncBossProgress(db, playerBossProgress);
  await syncBattles(db, activeBattleStates, activeBattleConfigs, newBossCompletions, parsedAbilities);
  await syncQuests(db, quests);
  await syncDelegations(db, delegations);
  await trackAbilityUpgrades(db, allAbilities, players);
}

// Track new ability IDs in all_abilities as upgrades
let previousAbilityIds: Set<string> | null = null;

async function trackAbilityUpgrades(db: any, allAbilities: Record<string, any>, players: Record<string, any>): Promise<void> {
  const currentIds = new Set(Object.keys(allAbilities));
  if (previousAbilityIds !== null) {
    const newIds = [...currentIds].filter((id) => !previousAbilityIds!.has(id));
    if (newIds.length > 0) {
      const playerIds = Object.keys(players);
      if (playerIds.length === 1) {
        const playerId = playerIds[0];
        // Categorize new abilities by effect type
        const upgByType = [0, 0, 0, 0]; // phys, fire, ice, block
        for (const id of newIds) {
          const ability = parseAbility(toBigInt(allAbilities[id]));
          if (ability.hasEffect) upgByType[ability.effectType]++;
        }
        const { rows } = await db.query(
          `INSERT INTO d2d_player_stats (player_id, abilities_upgraded, phys_upgraded, fire_upgraded, ice_upgraded, block_upgraded)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (player_id) DO UPDATE
             SET abilities_upgraded = d2d_player_stats.abilities_upgraded + $2,
                 phys_upgraded = d2d_player_stats.phys_upgraded + $3,
                 fire_upgraded = d2d_player_stats.fire_upgraded + $4,
                 ice_upgraded = d2d_player_stats.ice_upgraded + $5,
                 block_upgraded = d2d_player_stats.block_upgraded + $6,
                 updated_at = now()
           RETURNING abilities_upgraded, phys_upgraded, fire_upgraded, ice_upgraded, block_upgraded`,
          [playerId, newIds.length, upgByType[0], upgByType[1], upgByType[2], upgByType[3]],
        ) as { rows: Array<{ abilities_upgraded: number; phys_upgraded: number; fire_upgraded: number; ice_upgraded: number; block_upgraded: number }> };
        await checkUpgradeAchievements(db, playerId, rows[0]);
      }
    }
  }
  previousAbilityIds = currentIds;
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
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::bigint)`)
    .join(", ");
  const values = toUpsert.flatMap((p) => [p.playerId, String(p.gold)]);

  await db.query(
    `INSERT INTO d2d_players (player_id, gold)
     VALUES ${placeholders}
     ON CONFLICT (player_id) DO UPDATE
       SET gold = EXCLUDED.gold,
           updated_at = now()`,
    values,
  );

  // Track gold changes for economy achievements
  for (const p of toUpsert) {
    const oldGold = known.get(p.playerId);
    if (oldGold !== undefined) {
      const delta = p.gold - oldGold;
      if (delta > 0) {
        // Gold earned — pass as string to avoid pg int4 overflow
        const { rows } = await db.query(
          `INSERT INTO d2d_player_stats (player_id, total_gold_earned)
           VALUES ($1, $2::bigint)
           ON CONFLICT (player_id) DO UPDATE
             SET total_gold_earned = d2d_player_stats.total_gold_earned + $2::bigint,
                 updated_at = now()
           RETURNING total_gold_earned`,
          [p.playerId, String(delta)],
        ) as { rows: Array<{ total_gold_earned: number }> };
        await checkGoldEarnedAchievements(db, p.playerId, rows[0].total_gold_earned);
      } else if (delta < 0) {
        // Gold spent — pass as string to avoid pg int4 overflow
        const spent = -delta;
        const { rows } = await db.query(
          `INSERT INTO d2d_player_stats (player_id, total_gold_spent)
           VALUES ($1, $2::bigint)
           ON CONFLICT (player_id) DO UPDATE
             SET total_gold_spent = d2d_player_stats.total_gold_spent + $2::bigint,
                 updated_at = now()
           RETURNING total_gold_spent`,
          [p.playerId, String(spent)],
        ) as { rows: Array<{ total_gold_spent: number }> };
        await checkGoldSpentAchievements(db, p.playerId, rows[0].total_gold_spent);
      }
    }
  }

  console.log(`[game-db] Upserted ${toUpsert.length} player(s)`);
}

// ---------------------------------------------------------------------------
// Sync: Player Abilities
// ---------------------------------------------------------------------------

async function syncPlayerAbilities(
  db: any,
  abilitiesMap: Record<string, any>,
  parsedAbilities: Map<string, ParsedAbility>,
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

  // Track ability sells by type: abilities whose quantity decreased
  for (const playerId of playerIds) {
    let soldCount = 0;
    const soldByType = [0, 0, 0, 0]; // phys, fire, ice, block
    for (const known of knownRows.filter((r: any) => r.player_id === playerId)) {
      const currentEntry = entries.find((e) => e.playerId === playerId && e.abilityId === known.ability_id);
      const currentQty = currentEntry?.quantity ?? 0;
      const oldQty = Number(known.quantity);
      if (currentQty < oldQty) {
        const delta = oldQty - currentQty;
        soldCount += delta;
        const ability = parsedAbilities.get(known.ability_id);
        if (ability?.hasEffect) soldByType[ability.effectType] += delta;
      }
    }
    const removedForPlayer = toDelete.filter((r: any) => r.player_id === playerId);
    for (const removed of removedForPlayer) {
      const qty = Number(removed.quantity);
      soldCount += qty;
      const ability = parsedAbilities.get(removed.ability_id);
      if (ability?.hasEffect) soldByType[ability.effectType] += qty;
    }
    if (soldCount > 0) {
      const { rows } = await db.query(
        `INSERT INTO d2d_player_stats (player_id, abilities_sold, phys_sold, fire_sold, ice_sold, block_sold)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (player_id) DO UPDATE
           SET abilities_sold = d2d_player_stats.abilities_sold + $2,
               phys_sold = d2d_player_stats.phys_sold + $3,
               fire_sold = d2d_player_stats.fire_sold + $4,
               ice_sold = d2d_player_stats.ice_sold + $5,
               block_sold = d2d_player_stats.block_sold + $6,
               updated_at = now()
         RETURNING abilities_sold, phys_sold, fire_sold, ice_sold, block_sold`,
        [playerId, soldCount, soldByType[0], soldByType[1], soldByType[2], soldByType[3]],
      ) as { rows: Array<{ abilities_sold: number; phys_sold: number; fire_sold: number; ice_sold: number; block_sold: number }> };
      await checkSellAchievements(db, playerId, rows[0]);
    }
  }

  console.log(`[game-db] Upserted ${toUpsert.length} player ability entries, removed ${toDelete.length}`);

  // Check spirit collection achievements per player
  for (const playerId of playerIds) {
    const playerEntries = entries.filter((e) => e.playerId === playerId);
    await checkSpiritCollectionAchievements(db, playerId, playerEntries, parsedAbilities);
  }
}

// ---------------------------------------------------------------------------
// Sync: Boss Progress
// ---------------------------------------------------------------------------

type BossCompletion = { playerId: string; biome: number; difficulty: number };

async function syncBossProgress(
  db: any,
  progressMap: Record<string, any>,
): Promise<BossCompletion[]> {
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

  if (entries.length === 0) return [];

  // Detect newly completed bosses (was false/missing, now true)
  let newBossCompletions: BossCompletion[] = [];
  const completedEntries = entries.filter((e) => e.completed);
  if (completedEntries.length > 0) {
    const playerIds = [...new Set(completedEntries.map((e) => e.playerId))];
    const { rows: existingRows } = await db.query(
      `SELECT player_id, biome, difficulty, completed FROM d2d_boss_progress WHERE player_id = ANY($1)`,
      [playerIds],
    ) as { rows: Array<{ player_id: string; biome: number; difficulty: number; completed: boolean }> };
    const existingSet = new Set(
      existingRows.filter((r: any) => r.completed).map((r: any) => `${r.player_id}:${r.biome}:${r.difficulty}`),
    );

    // Count new completions per player and collect for battle correlation
    const newCompletions = new Map<string, number>();
    for (const entry of completedEntries) {
      const key = `${entry.playerId}:${entry.biome}:${entry.difficulty}`;
      if (!existingSet.has(key)) {
        newCompletions.set(entry.playerId, (newCompletions.get(entry.playerId) ?? 0) + 1);
        newBossCompletions.push({ playerId: entry.playerId, biome: entry.biome, difficulty: entry.difficulty });
      }
    }

    // Increment quests_completed counters and check achievements
    for (const [playerId, count] of newCompletions) {
      const { rows } = await db.query(
        `INSERT INTO d2d_player_stats (player_id, quests_completed)
         VALUES ($1, $2)
         ON CONFLICT (player_id) DO UPDATE
           SET quests_completed = d2d_player_stats.quests_completed + $2,
               updated_at = now()
         RETURNING quests_completed`,
        [playerId, count],
      ) as { rows: Array<{ quests_completed: number }> };
      const total = rows[0].quests_completed;
      console.log(`[game-db] Player ${playerId.slice(0, 10)}... completed ${count} new quest(s), total: ${total}`);

      await checkQuestCompletionAchievements(db, playerId, total);
    }
  }

  const placeholders = entries
    .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
    .join(", ");
  const values = entries.flatMap((e) => [e.playerId, String(e.biome), String(e.difficulty), e.completed]);

  await db.query(
    `INSERT INTO d2d_boss_progress (player_id, biome, difficulty, completed)
     VALUES ${placeholders}
     ON CONFLICT (player_id, biome, difficulty) DO UPDATE
       SET completed = EXCLUDED.completed,
           updated_at = now()`,
    values,
  );

  // Check biome mastery achievements (snapshot-based, read fresh DB state)
  const playerIds = [...new Set(entries.map((e) => e.playerId))];
  for (const playerId of playerIds) {
    await checkBiomeMasteryAchievements(db, playerId);
  }

  return newBossCompletions;
}

// ---------------------------------------------------------------------------
// Sync: Battles
// ---------------------------------------------------------------------------

async function syncBattles(
  db: any,
  battleStates: Record<string, any>,
  battleConfigs: Record<string, any>,
  newBossCompletions: BossCompletion[],
  parsedAbilities: Map<string, ParsedAbility>,
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
      b.battleId, b.playerId, String(b.biome), String(b.difficulty),
      String(b.round), String(b.damageToPlayer), String(b.damageToEnemy0), String(b.damageToEnemy1), String(b.damageToEnemy2),
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

    // Detect battles that have left the chain (completed or retreated)
    // Before deleting, record results for leaderboard
    const activeBattleIds = toUpsert.map((b) => b.battleId);
    const { rows: staleBattles } = await db.query(
      `SELECT battle_id, player_id, biome, difficulty, round, damage_to_player, damage_to_enemy_0, damage_to_enemy_1, damage_to_enemy_2, raw_config
       FROM d2d_battles WHERE NOT (battle_id = ANY($1))`,
      [activeBattleIds],
    ) as { rows: Array<{
      battle_id: string; player_id: string; biome: number; difficulty: number;
      round: number; damage_to_player: number;
      damage_to_enemy_0: number; damage_to_enemy_1: number; damage_to_enemy_2: number;
      raw_config: string;
    }> };

    if (staleBattles.length > 0) {
      // Build lookup for new boss completions by biome:difficulty
      const bossCompletionsByLevel = new Map<string, BossCompletion>();
      for (const bc of newBossCompletions) {
        bossCompletionsByLevel.set(`${bc.biome}:${bc.difficulty}`, bc);
      }

      // Fallback player resolution: if only one player exists, attribute to them
      const { rows: allPlayers } = await db.query(`SELECT player_id FROM d2d_players`) as { rows: Array<{ player_id: string }> };
      const singlePlayerId = allPlayers.length === 1 ? allPlayers[0].player_id : null;

      for (const stale of staleBattles) {
        const totalDmg = Number(stale.damage_to_enemy_0) + Number(stale.damage_to_enemy_1) + Number(stale.damage_to_enemy_2);
        const dmgToPlayer = Number(stale.damage_to_player);
        const round = Number(stale.round);
        const levelKey = `${stale.biome}:${stale.difficulty}`;

        if (totalDmg > 0) {
          // Battle resolved with damage dealt
          await db.query(
            `INSERT INTO d2d_battle_results (battle_id, player_id, biome, difficulty, won)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (battle_id) DO NOTHING`,
            [stale.battle_id, stale.player_id, stale.biome, stale.difficulty],
          );

          // Resolve player_id: boss completion > pending boss fight > single player
          const bossCompletion = bossCompletionsByLevel.get(levelKey);
          const isBossFightWin = !!bossCompletion;
          let playerId: string | null = bossCompletion?.playerId ?? null;

          if (!playerId) {
            // Check pending boss fight (boss fight lost — damage dealt but no completion)
            const { rows: pendingRows } = await db.query(
              `SELECT player_id FROM d2d_pending_boss_fights WHERE biome = $1 AND difficulty = $2`,
              [stale.biome, stale.difficulty],
            ) as { rows: Array<{ player_id: string }> };
            if (pendingRows.length > 0) {
              playerId = pendingRows[0].player_id;
              // Boss fight lost
              await checkBossLossAchievements(db, playerId, Number(stale.biome), Number(stale.difficulty));
              await db.query(
                `DELETE FROM d2d_pending_boss_fights WHERE player_id = $1 AND biome = $2 AND difficulty = $3`,
                [playerId, stale.biome, stale.difficulty],
              );
            }
          }

          if (!playerId) playerId = singlePlayerId;

          if (isBossFightWin && playerId) {
            // Boss fight won
            await db.query(
              `INSERT INTO d2d_player_stats (player_id, bosses_defeated)
               VALUES ($1, 1)
               ON CONFLICT (player_id) DO UPDATE
                 SET bosses_defeated = d2d_player_stats.bosses_defeated + 1,
                     updated_at = now()`,
              [playerId],
            );
            await db.query(
              `DELETE FROM d2d_pending_boss_fights WHERE player_id = $1 AND biome = $2 AND difficulty = $3`,
              [playerId, stale.biome, stale.difficulty],
            );
            await checkBossCombatAchievements(db, playerId, dmgToPlayer, round, Number(stale.biome), Number(stale.difficulty));
            bossCompletionsByLevel.delete(levelKey);
          }

          // Battle win achievements (applies to ALL won battles, boss or random)
          if (playerId) {
            const configBigint = toBigInt(stale.raw_config ?? "0");
            await checkBattleWinAchievements(db, playerId, dmgToPlayer, round, totalDmg, configBigint, parsedAbilities);
          }
        } else {
          // Battle disappeared with 0 enemy damage — retreat
          const { rows: pendingRows } = await db.query(
            `SELECT player_id FROM d2d_pending_boss_fights WHERE biome = $1 AND difficulty = $2`,
            [stale.biome, stale.difficulty],
          ) as { rows: Array<{ player_id: string }> };
          let playerId: string | null = pendingRows.length > 0 ? pendingRows[0].player_id : singlePlayerId;
          if (pendingRows.length > 0 && playerId) {
            await checkBossRetreatAchievements(db, playerId);
            await db.query(
              `DELETE FROM d2d_pending_boss_fights WHERE player_id = $1 AND biome = $2 AND difficulty = $3`,
              [playerId, stale.biome, stale.difficulty],
            );
          }
        }
      }
      console.log(`[game-db] Recorded ${staleBattles.length} battle result(s)`);
    }

    // Remove battles no longer on-chain
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
      q.questId, q.playerId, String(q.biome), String(q.difficulty), String(q.startTime), q.rawConfig,
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

    // Detect quests that just disappeared (finalized → boss fight started)
    const activeQuestIds = toUpsert.map((q) => q.questId);
    const { rows: departedQuests } = await db.query(
      `SELECT quest_id, raw_config, biome, difficulty FROM d2d_quests WHERE NOT (quest_id = ANY($1))`,
      [activeQuestIds],
    ) as { rows: Array<{ quest_id: string; raw_config: string; biome: number; difficulty: number }> };

    if (departedQuests.length > 0) {
      const PLAYER_KEY_MASK = (1n << 256n) - 1n;
      for (const dq of departedQuests) {
        // Extract player_pub_key from the stored raw_config
        const packed = toBigInt(dq.raw_config);
        const playerKey = ((packed >> 64n) & PLAYER_KEY_MASK).toString();
        // Resolve to known player_id
        const { rows: playerRows } = await db.query(
          `SELECT player_id FROM d2d_players`,
        ) as { rows: Array<{ player_id: string }> };
        for (const pr of playerRows) {
          try {
            if (BigInt(pr.player_id) === BigInt(playerKey)) {
              await db.query(
                `INSERT INTO d2d_pending_boss_fights (player_id, biome, difficulty)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (player_id, biome, difficulty) DO NOTHING`,
                [pr.player_id, dq.biome, dq.difficulty],
              );
              console.log(`[game-db] Pending boss fight for ${pr.player_id.slice(0, 10)}... biome=${dq.biome} diff=${dq.difficulty}`);
              break;
            }
          } catch { /* skip */ }
        }
      }
    }

    // Remove quests no longer on-chain
    await db.query(
      `DELETE FROM d2d_quests WHERE NOT (quest_id = ANY($1))`,
      [activeQuestIds],
    );

    console.log(`[game-db] Synced ${toUpsert.length} quest(s)`);
  }

  // Check Multitasker: 3 quests active simultaneously for same player
  // Extract player_pub_key from packed QuestConfig (bits 64-319, a 256-bit Field)
  const PLAYER_KEY_MASK = (1n << 256n) - 1n;
  const questsByPlayer = new Map<string, number>();
  for (const [_, value] of entries) {
    const packed = toBigInt(value);
    const playerKey = ((packed >> 64n) & PLAYER_KEY_MASK).toString();
    questsByPlayer.set(playerKey, (questsByPlayer.get(playerKey) ?? 0) + 1);
  }
  for (const [playerKey, count] of questsByPlayer) {
    if (count >= 3) {
      // playerKey is the raw Field value — need to match with a known player_id format
      // The player_id in other maps uses the hex representation from the contract
      // Try matching against d2d_players to find the actual player
      const { rows } = await db.query(
        `SELECT player_id FROM d2d_players LIMIT 10`,
      ) as { rows: Array<{ player_id: string }> };
      // The quest player_pub_key should match one of our known player IDs
      for (const row of rows) {
        try {
          if (BigInt(row.player_id) === BigInt(playerKey)) {
            await grantAchievement(db, row.player_id, "multitasker");
            break;
          }
        } catch { /* skip non-numeric player_ids */ }
      }
    }
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

// ---------------------------------------------------------------------------
// Sync: Delegations
// ---------------------------------------------------------------------------

async function syncDelegations(
  db: any,
  delegationsMap: Record<string, any>,
): Promise<void> {
  const entries = Object.entries(delegationsMap);
  if (entries.length === 0) return;

  const parsed = entries.map(([fromAddr, toAddr]) => ({
    fromAddr,
    toAddr: String(toAddr),
  }));

  // Check existing
  const fromKeys = parsed.map((e) => e.fromAddr);
  const { rows: existing } = await db.query(
    `SELECT from_address, to_address FROM d2d_delegations WHERE from_address = ANY($1)`,
    [fromKeys],
  ) as { rows: Array<{ from_address: string; to_address: string }> };
  const existingMap = new Map(existing.map((r: any) => [r.from_address, r.to_address]));

  // Find new or changed delegations
  const toUpsert = parsed.filter((e) => existingMap.get(e.fromAddr) !== e.toAddr);

  if (toUpsert.length === 0) return;

  const placeholders = toUpsert
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
    .join(", ");
  const values = toUpsert.flatMap((u) => [u.fromAddr, u.toAddr]);

  await db.query(
    `INSERT INTO d2d_delegations (from_address, to_address)
     VALUES ${placeholders}
     ON CONFLICT (from_address) DO UPDATE
       SET to_address = EXCLUDED.to_address,
           updated_at = now()`,
    values,
  );

  console.log(`[game-db] Upserted ${toUpsert.length} delegation(s)`);
}

// ---------------------------------------------------------------------------
// Leaderboard queries (PRC-6)
// ---------------------------------------------------------------------------

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface LeaderboardParams {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  score: number;
}

export interface LeaderboardResult {
  channel: string;
  startDate: string;
  endDate: string;
  totalPlayers: number;
  totalScore: number;
  entries: LeaderboardEntry[];
}

export async function getLeaderboard(
  db: any,
  params: LeaderboardParams,
): Promise<LeaderboardResult> {
  const now = new Date();
  const endDate = params.endDate ?? now.toISOString();
  const startDate = params.startDate ?? new Date(now.getTime() - ONE_YEAR_MS).toISOString();
  const limit = Math.min(params.limit ?? 50, 1000);
  const offset = params.offset ?? 0;

  const { rows } = await db.query(
    `SELECT
       COALESCE(d.to_address, r.player_id)              AS address,
       COUNT(*)::int                                    AS score,
       RANK() OVER (ORDER BY COUNT(*) DESC)::int        AS rank
     FROM d2d_battle_results r
     LEFT JOIN d2d_delegations d ON r.player_id = d.from_address
     WHERE r.won = TRUE
       AND r.ended_at >= $1
       AND r.ended_at <= $2
     GROUP BY COALESCE(d.to_address, r.player_id)
     ORDER BY score DESC
     LIMIT $3 OFFSET $4`,
    [startDate, endDate, limit, offset],
  ) as { rows: Array<{ address: string; score: number; rank: number }> };

  const entries: LeaderboardEntry[] = rows.map((r: any) => ({
    rank: Number(r.rank),
    address: r.address,
    score: Number(r.score),
  }));

  const totalScore = entries.reduce((sum, e) => sum + e.score, 0);

  return {
    channel: "leaderboard",
    startDate,
    endDate,
    totalPlayers: entries.length,
    totalScore,
    entries,
  };
}

export interface UserChannelStats {
  score: number;
  rank: number;
  matchesPlayed: number;
}

export async function getUserLeaderboardStats(
  db: any,
  address: string,
  startDate: string,
  endDate: string,
): Promise<UserChannelStats | null> {
  const { rows } = await db.query(
    `WITH delegated_keys AS (
       SELECT from_address FROM d2d_delegations WHERE to_address = $3
       UNION ALL
       SELECT $3
     ),
     ranked AS (
       SELECT
         COALESCE(d.to_address, r.player_id)              AS address,
         COUNT(*)::int                                    AS score,
         RANK() OVER (ORDER BY COUNT(*) DESC)::int        AS rank
       FROM d2d_battle_results r
       LEFT JOIN d2d_delegations d ON r.player_id = d.from_address
       WHERE r.won = TRUE
         AND r.ended_at >= $1
         AND r.ended_at <= $2
       GROUP BY COALESCE(d.to_address, r.player_id)
     )
     SELECT
       r.score,
       r.rank,
       (SELECT COUNT(*)::int FROM d2d_battle_results br
        WHERE br.player_id IN (SELECT from_address FROM delegated_keys)
          AND br.ended_at >= $1 AND br.ended_at <= $2) AS matches_played
     FROM ranked r
     WHERE r.address = $3`,
    [startDate, endDate, address],
  ) as { rows: Array<{ score: number; rank: number; matches_played: number }> };

  if (rows.length === 0) return null;

  return {
    score: Number(rows[0].score),
    rank: Number(rows[0].rank),
    matchesPlayed: Number(rows[0].matches_played),
  };
}

export interface UserIdentity {
  address: string;
  delegatedFrom: string[];
}

export async function resolveUserIdentity(
  db: any,
  address: string,
): Promise<UserIdentity> {
  // Check if this address has delegated to another
  const { rows: asDelegator } = await db.query(
    `SELECT to_address FROM d2d_delegations WHERE from_address = $1`,
    [address],
  ) as { rows: Array<{ to_address: string }> };

  // Check if this address is one that others delegate to
  const { rows: asDelegatee } = await db.query(
    `SELECT from_address FROM d2d_delegations WHERE to_address = $1`,
    [address],
  ) as { rows: Array<{ from_address: string }> };

  return {
    address: asDelegator.length > 0 ? asDelegator[0].to_address : address,
    delegatedFrom: asDelegatee.map((r: any) => r.from_address),
  };
}

// ---------------------------------------------------------------------------
// Achievement granting
// ---------------------------------------------------------------------------

async function grantAchievement(db: any, playerId: string, achievementName: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO d2d_player_achievements (player_id, achievement)
     VALUES ($1, $2)
     ON CONFLICT (player_id, achievement) DO NOTHING`,
    [playerId, achievementName],
  );
  if (rowCount > 0) {
    console.log(`[achievements] Unlocked "${achievementName}" for ${playerId.slice(0, 10)}...`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Achievement checks
// ---------------------------------------------------------------------------

const QUEST_COMPLETION_THRESHOLDS: Array<[number, string]> = [
  [1, "first_quest"],
  [5, "novice_explorer"],
  [10, "seasoned_adventurer"],
  [15, "experienced_adventurer"],
  [20, "skilled_explorer"],
  [25, "expert_explorer"],
  [30, "veteran_explorer"],
  [50, "quest_master"],
  [100, "legendary_explorer"],
];

async function checkQuestCompletionAchievements(db: any, playerId: string, questsCompleted: number): Promise<void> {
  for (const [threshold, name] of QUEST_COMPLETION_THRESHOLDS) {
    if (questsCompleted >= threshold) {
      await grantAchievement(db, playerId, name);
    }
  }
}

const BATTLE_WON_THRESHOLDS: Array<[number, string]> = [
  [1, "first_blood"],
  [50, "battle_hardened"],
  [100, "warmonger"],
  [250, "grizzled_veteran"],
];

const ENEMIES_DEFEATED_THRESHOLDS: Array<[number, string]> = [
  [100, "slayer"],
  [500, "annihilator"],
];

async function checkBattleWinAchievements(db: any, playerId: string, dmgToPlayer: number, round: number, totalDmg: number, rawConfig: bigint, parsedAbilities: Map<string, ParsedAbility>): Promise<void> {
  // Increment battles_won, rounds_played, enemies_defeated
  // Estimate enemies defeated: each enemy with damage > 0 is considered killed in a won battle
  // (simplified — true count would need HP comparison)
  const enemiesKilled = (totalDmg > 0 ? 1 : 0) + // at least 1 if battle was won
    0; // conservative estimate; we refine later if we can read enemy count
  // For now, count as 1-3 enemies based on which damage fields are > 0
  // (read from the stale battle data, but we only have totalDmg here)
  // Actually we'll just use 1 per won battle as minimum — can refine later

  const { rows } = await db.query(
    `INSERT INTO d2d_player_stats (player_id, battles_won, rounds_played, enemies_defeated)
     VALUES ($1, 1, $2, 1)
     ON CONFLICT (player_id) DO UPDATE
       SET battles_won = d2d_player_stats.battles_won + 1,
           rounds_played = d2d_player_stats.rounds_played + $2,
           enemies_defeated = d2d_player_stats.enemies_defeated + 1,
           updated_at = now()
     RETURNING battles_won, rounds_played, enemies_defeated`,
    [playerId, round],
  ) as { rows: Array<{ battles_won: number; rounds_played: number; enemies_defeated: number }> };
  const stats = rows[0];

  // Battle milestone achievements
  for (const [threshold, name] of BATTLE_WON_THRESHOLDS) {
    if (stats.battles_won >= threshold) await grantAchievement(db, playerId, name);
  }

  // Combat totals
  for (const [threshold, name] of ENEMIES_DEFEATED_THRESHOLDS) {
    if (stats.enemies_defeated >= threshold) await grantAchievement(db, playerId, name);
  }
  if (stats.rounds_played >= 500) await grantAchievement(db, playerId, "round_veteran");

  // Battle feats (per-battle checks)
  if (round === 1) await grantAchievement(db, playerId, "speed_demon");
  if (round >= 10) await grantAchievement(db, playerId, "marathon_fight");
  if (dmgToPlayer === 0) {
    // Untouchable requires 3-enemy battle — we can't easily determine enemy count
    // from totalDmg alone, but we grant it if damage to player is 0
    // TODO: refine with enemy count from BattleConfig if extractable
    await grantAchievement(db, playerId, "untouchable");
  }
  if (dmgToPlayer >= 95) await grantAchievement(db, playerId, "survivor");

  // Damage output achievements
  if (totalDmg >= 300) await grantAchievement(db, playerId, "damage_dealer");
  if (totalDmg >= 600) await grantAchievement(db, playerId, "overwhelming_force");

  // Devastator: cumulative damage across all battles
  const { rows: dmgRows } = await db.query(
    `INSERT INTO d2d_player_stats (player_id, total_damage_dealt)
     VALUES ($1, $2)
     ON CONFLICT (player_id) DO UPDATE
       SET total_damage_dealt = d2d_player_stats.total_damage_dealt + $2,
           updated_at = now()
     RETURNING total_damage_dealt`,
    [playerId, totalDmg],
  ) as { rows: Array<{ total_damage_dealt: number }> };
  if (dmgRows[0].total_damage_dealt >= 10000) await grantAchievement(db, playerId, "devastator");

  // Loadout-based achievements: extract 7 ability IDs from BattleConfig
  const loadoutIds = extractLoadoutFromBattleConfig(rawConfig);
  const loadoutAbilities = loadoutIds.map((id) => parsedAbilities.get(id)).filter((a): a is ParsedAbility => !!a);

  if (loadoutAbilities.length === 7) {
    const attackTypes = loadoutAbilities.filter((a) => a.hasEffect && a.effectType <= 2).map((a) => a.effectType);
    const allTypes = loadoutAbilities.filter((a) => a.hasEffect).map((a) => a.effectType);
    const uniqueAttackTypes = new Set(attackTypes);

    // Mono Fire: all 7 are fire attack
    if (allTypes.length === 7 && allTypes.every((t) => t === 1)) await grantAchievement(db, playerId, "mono_fire");
    // Mono Ice: all 7 are ice attack
    if (allTypes.length === 7 && allTypes.every((t) => t === 2)) await grantAchievement(db, playerId, "mono_ice");
    // Mono Physical: all 7 are phys attack
    if (allTypes.length === 7 && allTypes.every((t) => t === 0)) await grantAchievement(db, playerId, "mono_physical");
    // Glass Cannon: no block abilities in loadout
    if (!allTypes.includes(3)) await grantAchievement(db, playerId, "glass_cannon");
    // Balanced Fighter: all 3 attack elements present
    if (uniqueAttackTypes.has(0) && uniqueAttackTypes.has(1) && uniqueAttackTypes.has(2)) await grantAchievement(db, playerId, "balanced_fighter");
    // Elemental Focus: all attack abilities share the same element
    if (attackTypes.length > 0 && uniqueAttackTypes.size === 1) await grantAchievement(db, playerId, "elemental_focus");
    // Fortified: 3+ block abilities
    if (allTypes.filter((t) => t === 3).length >= 3) await grantAchievement(db, playerId, "fortified");
    // Power Surge: any loadout ability at 3 stars
    if (loadoutAbilities.some((a) => a.upgradeLevel === 3)) await grantAchievement(db, playerId, "power_surge");

    // Overcharged: 3+ loadout abilities sharing the same energy color
    const colorCounts = new Map<number, number>();
    for (const a of loadoutAbilities) {
      if (a.hasGenerateColor) colorCounts.set(a.generateColor, (colorCounts.get(a.generateColor) ?? 0) + 1);
    }
    for (const count of colorCounts.values()) {
      if (count >= 3) { await grantAchievement(db, playerId, "overcharged"); break; }
    }
  }
}

const GOLD_EARNED_THRESHOLDS: Array<[number, string]> = [
  [1, "first_coin"],
  [500, "treasure_hunter"],
  [2000, "golden_hoard"],
  [10000, "dragons_vault"],
];

async function checkGoldEarnedAchievements(db: any, playerId: string, totalGoldEarned: number): Promise<void> {
  for (const [threshold, name] of GOLD_EARNED_THRESHOLDS) {
    if (totalGoldEarned >= threshold) await grantAchievement(db, playerId, name);
  }
}

async function checkGoldSpentAchievements(db: any, playerId: string, totalGoldSpent: number): Promise<void> {
  if (totalGoldSpent >= 1000) await grantAchievement(db, playerId, "big_spender");
}

const UPGRADE_THRESHOLDS: Array<[number, string]> = [
  [1, "apprentice_smith"],
  [10, "journeyman_smith"],
  [25, "master_smith"],
];

async function checkUpgradeAchievements(db: any, playerId: string, stats: { abilities_upgraded: number; phys_upgraded: number; fire_upgraded: number; ice_upgraded: number; block_upgraded: number }): Promise<void> {
  for (const [threshold, name] of UPGRADE_THRESHOLDS) {
    if (stats.abilities_upgraded >= threshold) await grantAchievement(db, playerId, name);
  }
  if (stats.fire_upgraded >= 10) await grantAchievement(db, playerId, "pyro_forger");
  if (stats.ice_upgraded >= 10) await grantAchievement(db, playerId, "cryo_forger");
  if (stats.phys_upgraded >= 10) await grantAchievement(db, playerId, "weapons_forger");
  if (stats.block_upgraded >= 10) await grantAchievement(db, playerId, "shield_forger");
}

async function checkSellAchievements(db: any, playerId: string, stats: { abilities_sold: number; phys_sold: number; fire_sold: number; ice_sold: number; block_sold: number }): Promise<void> {
  if (stats.abilities_sold >= 10) await grantAchievement(db, playerId, "merchant");
  if (stats.abilities_sold >= 50) await grantAchievement(db, playerId, "spirit_trader");
  if (stats.fire_sold >= 15) await grantAchievement(db, playerId, "fire_sale");
  if (stats.ice_sold >= 15) await grantAchievement(db, playerId, "cold_surplus");
  if (stats.phys_sold >= 15) await grantAchievement(db, playerId, "disarmed");
  if (stats.block_sold >= 15) await grantAchievement(db, playerId, "shields_down");
}

async function checkSpiritCollectionAchievements(
  db: any,
  playerId: string,
  playerEntries: Array<{ abilityId: string; quantity: number }>,
  parsedAbilities: Map<string, ParsedAbility>,
): Promise<void> {
  const totalSpirits = playerEntries.reduce((sum, e) => sum + e.quantity, 0);

  // Spirit collection milestones
  if (totalSpirits >= 10) await grantAchievement(db, playerId, "spirit_caller");
  if (totalSpirits >= 25) await grantAchievement(db, playerId, "spirit_collector");
  if (totalSpirits >= 50) await grantAchievement(db, playerId, "spirit_hoarder");

  // Full Arsenal: own at least one of each effect type (phys=0, fire=1, ice=2, block=3)
  const ownedTypes = new Set<number>();
  for (const entry of playerEntries) {
    if (entry.quantity <= 0) continue;
    const ability = parsedAbilities.get(entry.abilityId);
    if (ability?.hasEffect) ownedTypes.add(ability.effectType);
  }
  if (ownedTypes.has(0) && ownedTypes.has(1) && ownedTypes.has(2) && ownedTypes.has(3)) {
    await grantAchievement(db, playerId, "full_arsenal");
  }

  // Upgrade Quality achievements (snapshot-based)
  let countUpgrade2 = 0;
  let countUpgrade3 = 0;
  const maxUpgradeByType = new Map<number, number>(); // effectType -> max upgrade_level
  let hasAoe3 = 0;
  const colorCounts = new Map<number, number>(); // generate_color -> count

  for (const entry of playerEntries) {
    if (entry.quantity <= 0) continue;
    const ability = parsedAbilities.get(entry.abilityId);
    if (!ability) continue;

    if (ability.upgradeLevel >= 2) countUpgrade2++;
    if (ability.upgradeLevel === 3) countUpgrade3++;

    if (ability.hasEffect && ability.upgradeLevel >= 1) {
      const prev = maxUpgradeByType.get(ability.effectType) ?? 0;
      if (ability.upgradeLevel > prev) maxUpgradeByType.set(ability.effectType, ability.upgradeLevel);
    }

    if (ability.isAoe && entry.quantity > 0) hasAoe3++;
    if (ability.hasGenerateColor) {
      colorCounts.set(ability.generateColor, (colorCounts.get(ability.generateColor) ?? 0) + entry.quantity);
    }
  }

  // Rising Star: own a spirit at 2+ stars
  if (countUpgrade2 > 0) await grantAchievement(db, playerId, "rising_star");
  // Perfection: own a spirit at 3 stars
  if (countUpgrade3 > 0) await grantAchievement(db, playerId, "perfection");
  // Master Forger: own 3+ at 3 stars
  if (countUpgrade3 >= 3) await grantAchievement(db, playerId, "master_forger");
  // Max Power: 3-star spirit of every attack element
  const has3StarPhys = [...parsedAbilities.entries()].some(([id, a]) => a.upgradeLevel === 3 && a.hasEffect && a.effectType === 0 && playerEntries.some(e => e.abilityId === id && e.quantity > 0));
  const has3StarFire = [...parsedAbilities.entries()].some(([id, a]) => a.upgradeLevel === 3 && a.hasEffect && a.effectType === 1 && playerEntries.some(e => e.abilityId === id && e.quantity > 0));
  const has3StarIce = [...parsedAbilities.entries()].some(([id, a]) => a.upgradeLevel === 3 && a.hasEffect && a.effectType === 2 && playerEntries.some(e => e.abilityId === id && e.quantity > 0));
  if (has3StarPhys && has3StarFire && has3StarIce) await grantAchievement(db, playerId, "max_power");

  // Full Spectrum: upgraded (1+ star) ability of every effect type
  if (maxUpgradeByType.has(0) && maxUpgradeByType.has(1) && maxUpgradeByType.has(2) && maxUpgradeByType.has(3)) {
    await grantAchievement(db, playerId, "full_spectrum");
  }

  // Energy Collector: own abilities generating all 3 energy colors
  if (colorCounts.has(0) && colorCounts.has(1) && colorCounts.has(2)) {
    await grantAchievement(db, playerId, "energy_collector");
  }

  // Energy Specialist: 3+ abilities generating the same energy color
  for (const count of colorCounts.values()) {
    if (count >= 3) { await grantAchievement(db, playerId, "energy_specialist"); break; }
  }

  // AOE Arsenal: own 3+ AOE abilities
  if (hasAoe3 >= 3) await grantAchievement(db, playerId, "aoe_arsenal");
}

async function checkBossLossAchievements(db: any, playerId: string, biome: number, difficulty: number): Promise<void> {
  // Fallen Hero: lose a boss fight
  await db.query(
    `INSERT INTO d2d_player_stats (player_id, quests_failed)
     VALUES ($1, 1)
     ON CONFLICT (player_id) DO UPDATE
       SET quests_failed = d2d_player_stats.quests_failed + 1,
           updated_at = now()`,
    [playerId],
  );
  await grantAchievement(db, playerId, "fallen_hero");

  // Record the failure for Persistence tracking
  await db.query(
    `INSERT INTO d2d_boss_failures (player_id, biome, difficulty)
     VALUES ($1, $2, $3)
     ON CONFLICT (player_id, biome, difficulty) DO UPDATE
       SET failed_at = now()`,
    [playerId, biome, difficulty],
  );
  console.log(`[game-db] Boss fight lost for ${playerId.slice(0, 10)}... biome=${biome} diff=${difficulty}`);

  // Persistence: check if the player previously failed this boss but has now beaten it
  // (checked on win side — see checkBossCombatAchievements)
}

async function checkBossRetreatAchievements(db: any, playerId: string): Promise<void> {
  // Tactical Retreat: retreat from a boss fight
  await db.query(
    `INSERT INTO d2d_player_stats (player_id, battles_retreated, boss_win_streak)
     VALUES ($1, 1, 0)
     ON CONFLICT (player_id) DO UPDATE
       SET battles_retreated = d2d_player_stats.battles_retreated + 1,
           boss_win_streak = 0,
           updated_at = now()`,
    [playerId],
  );
  await grantAchievement(db, playerId, "tactical_retreat");
  console.log(`[game-db] Boss retreat for ${playerId.slice(0, 10)}... (streak reset)`);
}

async function checkBossCombatAchievements(db: any, playerId: string, damageToPlayer: number, _round: number, biome: number, difficulty: number): Promise<void> {
  // Flawless Victory: beat a boss taking 0 damage
  if (damageToPlayer === 0) {
    await grantAchievement(db, playerId, "flawless_victory");
  }
  // Close Call: beat a boss with 90+ damage taken
  if (damageToPlayer >= 90) {
    await grantAchievement(db, playerId, "close_call");
  }
  // No Retreat: 10 boss wins in a row without retreating (streak-based)
  // Increment streak on boss win
  const { rows } = await db.query(
    `INSERT INTO d2d_player_stats (player_id, boss_win_streak)
     VALUES ($1, 1)
     ON CONFLICT (player_id) DO UPDATE
       SET boss_win_streak = d2d_player_stats.boss_win_streak + 1,
           updated_at = now()
     RETURNING boss_win_streak`,
    [playerId],
  ) as { rows: Array<{ boss_win_streak: number }> };
  if (rows[0].boss_win_streak >= 10) {
    await grantAchievement(db, playerId, "no_retreat");
  }
  // Persistence: previously failed this boss, now beat it
  const { rows: failRows } = await db.query(
    `SELECT 1 FROM d2d_boss_failures WHERE player_id = $1 AND biome = $2 AND difficulty = $3`,
    [playerId, biome, difficulty],
  );
  if (failRows.length > 0) {
    await grantAchievement(db, playerId, "persistence");
  }
}

// Biome IDs: grasslands=0, desert=1, tundra=2, cave=3. Difficulties: 1, 2, 3.
const BIOME_CONQUEROR_MAP: Record<number, string> = {
  0: "grasslands_conqueror",
  1: "desert_conqueror",
  2: "tundra_conqueror",
  3: "cave_conqueror",
};

async function checkBiomeMasteryAchievements(db: any, playerId: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT biome, difficulty, completed FROM d2d_boss_progress WHERE player_id = $1 AND completed = TRUE`,
    [playerId],
  ) as { rows: Array<{ biome: number; difficulty: number; completed: boolean }> };

  // Build set of completed biome:difficulty pairs
  const completed = new Set(rows.map((r: any) => `${r.biome}:${r.difficulty}`));

  // Per-biome conqueror: all 3 difficulties completed
  let biomesFullyCompleted = 0;
  for (const [biome, achievement] of Object.entries(BIOME_CONQUEROR_MAP)) {
    const allThree = [1, 2, 3].every((d) => completed.has(`${biome}:${d}`));
    if (allThree) {
      await grantAchievement(db, playerId, achievement);
      biomesFullyCompleted++;
    }
  }

  // World Conqueror: all 4 biomes at all 3 difficulties
  if (biomesFullyCompleted === 4) {
    await grantAchievement(db, playerId, "world_conqueror");
  }

  // Difficulty progression: any biome at difficulty N
  if (rows.some((r: any) => r.difficulty === 1)) await grantAchievement(db, playerId, "frontier_scout");
  if (rows.some((r: any) => r.difficulty === 2)) await grantAchievement(db, playerId, "interior_breacher");
  if (rows.some((r: any) => r.difficulty === 3)) await grantAchievement(db, playerId, "stronghold_crusher");
}

// ---------------------------------------------------------------------------
// Achievement queries
// ---------------------------------------------------------------------------

export async function getAllAchievements(db: any): Promise<any[]> {
  const { rows } = await db.query(
    `SELECT name, display_name, description, category, is_active FROM d2d_achievements ORDER BY name`,
  );
  return rows;
}

export async function getUserAchievements(db: any, address: string): Promise<string[]> {
  // Resolve through delegations: find all game keys that delegate to this address
  const { rows } = await db.query(
    `SELECT DISTINCT pa.achievement
     FROM d2d_player_achievements pa
     WHERE pa.player_id = $1
        OR pa.player_id IN (SELECT from_address FROM d2d_delegations WHERE to_address = $1)
     ORDER BY pa.achievement`,
    [address],
  );
  return rows.map((r: any) => r.achievement);
}
