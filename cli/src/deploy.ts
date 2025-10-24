#!/usr/bin/env node

import { Command } from 'commander';
import pino from 'pino';
import * as readline from 'readline';
import { Game2API } from 'game2-api';
import { saveDeploymentData, loadDeploymentData, hasDeploymentData } from './storage.js';
import { initializeBatcherProviders, type BatcherConfig } from './batcher-providers.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
  level: process.env.LOG_LEVEL || 'info',
});

async function confirmDeployment(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\nType "yes" to confirm deployment: \n\n', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

const program = new Command();

program
  .name('game2-deploy')
  .description('Deploy and manage Game2 contracts')
  .version('0.1.0');

program
  .command('deploy')
  .description('Deploy a new Game2 contract using batcher mode')
  .option('--batcher-url <url>', 'Batcher URL', process.env.BATCHER_URL || 'http://localhost:8000')
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || 'http://127.0.0.1:8088/api/v1/graphql')
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || 'ws://127.0.0.1:8088/api/v1/graphql/ws')
  .option('--prover-uri <uri>', 'Prover server URI (REQUIRED - run midnight-prover)', process.env.PROVER_URI || 'http://localhost:6300')
  .option('--force', 'Force deploy even if deployment data exists')
  .action(async (options) => {
    try {
      // Check if deployment already exists
      if (!options.force && await hasDeploymentData()) {
        const existing = await loadDeploymentData();
        logger.warn(`Deployment already exists at address: ${existing?.contractAddress}`);
        logger.warn('Use --force to deploy a new contract anyway, or use "yarn admin info" to view existing deployment');
        process.exit(1);
      }

      // Confirmation prompt
      logger.warn('');
      logger.warn('WARNING: Deploying a new contract will:');
      logger.warn('  - Create a fresh contract with no game data');
      logger.warn('  - Reset all levels, enemies, and player progress');
      logger.warn('  - Require re-registering all game content');
      logger.warn('');

      const confirmed = await confirmDeployment();
      if (!confirmed) {
        logger.info('Deployment cancelled.');
        process.exit(0);
      }

      logger.info('Deploying Game2 contract using batcher mode...');
      logger.info(`Batcher URL: ${options.batcherUrl}`);
      logger.info(`Indexer URI: ${options.indexerUri}`);
      logger.info(`Prover URI: ${options.proverUri}`);

      const config: BatcherConfig = {
        batcherUrl: options.batcherUrl,
        indexerUri: options.indexerUri,
        indexerWsUri: options.indexerWsUri,
        proverUri: options.proverUri,
      };

      const providers = await initializeBatcherProviders(config, logger);
      logger.info('Providers initialized, deploying contract...');

      const api = await Game2API.deploy(providers, logger);

      const deploymentData = {
        contractAddress: api.deployedContractAddress,
        deployedAt: new Date().toISOString(),
      };

      const savedPath = await saveDeploymentData(deploymentData);

      logger.info('');
      logger.info('Contract deployed successfully!');
      logger.info(`Contract address: ${api.deployedContractAddress}`);
      logger.info(`Deployment data saved to: ${savedPath}`);
      logger.info('');
      logger.info('Next steps:');
      logger.info('1. Register game content: yarn admin register-content');
      logger.info('2. Configure your Phaser app: echo "VITE_CONTRACT_ADDRESS=' + api.deployedContractAddress + '" > phaser/.env');
      logger.info('3. Start the game: cd phaser && yarn dev');

    } catch (error) {
      logger.error('Deployment failed:');
      if (error instanceof Error) {
        logger.error(`  Error: ${error.message}`);
        if (error.stack) {
          logger.debug(`  Stack: ${error.stack}`);
        }
      } else {
        logger.error(`  ${error}`);
      }
      logger.error('');
      logger.error('Common issues:');
      logger.error('  - Indexer not running (check http://127.0.0.1:8088/api/v1/graphql)');
      logger.error('  - Prover server not running (check http://localhost:6300)');
      logger.error('  - ZK config not accessible (check http://localhost:3000)');
      logger.error('  - Batcher not fully synced');
      process.exit(1);
    }
  });

program.parse();
