/**
 * Menu to display all active quests and manage quest creation.
 * Shows a list of active quests with a button to start new quests.
 * Includes quest count cap to prevent too many ongoing quests.
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { Subscription } from "rxjs";
import { Button } from "../widgets/button";
import { GAME_HEIGHT, GAME_WIDTH, logger } from "../main";
import { TestMenu } from "./main";
import { BiomeSelectMenu } from "./biome-select";
import { QuestMenu } from "./quest";
import { QuestConfig } from "game2-contract";
import { biomeToName } from "../biome";
import { addScaledImage } from "../utils/scaleImage";
import { DungeonScene } from "./dungeon-scene";

export class QuestsMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    subscription: Subscription;
    buttons: Button[];
    
    // Quest count limit - adjust as needed
    private readonly MAX_ACTIVE_QUESTS = 3;

    constructor(api: DeployedGame2API, state: Game2DerivedState) {
        super('QuestsMenu');
        this.api = api;
        this.state = state;
        this.buttons = [];
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    private questStr(quest: QuestConfig): string {
        return `Quest in ${biomeToName(Number(quest.level.biome))} - ${quest.level.difficulty}`;
    }

    onStateChange(state: Game2DerivedState) {
        this.state = state;
        this.refreshQuestDisplay();
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
        
        this.refreshQuestDisplay();
    }

    private refreshQuestDisplay() {
        // Clear existing buttons
        this.buttons.forEach((b) => b.destroy());
        this.buttons = [];

        const activeQuestCount = this.state.quests.size;
        const canStartNewQuest = activeQuestCount < this.MAX_ACTIVE_QUESTS;

        // New Quest button at the top
        const newQuestButton = new Button(
            this, 
            GAME_WIDTH / 2, 
            GAME_HEIGHT * 0.15, 
            320, 
            64, 
            canStartNewQuest ? 'New Quest' : `Quest Limit (${activeQuestCount}/${this.MAX_ACTIVE_QUESTS})`, 
            14, 
            () => {
                if (canStartNewQuest) {
                    this.scene.remove('BiomeSelectMenu');
                    this.scene.add('BiomeSelectMenu', new BiomeSelectMenu(this.api, true, this.state));
                    this.scene.start('BiomeSelectMenu');
                }
            }
        );
        
        if (!canStartNewQuest) {
            newQuestButton.setAlpha(0.6); // Dim the button when disabled
        }
        
        this.buttons.push(newQuestButton);

        // Display active quests
        let offset = 0;
        for (const [id, quest] of this.state.quests) {
            logger.gameState.debug(`displaying quest: ${id}`);
            const questButton = new Button(
                this, 
                GAME_WIDTH / 2, 
                GAME_HEIGHT * 0.333 + 80 * offset, 
                480, 
                72, 
                this.questStr(quest), 
                10, 
                () => {
                    this.scene.remove('QuestMenu');
                    this.scene.add('QuestMenu', new QuestMenu(this.api, id, this.state));
                    this.scene.start('QuestMenu');
                }
            );
            this.buttons.push(questButton);
            offset += 1;
        }

        // Back button
        const backButton = new Button(
            this, 
            GAME_WIDTH / 2, 
            GAME_HEIGHT * 0.85, 
            200, 
            50, 
            'Back to Hub', 
            12, 
            () => {
                this.scene.remove('TestMenu');
                this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                this.scene.start('TestMenu');
            }
        );
        this.buttons.push(backButton);
    }

    shutdown() {
        this.subscription?.unsubscribe();
    }
}