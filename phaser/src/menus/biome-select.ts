import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { BIOME_ID, biomeToName } from "../battle/biome";
import { Subscription } from "rxjs";
import { Button } from "../widgets/button";
import { GAME_HEIGHT, GAME_WIDTH } from "../main";
import { TestMenu } from "./main";
import { StartBattleMenu } from "./pre-battle";

export class BiomeSelectMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    isQuest: boolean;
    subscription: Subscription;

    constructor(api: DeployedGame2API, isQuest: boolean, state: Game2DerivedState) {
        super('BiomeSelectMenu');
        this.api = api;
        this.isQuest = isQuest;
        this.state = state;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    onStateChange(state: Game2DerivedState) {
        this.state = state;
    }

    create() {
        const biomes = [
            BIOME_ID.grasslands,
            BIOME_ID.desert,
            BIOME_ID.tundra,
            BIOME_ID.cave
        ];
        const buttonWidth = 320;
        const buttonHeight = 64;
        biomes.forEach((biome, i) => new Button(
            this,
            GAME_WIDTH / 2,
            GAME_HEIGHT * ((i + 1) / (biomes.length + 2)),
            buttonWidth,
            buttonHeight,
            biomeToName(biome),
            12,
            () => {
                this.scene.remove('StartBattleMenu');
                this.scene.add('StartBattleMenu', new StartBattleMenu(this.api!, biome, this.isQuest, this.state));
                this.scene.start('StartBattleMenu');
            }
        ));
        new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * ((biomes.length + 1) / (biomes.length + 2)), buttonWidth, buttonHeight, 'Back', 12, () => {
            this.scene.remove('TestMenu');
            this.scene.add('TestMenu', new TestMenu(this.api!, this.state));
            this.scene.start('TestMenu');
        }, 'Return to Hub');
    }
}