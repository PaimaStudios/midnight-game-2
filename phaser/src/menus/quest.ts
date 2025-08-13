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
import { TestMenu } from "./main";
import { Button } from "../widgets/button";
import { Loader } from "./loader";
import { ActiveBattle } from "./battle";

export class QuestMenu extends Phaser.Scene {
    api: DeployedGame2API;
    questId: bigint;
    subscription: Subscription;
    bossBattleId: (bigint | null) | undefined;

    constructor(api: DeployedGame2API, questId: bigint) {
        super('QuestMenu');

        this.api = api;
        this.questId = questId;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    create() {
        this.scene.pause().launch('Loader');
        const loader = this.scene.get('Loader') as Loader;
        loader.setText("Submitting Proof");
        logger.gameState.info(`Finalizing quest ${this.questId}`);

        const attemptFinalizeQuest = () => {
            this.api.finalize_quest(this.questId).then((bossBattleId) => {
                this.bossBattleId = bossBattleId ?? null;

                loader.setText("Waiting on chain update");
                // do we still need this?
                // this.events.on('stateChange', () => {
                //     this.scene.resume().stop('Loader');
                // });
            }).catch((err) => {
                loader.setText("Error connecting to network.. Retrying");
                logger.network.error(`Error Finalizing Quest: ${err}`);
                setTimeout(attemptFinalizeQuest, 2000); // Retry after 2 seconds
            });
        };

        attemptFinalizeQuest();
    }

    private onStateChange(state: Game2DerivedState) {
        //this.events.emit('stateChange', state);
        if (this.bossBattleId !== undefined) {
            this.scene.stop('Loader');
            // is this possible to trigger without it being available yet?
            if (this.bossBattleId !== null) {
                this.scene.remove('ActiveBattle');
                this.scene.add('ActiveBattle', new ActiveBattle(this.api, state.activeBattleConfigs.get(this.bossBattleId)!, state));
                this.scene.start('ActiveBattle');
            } else {
                this.scene.resume();
                new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.3, `Quest not finished yet.\nClick to return.`, 16, () => {
                    this.scene.remove('TestMenu');
                    this.scene.add('TestMenu', new TestMenu(this.api, state));
                    this.scene.start('TestMenu');
                });
            }
        }
    }
}
