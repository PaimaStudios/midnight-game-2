/**
 * API equivalent to Game2API from the API crate, but instead of communicating with the blockchain and
 * proving all transactions, it mocks it out and handles all logic within javascript.
 * 
 * This is helpful for development of the frontend without the latency that the on-chain API has.
 */
import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState, utils } from "game2-api";
import { Ability, BattleConfig, BattleRewards, EFFECT_TYPE, BOSS_TYPE, EnemyStats, PlayerLoadout, pureCircuits } from "game2-contract";
import { Observable, Subscriber } from "rxjs";
import { combat_round_logic, generateRandomAbility, randIntBetween } from "./battle/logic";
import { safeJSONString, logger } from "./main";
import { BIOME_ID } from "./biome";


const MOCK_DELAY = 500;  // How many milliseconds to wait before responding to API requests and between state refreshes.
export const MOCK_PLAYER_ID = BigInt(0);

export const OFFLINE_PRACTICE_CONTRACT_ADDR = 'OFFLINE_PRACTICE_CONTRACT_ADDR';

export class MockGame2API implements DeployedGame2API {
    readonly deployedContractAddress: ContractAddress;
    readonly state$: Observable<Game2DerivedState>;
    subscriber: Subscriber<Game2DerivedState> | undefined;
    mockState: Game2DerivedState;
    questReadiness: Map<bigint, boolean>;
    questStartTimes: Map<bigint, number>;

    constructor() {
        this.deployedContractAddress = OFFLINE_PRACTICE_CONTRACT_ADDR;
        this.questReadiness = new Map();
        this.questStartTimes = new Map();
        this.state$ = new Observable<Game2DerivedState>((subscriber) => {
            this.subscriber = subscriber;
        });
        this.mockState = {
            activeBattleConfigs: new Map(),
            activeBattleStates: new Map(),
            allAbilities: new Map([
                pureCircuits.ability_base_phys(),
                pureCircuits.ability_base_block(),
                pureCircuits.ability_base_fire_aoe(),
                pureCircuits.ability_base_ice(),
            ].map((ability) => [pureCircuits.derive_ability_id(ability), ability])),
            quests: new Map(),
            player: undefined,
            playerAbilities: new Map(),
            ui: undefined,
            circuit: undefined
        };
        setTimeout(() => {
            this.subscriber?.next(this.mockState);
        }, MOCK_DELAY);
    }

    public register_new_player(): Promise<void> {
        return this.response(() => {
            this.mockState.player = {
                gold: BigInt(0),
            };
            this.mockState.playerAbilities = new Map([
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_phys()), BigInt(4)],
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_block()), BigInt(4)],
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_ice()), BigInt(1)],
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_fire_aoe()), BigInt(1)],
            ]);
            // This is one difference vs the on-chain version so we can test effect triggers
            for (let i = 0; i < 20; ++i) {
                this.givePlayerRandomAbility(BigInt(1));
            }
        });
    }

    public start_new_battle(loadout: PlayerLoadout, biome: bigint): Promise<BattleConfig> {
        return this.response(() => {
            logger.gameState.debug(`from ${this.mockState.activeBattleConfigs.size}`);
            const rng = utils.randomBytes(32);
            const biomeBiases = [
                [1, -1, -1],
                [0, 1, -3],
                [0, -3, 1],
                [1, 0, -1]
            ];
            const enemies = randIntBetween(rng, 0, 1, 3);
            // for the demo we'll randomize these here in a straightforward way. once bytes indexing we'll need to do this consistently with the contract
            const randomEnemy = (index: number): EnemyStats => {
                const attack =  BigInt(randIntBetween(rng, index, 10 - enemies * 2, 20 - enemies * 4));
                const block = BigInt(randIntBetween(rng, index, 0, 10));
                const physical_def = BigInt(randIntBetween(rng, index, 4, 7) + biomeBiases[Number(biome)][0]);
                const fire_def = BigInt(randIntBetween(rng, index + 100, 4, 7) + biomeBiases[Number(biome)][1]);
                const ice_def = BigInt(randIntBetween(rng, index + 200, 4, 7) + biomeBiases[Number(biome)][2]);
                let enemy_type = 0;
                if (fire_def > physical_def && fire_def > ice_def) {
                    enemy_type = 1;
                } else if (ice_def > physical_def && ice_def > physical_def) {
                    enemy_type = block > attack ? 2 : 3;
                }
                return {
                    boss_type: BOSS_TYPE.normal,
                    enemy_type: BigInt(enemy_type),
                    hp: BigInt(randIntBetween(rng, index, 70, 80) - enemies * 10),
                    attack,
                    block,
                    physical_def,
                    fire_def,
                    ice_def,
                }
            };
            const battle = {
                biome,
                stats: [
                    randomEnemy(0),
                    randomEnemy(1),
                    randomEnemy(2)
                ],
                enemy_count: BigInt(enemies),
                player_pub_key: MOCK_PLAYER_ID,
                loadout,
            };
            const id = pureCircuits.derive_battle_id(battle);
            logger.gameState.info(`new battle: ${id}`);
            this.mockState.activeBattleStates.set(id, {
                deck_indices: [BigInt(0), BigInt(1), BigInt(2)],
                player_hp: BigInt(100),
                enemy_hp_0: battle.stats[0].hp,
                enemy_hp_1: battle.stats[1].hp,
                enemy_hp_2: battle.stats[2].hp,
            });
            this.mockState.activeBattleConfigs.set(id, battle);
            logger.gameState.debug(` to ${this.mockState.activeBattleConfigs.size}`);
            logger.gameState.debug(`start new battle - state is now: ${safeJSONString(this.mockState)} | `);
            return battle;
        });
    }

    public async combat_round(battle_id: bigint, targets?: [bigint, bigint, bigint]): Promise<BattleRewards | undefined> {
        return await this.response(async () => {
            if (targets) {
                const targetsCopy = targets.map(t => Number(t));
                const { combat_round_logic } = await import('./battle/logic');
                return combat_round_logic(battle_id, this.mockState, targetsCopy).then((ret) => {
                    const battleState = this.mockState.activeBattleStates.get(battle_id)!;
                    // shift deck current abilities
                    const DECK_SIZE = 7;
                    const OFFSETS = [1, 2, 3];
                    for (let i = 0; i < battleState.deck_indices.length; ++i) {
                        battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + OFFSETS[i]) % DECK_SIZE);
                        for (let j = 0; j < i; ++j) {
                            if (battleState.deck_indices[i] == battleState.deck_indices[j]) {
                                battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + 1) % DECK_SIZE);
                            }
                            for ( let k = 0; k < j; ++k) {
                                if (battleState.deck_indices[i] == battleState.deck_indices[k]) {
                                    battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + 1) % DECK_SIZE);
                                }
                            }
                        }
                    }
                    if (ret != undefined) {
                        this.addRewards(ret);
                        this.mockState.activeBattleConfigs.delete(battle_id);
                        this.mockState.activeBattleStates.delete(battle_id);
                    }
                    return ret;
                });
            } else {
                return combat_round_logic(battle_id, this.mockState, undefined).then((ret) => {
                const battleState = this.mockState.activeBattleStates.get(battle_id)!;
                // shift deck current abilities
                const DECK_SIZE = 7;
                const OFFSETS = [1, 2, 3];
                for (let i = 0; i < battleState.deck_indices.length; ++i) {
                    battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + OFFSETS[i]) % DECK_SIZE);
                    for (let j = 0; j < i; ++j) {
                        if (battleState.deck_indices[i] == battleState.deck_indices[j]) {
                            battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + 1) % DECK_SIZE);
                        }
                        for ( let k = 0; k < j; ++k) {
                            if (battleState.deck_indices[i] == battleState.deck_indices[k]) {
                                battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + 1) % DECK_SIZE);
                            }
                        }
                    }
                }
                if (ret != undefined) {
                    this.addRewards(ret);
                    this.mockState.activeBattleConfigs.delete(battle_id);
                    this.mockState.activeBattleStates.delete(battle_id);
                }
                return ret;
            });
            }
        });
    }

    public start_new_quest(loadout: PlayerLoadout, biome: bigint, difficulty: bigint): Promise<bigint> {
        return this.response(() => {
            const noEnemy = { boss_type: BOSS_TYPE.normal, enemy_type: BigInt(0), hp: BigInt(0), attack: BigInt(0), block: BigInt(0), physical_def: BigInt(0), fire_def: BigInt(0), ice_def: BigInt(0) };
            let boss = noEnemy;
            const dragon = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(0), hp: BigInt(300), attack: BigInt(15), block: BigInt(15), physical_def: BigInt(5), fire_def: BigInt(7), ice_def: BigInt(3) };
            const enigma = { boss_type: BOSS_TYPE.boss, enemy_type: BigInt(1), hp: BigInt(42), attack: BigInt(30), block: BigInt(30), physical_def: BigInt(8), fire_def: BigInt(5), ice_def: BigInt(5) };
            switch (Number(biome)) {
                case BIOME_ID.grasslands:
                case BIOME_ID.cave:
                    boss = dragon;
                    break;
                case BIOME_ID.desert:
                case BIOME_ID.tundra:
                    boss = enigma;
                    break;
            }
            const battle_config = {
                biome,
                stats: [
                    boss,
                    noEnemy,
                    noEnemy
                ],
                enemy_count: BigInt(1),
                player_pub_key: MOCK_PLAYER_ID,
                loadout,
            };
            const quest = {
                battle_config,
                difficulty,
            };
            const questId = pureCircuits.derive_quest_id(quest);
            this.mockState.quests.set(questId, quest);
            // Quest starts not ready, record start time
            this.questReadiness.set(questId, false);
            this.questStartTimes.set(questId, Date.now());
            return questId;
        });
    }

    public is_quest_ready(quest_id: bigint): Promise<boolean> {
        return this.response(() => {
            // Check if already marked as ready
            let isReady = this.questReadiness.get(quest_id) ?? false;
            
            if (!isReady) {
                // Check if 5 seconds have passed since quest creation
                const TIME_TO_WAIT = 5000; // 5 seconds
                const startTime = this.questStartTimes.get(quest_id);
                if (startTime && (Date.now() - startTime) >= TIME_TO_WAIT) {
                    // Mark as ready and keep it ready
                    this.questReadiness.set(quest_id, true);
                    isReady = true;
                }
            }
            
            return isReady;
        });
    }

    public finalize_quest(quest_id: bigint): Promise<bigint | undefined> {
        return this.response(() => {
            // Use the stored readiness state instead of new random
            if (this.questReadiness.get(quest_id) ?? false) {
                const quest = this.mockState.quests.get(quest_id)!;
                this.mockState.quests.delete(quest_id);
                this.questReadiness.delete(quest_id);
                this.questStartTimes.delete(quest_id);

                const battleId = pureCircuits.derive_battle_id(quest.battle_config);

                this.mockState.activeBattleStates.set(battleId, {
                    deck_indices: [BigInt(0), BigInt(1), BigInt(2)],
                    player_hp: BigInt(100),
                    enemy_hp_0: quest.battle_config.stats[0].hp,
                    enemy_hp_1: quest.battle_config.stats[1].hp,
                    enemy_hp_2: quest.battle_config.stats[2].hp,
                });
                this.mockState.activeBattleConfigs.set(battleId, quest.battle_config);

                return battleId;
            }
            return undefined;
        });
    }

    public async sell_ability(ability: Ability): Promise<void> {
        return this.response(() => {
            const id = pureCircuits.derive_ability_id(ability);
            const oldCount = this.mockState.playerAbilities.get(id)!;
            if (oldCount > BigInt(1)) {
                this.mockState.playerAbilities.set(id, oldCount - BigInt(1));
            } else {
                this.mockState.playerAbilities.delete(id);
            }
            this.mockState.player!.gold += pureCircuits.ability_value(ability);
        });
    }


    private addRewards(rewards: BattleRewards) {
        this.mockState.player!.gold += rewards.gold;
        if (rewards.ability.is_some) {
            const abilityId = rewards.ability.value;
            this.mockState.playerAbilities.set(abilityId, (this.mockState.playerAbilities.get(abilityId) ?? BigInt(0)) + BigInt(1));
        }
    }

    private givePlayerRandomAbility(difficulty: bigint): bigint {
        const ability = generateRandomAbility(difficulty);
        const abilityId = pureCircuits.derive_ability_id(ability);
        this.mockState.allAbilities.set(abilityId, ability);
        this.mockState.playerAbilities.set(abilityId, (this.mockState.playerAbilities.get(abilityId) ?? BigInt(0)) + BigInt(1));
        return abilityId;
    }

    private response<T>(body: () => T): Promise<T> {
        return new Promise((resolve, reject) => setTimeout(() => {
            try {
                const ret = body();
                resolve(ret);
            } catch (e) {
                reject(e);
            }
            setTimeout(() => {
                logger.gameState.debug(`\n   ----> new state ${safeJSONString(this.mockState)}\n\n`);
                this.subscriber?.next(this.mockState);
            }, MOCK_DELAY);
        }, MOCK_DELAY));
    }
}
