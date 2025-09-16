/**
 * Local cache for difficulty unlock status to avoid repeated API calls
 */

import { DeployedGame2API } from "game2-api";
import { BIOME_ID } from "../constants/biome";

interface DifficultyUnlockStatus {
    [biome: number]: {
        [difficulty: number]: boolean;
    };
}

class DifficultyCache {
    private cache: DifficultyUnlockStatus = {};
    private cacheTimestamp: number = 0;
    private readonly CACHE_DURATION = 5 * 60 * 1000;  // 5 minutes cache

    /**
     * Get cached unlock status for a specific biome and difficulty
     */
    getCached(biome: BIOME_ID, difficulty: number): boolean | null {
        if (!this.isValid()) {
            return null;
        }

        return this.cache[biome]?.[difficulty] ?? null;
    }

    /**
     * Get all cached unlock statuses for a biome
     */
    getCachedForBiome(biome: BIOME_ID): { [difficulty: number]: boolean } | null {
        if (!this.isValid()) {
            return null;
        }

        return this.cache[biome] ?? null;
    }

    /**
     * Set unlock status in cache
     */
    setCached(biome: BIOME_ID, difficulty: number, unlocked: boolean): void {
        if (!this.cache[biome]) {
            this.cache[biome] = {};
        }
        this.cache[biome][difficulty] = unlocked;
        this.updateTimestamp();
    }

    /**
     * Set multiple unlock statuses for a biome
     */
    setCachedForBiome(biome: BIOME_ID, unlockStates: { [difficulty: number]: boolean }): void {
        this.cache[biome] = { ...unlockStates };
        this.updateTimestamp();
    }

    /**
     * Fetch and cache unlock status for a biome
     */
    async fetchAndCache(api: DeployedGame2API, biome: BIOME_ID, maxDifficulties: number): Promise<{ [difficulty: number]: boolean }> {
        const difficultyChecks = [];

        for (let difficulty = 1; difficulty <= maxDifficulties; difficulty++) {
            if (difficulty === 1) {
                // Level 1 is always unlocked, no need to call API
                difficultyChecks.push(Promise.resolve(true));
            } else {
                // Check if previous level boss was completed
                const prevDifficulty = difficulty - 1;
                difficultyChecks.push(api.is_boss_completed(BigInt(biome), BigInt(prevDifficulty)));
            }
        }

        const unlockStates = await Promise.all(difficultyChecks);

        // Convert to object format
        const unlockMap: { [difficulty: number]: boolean } = {};
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
export const difficultyCache = new DifficultyCache();