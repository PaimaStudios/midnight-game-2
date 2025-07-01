import Phaser from 'phaser';

export const BASE_SPRITE_SCALE = 2.0;

const addScaledImage = (scene: Phaser.Scene, x: number, y: number, key: string, scale: number = BASE_SPRITE_SCALE): Phaser.GameObjects.Image => {
    const image = scene.add.image(x, y, key);
    image.setScale(scale);
    return image;
}

export function scale<T extends Phaser.GameObjects.Components.Transform>(object: T): T {
    return object.setScale(BASE_SPRITE_SCALE);
}

export default addScaledImage;