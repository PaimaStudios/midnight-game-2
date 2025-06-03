# Midnight Game 2

## Building

```
yarn install

cd compact
npm install

cd ../contract
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