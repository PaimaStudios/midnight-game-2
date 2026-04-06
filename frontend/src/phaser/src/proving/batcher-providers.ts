import {
    Game2CircuitKeys,
    safeJSONString,
    type Game2Providers,
} from "game2-api";
import { type Logger } from "pino";
import { logger } from "../main";
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
} from "@midnight-ntwrk/ledger";
import { getRuntimeNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ProverMessage, ProverResponse } from "./worker-types";

type WebWorkerPromiseCallbacks = {
    resolve: (
        value: UnbalancedTransaction | PromiseLike<UnbalancedTransaction>
    ) => void;
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
            console.log(`creating web worker now`);
            this.worker = new Worker(
                new URL("./prover-worker.ts", import.meta.url),
                { type: "module" }
            );
        }
    }

    async setupResponseHandler() {
        this.worker!.onmessage = (event: MessageEvent<ProverResponse>) => {
            const { type, data, message, requestId } = event.data;

            const callbacks = this.requests.get(requestId!);
            switch (type) {
                case "log":
                    console.log(message);
                    break;
                case "success":
                    if (callbacks) {
                        const unbalancedTx = Transaction.deserialize(
                            data!,
                            getRuntimeNetworkId()
                        );

                        callbacks.resolve(createUnbalancedTx(unbalancedTx));

                        this.requests.delete(requestId!);
                    }
                    break;
                case "error":
                    callbacks?.reject(new Error(message));
                    break;
            }
        };

        this.worker!.onerror = (error) => {
            logger.network.error(
                `general web worker error: ${error.message} | ${safeJSONString(error)}`
            );
        };
    }

    async initializeWorker<K extends string>() {
        const baseUrl = new URL(window.location.href).toString();
        console.log(`baseUrl: ${baseUrl}`);

        let readyResolve: (value: void) => void;
        let paramsResolve: (value: void) => void;

        const wasmReady = new Promise<void>((resolve, _reject) => {
            readyResolve = resolve;
        });
        const paramsReady = new Promise<void>((resolve, _reject) => {
            paramsResolve = resolve;
        });

        this.worker!.onmessage = (event: MessageEvent<ProverResponse>) => {
            const { type, message } = event.data;

            switch (type) {
                case "wasm-ready":
                    readyResolve();
                    break;
                case "params-ready":
                    paramsResolve();
                    break;
                case "log":
                    console.log(message);
                    break;
            }
        };

        await wasmReady;

        this.worker!.postMessage({
            type: "params",
            baseUrl,
        } as ProverMessage<K>);

        await paramsReady;

        logger.network.info("Worker initialized and ready for proving");
    }

    async proveTx<K extends string>(
        tx: UnprovenTransaction,
        proveTxConfig?: ProveTxConfig<K>
    ): Promise<UnbalancedTransaction> {
        if (this.worker != undefined) {
            return new Promise((resolve, reject) => {
                this.requests.set(this.nextId, { resolve, reject });

                const serializedTx = tx.serialize(getRuntimeNetworkId());

                this.worker!.postMessage({
                    type: "prove",
                    serializedTx,
                    proveTxConfig,
                    requestId: this.nextId,
                } as ProverMessage<K>);

                ++this.nextId;
            });
        } else {
            return new Promise((_resolve, reject) => {
                reject("worker not initialized");
            });
        }
    }
}

/** @internal */
export const initializeProviders = async (
    logger: Logger
): Promise<Game2Providers> => {
    const batcherAddress = await getBatcherAddress();

    const batcherAddressParts = batcherAddress.split("|");

    const webWorkerProofProvider = new WebWorkerLocalProofServer();

    await webWorkerProofProvider.initializeWorker();
    await webWorkerProofProvider.setupResponseHandler();

    return {
        privateStateProvider: levelPrivateStateProvider({
            privateStateStoreName: "pvp-private-state",
        }),
        zkConfigProvider: new FetchZkConfigProvider(
            window.location.origin,
            fetch.bind(window)
        ),
        proofProvider: webWorkerProofProvider,
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
