import Phaser from 'phaser';

const addScaledImage = (scene: Phaser.Scene, x: number, y: number, key: string, scale: number = 2.0): Phaser.GameObjects.Image => {
    const image = scene.add.image(x, y, key);
    image.setScale(scale);
    return image;
}

export default addScaledImage;