/**
 * API equivalent to Game2API from the API crate, but instead of communicating with the blockchain and
 * proving all transactions, it mocks it out and handles all logic within javascript.
 * 
 * This is helpful for development of the frontend without the latency that the on-chain API has.
 */
import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { Ability, BattleConfig, BattleRewards, EFFECT_TYPE, BOSS_TYPE, Level, EnemiesConfig, PlayerLoadout, pureCircuits } from "game2-contract";
import { Observable, Subscriber, Subject } from "rxjs";
import { combat_round_logic, initBattlestate, randomAbility } from "./battle/logic";
import { logger } from "./main";
import { randomBytes } from "game2-api/dist/utils";


const MOCK_DELAY = 500;  // How many milliseconds to wait before responding to API requests and between state refreshes.
export const MOCK_PLAYER_ID = BigInt(0);

export const OFFLINE_PRACTICE_CONTRACT_ADDR = 'OFFLINE_PRACTICE_CONTRACT_ADDR';

export class MockGame2API implements DeployedGame2API {
    readonly deployedContractAddress: ContractAddress;
    readonly state$: Observable<Game2DerivedState>;
    private stateSubject: Subject<Game2DerivedState>;
    mockState: Game2DerivedState;
    questReadiness: Map<bigint, boolean>;
    questStartTimes: Map<bigint, number>;

    constructor() {
        this.deployedContractAddress = OFFLINE_PRACTICE_CONTRACT_ADDR;
        this.questReadiness = new Map();
        this.questStartTimes = new Map();
        this.stateSubject = new Subject<Game2DerivedState>();
        this.state$ = this.stateSubject.asObservable();
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
            levels: new Map(),
            bosses: new Map(),
            playerBossProgress: new Map(),
        };
        setTimeout(() => {
            this.stateSubject.next(this.mockState);
        }, MOCK_DELAY);
    }

    public register_new_player(): Promise<void> {
        return this.response(async () => {
            this.mockState.player = {
                gold: BigInt(0),
                rng: randomBytes(32)
            };
            this.mockState.playerAbilities = new Map([
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_phys()), BigInt(4)],
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_block()), BigInt(4)],
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_ice()), BigInt(1)],
                [pureCircuits.derive_ability_id(pureCircuits.ability_base_fire_aoe()), BigInt(1)],
            ]);
        });
    }

    public start_new_battle(loadout: PlayerLoadout, level: Level): Promise<BattleConfig> {
        return this.response(async () => {
            for (const ability_id of loadout.abilities) {
                if ((this.mockState.playerAbilities.get(ability_id) ?? BigInt(0)) < 1) {
                    throw new Error("Must own ability");
                }
            }
            logger.gameState.debug(`from ${this.mockState.activeBattleConfigs.size}`);
            const configs = this.mockState.levels.get(level.biome)!.get(level.difficulty)!;
            const battleConfig = configs.get(BigInt(Phaser.Math.Between(0, configs.size - 1)));
            const battle = {
                level,
                enemies: battleConfig!,
                player_pub_key: MOCK_PLAYER_ID,
                loadout,
            };
            const id = pureCircuits.derive_battle_id(battle);
            logger.gameState.info(`new battle: ${id}`);
            this.mockState.activeBattleStates.set(id, initBattlestate(Phaser.Math.Between(0, 255), battle));
            this.mockState.activeBattleConfigs.set(id, battle);
            return battle;
        });
    }

    public async combat_round(battle_id: bigint, ability_targets: [bigint, bigint, bigint]): Promise<BattleRewards | undefined> {
        return await this.response(async () => {
            const targetsUnwrapped = ability_targets.map(t => Number(t));

            return combat_round_logic(battle_id, this.mockState, targetsUnwrapped).then((ret) => {
                const battleState = this.mockState.activeBattleStates.get(battle_id)!;
                const battleConfig = this.mockState.activeBattleConfigs.get(battle_id)!;
                // Shift deck current abilities
                const DECK_SIZE = 7;
                const OFFSETS = [1, 2, 3];
                for (let i = 0; i < battleState.deck_indices.length; ++i) {
                    battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + OFFSETS[i]) % DECK_SIZE);
                    for (let j = 0; j < i; ++j) {
                        if (battleState.deck_indices[i] == battleState.deck_indices[j]) {
                            battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + 1) % DECK_SIZE);
                        }
                        for (let k = 0; k < j; ++k) {
                            if (battleState.deck_indices[i] == battleState.deck_indices[k]) {
                                battleState.deck_indices[i] = BigInt((Number(battleState.deck_indices[i]) + 1) % DECK_SIZE);
                            }
                        }
                    }
                }
                // and also move indices
                battleState.enemy_move_index_0 = BigInt((Number(battleState.enemy_move_index_0) + 1) % Number(battleConfig.enemies.stats[0].move_count));
                if (battleConfig.enemies.count >= 2) {
                    battleState.enemy_move_index_1 = BigInt((Number(battleState.enemy_move_index_1) + 1) % Number(battleConfig.enemies.stats[1].move_count));
                }
                if (battleConfig.enemies.count >= 3) {
                    battleState.enemy_move_index_2 = BigInt((Number(battleState.enemy_move_index_2) + 1) % Number(battleConfig.enemies.stats[2].move_count));
                }

                battleState.round += BigInt(1);
                if (ret != undefined) {
                    this.addRewards(ret);
                    // Check if this was a boss battle and mark completion
                    const battleConfig = this.mockState.activeBattleConfigs.get(battle_id);
                    if (battleConfig && ret.alive && battleConfig.enemies.stats[0].boss_type === BOSS_TYPE.boss) {
                        const biome = battleConfig.level.biome;
                        const difficulty = battleConfig.level.difficulty;
                        if (!this.mockState.playerBossProgress.has(biome)) {
                            this.mockState.playerBossProgress.set(biome, new Map());
                        }
                        this.mockState.playerBossProgress.get(biome)!.set(difficulty, true);
                    }
                    this.mockState.activeBattleConfigs.delete(battle_id);
                    this.mockState.activeBattleStates.delete(battle_id);
                }
                return ret;
            });
        });
    }

    public start_new_quest(loadout: PlayerLoadout, level: Level): Promise<bigint> {
        return this.response(async () => {
            for (const ability_id of loadout.abilities) {
                if ((this.mockState.playerAbilities.get(ability_id) ?? BigInt(0)) < 1) {
                    throw new Error("Must own ability");
                }
            }
            const quest = {
                level,
                player_pub_key: MOCK_PLAYER_ID,
                loadout,
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
        return this.response(async () => {
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
        return this.response(async () => {
            // Use the stored readiness state instead of new random
            if (this.questReadiness.get(quest_id) ?? false) {
                const quest = this.mockState.quests.get(quest_id)!;
                this.mockState.quests.delete(quest_id);
                this.questReadiness.delete(quest_id);
                this.questStartTimes.delete(quest_id);

                const battle_config = {
                    level: quest.level,
                    enemies: this.mockState.bosses.get(quest.level.biome)!.get(quest.level.difficulty)!,
                    player_pub_key: MOCK_PLAYER_ID,
                    loadout: quest.loadout,
                };

                const battleId = pureCircuits.derive_battle_id(battle_config);

                this.mockState.activeBattleStates.set(battleId, initBattlestate(Phaser.Math.Between(0, 255), battle_config));
                this.mockState.activeBattleConfigs.set(battleId, battle_config);

                return battleId;
            }
            return undefined;
        });
    }

    public async sell_ability(ability: Ability): Promise<void> {
        return this.response(async () => {
            const id = pureCircuits.derive_ability_id(ability);
            this.removePlayerAbility(id);
            this.mockState.player!.gold += pureCircuits.ability_value(ability);
        });
    }

    public async upgrade_ability(ability: Ability, sacrifice: Ability): Promise<bigint> {
        return this.response(async () => {
            if (pureCircuits.ability_score(sacrifice) < pureCircuits.ability_score(ability)) {
                throw new Error("Sacrificed ability must have score equal or greater to the ability to upgrade");
            }
            if (ability.upgrade_level >= 3) {
                throw new Error("Ability can't be upgraded any more");
            }
            const ability_id = pureCircuits.derive_ability_id(ability);
            const sacrifice_id = pureCircuits.derive_ability_id(sacrifice);
            this.removePlayerAbility(ability_id);
            this.removePlayerAbility(sacrifice_id);
            const cost = pureCircuits.upgrade_ability_cost(ability);
            if (this.mockState.player!.gold < cost) {
                throw new Error("Insufficient gold for upgrade");
            }
            this.mockState.player!.gold -= cost;
            const upgraded = pureCircuits.compute_upgraded_ability(ability);
            const upgraded_id = pureCircuits.derive_ability_id(upgraded);
            this.mockState.allAbilities.set(upgraded_id, upgraded);
            this.mockState.playerAbilities.set(upgraded_id, (this.mockState.playerAbilities.get(upgraded_id) ?? BigInt(0)) + BigInt(1));
            return upgraded_id;
        });
    }

    public async admin_level_new(level: Level, boss: EnemiesConfig): Promise<void> {
        return this.response(async () => {
            let bossesByBiome = this.mockState.bosses.get(level.biome);
            if (bossesByBiome == undefined) {
                bossesByBiome = new Map();
                this.mockState.bosses.set(level.biome, bossesByBiome);
            }
            bossesByBiome.set(level.difficulty, boss);
        }, 5);
    }

    public async admin_level_add_config(level: Level, enemies: EnemiesConfig): Promise<void> {
        return this.response(async () => {
            let byBiome = this.mockState.levels.get(level.biome);
            if (byBiome == undefined) {
                byBiome = new Map();
                this.mockState.levels.set(level.biome, byBiome);
            }
            let byDifficulty = byBiome.get(level.difficulty);
            if (byDifficulty == undefined) {
                byDifficulty = new Map();
                byBiome.set(level.difficulty, byDifficulty);
            }
            byDifficulty.set(BigInt(byDifficulty.size), enemies);
        }, 5);
    }



    private addRewards(rewards: BattleRewards) {
        this.mockState.player!.gold += rewards.gold;
        if (rewards.ability.is_some) {
            const abilityId = rewards.ability.value;
            this.mockState.playerAbilities.set(abilityId, (this.mockState.playerAbilities.get(abilityId) ?? BigInt(0)) + BigInt(1));
        }
    }

    private removePlayerAbility(id: bigint) {
        const count = this.mockState.playerAbilities.get(id) ?? BigInt(0);
        if (count < 1) {
            throw new Error("Must own ability");
        }
        if (count > BigInt(1)) {
            this.mockState.playerAbilities.set(id, count - BigInt(1));
        } else {
            this.mockState.playerAbilities.delete(id);
        }
    }

    private async response<T>(body: () => Promise<T>, delay: number = MOCK_DELAY): Promise<T> {
        return new Promise((resolve, reject) => setTimeout(async () => {
            const returnBeforeState = Math.random() > 0.5;
            try {
                const ret = await body();
                if (returnBeforeState) {
                    resolve(ret);
                } else {
                    this.stateSubject.next(this.mockState);
                    setTimeout(() => resolve(ret), delay);
                }
            } catch (e) {
                reject(e);
            }
            if (returnBeforeState) {
                setTimeout(() => {
                    this.stateSubject.next(this.mockState);
                }, delay);
            }
        }, delay));
    }
}
