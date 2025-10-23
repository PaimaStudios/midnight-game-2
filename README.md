# Midnight Game 2

## Building

```bash
yarn install

cd contract
npm run compact
npm run build

cd ../api
npm run build

cd ../phaser
npm run build-batcher
npm run preview
```

Now the game will be available at `http://localhost:4173/`

To play on-chain you will need to run a node and batcher, explained here: https://github.com/PaimaStudios/midnight-batcher

## Deployment & Administration

The game now includes separate CLI tools for contract deployment and administration. This allows you to:

- **Deploy once** instead of redeploying on every run (which resets data)
- **Join existing contracts** from the Phaser app
- **Register game content** (levels, enemies, bosses) via admin circuits

### Quick Start

1. **Deploy a contract:**
   ```bash
   yarn deploy
   ```

2. **Register game content:**
   ```bash
   yarn admin register-content
   ```

3. **Configure Phaser app** to join the contract:
   ```bash
   echo "VITE_CONTRACT_ADDRESS=<contract-address>" > phaser/.env
   ```

4. **Start the game:**
   ```bash
   cd phaser
   yarn dev
   ```

For detailed documentation, see [cli/README.md](./cli/README.md).

### CLI Commands

- `yarn deploy` - Deploy a new contract
- `yarn admin register-content` - Register all game content
- `yarn admin join --contract <address>` - Join an existing contract
- `yarn admin info` - Show current deployment info

**Note:** The CLI tools currently require wallet integration to be completed. See [cli/README.md](./cli/README.md) for details.