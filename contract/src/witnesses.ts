/*
 * This file defines the shape of the game's private state,
 * as well as the single witness function that accesses it.
 */

import { Ledger } from './managed/game2/contract/index.cjs';
import { WitnessContext } from '@midnight-ntwrk/compact-runtime';


export type Game2PrivateState = {
  readonly secretKey: Uint8Array;
};

export const createGame2PrivateState = (secretKey: Uint8Array) => ({
  secretKey,
});

/* **********************************************************************
 * The witnesses object for the game contract is an object
 * with a field for each witness function, mapping the name of the function
 * to its implementation.
 *
 * The implementation of each function always takes as its first argument
 * a value of type WitnessContext<L, PS>, where L is the ledger object type
 * that corresponds to the ledger declaration in the Compact code, and PS
 *  is the private state type, like Game2PrivateState defined above.
 *
 * A WitnessContext has three
 * fields:
 *  - ledger: T
 *  - privateState: PS
 *  - contractAddress: string
 *
 * The other arguments (after the first) to each witness function
 * correspond to the ones declared in Compact for the witness function.
 * The function's return value is a tuple of the new private state and
 * the declared return value.  In this case, that's a Game2PrivateState
 * and a Uint8Array (because the contract declared a return value of Bytes[32],
 * and that's a Uint8Array in TypeScript).
 *
 * The player_secret_key witness does not need the ledger or contractAddress
 * from the WitnessContext, so it uses the parameter notation that puts
 * only the binding for the privateState in scope.
 */
export const witnesses = {
  player_secret_key: ({ privateState }: WitnessContext<Ledger, Game2PrivateState>): [Game2PrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
  _divMod: (
    context: WitnessContext<Ledger, Game2PrivateState>,
    x: bigint, 
    y: bigint): [Game2PrivateState, [bigint, bigint]] => {
    const xn = Number(x);
    const yn = Number(y);
    const remainder = xn % yn;
    const quotient = Math.floor(xn / yn);
    return [context.privateState, [BigInt(quotient), BigInt(remainder)]];
  }
};
