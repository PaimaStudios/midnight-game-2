import { Game2DerivedState, safeJSONString } from "game2-api";
import { Ability, BattleRewards, Effect, EFFECT_TYPE, BOSS_TYPE, pureCircuits } from "game2-contract";
import { logger } from '../main';

export type CombatCallbacks = {
    // triggered when an enemy blocks. enemy is the enemy that blocks
    onEnemyBlock: (enemy: number, amount: number) => Promise<void>;
    // triggered when an enemy attacks. there are no enemy attack types (atm) and enemy is which enemy attacks (since only 1 player)
    onEnemyAttack: (enemy: number, amount: number) => Promise<void>;
    // triggered when a player's ability causes an effect (directly or via trigger)
    // reminder: `amount` is the color for EFFECT_TYPE.generate (range [0, 2])
    onPlayerEffect: (source: number, targets: number[], effectType: EFFECT_TYPE, amounts: number[], baseAmounts?: number[]) => Promise<void>;
    // triggered at the start of a round to show which abilities are being played this round
    onDrawAbilities: (abilities: Ability[]) => Promise<void>;
    // triggered when an ability is used. energy == undefined means base effect applying, otherwise it specifies which trigger is being applied
    onUseAbility: (abilityIndex: number, energy?: number) => Promise<void>;
    // triggered after an ability has been used (e.g. to re-tween back)
    afterUseAbility: (abilityIndex: number) => Promise<void>;
    // triggered before all energy triggers of a given color will be applied
    onEnergyTrigger: (source: number, color: number) => Promise<void>;
    // triggered at the end of the round during final damage application
    onEndOfRound: () => Promise<void>;
};

/**
 * Combat round logic that accepts specific player targets
 * @param battle_id Battle to be simulated. This is looked up int gameState so the battle must have been created first
 * @param gameState Current game's state. This is both input and output. Modified during execution.
 * @param playerTargets Player-selected targets for each spirit. This is an array of numbers, where each number corresponds to the enemy index (0, 1, 2) that the spirit will target.
 * @param uiHooks Optional callbacks that can hook into UI animations when calling this for frontend simulation.
 * @returns Rewards from the battle if it is completed (all enemies died or player died). or undefined if it remains in progress
 */
export function combat_round_logic(battle_id: bigint, gameState: Game2DerivedState, abilityTargets: number[], uiHooks?: CombatCallbacks): Promise<BattleRewards | undefined> {
    return new Promise(async (resolve) => {
        logger.combat.debug(`combat_round_logic(${abilityTargets}, ${uiHooks == undefined})`);
        const battleConfig = gameState.activeBattleConfigs.get(battle_id)!;
        const battleState = gameState.activeBattleStates.get(battle_id)!;

        const abilityIds = battleState.deck_indices.map((i) => battleConfig.loadout.abilities[Number(i)]);
        const abilities = abilityIds.map((id) => gameState.allAbilities.get(id)!)

        let player_block = BigInt(0);
        const stats = battleConfig.enemies.stats;
        const enemy_count = Number(battleConfig.enemies.count);
        let player_damage = new Array(enemy_count).fill(BigInt(0));
        let enemy_damage = BigInt(0);

        const handleEndOfRound = () => {
            uiHooks?.onEndOfRound();
            if (enemy_damage > player_block) {
                battleState.player_hp -= enemy_damage - player_block;
            }
            if (player_damage[0] > stats[0].block) {
                battleState.enemy_hp_0 = BigInt(Math.max(0, Number(battleState.enemy_hp_0 + stats[0].block - player_damage[0])));
            }
            if (player_damage[1] > stats[1].block) {
                battleState.enemy_hp_1 = BigInt(Math.max(0, Number(battleState.enemy_hp_1 + stats[1].block - player_damage[1])));
            }
            if (player_damage[2] > stats[2].block) {
                battleState.enemy_hp_2 = BigInt(Math.max(0, Number(battleState.enemy_hp_2 + stats[2].block - player_damage[2])));
            }
            if (battleState.player_hp <= 0) {
                logger.combat.info(`YOU DIED`);
                resolve({ alive: false, gold: BigInt(0), ability: { is_some: false, value: BigInt(0) } });
            }
            else if (battleState.enemy_hp_0 <= 0 && (battleState.enemy_hp_1 <= 0 || enemy_count < 2) && (battleState.enemy_hp_2 <= 0 || enemy_count < 3)) {
                logger.combat.info(`YOU WON`);
                let abilityReward = { is_some: false, value: BigInt(0) };
                let reward_factor = BigInt(0);
                for (let i = 0; i < enemy_count; ++i) {
                    reward_factor += pureCircuits.boss_type_reward_factor(stats[i].boss_type);
                }
                if (reward_factor > 0) {
                    const ability = pureCircuits.random_ability(Array.from(gameState.player!.rng).map(BigInt), battleConfig.level.difficulty * reward_factor);
                    const abilityId = pureCircuits.derive_ability_id(ability);
                    // TODO: this really shouldn't be here, should it? but if we don't do that we need to return the entire ability in the contract
                    // if we don't return it, we need to match the logic here with the contract
                    gameState.allAbilities.set(abilityId, ability);
                    abilityReward.is_some = true;
                    abilityReward.value = abilityId;
                }
                resolve({ alive: true, gold: BigInt(100), ability: abilityReward });
            } else {
                logger.combat.info(`CONTINUE BATTLE`);
                resolve(undefined);
            }
        }

        await uiHooks?.onDrawAbilities(abilities);

        // Enemy block phase
        let enemy_hp = [battleState.enemy_hp_0, battleState.enemy_hp_1, battleState.enemy_hp_2];
        for (let i = 0; i < enemy_count; ++i) {
            if (enemy_hp[i] > 0) {
                // do not change vars for block since it's directly checked during player against enemy damage code
                const block = Number(stats[i].block);
                if (block != 0) {
                    await uiHooks?.onEnemyBlock(i, block);
                }
            }
        }

        const aliveTargets = new Array(enemy_count)
            .fill(0)
            .map((_, i) => i)
            .filter((i) => enemy_hp[i] > BigInt(0));

        // Player abilities with player-selected targets (key difference!)
        const resolveEffect = async (effect: { is_some: boolean, value: Effect }, source: number, target: number) => {
            if (effect.is_some) {
                const targets = effect.value.is_aoe ? aliveTargets : [target];
                switch (effect.value.effect_type) {
                    case EFFECT_TYPE.attack_fire:
                    case EFFECT_TYPE.attack_ice:
                    case EFFECT_TYPE.attack_phys:
                        const amounts = targets.map((enemy) => {
                            const dmg = pureCircuits.effect_damage(effect.value, stats[enemy]);
                            player_damage[enemy] += dmg;
                            return Number(dmg)
                        });
                        const baseAmounts = targets.map(() => Number(effect.value.amount));
                        await uiHooks?.onPlayerEffect(source, targets, effect.value.effect_type, amounts, baseAmounts);
                        break;
                    case EFFECT_TYPE.block:
                        await uiHooks?.onPlayerEffect(source, targets, effect.value.effect_type, [Number(effect.value.amount)]);
                        player_block += effect.value.amount;
                        break;
                }
            }
        };

        // base effects
        const allEnemiesDead = () => {
            return (player_damage[0] > stats[0].block + battleState.enemy_hp_0)
                && (player_damage[1] > stats[1].block + battleState.enemy_hp_1 || enemy_count < 2)
                && (player_damage[2] > stats[2].block + battleState.enemy_hp_2 || enemy_count < 3);
        };
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            await uiHooks?.onUseAbility(i, undefined);
            if (ability.generate_color.is_some) {
                await uiHooks?.onEnergyTrigger(i, Number(ability.generate_color.value));
            }
            await resolveEffect(ability.effect, i, abilityTargets[i]);
            await uiHooks?.afterUseAbility(i);
            if (allEnemiesDead()) {
                logger.combat.debug(`[${uiHooks == undefined}] prematurely ending`);
                return handleEndOfRound();
            }
        }
        
        // energy triggers
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            for (let c = 0; c < 3; ++c) {
                if (ability.on_energy[c].is_some && abilities.some((a2, j) => i != j && a2.generate_color.is_some && Number(a2.generate_color.value) == c)) {
                    await uiHooks?.onUseAbility(i, c);
                    await resolveEffect(ability.on_energy[c], i, abilityTargets[i]); // Use same target as base effect
                    await uiHooks?.afterUseAbility(i);
                    if (allEnemiesDead()) {
                        logger.combat.debug(`[${uiHooks == undefined}] prematurely ending`);
                        return handleEndOfRound();
                    }
                }
            }
        }

      
        // Enemy damage phase
        for (let i = 0; i < enemy_count; ++i) {
            if (enemy_hp[i] > 0) {
                const damage = stats[i].attack;
                 enemy_damage += damage;
                if (Number(damage) != 0) {
                    await uiHooks?.onEnemyAttack(i, Number(damage));
                }
            }
        }

        handleEndOfRound();
    });
}
