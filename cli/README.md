# Game CLI Tools

Separate deployment and admin tooling for Game contracts. This addresses [issue #77](https://github.com/PaimaStudios/midnight-game-2/issues/77).

## Overview

This CLI tooling allows you to:

1. **Deploy** - Deploy a contract and save the contract address
2. **Register content** - Use admin circuits to register levels, enemies, and bosses
3. **Admin Commands** - Configure and debug existing deployed contracts with admin commands

**Note:** The CLI tools use **batcher mode** which submits transactions through a batcher service instead of requiring a wallet. This makes deployment simpler but requires a running batcher and indexer.

## Prerequisites

Before using the CLI tools, you need to have running:

1. **Batcher** - See https://github.com/PaimaStudios/midnight-batcher
2. **Indexer** - Provided by the batcher setup (typically on port 8088)
3. **Prover server** (default: http://localhost:6300)

## Installation

From the root of the repository:

```bash
yarn install
```

## Commands

### Deployment Commands

Deploy a new Game contract:

```bash
yarn deploy
```

**Note:** The deploy command will prompt you to confirm before proceeding, as deploying a new contract resets all game data.

### Admin Commands

View current deployment information:

```bash
yarn admin info
```

Register all game content (levels, enemies, bosses):

```bash
yarn admin register-content
```

Register only minimal content for testing:

```bash
yarn admin register-content --minimal
```

Join an existing contract(or the current contract if --contract isn't provided). This simply connects to the contract address, verifies the connection, and logs the result, for debugging purposes:

```bash
yarn admin join --contract <contract-address>
```

Clear deployment data (use with caution):

```bash
yarn admin clear --confirm
```

## Configuration

### Environment Variables

The CLI tools support the following environment variables:

- `BATCHER_URL` - Batcher service URL (default: `http://localhost:8000`)
- `INDEXER_URI` - Indexer HTTP endpoint (default: `http://127.0.0.1:8088/api/v1/graphql`)
- `INDEXER_WS_URI` - Indexer WebSocket endpoint (default: `ws://127.0.0.1:8088/api/v1/graphql/ws`)
- `PROVER_URI` - Prover server endpoint (default: `http://localhost:6300`)

Example:

```bash
BATCHER_URL=http://my-batcher:8000 yarn deploy
```

### Command-Line Options

All environment variables can also be passed as command-line options:

```bash
yarn deploy --batcher-url http://my-batcher:8000 --indexer-uri http://my-indexer:8088/api/v1/graphql
```

### Storage

The CLI tools create two important directories:

**1. `~/.midnight-dust-to-dust/`** - Deployment metadata
- Location: Your home directory
- Contains: `deployment.json` with contract address and deployment timestamp
- Permissions: 0600 (owner read/write only)
- Backup: Recommended - you'll need this to use admin commands

**2. `midnight-level-db/`** - Private state database
- Location: Where you run the CLI commands (project root)
- Contains: LevelDB database with private key data and local state
- Git: **Must be ignored** (already in `.gitignore`)
- Delete: **DO NOT DELETE** - You'll lose access to private contract state
- Backup: **CRITICAL** - Cannot be recovered if lost (contains private data not on blockchain)

## Connecting the Phaser App

After deploying a contract, the deploy command automatically creates a `phaser/.env` file with your contract address. The Phaser app will automatically join the existing contract instead of deploying a new one.

**Note:** If you need to manually configure the contract address, you can edit `phaser/.env`:

```bash
VITE_CONTRACT_ADDRESS=<your-contract-address>
```

### Adding Content After Release

To add new levels or enemy configurations to an existing contract:

```bash
# Edit cli/src/content.ts to add your new content
# Then run:
yarn admin register-content
```

The admin tool will call `admin_level_add_config` to register the new content without affecting existing game state.
