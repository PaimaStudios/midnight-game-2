# Achievements

## Data Requirements

Achievements rely on player statistics tracked by the node. Below are the **data sources** used for detection.

### From Ledger Payload (no changes needed)
- `player_boss_progress[biome][difficulty]` — boss completion per biome/tier
- `player_abilities[ability_id]` — current spirit inventory with counts
- `all_abilities[ability_id]` — ability definitions (effect type, upgrade level, energy color, AOE flag)
- `gold` — current gold balance
- `BattleState.round` — round counter during active battle
- `BattleState.damage_to_player` — cumulative damage taken in active battle
- `BattleState.damage_to_enemy_0/1/2` — cumulative damage dealt per enemy
- `BattleConfig.loadout` — 7 ability Field IDs used in the battle
- `quests` — active quest entries per player

### Node DB Counters (tracked via payload diffs, no ledger changes)
| Field | Type | Updated When |
|---|---|---|
| `battles_won` | `integer` | Battle disappears from `map[1]` with enemies defeated |
| `battles_lost` | `integer` | Battle disappears with player HP depleted |
| `battles_retreated` | `integer` | Battle disappears with 0 enemy damage (retreat heuristic) |
| `quests_completed` | `integer` | New `true` entry appears in `map[6]` (boss_progress) |
| `quests_failed` | `integer` | Boss battle lost (diff: battle disappears, player HP 0) |
| `total_gold_earned` | `integer` | `map[4]` gold increases between snapshots |
| `total_gold_spent` | `integer` | `map[4]` gold decreases between snapshots |
| `enemies_defeated` | `integer` | Count enemies killed per resolved battle (damage vs HP) |
| `abilities_sold` | `integer` | Ability quantity decreases coinciding with gold increase |
| `abilities_upgraded` | `integer` | Ability `upgrade_level` increases in `map[0]` |
| `total_damage_dealt` | `integer` | Sum `damage_to_enemy_0/1/2` from resolved battles |
| `rounds_played` | `integer` | Sum `BattleState.round` from resolved battles |
| `bosses_defeated` | `integer` | Boss battle won (diff: boss fight disappears, enemies defeated) |

### Per-Battle Tracking (derived from BattleState at battle end)
These can be derived at battle end from existing `BattleState`:
- Rounds survived = `BattleState.round`
- Damage taken = `BattleState.damage_to_player`
- Whether it was a 3-enemy fight = check `BattleConfig` enemy count

---

## Ledger Payload Map Reference

The ledger snapshot payload contains these maps (indices verified in `game-db.ts`):

| Index | Ledger Variable | Type | Description |
|---|---|---|---|
| `map[0]` | `all_abilities` | `Map<Field, Ability>` | Ability definitions. `Ability { effect: Maybe<Effect>, on_energy: Vector<3, Maybe<Effect>>, generate_color: Maybe<Uint<0..5>>, upgrade_level: Uint<0..5> }`. `Effect { effect_type: EFFECT_TYPE, amount: Uint<32>, is_aoe: Boolean }`. `EFFECT_TYPE` enum: `attack_phys=0, attack_fire=1, attack_ice=2, block=3`. |
| `map[1]` | `active_battle_states` | `Map<Field, BattleState>` | Packed LE struct. Fields (each `Uint<32>`, 32 bits): `[0] round`, `[1-3] deck_indices`, `[4] damage_to_player`, `[5] damage_to_enemy_0`, `[6] damage_to_enemy_1`, `[7] damage_to_enemy_2`, `[8-10] enemy_move_index_0/1/2`. |
| `map[2]` | `active_battle_configs` | `Map<Field, BattleConfig>` | Packed LE struct. Leading fields: `[0] biome (Uint<32>)`, `[1] difficulty (Uint<32>)`, then `enemies: EnemiesConfig` (3x `EnemyStats`, large), `player_pub_key: Field`, `loadout: Vector<7, Field>`. |
| `map[3]` | `quests` | `Map<Field, QuestConfig>` | Packed LE struct. `[0] biome`, `[1] difficulty`, then `player_pub_key: Field`, `loadout: Vector<7, Field>`, `start_time: Uint<64>`. |
| `map[4]` | `players` | `Map<Field, Player>` | Packed LE struct. `[0] gold (Uint<32>)`, `[1..] rng (Bytes<32>)`. |
| `map[5]` | `player_abilities` | `Map<Field, Map<Field, Uint<32>>>` | Nested map: `player_id → ability_id → quantity`. |
| `map[6]` | `player_boss_progress` | `Map<Field, Map<biome, Map<diff, bool>>>` | Nested map: `player_id → biome → difficulty → completed`. Biome IDs: grasslands=0, desert=1, tundra=2, cave=3. Difficulty: 1, 2, 3. |
| `map[7]` | `levels` | `Map<Level, Map<Uint<64>, EnemiesConfig>>` | Random encounter configs per level. |
| `map[8]` | `bosses` | `Map<Level, EnemiesConfig>` | Boss configs per level. |
| `map[9]` | `quest_durations` | `Map<Level, Uint<64>>` | Quest duration in seconds per level. |
| `map[10]` | `delegations` | `Map<Field, Field>` | Game address → wallet address. |

### Detection Methods

Achievements are detected through three methods:

- **Snapshot** — read directly from the current ledger payload.
- **Diff** — compare consecutive snapshots to detect state transitions (e.g., a battle disappearing from `map[1]` means it resolved). When a battle disappears, capture its last-known `BattleState` and `BattleConfig` from the previous snapshot to evaluate battle-end conditions. Similarly, when a quest disappears from `map[3]`, it was finalized.
- **DB Counter** — counters accumulated in the node database by tracking diffs over time. No on-chain ledger changes needed — the node observes payload transitions and increments counters in `d2d_player_stats`.

---

## Quest Achievements

### Quest Completion
- [x] **First Quest** — Complete your first quest and defeat a boss
  - *Requires:* `quests_completed >= 1`
  - *Detection:* **DB Counter** — increment `quests_completed` when a new `true` entry appears in `map[6]` (player_boss_progress). Each new `true` means a boss was defeated via quest.
- [x] **Novice Explorer** — Complete 5 quests
  - *Requires:* `quests_completed >= 5`
  - *Detection:* **DB Counter** — same counter, threshold 5.
- [x] **Seasoned Adventurer** — Complete 10 quests
  - *Requires:* `quests_completed >= 10`
  - *Detection:* **DB Counter** — same counter, threshold 10.
- [x] **Experienced Adventurer** — Complete 15 quests
  - *Requires:* `quests_completed >= 15`
  - *Detection:* **DB Counter** — same counter, threshold 15.
- [x] **Skilled Explorer** — Complete 20 quests
  - *Requires:* `quests_completed >= 20`
  - *Detection:* **DB Counter** — same counter, threshold 20.
- [x] **Expert Explorer** — Complete 25 quests
  - *Requires:* `quests_completed >= 25`
  - *Detection:* **DB Counter** — same counter, threshold 25.
- [x] **Veteran Explorer** — Complete 30 quests
  - *Requires:* `quests_completed >= 30`
  - *Detection:* **DB Counter** — same counter, threshold 30.
- [x] **Quest Master** — Complete 50 quests
  - *Requires:* `quests_completed >= 50`
  - *Detection:* **DB Counter** — same counter, threshold 50.
- [x] **Legendary Explorer** — Complete 100 quests
  - *Requires:* `quests_completed >= 100`
  - *Detection:* **DB Counter** — same counter, threshold 100.

### Biome Mastery
- [x] **Grasslands Conqueror** — Defeat the Grasslands boss at all 3 difficulties
  - *Requires:* `player_boss_progress[grasslands][1,2,3]` all true
  - *Detection:* **Snapshot** `map[6]` — for the player's entry, check biome `0` has keys `1`, `2`, `3` all with truthy values.
- [x] **Desert Conqueror** — Defeat the Scorched Desert boss at all 3 difficulties
  - *Requires:* `player_boss_progress[desert][1,2,3]` all true
  - *Detection:* **Snapshot** `map[6]` — check biome `1` has difficulties `1`, `2`, `3` all true.
- [x] **Tundra Conqueror** — Defeat the Frozen Tundra boss at all 3 difficulties
  - *Requires:* `player_boss_progress[tundra][1,2,3]` all true
  - *Detection:* **Snapshot** `map[6]` — check biome `2` has difficulties `1`, `2`, `3` all true.
- [x] **Cave Conqueror** — Defeat the Goblin Caves boss at all 3 difficulties
  - *Requires:* `player_boss_progress[caves][1,2,3]` all true
  - *Detection:* **Snapshot** `map[6]` — check biome `3` has difficulties `1`, `2`, `3` all true.
- [x] **World Conqueror** — Defeat all bosses in every biome at every difficulty
  - *Requires:* All `player_boss_progress` entries true
  - *Detection:* **Snapshot** `map[6]` — all 4 biomes (0-3) x 3 difficulties (1-3) = 12 entries must be true.

### Difficulty Progression
- [x] **Frontier Scout** — Defeat any Frontier (difficulty 1) boss
  - *Requires:* Any `player_boss_progress[*][1]` true
  - *Detection:* **Snapshot** `map[6]` — any biome entry has difficulty `1` = true.
- [x] **Interior Breacher** — Defeat any Interior (difficulty 2) boss
  - *Requires:* Any `player_boss_progress[*][2]` true
  - *Detection:* **Snapshot** `map[6]` — any biome entry has difficulty `2` = true.
- [x] **Stronghold Crusher** — Defeat any Stronghold (difficulty 3) boss
  - *Requires:* Any `player_boss_progress[*][3]` true
  - *Detection:* **Snapshot** `map[6]` — any biome entry has difficulty `3` = true.

### Boss Combat
- [x] **Flawless Victory** — Defeat a boss without taking any damage
  - *Requires:* `BattleState.damage_to_player == 0` at battle end (boss fight)
  - *Detection:* **Diff** — when a battle disappears from `map[1]`, read its last `BattleState` field `[4] damage_to_player == 0`. Confirm it was a boss fight by checking `BattleConfig.enemies` in `map[2]`: the `EnemyStats.boss_type` field should be `boss` (enum value 2). Confirm battle was won (enemies defeated).
- [x] **Close Call** — Defeat a boss with 90+ damage taken
  - *Requires:* `BattleState.damage_to_player >= 90` at battle end (boss fight, won)
  - *Detection:* **Diff** — same as Flawless Victory, but check `BattleState` field `[4] damage_to_player >= 90`.
- [x] **No Retreat** — Defeat 10 bosses without ever retreating
  - *Requires:* `bosses_defeated >= 10` AND `battles_retreated == 0`
  - *Detection:* **DB Counter** — track `bosses_defeated` (boss battle wins) and `battles_retreated` (battle disappears with 0 enemy damage). Check both thresholds.

### Multi-Quest Management
- [x] **Multitasker** — Have 3 quests active simultaneously (max capacity)
  - *Requires:* 3 entries in `quests` map for player
  - *Detection:* **Snapshot** `map[3]` — count entries belonging to this player (match `player_pub_key` inside packed `QuestConfig`, bits 64-319). If count >= 3, achievement unlocked.

### Losses and Resilience
- [x] **Fallen Hero** — Lose a boss fight (and your abilities with it)
  - *Requires:* `quests_failed >= 1`
  - *Detection:* **DB Counter** — increment `quests_failed` when a boss battle disappears from `map[1]` and `damage_to_player` indicates player HP reached 0 (player lost).
- [x] **Persistence** — Lose a boss fight, then defeat the same boss later
  - *Requires:* `quests_failed >= 1` AND matching `player_boss_progress` entry true
  - *Detection:* **DB Counter + Snapshot** — DB records which biome/difficulty the failed quest was for. Check `map[6]` for that same biome/difficulty being true.
- [x] **Tactical Retreat** — Retreat from a boss fight to save your abilities
  - *Requires:* `battles_retreated >= 1`
  - *Detection:* **DB Counter** — increment `battles_retreated` when a battle disappears from `map[1]` with 0 total enemy damage (retreat heuristic).

---

## Battle Achievements

### Battle Milestones
- [x] **First Blood** — Win your first battle
  - *Requires:* `battles_won >= 1`
  - *Detection:* **DB Counter** — increment `battles_won` when a battle disappears from `map[1]` with enemies defeated.
- [x] **Battle Hardened** — Win 50 battles
  - *Requires:* `battles_won >= 50`
  - *Detection:* **DB Counter** — same counter, threshold 50.
- [x] **Warmonger** — Win 100 battles
  - *Requires:* `battles_won >= 100`
  - *Detection:* **DB Counter** — same counter, threshold 100.
- [x] **Grizzled Veteran** — Win 250 battles
  - *Requires:* `battles_won >= 250`
  - *Detection:* **DB Counter** — same counter, threshold 250.

### Battle Feats
- [x] **Speed Demon** — Win a battle in a single round
  - *Requires:* `BattleState.round == 1` at battle win
  - *Detection:* **Diff** — when a won battle disappears from `map[1]`, check its last `BattleState` field `[0] round == 1`.
- [x] **Marathon Fight** — Win a battle that lasted 10+ rounds
  - *Requires:* `BattleState.round >= 10` at battle win
  - *Detection:* **Diff** — same check, `BattleState` field `[0] round >= 10`.
- [x] **Untouchable** — Win a 3-enemy battle taking 0 damage
  - *Requires:* `BattleState.damage_to_player == 0` at win, 3 enemies in `BattleConfig`
  - *Detection:* **Diff** — check `BattleState` field `[4] damage_to_player == 0`. Confirm 3 enemies from `BattleConfig.enemies.count`.
- [x] **Survivor** — Win a battle with 95+ damage taken
  - *Requires:* `BattleState.damage_to_player >= 95` at battle win
  - *Detection:* **Diff** — check `BattleState` field `[4] damage_to_player >= 95`.

### Combat Totals
- [x] **Slayer** — Defeat 100 enemies total
  - *Requires:* `enemies_defeated >= 100`
  - *Detection:* **DB Counter** — increment `enemies_defeated` per enemy killed in each resolved battle (compare damage vs HP from `BattleConfig.enemies`).
- [x] **Annihilator** — Defeat 500 enemies total
  - *Requires:* `enemies_defeated >= 500`
  - *Detection:* **DB Counter** — same counter, threshold 500.
- [x] **Round Veteran** — Play 500 combat rounds
  - *Requires:* `rounds_played >= 500`
  - *Detection:* **DB Counter** — add final `BattleState.round` to `rounds_played` when each battle resolves.

---

## Spirit & Deck Achievements

### Spirit Collection
- [x] **Spirit Caller** — Own 10 spirits
  - *Requires:* Sum of `player_abilities` counts >= 10
  - *Detection:* **Snapshot** `map[5]` — sum all quantity values for the player. Check sum >= 10.
- [x] **Spirit Collector** — Own 25 spirits
  - *Requires:* Sum of `player_abilities` counts >= 25
  - *Detection:* **Snapshot** `map[5]` — same, threshold 25.
- [x] **Spirit Hoarder** — Own 50 spirits
  - *Requires:* Sum of `player_abilities` counts >= 50
  - *Detection:* **Snapshot** `map[5]` — same, threshold 50.
- [ ] **Full Arsenal** — Own at least one Fire, Ice, Physical, and Block spirit
  - *Requires:* At least one ability of each base effect type in `player_abilities`
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — look up each owned ability's `effect.value.effect_type`. Check coverage of `attack_phys` (0), `attack_fire` (1), `attack_ice` (2), `block` (3).

### Deck Building
- [ ] **Mono Fire** — Win a battle with only fire-attack spirits in your loadout
  - *Requires:* All 7 loadout abilities have fire attack effect, battle won
  - *Detection:* **Diff** + `map[0]` — extract 7 loadout ability IDs from last `BattleConfig`. Look up each in `map[0]`, check all have `effect_type == attack_fire` (1).
- [ ] **Mono Ice** — Win a battle with only ice-attack spirits in your loadout
  - *Requires:* All 7 loadout abilities have ice attack effect, battle won
  - *Detection:* **Diff** + `map[0]` — same, check all have `effect_type == attack_ice` (2).
- [ ] **Glass Cannon** — Win a battle with no block or heal spirits in your loadout
  - *Requires:* No block/heal abilities in loadout, battle won
  - *Detection:* **Diff** + `map[0]` — check no loadout ability has `effect_type == block` (3).
- [ ] **Mono Physical** — Win a battle with only physical-attack spirits in your loadout
  - *Requires:* All 7 loadout abilities have physical attack effect, battle won
  - *Detection:* **Diff** + `map[0]` — same as Mono Fire, check all have `effect_type == attack_phys` (0).

---

## Upgrade Achievements

### Upgrade Milestones
- [ ] **Apprentice Smith** — Upgrade a spirit for the first time
  - *Requires:* `abilities_upgraded >= 1`
  - *Detection:* **DB Counter** — increment `abilities_upgraded` when any ability's `upgrade_level` increases in `map[0]` between snapshots.
- [ ] **Journeyman Smith** — Upgrade 10 spirits
  - *Requires:* `abilities_upgraded >= 10`
  - *Detection:* **DB Counter** — same counter, threshold 10.
- [ ] **Master Smith** — Upgrade 25 spirits
  - *Requires:* `abilities_upgraded >= 25`
  - *Detection:* **DB Counter** — same counter, threshold 25.

### Upgrade by Type
- [ ] **Pyro Forger** — Upgrade 10 fire-attack spirits
  - *Requires:* `fire_upgraded >= 10`
  - *Detection:* **DB Counter** — on upgrade event (ability's `upgrade_level` increases in `map[0]` between snapshots), look up the upgraded ability's `effect_type`. If `attack_fire` (1), increment `fire_upgraded`.
- [ ] **Cryo Forger** — Upgrade 10 ice-attack spirits
  - *Requires:* `ice_upgraded >= 10`
  - *Detection:* **DB Counter** — same pattern, check `effect_type == attack_ice` (2). Increment `ice_upgraded`.
- [ ] **Weapons Forger** — Upgrade 10 physical-attack spirits
  - *Requires:* `phys_upgraded >= 10`
  - *Detection:* **DB Counter** — same pattern, check `effect_type == attack_phys` (0). Increment `phys_upgraded`.
- [ ] **Shield Forger** — Upgrade 10 block spirits
  - *Requires:* `block_upgraded >= 10`
  - *Detection:* **DB Counter** — same pattern, check `effect_type == block` (3). Increment `block_upgraded`.

### Upgrade Quality
- [ ] **Rising Star** — Own a spirit at 2 stars
  - *Requires:* Any ability in `player_abilities` with `upgrade_level >= 2`
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — look up `upgrade_level` for each owned ability. Check any >= 2.
- [ ] **Perfection** — Own a spirit at 3 stars (max)
  - *Requires:* Any ability in `player_abilities` with `upgrade_level == 3`
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — check any `upgrade_level == 3`.
- [ ] **Master Forger** — Own 3 fully upgraded (3-star) spirits simultaneously
  - *Requires:* 3+ abilities with `upgrade_level == 3`
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — count owned abilities where `upgrade_level == 3` >= 3.
- [ ] **Max Power** — Own a 3-star spirit of every element (Fire, Ice, Physical)
  - *Requires:* 3-star ability for each attack element type
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — among abilities with `upgrade_level == 3`, check coverage of `attack_phys` (0), `attack_fire` (1), `attack_ice` (2).

---

## Economy Achievements

### Gold Milestones
- [ ] **First Coin** — Earn your first gold
  - *Requires:* `total_gold_earned >= 1`
  - *Detection:* **DB Counter** — increment `total_gold_earned` by the delta when `map[4]` gold increases between snapshots.
- [ ] **Treasure Hunter** — Earn 500 gold total
  - *Requires:* `total_gold_earned >= 500`
  - *Detection:* **DB Counter** — same counter, threshold 500.
- [ ] **Golden Hoard** — Earn 2000 gold total
  - *Requires:* `total_gold_earned >= 2000`
  - *Detection:* **DB Counter** — same counter, threshold 2000.
- [ ] **Dragon's Vault** — Earn 10000 gold total
  - *Requires:* `total_gold_earned >= 10000`
  - *Detection:* **DB Counter** — same counter, threshold 10000.

### Spending
- [ ] **Big Spender** — Spend 1000 gold total
  - *Requires:* `total_gold_spent >= 1000`
  - *Detection:* **DB Counter** — increment `total_gold_spent` by the delta when `map[4]` gold decreases between snapshots.

### Selling
- [ ] **Merchant** — Sell 10 spirits
  - *Requires:* `abilities_sold >= 10`
  - *Detection:* **DB Counter** — increment `abilities_sold` when ability quantities decrease in `map[5]` coinciding with a gold increase in `map[4]`.
- [ ] **Spirit Trader** — Sell 50 spirits
  - *Requires:* `abilities_sold >= 50`
  - *Detection:* **DB Counter** — same counter, threshold 50.

### Selling by Type
- [ ] **Fire Sale** — Sell 15 fire-attack spirits
  - *Requires:* `fire_sold >= 15`
  - *Detection:* **DB Counter** — on sell event (ability quantity decreases in `map[5]` + gold increases in `map[4]`), look up the sold ability in `map[0]`. If `effect_type == attack_fire` (1), increment `fire_sold`.
- [ ] **Cold Surplus** — Sell 15 ice-attack spirits
  - *Requires:* `ice_sold >= 15`
  - *Detection:* **DB Counter** — same pattern, check `effect_type == attack_ice` (2). Increment `ice_sold`.
- [ ] **Disarmed** — Sell 15 physical-attack spirits
  - *Requires:* `phys_sold >= 15`
  - *Detection:* **DB Counter** — same pattern, check `effect_type == attack_phys` (0). Increment `phys_sold`.
- [ ] **Shields Down** — Sell 15 block spirits
  - *Requires:* `block_sold >= 15`
  - *Detection:* **DB Counter** — same pattern, check `effect_type == block` (3). Increment `block_sold`.

---

## Combat Mastery Achievements

### Elemental Mastery
- [ ] **Balanced Fighter** — Win a battle with all 3 attack elements in your loadout (Physical, Fire, and Ice)
  - *Requires:* Loadout contains at least one `attack_phys`, one `attack_fire`, and one `attack_ice` ability, battle won
  - *Detection:* **Diff** + `map[0]` — extract 7 loadout ability IDs from last `BattleConfig`. Look up each in `map[0]`, check `effect_type` coverage includes `attack_phys` (0), `attack_fire` (1), `attack_ice` (2).
- [ ] **Elemental Focus** — Win a battle where every attack ability in your loadout shares the same element
  - *Requires:* All attack abilities in loadout have the same `effect_type`, battle won
  - *Detection:* **Diff** + `map[0]` — extract loadout, look up effect types. Filter to attack types only (0, 1, 2). Check all are the same value.
- [ ] **Full Spectrum** — Own an upgraded (1+ star) ability of every effect type
  - *Requires:* At least one ability with `upgrade_level >= 1` for each of attack_phys, attack_fire, attack_ice, block
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — among owned abilities with `upgrade_level >= 1`, check coverage of all 4 effect types.

### Energy Synergy
- [ ] **Energy Collector** — Own abilities generating all 3 energy colors
  - *Requires:* Owned abilities cover `generate_color` values 0, 1, and 2
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — look up `generate_color` for each owned ability (skip `none`). Check distinct values include 0, 1, 2.
- [ ] **Energy Specialist** — Own 3+ abilities that generate the same energy color
  - *Requires:* Any single `generate_color` value appears on 3+ owned abilities
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — group owned abilities by `generate_color`, check any group has size >= 3.
- [ ] **Overcharged** — Win a battle with 3+ loadout abilities sharing the same energy color
  - *Requires:* 3+ abilities in loadout have the same `generate_color`, battle won
  - *Detection:* **Diff** + `map[0]` — extract loadout, group by `generate_color`. Check any group has size >= 3.

### Damage Output
- [ ] **Damage Dealer** — Deal 300+ total damage to enemies in a single battle
  - *Requires:* `damage_to_enemy_0 + damage_to_enemy_1 + damage_to_enemy_2 >= 300` at battle win
  - *Detection:* **Diff** — when a won battle disappears, sum `BattleState` fields `[5] + [6] + [7]` >= 300.
- [ ] **Overwhelming Force** — Deal 600+ total damage to enemies in a single battle
  - *Requires:* Same sum >= 600
  - *Detection:* **Diff** — same check, threshold 600.
- [ ] **Devastator** — Deal 10000 total damage across all battles
  - *Requires:* `total_damage_dealt >= 10000`
  - *Detection:* **DB Counter** — add `damage_to_enemy_0 + damage_to_enemy_1 + damage_to_enemy_2` to `total_damage_dealt` when each battle resolves.

### Loadout Mastery
- [ ] **Fortified** — Win a battle with 3+ block abilities in your loadout
  - *Requires:* 3+ loadout abilities have `effect_type == block`, battle won
  - *Detection:* **Diff** + `map[0]` — extract loadout, count abilities with `effect_type == block` (3). Check count >= 3.
- [ ] **AOE Arsenal** — Own 3+ abilities with AOE effects
  - *Requires:* 3+ owned abilities have `effect.is_aoe == true`
  - *Detection:* **Snapshot** `map[5]` + `map[0]` — look up each owned ability, check `effect.is_aoe`. Count >= 3.
- [ ] **Power Surge** — Win a battle with a fully upgraded (3-star) ability in your loadout
  - *Requires:* Any loadout ability has `upgrade_level == 3`, battle won
  - *Detection:* **Diff** + `map[0]` — extract loadout, look up `upgrade_level` for each. Check any == 3.
