# Game2 CLI Tools

Separate deployment and admin tooling for Game2 contracts. This addresses [issue #77](https://github.com/PaimaStudios/midnight-game-2/issues/77) by separating contract deployment from the Phaser app.

## Overview

Previously, the game would re-deploy the contract every time, which reset all data. This CLI tooling allows you to:

1. **Deploy once** - Deploy a contract and save the contract address
2. **Register content** - Use admin circuits to register levels, enemies, and bosses
3. **Join existing contract** - Configure the Phaser app to join an existing contract instead of deploying

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

- `INDEXER_URI` - Indexer HTTP endpoint (default: `http://localhost:8080`)
- `INDEXER_WS_URI` - Indexer WebSocket endpoint (default: `ws://localhost:8080`)
- `PROVER_URI` - Prover server endpoint (default: `http://localhost:6565`)
- `ZK_CONFIG_URI` - ZK config base URI (default: `http://localhost:3000`)
- `LOG_LEVEL` - Logging level (default: `info`)

Example:

```bash
INDEXER_URI=http://my-indexer:8080 yarn deploy
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

### Providers

The CLI tools use a similar provider structure to the Phaser app, but adapted for Node.js:

- **Private State**: Uses LevelDB storage (separate from browser storage)
- **ZK Config**: Fetches from configured endpoint
- **Proof Provider**: Uses HTTP client proof provider
- **Public Data**: Connects to indexer
- **Wallet**: Requires wallet API setup (TODO)

### Security

The player ID witness (admin secret key) is stored securely in `~/.game2-cli/deployment.json` with file permissions set to 0600 (owner read/write only). This key authenticates admin operations.

**Important**: Keep your `~/.game2-cli/` directory backed up securely, as losing the admin key means you cannot perform admin operations on your deployed contract.

## Current Limitations

### Wallet Integration (TODO)

The CLI tools currently have placeholder wallet initialization. To use these tools in production, you need to:

1. Set up wallet provider for Node.js environment
2. Configure wallet connection similar to browser setup
3. Handle wallet authentication and transaction signing

This is similar to how the browser app connects to the Midnight Lace wallet, but needs to be adapted for CLI usage.

### Private State Provider

The current implementation uses LevelDB for private state storage. The storage location may need to be explicitly configured depending on your environment.

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
│   ├── admin.ts       # Admin CLI tool
│   ├── deploy.ts      # Deployment CLI tool
│   ├── content.ts     # Content registration logic
│   ├── providers.ts   # Provider initialization
│   └── storage.ts     # Secure storage for deployment data
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

### Wallet errors

The wallet integration is not yet complete. See "Current Limitations" above.

## Contributing

When adding new game content:

1. Edit [cli/src/content.ts](./src/content.ts)
2. Add your enemy configurations and level definitions
3. Run `yarn admin register-content` to deploy

For questions or issues, please file an issue on GitHub.
