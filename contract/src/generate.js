//const fs = require('fs');
import fs from 'fs';

function generate_resolve_abilities() {
    let templateCode = fs.readFileSync('src/template.compact').toString();
    const replaced = templateCode
        .replaceAll('INSERT_PLAYER_DAMAGE_CODE_HERE', gen_player_dmg())
        .replaceAll('INSERT_PLAYER_BLOCK_CODE_HERE', gen_player_block())
        .replaceAll('INSERT_ENEMY_DAMAGE_CODE_HERE', gen_enemy_dmg())
        .replaceAll('INSERT_ENEMY_BLOCK_CODE_HERE', gen_enemy_block());
    fs.writeFileSync('src/game2.compact', `// AUTO-GENERATED - **DO NOT MODIFY**\n// PLEASE CHANGE template.compact INSTEAD!\n\n${replaced}`);
}

const abilities = [0, 1, 2];
const colors = [0, 1, 2];
const max_enemies = [0, 1, 2];



// player

const gen_player_dmg = () => max_enemies.map((enemy) => `const player_damage_${enemy} = (${gen_base_player_dmg(enemy)} + ${gen_energy_player_dmg(enemy)}) as Uint<32>;`).join('\n    ');

const gen_base_player_dmg = (enemy) => abilities.map((a) => `((abilities[${a}].effect.is_some && (abilities[${a}].effect.value.is_aoe || target == ${enemy})) as Uint<1>) * effect_damage(abilities[${a}].effect.value, battle.stats[${enemy}])`).join(' + ');
const gen_energy_player_dmg = (enemy) => abilities.map((a) => colors.map((c) => `((abilities[${a}].on_energy[${c}].is_some && (abilities[${a}].on_energy[${c}].value.is_aoe || target == ${enemy})) as Uint<1>) * effect_damage(abilities[${a}].on_energy[${c}].value, battle.stats[${enemy}])`).join(' + ')).join(' + ');

const gen_player_block = () => `const player_block = (${gen_base_player_block()} + ${gen_energy_player_block()}) as Uint<32>;`;

const gen_base_player_block = () => abilities.map((a) => `((abilities[${a}].effect.is_some as Uint<1>) * ((abilities[${a}].effect.value.effect_type == EFFECT_TYPE.block) as Uint<1>) * abilities[${a}].effect.value.amount)`).join(' + ');
const gen_energy_player_block = () => abilities.map((a) => colors.map((c) => `((abilities[${a}].on_energy[${c}].is_some as Uint<1>) * ((abilities[${a}].on_energy[${c}].value.effect_type == EFFECT_TYPE.block) as Uint<1>) * abilities[${a}].on_energy[${c}].value.amount)`).join(' + ')).join(' + ');



// enemy

const gen_enemy_dmg = () => `const enemy_damage = (${max_enemies.map((enemy) => `battle.stats[${enemy}].attack`).join(' + ')}) as Uint<32>;`;

const gen_enemy_block = () => max_enemies.map((enemy) => `const enemy_block_${enemy} = battle.stats[${enemy}].block as Uint<32>;`).join('\n    ');



generate_resolve_abilities();