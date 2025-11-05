/**
 * Boot scene - handles initial setup and contract deployment
 * Runs once at startup, then redirects to MainMenu or rejoins active battle
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { BrowserDeploymentManager } from "../wallet";
import { Button } from "../widgets/button";
import { logger } from "../main";
import { MockGame2API } from "../mockapi";
import { MainMenu } from "./main";
import { ActiveBattle } from "./battle";
import { registerStartingContent } from "game-content";
import { Subscription } from "rxjs";

export class BootScene extends Phaser.Scene {
    private deployProvider: BrowserDeploymentManager;
    private buttons: Button[] = [];
    private api: DeployedGame2API | undefined;
    private subscription: Subscription | undefined;

    constructor() {
        super('BootScene');
        this.deployProvider = new BrowserDeploymentManager(logger.pino);
    }

    create() {
        // Check if we're in mock mode first - mock mode doesn't use real contracts
        if (import.meta.env.VITE_API_FORCE_DEPLOY === 'mock') {
            logger.network.info('==========MOCK API========');
            this.createDefaultContent(new MockGame2API());
        } else {
            // Check if we should join an existing contract (only for real deployments)
            const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
            if (contractAddress) {
                logger.network.info(`Joining existing contract: ${contractAddress}`);
                this.deployProvider.join(contractAddress).then((api) => {
                    logger.network.info('==========JOINED CONTRACT========');
                    this.initApi(api);
                }).catch((e) => logger.network.error(`Error joining contract: ${e}`));
            } else {
                // Original deploy logic
                switch (import.meta.env.VITE_API_FORCE_DEPLOY) {
                    case 'real':
                        logger.network.info('~deploying~');
                        this.deployProvider.create().then((api) => {
                            logger.network.info('==========GOT API========');
                            this.createDefaultContent(api);
                        }).catch((e) => logger.network.error(`Error connecting: ${e}`));
                        break;
                    default:
                        if (import.meta.env.VITE_API_FORCE_DEPLOY != undefined) {
                            logger.debugging.error(`Unknown VITE_API_FORCE_DEPLOY: ${import.meta.env.VITE_API_FORCE_DEPLOY}`);
                        }
                        this.buttons.push(new Button(this, 75, 48, 128, 84, 'Deploy', 10, () => {
                            logger.network.info('~deploying~');
                            this.deployProvider.create().then((api) => {
                                logger.network.info('==========GOT API========');
                                this.createDefaultContent(api);
                            }).catch((e) => logger.network.error(`Error connecting: ${e}`));
                        }));
                        this.buttons.push(new Button(this, 215, 48, 128, 84, 'Mock Deploy', 10, () => {
                            logger.network.info('==========MOCK API========');
                            this.createDefaultContent(new MockGame2API());
                        }));
                        break;
                }
            }
        }
    }

    private createDefaultContent(api: DeployedGame2API) {
        // Always register full content by default
        // To use minimal content, set VITE_MINIMAL_CONTENT=true in your .env
        const minimalOnly = import.meta.env.VITE_MINIMAL_CONTENT === 'true';
        registerStartingContent(api, minimalOnly, logger.network).then(() => this.initApi(api))
    }

    private initApi(api: DeployedGame2API) {
        this.buttons.forEach((b) => b.destroy());
        this.api = api;

        // Subscribe to state to check for active battles (only first emission)
        let handled = false;
        this.subscription = api.state$.subscribe((state) => {
            // Ensure we only handle the first state emission
            if (handled) return;
            handled = true;

            // Unsubscribe immediately
            this.subscription?.unsubscribe();
            this.subscription = undefined;

            // Check if player has an active battle
            if (state.player !== undefined) {
                const activeBattle = this.findPlayerActiveBattle(state);
                if (activeBattle) {
                    logger.gameState.info(`Active battle detected on boot - rejoining battle ${activeBattle.id}`);
                    this.rejoinBattle(api, activeBattle.config, state);
                    return;
                }
            }

            // No active battle, navigate to MainMenu
            // Remove any existing MainMenu scene first to avoid duplicate key errors
            if (this.scene.get('MainMenu')) {
                this.scene.remove('MainMenu');
            }
            this.scene.add('MainMenu', new MainMenu(api, state));
            this.scene.start('MainMenu');
        });
    }

    /**
     * Find any active battle belonging to the current player
     */
    private findPlayerActiveBattle(state: Game2DerivedState): { config: any, id: bigint } | undefined {
        if (!state.player || !state.playerId) {
            return undefined;
        }

        // Look through all active battle configs for one belonging to this player
        for (const [battleId, config] of state.activeBattleConfigs) {
            if (config.player_pub_key === state.playerId) {
                logger.gameState.debug(`Found active battle for player: ${battleId}`);
                return { config, id: battleId };
            }
        }

        return undefined;
    }

    /**
     * Rejoin an existing active battle
     */
    private rejoinBattle(api: DeployedGame2API, battleConfig: any, state: Game2DerivedState) {
        logger.gameState.info('Rejoining active battle from boot...');
        this.scene.add('ActiveBattle', new ActiveBattle(api, battleConfig, state));
        this.scene.start('ActiveBattle');
    }
}
