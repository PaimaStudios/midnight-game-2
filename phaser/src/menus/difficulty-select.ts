import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { BIOME_ID, biomeToName, biomeToBackground } from "../battle/biome";
import { Subscription } from "rxjs";
import { Button } from "../widgets/button";
import { GAME_HEIGHT, GAME_WIDTH, fontStyle } from "../main";
import { BiomeSelectMenu } from "./biome-select";
import { StartBattleMenu } from "./pre-battle";
import { DungeonScene } from "./dungeon-scene";
import { TopBar } from "../widgets/top-bar";
import { addScaledImage } from "../utils/scaleImage";
import { Color } from "../constants/colors";
import { addTooltip } from "../widgets/tooltip";

export class DifficultySelectMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    isQuest: boolean;
    biome: BIOME_ID;
    subscription: Subscription;
    topBar: TopBar | undefined;

    constructor(api: DeployedGame2API, biome: BIOME_ID, isQuest: boolean, state: Game2DerivedState) {
        super('DifficultySelectMenu');
        this.api = api;
        this.biome = biome;
        this.isQuest = isQuest;
        this.state = state;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    onStateChange(state: Game2DerivedState) {
        this.state = state;
    }

    create() {
        // Set biome-specific background
        addScaledImage(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, biomeToBackground(this.biome)).setDepth(-10);

        // Add and launch dungeon background scene (shared across hub scenes)
        if (!this.scene.get('DungeonScene')) {
            this.scene.add('DungeonScene', new DungeonScene());
        }
        // Only launch if not already running
        const dungeonScene = this.scene.get('DungeonScene');
        if (dungeonScene && !dungeonScene.scene.isActive()) {
            this.scene.launch('DungeonScene');
        }

        // Create title
        this.add.text(
            GAME_WIDTH / 2,
            40,
            `${biomeToName(this.biome)}`,
            {
                ...fontStyle(16),
                color: Color.White,
                align: 'center'
            }
        ).setOrigin(0.5).setStroke(Color.Licorice, 8);
        this.add.text(
            GAME_WIDTH / 2,
            90,
            `Select Difficulty`,
            {
                ...fontStyle(12),
                color: Color.White,
                align: 'center'
            }
        ).setOrigin(0.5).setStroke(Color.Licorice, 8);

        // Create difficulty level buttons (up to 3 difficulties)
        const maxDifficulties = 3;
        const buttonWidth = 320;
        const buttonHeight = 64;
        const startY = GAME_HEIGHT * 0.35;
        const spacingY = 100;

        for (let difficulty = 1; difficulty <= maxDifficulties; difficulty++) {
            const isUnlocked = this.isDifficultyUnlocked(this.biome, difficulty);
            const difficultyName = this.getDifficultyName(difficulty);

            const button = new Button(
                this,
                GAME_WIDTH / 2,
                startY + (difficulty - 1) * spacingY,
                buttonWidth,
                buttonHeight,
                difficultyName,
                12,
                () => {
                    if (isUnlocked) {
                        this.scene.remove('StartBattleMenu');
                        this.scene.add('StartBattleMenu', new StartBattleMenu(this.api!, this.biome, this.isQuest, this.state, difficulty));
                        this.scene.start('StartBattleMenu');
                    }
                },
                !isUnlocked && difficulty > 1 ? `Complete Level ${difficulty - 1} Boss` : undefined
            );

            // Disable button if difficulty is locked
            if (!isUnlocked) {
                button.setEnabled(false);

                // Add lock icon as visual indicator with tooltip
                const lockIcon = addScaledImage(
                    this,
                    GAME_WIDTH / 2 + buttonWidth / 2 + 30,
                    (startY + (difficulty - 1) * spacingY) - 5,
                    'lock-icon'
                ).setOrigin(0.5);

                // Add tooltip to the lock icon (only if not level 1)
                if (difficulty > 1) {
                    addTooltip(this, lockIcon, `Complete Level ${difficulty - 1} Boss`);
                }
            }
        }

        new TopBar(this, true, this.api, this.state)
            .back(() => {
                this.scene.remove('BiomeSelectMenu');
                this.scene.add('BiomeSelectMenu', new BiomeSelectMenu(this.api!, this.isQuest, this.state));
                this.scene.start('BiomeSelectMenu');
            }, 'Back to Biome Select');
    }

    private isDifficultyUnlocked(biome: BIOME_ID, difficulty: number): boolean {
        // Level 1 is always unlocked
        if (difficulty <= 1) {
            return true;
        }

        // Check if the previous difficulty's boss has been completed
        const previousLevelKey = `${biome}-${difficulty - 1}`;
        return this.state.playerBossCompletions.get(previousLevelKey) === true;
    }

    private getDifficultyName(difficulty: number): string {
        switch (difficulty) {
            case 1:
                return 'Beginner';
            case 2:
                return 'Intermediate';
            case 3:
                return 'Master';
            default:
                return `Level ${difficulty}`;
        }
    }
}