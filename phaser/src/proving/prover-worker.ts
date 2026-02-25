import init, { initThreadPool } from "@paima/midnight-vm-bindings";
import type { ProverMessage, ProverResponse } from "./worker-types.js";
import { proveTxLocally } from "./local-proving.js";
import { ProveTxConfig } from "@midnight-ntwrk/midnight-js-types";

await init();
await initThreadPool(navigator.hardwareConcurrency);

self.postMessage({
    type: "wasm-ready",
    message: "worker pool initialized initialized",
} as ProverResponse);

let baseUrl = undefined;

async function runProver<K extends string>(
    serializedTx: Uint8Array,
    proveTxConfig: ProveTxConfig<K>,
    requestId: number
) {
    try {
        const startTime = performance.now();
        const result = await proveTxLocally(
            baseUrl!,
            serializedTx,
            proveTxConfig
        );
        const endTime = performance.now();
        const durationMs = Math.round(endTime - startTime);

        self.postMessage({
            type: "success",
            data: result,
            durationMs: durationMs,
            requestId: requestId,
        } as ProverResponse);
    } catch (error) {
        self.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
            requestId: requestId,
        } as ProverResponse);
    }
}

self.onmessage = async <K extends string>(
    event: MessageEvent<ProverMessage<K>>
) => {
    const { type } = event.data;

    if (type === "params") {
        baseUrl = event.data.baseUrl;

        console.log("initializing params with baseUrl:", baseUrl);

        self.postMessage({ type: "params-ready" });
    } else if (type === "prove") {
        const { serializedTx, proveTxConfig, requestId } = event.data;
        await runProver(serializedTx, proveTxConfig, requestId);
    }
};
