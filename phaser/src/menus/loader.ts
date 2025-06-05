import { fontStyle, GAME_WIDTH, GAME_HEIGHT, } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';

const defaultLoaderText = `Loading...`;
const fontSize = 14;

export class Loader extends Phaser.Scene {
    private text: string;
    bbcodetext?: BBCodeText;

    constructor(text?: string) {
        super('Loader');

        this.text = text || defaultLoaderText;
    }

    create() {
        this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x220033, 0.90)
        // @ts-expect-error
        this.bbcodetext = this.add.rexBBCodeText(GAME_WIDTH/2, GAME_HEIGHT/2, this.text, fontStyle(fontSize))
            .setOrigin(0.5, 0.65);
    }

    setText(text: string) {
        this.text = text;
        if (this.scene.isActive() && this.bbcodetext !== undefined) {
            this.bbcodetext.setText(text);
        }
    }

}