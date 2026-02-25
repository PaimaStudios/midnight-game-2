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
import { NetworkError } from "./network-error";
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
    battleStarted: boolean = false;
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
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
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
        logger.gameState.info(`QuestMenu.onStateChange() called, quest exists: ${state.quests.has(this.questId)}`);

        this.state = state;

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
        } else {
            // Update quest status if UI already exists
            this.updateQuestStatus(state);
        }

        // Handle quest finalization result
        if (this.bossBattleId !== undefined && this.bossBattleId !== null) {
            // Only start battle when the battle config is actually available in state
            if (state.activeBattleConfigs.has(this.bossBattleId)) {
                logger.gameState.info('Battle config now available in state, starting boss battle');
                this.startBossBattle();
            }
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
                this.initiateQuest();
            }
        );

        this.updateQuestStatus(state);
    }

    private updateQuestStatus(state: Game2DerivedState) {
        // If UI not ready or scene is fully stopped, skip update
        // Note: We allow paused scenes since we pause during loading
        if (!this.statusText || !this.initiateButton) return;

        // Check if scene is running (active or paused, but not stopped)
        const scenePlugin = this.scene.get('QuestMenu');
        if (!scenePlugin || !this.scene.isVisible('QuestMenu')) return;

        const quest = state.quests.get(this.questId);
        if (!quest) {
            // Quest was finalized or doesn't exist, stop loader
            this.scene.resume().stop('Loader');
            if (this.statusText) {
                this.statusText.setText('Quest not found or already completed.');
            }
            if (this.initiateButton) {
                this.initiateButton.setEnabled(false);
                this.initiateButton.setAlpha(0.5);
            }
            return;
        }

            // Check again before updating UI in case scene was stopped
            if (!this.statusText || !this.initiateButton || !this.scene.isVisible('QuestMenu')) return;

            // Hide loader once we have the result
            this.scene.resume().stop('Loader');

            this.statusText!.setText('Quest completed! Ready to fight the boss.');
            this.initiateButton!.setEnabled(true);
            this.initiateButton!.setAlpha(1.0);

    }

    private startBossBattle() {
        if (this.battleStarted) {
            logger.gameState.warn('Battle already started, ignoring duplicate call');
            return;
        }

        if (this.bossBattleId === null || this.bossBattleId === undefined) {
            logger.gameState.error('Cannot start boss battle: no battle ID');
            return;
        }

        const battleConfig = this.state.activeBattleConfigs.get(this.bossBattleId);
        if (battleConfig) {
            logger.gameState.info(`Starting boss battle with ID: ${this.bossBattleId}`);
            this.battleStarted = true;
            // Clean up subscription before starting battle
            this.subscription?.unsubscribe();
            this.scene.stop('Loader');
            this.scene.remove('ActiveBattle');
            this.scene.add('ActiveBattle', new ActiveBattle(this.api, battleConfig, this.state));
            this.scene.start('ActiveBattle');
            // Stop QuestMenu scene to prevent it from receiving more updates
            this.scene.stop('QuestMenu');
        } else {
            logger.gameState.error(`Battle config not found for battle ID: ${this.bossBattleId}`);
            this.scene.stop('Loader');
            this.scene.resume();
            this.statusText!.setText('Error: Battle configuration not found.');
        }
    }

    private initiateQuest() {
        logger.gameState.info(`initiateQuest() called for quest ${this.questId}`);

        // Show loader while finalizing quest
        this.scene.pause().launch('Loader');
        const loader = this.scene.get('Loader') as Loader;
        loader.setText("Finalizing Quest");

        const attemptFinalizeQuest = () => {
            logger.gameState.info(`Calling finalize_quest API for quest ${this.questId}`);
            this.api.finalize_quest(this.questId).then((bossBattleId) => {
                logger.gameState.info(`Quest finalized, boss battle ID: ${bossBattleId}`);
                this.bossBattleId = bossBattleId ?? null;

                if (this.bossBattleId === null) {
                    logger.gameState.error('Quest finalization returned null battle ID');
                    this.scene.stop('Loader');
                    this.scene.resume();
                    this.statusText!.setText('Quest was not ready to be finalized.');
                    return;
                }

                loader.setText("Waiting for battle config...");

                // Check if battle config is already available
                if (this.state.activeBattleConfigs.has(this.bossBattleId)) {
                    logger.gameState.info('Battle config already available, starting immediately');
                    this.startBossBattle();
                }
                // Otherwise, wait for onStateChange to call startBossBattle when battle config appears
                // (onStateChange will detect bossBattleId is set and battle config exists)
            }).catch((err) => {
                this.events.off('questFinalized'); // Remove the event listener
                this.scene.stop('Loader');

                logger.network.error(`Error Finalizing Quest: ${err}`);

                // Show network error overlay
                if (!this.scene.get('NetworkError')) {
                    this.scene.add('NetworkError', new NetworkError());
                }
                const networkErrorScene = this.scene.get('NetworkError') as NetworkError;
                networkErrorScene.setErrorMessage('Network Error during quest finalization. Retrying...');
                this.scene.launch('NetworkError');

                setTimeout(() => {
                    this.scene.stop('NetworkError');
                    this.scene.pause().launch('Loader');
                    attemptFinalizeQuest();
                }, 2000);
            });
        };

        attemptFinalizeQuest();
    }

    shutdown() {
        this.subscription?.unsubscribe();
    }
}
