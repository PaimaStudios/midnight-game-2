/**
 * Local cache for level unlock status to avoid repeated API calls
 */

import { DeployedGame2API } from "game2-api";
import { BIOME_ID } from "../constants/biome";

interface LevelUnlockStatus {
    [biome: number]: {
        [level: number]: boolean;
    };
}

class LevelCache {
    private cache: LevelUnlockStatus = {};
    private cacheTimestamp: number = 0;
    private readonly CACHE_DURATION = 5 * 60 * 1000;  // 5 minutes cache

    /**
     * Get cached unlock status for a specific biome and level
     */
    getCached(biome: BIOME_ID, level: number): boolean | null {
        if (!this.isValid()) {
            return null;
        }

        return this.cache[biome]?.[level] ?? null;
    }

    /**
     * Get all cached unlock statuses for a biome
     */
    getCachedForBiome(biome: BIOME_ID): { [level: number]: boolean } | null {
        if (!this.isValid()) {
            return null;
        }

        return this.cache[biome] ?? null;
    }

    /**
     * Set unlock status in cache
     */
    setCached(biome: BIOME_ID, level: number, unlocked: boolean): void {
        if (!this.cache[biome]) {
            this.cache[biome] = {};
        }
        this.cache[biome][level] = unlocked;
        this.updateTimestamp();
    }

    /**
     * Set multiple unlock statuses for a biome
     */
    setCachedForBiome(biome: BIOME_ID, unlockStates: { [level: number]: boolean }): void {
        this.cache[biome] = { ...unlockStates };
        this.updateTimestamp();
    }

    /**
     * Fetch and cache unlock status for a biome
     */
    async fetchAndCache(api: DeployedGame2API, biome: BIOME_ID, maxLevels: number): Promise<{ [level: number]: boolean }> {
        const levelChecks = [];

        for (let level = 1; level <= maxLevels; level++) {
            if (level === 1) {
                // Level 1 is always unlocked, no need to call API
                levelChecks.push(Promise.resolve(true));
            } else {
                // Check if previous level boss was completed
                const prevLevel = level - 1;
                levelChecks.push(api.is_boss_completed(BigInt(biome), BigInt(prevLevel)));
            }
        }

        const unlockStates = await Promise.all(levelChecks);

        // Convert to object format
        const unlockMap: { [level: number]: boolean } = {};
        for (let i = 0; i < unlockStates.length; i++) {
            unlockMap[i + 1] = unlockStates[i];
        }

        // Cache the results
        this.setCachedForBiome(biome, unlockMap);

        return unlockMap;
    }

    /**
     * Invalidate cache (e.g., when a boss is defeated)
     */
    invalidate(): void {
        this.cache = {};
        this.cacheTimestamp = 0;
    }

    /**
     * Invalidate cache for a specific biome
     */
    invalidateBiome(biome: BIOME_ID): void {
        delete this.cache[biome];
    }

    /**
     * Check if cache is still valid (not expired)
     */
    private isValid(): boolean {
        return this.cacheTimestamp > 0 && (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION;
    }

    /**
     * Update cache timestamp
     */
    private updateTimestamp(): void {
        this.cacheTimestamp = Date.now();
    }

    /**
     * Get cache statistics for debugging
     */
    getStats(): { cached: number; timestamp: number; isValid: boolean } {
        const cached = Object.keys(this.cache).reduce((total, biome) => {
            return total + Object.keys(this.cache[parseInt(biome)]).length;
        }, 0);

        return {
            cached,
            timestamp: this.cacheTimestamp,
            isValid: this.isValid()
        };
    }
}

// Export singleton instance
export const levelCache = new LevelCache();