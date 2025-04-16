//const fs = require('fs');
import fs from 'fs';

function generate_resolve_abilities() {
    let templateCode = fs.readFileSync('src/template.compact').toString();
    const replaced = templateCode
        .replaceAll('INSERT_PLAYER_DAMAGE_CODE_HERE', gen_all_dmg())
        .replaceAll('INSERT_PLAYER_BLOCK_CODE_HERE', gen_all_block());
    fs.writeFileSync('src/game2.compact', replaced);
}

const abilities = [0, 1, 2];
const colors = [0, 1, 2];
const max_enemies = [0, 1, 2];

const gen_all_dmg = () => max_enemies.map((enemy) => `player_damage_${enemy} = (${gen_base_dmg(enemy)} + ${gen_energy_dmg(enemy)}) as Uint<32>;`).join('\n    ');

const gen_base_dmg = (enemy) => abilities.map((a) => `((abilities[${a}].effect.is_some && (abilities[${a}].effect.value.is_aoe || target == ${enemy})) as Uint<1>) * effect_damage(abilities[${a}].effect.value, battle.stats[${enemy}])`).join(' + ');
const gen_energy_dmg = (enemy) => abilities.map((a) => colors.map((c) => `((abilities[${a}].on_energy[${c}].is_some && (abilities[${a}].on_energy[${c}].value.is_aoe || target == ${enemy})) as Uint<1>) * effect_damage(abilities[${a}].on_energy[${c}].value, battle.stats[${enemy}])`).join(' + ')).join(' + ');

const gen_all_block = () => abilities.map((player) => `player_block_${player} = (${gen_base_block()} + ${gen_energy_block()}) as Uint<32>;`).join('\n    ');

const gen_base_block = () => abilities.map((a) => `(abilities[${a}].effect.is_some as Uint<1>) * ((abilities[${a}].effect.value.effect_type == EFFECT_TYPE.block) as Uint<1>)`).join(' + ');
const gen_energy_block = () => abilities.map((a) => colors.map((c) => `(abilities[${a}].on_energy[${c}].is_some as Uint<1>) * ((abilities[${a}].on_energy[${c}].value.effect_type == EFFECT_TYPE.block) as Uint<1>)`).join(' + ')).join(' + ');


generate_resolve_abilities();