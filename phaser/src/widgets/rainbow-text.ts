import { Color } from "../constants/colors";
import { fontStyle } from "../main";

/**
 * RainbowText widget that displays text with each character colored in rainbow colors
 */
export class RainbowText extends Phaser.GameObjects.Container {
    // 3D Effect Configuration Constants
    private static readonly DEPTH_OFFSET_X = 4;  // Horizontal depth offset for bottom side
    private static readonly DEPTH_OFFSET_Y = 4;  // Vertical depth offset for bottom side
    private static readonly SIDE_OFFSET_X = 2;   // Horizontal offset for right side
    private static readonly SIDE_OFFSET_Y = 2;   // Vertical offset for right side
    private static readonly RIGHT_SIDE_DARKEN = 0.3;  // How much to darken right side (0-1)
    private static readonly BOTTOM_SIDE_DARKEN = 0.5; // How much to darken bottom side (0-1)

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

    constructor(scene: Phaser.Scene, x: number, y: number, text: string, style?: Phaser.Types.GameObjects.Text.TextStyle, depth: number = 8) {
        super(scene, x, y);
        
        this.createRainbowText(text, style, depth);
        scene.add.existing(this);
    }

    private createRainbowText(text: string, style?: Phaser.Types.GameObjects.Text.TextStyle, depth: number = 0) {
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
            const faceColor = this.rainbowColors[colorIndex];
            
            if (depth > 0) {
                // Calculate darker colors for the 3D sides
                const rightSideColor = this.darkenColor(faceColor, RainbowText.RIGHT_SIDE_DARKEN);
                const bottomSideColor = this.darkenColor(faceColor, RainbowText.BOTTOM_SIDE_DARKEN);
                
                // Create the 3D effect with multiple text layers using the depth value
                // Bottom side (darkest, offset by depth)
                const bottomSideStyle = { ...defaultStyle, color: bottomSideColor };
                const bottomSideObj = new Phaser.GameObjects.Text(this.scene, currentX + depth, depth, char, bottomSideStyle);
                bottomSideObj.setOrigin(0, 0);
                this.add(bottomSideObj);
                this.textObjects.push(bottomSideObj);
                
                // Right side (medium dark, offset by half depth)
                const rightSideStyle = { ...defaultStyle, color: rightSideColor };
                const rightSideObj = new Phaser.GameObjects.Text(this.scene, currentX + depth/2, depth/2, char, rightSideStyle);
                rightSideObj.setOrigin(0, 0);
                this.add(rightSideObj);
                this.textObjects.push(rightSideObj);
                
                // Face (brightest, on top)
                const faceStyle = { ...defaultStyle, color: faceColor };
                const faceObj = new Phaser.GameObjects.Text(this.scene, currentX, 0, char, faceStyle);
                faceObj.setOrigin(0, 0);
                this.add(faceObj);
                this.textObjects.push(faceObj);
                
                // Move X position for next character based on the width of the face character
                currentX += faceObj.width;
            } else {
                // Simple 2D text with colored shadow
                const charStyle = { ...defaultStyle, color: faceColor };
                const textObj = new Phaser.GameObjects.Text(this.scene, currentX, 0, char, charStyle);
                textObj.setOrigin(0, 0);
                
                this.add(textObj);
                this.textObjects.push(textObj);
                
                // Move X position for next character based on the width of current character
                currentX += textObj.width;
            }
        }
    }

    /**
     * Darken a color by a given factor for 3D effect
     */
    private darkenColor(color: Color, factor: number): string {
        const hexColor = color.replace('#', '');
        const r = parseInt(hexColor.substring(0, 2), 16);
        const g = parseInt(hexColor.substring(2, 4), 16);
        const b = parseInt(hexColor.substring(4, 6), 16);
        
        const darkenedR = Math.max(0, Math.floor(r * (1 - factor)));
        const darkenedG = Math.max(0, Math.floor(g * (1 - factor)));
        const darkenedB = Math.max(0, Math.floor(b * (1 - factor)));
        
        return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
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