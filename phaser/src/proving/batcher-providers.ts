import { Game2CircuitKeys, safeJSONString, type Game2Providers } from "game2-api";
import { type Logger } from "pino";
import { logger } from '../main';
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
    type BalancedTransaction,
    ProofProvider,
    ProveTxConfig,
    type UnbalancedTransaction,
    createUnbalancedTx,
} from "@midnight-ntwrk/midnight-js-types";
import {
    CoinInfo,
    Transaction,
    TransactionId,
    UnprovenTransaction,
    NetworkId as LedgerNetworkId,
} from "@midnight-ntwrk/ledger";
import { getRuntimeNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import init, {
    initThreadPool,
    WasmProver,
    MidnightWasmParamsProvider,
    Rng,
    NetworkId,
    ZkConfig,
} from "@paima/midnight-vm-bindings";
import { proveTxLocally } from "./local-proving";

type WebWorkerPromiseCallbacks = {
    resolve: (value: UnbalancedTransaction | PromiseLike<UnbalancedTransaction>) => void;
    reject: (reason?: any) => void;
};

class WebWorkerLocalProofServer implements ProofProvider<Game2CircuitKeys> {
    nextId: number;
    requests: Map<number, WebWorkerPromiseCallbacks>;
    worker: Worker | undefined;

    constructor() {
        this.nextId = 0;
        this.requests = new Map();

        if (window.Worker) {
            console.log(`creating web worker`);
            this.worker = new Worker(new URL('./prover-worker.js', import.meta.url));
            this.worker.onmessage = (event) => {
                console.log(`got message from worker: ${JSON.stringify(event.data)}!`);
                if (event.data.type == 'success') {
                    this.requests.get(event.data.requestId)?.resolve(event.data.tx);
                } else {
                    this.requests.get(event.data.requestId)?.reject(event.data.error);
                }
                this.requests.delete(event.data.requestId);
            };
            this.worker.onerror = function(error) {
                logger.network.error(`general web worker error: ${error.message} | ${safeJSONString(error)}`);
            };
        }
    }

    async proveTx<K extends string>(
        tx: UnprovenTransaction,
        proveTxConfig?: ProveTxConfig<K>
    ): Promise<UnbalancedTransaction> {
        const baseUrl = new URL(window.location.href).toString();
        if (this.worker != undefined) {
            return new Promise((resolve, reject) => {
                this.requests.set(this.nextId, { resolve, reject });

                this.worker!.postMessage({
                    baseUrl,
                    tx,
                    proveTxConfig
                });
                
                ++this.nextId;
            });
        } else {
            return proveTxLocally(baseUrl, tx, proveTxConfig);
        }
    }
}



/** @internal */
export const initializeProviders = async (
    logger: Logger
): Promise<Game2Providers> => {
    await init();

    await initThreadPool(navigator.hardwareConcurrency);

    const batcherAddress = await getBatcherAddress();

    const batcherAddressParts = batcherAddress.split("|");

    return {
        privateStateProvider: levelPrivateStateProvider({
            privateStateStoreName: "pvp-private-state",
        }),
        zkConfigProvider: new FetchZkConfigProvider(
            window.location.origin,
            fetch.bind(window)
        ),
        proofProvider: new WebWorkerLocalProofServer(),
        publicDataProvider: indexerPublicDataProvider(
            import.meta.env.VITE_BATCHER_MODE_INDEXER_HTTP_URL!,
            import.meta.env.VITE_BATCHER_MODE_INDEXER_WS_URL!
        ),
        walletProvider: {
            // not entirely sure what's this used for, but since we don't have a
            // wallet we can only use the batcher's address
            coinPublicKey: batcherAddressParts[0],
            encryptionPublicKey: batcherAddressParts[1],
            balanceTx(
                tx: UnbalancedTransaction,
                newCoins: CoinInfo[]
            ): Promise<BalancedTransaction> {
                // @ts-expect-error
                return tx;
            },
        },
        midnightProvider: {
            submitTx(tx: BalancedTransaction): Promise<TransactionId> {
                const raw = tx.serialize(getRuntimeNetworkId());

                return postTxToBatcher(raw);
            },
        },
    };
};

function uint8ArrayToHex(uint8Array: Uint8Array) {
    return Array.from(uint8Array, function (byte) {
        return ("0" + (byte & 0xff).toString(16)).slice(-2);
    }).join("");
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postTxToBatcher(
    deploy_tx: Uint8Array<ArrayBufferLike>
): Promise<string> {
    const batcherUrl = `${import.meta.env.VITE_BATCHER_MODE_BATCHER_URL}/submitTx`;

    const retries = 10;

    const query = () =>
        fetch(batcherUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ tx: uint8ArrayToHex(deploy_tx) }),
        });

    const batcherResponse = await withRetries(retries, query);

    if (batcherResponse.status >= 300) {
        throw new Error("Failed to post transaction");
    }

    const json = await batcherResponse.json();

    return json.identifiers[0] as string;
}

async function getBatcherAddress(): Promise<string> {
    const batcherUrl = `${import.meta.env.VITE_BATCHER_MODE_BATCHER_URL}/address`;
    const query = () =>
        fetch(batcherUrl, {
            method: "GET",
            headers: {
                "Content-Type": "application/text",
            },
        });

    const batcherResponse = await withRetries(10, query);

    if (batcherResponse.status >= 300) {
        throw new Error("Failed to get batcher's address");
    }

    return await batcherResponse.text();
}

async function withRetries(retries: number, query: () => Promise<Response>) {
    for (let i = 0; i < retries; i++) {
        const response = await query();

        // 503 -> service not available
        if (response.status != 503) {
            return response;
        }

        // the batcher returns 503 in case of:
        //
        // 1. still syncing
        // 2. no utxos available
        //
        // in both cases a big sleep like this makes sense.
        await sleep(10000);
    }

    throw new Error("Batcher not available");
}
