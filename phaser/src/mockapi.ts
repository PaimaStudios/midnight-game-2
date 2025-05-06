import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { Ability, BattleConfig, BattleRewards, Effect, EFFECT_TYPE, PlayerLoadout, pureCircuits } from "game2-contract";
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
            quests: new Map(),
            players: new Map(),
            ui: undefined,
            circuit: undefined
        };
        setTimeout(() => {
            this.subscriber?.next(this.mockState);
        }, MOCK_DELAY);
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
                deck_i: BigInt(0),
                deck_map: [BigInt(0), BigInt(1), BigInt(2), BigInt(3), BigInt(4)],
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
            if (ret != undefined) {
                this.addRewards(MOCK_PLAYER_ID, ret);
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
                const reward = {
                    alive: true,
                    gold: BigInt(500) + quest.difficulty * BigInt(100),
                };
                this.addRewards(MOCK_PLAYER_ID, reward);
                return reward;
            }
            return undefined;
        });
    }


    private addRewards(playerId: bigint, rewards: BattleRewards) {
        const oldGold = this.mockState.players.get(playerId)?.gold ?? BigInt(0);
        this.mockState.players.set(playerId, {
            gold: oldGold + rewards.gold,
        });
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
