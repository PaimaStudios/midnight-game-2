/**
 * Main hub menu.
 * 
 * For now this also contains both deploying and player registration but that can be refactored later.
 * 
 * This contains a list of active quests as well as buttons to initiate new quests or new battles.
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { BrowserDeploymentManager } from "../wallet";
import { Button } from "../widgets/button";
import { Loader } from "./loader";
import { Subscription } from "rxjs";
import { MockGame2API } from "../mockapi";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger, safeJSONString } from "../main";
import { QuestMenu } from "./quest";
import { QuestConfig } from "game2-contract";
import { Color } from "../constants/colors";
import { ShopMenu } from "./shop";
import { createSpiritAnimations } from "../animations/spirit";
import { createEnemyAnimations } from "../animations/enemy";
import { addScaledImage } from "../utils/scaleImage";
import { BiomeSelectMenu } from "./biome-select";

export class TestMenu extends Phaser.Scene {
    deployProvider: BrowserDeploymentManager;
    api: DeployedGame2API | undefined;
    subscription: Subscription | undefined;
    state: Game2DerivedState | undefined;
    goldText: Phaser.GameObjects.Text | undefined;
    goldLabel: Phaser.GameObjects.Text | undefined;
    errorText: Phaser.GameObjects.Text | undefined;
    new_button: Button | undefined;
    buttons: Button[];
    firstRun: boolean;

    constructor(api: DeployedGame2API | undefined, state?: Game2DerivedState) {
        super('TestMenu');
        this.buttons = [];
        this.firstRun = api == undefined;
        if (api != undefined) {
            setTimeout(() => {
                this.initApi(api);
                if (state != undefined) {
                    this.onStateChange(state);
                }
            }, 100);
        }
        this.deployProvider = new BrowserDeploymentManager(logger.pino);
    }

    preload() {
        this.load.setBaseURL('/');

        // UI Sprites
        this.load.image('ui-scroll-bg', 'ui-scroll-bg.png');
        this.load.image('tablet0', 'tablet0.png');
        this.load.image('tablet1', 'tablet1.png');
        this.load.image('tablet2', 'tablet2.png');
        this.load.image('tablet-round', 'tablet-round.png');

        // Icon sprites
        this.load.image('fire', 'fire.png');
        this.load.image('ice', 'ice.png');
        this.load.image('physical', 'physical.png');
        this.load.image('block', 'block.png');
        this.load.image('energy-icon', 'energy-icon.png');
        this.load.image('arrow', 'arrow.png');
        this.load.image('aoe', 'aoe.png');
        this.load.image('hp-bar-shield', 'hp-bar-shield.png');

        // Revolving Orb Sprites
        this.load.image('orb-atk-fire', 'orb-atk-fire.png');
        this.load.image('orb-atk-ice', 'orb-atk-ice.png');
        this.load.image('orb-atk-phys', 'orb-atk-phys.png');
        this.load.image('orb-def', 'orb-def.png');

        // Spirit Sprites
        this.load.spritesheet('spirit-atk-fire', 'spirit-atk-fire.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('spirit-atk-ice', 'spirit-atk-ice.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('spirit-atk-phys', 'spirit-atk-phys.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('spirit-def', 'spirit-def.png', { frameWidth: 32, frameHeight: 32 });

        this.load.spritesheet('orb-aura', 'orb-aura.png', { frameWidth: 16, frameHeight: 16 });
        this.load.spritesheet('spirit-aura', 'spirit-aura.png', { frameWidth: 32, frameHeight: 32 });

        // Enemy Sprites
        this.load.spritesheet('enemy-goblin', 'enemy-goblin.png', { frameWidth: 32, frameHeight: 28 });
        this.load.spritesheet('enemy-snowman', 'enemy-snowman.png', { frameWidth: 40, frameHeight: 40 });
        this.load.spritesheet('enemy-fire-sprite', 'enemy-fire-sprite.png', { frameWidth: 36, frameHeight: 32 });
        
        // Boss enemies remain as single images
        this.load.image('enemy-boss-dragon-1', 'enemy-boss-dragon-1.png');
        this.load.image('enemy-boss-enigma-1', 'enemy-boss-enigma-1.png');

        this.load.image('bg-grass', 'bg-grass.png');
        this.load.image('bg-desert', 'bg-desert.png');
        this.load.image('bg-tundra', 'bg-tundra.png');
        this.load.image('bg-cave', 'bg-cave.png');

        this.load.plugin('rexdragplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexdragplugin.min.js', true);
        this.load.plugin('rexroundrectangleplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexroundrectangleplugin.min.js', true);
    }

    create() {
        // should this be here or elsehwere? we did this for pvp-arena
        createSpiritAnimations(this);
        createEnemyAnimations(this);

        //this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'GAME 2');
        // deploy contract for testing
        if (this.firstRun) {
            switch (import.meta.env.VITE_API_FORCE_DEPLOY) {
                case 'real':
                    logger.network.info('~deploying~');
                    this.deployProvider.create().then((api) => {
                        logger.network.info('==========GOT API========');
                        this.initApi(api);
                    }).catch((e) => logger.network.error(`Error connecting: ${e}`));
                    break;
                case 'mock':
                    logger.network.info('==========MOCK API========');
                    this.initApi(new MockGame2API());
                    break;
                default:
                    if (import.meta.env.VITE_API_FORCE_DEPLOY != undefined) {
                        logger.debugging.error(`Unknown VITE_API_FORCE_DEPLOY: ${import.meta.env.VITE_API_FORCE_DEPLOY}`);
                    }
                    this.buttons.push(new Button(this, 75, 48, 128, 84, 'Deploy', 10, () => {
                        logger.network.info('~deploying~');
                        this.deployProvider.create().then((api) => {
                            logger.network.info('==========GOT API========');
                            this.initApi(api);
                        }).catch((e) => logger.network.error(`Error connecting: ${e}`));
                    }));
                    this.buttons.push(new Button(this, 215, 48, 128, 84, 'Mock Deploy', 10, () => {
                        logger.network.info('==========MOCK API========');
                        this.initApi(new MockGame2API());
                    }));
                    break;
            }
        }
        this.goldLabel = this.add.text(32, GAME_HEIGHT - 64, 'Gold: ', fontStyle(12));
        this.goldText = this.add.text(100, GAME_HEIGHT - 64, '', fontStyle(12, { color: Color.Yellow }));
        this.goldLabel.setVisible(false);
        this.goldText.setVisible(false);
        this.errorText = this.add.text(82, GAME_HEIGHT - 96, '', fontStyle(12, { color: Color.Red }));

        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg-grass').setDepth(-10);
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
        logger.gameState.debug(`---state change---: ${safeJSONString(state)}`);
        this.state = state;

        this.events.emit('stateChange', state);

        this.buttons.forEach((b) => b.destroy());

        if (state.player !== undefined) {
            // We've registered a player, so show the quest and battle buttons
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.15, 220, 90, 'New Quest', 14, () => {
                this.scene.remove('BiomeSelectMenu');
                this.scene.add('BiomeSelectMenu', new BiomeSelectMenu(this.api!, true, state));
                this.scene.start('BiomeSelectMenu');
            }));
            this.buttons.push(new Button(this, GAME_WIDTH / 2 + 220 + 16, GAME_HEIGHT * 0.15, 220, 90, 'New Battle', 14, () => {
                this.scene.remove('BiomeSelectMenu');
                this.scene.add('BiomeSelectMenu', new BiomeSelectMenu(this.api!, false, state));
                this.scene.start('BiomeSelectMenu');
            }));
            this.buttons.push(new Button(this, GAME_WIDTH / 2 - 220 - 16, GAME_HEIGHT * 0.15, 220, 90, 'Shop', 14, () => {
                this.scene.remove('ShopMenu');
                this.scene.add('ShopMenu', new ShopMenu(this.api!, state));
                this.scene.start('ShopMenu');
                
            }));

            let offset = 0;
            for (const [id, quest] of state.quests) {
                logger.gameState.debug(`got quest: ${id}`);
                const button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.38 + 112 * offset, 320, 96, this.questStr(quest), 10, () => {
                    this.scene.remove('QuestMenu');
                    this.scene.add('QuestMenu', new QuestMenu(this.api!, id));
                    this.scene.start('QuestMenu');
                });
                offset += 1;
                this.buttons.push(button);
            }
            this.goldLabel?.setVisible(true);
            this.goldText?.setVisible(true);
            this.goldText?.setText(`${state.player.gold}`);
        } else {
            // We haven't registered a player yet, so show the register button
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 400, 100, 'Register New Player', 14, () => {
                logger.gameState.info('Registering new player...');
                // Launch the loader scene to display during the API call
                this.scene.pause().launch('Loader');
                const loader = this.scene.get('Loader') as Loader;
                loader.setText("Submitting Proof");
                this.api!.register_new_player().then(() => {
                    this.errorText?.setText('');
                    loader.setText("Waiting on chain update");
                    this.events.on('stateChange', () => {
                        logger.gameState.info('Registered new player');
                        this.scene.resume().stop('Loader');
                    });
                }).catch((e) => {
                    this.errorText?.setText('Error Registering Player. Try again...');
                    logger.network.error(`Error registering new player: ${e}`);
                    this.scene.resume().stop('Loader');
                });
            }));
        }
    }
}