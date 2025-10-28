# Midnight Game 2

## Building

```bash
yarn install

cd contract
npm run compact
npm run build

cd ../api
npm run build

cd ../
yarn deploy
yarn admin register-content

cd ../phaser
npm run build-batcher
npm run preview
```

Now the game will be available at `http://localhost:4173/`

To play on-chain you will need to run a node, proof server, and batcher, explained here: https://github.com/PaimaStudios/midnight-batcher


### CLI Contract Commands

- `yarn deploy` - Deploy a new contract using batcher
- `yarn deploy info` - Show current deployment info
- `yarn deploy clear --confirm` - Clear deployment data
- `yarn admin register-content` - Register all game content
- `yarn admin join --contract <address>` - Get information on an existing contract

See cli/README.md for more information on deploying and interacting with game contracts.