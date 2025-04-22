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
import { BattleConfig, EFFECT_TYPE, PlayerLoadout, pureCircuits } from 'game2-contract';
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext';

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

export class TestMenu extends Phaser.Scene {
    deployProvider: BrowserDeploymentManager;
    api: DeployedGame2API | undefined;
    subscription: Subscription | undefined;
    text: Phaser.GameObjects.Text | undefined;
    new_button: Button | undefined;
    match_buttons: Button[];
    state: Game2DerivedState | undefined;

    constructor() {
        super('TestMenu');
        this.deployProvider = new BrowserDeploymentManager(logger);
        this.match_buttons = [];
    }

    preload() {
        this.load.setBaseURL('/');

        this.load.image('stone_button', 'stone_button.png');
        this.load.image('stone_button_over', 'stone_button_over.png');
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
            api.start_new_battle(makeMockLoadout()).then((battle) => {
                const button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.145 + 32 * this.match_buttons.length, 320, 24, this.matchStr(battle), 10, () => {
                    api.combat_round(pureCircuits.derive_battle_id(battle)).then((rewards) => {
                        if (rewards != undefined) {
                            button.text.setText(`you won ${rewards.gold} gold!`);
                        } else {
                            button.text.setText(this.matchStr(battle));
                        }
                    });
                });
                this.match_buttons.push(button);
            })
        });
    }

    private matchStr(battle: BattleConfig): string {
        const state = this.state?.activeBattleStates.get(pureCircuits.derive_battle_id(battle))
        return state != undefined ? `Player HP: ${state.player_hp_0} | Enemy HP:  ${state.enemy_hp_0}/ ${state.enemy_hp_1}/${state.enemy_hp_2}` : '404';
    }

    private onStateChange(state: Game2DerivedState) {
        console.log('---state change---');
        this.state = state;
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