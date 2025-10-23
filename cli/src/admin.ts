#!/usr/bin/env node

import { Command } from 'commander';
import pino from 'pino';
import { Game2API } from 'game2-api';
import { loadDeploymentData } from './storage.js';
import { initializeProviders, type CliConfig } from './providers.js';
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
  .description('Register all game content (levels, enemies, bosses)')
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || 'http://localhost:8080')
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || 'ws://localhost:8080')
  .option('--prover-uri <uri>', 'Prover server URI', process.env.PROVER_URI || 'http://localhost:6565')
  .option('--zk-config-uri <uri>', 'ZK config base URI', process.env.ZK_CONFIG_URI || 'http://localhost:3000')
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

      // Note: Same wallet initialization issue as deploy command
      logger.error('Wallet initialization not yet implemented.');
      logger.error('You need to configure wallet connection for CLI admin operations.');

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
      // const api = await Game2API.join(providers, contractAddress, logger);

      // logger.info('Registering game content...');
      // await registerAllContent(api, options.minimal, logger);

      // logger.info('All content registered successfully!');

    } catch (error) {
      logger.error(`Content registration failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('join')
  .description('Join an existing contract and verify connection')
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || 'http://localhost:8080')
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || 'ws://localhost:8080')
  .option('--prover-uri <uri>', 'Prover server URI', process.env.PROVER_URI || 'http://localhost:6565')
  .option('--zk-config-uri <uri>', 'ZK config base URI', process.env.ZK_CONFIG_URI || 'http://localhost:3000')
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

      logger.error('Wallet initialization not yet implemented.');
      process.exit(1);

      // TODO: Implement wallet initialization and join
      // const config: CliConfig = {
      //   indexerUri: options.indexerUri,
      //   indexerWsUri: options.indexerWsUri,
      //   proverServerUri: options.proverUri,
      //   zkConfigBaseUri: options.zkConfigUri,
      //   wallet: /* initialize wallet */,
      // };

      // const providers = await initializeProviders(config, logger);
      // const api = await Game2API.join(providers, contractAddress, logger);

      // logger.info('Successfully joined contract!');
      // logger.info(`Contract address: ${api.deployedContractAddress}`);

    } catch (error) {
      logger.error(`Failed to join contract: ${error}`);
      process.exit(1);
    }
  });

program.parse();
