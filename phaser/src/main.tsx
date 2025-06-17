/**
 * Main entry point into the frontend. Sets up Phaser
 */
import { NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';
import './globals';
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
import { TestMenu } from './menus/main';
import { Loader } from './menus/loader';

export const GAME_WIDTH = 480/2;
export const GAME_HEIGHT = 360/2;


export function fontStyle(fontSize: number, extra?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle {
    return {
        ...extra,
        fontSize: fontSize,  // this font is really small for some reason, so double it
        fontFamily: 'yana',
        color: '#f5f5ed'  // 'white'
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
        let str = `[${Object.entries(obj).length}]{`;
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
    console.log(`safeJsonString(${typeof obj}): ${JSON.stringify(obj)}`);
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


const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    resolution: window.devicePixelRatio,
    roundPixels: true,
    scene: [
        TestMenu,
        Loader,
    ],
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