/**
 * Main hub menu - the primary game menu after boot/initialization.
 *
 * This contains a list of active quests as well as buttons to initiate new quests or new battles.
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Button } from "../widgets/button";
import { Loader } from "./loader";
import { Subscription } from "rxjs";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { ShopMenu } from "./shop/shop";
import { BiomeSelectMenu } from "./biome-select";
import { QuestsMenu } from "./quests";
import { DungeonScene } from "./dungeon-scene";
import { TopBar } from "../widgets/top-bar";
import { NetworkError } from "./network-error";

export class MainMenu extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription | undefined;
    state: Game2DerivedState | undefined;
    topBar: TopBar | undefined;
    buttons: Button[];
    menuMusic: Phaser.Sound.BaseSound | undefined;

    constructor(api: DeployedGame2API, state?: Game2DerivedState) {
        super('MainMenu');
        this.api = api;
        this.buttons = [];
        this.state = state;
        setTimeout(() => {
            this.initApi();
        }, 100);
    }

    create() {
        // Add and launch dungeon background scene first (shared across hub scenes)
        if (!this.scene.get('DungeonScene')) {
            this.scene.add('DungeonScene', new DungeonScene());
        }
        // Only launch if not already running
        const dungeonScene = this.scene.get('DungeonScene');
        if (dungeonScene && !dungeonScene.scene.isActive()) {
            this.scene.launch('DungeonScene');
        }

        // Initialize UI immediately since we're coming from BootScene with initialized API
        // Scene status is CREATING during create(), so we bypass onStateChange's status check
        if (this.state) {
            this.initializeUI(this.state);
        }

        // Start menu music (check if already playing globally)
        if (!this.sound.get('menu-music')) {
            this.menuMusic = this.sound.add('menu-music', { volume: 0.6, loop: true });
            this.menuMusic.play();
        } else {
            this.menuMusic = this.sound.get('menu-music');
        }
    }

    private initApi() {
        this.buttons.forEach((b) => b.destroy());
        this.topBar = new TopBar(this, true, this.api, this.state);
        this.subscription = this.api.state$.subscribe((state) => this.onStateChange(state));
    }

    /**
     * Initialize UI without scene status checks
     * Used by create() when scene status is CREATING
     */
    private initializeUI(state: Game2DerivedState) {
        // Destroy existing buttons and create new ones
        this.buttons.forEach((b) => b.destroy());
        this.buttons = [];

        if (state.player !== undefined) {
            // Main menu buttons
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.25, 280, 80, 'New Battle', 14, () => {
                this.scene.remove('BiomeSelectMenu');
                this.scene.add('BiomeSelectMenu', new BiomeSelectMenu(this.api!, false, state));
                this.scene.start('BiomeSelectMenu');
            }));

            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.45, 280, 80, `Quests (${state.quests.size})`, 14, () => {
                this.scene.remove('QuestsMenu');
                this.scene.add('QuestsMenu', new QuestsMenu(this.api!, state));
                this.scene.start('QuestsMenu');
            }));

            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.65, 280, 80, 'Shop', 14, () => {
                this.scene.remove('ShopMenu');
                this.scene.add('ShopMenu', new ShopMenu(this.api!, state));
                this.scene.start('ShopMenu');
            }));
        } else {
            // Register button
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 400, 100, 'Register New Player', 14, () => {
                logger.gameState.info('Registering new player...');
                this.scene.pause().launch('Loader');
                const loader = this.scene.get('Loader') as Loader;
                loader.setText("Submitting Proof");

                this.events.once('stateChange', () => {
                    logger.gameState.info('Registered new player');
                    this.scene.resume().stop('Loader');
                });

                this.api!.register_new_player().then(() => {
                    loader.setText("Waiting on chain update");
                }).catch((e) => {
                    logger.network.error(`Error registering new player: ${e}`);
                    this.scene.resume().stop('Loader');

                    if (!this.scene.get('NetworkError')) {
                        this.scene.add('NetworkError', new NetworkError());
                    }
                    const networkErrorScene = this.scene.get('NetworkError') as NetworkError;
                    networkErrorScene.setErrorMessage('Error registering player. Please try again.');
                    this.scene.launch('NetworkError');
                });
            }));
        }
    }

    private onStateChange(state: Game2DerivedState) {
        this.state = state;

        this.events.emit('stateChange', state);

        // If MainMenu is not the active scene (but allow paused scenes for registration flow)
        // This prevents interference with other scenes like ActiveBattle
        const sceneStatus = this.scene.settings.status;
        if (sceneStatus !== Phaser.Scenes.RUNNING && sceneStatus !== Phaser.Scenes.PAUSED) {
            return;
        }

        // Destroy and recreate buttons with updated state
        this.buttons.forEach((b) => b.destroy());

        if (state.player !== undefined) {
            // Main menu buttons in vertical column with proper spacing
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.25, 280, 80, 'New Battle', 14, () => {
                this.scene.remove('BiomeSelectMenu');
                this.scene.add('BiomeSelectMenu', new BiomeSelectMenu(this.api!, false, state));
                this.scene.start('BiomeSelectMenu');
            }));

            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.45, 280, 80, `Quests (${state.quests.size})`, 14, () => {
                this.scene.remove('QuestsMenu');
                this.scene.add('QuestsMenu', new QuestsMenu(this.api!, state));
                this.scene.start('QuestsMenu');
            }));

            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.65, 280, 80, 'Shop', 14, () => {
                this.scene.remove('ShopMenu');
                this.scene.add('ShopMenu', new ShopMenu(this.api!, state));
                this.scene.start('ShopMenu');
            }));
        } else {
            // We haven't registered a player yet, so show the register button
            this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 400, 100, 'Register New Player', 14, () => {
                logger.gameState.info('Registering new player...');

                // Launch the loader scene to display during the API call

                this.scene.pause().launch('Loader');
                const loader = this.scene.get('Loader') as Loader;
                loader.setText("Submitting Proof");

                this.events.once('stateChange', () => {
                    logger.gameState.info('Registered new player');
                    this.scene.resume().stop('Loader');
                });

                this.api!.register_new_player().then(() => {
                    loader.setText("Waiting on chain update");
                }).catch((e) => {
                    logger.network.error(`Error registering new player: ${e}`);
                    this.scene.resume().stop('Loader');

                    // Show network error overlay
                    if (!this.scene.get('NetworkError')) {
                        this.scene.add('NetworkError', new NetworkError());
                    }
                    const networkErrorScene = this.scene.get('NetworkError') as NetworkError;
                    networkErrorScene.setErrorMessage('Error registering player. Please try again.');
                    this.scene.launch('NetworkError');
                });
            }));
        }
    }

    /**
     * Cleanup method to unsubscribe from state updates
     * Call this before removing the MainMenu scene to prevent stale state updates
     */
    public shutdown() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = undefined;
        }
    }

}