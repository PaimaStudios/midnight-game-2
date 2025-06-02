import { DeployedGame2API, Game2DerivedState, safeJSONString } from "game2-api";
import { fontStyle, GAME_HEIGHT, GAME_WIDTH } from "../main";
import { Button } from "./button";
import { Ability, BattleConfig, EFFECT_TYPE, pureCircuits } from "game2-contract";
import { TestMenu } from "./main";
import { Subscription } from "rxjs";
import { AbilityWidget } from "../ability";
import { combat_round_logic } from "../battle/logic";

export class ActiveBattle extends Phaser.Scene {
    api: DeployedGame2API;
    subscription: Subscription;
    battle: BattleConfig;
    state: Game2DerivedState | undefined;
    player: Actor | undefined;
    enemies: Actor[];
    abilityIcons: AbilityWidget[];

    constructor(api: DeployedGame2API, battle: BattleConfig) {
        super("ActiveBattle");

        this.api = api;
        this.battle = battle;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
        this.enemies = [];
        this.abilityIcons = [];
    }

    create() {
        this.player = new Actor(this, playerX(), playerY(), 100, 100, 'player');
        for (let i = 0; i < this.battle.enemy_count; ++i) {
            const stats = this.battle.stats[i];
            this.enemies.push(new Actor(this, enemyX(this.battle, i), enemyY(), Number(stats.hp), Number(stats.hp), 'enemy'));
        }

        // attack button
        const button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.95, 320, 48, this.matchStr(this.battle), 10, async () => {
            button.visible = false;
            const id = pureCircuits.derive_battle_id(this.battle);
            // TODO: handle if state change triggerd by network before UI finished resolving?
            // or should we more distinctly separate proving and sending?
            // we will need that for combining multiple rounds if we get proof composition in time
            const [circuit, ui] = await Promise.all([
                // prove and submit circuit
                this.api.combat_round(id),
                // run the same logic simultaneously and trigger UI callbacks
                combat_round_logic(id, this.state!, {
                    onEnemyBlock: (enemy: number, amount: number) => new Promise((resolve) => {
                        this.enemies[enemy].addBlock(amount);
                        //console.log(`enemy [${amount}] blocked for ${}`);
                        this.add.existing(new BattleEffect(this, enemyX(this.battle, enemy), enemyY() - 32, EFFECT_TYPE.block, amount, resolve));
                    }),
                    onEnemyAttack: (enemy: number, amount: number) => new Promise((resolve) => {
                        this.player?.damage(amount);
                        this.add.existing(new BattleEffect(this, enemyX(this.battle, enemy), enemyY() - 32, EFFECT_TYPE.attack_phys, amount, resolve));
                    }),
                    onPlayerEffect: (target: number, effectType: EFFECT_TYPE, amount: number) => new Promise((resolve) => {
                        switch (effectType) {
                            case EFFECT_TYPE.attack_fire:
                            case EFFECT_TYPE.attack_ice:
                            case EFFECT_TYPE.attack_phys:
                                //console.log(`enemy ${target} took ${effect.amount} damage`);
                                this.enemies[target].damage(amount);
                                break;
                            case EFFECT_TYPE.block:
                                this.player?.addBlock(amount);
                                break;
                            case EFFECT_TYPE.generate:
                                // TODO
                                break;
                        }
                        this.add.existing(new BattleEffect(this, playerX(), playerY() - 32, effectType, amount, resolve));
                    }),
                    onPlayerAbilities: (abilities: Ability[]) => new Promise((resolve) => {
                        this.abilityIcons = abilities.map((ability, i) => new AbilityWidget(this, GAME_WIDTH * (i + 0.5) / abilities.length, GAME_HEIGHT * 0.75, ability).setAlpha(0));
                        this.tweens.add({
                            targets: this.abilityIcons,
                            alpha: 1,
                            duration: 500,
                            onComplete: () => {
                                resolve();
                            },
                        });
                    }),
                }),
            ]);
            this.player?.setBlock(0);
            for (const enemy of this.enemies) {
                enemy.setBlock(0);
            }
            this.abilityIcons.forEach((a) => a.destroy());
            this.abilityIcons = [];
            //console.log(`UI:      ui: ${this.state?.ui}, circuit: ${this.state?.circuit}`);
            //console.log(`CIRCUIT: ui: ${(this.api as MockGame2API).mockState.ui}, circuit: ${(this.api as MockGame2API).mockState.circuit}`);
            console.log(`------------------ BATTLE DONE --- BOTH UI AND LOGIC ----------------------`);
            // TODO: check consistency (either here or in onStateChange())
            //
            // TODO: move this out of here? it gets reset by onStateChange() and also results in an error:
            //
            //    Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'updatePenManager')
            //       at BBCodeText.updateText (index-eba13966.js:322545:24)
            //       at BBCodeText.setText (index-eba13966.js:322484:14)
            //       at index-eba13966.js:393191:23
            console.log(`UI REWARDS: ${safeJSONString(ui ?? { none: 'none' })}`);
            console.log(`CIRCUIT REWARDS: ${safeJSONString(circuit ?? { none: 'none' })}`);
            button.visible = true;
            if (ui != undefined) {
                button.destroy();
                const battleOverText = ui.alive ? `you won ${ui.gold} gold!` : `you died :(`;
                new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.6, 256, 96, battleOverText, 24, () => {
                    this.scene.remove('TestMenu');
                    this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                    this.scene.start('TestMenu');
                });
            } else {
                button.text.setText(this.matchStr(this.battle));
            }
        });
    }

    private matchStr(battle: BattleConfig): string {
        if (this.state != undefined) {
            console.log(`trying to get ${pureCircuits.derive_battle_id(battle)} [${this.state?.activeBattleStates.get(pureCircuits.derive_battle_id(battle)) != undefined}][${this.state?.activeBattleConfigs.get(pureCircuits.derive_battle_id(battle)) != undefined}] there are ${this.state!.activeBattleConfigs.size} | ${this.state!.activeBattleStates.size}`);
        } else {
            console.log(`we dont even have the state yet`);
            return 'Click to attack';
        }
        const state = this.state?.activeBattleStates.get(pureCircuits.derive_battle_id(battle));
        return state != undefined ? `Click to attack.\nPlayer HP: ${state.player_hp} | Enemy HP:  ${state.enemy_hp_0}/ ${state.enemy_hp_1}/${state.enemy_hp_2}` : '404';
    }

    private onStateChange(state: Game2DerivedState) {
        console.log(`ActiveBattle.onStateChange(): ${safeJSONString(state)}`);

        this.state = structuredClone(state);//Object.assign({}, state);
    }
}

function enemyX(config: BattleConfig, enemyIndex: number): number {
    return GAME_WIDTH * (enemyIndex + 0.5) / Number(config.enemy_count);
}

const enemyY = () => GAME_HEIGHT * 0.2;

const playerX = () => GAME_WIDTH / 2;
const playerY = () => GAME_HEIGHT * 0.6;

class Actor extends Phaser.GameObjects.Container {
    hp: number;
    maxHp: number;
    hpText: Phaser.GameObjects.Text;
    block: number;
    blockText: Phaser.GameObjects.Text;

    // TODO: ActorConfig or Stats or whatever
    constructor(scene: Phaser.Scene, x: number, y: number, hp: number, maxHp: number, texture: string) {
        super(scene, x, y);

        this.hp = hp;
        this.maxHp = maxHp;
        this.hpText = scene.add.text(0, 16, '', fontStyle(12)).setOrigin(0.5, 0.5);
        this.block = 0;
        this.blockText = scene.add.text(0, -48, '', fontStyle(12)).setOrigin(0.5, 0.5);

        this.add(this.hpText);
        this.add(this.blockText);

        this.setHp(hp);

        this.add(scene.add.image(0, 0, texture));

        this.setSize(32, 32);

        scene.add.existing(this);
    }

    public addBlock(amount: number) {
        this.setBlock(this.block + amount);
    }

    public damage(amount: number) {
        if (amount > this.block) {
            this.setHp(this.hp - amount + this.block);
            this.setBlock(0);
        } else {
            this.setBlock(this.block - amount);
        }
    }

    private setHp(hp: number) {
        this.hp = Math.max(0, hp);
        this.hpText.setText(this.hp <= 0 ? 'DEAD' : `${this.hp} / ${this.maxHp} HP`);
    }

    public setBlock(block: number) {
        this.block = block;
        this.blockText.setText(block == 0 ? '' : `${block} Block`);
    }
}

// amount is only here to tell what type of generation it is
// TODO DECISION: should this be the case? the re-use. or should it be separate generation types???
export function effectTypeToIcon(effectType: EFFECT_TYPE, amount: number): string {
    switch (effectType) {
        case EFFECT_TYPE.attack_fire:
            return 'fire';
        case EFFECT_TYPE.attack_ice:
            return 'ice';
        case EFFECT_TYPE.attack_phys:
            return 'physical';
        case EFFECT_TYPE.block:
            return 'block';
        case EFFECT_TYPE.generate:
            return `energy_${amount}`;                                                    
    }
}

export class BattleEffect extends Phaser.GameObjects.Container {
    constructor(scene: Phaser.Scene, x: number, y: number, effectType: EFFECT_TYPE, amount: number, onComplete: () => void) {
        super(scene, x, y);

        if (effectType != EFFECT_TYPE.generate) {
            this.add(scene.add.text(12, 0, amount.toString(), fontStyle(12)));
        }
        this.add(scene.add.sprite(-12, 0, effectTypeToIcon(effectType, amount)));

        this.setSize(48, 48);
        //console.log(`BattleEffect START ${effectType} | ${amount}`);
        scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 500,
            onComplete: () => {
                //console.log(`BattleEffect COMPLETE ${effectType} | ${amount}`);
                onComplete();
            },
        });
    }
}