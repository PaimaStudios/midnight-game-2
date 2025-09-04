import { Color } from "../constants/colors";
import { fontStyle } from "../main";

/**
 * RainbowText widget that displays text with each character colored in rainbow colors
 */
export class RainbowText extends Phaser.GameObjects.Container {
    // 3D Effect Configuration Constants
    private static readonly RIGHT_SIDE_DARKEN = 0.3;  // How much to darken right side (0-1)
    private static readonly BOTTOM_SIDE_DARKEN = 0.5; // How much to darken bottom side (0-1)

    private textObjects: Phaser.GameObjects.Text[] = [];
    private letterGroups: Phaser.GameObjects.Container[] = []; // Groups of 3 text objects per letter
    private animationTweens: Phaser.Tweens.Tween[] = [];
    private baseDepth: number = 0;
    private rainbowColors: Color[] = [
        Color.Red,
        Color.Orange, 
        Color.Yellow,
        Color.Green,
        Color.Turquoise,
        Color.Blue,
        Color.Violet
    ];

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        text: string,
        depth: number = 8,
        autoAnimate: boolean = true,
        style?: Phaser.Types.GameObjects.Text.TextStyle,
    ) {
        super(scene, x, y);
        
        this.baseDepth = depth;
        this.createRainbowText(text, style, depth);
        scene.add.existing(this);
        
        if (autoAnimate && depth > 0) {
            this.startDepthAnimation();
        }
    }

    private createRainbowText(text: string, style?: Phaser.Types.GameObjects.Text.TextStyle, depth: number = 0) {
        // Clear existing text objects and letter groups
        this.textObjects.forEach(textObj => textObj.destroy());
        this.letterGroups.forEach(group => group.destroy());
        this.textObjects = [];
        this.letterGroups = [];

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
                // Create a container for this letter's 3D layers
                const letterContainer = new Phaser.GameObjects.Container(this.scene, 0, 0);
                this.add(letterContainer);
                this.letterGroups.push(letterContainer);
                
                // Calculate darker colors for the 3D sides
                const rightSideColor = this.darkenColor(faceColor, RainbowText.RIGHT_SIDE_DARKEN);
                const bottomSideColor = this.darkenColor(faceColor, RainbowText.BOTTOM_SIDE_DARKEN);
                
                // Create the 3D effect with multiple text layers using the depth value
                // Bottom side (darkest, offset by depth)
                const bottomSideStyle = { ...defaultStyle, color: bottomSideColor };
                const bottomSideObj = new Phaser.GameObjects.Text(this.scene, currentX + depth, depth, char, bottomSideStyle);
                bottomSideObj.setOrigin(0, 0);
                letterContainer.add(bottomSideObj);
                this.textObjects.push(bottomSideObj);
                
                // Right side (medium dark, offset by half depth)
                const rightSideStyle = { ...defaultStyle, color: rightSideColor };
                const rightSideObj = new Phaser.GameObjects.Text(this.scene, currentX + depth/2, depth/2, char, rightSideStyle);
                rightSideObj.setOrigin(0, 0);
                letterContainer.add(rightSideObj);
                this.textObjects.push(rightSideObj);
                
                // Face (brightest, on top)
                const faceStyle = { ...defaultStyle, color: faceColor };
                const faceObj = new Phaser.GameObjects.Text(this.scene, currentX, 0, char, faceStyle);
                faceObj.setOrigin(0, 0);
                letterContainer.add(faceObj);
                this.textObjects.push(faceObj);
                
                // Move X position for next character based on the width of the face character
                currentX += faceObj.width;
            } else {
                // Simple 2D text
                const charStyle = { ...defaultStyle, color: faceColor };
                const textObj = new Phaser.GameObjects.Text(this.scene, currentX, 0, char, charStyle);
                textObj.setOrigin(0, 0);
                
                const letterContainer = new Phaser.GameObjects.Container(this.scene, 0, 0);
                letterContainer.add(textObj);
                this.add(letterContainer);
                this.letterGroups.push(letterContainer);
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
     * Start the depth animation with staggered timing for each letter
     */
    public startDepthAnimation(duration: number = 1000, staggerDelay: number = 100) {
        this.stopDepthAnimation(); // Stop any existing animation
        
        this.letterGroups.forEach((letterGroup, index) => {
            // Only animate letters that have 3D depth (3 children = bottom, right, face)
            if (letterGroup.list.length === 3) {
                const [bottomSide, rightSide] = letterGroup.list as Phaser.GameObjects.Text[];
                
                // Get the face position to keep it static
                const faceText = letterGroup.list[2] as Phaser.GameObjects.Text;
                const faceX = faceText.x;
                const faceY = faceText.y;
                
                // Animate the depth offset multiplier from 0.25 to 1
                const depthData = { depthMultiplier: 1 };
                const tween = this.scene.tweens.add({
                    targets: depthData,
                    depthMultiplier: { from: 1, to: 0.25 },
                    duration: duration,
                    delay: index * staggerDelay,
                    ease: 'Sine.easeInOut',
                    yoyo: true,
                    repeat: -1,
                    onUpdate: () => {
                        const currentDepth = this.baseDepth * depthData.depthMultiplier;
                        // Update bottom side position
                        bottomSide.setPosition(faceX + currentDepth, faceY + currentDepth);
                        // Update right side position  
                        rightSide.setPosition(faceX + currentDepth/2, faceY + currentDepth/2);
                    }
                });
                this.animationTweens.push(tween);
            }
        });
    }

    /**
     * Stop the depth animation
     */
    public stopDepthAnimation() {
        this.animationTweens.forEach(tween => tween.destroy());
        this.animationTweens = [];
        
        // Reset all 3D layers to their original depth positions
        this.letterGroups.forEach(letterGroup => {
            if (letterGroup.list.length === 3) {
                const [bottomSide, rightSide, faceText] = letterGroup.list as Phaser.GameObjects.Text[];
                const faceX = faceText.x;
                const faceY = faceText.y;
                
                // Reset to full depth
                bottomSide.setPosition(faceX + this.baseDepth, faceY + this.baseDepth);
                rightSide.setPosition(faceX + this.baseDepth/2, faceY + this.baseDepth/2);
            }
        });
    }

    /**
     * Update the text content while maintaining rainbow effect
     */
    public setText(newText: string) {
        const wasAnimating = this.animationTweens.length > 0;
        this.stopDepthAnimation();
        this.createRainbowText(newText, undefined, this.baseDepth);
        
        if (wasAnimating && this.baseDepth > 0) {
            this.startDepthAnimation();
        }
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