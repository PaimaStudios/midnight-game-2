import {
  init,
  start,
  type StartConfigApiRouter,
  type StartConfigGameStateTransitions,
} from "@paimaexample/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";
import type { GrammarDefinition } from "@paimaexample/concise";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { PaimaSTM } from "@paimaexample/sm";
import type { BaseStfInput } from "@paimaexample/sm";
import { AddressType } from "@paimaexample/utils";
import { Type } from "@sinclair/typebox";
import {
  midnightNetworkConfig,
} from "@paimaexample/midnight-contracts/midnight-env";
import { PrimitiveTypeMidnightGeneric } from "@paimaexample/sm/builtin";
import { readMidnightContract } from "@paimaexample/midnight-contracts/read-contract";
import * as path from "@std/path";
import { builtinGrammars } from "@paimaexample/sm/grammar";
import { valueToBigInt } from "@midnight-ntwrk/compact-runtime";
import type { AlignedValue, StateValue } from "@midnight-ntwrk/ledger-v8";

// ---------------------------------------------------------------------------
// Re-exports for env-specific entry points
// ---------------------------------------------------------------------------
export {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
  midnightNetworkConfig,
  PrimitiveTypeMidnightGeneric,
};

// ---------------------------------------------------------------------------
// Environment validation & startup print
// ---------------------------------------------------------------------------

type EnvEntry = {
  name: string;
  value: string;
  isSet: boolean;
  secret: boolean;
  requiredWhenDeployed: boolean;
};

function printEnvTable(title: string, entries: EnvEntry[]): string[] {
  const errors: string[] = [];
  const nameW = Math.max(...entries.map((e) => e.name.length));
  const valW = 38;

  const lineW = nameW + valW + 16;
  const sep = "=".repeat(lineW);

  console.log(`\n${sep}`);
  console.log(`  ${title}`);
  console.log(sep);
  console.log(
    `  ${"Variable".padEnd(nameW)}  ${"Value".padEnd(valW)}  Status`,
  );
  console.log(`  ${"-".repeat(nameW)}  ${"-".repeat(valW)}  ----------`);

  for (const e of entries) {
    let display: string;
    let status: string;

    if (e.secret) {
      display = e.isSet ? "****" : "(not set)";
      status = e.isSet ? "set" : "(not set)";
    } else {
      display = e.value || "(not set)";
      if (display.length > valW) display = display.slice(0, valW - 3) + "...";
      status = e.isSet ? "overridden" : "default";
    }

    console.log(
      `  ${e.name.padEnd(nameW)}  ${display.padEnd(valW)}  ${status}`,
    );

    if (e.requiredWhenDeployed && !e.isSet && !e.value) {
      errors.push(`FATAL: ${e.name} is required for deployed networks but is not set.`);
    }
  }

  console.log(`${sep}\n`);
  return errors;
}

export function validateAndPrintNodeEnv(): void {
  const networkId = midnightNetworkConfig.id as string;
  const isDeployed = networkId !== "undeployed";

  const entries: EnvEntry[] = [
    {
      name: "MIDNIGHT_NETWORK_ID",
      value: networkId,
      isSet: !!Deno.env.get("MIDNIGHT_NETWORK_ID"),
      secret: false,
      requiredWhenDeployed: false,
    },
    {
      name: "MIDNIGHT_WALLET_SEED",
      value: Deno.env.get("MIDNIGHT_WALLET_SEED") ?? "",
      isSet: !!Deno.env.get("MIDNIGHT_WALLET_SEED"),
      secret: true,
      requiredWhenDeployed: false,
    },
    {
      name: "MIDNIGHT_WALLET_MNEMONIC",
      value: Deno.env.get("MIDNIGHT_WALLET_MNEMONIC") ?? "",
      isSet: !!Deno.env.get("MIDNIGHT_WALLET_MNEMONIC")?.trim(),
      secret: true,
      requiredWhenDeployed: false,
    },
    {
      name: "MIDNIGHT_INDEXER_HTTP",
      value: midnightNetworkConfig.indexer,
      isSet: !!Deno.env.get("MIDNIGHT_INDEXER_HTTP"),
      secret: false,
      requiredWhenDeployed: false,
    },
    {
      name: "MIDNIGHT_INDEXER_WS",
      value: midnightNetworkConfig.indexerWS,
      isSet: !!Deno.env.get("MIDNIGHT_INDEXER_WS"),
      secret: false,
      requiredWhenDeployed: false,
    },
    {
      name: "MIDNIGHT_NODE_HTTP",
      value: midnightNetworkConfig.node,
      isSet: !!Deno.env.get("MIDNIGHT_NODE_HTTP"),
      secret: false,
      requiredWhenDeployed: false,
    },
    {
      name: "MIDNIGHT_PROOF_SERVER_URL",
      value: midnightNetworkConfig.proofServer,
      isSet: !!(Deno.env.get("MIDNIGHT_PROOF_SERVER_URL") || Deno.env.get("MIDNIGHT_PROOF_SERVER")),
      secret: false,
      requiredWhenDeployed: false,
    },
    {
      name: "BATCHER_URL",
      value: Deno.env.get("BATCHER_URL") || "http://localhost:3334",
      isSet: !!Deno.env.get("BATCHER_URL"),
      secret: false,
      requiredWhenDeployed: false,
    },
  ];

  const errors = printEnvTable("Dust 2 Dust — Node Environment", entries);

  if (isDeployed && !midnightNetworkConfig.walletSeed) {
    errors.push(
      `FATAL: For network '${networkId}', either MIDNIGHT_WALLET_SEED or MIDNIGHT_WALLET_MNEMONIC must be set.`,
    );
  }

  if (isDeployed && errors.length > 0) {
    for (const err of errors) console.error(err);
    Deno.exit(1);
  }
}

export const grammar = {
  midnightContractState: builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;

export const contractAddress = readMidnightContract(
  "contract-game2",
  {
    baseDir: path.resolve(import.meta.dirname!, "..", "midnight"),
    networkId: midnightNetworkConfig.id,
  },
).contractAddress;

if (!contractAddress) {
  throw new Error("Contract address not found");
} else {
  console.log("Contract address found:", contractAddress);
}

// ---------------------------------------------------------------------------
// Ledger parser (shared across all environments)
// ---------------------------------------------------------------------------

function decodeCell(av: AlignedValue): number | bigint | string {
  const atom = av.alignment[0];

  if (atom?.tag !== 'atom') return alignedValueToHex(av);

  switch (atom.value.tag) {
    case 'field':
      return valueToBigInt(av.value);

    case 'bytes': {
      let result = 0n;
      let shift = 0n;
      for (const chunk of av.value) {
        for (let i = 0; i < chunk.length; i++) {
          result |= BigInt(chunk[i]) << shift;
          shift += 8n;
        }
      }
      return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : result;
    }

    case 'compress':
      return alignedValueToHex(av);
  }
}

function alignedValueToHex(av: AlignedValue): string {
  return "0x" + av.value
    .map((chunk: Uint8Array) =>
      Array.from(chunk).map((b) => b.toString(16).padStart(2, "0")).join("")
    )
    .join("");
}

function parseStateValue(sv: StateValue): any {
  const t = sv.type();

  if (t === "null") return null;
  if (t === "cell") return decodeCell(sv.asCell());
  if (t === "array") return sv.asArray()!.map(parseStateValue);

  if (t === "map") {
    const m = sv.asMap()!;
    return Object.fromEntries(
      m.keys().map((k) => [
        alignedValueToHex(k),
        parseStateValue(m.get(k)!)
      ])
    );
  }

  if (t === "boundedMerkleTree") return sv.asBoundedMerkleTree()!.toString(true);

  throw new Error(`Unhandled StateValue type: "${t}"`);
}

export const ledgerParser = (state: StateValue) => parseStateValue(state);

const stm = new PaimaSTM<typeof grammar, {}>(grammar);
stm.addStateTransition("midnightContractState", function* (data) {
  const { payload } = data.parsedInput;
  console.log(`[ledger] block processed at height ${data.blockHeight}`);
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const apiRouter: StartConfigApiRouter = async function (
  server: any,
  db: any,
): Promise<void> {
  server.get("/fetch-primitive-accounting", async () => {
    const result = await db.query(`SELECT * FROM effectstream.primitive_accounting`);
    return result.rows;
  });
};

// ---------------------------------------------------------------------------
// Node startup — called by env-specific entry points (main.dev.ts, etc.)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
export function startNode(envConfig: any): void {
  main(function* () {
    yield* init();
    console.log("Starting EffectStream Node");

    yield* withEffectstreamStaticConfig(envConfig, function* () {
      yield* start({
        appName: "dust2dust",
        appVersion: "1.0.0",
        syncInfo: toSyncProtocolWithNetwork(envConfig),
        gameStateTransitions,
        migrations: undefined,
        apiRouter,
        grammar,
      });
    });

    yield* suspend();
  });
}
