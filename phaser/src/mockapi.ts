import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Ability, BattleConfig, BattleRewards, Effect, EFFECT_TYPE, PlayerLoadout, pureCircuits } from "game2-contract";
import { Observable, Subscriber } from "rxjs";
import { combat_round_logic } from "./battle/logic";

const MOCK_DELAY = 500;
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
            players: new Map(),
        };
        setTimeout(() => {
            this.subscriber?.next(this.mockState);
        }, MOCK_DELAY);
    }

    public start_new_battle(loadout: PlayerLoadout): Promise<BattleConfig> {
        return new Promise((resolve) => setTimeout(() => {
            const battle = {
                stats: [
                    {hp: BigInt(30), attack: BigInt(5), block: BigInt(0), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5)},
                    {hp: BigInt(25), attack: BigInt(3), block: BigInt(2), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5)},
                    {hp: BigInt(15), attack: BigInt(4), block: BigInt(4), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5)}
                ],
                enemy_count: BigInt(3),
                player_pub_key: BigInt(0),
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
            setTimeout(() => {
                this.subscriber?.next(this.mockState);
            }, MOCK_DELAY);
            resolve(battle);
        }, MOCK_DELAY));
    }

    public combat_round(battle_id: bigint): Promise<BattleRewards | undefined> {
        return combat_round_logic(battle_id, this.mockState, undefined).then((ret) => {
            setTimeout(() => {
                this.subscriber?.next(this.mockState);
            }, MOCK_DELAY);
            return ret;
        });
    }
}