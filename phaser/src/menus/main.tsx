/**
 * Main hub menu.
 * 
 * For now this also contains both deploying and player registration but that can be refactored later.
 * 
 * This contains a list of active quests as well as buttons to initiate new quests or new battles.
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { BrowserDeploymentManager } from "../wallet";
import { Button } from "./button";
import { Loader } from "./loader";
import { Subscription } from "rxjs";
import { MockGame2API } from "../mockapi";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { StartBattleMenu } from "./pre-battle";
import { QuestMenu } from "./quest";
import { QuestConfig } from "game2-contract";

export class TestMenu extends Phaser.Scene {
    deployProvider: BrowserDeploymentManager;
    api: DeployedGame2API | undefined;
    subscription: Subscription | undefined;
    state: Game2DerivedState | undefined;
    goldText: Phaser.GameObjects.Text | undefined;
    new_button: Button | undefined;
    buttons: Button[];

    constructor(api: DeployedGame2API | undefined, state?: Game2DerivedState) {
        super('TestMenu');
        this.buttons = [];
        if (api != undefined) {
            setTimeout(() => {
                this.initApi(api);
                if (state != undefined) {
                    this.onStateChange(state);
                }
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
        this.load.image('arrow', 'arrow.png');
        this.load.image('aoe', 'aoe.png');
        this.load.image('energy_flash_0', 'energy_flash_0.png');
        this.load.image('energy_flash_1', 'energy_flash_1.png');
        this.load.image('energy_flash_2', 'energy_flash_2.png');

        this.load.image('player', 'player.png');
        this.load.image('enemy', 'goblin.png');
    }

    create() {
        //this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'GAME 2');
        // deploy contract for testing
        this.buttons.push(new Button(this, 16, 16, 64, 24, 'Deploy', 10, () => {
            console.log('~deploying~');
            this.deployProvider.create().then((api) => {
                console.log('==========GOT API========');
                this.initApi(api);
            }).catch((e) => console.error(`Error connecting: ${e}`));
        }));
        this.buttons.push(new Button(this, 96, 16, 64, 24, 'Mock Deploy', 10, () => {
            console.log('==========MOCK API========');
            this.initApi(new MockGame2API());
        }));
        this.goldText = this.add.text(32, 32, '', fontStyle(12));
    }

    private initApi(api: DeployedGame2API) {
        this.api = api;
        this.buttons.forEach((b) => b.destroy());
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    private questStr(quest: QuestConfig): string {
        return `Quest info here. Difficulty: ${quest.difficulty}`;
    }

    private onStateChange(state: Game2DerivedState) {
        console.log('---state change---');
        this.state = state;

        this.events.emit('stateChange', state);

        this.buttons.forEach((b) => b.destroy());

        if (state.player !== undefined) {
            // We've registered a player, so show the quest and battle buttons
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 128, 32, 'New Quest', 14, () => {
                this.scene.remove('StartBattleMenu');
                this.scene.add('StartBattleMenu', new StartBattleMenu(this.api!, true, state));
                this.scene.start('StartBattleMenu');
            }));
            this.buttons.push(new Button(this, GAME_WIDTH / 2 + 128 + 16, GAME_HEIGHT * 0.1, 128, 32, 'New Battle', 14, () => {
                this.scene.remove('StartBattleMenu');
                this.scene.add('StartBattleMenu', new StartBattleMenu(this.api!, false, state));
                this.scene.start('StartBattleMenu');
            }));

            let offset = 0;
            for (const [id, quest] of state.quests) {
                console.log(`got quest: ${id}`);
                const button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.145 + 32 * offset, 320, 24, this.questStr(quest), 10, () => {
                    this.scene.remove('QuestMenu');
                    this.scene.add('QuestMenu', new QuestMenu(this.api!, id));
                    this.scene.start('QuestMenu');
                });
                offset += 1;
                this.buttons.push(button);
            }
            this.goldText?.setText(`Gold: ${state.player.gold}`);
        } else {
            // We haven't registered a player yet, so show the register button
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 128, 32, 'Register New Player', 14, async () => {
                console.log('Registering new player...');
                // Launch the loader scene to display during the API call
                this.scene.pause().launch('Loader');
                const loader = this.scene.get('Loader') as Loader;
                loader.setText("Submitting Proof");
                await this.api!.register_new_player();
                loader.setText("Waiting on chain update");
                this.events.on('stateChange', () => {
                    this.scene.resume().stop('Loader');
                    console.log('Registered new player');
                });
            }));
        }
    }
}