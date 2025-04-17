/**
 * Bulletin board common types and abstractions.
 *
 * @module
 */

import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { Game2PrivateState, Contract, Witnesses } from 'game2-contract';

/**
 * The private states consumed throughout the application.
 *
 * @remarks
 * {@link PrivateStates} can be thought of as a type that describes a schema for all
 * private states for all contracts used in the application. Each key represents
 * the type of private state consumed by a particular type of contract.
 * The key is used by the deployed contract when interacting with a private state provider,
 * and the type (i.e., `typeof PrivateStates[K]`) represents the type of private state
 * expected to be returned.
 *
 * Since there is only one contract type for the bulletin board example, we only define a
 * single key/type in the schema.
 *
 * @public
 */
export type PrivateStates = {
  /**
   * Key used to provide the private state for {@link Game2Contract} deployments.
   */
  readonly game2PrivateState: Game2PrivateState;
};

/**
 * Represents a bulletin board contract and its private state.
 *
 * @public
 */
export type Game2Contract = Contract<Game2PrivateState, Witnesses<Game2PrivateState>>;

/**
 * The keys of the circuits exported from {@link Game2Contract}.
 *
 * @public
 */
export type Game2CircuitKeys = Exclude<keyof Game2Contract['impureCircuits'], number | symbol>;

/**
 * The providers required by {@link Game2Contract}.
 *
 * @public
 */
export type Game2Providers = MidnightProviders<Game2CircuitKeys, PrivateStates>;

/**
 * A {@link Game2Contract} that has been deployed to the network.
 *
 * @public
 */
export type DeployedGame2Contract = FoundContract<Game2PrivateState, Game2Contract>;

/**
 * A type that represents the derived combination of public (or ledger), and private state.
 */
export type Game2DerivedState = {
  enemy_damage: bigint[];
}
