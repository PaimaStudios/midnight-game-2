#!/usr/bin/env node

/**
 * Admin tools for Dust 2 Dust game contracts.
 * Handles content registration, contract join, info, and cleanup.
 *
 * Adapted from cli/src/admin.ts — keeps Node/TypeScript + commander approach.
 */

import { Command } from 'commander';
import { promises as fs } from 'fs';
import * as path from 'path';
import pino from 'pino';

// Re-use deploy script's batcher/storage logic via shared imports
// For now, inline the essentials to keep scripts self-contained

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

// Default service URLs
const DEFAULT_BATCHER_URL = 'http://localhost:8000';
const DEFAULT_INDEXER_URI = 'http://127.0.0.1:8088/api/v1/graphql';
const DEFAULT_INDEXER_WS_URI = 'ws://127.0.0.1:8088/api/v1/graphql/ws';
const DEFAULT_PROVER_URI = 'http://localhost:6300';

// Storage
const CONFIG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.midnight-dust-to-dust'
);
const DEPLOYMENT_FILE = path.join(CONFIG_DIR, 'deployment.json');

interface DeploymentData {
  contractAddress: string;
  deployedAt: string;
}

async function loadDeploymentData(): Promise<DeploymentData | null> {
  try {
    const content = await fs.readFile(DEPLOYMENT_FILE, 'utf-8');
    const data = JSON.parse(content);
    if (!data.contractAddress || !data.deployedAt) {
      throw new Error('Invalid deployment data format');
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function clearDeploymentData(): Promise<void> {
  try {
    await fs.unlink(DEPLOYMENT_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('game2-admin')
  .description('Admin tools for Dust 2 Dust game contracts')
  .version('0.1.0');

program
  .command('register-content')
  .description('Register all game content (levels, enemies, bosses) using batcher mode')
  .option('--batcher-url <url>', 'Batcher URL', process.env.BATCHER_URL || DEFAULT_BATCHER_URL)
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || DEFAULT_INDEXER_URI)
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || DEFAULT_INDEXER_WS_URI)
  .option('--prover-uri <uri>', 'Prover server URI', process.env.PROVER_URI || DEFAULT_PROVER_URI)
  .option('--contract <address>', 'Contract address (overrides saved deployment)')
  .option('--minimal', 'Register only minimal content for testing')
  .action(async (options) => {
    try {
      // Dynamic import of content registration from the frontend package
      // This allows the backend to use the same content definitions
      const { registerStartingContent } = await import(
        '../../../frontend/src/content/src/register.js'
      );

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

      // TODO: Initialize batcher providers and call Game2API.join()
      // then call registerStartingContent(api, options.minimal ?? false, logger)
      logger.info('Content registration requires batcher providers setup.');
      logger.info('This script will be fully functional once the backend infrastructure is running.');

    } catch (error) {
      logger.error(`Content registration failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('join')
  .description('Join an existing contract and verify connection')
  .option('--batcher-url <url>', 'Batcher URL', process.env.BATCHER_URL || DEFAULT_BATCHER_URL)
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || DEFAULT_INDEXER_URI)
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || DEFAULT_INDEXER_WS_URI)
  .option('--prover-uri <uri>', 'Prover server URI', process.env.PROVER_URI || DEFAULT_PROVER_URI)
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
      // TODO: Initialize batcher providers and call Game2API.join()
      logger.info('Join requires batcher providers setup.');

    } catch (error) {
      logger.error(`Failed to join contract: ${error}`);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show deployment information')
  .action(async () => {
    const data = await loadDeploymentData();
    if (!data) {
      logger.info('No deployment found.');
      logger.info('Run deploy script to deploy a new contract.');
      return;
    }
    logger.info('Current deployment:');
    logger.info(`  Contract Address: ${data.contractAddress}`);
    logger.info(`  Deployed At: ${data.deployedAt}`);
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
