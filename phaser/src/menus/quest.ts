/**
 * Screen to check if a quest has completed yet, and if it is, to receive rewards.
 * 
 * TODO: Right now we only have a way to check if a quest is completed.
 *       In the future once BlockContext contains the height we can
 *       check this in the main menu as well
 */
import { DeployedGame2API, Game2DerivedState } from "game2-api";
import { BattleRewards } from "game2-contract";
import { Subscription } from "rxjs";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH } from "../main";
import { TestMenu } from "./main";
import { Button } from "./button";
import { AbilityWidget } from "../ability";

export class QuestMenu extends Phaser.Scene {
    api: DeployedGame2API;
    questId: bigint;
    subscription: Subscription;
    //state: Game2DerivedState | undefined;
    rewards: BattleRewards | undefined;

    constructor(api: DeployedGame2API, questId: bigint) {
        super('QuestMenu');

        this.api = api;
        this.questId = questId;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    create() {
        this.api.finalize_quest(this.questId).then((rewards) => {
            this.rewards = rewards;
        });
    }

    private onStateChange(state: Game2DerivedState) {
        //this.state = state;
        const rewards = this.rewards!;
        if (rewards != undefined) {
            const str = rewards.alive ? `Quest Complete!\nYou won ${rewards.gold} gold!\nClick to return.` : `You died :(\nClick to return.`;
            new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.4, str, 16, () => {
                this.scene.remove('TestMenu');
                this.scene.add('TestMenu', new TestMenu(this.api, state));
                this.scene.start('TestMenu');
            });
            if (rewards.alive && rewards.ability.is_some) {
                new AbilityWidget(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.7, state?.allAbilities.get(rewards.ability.value)!);
                this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.9, 'New ability available', fontStyle(12)).setOrigin(0.5, 0.5);
            }
        } else {
            new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.3, `Quest not finished yet.\n\nClick to return.`, 16, () => {
                this.scene.remove('TestMenu');
                this.scene.add('TestMenu', new TestMenu(this.api, state));
                this.scene.start('TestMenu');
            });
        }
    }
}
