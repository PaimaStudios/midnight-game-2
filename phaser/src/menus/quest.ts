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
    backButton: Button | undefined;

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
        
        // Initialize with the state we already have
        this.onStateChange(this.state);
    }

    private onStateChange(state: Game2DerivedState) {
        logger.gameState.info(`QuestMenu.onStateChange() called, quest exists: ${state.quests.has(this.questId)}`);
        
        // Set background based on quest biome (only once)
        if (!this.backgroundSet) {
            const quest = state.quests.get(this.questId);
            if (quest) {
                logger.gameState.info(`Setting background for biome: ${quest.battle_config.biome}`);
                const biomeId = Number(quest.battle_config.biome) as BIOME_ID;
                addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, biomeToBackground(biomeId)).setDepth(-10);
                this.backgroundSet = true;
            } else {
                logger.gameState.warn(`Quest ${this.questId} not found in state`);
            }
        }

        // Display quest abilities (only once)
        if (!this.abilitiesDisplayed) {
            const quest = state.quests.get(this.questId);
            if (quest) {
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
        if (this.bossBattleId !== undefined) {
            this.events.emit('questFinalized');
        }
    }

    private displayQuestAbilities(quest: any, state: Game2DerivedState) {
        const MAX_ABILITIES = 7;
        const abilities = quest.battle_config.loadout.abilities;

        // Create summoning tablets and spirit widgets
        for (let i = 0; i < MAX_ABILITIES; ++i) {
            const x = 61 + (i * 0.98 * GAME_WIDTH / MAX_ABILITIES);
            const spiritY = GAME_HEIGHT * 0.25; // Moved up by ~50 pixels
            const abilityY = GAME_HEIGHT * 0.50; // Position ability cards below spirits

            // Add summoning tablet background
            this.summoningTablets.push(addScaledImage(this, x, spiritY, 'tablet-round').setDepth(1));

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
        this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.72, '', fontStyle(16))
            .setOrigin(0.5, 0.5);

        // Back button
        this.backButton = new Button(
            this,
            GAME_WIDTH * 0.3,
            GAME_HEIGHT * 0.85,
            200,
            50,
            'Back',
            14,
            () => {
                this.scene.remove('QuestsMenu');
                this.scene.add('QuestsMenu', new QuestsMenu(this.api, state));
                this.scene.start('QuestsMenu');
            }
        );

        // Initiate quest/boss button
        this.initiateButton = new Button(
            this,
            GAME_WIDTH * 0.7,
            GAME_HEIGHT * 0.85,
            200,
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
        if (!this.statusText || !this.initiateButton) return;

        const quest = state.quests.get(this.questId);
        if (!quest) {
            this.statusText.setText('Quest not found');
            this.initiateButton.setEnabled(false);
            this.initiateButton.setAlpha(0.5);
            return;
        }

        this.api.is_quest_ready(this.questId).then((isReady) => {
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
            this.api.finalize_quest(this.questId).then((bossBattleId) => {
                this.bossBattleId = bossBattleId ?? null;
                loader.setText("Waiting on chain update");

                // Wait for state change to handle battle start
                this.events.once('questFinalized', () => {
                    this.scene.stop('Loader');
                    if (this.bossBattleId !== null) {
                        const battleConfig = state.activeBattleConfigs.get(this.bossBattleId!);
                        if (battleConfig) {
                            this.scene.remove('ActiveBattle');
                            this.scene.add('ActiveBattle', new ActiveBattle(this.api, battleConfig, state));
                            this.scene.start('ActiveBattle');
                        } else {
                            this.scene.resume();
                            this.statusText!.setText('Error: Battle configuration not found.');
                        }
                    } else {
                        this.scene.resume();
                        this.statusText!.setText('Quest was not ready to be finalized.');
                    }
                });
            }).catch((err) => {
                loader.setText("Error connecting to network.. Retrying");
                logger.network.error(`Error Finalizing Quest: ${err}`);
                setTimeout(attemptFinalizeQuest, 2000);
            });
        };

        attemptFinalizeQuest();
    }
}
