/**
 * Provides types and utilities for working with bulletin board contracts.
 *
 * @packageDocumentation
 */

import { type ContractAddress, convert_bigint_to_Uint8Array } from '@midnight-ntwrk/compact-runtime';
import { type Logger } from 'pino';
import type { Game2DerivedState, Game2Contract, Game2Providers, DeployedGame2Contract } from './common-types.js';
import {
    type Game2PrivateState,
    Contract,
    createGame2PrivateState,
    ledger,
    pureCircuits,
    witnesses,
    Ability,
    EnemyStats,
    PlayerLoadout,
    BattleConfig,
    BattleRewards,
  // Command,
} from 'game2-contract';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, map, tap, from, type Observable } from 'rxjs';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

/** @internal */
const game2ContractInstance: Game2Contract = new Contract(witnesses);

export function safeJSONString(obj: object): string {
    // hacky but just doing it manually since otherwise: 'string' can't be used to index type '{}'
    // let newObj = {}
    // for (let [key, val] of Object.entries(obj)) {
    //     if (typeof val == 'bigint') {
    //         newObj[key] = Number(val);
    //     } else {
    //         newObj[key] = val;
    //     }
    // }
    // return JSON.stringify(newObj);
    if (typeof obj == 'bigint') {
        return Number(obj).toString();
    } else if (Array.isArray(obj)) {
        let str = '[';
        let innerFirst = true;
        for (let i = 0; i < obj.length; ++i) {
            if (!innerFirst) {
                str += ', ';
            }
            innerFirst = false;
            str += safeJSONString(obj[i]);
        }
        str += ']';
        return str;
    } else if (typeof obj == 'object') {
        let str = '{';
        let first = true;
        for (let [key, val] of Object.entries(obj)) {
            if (!first) {
                str += ', ';
            }
            first = false;
            str += `"${key}": ${safeJSONString(val)}`;
        }
        str += '}';
        return str;
    }
    return JSON.stringify(obj);
}

/**
 * An API for a deployed bulletin board.
 */
export interface DeployedGame2API {
    readonly deployedContractAddress: ContractAddress;
    readonly state$: Observable<Game2DerivedState>;

    start_new_battle: (loadout: PlayerLoadout) => Promise<BattleConfig>;
    combat_round: (battle_id: bigint) => Promise<BattleRewards | undefined>;

    start_new_quest: (loadout: PlayerLoadout, difficulty: bigint) => Promise<bigint>;
    finalize_quest: (quest_id: bigint) => Promise<BattleRewards>;
}

/**
 * Provides an implementation of {@link DeployedGame2API} by adapting a deployed bulletin board
 * contract.
 *
 * @remarks
 * The `Game2PrivateState` is managed at the DApp level by a private state provider. As such, this
 * private state is shared between all instances of {@link Game2API}, and their underlying deployed
 * contracts. The private state defines a `'secretKey'` property that effectively identifies the current
 * user, and is used to determine if the current user is the poster of the message as the observable
 * contract state changes.
 *
 * In the future, Midnight.js will provide a private state provider that supports private state storage
 * keyed by contract address. This will remove the current workaround of sharing private state across
 * the deployed bulletin board contracts, and allows for a unique secret key to be generated for each bulletin
 * board that the user interacts with.
 */
// TODO: Update Game2API to use contract level private state storage.
export class Game2API implements DeployedGame2API {
    /** @internal */
    private constructor(
        public readonly deployedContract: DeployedGame2Contract,
        private readonly providers: Game2Providers,
        private readonly logger?: Logger,
    ) {
        this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
        this.state$ = combineLatest(
            [
                // Combine public (ledger) state with...
                providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }).pipe(
                  map((contractState) => ledger(contractState.data)),
                  tap((ledgerState) =>
                    logger?.trace({
                      ledgerStateChanged: {
                        ledgerState: {
                          ...ledgerState,
                          // state: ledgerState.state === STATE.occupied ? 'occupied' : 'vacant',
                          // poster: toHex(ledgerState.poster),
                        },
                      },
                    }),
                  ),
                ),
                // ...private state...
                //    since the private state of the bulletin board application never changes, we can query the
                //    private state once and always use the same value with `combineLatest`. In applications
                //    where the private state is expected to change, we would need to make this an `Observable`.
                from(providers.privateStateProvider.get('game2PrivateState') as Promise<Game2PrivateState>),
            ],
            // ...and combine them to produce the required derived state.
            (ledgerState, privateState) => {
                return {
                  activeBattleConfigs: new Map(ledgerState.activeBattleConfigs),
                  activeBattleStates: new Map(ledgerState.activeBattleStates),
                  quests: new Map(ledgerState.quests),
                  players: new Map(ledgerState.players),
                };
            },
        );
    }

    /**
     * Gets the address of the current deployed contract.
     */
    readonly deployedContractAddress: ContractAddress;

    /**
     * Gets an observable stream of state changes based on the current public (ledger),
     * and private state data.
     */
    readonly state$: Observable<Game2DerivedState>;
   

    async start_new_battle(loadout: PlayerLoadout): Promise<BattleConfig> {
        const txData = await this.deployedContract.callTx.start_new_battle(loadout);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'start_new_battle',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });

        return txData.private.result;
    }
    async combat_round(battle_id: bigint): Promise<BattleRewards | undefined> {
        const txData = await this.deployedContract.callTx.combat_round(battle_id);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'combat_round',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });

        return txData.private.result.is_some ? txData.private.result.value : undefined;
    }

    async start_new_quest(loadout: PlayerLoadout, difficulty: bigint): Promise<bigint> {
        const txData = await this.deployedContract.callTx.start_new_quest(loadout, difficulty);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'start_new_quest',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });

        return txData.private.result;
    }

    async finalize_quest(quest_id: bigint): Promise<BattleRewards> {
        const txData = await this.deployedContract.callTx.finalize_quest(quest_id);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'finalize_quest',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });

        return txData.private.result;
    }

    /**
     * Deploys a new bulletin board contract to the network.
     *
     * @param providers The bulletin board providers.
     * @param logger An optional 'pino' logger to use for logging.
     * @returns A `Promise` that resolves with a {@link Game2API} instance that manages the newly deployed
     * {@link DeployedGame2Contract}; or rejects with a deployment error.
     */
    static async deploy(providers: Game2Providers, logger?: Logger): Promise<Game2API> {
        logger?.info('deployContract');

        const deployedGame2Contract = await deployContract(providers, {
            privateStateKey: 'game2PrivateState',
            contract: game2ContractInstance,
            initialPrivateState: await Game2API.getPrivateState(providers.privateStateProvider),
            //args: [],
        });
        logger?.trace({
            contractDeployed: {
                finalizedDeployTxData: deployedGame2Contract.deployTxData.public,
            },
        });

        return new Game2API(deployedGame2Contract, providers, logger);
    }

    /**
     * Finds an already deployed bulletin board contract on the network, and joins it.
     *
     * @param providers The bulletin board providers.
     * @param contractAddress The contract address of the deployed bulletin board contract to search for and join.
     * @param logger An optional 'pino' logger to use for logging.
     * @returns A `Promise` that resolves with a {@link Game2API} instance that manages the joined
     * {@link DeployedGame2Contract}; or rejects with an error.
     */
    static async join(providers: Game2Providers, contractAddress: ContractAddress, logger?: Logger): Promise<Game2API> {
        logger?.info({
            joinContract: {
                contractAddress,
            },
        });

        const deployedGame2Contract = await findDeployedContract(providers, {
            contractAddress,
            contract: game2ContractInstance,
            privateStateKey: 'game2PrivateState',
            initialPrivateState: await Game2API.getPrivateState(providers.privateStateProvider),
        });

        logger?.trace({
            contractJoined: {
                finalizedDeployTxData: deployedGame2Contract.deployTxData.public,
            },
        });

        return new Game2API(deployedGame2Contract, providers, logger);
    }

    static async getPrivateState(
        privateStateProvider: PrivateStateProvider
    ): Promise<Game2PrivateState> {
        const existingPrivateState =
            await privateStateProvider.get("game2PrivateState");

        if (existingPrivateState) {
            return existingPrivateState;
        } else {
            let newPrivateState = createGame2PrivateState(utils.randomBytes(32));

            // this is done anyway on the first contract deploy/join, but we need to
            // initialize it before that to be able to have the public key for the
            // lobby menu available before that.
            privateStateProvider.set("game2PrivateState", newPrivateState);

            return newPrivateState;
        }
    }
}


/**
 * A namespace that represents the exports from the `'utils'` sub-package.
 *
 * @public
 */
export * as utils from './utils/index.js';

export * from './common-types.js';
