/**
 * Type-check stub for the `@effectstream/*` framework packages.
 *
 * The framework is published as raw TypeScript (consumed directly by Bun at
 * runtime via the `"bun"` export condition). Running `tsc` over our backend
 * would otherwise pull the framework's own `.ts` source into the program and
 * report type errors that originate *inside* those packages — errors that are
 * not ours to fix and that Deno's `deno check` never surfaced (Deno does not
 * emit diagnostics for dependency internals).
 *
 * `tsconfig.check.json` maps every `@effectstream/*` specifier our backend
 * imports to this single stub via `compilerOptions.paths`, so `bun run check`
 * validates OUR code (and our fully-typed `@midnight-ntwrk` usage) without
 * descending into the framework sources — matching the Deno behavior. This
 * only affects the type check; Bun resolves the real packages at runtime.
 *
 * If/when the framework ships clean types, remove the `paths` entries in
 * tsconfig.check.json (and this file) to restore end-to-end type checking.
 */

const any: any = undefined;

// @effectstream/runtime
export const init = any;
export const start = any;
export type StartConfigApiRouter = any;
export type StartConfigGameStateTransitions = any;

// @effectstream/config
export const withEffectstreamStaticConfig = any;
export const toSyncProtocolWithNetwork = any;
export const ConfigBuilder = any;
export const ConfigNetworkType = any;
export const ConfigSyncProtocolType = any;

// @effectstream/concise
export type GrammarDefinition = any;

// @effectstream/coroutine
export type SyncStateUpdateStream<T = any> = any;
export const World = any;

// @effectstream/sm
export class Stm<A = any, B = any> {
  constructor(..._args: any[]) {}
  addStateTransition(..._args: any[]): any {}
  processInput(..._args: any[]): any {}
}
export type BaseStfInput = any;

// @effectstream/sm/builtin
export const PrimitiveTypeMidnightGeneric = any;

// @effectstream/sm/grammar
export const builtinGrammars = any;

// @effectstream/midnight-contracts (+ subpaths)
export const buildWalletFacade = any;
export const getInitialShieldedState = any;
export const configureMidnightNodeProviders = any;
export const syncAndWaitForFunds = any;
export const midnightNetworkConfig = any;
export const readMidnightContract = any;

// @effectstream/batcher-sdk
export type BatcherConfig = any;
export const FileStorage = any;
export const MidnightBalancingAdapter = any;
export const createNewBatcher = any;
