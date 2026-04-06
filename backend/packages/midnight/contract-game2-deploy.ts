#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Game2API } from './contract-game2/src/index.ts';
import pino from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../..');

// Default service URLs
const DEFAULT_BATCHER_URL = 'http://localhost:8000';
const DEFAULT_INDEXER_URI = 'http://127.0.0.1:8088/api/v1/graphql';
const DEFAULT_INDEXER_WS_URI = 'ws://127.0.0.1:8088/api/v1/graphql/ws';
const DEFAULT_PROVER_URI = 'http://localhost:6300';

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

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.midnight-dust-to-dust'
);
const DEPLOYMENT_FILE = path.join(CONFIG_DIR, 'deployment.json');

interface DeploymentData {
  contractAddress: string;
  deployedAt: string;
}

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

async function saveDeploymentData(data: DeploymentData): Promise<string> {
  await ensureConfigDir();
  await fs.writeFile(DEPLOYMENT_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return DEPLOYMENT_FILE;
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
    if (error instanceof SyntaxError) {
      throw new Error('Deployment file is corrupted (invalid JSON).');
    }
    throw error;
  }
}

async function hasDeploymentData(): Promise<boolean> {
  try {
    await fs.access(DEPLOYMENT_FILE);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Frontend env patching (like PVP v2's contract-pvp-deploy.ts)
// ---------------------------------------------------------------------------

async function updateFrontendEnv(contractAddress: string): Promise<void> {
  const phaserDir = path.join(ROOT_DIR, 'frontend', 'src', 'phaser');
  const envFile = path.join(phaserDir, '.env');
  const newLine = `VITE_CONTRACT_ADDRESS=${contractAddress}`;

  try {
    await fs.access(phaserDir);

    let content = '';
    let fileExists = false;

    try {
      content = await fs.readFile(envFile, 'utf-8');
      fileExists = true;
    } catch {
      // File doesn't exist, will create new one
    }

    if (fileExists) {
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
        updatedLines.push(newLine);
      }

      await fs.writeFile(envFile, updatedLines.join('\n'));
      logger.info(`Updated ${envFile}`);
    } else {
      await fs.writeFile(envFile, newLine + '\n');
      logger.info(`Created ${envFile}`);
    }
  } catch {
    logger.warn('Could not update frontend/.env file (frontend directory not found)');
  }
}

// ---------------------------------------------------------------------------
// Batcher providers (from cli/src/batcher-providers.ts)
// ---------------------------------------------------------------------------

import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { getRuntimeNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

interface BatcherConfig {
  batcherUrl: string;
  indexerUri: string;
  indexerWsUri: string;
  proverUri: string;
}

const BATCHER_RETRY_COUNT = 10;
const BATCHER_RETRY_DELAY_MS = 10000;

function validateBatcherAddress(address: string): { coinPublicKey: string; encryptionPublicKey: string } {
  const parts = address.split('|');
  if (parts.length !== 2) {
    throw new Error(`Invalid batcher address format. Expected "coinPublicKey|encryptionPublicKey", got: ${address}`);
  }
  const [coinPublicKey, encryptionPublicKey] = parts;
  if (!coinPublicKey || !encryptionPublicKey) {
    throw new Error('Batcher address parts cannot be empty');
  }
  return { coinPublicKey, encryptionPublicKey };
}

function uint8ArrayToHex(uint8Array: Uint8Array): string {
  return Array.from(uint8Array, (byte) => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(retries: number, query: () => Promise<Response>): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await query();
    if (response.status !== 503) return response;
    await sleep(BATCHER_RETRY_DELAY_MS);
  }
  throw new Error('Batcher not available after retries');
}

async function getBatcherAddress(batcherUrl: string): Promise<string> {
  const response = await withRetries(BATCHER_RETRY_COUNT, () =>
    fetch(`${batcherUrl}/address`, { method: 'GET', headers: { 'Content-Type': 'application/text' } })
  );
  if (response.status >= 300) throw new Error(`Failed to get batcher's address: ${response.statusText}`);
  return await response.text();
}

async function postTxToBatcher(batcherUrl: string, deploy_tx: Uint8Array): Promise<string> {
  const response = await withRetries(BATCHER_RETRY_COUNT, () =>
    fetch(`${batcherUrl}/submitTx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: uint8ArrayToHex(deploy_tx) }),
    })
  );
  if (response.status >= 300) throw new Error(`Failed to post transaction: ${response.statusText}`);
  const json = await response.json();
  return json.identifiers[0] as string;
}

async function initializeBatcherProviders(config: BatcherConfig): Promise<any> {
  logger.info('Initializing batcher providers');

  const batcherAddress = await getBatcherAddress(config.batcherUrl);
  const { coinPublicKey, encryptionPublicKey } = validateBatcherAddress(batcherAddress);

  logger.info(`Connected to batcher at: ${config.batcherUrl}`);

  const contractDir = path.join(__dirname, 'contract-game2', 'src', 'managed', 'game2');

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'game-cli-batcher-private-state',
    }),
    zkConfigProvider: new NodeZkConfigProvider(contractDir),
    proofProvider: httpClientProofProvider(config.proverUri),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      coinPublicKey,
      encryptionPublicKey,
      balanceTx(tx: any): Promise<any> {
        return Promise.resolve(tx);
      },
    },
    midnightProvider: {
      submitTx(tx: any): Promise<string> {
        const raw = tx.serialize(getRuntimeNetworkId());
        return postTxToBatcher(config.batcherUrl, raw);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function confirmDeployment(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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
  .description('Deploy and manage Dust 2 Dust contracts')
  .version('0.1.0');

program
  .command('deploy')
  .description('Deploy a new contract using batcher mode')
  .option('--batcher-url <url>', 'Batcher URL', process.env.BATCHER_URL || DEFAULT_BATCHER_URL)
  .option('--indexer-uri <uri>', 'Indexer HTTP URI', process.env.INDEXER_URI || DEFAULT_INDEXER_URI)
  .option('--indexer-ws-uri <uri>', 'Indexer WebSocket URI', process.env.INDEXER_WS_URI || DEFAULT_INDEXER_WS_URI)
  .option('--prover-uri <uri>', 'Prover server URI', process.env.PROVER_URI || DEFAULT_PROVER_URI)
  .option('--force', 'Force deploy even if deployment data exists')
  .action(async (options) => {
    try {
      if (!options.force && await hasDeploymentData()) {
        const existing = await loadDeploymentData();
        logger.warn(`Deployment already exists at address: ${existing?.contractAddress}`);
        logger.warn('Use --force to deploy a new contract anyway');
        process.exit(1);
      }

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

      logger.info('Deploying contract using batcher mode...');

      const config: BatcherConfig = {
        batcherUrl: options.batcherUrl,
        indexerUri: options.indexerUri,
        indexerWsUri: options.indexerWsUri,
        proverUri: options.proverUri,
      };

      const providers = await initializeBatcherProviders(config);
      logger.info('Providers initialized, deploying contract...');

      const api = await Game2API.deploy(providers, logger);

      const deploymentData = {
        contractAddress: api.deployedContractAddress,
        deployedAt: new Date().toISOString(),
      };

      const savedPath = await saveDeploymentData(deploymentData);
      await updateFrontendEnv(api.deployedContractAddress);

      logger.info('');
      logger.info('Contract deployed successfully!');
      logger.info(`Contract address: ${api.deployedContractAddress}`);
      logger.info(`Deployment data saved to: ${savedPath}`);
      logger.info('');
      logger.info('Next steps:');
      logger.info('1. Register game content: deno task contract-game2:admin register-content');
      logger.info('2. Build the frontend: cd frontend && yarn build');

    } catch (error) {
      logger.error('Deployment failed:');
      logger.error(`  ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show deployment information')
  .action(async () => {
    const data = await loadDeploymentData();
    if (!data) {
      logger.info('No deployment found. Deploy with: deno task contract-game2:deploy');
      return;
    }
    logger.info('Current deployment:');
    logger.info(`  Contract Address: ${data.contractAddress}`);
    logger.info(`  Deployed At: ${data.deployedAt}`);
  });

program
  .command('patch-frontend-env')
  .description('Update frontend env files with the deployed contract address')
  .action(async () => {
    const data = await loadDeploymentData();
    if (!data) {
      logger.error('No deployed contract address found.');
      process.exit(1);
    }
    logger.info(`Patching frontend env with address: ${data.contractAddress}`);
    await updateFrontendEnv(data.contractAddress);
  });

program.parse();
