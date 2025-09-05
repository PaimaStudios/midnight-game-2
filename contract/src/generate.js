/**
 * Code generation for the game's contract.
 * 
 * Many parts of combat code would be incredibly tedious and error-prone to hand-write.
 * Instead of several 3000 character lines with only different variable names or array indices
 * we generate that code here and replace the placeholder strings in the contract.
 */

import fs from 'fs';

function codegen_placeholders() {
    let templateCode = fs.readFileSync('src/template.compact').toString();
    const replaced = templateCode
        .replaceAll('INSERT_PLAYER_DAMAGE_CODE_HERE', gen_player_dmg())
        .replaceAll('INSERT_PLAYER_BLOCK_CODE_HERE', gen_player_block())
        .replaceAll('INSERT_ENEMY_DAMAGE_CODE_HERE', gen_enemy_dmg())
        .replaceAll('INSERT_ENEMY_BLOCK_CODE_HERE', gen_enemy_block())
        .replaceAll('INSERT_DECK_INDEX_CALCULATION_CODE_HERE', gen_deck_index_calculation())
        .replaceAll('INSERT_DECK_INDEX_BATTLE_STATE_INIT_CODE_HERE', gen_deck_index_eval())
        .replaceAll('INSERT_RNG_MOD_CIRCUIT_HERE', gen_rng_mod_circuits())
        .replaceAll('INSERT_MAX_RNG_MOD_DEFS', MAX_RNG_MOD_DEFS.toString())
        .replaceAll('INSERT_RNG_MOD_INPUT_TYPE', `Uint<0..${MAX_RNG_MOD_DEFS}>`);
    fs.writeFileSync('src/game2.compact', `// AUTO-GENERATED - **DO NOT MODIFY**\n// PLEASE CHANGE template.compact INSTEAD!\n\n${replaced}`);
}



const DECK_SIZE = 7;
const HAND_SIZE = 3;
// we don't generate all 256 because this bloats it too much. we can change this later if needed
const MAX_RNG_MOD_DEFS = 64; // TODO: try and reduce this as much as you can because it bloats circuit sizes to a ridiculous size

const abilities = new Array(HAND_SIZE).fill(0).map((_, i) => i);
const colors = [0, 1, 2];
const max_enemies = [0, 1, 2];
const decK_increments = [1, 2, 3, 4];



// player

const gen_player_dmg = () => max_enemies.map((enemy) => `const player_damage_${enemy} = (${gen_base_player_dmg(enemy)} + ${gen_energy_player_dmg(enemy)}) as Uint<32>;`).join('\n    ');

const gen_base_player_dmg = (enemy) => abilities.map((a) => `((abilities[${a}].effect.is_some && (abilities[${a}].effect.value.is_aoe || ability_targets[${a}] == ${enemy})) as Uint<1>) * effect_damage(abilities[${a}].effect.value, battle.enemies.stats[${enemy}])`).join(' + ');
const gen_energy_player_dmg = (enemy) => abilities.map((a) => colors.map((c) => `((abilities[${a}].on_energy[${c}].is_some && ${generates_color(a, c)} && (abilities[${a}].on_energy[${c}].value.is_aoe || ability_targets[${a}] == ${enemy})) as Uint<1>) * effect_damage(abilities[${a}].on_energy[${c}].value, battle.enemies.stats[${enemy}])`).join(' + ')).join(' + ');

const gen_player_block = () => `const player_block = (${gen_base_player_block()} + ${gen_energy_player_block()}) as Uint<32>;`;

const gen_base_player_block = () => abilities.map((a) => `((abilities[${a}].effect.is_some as Uint<1>) * ((abilities[${a}].effect.value.effect_type == EFFECT_TYPE.block) as Uint<1>) * abilities[${a}].effect.value.amount)`).join(' + ');
const gen_energy_player_block = () => abilities.map((a) => colors.map((c) => `(((abilities[${a}].on_energy[${c}].is_some && ${generates_color(a, c)}) as Uint<1>) * ((abilities[${a}].on_energy[${c}].value.effect_type == EFFECT_TYPE.block) as Uint<1>) * abilities[${a}].on_energy[${c}].value.amount)`).join(' + ')).join(' + ');

const generates_color = (a, c) => `(${abilities.filter((a2) => a != a2).map((a2) => `(abilities[${a2}].generate_color.is_some && abilities[${a2}].generate_color.value == ${c})`).join(' || ')})`;



// enemy

const gen_enemy_dmg = () => `const enemy_damage = (${max_enemies.map((enemy) => `(battle.enemies.stats[${enemy}].attack * ((new_enemy_dmg_${enemy} > 0) as Uint<1>))`).join(' + ')}) as Uint<32>;`;

const gen_enemy_block = () => max_enemies.map((enemy) => `const enemy_block_${enemy} = battle.enemies.stats[${enemy}].block as Uint<32>;`).join('\n    ');



// deck indices

const gen_deck_index_calculation = () => abilities.map((a) => {
    let code = '';
    const line = (s) => {
        code += `\n    ${s}`;
    };
    const attempts = (n) => n == 1 ? 1 : attempts(n - 1) + n;

    line(`const new_deck_${a}${a == 0 ? '' : '_attempt_0'} = add_mod(old_state.deck_indices[${a}], ${decK_increments[a]}, ${DECK_SIZE});`);
    let attempt = 1;
    // i = other ability
    // j = cycle through previous other abilities in case attempt i causes conflict with previous index j
    for (let i = 0; i < a; ++i) {
        line(`const new_deck_${a}${attempt == attempts(a) ? '' : `_attempt_${attempt}`} = new_deck_${a}_attempt_${attempt - 1} == new_deck_${i} ? add_mod(new_deck_${a}_attempt_${attempt - 1}, 1, 7) : new_deck_${a}_attempt_${attempt - 1};`);
        ++attempt;
        for (let j = 0; j < i; ++j) {
            line(`const new_deck_${a}${attempt == attempts(a) ? '' : `_attempt_${attempt}`} = new_deck_${a}_attempt_${attempt - 1} == new_deck_${j} ? add_mod(new_deck_${a}_attempt_${attempt - 1}, 1, 7) : new_deck_${a}_attempt_${attempt - 1};`);
            ++attempt;
        }
    }

    // 0,1,0
    // next:
    // 0,1,0,2,0,1
    // then:
    // 0,1,0,2,0,1,3,0,1,2

    return code;
}).join('\n    ');

const gen_deck_index_eval = () => `[${abilities.map((a) => `new_deck_${a}`).join()}]`;



// rng helpers
// until we get foreign field arithmetic we're stuck with this
const gen_rng_mod_circuit = (mod) => {
    const subtract_amount = mod;

    const repeated_subtract = `// repeated subtract\n    ${new Array(Math.floor(256 / subtract_amount)).fill(0).map((_, i) => `${i == 0 ? '' : 'else '}if (rng < ${subtract_amount * (i + 1)}) {\n        return rng${i == 0 ? `` : ` - ${subtract_amount * i}`};\n    }`).join(' ')}
    return rng - ${256 - mod};`;

    const buckets = `// buckets\n    ${new Array(mod - 1).fill(0).map((_, i) => `${i == 0 ? '' : 'else '}if (rng < ${Math.floor((i + 1) * (256 / mod))}) {\n        return ${i};\n    }`).join(' ')}
    return ${mod - 1};`;

    // see which approach generates the smaller circuit and use this
    return `pure circuit rng_mod_${mod}(rng: Uint<8>): Uint<8> {
    ${repeated_subtract.length < buckets.length ? repeated_subtract : buckets}
}`};

const gen_rng_mod_circuits = () => `pure circuit rng_mod(rng: Uint<8>, mod: Uint<0..${MAX_RNG_MOD_DEFS}>): Uint<8> {
    if (mod == 1) {
        return 0;
    } ${new Array(MAX_RNG_MOD_DEFS - 2).fill(0).map((_, i) => `else if (mod == ${i + 2}) {\n        return rng_mod_${i + 2}(rng);\n    }`).join(' ')}
    return rng_mod_${MAX_RNG_MOD_DEFS}(rng);
}

${new Array(MAX_RNG_MOD_DEFS - 1).fill(0).map((_, i) => gen_rng_mod_circuit(i + 2)).join('\n\n')}`;


codegen_placeholders();