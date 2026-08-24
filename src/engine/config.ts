/**
 * Game configuration constants.
 * All tunable values for game balance and physics.
 */

import { ObstacleType } from './types';

/** Fixed time step for simulation (60 FPS) */
export const FIXED_DT = 1 / 60;

/** Default canvas dimensions (will be overridden by actual window size) */
export const DEFAULT_CANVAS_WIDTH = 1920;
export const DEFAULT_CANVAS_HEIGHT = 1080;

/** Dynamic canvas dimensions - set at runtime */
export let CANVAS_WIDTH = DEFAULT_CANVAS_WIDTH;
export let CANVAS_HEIGHT = DEFAULT_CANVAS_HEIGHT;

/** Update canvas dimensions (called on resize) */
export function setCanvasDimensions(width: number, height: number): void {
    CANVAS_WIDTH = width;
    CANVAS_HEIGHT = height;
}

/** Maximum depth before the "bottom" (Titanic wreck area) */
export const MAX_DEPTH = 10000;

/** Titanic wreck starts appearing at this depth */
export const TITANIC_DEPTH = MAX_DEPTH - 500;

/** Player submarine dimensions (larger for detailed view with portholes) */
export const SUB_WIDTH = 80;
export const SUB_HEIGHT = 40;

/** Escape capsule dimensions (smaller than sub) */
export const CAPSULE_WIDTH = 25;
export const CAPSULE_HEIGHT = 20;

/** Starting HP for submarines (one per passenger) */
export const SUB_STARTING_HP = 4;

/** Number of passengers in submarine */
export const PASSENGER_COUNT = 4;

/** Capsule HP (any hit = death) */
export const CAPSULE_HP = 1;

/** Horizontal movement speed (pixels per second) */
export const HORIZONTAL_SPEED = 200;

/** Base vertical descent speed (pixels per second) */
export const BASE_DESCENT_SPEED = 80;

/** Additional speed gained per unit of normalized depth (0-1) */
export const DESCENT_SPEED_FACTOR = 120;

/** Ascent speed for escape capsule (much faster than descent) */
export const ASCENT_SPEED = 350;

/** Base wear increase per second (reduced for easier start) */
export const BASE_WEAR_RATE = 0.3;

/** Additional wear rate multiplied by normalized depth */
export const DEPTH_WEAR_FACTOR = 1.5;

/** Wear increase on collision by obstacle type */
export const COLLISION_WEAR: Record<ObstacleType, number> = {
    [ObstacleType.Coral]: 5,
    [ObstacleType.IceBlock]: 12,
    [ObstacleType.SeaTurtle]: 4,
};

/** HP damage on collision by obstacle type */
export const COLLISION_DAMAGE: Record<ObstacleType, number> = {
    [ObstacleType.Coral]: 1,
    [ObstacleType.IceBlock]: 1,
    [ObstacleType.SeaTurtle]: 1,
};

/** Frames of invincibility after being hit */
export const INVINCIBILITY_FRAMES = 120; // 2 seconds (more forgiving)

/** Base obstacle spawn rate (obstacles per 100 depth units) - scales with depth */
export const OBSTACLE_DENSITY_MIN = 1.2; // At surface (was 0.8)
export const OBSTACLE_DENSITY_MAX = 4.0; // At max depth (was 3.0)

/** Minimum gap between obstacles for player passage */
export const MIN_PASSAGE_WIDTH = 100; // Ensure players can always pass

/** Calculate obstacle density based on depth (gradual difficulty) */
export function getObstacleDensity(depth: number): number {
    const normalizedDepth = Math.min(depth / MAX_DEPTH, 1);
    // Very slow ramp up: starts very easy, gradually gets harder
    const curve = Math.pow(normalizedDepth, 0.9);
    return OBSTACLE_DENSITY_MIN + curve * (OBSTACLE_DENSITY_MAX - OBSTACLE_DENSITY_MIN);
}

/** Rocket/weapon configuration */
export const ROCKETS_PER_PLAYER = 3; // 2 small + 1 mine
export const SMALL_ROCKET_COUNT = 2;
export const SMALL_ROCKET_DAMAGE = 1; // 25% of 4 HP
export const MINE_DAMAGE = 4; // 100% instant kill
export const ROCKET_SPEED = 400; // pixels per second
export const MINE_LIFETIME = 300; // frames (5 seconds)
export const ROCKET_WIDTH = 20;
export const ROCKET_HEIGHT = 8;
export const MINE_SIZE = 25;

/** HP Pickup configuration */
export const HP_PICKUP_CHANCE = 0.00015; // Rarer (was 0.0003) - about 1 per 600m
export const HP_PICKUP_SIZE = 20;
export const HP_PICKUP_HEAL = 1;

/**
 * Hull motion when steering ("full" preset from the turn demo).
 * Every value here is meant to be tweaked - nothing else depends on the exact numbers.
 */
/** Seconds for a full nose-to-nose flip */
export const SUB_TURN_DURATION = 0.25;
/** Steering inertia: 0 = snaps around, 1 = sluggish and heavy */
export const SUB_STEER_INERTIA = 0.45;
/** Roll into the turn, degrees at full sideways speed */
export const SUB_MAX_TILT_DEG = 12;
/** Nose dip while accelerating downward, degrees */
export const SUB_MAX_PITCH_DEG = 8;
/** How quickly roll and pitch catch up (higher = snappier) */
export const SUB_TILT_EASE = 5;
export const SUB_PITCH_EASE = 4;
/** How lazily the light cone follows the hull (lower = more lag) */
export const SUB_BEAM_EASE = 3.2;
/** Bubble trail from the propeller */
export const SUB_PROP_BUBBLES = true;
export const SUB_BUBBLE_RISE = 26; // pixels per second
export const SUB_BUBBLE_LIFETIME = 0.9; // seconds

/** Vertical movement speed */
export const VERTICAL_SPEED = 150; // pixels per second

/** Depth zones for obstacle types (extended for more variety) */
export const CORAL_MIN_DEPTH = 0;
export const CORAL_MAX_DEPTH = 6000; // Extended coral range
export const ICE_MIN_DEPTH = 2000; // Ice appears a bit earlier
export const ICE_MAX_DEPTH = MAX_DEPTH;
export const TURTLE_MIN_DEPTH = 800; // Turtles appear earlier for variety
export const TURTLE_MAX_DEPTH = 8000;

/** Obstacle size ranges */
export const OBSTACLE_SIZE = {
    [ObstacleType.Coral]: { minW: 40, maxW: 80, minH: 35, maxH: 70 }, // Larger corals
    [ObstacleType.IceBlock]: { minW: 40, maxW: 80, minH: 30, maxH: 60 },
    [ObstacleType.SeaTurtle]: { minW: 35, maxW: 55, minH: 25, maxH: 40 },
};

/** Turtle movement speed */
export const TURTLE_SPEED = 30;

/** Angler Fish configuration */
export const ANGLER_FISH_MIN_DEPTH = 500; // Start appearing at 500m (early game)
export const ANGLER_FISH_SPAWN_CHANCE = 0.003; // Higher spawn chance
export const ANGLER_FISH_WIDTH = 35; // Slightly smaller than submarine
export const ANGLER_FISH_HEIGHT = 25;
export const ANGLER_FISH_AGGRO_RADIUS = 500; // Large aggro radius (~30% of 1920px)
export const ANGLER_FISH_SPEED_MULTIPLIER = 0.75; // 25% slower than submarine base speed
export const ANGLER_FISH_DAMAGE = 1; // 1 HP damage
export const ANGLER_FISH_MAX_COUNT = 8; // More fish allowed

/** How far ahead to generate obstacles */
export const OBSTACLE_GENERATION_BUFFER = 800;

/** Player starting positions (use functions for dynamic width) */
export function getPlayer1StartX(): number {
    return CANVAS_WIDTH * 0.35;
}
export function getPlayer2StartX(): number {
    return CANVAS_WIDTH * 0.65;
}
export const PLAYER_START_Y = 50;

/** World bounds for horizontal movement (dynamic based on canvas width) */
export const WORLD_LEFT_BOUND = 20;
export function getWorldRightBound(): number {
    return CANVAS_WIDTH - 20;
}

/** Colors for visual rendering */
export const COLORS = {
    surface: '#87CEEB', // Light sky blue at surface
    midDepth: '#1E4D6B', // Darker blue at mid depth
    deepOcean: '#0A1628', // Almost black at great depth
    sub1: '#FFA500', // Orange for player 1 sub
    sub2: '#00FF7F', // Green for player 2 sub
    capsule1: '#FFD700', // Gold for player 1 capsule
    capsule2: '#7FFF00', // Chartreuse for player 2 capsule
    coral: '#FF6B6B', // Coral red/pink
    ice: '#ADD8E6', // Light blue for ice
    turtle: '#228B22', // Forest green for turtles
    titanic: '#4A4A4A', // Dark gray for the wreck
    hud: '#FFFFFF', // White for HUD text
    danger: '#FF0000', // Red for danger indicators
};
