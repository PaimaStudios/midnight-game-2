import { NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import '@midnight-ntwrk/dapp-connector-api';
import { type Game2DerivedState, type DeployedGame2API, Game2API } from 'game2-api';
import './globals';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { LedgerState } from '@midnight-ntwrk/ledger';
import { BrowserDeploymentManager } from './wallet';
import * as pino from 'pino';

// TODO: get this properly? it's undefined if i uncomment this
//const networkId = import.meta.env.VITE_NETWORK_ID as NetworkId;
//const networkId = NetworkId.TestNet;
export const networkId = getNetworkId();

function getNetworkId(): NetworkId {
    switch (import.meta.env.MODE) {
        case 'undeployed':
            return NetworkId.Undeployed;
        case 'testnet':
            return NetworkId.TestNet;
        default:
            console.error('Unknown Vite MODE, defaulting to undeployed');
            return NetworkId.Undeployed;
    }
}
// Ensure that the network IDs are set within the Midnight libraries.
setNetworkId(networkId);
export const logger = pino.pino({
    level: import.meta.env.VITE_LOGGING_LEVEL as string,
});
console.log(`networkId = ${networkId}`);

console.log(`VITE: [\n${JSON.stringify(import.meta.env)}\n]`);
// phaser part

import 'phaser';
import RexUIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin'
import BBCodeTextPlugin from 'phaser3-rex-plugins/plugins/bbcodetext-plugin.js';
//import KeyboardPlugin from 'phaser3-';
import RoundRectanglePlugin from 'phaser3-rex-plugins/plugins/roundrectangle-plugin.js';
import { extend } from 'fp-ts/lib/pipeable';
import { Subscriber, Observable, Subscription } from 'rxjs';

import { Button } from './menus/button';
import { MOCK_PLAYER_ID, MockGame2API } from './mockapi';
import { Ability, BattleConfig, Effect, EFFECT_TYPE, PlayerLoadout, pureCircuits, QuestConfig } from 'game2-contract';
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext';
import { init } from 'fp-ts/lib/ReadonlyNonEmptyArray';
import { combat_round_logic } from './battle/logic';

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 360;

export function fontStyle(fontSize: number, extra?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle {
    // this font is really small for some reason, so double it
    return {
        ...extra,
        fontSize: fontSize * 2,
        fontFamily: 'yana',
        color: '#f5f5ed'//'white'
    };
}

// only converts bigint, but this is the only problem we have with printing ledger types
export function safeJSONString(obj: object): string {
    // hacky but just doing it manually since otherwise: 'string' can't be used to index type '{}'
    // let newObj = {}
    // for (let [key, val] of Object.entries(obj)) {
    //     if (typeof val == 'bigint') {
    //         newObj[key] = Number(val);
    //     } else {
    //         newObj[key] = val;
    //     }
    // }
    // return JSON.stringify(newObj);
    if (typeof obj == 'bigint') {
        return Number(obj).toString();
    } else if (Array.isArray(obj)) {
        let str = '[';
        let innerFirst = true;
        for (let i = 0; i < obj.length; ++i) {
            if (!innerFirst) {
                str += ', ';
            }
            innerFirst = false;
            str += safeJSONString(obj[i]);
        }
        str += ']';
        return str;
    } else if (typeof obj == 'object') {
        let str = '{';
        let first = true;
        for (let [key, val] of Object.entries(obj)) {
            if (!first) {
                str += ', ';
            }
            first = false;
            str += `"${key}": ${safeJSONString(val)}`;
        }
        str += '}';
        return str;
    }
    return JSON.stringify(obj);
}

export function rootObject(obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform): Phaser.GameObjects.Components.Transform {
    while (obj.parentContainer != undefined) {
        obj = obj.parentContainer;
    }
    return obj;
}

function scaleToWindow(): number {
    return Math.floor(Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT));
}

export class AbilityWidget extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    ability: Ability;

    constructor(scene: Phaser.Scene, x: number, y: number, ability: Ability) {
        super(scene, x, y);
        this.setSize(48, 48);
        this.bg = scene.add.nineslice(0, 0, 'stone_button', undefined, 48, 48, 8, 8, 8, 8);
        this.ability = ability;

        this.add(this.bg);
        if (ability.effect.is_some) {
            switch (ability.effect.value.effect_type) {
                case EFFECT_TYPE.attack_fire:
                    this.add(scene.add.image(0, 0, 'fire'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.attack_ice:
                    this.add(scene.add.image(0, 0, 'ice'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.attack_phys:
                    this.add(scene.add.image(0, 0, 'physical'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
                case EFFECT_TYPE.block:
                    this.add(scene.add.image(0, 0, 'block'));
                    this.add(scene.add.text(0, 8, ability.effect.value.amount.toString(), fontStyle(8)));
                    break;
            }
        }

        scene.add.existing(this);
    }
}

function randomAbility(): Ability {
    const randomEffect = (enabled: boolean) => {
        return {
            is_some: enabled,
            value: { effect_type: Phaser.Math.Between(0, 3) as EFFECT_TYPE, amount: BigInt(Phaser.Math.Between(1, 4)), is_aoe: false},
        };
    };
    return {
        effect: randomEffect(true),
        on_energy: [randomEffect(false), randomEffect(false), randomEffect(false)],
    };
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
        console.log(`BattleEffect START ${effectType} | ${amount}`);
        scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 500,
            onComplete: () => {
                console.log(`BattleEffect COMPLETE ${effectType} | ${amount}`);
                onComplete();
            },
        });
    }
}

export class StartBattleMenu extends Phaser.Scene {
    api: DeployedGame2API;
    state: Game2DerivedState;
    loadout: PlayerLoadout;
    available: AbilityWidget[];
    chosen: boolean[];
    isQuest: boolean;

    constructor(api: DeployedGame2API, isQuest: boolean, state: Game2DerivedState) {
        super('StartBattleMenu');
        this.api = api;
        this.loadout = {
            abilities: [],
        };
        this.available = [];
        this.chosen = [];
        this.isQuest = isQuest;
        this.state = state;
    }

    create() {
        let abilities = [];
        for (const [id, count] of this.state.playerAbilities) {
            for (let i = 0; i < count; ++i) {
                abilities.push(id);
            }
        }
        for (let i = 0; i < abilities.length; ++i) {
            const ability = abilities[i];
            const abilityWidget = new AbilityWidget(this, 32 + i * 48, GAME_HEIGHT * 0.8, this.state.allAbilities.get(ability)!);
            this.available.push(abilityWidget);
            this.chosen.push(false);
            const button = new Button(this, 32 + i * 48, GAME_HEIGHT * 0.8 - 48, 48, 24, '^', 10, () => {
                if (this.chosen[i]) {
                    abilityWidget.y += 48 + 48;
                    button.text.text = '^';
                } else {
                    abilityWidget.y -= 48 + 48;
                    button.text.text = 'v';
                }
                this.chosen[i] = !this.chosen[i];
            });
        }
        new Button(this, GAME_WIDTH / 2, 64, 64, 24, 'Start', 10, () => {
            this.loadout.abilities = [];
            for (let i = 0; i < this.chosen.length; ++i) {
                if (this.chosen[i]) {
                    this.loadout.abilities.push(pureCircuits.derive_ability_id(this.available[i].ability));
                }
            }
            if (this.loadout.abilities.length == 7) {
                if (this.isQuest) {
                    // TODO: control difficulty
                    this.api.start_new_quest(this.loadout, BigInt(1)).then((questId) => {
                        this.scene.remove('TestMenu');
                        this.scene.add('TestMenu', new TestMenu(this.api));
                        this.scene.start('TestMenu');
                    });
                } else {
                    this.api.start_new_battle(this.loadout).then((battle) => {
                        this.scene.remove('ActiveBattle');
                        this.scene.add('ActiveBattle', new ActiveBattle(this.api, battle));
                        this.scene.start('ActiveBattle');
                    });
                }
            } else {
                console.log(`finish selecting abilities (selected ${this.loadout.abilities.length}, need 7)`);
            }
        });
    }
}

function enemyX(config: BattleConfig, enemyIndex: number): number {
    return GAME_WIDTH * (enemyIndex + 0.5) / Number(config.enemy_count);
}

const enemyY = GAME_HEIGHT * 0.2;

const playerX = GAME_WIDTH / 2;
const playerY = GAME_HEIGHT * 0.6;

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

export class QuestMenu extends Phaser.Scene {
    api: DeployedGame2API;
    questId: bigint;
    subscription: Subscription;
    state: Game2DerivedState | undefined;

    constructor(api: DeployedGame2API, questId: bigint) {
        super('QuestMenu');

        this.api = api;
        this.questId = questId;
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    create() {
        this.api.finalize_quest(this.questId).then((rewards) => {
            if (rewards != undefined) {
                const str = rewards.alive ? `Quest Complete!\n\nYou won ${rewards.gold} gold!\n\nClick to return.` : `You died :(\nClick to return.`;
                new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.5, str, 16, () => {
                    this.scene.remove('TestMenu');
                    this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                    this.scene.start('TestMenu');
                });
            } else {
                new Button(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.8, GAME_HEIGHT * 0.3, `Quest not finished yet.\n\nClick to return.`, 16, () => {
                    this.scene.remove('TestMenu');
                    this.scene.add('TestMenu', new TestMenu(this.api, this.state));
                    this.scene.start('TestMenu');
                });
            }
        });
    }

    private onStateChange(state: Game2DerivedState) {
        this.state = state;
    }
}

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
        this.player = new Actor(this, playerX, playerY, 100, 100, 'player');
        for (let i = 0; i < this.battle.enemy_count; ++i) {
            const stats = this.battle.stats[i];
            this.enemies.push(new Actor(this, enemyX(this.battle, i), enemyY, Number(stats.hp), Number(stats.hp), 'enemy'));
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
                        this.add.existing(new BattleEffect(this, enemyX(this.battle, enemy), enemyY - 32, EFFECT_TYPE.block, amount, resolve));
                    }),
                    onEnemyAttack: (enemy: number, amount: number) => new Promise((resolve) => {
                        this.player?.damage(amount);
                        this.add.existing(new BattleEffect(this, enemyX(this.battle, enemy), enemyY - 32, EFFECT_TYPE.attack_phys, amount, resolve));
                    }),
                    onPlayerEffect: (target: number, effect: Effect) => new Promise((resolve) => {
                        switch (effect.effect_type) {
                            case EFFECT_TYPE.attack_fire:
                            case EFFECT_TYPE.attack_ice:
                            case EFFECT_TYPE.attack_phys:
                                this.enemies[target].damage(Number(effect.amount));
                                break;
                            case EFFECT_TYPE.block:
                                this.player?.addBlock(Number(effect.amount));
                                break;
                            case EFFECT_TYPE.generate:
                                // TODO
                                break;
                        }
                        this.add.existing(new BattleEffect(this, playerX, playerY - 32, effect.effect_type, Number(effect.amount), resolve));
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
            console.log(`UI:      ui: ${this.state?.ui}, circuit: ${this.state?.circuit}`);
            console.log(`CIRCUIT: ui: ${(this.api as MockGame2API).mockState.ui}, circuit: ${(this.api as MockGame2API).mockState.circuit}`);
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

export class TestMenu extends Phaser.Scene {
    deployProvider: BrowserDeploymentManager;
    api: DeployedGame2API | undefined;
    subscription: Subscription | undefined;
    state: Game2DerivedState | undefined;
    goldText: Phaser.GameObjects.Text | undefined;
    new_button: Button | undefined;
    buttons: Button[];

    

    constructor(api: DeployedGame2API | undefined, state?: Game2DerivedState) {
        super('TestMenu');
        this.buttons = [];
        if (api != undefined) {
            setTimeout(() => {
                this.initApi(api);
                if (state != undefined) {
                    this.onStateChange(state);
                }
            }, 100);
        }// else {
            this.deployProvider = new BrowserDeploymentManager(logger);
        //}}
    }

    preload() {
        this.load.setBaseURL('/');

        this.load.image('stone_button', 'stone_button.png');
        this.load.image('stone_button_over', 'stone_button_over.png');

        this.load.image('fire', 'fire.png');
        this.load.image('ice', 'ice.png');
        this.load.image('physical', 'physical.png');
        this.load.image('block', 'block.png');
        this.load.image('energy_0', 'energy_0.png');
        this.load.image('energy_1', 'energy_1.png');
        this.load.image('energy_2', 'energy_2.png');

        this.load.image('player', 'player.png');
        this.load.image('enemy', 'enemy.png');
    }

    create() {
        //this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 'GAME 2');
        // deploy contract for testing
        this.buttons.push(new Button(this, 16, 16, 64, 24, 'Deploy', 10, () => {
            console.log('~deploying~');
            this.deployProvider.create().then((api) => {
                console.log('==========GOT API========');
                this.initApi(api);
            }).catch((e) => console.error(`Error connecting: ${e}`));
        }));
        this.buttons.push(new Button(this, 96, 16, 64, 24, 'Mock Deploy', 10, () => {
            console.log('==========MOCK API========');
            this.initApi(new MockGame2API());
        }));
        this.goldText = this.add.text(32, 32, '', fontStyle(12));
        this.indexTest();
    }
    indexTest() {
        const LEN = 7;
        let used = [0, 0, 0, 0, 0, 0, 0];
        for (let i_start = 0; i_start < LEN; ++i_start) {
            for (let j_start = 0; j_start < LEN; ++j_start) {
                if (j_start == i_start) continue;
                for (let k_start = 0; k_start < LEN; ++k_start) {
                    if (k_start == i_start || k_start == j_start) continue;
                    let i = i_start;
                    let j = j_start;
                    let k = k_start;
                    let current_used = [0, 0, 0, 0, 0, 0, 0];
                    for (let rounds = 0; rounds < 10; ++rounds) {
                        ++used[i];
                        ++used[j];
                        ++used[k];
                        ++current_used[i];
                        ++current_used[j];
                        ++current_used[k];
                        i = (i + 1) % LEN;
                        j = (j + 2) % LEN;
                        if (i == j) {
                            j = (j + 1) % LEN;
                        }
                        k = (k + 3) % LEN;
                        if (k == i) {
                            k = (k + 1) % LEN;
                        }
                        if (k == j) {
                            k = (k + 1) % LEN;
                        }
                        if (k == i) {
                            k = (k + 1) % LEN;
                        }
                        if (i == j || j == k || i == k) console.error(`duplicate: ${i}, ${j}, ${k}`);
                    }
                    console.log(`${i_start}, ${j_start}, ${k_start} => ${current_used}`);
                }
            }
        }
        console.log(`indexTest = ${used}`);
    }

    private initApi(api: DeployedGame2API) {
        this.api = api;
        this.buttons.forEach((b) => b.destroy());
        this.subscription = api.state$.subscribe((state) => this.onStateChange(state));
    }

    private questStr(quest: QuestConfig): string {
        return `Quest info here. Difficulty: ${quest.difficulty}`;
    }

    private onStateChange(state: Game2DerivedState) {
        console.log('---state change---');
        this.state = state;

        this.buttons.forEach((b) => b.destroy());
        
        this.buttons.push(new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.1, 128, 32, 'New Quest', 14, () => {
            this.scene.remove('StartBattleMenu');
            this.scene.add('StartBattleMenu', new StartBattleMenu(this.api!, true, state));
            this.scene.start('StartBattleMenu');
        }));
        this.buttons.push(new Button(this, GAME_WIDTH / 2 + 128 + 16, GAME_HEIGHT * 0.1, 128, 32, 'New Battle', 14, () => {
            this.scene.remove('StartBattleMenu');
            this.scene.add('StartBattleMenu', new StartBattleMenu(this.api!, false, state));
            this.scene.start('StartBattleMenu');
        }));
       
        let offset = 0;
        for (const [id, quest] of state.quests) {
            console.log(`got quest: ${id}`);
            const button = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT * 0.145 + 32 * offset, 320, 24, this.questStr(quest), 10, () => {
                this.scene.remove('QuestMenu');
                this.scene.add('QuestMenu', new QuestMenu(this.api!, id));
                this.scene.start('QuestMenu');
            });
            offset += 1;
            this.buttons.push(button);
        }

        this.goldText?.setText(`Gold: ${state.player.gold}`);
    }
}

function makeMockLoadout(): PlayerLoadout {
    const mockEffect = { is_some: true, value: { effect_type: EFFECT_TYPE.attack_phys, amount: BigInt(1), is_aoe: false} };
    const mockAbility = {
        effect: mockEffect,
        on_energy: [mockEffect, mockEffect, mockEffect],
    };
    return {
        abilities: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
    };
}

const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    scene: [TestMenu],
    render: {
        pixelArt: true,
    },
    zoom: scaleToWindow(),
    // physics: {
    //     default: 'arcade',
    //     arcade: {
    //         gravity: { x: 0, y: 200 }
    //     }
    // }
    dom: {
        createContainer: true,
    },
    plugins: {
        scene: [
            {
                key: "rexUI",
                plugin: RexUIPlugin,
                mapping: "rexUI",
            },
        ],
        global: [
            {
                key: "rexBBCodeTextPlugin",
                plugin: BBCodeTextPlugin,
                start: true,
            },
        ],
    },
};

export const game = new Phaser.Game(config);