# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dust 2 Dust is a singleplayer fully on-chain deck-building dungeon-crawler game built on the Midnight Network. Players collect spirit abilities, battle enemies in turn-based combat, and progress through biome-based dungeons with boss encounters. All game logic runs on-chain using zero-knowledge proofs via the Compact language.

## Repository Structure

The repo is split into **frontend/** (Yarn/Node workspace) and **backend/** (Deno workspace).

### Frontend (`frontend/`)

Yarn 4.1.0 workspace with Turbo build orchestration. Four packages under `src/`:

- **`src/contract/`** — Receiving copy of compiled contract artifacts. **Do not edit contract logic here** — it is overwritten by the backend compact command. Contains `index.ts`, `witnesses.ts`, `constants.ts`, and `managed/` (auto-copied).
- **`src/api/`** — `Game2API` class providing TypeScript interface to the contract. Uses RxJS observables for reactive state synchronization.
- **`src/content/`** — Game content definitions (`register.ts` with levels, enemies, bosses, abilities). Used by both phaser (boot scene) and backend admin scripts.
- **`src/phaser/`** — Phaser 3 game frontend with Vite bundler. 10 scenes (Boot → Battle → Shop → Quest etc.). Includes `mockapi.ts` for in-memory testing without blockchain.

### Backend (`backend/`)

Deno workspace with three packages under `packages/`:

- **`packages/midnight/`** — Contract source of truth + deploy/admin scripts
  - `contract-game2/` — Compact contract source (`template.compact` → `generate.js` → `game2.compact`). The `compact` script compiles and copies artifacts to `frontend/src/contract/`.
  - `contract-game2-deploy.ts` — Contract deployment CLI (Node/commander-based)
  - `contract-game2-admin.ts` — Admin CLI (content registration, join, info, clear)
- **`packages/node/`** — Paima runtime node (stub)
- **`packages/batcher/`** — Batcher service (stub)

## Build & Development Commands

```bash
# --- Contract compilation (must be done first when contract changes) ---
cd backend/packages/midnight/contract-game2
npm run compact    # Generates game2.compact, compiles, copies artifacts to frontend
npm run build      # TypeScript compilation + copy artifacts to dist/

# --- Frontend ---
cd frontend
yarn install
yarn build         # Build all frontend packages (turbo)
yarn test          # Run all tests
yarn lint          # Lint all packages

# Individual frontend package builds
cd frontend/src/phaser
npm run dev            # Dev server with hot reload
npm run build-mock     # Mock mode build (no blockchain needed)
npm run build-batcher  # Batcher mode build (production-like)
npm run preview        # Preview built game

# --- Backend deploy/admin ---
cd backend/packages/midnight
deno task contract-game2:deploy              # Deploy new contract
deno task contract-game2:admin register-content  # Register all game content
deno task contract-game2:admin register-content --minimal  # Minimal content for testing
deno task contract-game2:admin info          # Show deployment info
```

## Contract Code Generation

The contract uses a code generation pipeline because Compact's ZK circuit constraints make repetitive combat calculations impossible to write with loops. `generate.js` reads `template.compact`, replaces placeholder strings (e.g., `INSERT_PLAYER_DAMAGE_CODE_HERE`) with generated arithmetic expressions, and writes `game2.compact`. **Never edit `game2.compact` directly — always edit `template.compact`.**

The backend `compact` script also copies the compiled `managed/` directory and `game2.compact` to `frontend/src/contract/src/` so the frontend can use the contract artifacts.

## Phaser Build Modes

Controlled via Vite modes and `.env` files in `frontend/src/phaser/`:
- **mock** — In-memory contract simulation, no blockchain. Best for UI development.
- **batcher-undeployed** — Connects to batcher service + indexer for production-like testing.
- **testnet** — Full testnet deployment with ZK proofs.

Key env vars: `VITE_API_FORCE_DEPLOY`, `VITE_CONTRACT_ADDRESS`, `VITE_BATCHER_MODE_ENABLED`, `VITE_SKIP_BATTLE_ANIMATIONS`.

## Critical Data (Do Not Delete)

- `midnight-level-db/` — LevelDB private state. **Unrecoverable if lost.**
- `~/.midnight-dust-to-dust/deployment.json` — Contract address and deployment metadata.

## On-Chain Infrastructure Requirements

For non-mock development: running Midnight node, batcher service (https://github.com/PaimaStudios/midnight-batcher), indexer (port 8088), and prover server (port 6300).
