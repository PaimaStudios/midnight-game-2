/**
 * API equivalent to Game2API from the API crate, but instead of communicating with the blockchain and
 * proving all transactions, it mocks it out and handles all logic within javascript.
 * 
 * This is helpful for development of the frontend without the latency that the on-chain API has.
 */
import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Ability, BattleConfig, BattleRewards, Level, EnemiesConfig, PlayerLoadout, pureCircuits, BOSS_TYPE } from "game2-contract";
import { Observable, Subscriber } from "rxjs";
import { combat_round_logic } from "./battle/logic";
import { logger } from "./main";
import { randomBytes } from "game2-api/dist/utils";


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
    playerBossProgress: Map<bigint, Map<bigint, boolean>>;

    constructor() {
        this.deployedContractAddress = OFFLINE_PRACTICE_CONTRACT_ADDR;
        this.questReadiness = new Map();
        this.questStartTimes = new Map();
        this.playerBossProgress = new Map();
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
            levels: new Map(),
            bosses: new Map(),
        };
        setTimeout(() => {
            this.subscriber?.next(this.mockState);
        }, MOCK_DELAY);
    }

    public register_new_player(): Promise<void> {
        return this.response(() => {
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
            // This is one difference vs the on-chain version so we can test effect triggers
            for (let i = 0; i < 20; ++i) {
                this.givePlayerRandomAbility(BigInt(1));
            }
        });
    }

    public start_new_battle(loadout: PlayerLoadout, level: Level): Promise<BattleConfig> {
        return this.response(() => {
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
            this.mockState.activeBattleStates.set(id, pureCircuits.init_battlestate(BigInt(Phaser.Math.Between(0, 255)), battle));
            this.mockState.activeBattleConfigs.set(id, battle);
            return battle;
        });
    }

    public async combat_round(battle_id: bigint, ability_targets: [bigint, bigint, bigint]): Promise<BattleRewards | undefined> {
        return await this.response(async () => {
            const targetsUnwrapped = ability_targets.map(t => Number(t));

            return combat_round_logic(battle_id, this.mockState, targetsUnwrapped).then((ret) => {
                const battleState = this.mockState.activeBattleStates.get(battle_id)!;
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
                if (ret != undefined) {
                    this.addRewards(ret);
                    // Check if this was a boss battle and mark completion
                    const battleConfig = this.mockState.activeBattleConfigs.get(battle_id);
                    if (battleConfig && ret.alive && battleConfig.enemies.stats[0].boss_type === BOSS_TYPE.boss) {
                        const biome = battleConfig.level.biome;
                        const difficulty = battleConfig.level.difficulty;
                        if (!this.playerBossProgress.has(biome)) {
                            this.playerBossProgress.set(biome, new Map());
                        }
                        this.playerBossProgress.get(biome)!.set(difficulty, true);
                    }
                    this.mockState.activeBattleConfigs.delete(battle_id);
                    this.mockState.activeBattleStates.delete(battle_id);
                }
                return ret;
            });
        });
    }

    public start_new_quest(loadout: PlayerLoadout, level: Level): Promise<bigint> {
        return this.response(() => {
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

                const battle_config = {
                    level: quest.level,
                    enemies: this.mockState.bosses.get(quest.level.biome)!.get(quest.level.difficulty)!,
                    player_pub_key: MOCK_PLAYER_ID,
                    loadout: quest.loadout,
                };

                const battleId = pureCircuits.derive_battle_id(battle_config);

                this.mockState.activeBattleStates.set(battleId, {
                    deck_indices: [BigInt(0), BigInt(1), BigInt(2)],
                    player_hp: BigInt(100),
                    enemy_hp_0: battle_config.enemies.stats[0].hp,
                    enemy_hp_1: battle_config.enemies.stats[1].hp,
                    enemy_hp_2: battle_config.enemies.stats[2].hp,
                });
                this.mockState.activeBattleConfigs.set(battleId, battle_config);

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

    public async admin_level_new(level: Level, boss: EnemiesConfig): Promise<void> {
        return this.response(() => {
            let bossesByBiome = this.mockState.bosses.get(level.biome);
            if (bossesByBiome == undefined) {
                bossesByBiome = new Map();
                this.mockState.bosses.set(level.biome, bossesByBiome);
            }
            bossesByBiome.set(level.difficulty, boss);
        }, 10);
    }

    public async admin_level_add_config(level: Level, enemies: EnemiesConfig): Promise<void> {
        return this.response(() => {
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
        }, 10);
    }

    public async is_boss_completed(biome: bigint, difficulty: bigint): Promise<boolean> {
        return this.response(() => {
            const biomeProgress = this.playerBossProgress.get(biome);
            if (!biomeProgress) {
                return false;
            }
            return biomeProgress.get(difficulty) ?? false;
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
        const ability = pureCircuits.random_ability(Array.from(randomBytes(32)).map(BigInt), difficulty);
        const abilityId = pureCircuits.derive_ability_id(ability);
        this.mockState.allAbilities.set(abilityId, ability);
        this.mockState.playerAbilities.set(abilityId, (this.mockState.playerAbilities.get(abilityId) ?? BigInt(0)) + BigInt(1));
        return abilityId;
    }

    private response<T>(body: () => T, delay: number = MOCK_DELAY): Promise<T> {
        return new Promise((resolve, reject) => setTimeout(() => {
            try {
                const ret = body();
                resolve(ret);
            } catch (e) {
                reject(e);
            }
            setTimeout(() => {
                this.subscriber?.next(this.mockState);
            }, delay);
        }, delay));
    }
}
