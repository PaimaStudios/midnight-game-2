#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Game2API } from 'game2-api';
import { saveDeploymentData, loadDeploymentData, hasDeploymentData } from './storage.js';
import { initializeBatcherProviders, type BatcherConfig } from './batcher-providers.js';
import { logger } from './logger.js';
import {
  DEFAULT_BATCHER_URL,
  DEFAULT_INDEXER_URI,
  DEFAULT_INDEXER_WS_URI,
  DEFAULT_PROVER_URI,
} from './constants.js';

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

async function updatePhaserEnvFile(contractAddress: string): Promise<void> {
  const phaserDir = path.join(process.cwd(), 'phaser');
  const envFile = path.join(phaserDir, '.env');
  const newLine = `VITE_CONTRACT_ADDRESS=${contractAddress}`;

  try {
    // Check if phaser directory exists
    await fs.access(phaserDir);

    let content = '';
    let fileExists = false;

    // Try to read existing .env file
    try {
      content = await fs.readFile(envFile, 'utf-8');
      fileExists = true;
    } catch (error) {
      // File doesn't exist, will create new one
    }

    if (fileExists) {
      // Update or add VITE_CONTRACT_ADDRESS in existing file
      const lines = content.split('\n');
      let found = false;

      const updatedLines = lines.map(line => {
        if (line.startsWith('VITE_CONTRACT_ADDRESS=') || line.startsWith('# VITE_CONTRACT_ADDRESS=')) {
          found = true;
          return newLine;
        }
        return line;
      });

      if (!found) {
        // Add at the end
        updatedLines.push(newLine);
      }

      await fs.writeFile(envFile, updatedLines.join('\n'));
      logger.info(`Updated ${envFile}`);
    } else {
      // Create new file with just the contract address
      await fs.writeFile(envFile, newLine + '\n');
      logger.info(`Created ${envFile}`);
    }
  } catch (error) {
    // If phaser directory doesn't exist, just log a warning
    logger.warn('Could not update phaser/.env file (phaser directory not found)');
  }
}

const program = new Command();

program
  .name('game2-deploy')
  .description('Deploy and manage Game contracts')
  .version('0.1.0');

program
  .command('deploy')
  .description('Deploy a new Game contract using batcher mode')
  .option('--batcher-url <url>', 'Batcher URL', process.env.BATCHER_URL || DEFAULT_BATCHER_URL)
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || DEFAULT_INDEXER_URI)
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || DEFAULT_INDEXER_WS_URI)
  .option('--prover-uri <uri>', 'Prover server URI (REQUIRED - run midnight-prover)', process.env.PROVER_URI || DEFAULT_PROVER_URI)
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

      logger.info('Deploying Game contract using batcher mode...');
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

      // Automatically create or update phaser/.env file
      await updatePhaserEnvFile(api.deployedContractAddress);

      logger.info('');
      logger.info('Contract deployed successfully!');
      logger.info(`Contract address: ${api.deployedContractAddress}`);
      logger.info(`Deployment data saved to: ${savedPath}`);
      logger.info('');
      logger.info('Next steps:');
      logger.info('1. Register game content: yarn admin register-content');
      logger.info('2. Build the game: cd phaser && yarn run build');

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
      logger.error('  - Batcher not running or not fully synced');
      logger.error('  - Indexer not running (check http://127.0.0.1:8088/api/v1/graphql)');
      logger.error('  - Prover server not running (check http://localhost:6300)');
      logger.error('  - ZK config files missing in contract/src/managed/game2/');
      process.exit(1);
    }
  });

program.parse();
