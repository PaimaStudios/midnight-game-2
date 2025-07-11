/**
 * Parchment scroll that can be rolled up and unfurled with tweening. Used as a background for many UI components.
 */
import { fontStyle, GAME_HEIGHT, GAME_WIDTH, rootObject } from "../main";
import BBCodeText from 'phaser3-rex-plugins/plugins/bbcodetext.js';
import { Color } from '../constants/colors';
import { BASE_SPRITE_SCALE } from "../utils/scaleImage";

enum ScrollAnimState {
    Unfurling = 0,
    RollingUp = 1,
};

export class ParchmentScroll extends Phaser.GameObjects.Container {
    bg: Phaser.GameObjects.NineSlice;
    tween: Phaser.Tweens.Tween | null;
    tweenStatus: ScrollAnimState | null;

    constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, startsUnfurled: boolean) {
        super(scene, x, y);

        const rotate = w > h;
        //  we rotate it 90 degrees when it's wider than it is tall so the scroll looks less awkward
        const tw = rotate ? h : w;
        const th = rotate ? w : h;
        this.bg = scene.add.nineslice(0, 0, 'ui-scroll-bg', undefined, tw / BASE_SPRITE_SCALE, startsUnfurled ? th / BASE_SPRITE_SCALE : 4, 15, 15, 15, 15)
            .setScale(BASE_SPRITE_SCALE)
            .setAngle(rotate ? 90 : 0);
        this.add(this.bg);
        this.tween = null;
        this.tweenStatus = null;
        this.setSize(w, h);
    }

    private rotated(): boolean {
        return this.width > this.height;
    }

    public setTint(color?: number): ParchmentScroll {
        this.bg.setTint(color);
        return this;
    }

    public unfurl(extraProps?: any) {
        const tweenProps = this.rotated() ? {
            x: -4,
            height: this.width / BASE_SPRITE_SCALE + 8,
        } : {
            y: -4,
            height: this.height / BASE_SPRITE_SCALE + 8,
        };
        if (this.tweenStatus != ScrollAnimState.Unfurling) {
            if (this.tween != null) {
                this.tween.destroy();
            }
            this.tween = this.scene.add.tween({
                targets: this.bg,
                duration: 100,
                ...tweenProps,
                ...extraProps,
                // this is after extraProps so we can override it and call it from within to avoid re-specifying the rest
                onComplete: () => {
                    this.tween = null;
                    this.tweenStatus = null;
                    if (extraProps != undefined && Object.hasOwn(extraProps, 'onComplete')) {
                        extraProps.onComplete();
                    }
                },
                
            });
            this.tweenStatus = ScrollAnimState.Unfurling;
        }
    }

    public rollUp() {
        const tweenProps = this.rotated() ? {
            x: 0,
            height: this.width / BASE_SPRITE_SCALE,
        } : {
            y: 0,
            height: this.height / BASE_SPRITE_SCALE,
        };
        if (this.tweenStatus != ScrollAnimState.RollingUp) {
            if (this.tween != null) {
                this.tween.destroy();
            }
            this.tween = this.scene.add.tween({
                targets: this.bg,
                duration: 100,
                onComplete: () => {
                    this.tween = null;
                    this.tweenStatus = null;
                },
                ...tweenProps,
            });
            this.tweenStatus = ScrollAnimState.RollingUp;
        }
    }
}