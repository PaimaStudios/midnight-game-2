// Categorized logging utility using Pino.
// Categories can be enabled or disabled via the VITE_LOG_CATEGORIES environment variable (comma-separated).
// You can put this in your .env or .env.local file for local development.
// Example: VITE_LOG_CATEGORIES=combat-logic,ui,network
// If VITE_LOG_CATEGORIES is not set, all categories are enabled by default.
// 
// Log format can be controlled via VITE_LOG_AS_OBJECT environment variable:
// - VITE_LOG_AS_OBJECT=true: Logs args as structured objects (default Pino behavior)
// - VITE_LOG_AS_OBJECT=false: Logs args inline like console.log would

import * as pino from 'pino';

export enum LogCategory {
  CombatLogic = 'combat-logic',
  UI = 'ui',
  Network = 'network',
  GameState = 'game-state',
  AssetLoading = 'asset-loading',
  UserInput = 'user-input',
  Animation = 'animation',
  Audio = 'audio',
  Debug = 'debugging',
}

interface CategoryLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

class GameLogger {
  private baseLogger: pino.Logger;
  private enabledCategories: Set<LogCategory>;
  private categoryLoggers: Map<LogCategory, CategoryLogger>;
  private logAsObject: boolean;

  constructor() {
    // Parse log format preference from environment variable
    const logAsObjectEnv = import.meta.env.VITE_LOG_AS_OBJECT as string;
    this.logAsObject = !!logAsObjectEnv || logAsObjectEnv === 'true'; // Default to false unless explicitly set to 'true'

    this.baseLogger = pino.pino({
      level: import.meta.env.VITE_LOGGING_LEVEL || 'debug',
      browser: {
        asObject: this.logAsObject,
      },
    });

    // Parse enabled categories from environment variable
    const categoriesEnv = import.meta.env.VITE_LOG_CATEGORIES as string;
    this.enabledCategories = new Set();
    
    if (categoriesEnv) {
      const categories = categoriesEnv.split(',').map(cat => cat.trim() as LogCategory);
      categories.forEach(cat => this.enabledCategories.add(cat));
    } else {
      // Default to all categories if none specified
      this.enabledCategories = new Set(Object.values(LogCategory));
    }

    this.categoryLoggers = new Map();
    this.initializeCategoryLoggers();
  }

  private initializeCategoryLoggers() {
    const categories = Object.values(LogCategory);
    
    categories.forEach(category => {
      if (this.enabledCategories.has(category)) {
        // Create active logger with category in metadata
        const childLogger = this.baseLogger.child({ category });
        this.categoryLoggers.set(category, {
          debug: (message: string, ...args: any[]) => this.logAsObject 
            ? childLogger.debug({ args }, message)
            : childLogger.debug(message, ...args),
          info: (message: string, ...args: any[]) => this.logAsObject 
            ? childLogger.info({ args }, message)
            : childLogger.info(message, ...args),
          warn: (message: string, ...args: any[]) => this.logAsObject 
            ? childLogger.warn({ args }, message)
            : childLogger.warn(message, ...args),
          error: (message: string, ...args: any[]) => this.logAsObject 
            ? childLogger.error({ args }, message)
            : childLogger.error(message, ...args),
        });
      } else {
        // Create silent logger for disabled categories
        this.categoryLoggers.set(category, {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        });
      }
    });
  }

  // Direct category access (preferred API)
  get combat(): CategoryLogger { return this.categoryLoggers.get(LogCategory.CombatLogic)!; }
  get ui(): CategoryLogger { return this.categoryLoggers.get(LogCategory.UI)!; }
  get network(): CategoryLogger { return this.categoryLoggers.get(LogCategory.Network)!; }
  get gameState(): CategoryLogger { return this.categoryLoggers.get(LogCategory.GameState)!; }
  get assetLoading(): CategoryLogger { return this.categoryLoggers.get(LogCategory.AssetLoading)!; }
  get userInput(): CategoryLogger { return this.categoryLoggers.get(LogCategory.UserInput)!; }
  get animation(): CategoryLogger { return this.categoryLoggers.get(LogCategory.Animation)!; }
  get audio(): CategoryLogger { return this.categoryLoggers.get(LogCategory.Audio)!; }
  get debugging(): CategoryLogger { return this.categoryLoggers.get(LogCategory.Debug)!; }

  // Generic category access
  category(category: LogCategory): CategoryLogger {
    return this.categoryLoggers.get(category)!;
  }

  // Convenience method for logging with category as first parameter
  log(category: LogCategory, level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]) {
    const categoryLogger = this.categoryLoggers.get(category);
    if (categoryLogger) {
      categoryLogger[level](message, ...args);
    }
  }

  // Global logger methods (always active, not category-filtered)
  info(message: string, ...args: any[]) {
    this.logAsObject 
      ? this.baseLogger.info({ args }, message)
      : this.baseLogger.info(message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.logAsObject 
      ? this.baseLogger.warn({ args }, message)
      : this.baseLogger.warn(message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.logAsObject 
      ? this.baseLogger.error({ args }, message)
      : this.baseLogger.error(message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.logAsObject 
      ? this.baseLogger.debug({ args }, message)
      : this.baseLogger.debug(message, ...args);
  }

  // Utility methods
  isEnabled(category: LogCategory): boolean {
    return this.enabledCategories.has(category);
  }

  getEnabledCategories(): LogCategory[] {
    return Array.from(this.enabledCategories);
  }

  // Access to underlying Pino logger for compatibility
  get pino(): pino.Logger {
    return this.baseLogger;
  }
}

// Export singleton instance
export const logger = new GameLogger();