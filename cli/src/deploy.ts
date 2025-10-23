#!/usr/bin/env node

import { Command } from 'commander';
import pino from 'pino';
import { Game2API } from 'game2-api';
import { saveDeploymentData, loadDeploymentData, clearDeploymentData, hasDeploymentData } from './storage.js';
import { initializeProviders, type CliConfig } from './providers.js';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';

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
  .name('game2-deploy')
  .description('Deploy and manage Game2 contracts')
  .version('0.1.0');

program
  .command('deploy')
  .description('Deploy a new Game2 contract')
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || 'http://localhost:8080')
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || 'ws://localhost:8080')
  .option('--prover-uri <uri>', 'Prover server URI', process.env.PROVER_URI || 'http://localhost:6565')
  .option('--zk-config-uri <uri>', 'ZK config base URI', process.env.ZK_CONFIG_URI || 'http://localhost:3000')
  .option('--force', 'Force deploy even if deployment data exists')
  .action(async (options) => {
    try {
      // Check if deployment already exists
      if (!options.force && await hasDeploymentData()) {
        const existing = await loadDeploymentData();
        logger.warn(`Deployment already exists at address: ${existing?.contractAddress}`);
        logger.warn('Use --force to deploy a new contract anyway, or use "game2-deploy info" to view existing deployment');
        process.exit(1);
      }

      logger.info('Deploying Game2 contract...');

      // Note: In a real CLI tool, you would need to initialize a wallet properly
      // This is a placeholder - actual implementation would need wallet setup
      logger.error('Wallet initialization not yet implemented.');
      logger.error('You need to configure wallet connection for CLI deployment.');
      logger.error('This requires setting up wallet provider similar to how it\'s done in the browser.');

      process.exit(1);

      // TODO: Implement wallet initialization
      // const config: CliConfig = {
      //   indexerUri: options.indexerUri,
      //   indexerWsUri: options.indexerWsUri,
      //   proverServerUri: options.proverUri,
      //   zkConfigBaseUri: options.zkConfigUri,
      //   wallet: /* initialize wallet */,
      // };

      // const providers = await initializeProviders(config, logger);
      // const api = await Game2API.deploy(providers, logger);

      // const deploymentData = {
      //   contractAddress: api.deployedContractAddress,
      //   deployedAt: new Date().toISOString(),
      // };

      // await saveDeploymentData(deploymentData);

      // logger.info(`Contract deployed successfully!`);
      // logger.info(`Contract address: ${api.deployedContractAddress}`);
      // logger.info('');
      // logger.info('Next steps:');
      // logger.info('1. Configure your Phaser app with this contract address');
      // logger.info('2. Use "game2-admin" to register game content');

    } catch (error) {
      logger.error(`Deployment failed: ${error}`);
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
        logger.info('Run "game2-deploy deploy" to deploy a new contract.');
        return;
      }

      logger.info('Current deployment:');
      logger.info(`  Contract Address: ${data.contractAddress}`);
      logger.info(`  Deployed At: ${data.deployedAt}`);
      logger.info(`  Has Admin Key: ${data.playerSecretKey ? 'Yes' : 'No'}`);
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
      logger.warn('This will delete your deployment data including admin keys.');
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
