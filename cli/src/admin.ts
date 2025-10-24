#!/usr/bin/env node

import { Command } from 'commander';
import pino from 'pino';
import { Game2API } from 'game2-api';
import { loadDeploymentData, clearDeploymentData } from './storage.js';
import { initializeBatcherProviders, type BatcherConfig } from './batcher-providers.js';
import { registerAllContent } from './content.js';

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

const program = new Command();

program
  .name('game2-admin')
  .description('Admin tools for Game2 contracts')
  .version('0.1.0');

program
  .command('register-content')
  .description('Register all game content (levels, enemies, bosses) using batcher mode')
  .option('--batcher-url <url>', 'Batcher URL', process.env.BATCHER_URL || 'http://localhost:8000')
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || 'http://127.0.0.1:8088/api/v1/graphql')
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || 'ws://127.0.0.1:8088/api/v1/graphql/ws')
  .option('--prover-uri <uri>', 'Prover server URI (REQUIRED - run midnight-prover)', process.env.PROVER_URI || 'http://localhost:6300')
  .option('--contract <address>', 'Contract address (overrides saved deployment)')
  .option('--minimal', 'Register only minimal content for testing')
  .action(async (options) => {
    try {
      // Get contract address
      let contractAddress = options.contract;
      if (!contractAddress) {
        const deployment = await loadDeploymentData();
        if (!deployment) {
          logger.error('No deployment found and no contract address provided.');
          logger.error('Either deploy a contract first or provide --contract <address>');
          process.exit(1);
        }
        contractAddress = deployment.contractAddress;
      }

      logger.info(`Connecting to contract: ${contractAddress}`);
      logger.info(`Batcher URL: ${options.batcherUrl}`);

      const config: BatcherConfig = {
        batcherUrl: options.batcherUrl,
        indexerUri: options.indexerUri,
        indexerWsUri: options.indexerWsUri,
        proverUri: options.proverUri,
      };

      const providers = await initializeBatcherProviders(config, logger);
      logger.info('Providers initialized, joining contract...');

      const api = await Game2API.join(providers, contractAddress, logger);
      logger.info('Successfully joined contract!');

      logger.info('Registering game content...');
      await registerAllContent(api, options.minimal ?? false, logger);

      logger.info('');
      logger.info('All content registered successfully!');

    } catch (error) {
      logger.error(`Content registration failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('join')
  .description('Join an existing contract and verify connection using batcher mode')
  .option('--batcher-url <url>', 'Batcher URL', process.env.BATCHER_URL || 'http://localhost:8000')
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || 'http://127.0.0.1:8088/api/v1/graphql')
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || 'ws://127.0.0.1:8088/api/v1/graphql/ws')
  .option('--prover-uri <uri>', 'Prover server URI (REQUIRED - run midnight-prover)', process.env.PROVER_URI || 'http://localhost:6300')
  .option('--contract <address>', 'Contract address')
  .action(async (options) => {
    try {
      let contractAddress = options.contract;
      if (!contractAddress) {
        const deployment = await loadDeploymentData();
        if (!deployment) {
          logger.error('No deployment found and no contract address provided.');
          process.exit(1);
        }
        contractAddress = deployment.contractAddress;
      }

      logger.info(`Joining contract: ${contractAddress}`);
      logger.info(`Batcher URL: ${options.batcherUrl}`);

      const config: BatcherConfig = {
        batcherUrl: options.batcherUrl,
        indexerUri: options.indexerUri,
        indexerWsUri: options.indexerWsUri,
        proverUri: options.proverUri,
      };

      const providers = await initializeBatcherProviders(config, logger);
      const api = await Game2API.join(providers, contractAddress, logger);

      logger.info('');
      logger.info('Successfully joined contract!');
      logger.info(`Contract address: ${api.deployedContractAddress}`);

    } catch (error) {
      logger.error(`Failed to join contract: ${error}`);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show deployment information')
  .action(async () => {
    try {
      const data = await loadDeploymentData();

      if (!data) {
        logger.info('No deployment found.');
        logger.info('Run "yarn deploy" to deploy a new contract.');
        return;
      }

      logger.info('Current deployment:');
      logger.info(`  Contract Address: ${data.contractAddress}`);
      logger.info(`  Deployed At: ${data.deployedAt}`);
    } catch (error) {
      logger.error(`Failed to load deployment info: ${error}`);
      process.exit(1);
    }
  });

program
  .command('clear')
  .description('Clear deployment data (use with caution)')
  .option('--confirm', 'Confirm deletion')
  .action(async (options) => {
    if (!options.confirm) {
      logger.warn('This will delete your deployment data.');
      logger.warn('Run with --confirm to proceed.');
      return;
    }

    try {
      await clearDeploymentData();
      logger.info('Deployment data cleared successfully.');
    } catch (error) {
      logger.error(`Failed to clear deployment data: ${error}`);
      process.exit(1);
    }
  });

program.parse();
