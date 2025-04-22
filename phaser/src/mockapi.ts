import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { BattleConfig, BattleRewards, PlayerLoadout, pureCircuits } from "game2-contract";
import { Observable, Subscriber } from "rxjs";

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
            enemy_damage: [],
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
                stats: [{hp: BigInt(100), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5)}, {hp: BigInt(100), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5)}, {hp: BigInt(100), physical_def: BigInt(5), fire_def: BigInt(5), ice_def: BigInt(5)}],
                enemy_count: BigInt(3),
                player_pub_key: BigInt(0),
                loadout,
            };
            const id = pureCircuits.derive_battle_id(battle);
            this.mockState.activeBattleStates.set(id, {
                deck_i: BigInt(0),
                deck_map: [BigInt(0), BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5), BigInt(6)],
                player_hp_0: BigInt(100),
                player_hp_1: BigInt(100),
                player_hp_2: BigInt(100),
                enemy_hp_0: BigInt(100),
                enemy_hp_1: BigInt(100),
                enemy_hp_2: BigInt(100),
            })
            resolve(battle);
        }, MOCK_DELAY));
    }

    public combat_round(battle_id: bigint): Promise<BattleRewards | undefined> {
        return new Promise((resolve) => setTimeout(() => {
            // TODO: combat
            this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_0 -= BigInt(Phaser.Math.Between(3, 10));
            this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_1 -= BigInt(Phaser.Math.Between(3, 10));
            this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_2 -= BigInt(Phaser.Math.Between(3, 10));
            this.mockState.activeBattleStates.get(battle_id)!.player_hp_0 -= BigInt(Phaser.Math.Between(1, 5));
            if (this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_0 <= 0 || this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_1 <= 0 || this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_2 <= 0) {
                resolve({ gold: BigInt(Phaser.Math.Between(3, 10)) });
            }
            resolve(undefined);
        }, MOCK_DELAY));
    }
}