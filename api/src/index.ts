/**
 * Provides types and utilities for working with deployed (on-chain) Game2 contracts
 *
 * @packageDocumentation
 */

import { type ContractAddress, convert_bigint_to_Uint8Array } from '@midnight-ntwrk/compact-runtime';
import { type Logger } from 'pino';
import type { Game2DerivedState, Game2Contract, Game2Providers, DeployedGame2Contract, PrivateStates } from './common-types.js';
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
import { deployContract, findDeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
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
 * Game2's Contract API. Corresponds directly to the exported circuits.
 */
export interface DeployedGame2API {
    readonly deployedContractAddress: ContractAddress;
    readonly state$: Observable<Game2DerivedState>;

    /**
     * Register a new player and give them the default abilities.
     * Populates all ledger states indexed by the player ID
     * Uses the player_secret_key() witness as the player ID
     */
    register_new_player: () => Promise<void>;


    /**
     * Start a new active battle
     * @param loadout Abilities used in this battle. They will be (temporarily) removed until battle end.
     * @param biome The area to start the battle in.
     * @returns The config corresponding to the created battle.
     */
    start_new_battle: (loadout: PlayerLoadout, biome: bigint) => Promise<BattleConfig>;

    /**
     * Run a combat round of an already existing active battle
     * @param battle_id Battle to attempt a combat round of
     * @returns Rewards if battle is complete (win or lose), or undefined if not
     */
    combat_round: (battle_id: bigint) => Promise<BattleRewards | undefined>;


    /**
     * Start a new quest
     * 
     * @param loadout Abilities used in this quest. They will be (temporarily) removed until battle end.
     * @param biome The area to start the battle in.
     * @param difficulty The difficulty of the quest
     * @returns The quest ID of the new quest
     */
    start_new_quest: (loadout: PlayerLoadout, biome: bigint, difficulty: bigint) => Promise<bigint>;

    /**
     * Check if a quest is ready to be finalized (without actually finalizing it)
     * 
     * @param quest_id Quest to check readiness for
     * @returns True if quest is ready to be finalized, false otherwise
     */
    is_quest_ready: (quest_id: bigint) => Promise<boolean>;

    /**
     * Attempt to finalize a quest (enter into the boss battle)
     * 
     * @param quest_id Quest to try to end
     * @returns The battle ID of the resulting boss battle, or none if quest not ready yet
     */
    finalize_quest: (quest_id: bigint) => Promise<bigint | undefined>;

    /**
     * Sell an ability
     * 
     * @param ability The ability to sell. You must own at least 1
     */
    sell_ability: (ability: Ability) => Promise<void>;
}

/**
 * Provides an implementation of {@link DeployedGame2API} that interacts with the provided prover and submits transactions on-chain
 */
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
                // TODO: update this comment since this does change but we worked around it in pvp-arena
                // ...private state...
                //    since the private state of the bulletin board application never changes, we can query the
                //    private state once and always use the same value with `combineLatest`. In applications
                //    where the private state is expected to change, we would need to make this an `Observable`.
                from(providers.privateStateProvider.get('game2PrivateState') as Promise<Game2PrivateState>),
            ],
            // ...and combine them to produce the required derived state.
            (ledgerState, privateState) => {
                const playerId = pureCircuits.derive_player_pub_key(privateState.secretKey);
                return {
                  activeBattleConfigs: new Map(ledgerState.active_battle_configs),
                  activeBattleStates: new Map(ledgerState.active_battle_states),
                  quests: new Map(ledgerState.quests),
                  player: ledgerState.players.member(playerId) ? ledgerState.players.lookup(playerId) : undefined,
                  playerAbilities: new Map(ledgerState.player_abilities.member(playerId) ? ledgerState.player_abilities.lookup(playerId) : []),
                  allAbilities: new Map(ledgerState.all_abilities),
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
   
    async register_new_player(): Promise<void> {
        const txData = await this.deployedContract.callTx.register_new_player();

        this.logger?.trace({
            transactionAdded: {
                circuit: 'register_new_player',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });
    }

    async start_new_battle(loadout: PlayerLoadout, biome: bigint): Promise<BattleConfig> {
        const txData = await this.deployedContract.callTx.start_new_battle(loadout, biome);

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

    async start_new_quest(loadout: PlayerLoadout, biome: bigint, difficulty: bigint): Promise<bigint> {
        const txData = await this.deployedContract.callTx.start_new_quest(loadout, biome, difficulty);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'start_new_quest',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });

        return txData.private.result;
    }

    async is_quest_ready(quest_id: bigint): Promise<boolean> {
        const txData = await this.deployedContract.callTx.is_quest_ready(quest_id);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'is_quest_ready',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });

        return txData.private.result;
    }

    async finalize_quest(quest_id: bigint): Promise<bigint | undefined> {
        const txData = await this.deployedContract.callTx.finalize_quest(quest_id);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'finalize_quest',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });

        return txData.private.result.is_some ? txData.private.result.value : undefined;
    }

    async sell_ability(ability: Ability): Promise<void> {
        const txData = await this.deployedContract.callTx.sell_ability(ability);

        this.logger?.trace({
            transactionAdded: {
                circuit: 'sell_ability',
                txHash: txData.public.txHash,
                blockHeight: txData.public.blockHeight,
            },
        });
    }

    /**
     * Deploys a new Game2 contract to the network.
     *
     * @param providers The game's providers.
     * @param logger An optional 'pino' logger to use for logging.
     * @returns A `Promise` that resolves with a {@link Game2API} instance that manages the newly deployed
     * {@link DeployedGame2Contract}; or rejects with a deployment error.
     */
    static async deploy(providers: Game2Providers, logger?: Logger): Promise<Game2API> {
        logger?.info('deployContract');

        const deployedGame2Contract: FoundContract<Game2Contract> = await deployContract(providers, {
            privateStateId: 'game2PrivateState',
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
     * Finds an already deployed Game2 contract on the network, and joins it.
     *
     * @param providers The game's providers.
     * @param contractAddress The contract address of the deployed gamecontract to search for and join.
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
            privateStateId: 'game2PrivateState',
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
