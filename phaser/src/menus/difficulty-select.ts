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
import { Loader } from "./loader";
import { difficultyCache } from "../utils/difficultyCache";

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

        this.createDifficultyButtons(maxDifficulties, buttonWidth, buttonHeight, startY, spacingY);

        new TopBar(this, true, this.api, this.state)
            .back(() => {
                this.scene.remove('BiomeSelectMenu');
                this.scene.add('BiomeSelectMenu', new BiomeSelectMenu(this.api!, this.isQuest, this.state));
                this.scene.start('BiomeSelectMenu');
            }, 'Back to Biome Select');
    }

    private async createDifficultyButtons(maxDifficulties: number, buttonWidth: number, buttonHeight: number, startY: number, spacingY: number) {
        // Check if we have cached data for this biome
        const cachedUnlocks = difficultyCache.getCachedForBiome(this.biome);

        let unlockedStates: { [difficulty: number]: boolean };

        if (cachedUnlocks) {
            // Use cached data - no loading screen needed!
            unlockedStates = cachedUnlocks;
        } else {
            // Show loading screen while checking difficulty unlocks
            this.scene.pause().launch('Loader');
            const loader = this.scene.get('Loader') as Loader;
            loader.setText("Checking available difficulties");

            try {
                // Fetch and cache the unlock states
                unlockedStates = await difficultyCache.fetchAndCache(this.api, this.biome, maxDifficulties);

                // Hide loading screen
                this.scene.resume().stop('Loader');
            } catch (error) {
                // Hide loading screen and show error
                this.scene.resume().stop('Loader');
                console.error('Error checking difficulty unlocks:', error);

                // Create fallback - only level 1 unlocked
                unlockedStates = {};
                for (let difficulty = 1; difficulty <= maxDifficulties; difficulty++) {
                    unlockedStates[difficulty] = difficulty === 1;
                }
            }
        }

        // Create buttons with the unlock states
        for (let difficulty = 1; difficulty <= maxDifficulties; difficulty++) {
            const isUnlocked = unlockedStates[difficulty];
            const difficultyName = this.getDifficultyName(difficulty);
            const helpText = !isUnlocked ? `Complete Level ${difficulty - 1} Quest Boss` : undefined;

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
                helpText,
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
                if (helpText) {
                    addTooltip(this, lockIcon, helpText);
                }
            }
        }
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