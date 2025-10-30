import { type Game2Providers } from 'game2-api';
import { type Logger } from 'pino';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import {
  type BalancedTransaction,
  type UnbalancedTransaction,
} from '@midnight-ntwrk/midnight-js-types';
import {
  type CoinInfo,
  type TransactionId,
} from '@midnight-ntwrk/ledger';
import { getRuntimeNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as path from 'path';
import { validateBatcherAddress } from './validation.js';

// Retry configuration for batcher requests
const BATCHER_RETRY_COUNT = 10;
const BATCHER_RETRY_DELAY_MS = 10000; // 10 seconds

export interface BatcherConfig {
  batcherUrl: string;
  indexerUri: string;
  indexerWsUri: string;
  proverUri: string;
}

/**
 * Initialize providers for CLI tools using batcher mode
 * This mode doesn't require a wallet - it uses the batcher's address and submits transactions through the batcher
 * Requires a prover service running (the browser can use WASM, but Node.js needs HTTP prover)
 */
export async function initializeBatcherProviders(
  config: BatcherConfig,
  logger: Logger
): Promise<Game2Providers> {
  logger.info('Initializing batcher providers for CLI');

  const batcherAddress = await getBatcherAddress(config.batcherUrl);
  const { coinPublicKey, encryptionPublicKey } = validateBatcherAddress(batcherAddress);

  logger.info(`Connected to batcher at: ${config.batcherUrl}`);
  logger.info(`Batcher address: ${coinPublicKey}`);
  logger.info(`Using prover at: ${config.proverUri}`);

  // Find the contract directory to locate ZK config files
  const contractDir = path.join(process.cwd(), 'contract', 'src', 'managed', 'game2');
  logger.debug(`Looking for ZK configs in: ${contractDir}`);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'game-cli-batcher-private-state',
    }),
    zkConfigProvider: new NodeZkConfigProvider(contractDir),
    proofProvider: httpClientProofProvider(config.proverUri),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      // Use the batcher's address since we don't have a wallet
      coinPublicKey,
      encryptionPublicKey,
      balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
        // In batcher mode, the transaction is already balanced
        // @ts-expect-error - batcher doesn't actually balance, just passes through
        return Promise.resolve(tx);
      },
    },
    midnightProvider: {
      submitTx(tx: BalancedTransaction): Promise<TransactionId> {
        const raw = tx.serialize(getRuntimeNetworkId());
        return postTxToBatcher(config.batcherUrl, raw);
      },
    },
  };
}

function uint8ArrayToHex(uint8Array: Uint8Array): string {
  return Array.from(uint8Array, function (byte) {
    return ('0' + (byte & 0xff).toString(16)).slice(-2);
  }).join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postTxToBatcher(batcherUrl: string, deploy_tx: Uint8Array): Promise<string> {
  const url = `${batcherUrl}/submitTx`;

  const query = () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tx: uint8ArrayToHex(deploy_tx) }),
    });

  const batcherResponse = await withRetries(BATCHER_RETRY_COUNT, query);

  if (batcherResponse.status >= 300) {
    throw new Error(`Failed to post transaction: ${batcherResponse.statusText}`);
  }

  const json = await batcherResponse.json();

  return json.identifiers[0] as string;
}

async function getBatcherAddress(batcherUrl: string): Promise<string> {
  const url = `${batcherUrl}/address`;
  const query = () =>
    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/text',
      },
    });

  const batcherResponse = await withRetries(BATCHER_RETRY_COUNT, query);

  if (batcherResponse.status >= 300) {
    throw new Error(`Failed to get batcher's address: ${batcherResponse.statusText}`);
  }

  return await batcherResponse.text();
}

async function withRetries(retries: number, query: () => Promise<Response>): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await query();

    // 503 -> service not available
    if (response.status !== 503) {
      return response;
    }

    // the batcher returns 503 in case of:
    //
    // 1. still syncing
    // 2. no utxos available
    //
    // in both cases a big sleep like this makes sense.
    await sleep(BATCHER_RETRY_DELAY_MS);
  }

  throw new Error('Batcher not available after retries');
}
