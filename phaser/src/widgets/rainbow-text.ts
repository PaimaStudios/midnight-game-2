import { Color } from "../constants/colors";
import { fontStyle } from "../main";

/**
 * RainbowText widget that displays text with each character colored in rainbow colors
 */
export class RainbowText extends Phaser.GameObjects.Container {
    private textObjects: Phaser.GameObjects.Text[] = [];
    private rainbowColors: Color[] = [
        Color.Red,
        Color.Orange, 
        Color.Yellow,
        Color.Green,
        Color.Turquoise,
        Color.Blue,
        Color.Violet
    ];

    constructor(scene: Phaser.Scene, x: number, y: number, text: string, style?: Phaser.Types.GameObjects.Text.TextStyle) {
        super(scene, x, y);
        
        this.createRainbowText(text, style);
        scene.add.existing(this);
    }

    private createRainbowText(text: string, style?: Phaser.Types.GameObjects.Text.TextStyle) {
        // Clear existing text objects
        this.textObjects.forEach(textObj => textObj.destroy());
        this.textObjects = [];

        const defaultStyle: Phaser.Types.GameObjects.Text.TextStyle = {
            ...fontStyle(24),
            ...style
        };

        let currentX = 0;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const colorIndex = i % this.rainbowColors.length;
            const color = this.rainbowColors[colorIndex];
            
            const charStyle = {
                ...defaultStyle,
                color: color
            };
            
            const textObj = new Phaser.GameObjects.Text(this.scene, currentX, 0, char, charStyle);
            textObj.setOrigin(0, 0).setStroke('black', 8);
            
            this.add(textObj);
            this.textObjects.push(textObj);
            
            // Move X position for next character based on the width of current character
            currentX += textObj.width;
        }
    }

    /**
     * Update the text content while maintaining rainbow effect
     */
    setText(newText: string) {
        this.createRainbowText(newText);
    }

    /**
     * Get the total width of the rainbow text
     */
    getTextWidth(): number {
        return this.textObjects.reduce((total, textObj) => total + textObj.width, 0);
    }

    /**
     * Get the height of the text (assumes all characters have same height)
     */
    getTextHeight(): number {
        return this.textObjects.length > 0 ? this.textObjects[0].height : 0;
    }
}