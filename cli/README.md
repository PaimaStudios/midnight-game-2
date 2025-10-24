# Game2 CLI Tools

Separate deployment and admin tooling for Game2 contracts. This addresses [issue #77](https://github.com/PaimaStudios/midnight-game-2/issues/77).

## Overview

This CLI tooling allows you to:

1. **Deploy once** - Deploy a contract and save the contract address
2. **Register content** - Use admin circuits to register levels, enemies, and bosses
3. **Join existing contract** - Configure the Phaser app to join an existing contract instead of deploying

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

Deploy a new Game2 contract:

```bash
yarn deploy
```

View current deployment information:

```bash
yarn admin info
```

Clear deployment data (use with caution):

```bash
yarn admin clear --confirm
```

### Admin Commands

Register all game content (levels, enemies, bosses):

```bash
yarn admin register-content
```

Register only minimal content for testing:

```bash
yarn admin register-content --minimal
```

Join an existing contract:

```bash
yarn admin join --contract <contract-address>
```

## Configuration

### Environment Variables

The CLI tools support the following environment variables:

- `BATCHER_URL` - Batcher service URL (default: `http://localhost:8000`)
- `INDEXER_URI` - Indexer HTTP endpoint (default: `http://127.0.0.1:8088/api/v1/graphql`)
- `INDEXER_WS_URI` - Indexer WebSocket endpoint (default: `ws://127.0.0.1:8088/api/v1/graphql/ws`)
- `PROVER_URI` - Prover server endpoint (default: `http://localhost:6300`)
- `ZK_CONFIG_URI` - ZK config base URI (default: `http://localhost:3000`)
- `LOG_LEVEL` - Logging level (default: `info`)

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

Deployment data (including the contract address and admin keys) is stored securely in:

```
~/.game2-cli/deployment.json
```

This file has restricted permissions (0600) to protect the admin secret key.

## Connecting the Phaser App

After deploying a contract, configure the Phaser app to join it instead of deploying:

1. Create a `.env` file in the `phaser` directory:

```bash
VITE_CONTRACT_ADDRESS=<your-contract-address>
```

2. Start the Phaser app normally:

```bash
cd phaser
yarn dev
```

The app will automatically join the existing contract instead of deploying a new one.

## Workflow

### Initial Setup

1. Deploy the contract:
   ```bash
   yarn deploy
   ```

2. Register game content:
   ```bash
   yarn admin register-content
   ```

3. Configure Phaser app with the contract address (see above)

4. Start playing!

### Adding Content After Release

To add new levels or enemy configurations to an existing contract:

```bash
# Edit cli/src/content.ts to add your new content
# Then run:
yarn admin register-content
```

The admin tool will call `admin_level_add_config` to register the new content without affecting existing game state.

## Architecture

### Batcher Mode

The CLI tools use **batcher mode** instead of requiring a wallet. This means:

- **No wallet required** - Transactions are submitted through the batcher
- **Uses batcher's address** - The batcher's coin and encryption keys are used
- **Simpler setup** - Just requires a running batcher service

### Providers

The CLI tools use providers adapted for Node.js with batcher mode:

- **Private State**: Uses LevelDB storage (stored in `game2-cli-batcher-private-state`)
- **ZK Config**: Fetches from configured endpoint
- **Proof Provider**: Uses HTTP client proof provider (connects to prover server)
- **Public Data**: Connects to indexer via GraphQL
- **Wallet Provider**: Uses batcher's address (no actual wallet)
- **Midnight Provider**: Submits transactions to batcher

### Security

The player ID witness (admin secret key) is stored securely in `~/.game2-cli/deployment.json` with file permissions set to 0600 (owner read/write only). This key authenticates admin operations.

**Important**: Keep your `~/.game2-cli/` directory backed up securely, as losing the admin key means you cannot perform admin operations on your deployed contract.

## Development

### Building

```bash
cd cli
yarn build
```

### Project Structure

```
cli/
├── src/
│   ├── admin.ts              # Admin CLI tool
│   ├── deploy.ts             # Deployment CLI tool
│   ├── content.ts            # Content registration logic
│   ├── batcher-providers.ts  # Batcher mode provider initialization
│   ├── providers.ts          # Wallet provider initialization (unused)
│   └── storage.ts            # Secure storage for deployment data
├── package.json
└── README.md
```

## Troubleshooting

### "No deployment found"

You need to deploy a contract first:
```bash
yarn deploy
```

### "Deployment already exists"

Use `yarn admin info` to view the existing deployment, or use `--force` to deploy a new contract.

### "Batcher not available"

Make sure your batcher is running and accessible:
1. Check the batcher URL is correct (default: `http://localhost:8000`)
2. Verify the batcher service is running
3. Check network connectivity to the batcher

### "Failed to get batcher's address"

The batcher service needs to be fully started and synced:
1. Wait for the batcher to finish syncing with the blockchain
2. Check batcher logs for any errors
3. Verify the batcher has UTXOs available

### Connection timeout

If commands time out connecting to services:
1. Check all service URLs are correct
2. Verify indexer is running (default: `http://127.0.0.1:8088/api/v1/graphql`)
3. Ensure prover server is accessible (default: `http://localhost:6300`)
4. Check firewall settings

## Contributing

When adding new game content:

1. Edit [cli/src/content.ts](./src/content.ts)
2. Add your enemy configurations and level definitions
3. Run `yarn admin register-content` to deploy

For questions or issues, please file an issue on GitHub.
