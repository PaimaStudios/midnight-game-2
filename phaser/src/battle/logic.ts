import { call } from "@midnight-ntwrk/midnight-js-contracts";
import { Game2DerivedState, safeJSONString } from "game2-api";
import { Ability, BattleRewards, Effect, EFFECT_TYPE, Game2PrivateState, pureCircuits } from "game2-contract";

export type CombatCallbacks = {
    onEnemyBlock: (enemy: number, amount: number) => Promise<void>;
    onEnemyAttack: (enemy: number, amount: number) => Promise<void>;
    onPlayerEffect: (target: number, effectType: EFFECT_TYPE, amount: number) => Promise<void>;
    onPlayerAbilities: (abilities: Ability[]) => Promise<void>;
};

// we need to sync this with the contract's RNG indexing once that's possible
function randIntBetween(nonce: Uint8Array, index: number, min: number, max: number): number {
    const range = BigInt(max - min + 1);
    const rng = pureCircuits.hashUtil(nonce, BigInt(index));
    return min + Number(rng % range);
}

/**
 * Runs a simulation of the combat round lgoic found in the combat_round() circuit.
 * 
 * @param battle_id Battle to be simulated. Looked up into gameState
 * @param gameState Current game's state. This is both input and output. Modified during execution.
 * @param uiHooks Optional callbacks that can hook into UI animations when calling this for frontend simulation.
 * @returns Rewards from the battle if it is completed (all enemies died or player died). or undefined if it remains in progress
 */
export function combat_round_logic(battle_id: bigint, gameState: Game2DerivedState, uiHooks?: CombatCallbacks): Promise<BattleRewards | undefined> {
    return new Promise(async (resolve) => {
        console.log(`combat_round_logc(${safeJSONString(gameState)}, ${uiHooks == undefined})`);
        const battleConfig = gameState.activeBattleConfigs.get(battle_id)!;
        const battleState = gameState.activeBattleStates.get(battle_id)!;
        const rng = pureCircuits.fakeTempRng(battleState, battleConfig);
        if (uiHooks != undefined) {
            gameState.ui = true;
        } else {
            gameState.circuit = true;
        }

        const abilities = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);

        let player_block = BigInt(0);
        let player_damage = [BigInt(0), BigInt(0), BigInt(0)];
        let energy = [false, false, false];

        // enemy damage
        let enemy_damage = BigInt(0);
        const enemy_hp = [battleState.enemy_hp_0, battleState.enemy_hp_1, battleState.enemy_hp_2];
        for (let i = 0; i < battleConfig.enemy_count; ++i) {
            if (enemy_hp[i] > 0) {
                // do not change vars for block since it's directly checked during player against enemy damage code
                const block = Number(battleConfig.stats[i].block);
                if (block != 0) {
                    await uiHooks?.onEnemyBlock(i, block);
                }
            }
        }

        const resolveEffect = async (effect: { is_some: boolean, value: Effect }, target: number) => {
            for (let enemy = 0; enemy < 3; ++enemy) {
                if (effect.is_some && (effect.value.is_aoe || target == enemy)) {
                    switch (effect.value.effect_type) {
                        case EFFECT_TYPE.attack_fire:
                        case EFFECT_TYPE.attack_ice:
                        case EFFECT_TYPE.attack_phys:
                            const dmg = pureCircuits.effect_damage(effect.value, battleConfig.stats[enemy]);
                            await uiHooks?.onPlayerEffect(enemy, effect.value.effect_type, Number(dmg));
                            player_damage[enemy] += dmg;
                            break;
                        case EFFECT_TYPE.block:
                            await uiHooks?.onPlayerEffect(enemy, effect.value.effect_type, Number(effect.value.amount));
                            player_block += effect.value.amount;
                            break;
                        case EFFECT_TYPE.generate:
                            await uiHooks?.onPlayerEffect(enemy, effect.value.effect_type, Number(effect.value.amount));
                            energy[Number(effect.value.amount)] = true;
                            break;
                    }
                }
            }
        };

        await uiHooks?.onPlayerAbilities(abilities.map((id) => gameState.allAbilities.get(id)!));

        // TODO: don't target dead enemies
        const targets = abilities.map((_, i) => randIntBetween(rng, i, 0, Number(battleConfig.enemy_count) - 1));
        // TODO: when you have internet check if you can do this with forEach but chaining promises one after the other
        for (let i = 0; i < abilities.length; ++i) {
            const ability = gameState.allAbilities.get(abilities[i])!;
            await resolveEffect(ability.effect, targets[i]);
        }
        for (let i = 0; i < 3; ++i) {
            for (let j = 0; j < abilities.length; ++j) {
                if (energy[i]) {
                    await resolveEffect(gameState.allAbilities.get(abilities[j])!.on_energy[i], targets[j]);
                }
            }
        }
        // energy.forEach(async (energy, i) => {
        //     if (energy) {
        //         abilities.forEach(async (ability, j) => {
        //             await resolveEffect(ability.on_energy[i], targets[j]);
        //         });
        //     }
        // });

        // enemy damage
        for (let i = 0; i < battleConfig.enemy_count; ++i) {
            if (enemy_hp[i] > 0) {
                const damage = battleConfig.stats[i].attack;
                 enemy_damage += damage;
                if (Number(damage) != 0) {
                    await uiHooks?.onEnemyAttack(i, Number(damage));
                }
            }
        }

        if (enemy_damage > player_block) {
            battleState.player_hp -= enemy_damage - player_block;
        }
        if (player_damage[0] > battleConfig.stats[0].block) {
            battleState.enemy_hp_0 = BigInt(Math.max(0, Number(battleState.enemy_hp_0 + battleConfig.stats[0].block - player_damage[0])));
        }
        if (player_damage[1] > battleConfig.stats[1].block) {
            battleState.enemy_hp_1 = BigInt(Math.max(0, Number(battleState.enemy_hp_1 + battleConfig.stats[1].block - player_damage[1])));
        }
        if (player_damage[2] > battleConfig.stats[2].block) {
            battleState.enemy_hp_2 = BigInt(Math.max(0, Number(battleState.enemy_hp_2 + battleConfig.stats[2].block - player_damage[2])));
        }
        console.log(`Player HP ${battleState.player_hp} | Enemy HP: ${battleState.enemy_hp_0} / ${battleState.enemy_hp_1} / ${battleState.enemy_hp_2}`);
        if (battleState.player_hp <= 0) {
            console.log(`YOU DIED`);
            resolve({ alive: false, gold: BigInt(0), ability: { is_some: false, value: BigInt(0) } });
        }
        else if (battleState.enemy_hp_0 <= 0 && battleState.enemy_hp_1 <= 0 && battleState.enemy_hp_2 <= 0) {
            console.log(`YOU WON`);
            // TODO how to determine rewards?
            resolve({ alive: true, gold: BigInt(randIntBetween(rng, 1000, 50, 200)), ability: { is_some: false, value: BigInt(0) } });
        } else {
            console.log(`CONTINUE BATTLE`);
            resolve(undefined);
        }
        console.log(`end state[${uiHooks == undefined}]: ${safeJSONString(gameState)}`);
    });
}