import { fontStyle, GAME_WIDTH, GAME_HEIGHT, } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';

const defaultLoaderText = `Loading`;
const fontSize = 14;

export class Loader extends Phaser.Scene {
    private text: string;
    private bbcodetext?: BBCodeText;
    animateDots: boolean;

    constructor(text?: string, animateDots?: boolean) {
        super('Loader');

        this.text = text || defaultLoaderText;
        this.animateDots = animateDots !== undefined ? animateDots : true;
    }

    create() {
        this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x220033, 0.90)
        // @ts-expect-error
        this.bbcodetext = this.add.rexBBCodeText(GAME_WIDTH/2, GAME_HEIGHT/2, this.text, fontStyle({fontSize}))
            .setOrigin(0.5, 0.65);
    }

    update() {
        if (this.bbcodetext !== undefined && this.animateDots) {
            // Animate dots in the loader text
            const time = this.game.getTime()
            const cycle = Math.floor(time / 300) % 4;
            this.bbcodetext.setText(this.text + '.'.repeat(cycle));
        }
    }

    setText(text: string) {
        this.text = text;
        if (this.scene.isActive() && this.bbcodetext !== undefined) {
            this.bbcodetext.setText(text);
        }
    }

}