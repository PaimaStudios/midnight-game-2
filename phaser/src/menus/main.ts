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
import { createSpiritAnimations } from "../animations/spirit";
import { createEnemyAnimations } from "../animations/enemy";
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

    preload() {
        this.load.setBaseURL('/');

        // UI Sprites
        this.load.image('ui-scroll-bg', 'ui-scroll-bg.png');
        this.load.image('tablet0', 'tablet0.png');
        this.load.image('tablet1', 'tablet1.png');
        this.load.image('tablet2', 'tablet2.png');
        this.load.image('tablet-round', 'tablet-round.png');
        this.load.image('lock-icon', 'lock-icon.png');

        // Icon sprites
        this.load.image('fire', 'fire.png');
        this.load.image('ice', 'ice.png');
        this.load.image('physical', 'physical.png');
        this.load.image('block', 'block.png');
        this.load.image('heal', 'heal.png');
        this.load.image('energy-icon', 'energy-icon.png');
        this.load.image('arrow', 'arrow.png');
        this.load.image('aoe', 'aoe.png');
        this.load.image('hp-bar-shield', 'hp-bar-shield.png');
        this.load.image('upgrade-star', 'upgrade-star.png');
        this.load.image('upgrade-star-slot', 'upgrade-star-slot.png');
        this.load.image('upgrade-star-background', 'upgrade-star-background.png');

        // Revolving Orb Sprites
        this.load.image('orb-atk-fire', 'orb-atk-fire.png');
        this.load.image('orb-atk-ice', 'orb-atk-ice.png');
        this.load.image('orb-atk-phys', 'orb-atk-phys.png');
        this.load.image('orb-def', 'orb-def.png');

        // Spirit Sprites
        this.load.spritesheet('spirit-atk-fire', 'spirit-atk-fire.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('spirit-atk-ice', 'spirit-atk-ice.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('spirit-atk-phys', 'spirit-atk-phys.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('spirit-def', 'spirit-def.png', { frameWidth: 64, frameHeight: 64 });

        this.load.spritesheet('orb-aura', 'orb-aura.png', { frameWidth: 16, frameHeight: 16 });
        this.load.spritesheet('spirit-aura', 'spirit-aura.png', { frameWidth: 32, frameHeight: 32 });

        // Enemy Sprites
        this.load.spritesheet('enemy-goblin', 'enemy-goblin.png', { frameWidth: 32, frameHeight: 28 });
        this.load.spritesheet('enemy-hellspawn', 'enemy-hellspawn.png', { frameWidth: 61, frameHeight: 47 });
        this.load.spritesheet('enemy-fire-sprite', 'enemy-fire-sprite.png', { frameWidth: 43, frameHeight: 35 });
        this.load.spritesheet('enemy-ice-golem', 'enemy-ice-golem.png', { frameWidth: 44, frameHeight: 40 });
        this.load.spritesheet('enemy-snowman', 'enemy-snowman.png', { frameWidth: 40, frameHeight: 40 });
        this.load.spritesheet('enemy-coyote', 'enemy-coyote.png', { frameWidth: 60, frameHeight: 35 });
        this.load.spritesheet('enemy-pyramid', 'enemy-pyramid.png', { frameWidth: 80, frameHeight: 80 });
        this.load.spritesheet('enemy-goblin-priest', 'enemy-goblin-priest.png', { frameWidth: 32, frameHeight: 32 });
	    this.load.spritesheet('enemy-goblin-swordmaster', 'enemy-goblin-swordmaster.png', { frameWidth: 47, frameHeight: 32  });
        this.load.spritesheet('enemy-tentacle', 'enemy-tentacle.png', { frameWidth: 18, frameHeight: 57  });
        this.load.spritesheet('enemy-miniboss-goblin-chief', 'enemy-miniboss-goblin-chief.png', { frameWidth: 64, frameHeight: 56  });
        this.load.spritesheet('enemy-miniboss-tentacles', 'enemy-miniboss-tentacles.png', { frameWidth: 64, frameHeight: 64 });

        this.load.spritesheet('enemy-boss-enigma', 'enemy-boss-enigma-1.png', { frameWidth: 152, frameHeight: 95 });
        this.load.spritesheet('enemy-boss-dragon', 'enemy-boss-dragon-1.png', { frameWidth: 145, frameHeight: 97 });
        this.load.spritesheet('enemy-boss-abominable', 'enemy-boss-abominable.png', { frameWidth: 130, frameHeight: 98 });
        this.load.spritesheet('enemy-boss-sphinx', 'enemy-boss-sphinx.png', { frameWidth: 80, frameHeight: 94 });

        // Combat Effects
        this.load.image('heal-effect-circle', 'heal-effect-circle.png');
        this.load.image('heal-effect-rays', 'heal-effect-rays.png');

        // Backgrounds
        this.load.image('bg-hub1', 'bg-hub1.png');
        this.load.image('bg-shop', 'bg-shop.png');
        this.load.image('bg-grass', 'bg-grass.png');
        this.load.image('bg-desert', 'bg-desert.png');
        this.load.image('bg-tundra', 'bg-tundra.png');
        this.load.image('bg-cave', 'bg-cave.png');

        // Sound Effects
        this.load.audio('attack-immune', 'sfx/attack-immune.wav');
        this.load.audio('attack-weak', 'sfx/attack-weak.wav');
        this.load.audio('attack-neutral', 'sfx/attack-neutral.wav');
        this.load.audio('attack-effective', 'sfx/attack-effective.wav');
        this.load.audio('attack-supereffective', 'sfx/attack-supereffective.wav');
        this.load.audio('battle-select-enemy', 'sfx/battle-select-enemy.wav');
        this.load.audio('battle-select-enemy-attack', 'sfx/battle-select-enemy-attack.wav');
        this.load.audio('battle-win', 'sfx/battle-win.wav');
        this.load.audio('battle-lose', 'sfx/battle-lose.wav');
        this.load.audio('battle-ice-attack', 'sfx/battle-ice-attack.wav');
        this.load.audio('battle-phys-attack', 'sfx/battle-phys-attack.wav');
        this.load.audio('battle-fire-attack', 'sfx/battle-fire-attack.wav');
        this.load.audio('battle-def', 'sfx/battle-def.wav');
        this.load.audio('prebattle-move-spirit', 'sfx/prebattle-move-spirit.wav');
        this.load.audio('button-press-1', 'sfx/button-press-1.wav');
        this.load.audio('upgrade-success', 'sfx/upgrade-success.wav');

        // Music
        this.load.audio('menu-music', 'music/menu.wav');
        this.load.audio('boss-battle-music', 'music/boss-battle-music.wav');

        this.load.plugin('rexdragplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexdragplugin.min.js', true);
        this.load.plugin('rexroundrectangleplugin', 'https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexroundrectangleplugin.min.js', true);
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

        createSpiritAnimations(this);
        createEnemyAnimations(this);

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