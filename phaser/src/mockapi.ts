import { ContractAddress } from "@midnight-ntwrk/ledger";
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Ability, BattleConfig, BattleRewards, Effect, EFFECT_TYPE, PlayerLoadout, pureCircuits } from "game2-contract";
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
        return new Promise((resolve) => setTimeout(() => {
            // TODO: combat
            const config = this.mockState.activeBattleConfigs.get(battle_id)!;
            const state = this.mockState.activeBattleStates.get(battle_id)!;

            const draw = (): Ability => {
                state.deck_i += BigInt(1);
                if (state.deck_i == BigInt(5)) {
                    state.deck_i = BigInt(0);
                    for (let i = state.deck_map.length - 1; i > 0; --i) {
                        const j = Phaser.Math.Between(0, i);
                        const temp = state.deck_map[i];
                        state.deck_map[i] = state.deck_map[j];
                        state.deck_map[j] = temp;
                    }
                }
                return config.loadout.abilities[Number(state.deck_map[Number(state.deck_i)])];
            };

            const abilities = [draw(), draw(), draw()];

            let player_block = BigInt(0);
            let player_damage = [BigInt(0), BigInt(0), BigInt(0)];
            let energy = [false, false, false];

            let enemy_damage = BigInt(0);
            const enemy_hp = [state.enemy_hp_0, state.enemy_hp_1, state.enemy_hp_2];
            for (let i = 0; i < config.enemy_count; ++i) {
                if (enemy_hp[i] > 0) {
                    enemy_damage += config.stats[i].attack;
                }
            }

            const resolveEffect = (effect: { is_some: boolean, value: Effect }, target: number) => {
                for (let enemy = 0; enemy < 3; ++enemy) {
                    if (effect.is_some && (effect.value.is_aoe || target == enemy)) {
                        switch (effect.value.effect_type) {
                            case EFFECT_TYPE.attack_fire:
                            case EFFECT_TYPE.attack_ice:
                            case EFFECT_TYPE.attack_phys:
                                const dmg = pureCircuits.effect_damage(effect.value, config.stats[enemy]);
                                player_damage[enemy] += dmg;
                                break;
                            case EFFECT_TYPE.block:
                                player_block += effect.value.amount;
                                break;
                            case EFFECT_TYPE.generate:
                                energy[Number(effect.value.amount)] = true;
                                break;
                        }
                    }
                }
            };

            // TODO: don't target dead enemies
            const targets = abilities.map(() => Phaser.Math.Between(0, Number(config.enemy_count) - 1))
            abilities.forEach((ability, i) => {
                resolveEffect(ability.effect, targets[i]);
            });
            energy.forEach((energy, i) => {
                if (energy) {
                    abilities.forEach((ability, j) => {
                        resolveEffect(ability.on_energy[i], targets[j]);
                    });
                }
            });

            
            if (enemy_damage > player_block) {
                state.player_hp -= enemy_damage - player_block;
            }
            if (player_damage[0] > config.stats[0].block) {
                state.enemy_hp_0 = BigInt(Math.max(0, Number(state.enemy_hp_0 + config.stats[0].block - player_damage[0])));
            }
            if (player_damage[1] > config.stats[1].block) {
                state.enemy_hp_1 = BigInt(Math.max(0, Number(state.enemy_hp_1 + config.stats[1].block - player_damage[1])));
            }
            if (player_damage[2] > config.stats[2].block) {
                state.enemy_hp_2 = BigInt(Math.max(0, Number(state.enemy_hp_2 + config.stats[2].block - player_damage[2])));
            }
            if (this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_0 <= 0 || this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_1 <= 0 || this.mockState.activeBattleStates.get(battle_id)!.enemy_hp_2 <= 0) {
                // TODO how to determine rewards?
                resolve({ gold: BigInt(Phaser.Math.Between(3, 10)) });
            }
            setTimeout(() => {
                this.subscriber?.next(this.mockState);
            }, MOCK_DELAY);
            resolve(undefined);
        }, MOCK_DELAY));
    }
}