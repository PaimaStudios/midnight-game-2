import { type Game2Providers } from "game2-api";
import { type Logger } from "pino";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import {
    type BalancedTransaction,
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

const localProofServer = {
    async proveTx<K extends string>(
        tx: UnprovenTransaction,
        proveTxConfig?: ProveTxConfig<K>
    ): Promise<UnbalancedTransaction> {
        const baseUrl = new URL(window.location.href).toString();

        const pp = MidnightWasmParamsProvider.new(baseUrl);

        const prover = WasmProver.new();

        const rng = Rng.new();

        const networkId = getRuntimeNetworkId();

        const rawTx = tx.serialize(networkId);

        const zkConfig = (() => {
            if (proveTxConfig) {
                return ZkConfig.new(
                    proveTxConfig.zkConfig?.circuitId!,
                    proveTxConfig.zkConfig?.proverKey!,
                    proveTxConfig.zkConfig?.verifierKey!,
                    proveTxConfig.zkConfig?.zkir!
                );
            } else {
                return ZkConfig.empty();
            }
        })();

        console.log('Starting ZK proof');

        const startTime = performance.now();

        let unbalancedTxRaw = await prover.prove_tx(
            rng,
            rawTx,
            networkId === LedgerNetworkId.Undeployed
                ? NetworkId.undeployed()
                : NetworkId.testnet(),
            zkConfig,
            pp
        );

        const endTime = performance.now();
        console.log(
            `Proved unbalanced tx in: ${Math.floor(endTime - startTime)} ms`
        );

        const unbalancedTx = Transaction.deserialize(
            unbalancedTxRaw,
            getRuntimeNetworkId()
        );

        return createUnbalancedTx(unbalancedTx);
    },
};

/** @internal */
export const initializeProviders = async (
    logger: Logger
): Promise<Game2Providers> => {
    logger.info("initializing batcher providers");
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
        proofProvider: localProofServer,
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
