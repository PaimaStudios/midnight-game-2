import {
    ProveTxConfig,
    type UnbalancedTransaction,
    createUnbalancedTx,
} from "@midnight-ntwrk/midnight-js-types";
import {
    Transaction,
    UnprovenTransaction,
    NetworkId as LedgerNetworkId,
} from "@midnight-ntwrk/ledger";
import { getRuntimeNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
    WasmProver,
    MidnightWasmParamsProvider,
    Rng,
    NetworkId,
    ZkConfig,
} from "@paima/midnight-vm-bindings";
import { logger } from "../logger";

export async function proveTxLocally<K extends string>(
    baseUrl: string,
    rawTx: Uint8Array,
    proveTxConfig?: ProveTxConfig<K>
): Promise<Uint8Array> {
    const pp = MidnightWasmParamsProvider.new(baseUrl);

    const prover = WasmProver.new();

    const rng = Rng.new();

    const networkId = getRuntimeNetworkId();

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

    logger.network.info(`Starting ZK proof [${navigator.hardwareConcurrency} threads]`);

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
    logger.network.info(
        `Proved unbalanced tx in: ${Math.floor(endTime - startTime)} ms`
    );

    return unbalancedTxRaw;
}