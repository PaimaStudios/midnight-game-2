import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { BattleConfig, BattleRewards, EFFECT_TYPE, PlayerLoadout, pureCircuits } from "game2-contract";
import { Observable, Subscriber } from "rxjs";
import { combat_round_logic } from "./battle/logic";

const MOCK_DELAY = 500;
export const MOCK_PLAYER_ID = BigInt(0);

export const OFFLINE_PRACTICE_CONTRACT_ADDR = 'OFFLINE_PRACTICE_CONTRACT_ADDR';

export class MockGame2API implements DeployedGame2API {
    readonly deployedContractAddress: ContractAddress;
    readonly state$: Observable<Game2DerivedState>;
    subscriber: Subscriber<Game2DerivedState> | undefined;
    mockState: Game2DerivedState;

    constructor() {
        this.deployedContractAddress = OFFLINE_PRACTICE_CONTRACT_ADDR;
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
            for (let i = 0; i < 10; ++i) {
                this.givePlayerRandomAbility(BigInt(1));
            }
        });
    }

    public start_new_battle(loadout: PlayerLoadout): Promise<BattleConfig> {
        return this.response(() => {
            console.log(`from ${this.mockState.activeBattleConfigs.size}`);
            const battle = {
                stats: [
                    { hp: BigInt(30), attack: BigInt(5), block: BigInt(0), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5) },
                    { hp: BigInt(25), attack: BigInt(3), block: BigInt(2), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5) },
                    { hp: BigInt(15), attack: BigInt(4), block: BigInt(4), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5) }
                ],
                enemy_count: BigInt(3),
                player_pub_key: MOCK_PLAYER_ID,
                loadout,
            };
            const id = pureCircuits.derive_battle_id(battle);
            console.log(`new battle: ${id}`);
            this.mockState.activeBattleStates.set(id, {
                deck_indices: [BigInt(0), BigInt(1), BigInt(2)],
                player_hp: BigInt(100),
                enemy_hp_0: battle.stats[0].hp,
                enemy_hp_1: battle.stats[1].hp,
                enemy_hp_2: battle.stats[2].hp,
            });
            this.mockState.activeBattleConfigs.set(id, battle);
            console.log(` to ${this.mockState.activeBattleConfigs.size}`);
            console.log(`start new battle - state is now: ${safeJSONString(this.mockState)} | `);
            return battle;
        });
    }

    public combat_round(battle_id: bigint): Promise<BattleRewards | undefined> {
        console.log(` round size: ${this.mockState.activeBattleConfigs.size} for id ${battle_id}`);
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
            setTimeout(() => {
                this.subscriber?.next(this.mockState);
            }, MOCK_DELAY);
            return ret;
        });
    }

    public start_new_quest(loadout: PlayerLoadout, difficulty: bigint): Promise<bigint> {
        return this.response(() => {
            const quest = {
                player_pub_key: MOCK_PLAYER_ID,
                loadout,
                difficulty,
            };
            const questId = pureCircuits.derive_quest_id(quest);
            this.mockState.quests.set(questId, quest);
            return questId;
        });
    }

    public finalize_quest(quest_id: bigint): Promise<BattleRewards | undefined> {
        return this.response(() => {
            if (Math.random() > 0.5) {
                const quest = this.mockState.quests.get(quest_id)!;
                this.mockState.quests.delete(quest_id);

                
                const reward: BattleRewards = {
                    alive: true,
                    gold: BigInt(500) + quest.difficulty * BigInt(100),
                    ability: { is_some: true, value: this.givePlayerRandomAbility(quest.difficulty) },
                };
                this.addRewards(reward);
                return reward;
            }
            return undefined;
        });
    }


    private addRewards(rewards: BattleRewards) {
        this.mockState.player!.gold += rewards.gold;
    }

    private givePlayerRandomAbility(difficulty: bigint): bigint {
        const nullEffect = { is_some: false, value: { effect_type: EFFECT_TYPE.attack_phys, amount: BigInt(1), is_aoe: false } };
        const randomEffect = (factor: number, canBeGenerate: boolean) => {
            const effectType = Phaser.Math.Between(0, canBeGenerate ? 4 : 3) as EFFECT_TYPE;
            const aoe = effectType != EFFECT_TYPE.block && effectType != EFFECT_TYPE.generate ? Math.random() > 0.7 : false;
            return {
                is_some: true,
                value: {
                    effect_type: effectType,
                    amount: BigInt(effectType == EFFECT_TYPE.generate ? Phaser.Math.Between(0, 2) : Phaser.Math.Between(factor * Number(difficulty), 2 * factor * Number(difficulty))),
                    is_aoe: aoe
                }
            };
        };
        const triggers = [nullEffect, nullEffect, nullEffect];
        const color = Phaser.Math.Between(0, 5);
        if (color < triggers.length) {
            // triggers[0] = randomEffect(2);
            // triggers[1] = randomEffect(2);
            // triggers[2] = randomEffect(2);
            if (Math.random() > 0.7) {
                for (let i = 0; i < 3; ++i) {
                    if (i != color) {
                        triggers[i] = randomEffect(1, false);
                    }
                }
            } else {
                triggers[color] = randomEffect(2, false);
            }
        }
        const ability = {
            effect: randomEffect(color < triggers.length ? 1 : 2, true),
            on_energy: triggers,
        };
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
                this.subscriber?.next(this.mockState);
            }, MOCK_DELAY);
        }, MOCK_DELAY));
    }
}
