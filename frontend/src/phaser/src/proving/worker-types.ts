import { ProveTxConfig } from "@midnight-ntwrk/midnight-js-types";

export type ProverMessage<K extends string> =
    | {
          type: "params";
          baseUrl: string;
      }
    | {
          type: "prove";
          serializedTx: Uint8Array;
          proveTxConfig: ProveTxConfig<K>;
          requestId: number;
      };

// TODO: split more
export interface ProverResponse {
    type: "success" | "error" | "log" | "wasm-ready" | "params-ready";
    data?: Uint8Array;
    message?: string;
    durationMs?: number;
    requestId?: number;
}
