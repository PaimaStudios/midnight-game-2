import { defaultMaxListeners } from "events";
import { fontStyle, GAME_WIDTH, GAME_HEIGHT, } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';

const defaultLoaderText = `Loading...`;
const fontSize = 14;

export class Loader extends Phaser.Scene {
    text?: BBCodeText | `Loading...`;

    constructor(text?: BBCodeText) {
        super('Loader');

        this.text = text || defaultLoaderText;
    }

    create() {
        this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x220033, 0.90)
        // @ts-expect-error
        this.add.rexBBCodeText(GAME_WIDTH/2, GAME_HEIGHT/2, this.text, fontStyle(fontSize)).setOrigin(0.5, 0.65);
    }

}