/**
 * Main entry point for the Titan Escape game engine.
 * Re-exports all public types and functions for external use.
 */

// Types
export type {
    PlayerId,
    PlayerAction,
    PlayerInputFrame,
    Obstacle,
    PlayerVehicle,
    GameState,
    EngineConfig,
    AABB,
    PlayerResult,
} from './types';

export { PlayerState, ObstacleType, DeathCause } from './types';

// RNG
export { SeededRNG, createRNG, generateRandomSeed } from './rng';

// Game State
export { createInitialState, updateGameState, getGameResults, rescaleWorldX } from './gameState';

// Obstacle Generation
export { generateObstacles, updateObstacles, getVisibleObstacles } from './obstacleGenerator';

// Config
export * from './config';
