# Achievement Findings

## New Players Should Not Receive Achievements on Registration

**Date:** 2026-04-10

### Problem

When a player registers (`register_new_player`), they immediately receive 3 achievements without having done anything:

- **spirit_caller** — "own 10+ spirits" triggers because starting abilities have quantities summing to 13 (4+1+1+1+4+1+1)
- **full_arsenal** — "own all 4 effect types" triggers because the starter deck covers phys, fire, ice, and block
- **energy_collector** — "own abilities generating all 3 energy colors" triggers because the starter deck covers all 3 colors

### Root Cause

`syncPlayerAbilities` (game-db.ts) checks achievement conditions on every ability sync, including the very first sync after registration. The starting loadout of 7 abilities is generous enough to satisfy these thresholds immediately.

### Affected Code

- `game-db.ts:1879` — `spirit_caller` threshold: `totalSpirits >= 10`
- `game-db.ts:1891` — `full_arsenal`: owns all 4 effect types
- `game-db.ts:1939` — `energy_collector`: owns all 3 energy colors

### Possible Fixes

1. **Track registration state**: Skip achievement checks on the first `syncPlayerAbilities` call for a player (i.e., when inserting, not updating).
2. **Raise thresholds**: Increase `spirit_caller` threshold above the starting total (e.g., 15+), though this doesn't fix `full_arsenal` or `energy_collector`.
3. **Require a battle**: Only check collection-based achievements after the player has won at least 1 battle (`battles_won >= 1` in `d2d_player_stats`).
4. **Change starting loadout**: Reduce starting ability variety so it doesn't cover all types/colors, but this affects game design.
