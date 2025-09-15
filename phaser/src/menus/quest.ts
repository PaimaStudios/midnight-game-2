/**
 * Screen to check if a quest has completed yet, and if it is, to receive rewards.
 * 
 * TODO: Right now we only have a way to check if a quest is completed.
 *       In the future once BlockContext contains the height we can
 *       check this in the main menu as well
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Subscription } from "rxjs";
import { GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { Button } from "../widgets/button";
import { Loader } from "./loader";
import { ActiveBattle } from "./battle";
import { BIOME_ID, biomeToBackground } from "../battle/biome";
import { addScaledImage } from "../utils/scaleImage";
import { SpiritWidget, AbilityWidget } from "../widgets/ability";
import { QuestsMenu } from "./quests";
import { fontStyle } from "../main";
import { Color } from "../constants/colors";
import { QuestConfig } from "game2-contract";
import { TopBar } from "../widgets/top-bar";

export class QuestMenu extends Phaser.Scene {
    api: DeployedGame2API;
    questId: bigint;
    state: Game2DerivedState;
    subscription: Subscription;
    bossBattleId: (bigint | null) | undefined;
    backgroundSet: boolean = false;
    abilitiesDisplayed: boolean = false;
    uiCreated: boolean = false;
    spiritPreviews: SpiritWidget[];
    abilityWidgets: AbilityWidget[];
    summoningTablets: Phaser.GameObjects.Image[];
    statusText: Phaser.GameObjects.Text | undefined;
    initiateButton: Button | undefined;
    topBar: TopBar | undefined;

    constructor(api: DeployedGame2API, questId: bigint, state: Game2DerivedState) {
        super('QuestMenu');

        this.api = api;
        this.questId = questId;
        this.state = state;
        this.spiritPreviews = [];
        this.abilityWidgets = [];
        this.summoningTablets = [];
        this.subscription = api.state$.subscribe({
            next: (state) => {
                try {
                    this.onStateChange(state);
                } catch (error) {
                    // Ignore errors from destroyed scenes
                    logger.gameState.debug(`QuestMenu subscription error (ignoring): ${error}`);
                }
            },
            error: (error) => {
                logger.gameState.debug(`QuestMenu subscription error: ${error}`);
            }
        });
    }

    destroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
        super.destroy();
    }

    create() {
        logger.gameState.info(`Viewing quest ${this.questId}`);
        logger.gameState.info(`QuestMenu.create() called, initializing with existing state...`);
        
        // Show loader while checking quest status
        this.scene.pause().launch('Loader');
        const loader = this.scene.get('Loader') as Loader;
        loader.setText("Checking quest status...");
        
        // Initialize with the state we already have
        this.onStateChange(this.state);
    }

    private onStateChange(state: Game2DerivedState) {

        // Set background based on quest biome (only once)
        if (!this.backgroundSet) {
            const quest = state.quests.get(this.questId);
            if (quest) {
                logger.gameState.info(`Setting background for biome: ${quest.level.biome}`);
                const biomeId = Number(quest.level.biome) as BIOME_ID;
                addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, biomeToBackground(biomeId)).setDepth(-10);
                this.backgroundSet = true;
            } else {
                logger.gameState.warn(`Quest ${this.questId} not found in state`);
            }
        }

        // Display quest abilities (only once)
        if (!this.abilitiesDisplayed) {
            const quest = state.quests.get(this.questId);
            if (quest != undefined) {
                this.displayQuestAbilities(quest, state);
                this.abilitiesDisplayed = true;
            }
        }

        // Create UI elements (only once)
        if (!this.uiCreated) {
            this.createQuestUI(state);
            this.uiCreated = true;
        }

        // Always update quest status when state changes
        if (this.uiCreated) {
            this.updateQuestStatus(state);
        }

        // Handle quest finalization result
        if (this.bossBattleId !== undefined) {
            this.events.emit('questFinalized');
        }
    }

    private displayQuestAbilities(quest: QuestConfig, state: Game2DerivedState) {
        const MAX_ABILITIES = 7;
        const abilities = quest.loadout.abilities;

        // Create summoning tablets and spirit widgets
        for (let i = 0; i < MAX_ABILITIES; ++i) {
            const x = 61 + (i * 0.98 * GAME_WIDTH / MAX_ABILITIES);
            const spiritY = GAME_HEIGHT * 0.25;
            const abilityY = GAME_HEIGHT * 0.50; // Position ability cards below spirits

            // Add summoning tablet background
            this.summoningTablets.push(addScaledImage(this, x, spiritY-5, 'tablet-round').setDepth(1));

            // Get ability from state
            const abilityId = abilities[i];
            const ability = state.allAbilities.get(abilityId);
            
            if (ability) {
                // Create spirit widget for this ability
                const spiritWidget = new SpiritWidget(this, x, spiritY - 36, ability).setDepth(2);
                this.spiritPreviews.push(spiritWidget);

                // Create ability card underneath the spirit
                const abilityWidget = new AbilityWidget(this, x, abilityY, ability);
                this.abilityWidgets.push(abilityWidget);
            }
        }
    }

    private createQuestUI(state: Game2DerivedState) {
        // Status text
        this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.73, '', fontStyle(12))
            .setOrigin(0.5, 0.5)
            .setStroke(Color.Licorice, 10); // Black border, 10px width

        // Top Bar (back)
        this.topBar = new TopBar(this, true, this.api, this.state)
            .back(() => {
                this.scene.remove('QuestsMenu');
                this.scene.add('QuestsMenu', new QuestsMenu(this.api, state));
                this.scene.start('QuestsMenu');
            }, 'Back to Quests');

        // Initiate quest/boss button
        this.initiateButton = new Button(
            this,
            GAME_WIDTH * 0.7,
            GAME_HEIGHT * 0.9,
            220,
            50,
            'Fight Boss',
            14,
            () => {
                this.initiateQuest(state);
            }
        );

        this.updateQuestStatus(state);
    }

    private updateQuestStatus(state: Game2DerivedState) {
        if (!this.statusText || !this.initiateButton) {
            return;
        }

        const quest = state.quests.get(this.questId);
        if (!quest) {
            this.statusText.setText('Quest not found');
            this.initiateButton.setEnabled(false);
            this.initiateButton.setAlpha(0.5);
            return;
        }

        this.api.is_quest_ready(this.questId).then((isReady) => {

            // Hide loader once we have the result
            this.scene.resume().stop('Loader');
            
            if (isReady) {
                this.statusText!.setText('Quest completed! Ready to fight the boss.');
                this.initiateButton!.setEnabled(true);
                this.initiateButton!.setAlpha(1.0);
            } else {
                this.statusText!.setText('Quest in progress... Check back later.');
                this.initiateButton!.setEnabled(false);
                this.initiateButton!.setAlpha(0.5);
            }
        }).catch((err) => {
            // Hide loader on error too
            this.scene.resume().stop('Loader');
            
            logger.network.error(`Error checking quest readiness: ${err}`);
            this.statusText!.setText('Error checking quest status. Try again later.');
            this.initiateButton!.setEnabled(false);
            this.initiateButton!.setAlpha(0.5);
        });
    }

    private initiateQuest(state: Game2DerivedState) {
        // Show loader while finalizing quest
        this.scene.pause().launch('Loader');
        const loader = this.scene.get('Loader') as Loader;
        loader.setText("Finalizing Quest");

        const attemptFinalizeQuest = () => {
            // Set up the event listener BEFORE calling finalize_quest to avoid race condition
            this.events.once('questFinalized', () => {
                this.scene.stop('Loader');
                if (this.bossBattleId !== null) {
                    const battleConfig = state.activeBattleConfigs.get(this.bossBattleId!);
                    if (battleConfig) {
                        logger.gameState.info(`Starting boss battle with ID: ${this.bossBattleId}`);
                        this.scene.remove('ActiveBattle');
                        this.scene.add('ActiveBattle', new ActiveBattle(this.api, battleConfig, state));
                        this.scene.start('ActiveBattle');
                    } else {
                        logger.gameState.error(`Battle config not found for battle ID: ${this.bossBattleId}`);
                        this.scene.resume();
                        this.statusText!.setText('Error: Battle configuration not found.');
                    }
                } else {
                    logger.gameState.error('Quest finalization returned null battle ID');
                    this.scene.resume();
                    this.statusText!.setText('Quest was not ready to be finalized.');
                }
            });

            this.api.finalize_quest(this.questId).then((bossBattleId) => {
                logger.gameState.info(`Quest finalized, boss battle ID: ${bossBattleId}`);
                this.bossBattleId = bossBattleId ?? null;
                loader.setText("Waiting on chain update");

                // If we got a battle ID and state is already updated, emit event immediately
                if (this.bossBattleId !== null && state.activeBattleConfigs.has(this.bossBattleId)) {
                    logger.gameState.info('Battle config already available, starting immediately');
                    this.events.emit('questFinalized');
                }
                // Otherwise, the event will be emitted in onStateChange when battle config is added
            }).catch((err) => {
                this.events.off('questFinalized'); // Remove the event listener
                loader.setText("Error connecting to network.. Retrying");
                logger.network.error(`Error Finalizing Quest: ${err}`);
                setTimeout(attemptFinalizeQuest, 2000);
            });
        };

        attemptFinalizeQuest();
    }
}
