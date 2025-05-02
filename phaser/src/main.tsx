import { NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';
import { type Game2DerivedState, type DeployedGame2API, Game2API } from 'game2-api';
import './globals';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { LedgerState } from '@midnight-ntwrk/ledger';
import { BrowserDeploymentManager } from './wallet';
import * as pino from 'pino';

// TODO: get this properly? it's undefined if i uncomment this
//const networkId = import.meta.env.VITE_NETWORK_ID as NetworkId;
//const networkId = NetworkId.TestNet;
export const networkId = getNetworkId();

function getNetworkId(): NetworkId {
    switch (import.meta.env.MODE) {
        case 'undeployed':
            return NetworkId.Undeployed;
        case 'testnet':
            return NetworkId.TestNet;
        default:
            console.error('Unknown Vite MODE, defaulting to undeployed');
            return NetworkId.Undeployed;
    }
}
// Ensure that the network IDs are set within the Midnight libraries.
setNetworkId(networkId);
export const logger = pino.pino({
    level: import.meta.env.VITE_LOGGING_LEVEL as string,
});
console.log(`networkId = ${networkId}`);

console.log(`VITE: [\n${JSON.stringify(import.meta.env)}\n]`);
// phaser part

import 'phaser';
import RexUIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin'
import BBCodeTextPlugin from 'phaser3-rex-plugins/plugins/bbcodetext-plugin.js';
//import KeyboardPlugin from 'phaser3-';
import RoundRectanglePlugin from 'phaser3-rex-plugins/plugins/roundrectangle-plugin.js';
import { extend } from 'fp-ts/lib/pipeable';
import { Subscriber, Observable, Subscription } from 'rxjs';

import { Button } from './menus/button';
import { MockGame2API } from './mockapi';
import { Ability, BattleConfig, Effect, EFFECT_TYPE, PlayerLoadout, pureCircuits } from 'game2-contract';
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext';
import { init } from 'fp-ts/lib/ReadonlyNonEmptyArray';
import { combat_round_logic } from './battle/logic';

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 360;

export function fontStyle(fontSize: number, extra?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle {
    // this font is really small for some reason, so double it
    return {
        ...extra,
        fontSize: fontSize * 2,
        fontFamily: 'yana',
        color: '#f5f5ed'//'white'
    };
}

// only converts bigint, but this is the only problem we have with printing ledger types
export function safeJSONString(obj: object): string {
    // hacky but just doing it manually since otherwise: 'string' can't be used to index type '{}'
    // let newObj = {}
    // for (let [key, val] of Object.entries(obj)) {
    //     if (typeof val == 'bigint') {
    //         newObj[key] = Number(val);
    //     } else {
    //         newObj[key] = val;
    //     }
    // }
    // return JSON.stringify(newObj);
    if (typeof obj == 'bigint') {
        return Number(obj).toString();
    } else if (Array.isArray(obj)) {
        let str = '[';
        let innerFirst = true;
        for (let i = 0; i < obj.length; ++i) {
            if (!innerFirst) {
                str += ', ';
            }
            innerFirst = false;
            str += safeJSONString(obj[i]);
        }
        str += ']';
        return str;
    } else if (typeof obj == 'object') {
        let str = '{';
        let first = true;
        for (let [key, val] of Object.entries(obj)) {
            if (!first) {
                str += ', ';
            }
            first = false;
            str += `"${key}": ${safeJSONString(val)}`;
        }
        str += '}';
        return str;
    }
    return JSON.stringify(obj);
}

export function rootObject(obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform): Phaser.GameObjects.Components.Transform {
    while (obj.parentContainer != undefined) {
        obj = obj.parentContainer;
    }
    return obj;
}

function scaleToWindow(): number {
    return Math.floor(Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT));
}

export class AbilityWidget extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    ability: Ability;

    constructor(scene: Phaser.Scene, x: number, y: number, ability: Ability) {
        super(scene, x, y);
        this.setSize(48, 48);
        this.bg = scene.add.nineslice(0, 0, 'stone_button', undefined, 48, 48, 8, 8, 8, 8);
        this.ability = ability;

        this.add(this.bg);
        if (ability.effect.is_some) {
            switch (ability.effect.value.effect_type) {
                case EFFECT_TYPE.attack_fire:
                    this.add(scene.add.image(0, 0, 'fire'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.attack_ice:
                    this.add(scene.add.image(0, 0, 'ice'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.attack_phys:
                    this.add(scene.add.image(0, 0, 'physical'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.block:
                    this.add(scene.add.image(0, 0, 'block'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
            }
        }

        scene.add.existing(this);
    }
}

function randomAbility(): Ability {
    const randomEffect = (enabled: boolean) => {
        return {
            is_some: enabled,
            value: { effect_type: Phaser.Math.Between(0, 3) as EFFECT_TYPE, amount: BigInt(Phaser.Math.Between(1, 4)), is_aoe: false},
        };
    };
    return {
        effect: randomEffect(true),
        on_energy: [randomEffect(false), randomEffect(false), randomEffect(false)],
    };
}

// amount is only here to tell what type of generation it is
// TODO DECISION: should this be the case? the re-use. or should it be separate generation types???
export function effectTypeToIcon(effectType: EFFECT_TYPE, amount: number): string {
    switch (effectType) {
        case EFFECT_TYPE.attack_fire:
            return 'fire';
        case EFFECT_TYPE.attack_ice:
            return 'ice';
        case EFFECT_TYPE.attack_phys:
            return 'physical';
        case EFFECT_TYPE.block:
            return 'block';
        case EFFECT_TYPE.generate:
            return `energy_${amount}`;
                                                                
    }
}

export class BattleEffect extends Phaser.GameObjects.Container {
    constructor(scene: Phaser.Scene, x: number, y: number, effectType: EFFECT_TYPE, amount: number, onComplete: () => void) {
        super(scene, x, y);

        if (effectType != EFFECT_TYPE.generate) {
            this.add(scene.add.text(12, 0, amount.toString(), fontStyle(12)));
        }
        this.add(scene.add.sprite(-12, 0, effectTypeToIcon(effectType, amount)));

        this.setSize(48, 48);
        console.log(`BattleEffect START ${effectType} | ${amount}`);
        scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 1000,
            onComplete: () => {
                console.log(`BattleEffect COMPLETE ${effectType} | ${amount}`);
                onComplete();
            },
        });
    }
}

export class StartBattleMenu extends Phaser.Scene {
    api: DeployedGame2API;
    loadout: PlayerLoadout;
    available: AbilityWidget[];
    is_chosen: boolean[];

    constructor(api: DeployedGame2API) {
        super('StartBattleMenu');
        this.api = api;
        this.loadout = {
            abilities: [],
        };
        this.available = [];
        this.is_chosen = [];
    }

    create() {
        for (let i = 0; i < 10; ++i) {
            const ability = new AbilityWidget(this, 32 + i * 48, GAME_HEIGHT * 0.8, randomAbility());
            this.available.push(ability);
            this.is_chosen.push(false);
            const button = new Button(this, 32 + i * 48, GAME_HEIGHT * 0.8 - 48, 48, 24, '^', 10, () => {
                if (this.is_chosen[i]) {
                    ability.y += 48 + 48;
                    button.text.text = '^';
                } else {
                    ability.y -= 48 + 48;
                    button.text.text = 'v';
                }
                this.is_chosen[i] = !this.is_chosen[i];
            });
        }
        new Button(this, GAME_WIDTH / 2, 64, 64, 24, 'Start', 10, () => {
            this.loadout.abilities = [];
            for (let i = 0; i < this.is_chosen.length; ++i) {
                if (this.is_chosen[i]) {
                    this.loadout.abilities.push(this.available[i].ability);
                }
            }
            if (this.loadout.abilities.length == 5) {
                this.api.start_new_battle(this.loadout).then((battle) => {
                    this.scene.remove('TestMenu');
                    this.scene.add('TestMenu', new TestMenu({
                        api: this.api,
                        battle,
                    }));
                    this.scene.start('TestMenu');
                });
            } else {
                console.log(`finish selecting abilities (selected ${this.loadout.abilities.length}, need 5)`);
            }
        });
    }
}

function enemyX(config: BattleConfig, enemyIndex: number): number {
    return GAME_WIDTH * (enemyIndex + 0.5) / Number(config.enemy_count);
}

const enemyY = GAME_HEIGHT * 0.4;

const playerX = GAME_WIDTH / 2;
const playerY = GAME_HEIGHT * 0.8;

export class TestMenu extends Phaser.Scene {
    deployProvider: BrowserDeploymentManager;
    api: DeployedGame2API | undefined;
    subscription: Subscription | undefined;
    text: Phaser.GameObjects.Text | undefined;
    new_button: Button | undefined;
    match_buttons: Button[];
    state: Game2DerivedState | undefined;

    constructor(resume: { api: DeployedGame2API, battle: BattleConfig } | undefined) {
        super('TestMenu');
        this.match_buttons = [];
        if (resume != undefined) {
            setTimeout(() => {
                this.initApi(resume.api);
            }, 100);
        }// else {
            this.deployProvider = new BrowserDeploymentManager(logger);
        //}}
    }

    preload() {
        this.load.setBaseURL('/');

        this.load.image('stone_button', 'stone_button.png');
        this.load.image('stone_button_over', 'stone_button_over.png');

        this.load.image('fire', 'fire.png');
        this.load.image('ice', 'ice.png');
        this.load.image('physical', 'physical.png');
        this.load.image('block', 'block.png');
        this.load.image('energy_0', 'energy_0.png');
        this.load.image('energy_1', 'energy_1.png');
        this.load.image('energy_2', 'energy_2.png');
    }

    create() {
        //this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'GAME 2');
        // deploy contract for testing
        this.match_buttons.push(new Button(this, 16, 16, 64, 24, 'Deploy', 10, () => {
            console.log('~deploying~');
            this.deployProvider.create().then((api) => {
                console.log('==========GOT API========');
                this.initApi(api);
            }).catch((e) => console.error(`Error connecting: ${e}`));
        }));
        this.match_buttons.push(new Button(this, 96, 16, 64, 24, 'Mock Deploy', 10, () => {
            console.log('==========MOCK API========');
            this.initApi(new MockGame2API());
        }));
    }

    private initApi(api: DeployedGame2API) {
        this.api = api;
        this.match_buttons.forEach((b) => b.destroy());
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.new_button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 128, 32, 'New Battle', 14, () => {
            this.scene.remove('StartBattleMenu');
            this.scene.add('StartBattleMenu', new StartBattleMenu(api));
            this.scene.start('StartBattleMenu');
        });
    }

    private matchStr(battle: BattleConfig): string {
        const state = this.state?.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        return state != undefined ? `Player HP: ${state.player_hp} | Enemy HP:  ${state.enemy_hp_0}/ ${state.enemy_hp_1}/${state.enemy_hp_2}` : '404';
    }

    private onStateChange(state: Game2DerivedState) {
        console.log('---state change---');
        this.state = state;


        this.match_buttons.forEach((b) => b.destroy());
        console.log(`configs: ${state.activeBattleConfigs.size}   ; states: ${state.activeBattleStates.size}`);
        let offset = 0;
        for (const [id, battle] of state.activeBattleConfigs) {
            console.log(`got battle: ${id}`);
            const button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.145 + 32 * offset, 320, 24, this.matchStr(battle), 10, async () => {
                const id = pureCircuits.derive_battle_id(battle);
                // TODO: handle if state change triggerd by network before UI finished resolving?
                // or should we more distinctly separate proving and sending?
                // we will need that for combining multiple rounds if we get proof composition in time
                const [circuit, ui] = await Promise.all([
                    // prove and submit circuit
                    this.api!.combat_round(id),
                    // run the same logic simultaneously and trigger UI callbacks
                    combat_round_logic(id, this.state!, {
                        onEnemyBlock: (enemy: number, amount: number) => new Promise((resolve) => {
                            this.add.existing(new BattleEffect(this, enemyX(battle, enemy), enemyY, EFFECT_TYPE.block, amount, resolve));
                        }),
                        onEnemyAttack: (enemy: number, amount: number) => new Promise((resolve) => {
                            this.add.existing(new BattleEffect(this, enemyX(battle, enemy), enemyY, EFFECT_TYPE.attack_phys, amount, resolve));
                        }),
                        onPlayerEffect: (target: number, effect: Effect) => new Promise((resolve) => {
                            this.add.existing(new BattleEffect(this, playerX, playerY, effect.effect_type, Number(effect.amount), resolve));
                        }),
                    }),
                ]);
                console.log(`------------------ BATTLE DONE --- BOTH UI AND LOGIC ----------------------`);
                // TODO: check consistency (either here or in onStateChange())
                //
                // TODO: move this out of here? it gets reset by onStateChange() and also results in an error:
                //
                //    Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'updatePenManager')
                //       at BBCodeText.updateText (index-eba13966.js:322545:24)
                //       at BBCodeText.setText (index-eba13966.js:322484:14)
                //       at index-eba13966.js:393191:23
                if (ui != undefined) {
                    button.text.setText(`you won ${ui.gold} gold!`);
                } else {
                    button.text.setText(this.matchStr(battle));
                }
            });
            this.match_buttons.push(button);
            offset += 1;
        }
    }
}

function makeMockLoadout(): PlayerLoadout {
    const mockEffect = { is_some: true, value: { effect_type: EFFECT_TYPE.attack_phys, amount: BigInt(1), is_aoe: false} };
    const mockAbility = {
        effect: mockEffect,
        on_energy: [mockEffect, mockEffect, mockEffect],
    };
    return {
        abilities: [mockAbility, mockAbility, mockAbility, mockAbility, mockAbility, mockAbility, mockAbility],
    };
}

const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    scene: [TestMenu],
    render: {
        pixelArt: true,
    },
    zoom: scaleToWindow(),
    // physics: {
    //     default: 'arcade',
    //     arcade: {
    //         gravity: { x: 0, y: 200 }
    //     }
    // }
    dom: {
        createContainer: true,
    },
    plugins: {
        scene: [
            {
                key: "rexUI",
                plugin: RexUIPlugin,
                mapping: "rexUI",
            },
        ],
        global: [
            {
                key: "rexBBCodeTextPlugin",
                plugin: BBCodeTextPlugin,
                start: true,
            },
        ],
    },
};

export const game = new Phaser.Game(config);