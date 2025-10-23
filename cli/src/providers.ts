import { type Game2Providers } from 'game2-api';
import { type Logger } from 'pino';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import {
  type BalancedTransaction,
  type UnbalancedTransaction,
  createBalancedTx,
} from '@midnight-ntwrk/midnight-js-types';
import { type CoinInfo, Transaction, type TransactionId } from '@midnight-ntwrk/ledger';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import { getLedgerNetworkId, getZswapNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import { firstValueFrom } from 'rxjs';

export interface CliConfig {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
  zkConfigBaseUri: string;
  wallet: Wallet;
}

/**
 * Initialize providers for CLI tools using wallet API
 */
export async function initializeProviders(config: CliConfig, logger: Logger): Promise<Game2Providers> {
  const walletState = await firstValueFrom(config.wallet.state());

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'game2-cli-private-state',
    }),
    zkConfigProvider: new FetchZkConfigProvider(config.zkConfigBaseUri, fetch),
    proofProvider: httpClientProofProvider(config.proverServerUri),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      coinPublicKey: walletState.coinPublicKey,
      encryptionPublicKey: walletState.encryptionPublicKey,
      balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
        return config.wallet
          .balanceTransaction(
            ZswapTransaction.deserialize(tx.serialize(getLedgerNetworkId()), getZswapNetworkId()),
            newCoins
          )
          .then((tx) => config.wallet.proveTransaction(tx))
          .then((zswapTx) => Transaction.deserialize(zswapTx.serialize(getZswapNetworkId()), getLedgerNetworkId()))
          .then(createBalancedTx);
      },
    },
    midnightProvider: {
      submitTx(tx: BalancedTransaction): Promise<TransactionId> {
        return config.wallet.submitTransaction(tx);
      },
    },
  };
}
