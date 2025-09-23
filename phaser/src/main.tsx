/**
 * Main entry point into the frontend. Sets up Phaser
 */
import { NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';
import './globals';
import { logger } from './logger';

// Export the logger for use throughout the application
export { logger };

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
            logger.debugging.error(`Unknown Vite MODE ${import.meta.env.MODE}, defaulting to undeployed`);
            return NetworkId.Undeployed;
    }
}
// Ensure that the network IDs are set within the Midnight libraries.
setNetworkId(networkId);

logger.network.info(`networkId = ${networkId}`);
logger.debugging.info(`VITE: [\n${JSON.stringify(import.meta.env)}\n]`);

// Phaser code begins

import 'phaser';
import RexUIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin'
import BBCodeTextPlugin from 'phaser3-rex-plugins/plugins/bbcodetext-plugin.js';
import { TestMenu } from './menus/main';
import { Loader } from './menus/loader';
import { Color } from './constants/colors';

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 480;


export function fontStyle(fontSize: number, extra?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle {
    return {
        fontSize: fontSize*4,  // The font renders poorly on some systems if not scaled up
        fontFamily: 'yana',
        color: Color.White,
        ...extra,  // Overwrite with any extra styles passed in
    };
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
    scene: [
        TestMenu,
        Loader,
    ],
    render: {
        pixelArt: true,
    },
    zoom: scaleToWindow(),
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