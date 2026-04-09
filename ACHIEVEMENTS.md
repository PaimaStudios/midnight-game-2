# Achievements

## Data Requirements

Achievements rely on player statistics tracked in the state machine. Below are the **new fields needed** beyond existing contract state.

### Already Available (no changes needed)
- `player_boss_progress[biome][difficulty]` — boss completion per biome/tier
- `player_abilities[ability_id]` — current spirit inventory with counts
- `all_abilities[ability_id].upgrade_level` — upgrade level (0-3) per ability
- `gold` — current gold balance
- `BattleState.round` — round counter during active battle
- `BattleState.damage_to_player` — cumulative damage taken in active battle
- `BattleState.damage_to_enemy_0/1/2` — cumulative damage dealt per enemy

### New Player Stats (add to Player struct or new `player_stats` ledger map)
| Field | Type | Updated When |
|---|---|---|
| `battles_won` | `Uint<32>` | `combat_round` → all enemies defeated |
| `battles_lost` | `Uint<32>` | `combat_round` → player HP reaches 0 |
| `battles_retreated` | `Uint<32>` | `retreat_from_battle` called |
| `quests_completed` | `Uint<32>` | `finalize_quest` → boss defeated |
| `quests_failed` | `Uint<32>` | `finalize_quest` → boss not defeated |
| `total_gold_earned` | `Uint<32>` | Any gold gain (battle reward, sell) |
| `total_gold_spent` | `Uint<32>` | Any gold spend (upgrade) |
| `enemies_defeated` | `Uint<32>` | `combat_round` → per enemy reaching 0 HP |
| `abilities_sold` | `Uint<32>` | `sell_ability` called |
| `abilities_upgraded` | `Uint<32>` | `upgrade_ability` called |
| `energy_combos_triggered` | `Uint<32>` | `combat_round` → energy trigger activates |
| `super_effective_hits` | `Uint<32>` | `combat_round` → attack vs super-effective defense |
| `immune_hits` | `Uint<32>` | `combat_round` → attack vs immune defense |
| `total_damage_dealt` | `Uint<32>` | `combat_round` → sum of all damage to enemies |
| `total_damage_blocked` | `Uint<32>` | `combat_round` → block absorption applied |
| `total_healing_done` | `Uint<32>` | `combat_round` → heal effect applied |
| `max_hit_damage` | `Uint<32>` | `combat_round` → single highest damage instance |
| `rounds_played` | `Uint<32>` | `combat_round` → every round |
| `aoe_attacks_used` | `Uint<32>` | `combat_round` → AOE ability used |
| `bosses_defeated` | `Uint<32>` | `combat_round` → boss-type enemy defeated |

### New Per-Battle Tracking (available from BattleState during battle, no persistence needed)
These can be derived at battle end from existing `BattleState`:
- Rounds survived = `BattleState.round`
- Damage taken = `BattleState.damage_to_player`
- Whether it was a 3-enemy fight = check `BattleConfig` enemy count

---

## Quest Achievements

### Quest Completion
- **First Quest** — Complete your first quest and defeat a boss
  - *Requires:* `quests_completed >= 1`
- **Seasoned Adventurer** — Complete 10 quests
  - *Requires:* `quests_completed >= 10`
- **Veteran Explorer** — Complete 50 quests
  - *Requires:* `quests_completed >= 50`

### Biome Mastery
- **Grasslands Conqueror** — Defeat the Grasslands boss at all 3 difficulties
  - *Requires:* `player_boss_progress[grasslands][1,2,3]` all true
- **Desert Conqueror** — Defeat the Scorched Desert boss at all 3 difficulties
  - *Requires:* `player_boss_progress[desert][1,2,3]` all true
- **Tundra Conqueror** — Defeat the Frozen Tundra boss at all 3 difficulties
  - *Requires:* `player_boss_progress[tundra][1,2,3]` all true
- **Cave Conqueror** — Defeat the Goblin Caves boss at all 3 difficulties
  - *Requires:* `player_boss_progress[caves][1,2,3]` all true
- **World Conqueror** — Defeat all bosses in every biome at every difficulty
  - *Requires:* All `player_boss_progress` entries true

### Difficulty Progression
- **Frontier Scout** — Defeat any Frontier (difficulty 1) boss
  - *Requires:* Any `player_boss_progress[*][1]` true
- **Interior Breacher** — Defeat any Interior (difficulty 2) boss
  - *Requires:* Any `player_boss_progress[*][2]` true
- **Stronghold Crusher** — Defeat any Stronghold (difficulty 3) boss
  - *Requires:* Any `player_boss_progress[*][3]` true

### Boss Combat
- **Flawless Victory** — Defeat a boss without taking any damage
  - *Requires:* `BattleState.damage_to_player == 0` at battle end (boss fight)
- **Close Call** — Defeat a boss with 90+ damage taken
  - *Requires:* `BattleState.damage_to_player >= 90` at battle end (boss fight, alive)
- **No Retreat** — Defeat 10 bosses without ever retreating
  - *Requires:* `bosses_defeated >= 10` AND `battles_retreated == 0`

### Multi-Quest Management
- **Multitasker** — Have 3 quests active simultaneously (max capacity)
  - *Requires:* 3 entries in `quests` map for player

### Losses and Resilience
- **Fallen Hero** — Lose a boss fight (and your abilities with it)
  - *Requires:* `quests_failed >= 1`
- **Persistence** — Lose a boss fight, then defeat the same boss later
  - *Requires:* `quests_failed >= 1` AND matching `player_boss_progress` entry true
- **Tactical Retreat** — Retreat from a boss fight to save your abilities
  - *Requires:* `battles_retreated >= 1`

---

## Battle Achievements

### Battle Milestones
- **First Blood** — Win your first battle
  - *Requires:* `battles_won >= 1`
- **Battle Hardened** — Win 50 battles
  - *Requires:* `battles_won >= 50`
- **Warmonger** — Win 100 battles
  - *Requires:* `battles_won >= 100`
- **Grizzled Veteran** — Win 250 battles
  - *Requires:* `battles_won >= 250`

### Battle Feats
- **Speed Demon** — Win a battle in a single round
  - *Requires:* `BattleState.round == 1` at battle win
- **Marathon Fight** — Win a battle that lasted 10+ rounds
  - *Requires:* `BattleState.round >= 10` at battle win
- **Untouchable** — Win a 3-enemy battle taking 0 damage
  - *Requires:* `BattleState.damage_to_player == 0` at win, 3 enemies in `BattleConfig`
- **Survivor** — Win a battle with 95+ damage taken
  - *Requires:* `BattleState.damage_to_player >= 95` at battle win

### Combat Totals
- **Slayer** — Defeat 100 enemies total
  - *Requires:* `enemies_defeated >= 100`
- **Annihilator** — Defeat 500 enemies total
  - *Requires:* `enemies_defeated >= 500`
- **Round Veteran** — Play 500 combat rounds
  - *Requires:* `rounds_played >= 500`

---

## Spirit & Deck Achievements

### Spirit Collection
- **Spirit Caller** — Own 10 spirits
  - *Requires:* Sum of `player_abilities` counts >= 10
- **Spirit Collector** — Own 25 spirits
  - *Requires:* Sum of `player_abilities` counts >= 25
- **Spirit Hoarder** — Own 50 spirits
  - *Requires:* Sum of `player_abilities` counts >= 50
- **Full Arsenal** — Own at least one Fire, Ice, Physical, and Block spirit
  - *Requires:* At least one ability of each base effect type in `player_abilities`

### Deck Building
- **Mono Fire** — Win a battle with only fire-attack spirits in your loadout
  - *Requires:* All 7 loadout abilities have fire attack effect, battle won
- **Mono Ice** — Win a battle with only ice-attack spirits in your loadout
  - *Requires:* All 7 loadout abilities have ice attack effect, battle won
- **Glass Cannon** — Win a battle with no block or heal spirits in your loadout
  - *Requires:* No block/heal abilities in loadout, battle won
- **Iron Wall** — Win a battle with no attack spirits in your loadout
  - *Requires:* No attack abilities in loadout, battle won (block/heal only)

---

## Upgrade Achievements

### Upgrade Milestones
- **Apprentice Smith** — Upgrade a spirit for the first time
  - *Requires:* `abilities_upgraded >= 1`
- **Journeyman Smith** — Upgrade 10 spirits
  - *Requires:* `abilities_upgraded >= 10`
- **Master Smith** — Upgrade 25 spirits
  - *Requires:* `abilities_upgraded >= 25`

### Upgrade Quality
- **Rising Star** — Own a spirit at 2 stars
  - *Requires:* Any ability in `player_abilities` with `upgrade_level >= 2`
- **Perfection** — Own a spirit at 3 stars (max)
  - *Requires:* Any ability in `player_abilities` with `upgrade_level == 3`
- **Master Forger** — Own 3 fully upgraded (3-star) spirits simultaneously
  - *Requires:* 3+ abilities in `player_abilities` with `upgrade_level == 3`
- **Max Power** — Own a 3-star spirit of every element (Fire, Ice, Physical)
  - *Requires:* 3-star ability for each attack element type

---

## Economy Achievements

### Gold Milestones
- **First Coin** — Earn your first gold
  - *Requires:* `total_gold_earned >= 1`
- **Treasure Hunter** — Earn 500 gold total
  - *Requires:* `total_gold_earned >= 500`
- **Golden Hoard** — Earn 2000 gold total
  - *Requires:* `total_gold_earned >= 2000`
- **Dragon's Vault** — Earn 10000 gold total
  - *Requires:* `total_gold_earned >= 10000`

### Spending
- **Big Spender** — Spend 1000 gold total
  - *Requires:* `total_gold_spent >= 1000`

### Selling
- **Merchant** — Sell 10 spirits
  - *Requires:* `abilities_sold >= 10`
- **Spirit Trader** — Sell 50 spirits
  - *Requires:* `abilities_sold >= 50`

---

## Combat Mastery Achievements

### Elemental Mastery
- **Elemental Student** — Land 25 super-effective hits
  - *Requires:* `super_effective_hits >= 25`
- **Elemental Master** — Land 100 super-effective hits
  - *Requires:* `super_effective_hits >= 100`
- **Wrong Element** — Hit an immune enemy (deal 0 damage)
  - *Requires:* `immune_hits >= 1`

### Energy Combos
- **Spark** — Trigger your first energy combo
  - *Requires:* `energy_combos_triggered >= 1`
- **Chain Reaction** — Trigger 50 energy combos total
  - *Requires:* `energy_combos_triggered >= 50`
- **Combo Maestro** — Trigger 200 energy combos total
  - *Requires:* `energy_combos_triggered >= 200`

### Damage & Defense
- **Heavy Hitter** — Deal 100+ damage in a single hit
  - *Requires:* `max_hit_damage >= 100`
- **Devastator** — Deal 10000 total damage across all battles
  - *Requires:* `total_damage_dealt >= 10000`
- **Shieldwall** — Block 5000 total damage across all battles
  - *Requires:* `total_damage_blocked >= 5000`
- **Field Medic** — Heal 2000 total HP across all battles
  - *Requires:* `total_healing_done >= 2000`

### AOE
- **Area Denial** — Use 50 AOE attacks total
  - *Requires:* `aoe_attacks_used >= 50`
- **Carpet Bomber** — Use 200 AOE attacks total
  - *Requires:* `aoe_attacks_used >= 200`
