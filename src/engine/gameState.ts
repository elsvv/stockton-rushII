/**
 * Core game state management and update logic.
 * This module is the heart of the deterministic game engine.
 */

import type {
    GameState,
    PlayerVehicle,
    PlayerId,
    PlayerInputFrame,
    AABB,
    EngineConfig,
    Obstacle,
    Passenger,
    Projectile,
    Pickup,
    AnglerFish,
} from './types';
import { ProjectileType, PickupType } from './types';
import { PlayerState, DeathCause, GamePhase } from './types';
import { createRNG } from './rng';
import { generateObstacles, updateObstacles, getVisibleObstacles } from './obstacleGenerator';
import {
    SUB_WIDTH,
    SUB_HEIGHT,
    CAPSULE_WIDTH,
    CAPSULE_HEIGHT,
    SUB_STARTING_HP,
    CAPSULE_HP,
    PASSENGER_COUNT,
    HORIZONTAL_SPEED,
    VERTICAL_SPEED,
    BASE_DESCENT_SPEED,
    DESCENT_SPEED_FACTOR,
    ASCENT_SPEED,
    BASE_WEAR_RATE,
    DEPTH_WEAR_FACTOR,
    COLLISION_WEAR,
    COLLISION_DAMAGE,
    INVINCIBILITY_FRAMES,
    MAX_DEPTH,
    WORLD_LEFT_BOUND,
    getWorldRightBound,
    getPlayer1StartX,
    getPlayer2StartX,
    PLAYER_START_Y,
    OBSTACLE_GENERATION_BUFFER,
    SMALL_ROCKET_COUNT,
    SMALL_ROCKET_DAMAGE,
    MINE_DAMAGE,
    ROCKET_SPEED,
    MINE_LIFETIME,
    ROCKET_WIDTH,
    ROCKET_HEIGHT,
    MINE_SIZE,
    HP_PICKUP_CHANCE,
    HP_PICKUP_SIZE,
    HP_PICKUP_HEAL,
    ANGLER_FISH_MIN_DEPTH,
    ANGLER_FISH_SPAWN_CHANCE,
    ANGLER_FISH_WIDTH,
    ANGLER_FISH_HEIGHT,
    ANGLER_FISH_AGGRO_RADIUS,
    ANGLER_FISH_SPEED_MULTIPLIER,
    ANGLER_FISH_DAMAGE,
    ANGLER_FISH_MAX_COUNT,
    SUB_TURN_DURATION,
    SUB_STEER_INERTIA,
    SUB_MAX_TILT_DEG,
    SUB_MAX_PITCH_DEG,
    SUB_TILT_EASE,
    SUB_PITCH_EASE,
    SUB_BEAM_EASE,
} from './config';

/** Create initial passengers for a submarine */
function createPassengers(): Passenger[] {
    return Array.from({ length: PASSENGER_COUNT }, () => ({
        alive: true,
        offsetX: 0,
        velocityX: 0,
    }));
}

/** Generate a unique projectile ID */
let projectileIdCounter = 0;
function generateProjectileId(): string {
    return `proj_${projectileIdCounter++}`;
}

/** Generate a unique pickup ID */
let pickupIdCounter = 0;
function generatePickupId(): string {
    return `pickup_${pickupIdCounter++}`;
}

/** Generate a unique angler fish ID */
let anglerFishIdCounter = 0;
function generateAnglerFishId(): string {
    return `angler_${anglerFishIdCounter++}`;
}

/** Ammo pickup chance (even rarer than HP) */
const AMMO_PICKUP_CHANCE = 0.0001; // Very rare - about 1 per 1000m

/** Create a pickup at a given position */
function createPickup(type: PickupType, x: number, y: number): Pickup {
    return {
        id: generatePickupId(),
        type,
        x,
        y,
        size: HP_PICKUP_SIZE,
        active: true,
    };
}

/** Check if pickup was collected by a player */
function checkPickupCollision(pickup: Pickup, player: PlayerVehicle): boolean {
    if (!pickup.active) return false;
    if (player.state !== PlayerState.Descending) return false;

    const playerBox: AABB = {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height,
    };

    const pickupBox: AABB = {
        x: pickup.x,
        y: pickup.y,
        width: pickup.size,
        height: pickup.size,
    };

    return checkAABBCollision(playerBox, pickupBox);
}

/** Apply pickup effect to player */
function applyPickup(pickup: Pickup, player: PlayerVehicle): PlayerVehicle {
    switch (pickup.type) {
        case PickupType.Health:
            return {
                ...player,
                hp: Math.min(player.hp + HP_PICKUP_HEAL, SUB_STARTING_HP),
            };
        case PickupType.Rocket:
            return {
                ...player,
                rocketsRemaining: player.rocketsRemaining + 1,
            };
        case PickupType.Mine:
            return {
                ...player,
                minesRemaining: player.minesRemaining + 1,
            };
        default:
            return player;
    }
}

/** Create a rocket projectile */
function createRocket(
    ownerId: PlayerId,
    x: number,
    y: number,
    _targetPlayerId: PlayerId, // Used for direction calculation
    targetX: number
): Projectile {
    // Rocket flies horizontally towards the other player
    const direction = targetX > x ? 1 : -1;
    return {
        id: generateProjectileId(),
        type: ProjectileType.Rocket,
        ownerId,
        x: x + (direction > 0 ? 80 : -ROCKET_WIDTH), // Fire from front of sub
        y: y + 20, // Center of sub
        width: ROCKET_WIDTH,
        height: ROCKET_HEIGHT,
        velocityX: direction * ROCKET_SPEED,
        velocityY: 0,
        damage: SMALL_ROCKET_DAMAGE,
        lifetime: 300, // 5 seconds
        active: true,
    };
}

/** Create a mine (stationary) */
function createMine(ownerId: PlayerId, x: number, y: number): Projectile {
    return {
        id: generateProjectileId(),
        type: ProjectileType.Mine,
        ownerId,
        x: x + 30,
        y: y + 50, // Place slightly below the sub
        width: MINE_SIZE,
        height: MINE_SIZE,
        velocityX: 0,
        velocityY: 0,
        damage: MINE_DAMAGE,
        lifetime: MINE_LIFETIME,
        active: true,
    };
}

/** Update projectiles - movement, lifetime, remove inactive */
function updateProjectiles(projectiles: Projectile[], dt: number): Projectile[] {
    return projectiles
        .map((p) => {
            if (!p.active) return p;
            return {
                ...p,
                x: p.x + p.velocityX * dt,
                y: p.y + p.velocityY * dt,
                lifetime: p.lifetime - 1,
                active: p.lifetime > 1,
            };
        })
        .filter((p) => p.active && p.lifetime > 0);
}

/** Check projectile collisions with players and obstacles */
function checkProjectileCollisions(
    projectiles: Projectile[],
    players: Record<PlayerId, PlayerVehicle>,
    obstacles: Obstacle[]
): {
    projectiles: Projectile[];
    players: Record<PlayerId, PlayerVehicle>;
    obstacles: Obstacle[];
    hits: Array<{ projectileId: string; targetType: 'player' | 'obstacle'; targetId: string }>;
} {
    let updatedProjectiles = [...projectiles];
    let updatedPlayers = { ...players };
    let updatedObstacles = [...obstacles];
    const hits: Array<{
        projectileId: string;
        targetType: 'player' | 'obstacle';
        targetId: string;
    }> = [];

    for (const proj of projectiles) {
        if (!proj.active) continue;

        const projBox: AABB = {
            x: proj.x,
            y: proj.y,
            width: proj.width,
            height: proj.height,
        };

        // Check collision with obstacles first (can block projectiles)
        for (let i = 0; i < updatedObstacles.length; i++) {
            const obs = updatedObstacles[i];
            if (!obs.active) continue;

            const obsBox: AABB = {
                x: obs.x,
                y: obs.y,
                width: obs.width,
                height: obs.height,
            };

            if (checkAABBCollision(projBox, obsBox)) {
                // Projectile hits obstacle - both are destroyed
                updatedProjectiles = updatedProjectiles.map((p) =>
                    p.id === proj.id ? { ...p, active: false } : p
                );
                updatedObstacles[i] = { ...obs, active: false };
                hits.push({ projectileId: proj.id, targetType: 'obstacle', targetId: obs.id });
                break; // Projectile is destroyed, stop checking
            }
        }

        // Check if projectile is still active after obstacle check
        const stillActive = updatedProjectiles.find((p) => p.id === proj.id)?.active;
        if (!stillActive) continue;

        // Check collision with enemy player
        const enemyId: PlayerId = proj.ownerId === 'player1' ? 'player2' : 'player1';
        const enemy = updatedPlayers[enemyId];

        // Skip if enemy is dead or has invincibility
        if (enemy.state === PlayerState.Dead || enemy.state === PlayerState.Escaped) continue;
        if (enemy.invincibilityFrames > 0) continue;

        const enemyBox: AABB = {
            x: enemy.x,
            y: enemy.y,
            width: enemy.width,
            height: enemy.height,
        };

        if (checkAABBCollision(projBox, enemyBox)) {
            // Projectile hits enemy player
            updatedProjectiles = updatedProjectiles.map((p) =>
                p.id === proj.id ? { ...p, active: false } : p
            );

            let newEnemy = {
                ...enemy,
                hp: Math.max(0, enemy.hp - proj.damage),
                invincibilityFrames: INVINCIBILITY_FRAMES,
            };

            // Check for death
            if (newEnemy.hp <= 0) {
                newEnemy = {
                    ...newEnemy,
                    state: PlayerState.Dead,
                    deathCause: DeathCause.Imploded,
                    implosionFrame: 1,
                };
            }

            updatedPlayers[enemyId] = newEnemy;
            hits.push({ projectileId: proj.id, targetType: 'player', targetId: enemyId });
        }
    }

    return {
        projectiles: updatedProjectiles.filter((p) => p.active),
        players: updatedPlayers,
        obstacles: updatedObstacles,
        hits,
    };
}

/**
 * Create the initial game state from configuration.
 * This is the starting point for any game session.
 */
export function createInitialState(config: EngineConfig): GameState {
    const rng = createRNG(config.seed);

    const createPlayer = (startX: number): PlayerVehicle => ({
        x: startX,
        y: PLAYER_START_Y,
        velocityX: 0,
        velocityY: 0,
        width: SUB_WIDTH,
        height: SUB_HEIGHT,
        hp: SUB_STARTING_HP,
        wear: 0,
        state: PlayerState.Descending,
        maxDepthReached: PLAYER_START_Y,
        invincibilityFrames: 0,
        passengers: createPassengers(),
        facing: 1,
        facingTarget: 1,
        tilt: 0,
        pitch: 0,
        beamAngle: 0,
        implosionFrame: 0,
        rocketsRemaining: SMALL_ROCKET_COUNT,
        minesRemaining: 1,
    });

    return {
        frame: 0,
        seed: config.seed,
        rngState: rng.getState(),
        phase: GamePhase.Playing,
        introProgress: 1,
        players: {
            player1: createPlayer(getPlayer1StartX()),
            player2: createPlayer(getPlayer2StartX()),
        },
        obstacles: [],
        projectiles: [],
        pickups: [],
        anglerFish: [],
        gameOver: false,
        winner: null,
        generatedDepth: 0,
        currentMaxDepth: PLAYER_START_Y,
    };
}

/**
 * Check if two AABBs are colliding.
 */
function checkAABBCollision(a: AABB, b: AABB): boolean {
    return (
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
}

/**
 * Calculate descent speed based on current depth.
 */
function calculateDescentSpeed(depth: number): number {
    const normalizedDepth = Math.min(depth / MAX_DEPTH, 1);
    return BASE_DESCENT_SPEED + normalizedDepth * DESCENT_SPEED_FACTOR;
}

/**
 * Calculate wear increase rate based on depth.
 */
function calculateWearRate(depth: number): number {
    const normalizedDepth = Math.min(depth / MAX_DEPTH, 1);
    return BASE_WEAR_RATE + normalizedDepth * DEPTH_WEAR_FACTOR;
}

/** Physics constants for passenger sway */
const PASSENGER_SWAY_DAMPING = 0.92;
const PASSENGER_SWAY_SPRING = 8;
const PASSENGER_SWAY_ACCELERATION = 15;
const MAX_PASSENGER_OFFSET = 8;

/**
 * Update passenger physics (sway when turning).
 */
function updatePassengerPhysics(
    passengers: Passenger[],
    acceleration: number,
    dt: number
): Passenger[] {
    return passengers.map((p) => {
        if (!p.alive) return p;

        // Apply acceleration force (opposite direction of sub movement)
        let newVelocityX = p.velocityX - acceleration * PASSENGER_SWAY_ACCELERATION * dt;

        // Apply spring force back to center
        newVelocityX -= p.offsetX * PASSENGER_SWAY_SPRING * dt;

        // Apply damping
        newVelocityX *= PASSENGER_SWAY_DAMPING;

        // Update position
        let newOffsetX = p.offsetX + newVelocityX * dt * 60;

        // Clamp offset
        newOffsetX = Math.max(-MAX_PASSENGER_OFFSET, Math.min(MAX_PASSENGER_OFFSET, newOffsetX));

        return {
            ...p,
            offsetX: newOffsetX,
            velocityX: newVelocityX,
        };
    });
}

/**
 * Keep the crew in sync with HP: one passenger per hit point.
 *
 * Damage empties seats from the back of the sub, healing puts the crew back into
 * the same seats - a repaired hull with an empty cabin looked like a bug to players.
 * Revived passengers start centred so they don't pop in mid-sway.
 */
function syncPassengersToHp(passengers: Passenger[], hp: number): Passenger[] {
    const seats = passengers.length;
    if (seats === 0) return passengers;

    const target = Math.max(0, Math.min(hp, seats));
    let alive = 0;
    for (const passenger of passengers) {
        if (passenger.alive) alive++;
    }
    if (alive === target) return passengers;

    const result = [...passengers];

    // Too many alive - empty seats from the back
    for (let i = seats - 1; i >= 0 && alive > target; i--) {
        if (result[i].alive) {
            result[i] = { ...result[i], alive: false };
            alive--;
        }
    }

    // Too few alive - refill the front-most empty seats
    for (let i = 0; i < seats && alive < target; i++) {
        if (!result[i].alive) {
            result[i] = { ...result[i], alive: true, offsetX: 0, velocityX: 0 };
            alive++;
        }
    }

    return result;
}

/** Apply the crew invariant to a player. */
function withSyncedPassengers(player: PlayerVehicle): PlayerVehicle {
    const passengers = syncPassengersToHp(player.passengers, player.hp);
    return passengers === player.passengers ? player : { ...player, passengers };
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Update how the hull carries itself: which way it faces, how it rolls into a turn,
 * how the nose dips while diving, and how lazily the light cone follows.
 *
 * Kept in the engine (not the renderer) so it stays deterministic and survives a
 * restart or a replay, the same way passenger sway does.
 */
function updateHullMotion(
    player: PlayerVehicle,
    input: PlayerInputFrame,
    /** Sideways speed normalised to -1..1 */
    steerAmount: number,
    dt: number
): void {
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (steer !== 0) {
        player.facingTarget = steer;
    }

    // Facing sweeps through zero - that pass is what reads as the flip.
    // Inertia stretches the sweep, so a heavier boat takes longer to come around.
    const turnSeconds = Math.max(0.06, SUB_TURN_DURATION * (1 + SUB_STEER_INERTIA * 1.4));
    const facingStep = (2 / turnSeconds) * dt;
    const facingDelta = player.facingTarget - player.facing;
    player.facing += Math.sign(facingDelta) * Math.min(Math.abs(facingDelta), facingStep);

    const clampedSteer = Math.max(-1, Math.min(1, steerAmount));
    const targetTilt = SUB_MAX_TILT_DEG * DEG_TO_RAD * clampedSteer;
    const tiltEase = Math.max(0.5, SUB_TILT_EASE - SUB_STEER_INERTIA * 3);
    player.tilt += (targetTilt - player.tilt) * Math.min(1, tiltEase * dt);

    const dive = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const targetPitch = SUB_MAX_PITCH_DEG * DEG_TO_RAD * dive;
    player.pitch += (targetPitch - player.pitch) * Math.min(1, SUB_PITCH_EASE * dt);

    player.beamAngle += (player.tilt - player.beamAngle) * Math.min(1, SUB_BEAM_EASE * dt);
}

/**
 * Create a new angler fish at a random position.
 */
function createAnglerFish(
    rngNext: () => number,
    depth: number,
    canvasWidth: number
): AnglerFish {
    const side = rngNext() > 0.5 ? 'left' : 'right';
    // Spawn on visible edges of screen (not far outside)
    const x = side === 'left' ? 50 : canvasWidth - 50;
    const y = depth + (rngNext() - 0.5) * 300; // Spawn near player depth
    
    // Initial velocity towards center of screen
    const initialVelocityX = side === 'left' ? 30 : -30;
    
    return {
        id: generateAnglerFishId(),
        x,
        y,
        width: ANGLER_FISH_WIDTH,
        height: ANGLER_FISH_HEIGHT,
        velocityX: initialVelocityX,
        velocityY: 0,
        targetPlayerId: null,
        aggroRadius: ANGLER_FISH_AGGRO_RADIUS,
        speed: HORIZONTAL_SPEED * ANGLER_FISH_SPEED_MULTIPLIER,
        damage: ANGLER_FISH_DAMAGE,
        active: true,
    };
}

/**
 * Update angler fish: check aggro, move towards target, check collisions.
 */
function updateAnglerFish(
    fish: AnglerFish[],
    players: Record<PlayerId, PlayerVehicle>,
    obstacles: Obstacle[],
    dt: number
): { fish: AnglerFish[]; damagedPlayers: PlayerId[] } {
    const damagedPlayers: PlayerId[] = [];
    
    const updatedFish = fish.map(f => {
        if (!f.active) return f;
        
        let newFish = { ...f };
        
        // Check aggro if no target
        if (!newFish.targetPlayerId) {
            for (const playerId of ['player1', 'player2'] as const) {
                const player = players[playerId];
                if (player.state !== PlayerState.Descending) continue;
                
                const dx = player.x + player.width / 2 - (f.x + f.width / 2);
                const dy = player.y + player.height / 2 - (f.y + f.height / 2);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < f.aggroRadius) {
                    newFish.targetPlayerId = playerId;
                    break;
                }
            }
        }
        
        // Move towards target
        if (newFish.targetPlayerId) {
            const target = players[newFish.targetPlayerId];
            if (target.state === PlayerState.Dead || target.state === PlayerState.Escaped) {
                // Target is gone, stay idle
                newFish.targetPlayerId = null;
            } else {
                const dx = target.x + target.width / 2 - (newFish.x + newFish.width / 2);
                const dy = target.y + target.height / 2 - (newFish.y + newFish.height / 2);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    // Normalize and apply speed
                    newFish.velocityX = (dx / distance) * newFish.speed;
                    newFish.velocityY = (dy / distance) * newFish.speed;
                }
            }
        }
        
        // Apply velocity
        newFish.x += newFish.velocityX * dt;
        newFish.y += newFish.velocityY * dt;
        
        // Check collision with obstacles
        const fishBox: AABB = {
            x: newFish.x,
            y: newFish.y,
            width: newFish.width,
            height: newFish.height,
        };
        
        for (const obs of obstacles) {
            if (!obs.active) continue;
            const obsBox: AABB = {
                x: obs.x,
                y: obs.y,
                width: obs.width,
                height: obs.height,
            };
            if (checkAABBCollision(fishBox, obsBox)) {
                // Fish dies on obstacle collision
                newFish.active = false;
                break;
            }
        }
        
        // Check collision with target player
        if (newFish.active && newFish.targetPlayerId) {
            const target = players[newFish.targetPlayerId];
            if (target.state === PlayerState.Descending) {
                const playerBox: AABB = {
                    x: target.x,
                    y: target.y,
                    width: target.width,
                    height: target.height,
                };
                if (checkAABBCollision(fishBox, playerBox)) {
                    damagedPlayers.push(newFish.targetPlayerId);
                    newFish.active = false;
                }
            }
        }
        
        return newFish;
    });
    
    return { fish: updatedFish.filter(f => f.active), damagedPlayers };
}

/**
 * Update a single player's state for one frame.
 */
function updatePlayer(
    player: PlayerVehicle,
    input: PlayerInputFrame,
    obstacles: Obstacle[],
    dt: number
): { player: PlayerVehicle; collidedObstacles: string[] } {
    // Dead or escaped players don't update (but continue implosion animation)
    if (player.state === PlayerState.Dead || player.state === PlayerState.Escaped) {
        // Continue implosion animation
        if (player.implosionFrame > 0 && player.implosionFrame < 60) {
            return {
                player: { ...player, implosionFrame: player.implosionFrame + 1 },
                collidedObstacles: [],
            };
        }
        return { player, collidedObstacles: [] };
    }

    let newPlayer = { ...player };
    const collidedObstacles: string[] = [];
    const prevX = player.x;

    // Decrease invincibility frames
    if (newPlayer.invincibilityFrames > 0) {
        newPlayer.invincibilityFrames--;
    }

    // Handle dump ballast action (switch to ascending)
    if (input.action === 'dumpBallast' && player.state === PlayerState.Descending) {
        newPlayer = {
            ...newPlayer,
            state: PlayerState.Ascending,
            width: CAPSULE_WIDTH,
            height: CAPSULE_HEIGHT,
            hp: CAPSULE_HP,
            wear: 0,
            invincibilityFrames: INVINCIBILITY_FRAMES,
            passengers: [], // Capsule has no visible passengers
        };
    }

    // Horizontal movement
    let horizontalMove = 0;
    if (input.left) horizontalMove -= HORIZONTAL_SPEED * dt;
    if (input.right) horizontalMove += HORIZONTAL_SPEED * dt;

    newPlayer.x += horizontalMove;

    // Clamp to world bounds
    newPlayer.x = Math.max(
        WORLD_LEFT_BOUND,
        Math.min(getWorldRightBound() - newPlayer.width, newPlayer.x)
    );

    // Vertical player-controlled movement (up/down within screen)
    let verticalMove = 0;
    if (input.up) verticalMove -= VERTICAL_SPEED * dt;
    if (input.down) verticalMove += VERTICAL_SPEED * dt;

    // Calculate acceleration for passenger physics
    const acceleration = (newPlayer.x - prevX) / dt / HORIZONTAL_SPEED;
    newPlayer.velocityX = (newPlayer.x - prevX) / dt;
    newPlayer.velocityY = verticalMove / dt;

    // Update passenger physics
    if (newPlayer.state === PlayerState.Descending && newPlayer.passengers.length > 0) {
        newPlayer.passengers = updatePassengerPhysics(newPlayer.passengers, acceleration, dt);
    }

    // Hull turn / roll / pitch animation
    if (newPlayer.state !== PlayerState.Dead) {
        updateHullMotion(newPlayer, input, acceleration, dt);
    }

    // Vertical movement based on state
    if (newPlayer.state === PlayerState.Descending) {
        // Base descent speed (automatic)
        const baseSpeed = calculateDescentSpeed(newPlayer.y);
        // Add player-controlled vertical movement
        newPlayer.y += baseSpeed * dt + verticalMove;

        // Update max depth
        if (newPlayer.y > newPlayer.maxDepthReached) {
            newPlayer.maxDepthReached = newPlayer.y;
        }

        // Increase wear over time
        const wearRate = calculateWearRate(newPlayer.y);
        newPlayer.wear += wearRate * dt;

        // Check for implosion due to wear
        if (newPlayer.wear >= 100) {
            newPlayer.wear = 100;
            newPlayer.state = PlayerState.Dead;
            newPlayer.deathCause = DeathCause.Imploded;
            newPlayer.implosionFrame = 1; // Start implosion animation
            newPlayer.hp = 0; // crew is synced from HP
            return { player: newPlayer, collidedObstacles };
        }
    } else if (newPlayer.state === PlayerState.Ascending) {
        // Capsule moves upward
        newPlayer.y -= ASCENT_SPEED * dt;

        // Check if reached surface
        if (newPlayer.y <= 0) {
            newPlayer.y = 0;
            newPlayer.state = PlayerState.Escaped;
            return { player: newPlayer, collidedObstacles };
        }
    }

    // Collision detection (only if not invincible)
    if (newPlayer.invincibilityFrames <= 0) {
        const playerBox: AABB = {
            x: newPlayer.x,
            y: newPlayer.y,
            width: newPlayer.width,
            height: newPlayer.height,
        };

        for (const obstacle of obstacles) {
            if (!obstacle.active) continue;

            const obstacleBox: AABB = {
                x: obstacle.x,
                y: obstacle.y,
                width: obstacle.width,
                height: obstacle.height,
            };

            if (checkAABBCollision(playerBox, obstacleBox)) {
                collidedObstacles.push(obstacle.id);

                if (newPlayer.state === PlayerState.Ascending) {
                    // Any collision during ascent = instant death
                    newPlayer.hp = 0;
                    newPlayer.state = PlayerState.Dead;
                    newPlayer.deathCause = DeathCause.CrashedAscent;
                    newPlayer.implosionFrame = 1;
                    return { player: newPlayer, collidedObstacles };
                } else {
                    // Descent collision - apply damage and wear
                    const damage = COLLISION_DAMAGE[obstacle.type];
                    const wear = COLLISION_WEAR[obstacle.type];

                    newPlayer.hp -= damage;
                    newPlayer.wear += wear;
                    newPlayer.invincibilityFrames = INVINCIBILITY_FRAMES;

                    // Check for death
                    if (newPlayer.hp <= 0 || newPlayer.wear >= 100) {
                        newPlayer.wear = Math.min(newPlayer.wear, 100);
                        newPlayer.hp = 0; // crew is synced from HP
                        newPlayer.state = PlayerState.Dead;
                        newPlayer.deathCause = DeathCause.Imploded;
                        newPlayer.implosionFrame = 1; // Start implosion animation
                        return { player: newPlayer, collidedObstacles };
                    }
                }
            }
        }
    }

    return { player: newPlayer, collidedObstacles };
}

/**
 * Determine the winner of the game.
 */
function determineWinner(players: Record<PlayerId, PlayerVehicle>): PlayerId | 'draw' | null {
    const p1 = players.player1;
    const p2 = players.player2;

    const p1Survived = p1.state === PlayerState.Escaped;
    const p2Survived = p2.state === PlayerState.Escaped;

    if (p1Survived && p2Survived) {
        // Both survived - deeper dive wins
        if (p1.maxDepthReached > p2.maxDepthReached) return 'player1';
        if (p2.maxDepthReached > p1.maxDepthReached) return 'player2';
        return 'draw';
    }

    if (p1Survived && !p2Survived) return 'player1';
    if (p2Survived && !p1Survived) return 'player2';

    // Both dead - deeper dive wins
    if (p1.maxDepthReached > p2.maxDepthReached) return 'player1';
    if (p2.maxDepthReached > p1.maxDepthReached) return 'player2';
    return 'draw';
}

/**
 * Check if the game is over.
 */
function isGameOver(players: Record<PlayerId, PlayerVehicle>): boolean {
    const p1Done =
        players.player1.state === PlayerState.Dead || players.player1.state === PlayerState.Escaped;
    const p2Done =
        players.player2.state === PlayerState.Dead || players.player2.state === PlayerState.Escaped;
    return p1Done && p2Done;
}

/**
 * Main game state update function.
 * This is the core of the deterministic simulation.
 *
 * @param state - Current game state
 * @param inputs - Player inputs for this frame
 * @param dt - Delta time (should be fixed for determinism)
 * @returns New game state
 */
export function updateGameState(
    state: GameState,
    inputs: Record<PlayerId, PlayerInputFrame>,
    dt: number
): GameState {
    // Don't update if game is over
    if (state.gameOver) {
        return state;
    }

    // Restore RNG state
    const rng = createRNG(state.seed);
    rng.setState(state.rngState);

    // Calculate the furthest depth any active player has reached
    let maxActiveDepth = 0;
    for (const player of Object.values(state.players)) {
        if (player.state === PlayerState.Descending || player.state === PlayerState.Ascending) {
            maxActiveDepth = Math.max(maxActiveDepth, player.y);
        }
    }

    // Generate new obstacles if needed
    const targetDepth = maxActiveDepth + OBSTACLE_GENERATION_BUFFER;
    let obstacles = state.obstacles;
    let generatedDepth = state.generatedDepth;
    let pickups = [...state.pickups];

    if (targetDepth > generatedDepth) {
        obstacles = generateObstacles(rng, obstacles, generatedDepth, targetDepth);

        // Generate pickups in the new depth range
        const segmentSize = 100; // Check every 100m

        for (let depth = generatedDepth; depth < targetDepth; depth += segmentSize) {
            // HP pickup
            if (rng.next() < HP_PICKUP_CHANCE * segmentSize) {
                const x = rng.nextFloat(WORLD_LEFT_BOUND + 50, getWorldRightBound() - 50);
                pickups.push(
                    createPickup(PickupType.Health, x, depth + rng.nextFloat(0, segmentSize))
                );
            }

            // Ammo pickup (rarer)
            if (rng.next() < AMMO_PICKUP_CHANCE * segmentSize) {
                const x = rng.nextFloat(WORLD_LEFT_BOUND + 50, getWorldRightBound() - 50);
                const ammoType = rng.next() < 0.6 ? PickupType.Rocket : PickupType.Mine;
                pickups.push(createPickup(ammoType, x, depth + rng.nextFloat(0, segmentSize)));
            }
        }

        generatedDepth = targetDepth;
    }

    // Update obstacle positions (moving obstacles)
    obstacles = updateObstacles(obstacles, dt);

    // Get obstacles in the active range for collision detection
    const minDepth = Math.min(state.players.player1.y, state.players.player2.y);
    const visibleObstacles = getVisibleObstacles(obstacles, minDepth - 100, maxActiveDepth + 200);

    // Update players
    const p1Result = updatePlayer(state.players.player1, inputs.player1, visibleObstacles, dt);
    const p2Result = updatePlayer(state.players.player2, inputs.player2, visibleObstacles, dt);

    // Mark collided obstacles as inactive (so they don't trigger again)
    const allCollidedIds = new Set([...p1Result.collidedObstacles, ...p2Result.collidedObstacles]);
    obstacles = obstacles.map((o) => (allCollidedIds.has(o.id) ? { ...o, active: false } : o));

    // Handle projectile creation
    let newProjectiles = [...state.projectiles];

    // Player 1 fires rocket
    if (
        inputs.player1.action === 'fireRocket' &&
        p1Result.player.rocketsRemaining > 0 &&
        p1Result.player.state === PlayerState.Descending
    ) {
        const rocket = createRocket(
            'player1',
            p1Result.player.x,
            p1Result.player.y,
            'player2',
            p2Result.player.x
        );
        newProjectiles.push(rocket);
        p1Result.player = {
            ...p1Result.player,
            rocketsRemaining: p1Result.player.rocketsRemaining - 1,
        };
    }

    // Player 1 deploys mine
    if (
        inputs.player1.action === 'deployMine' &&
        p1Result.player.minesRemaining > 0 &&
        p1Result.player.state === PlayerState.Descending
    ) {
        const mine = createMine('player1', p1Result.player.x, p1Result.player.y);
        newProjectiles.push(mine);
        p1Result.player = {
            ...p1Result.player,
            minesRemaining: p1Result.player.minesRemaining - 1,
        };
    }

    // Player 2 fires rocket
    if (
        inputs.player2.action === 'fireRocket' &&
        p2Result.player.rocketsRemaining > 0 &&
        p2Result.player.state === PlayerState.Descending
    ) {
        const rocket = createRocket(
            'player2',
            p2Result.player.x,
            p2Result.player.y,
            'player1',
            p1Result.player.x
        );
        newProjectiles.push(rocket);
        p2Result.player = {
            ...p2Result.player,
            rocketsRemaining: p2Result.player.rocketsRemaining - 1,
        };
    }

    // Player 2 deploys mine
    if (
        inputs.player2.action === 'deployMine' &&
        p2Result.player.minesRemaining > 0 &&
        p2Result.player.state === PlayerState.Descending
    ) {
        const mine = createMine('player2', p2Result.player.x, p2Result.player.y);
        newProjectiles.push(mine);
        p2Result.player = {
            ...p2Result.player,
            minesRemaining: p2Result.player.minesRemaining - 1,
        };
    }

    // Update projectile positions
    newProjectiles = updateProjectiles(newProjectiles, dt);

    // Check projectile collisions
    let newPlayers = {
        player1: p1Result.player,
        player2: p2Result.player,
    };

    const collisionResult = checkProjectileCollisions(newProjectiles, newPlayers, obstacles);
    newProjectiles = collisionResult.projectiles;
    newPlayers = collisionResult.players;
    obstacles = collisionResult.obstacles;

    // Check pickup collisions
    for (const pickup of pickups) {
        if (!pickup.active) continue;

        // Check player 1
        if (checkPickupCollision(pickup, newPlayers.player1)) {
            newPlayers = {
                ...newPlayers,
                player1: applyPickup(pickup, newPlayers.player1),
            };
            pickup.active = false;
        }
        // Check player 2
        else if (checkPickupCollision(pickup, newPlayers.player2)) {
            newPlayers = {
                ...newPlayers,
                player2: applyPickup(pickup, newPlayers.player2),
            };
            pickup.active = false;
        }
    }

    // Remove collected pickups
    pickups = pickups.filter((p) => p.active);

    // Spawn angler fish at deep depths
    let anglerFish = [...state.anglerFish];
    if (maxActiveDepth > ANGLER_FISH_MIN_DEPTH && anglerFish.length < ANGLER_FISH_MAX_COUNT) {
        // Chance to spawn based on depth
        if (rng.next() < ANGLER_FISH_SPAWN_CHANCE * (maxActiveDepth - ANGLER_FISH_MIN_DEPTH)) {
            const newFish = createAnglerFish(rng.next.bind(rng), maxActiveDepth, 1920);
            anglerFish.push(newFish);
        }
    }

    // Update angler fish (movement and collisions)
    const fishResult = updateAnglerFish(anglerFish, newPlayers, obstacles, dt);
    anglerFish = fishResult.fish;

    // Apply damage from fish attacks
    for (const playerId of fishResult.damagedPlayers) {
        const player = newPlayers[playerId];
        if (player.invincibilityFrames === 0 && player.state === PlayerState.Descending) {
            const newHp = player.hp - ANGLER_FISH_DAMAGE;
            newPlayers = {
                ...newPlayers,
                [playerId]: {
                    ...player,
                    hp: Math.max(0, newHp),
                    invincibilityFrames: INVINCIBILITY_FRAMES,
                },
            };
        }
    }

    // One passenger per hit point, always - after every damage and heal this frame
    newPlayers = {
        player1: withSyncedPassengers(newPlayers.player1),
        player2: withSyncedPassengers(newPlayers.player2),
    };

    // Update current max depth
    const newMaxDepth = Math.max(state.currentMaxDepth, newPlayers.player1.y, newPlayers.player2.y);

    const gameOver = isGameOver(newPlayers);
    const winner = gameOver ? determineWinner(newPlayers) : null;

    return {
        frame: state.frame + 1,
        seed: state.seed,
        rngState: rng.getState(),
        phase: gameOver ? GamePhase.GameOver : state.phase,
        introProgress: state.introProgress,
        players: newPlayers,
        obstacles,
        projectiles: newProjectiles,
        pickups,
        anglerFish,
        gameOver,
        winner,
        generatedDepth,
        currentMaxDepth: newMaxDepth,
    };
}

/**
 * Rescale every horizontal coordinate in the world by `scale`.
 *
 * The world is laid out in canvas pixels, so a window resize (entering fullscreen
 * counts) would otherwise leave the submarines and the obstacle field sitting at
 * coordinates from the old width - everything bunched against one edge.
 */
export function rescaleWorldX(state: GameState, scale: number): GameState {
    if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return state;

    const scalePlayer = (player: PlayerVehicle): PlayerVehicle => ({
        ...player,
        x: player.x * scale,
    });

    return {
        ...state,
        players: {
            player1: scalePlayer(state.players.player1),
            player2: scalePlayer(state.players.player2),
        },
        obstacles: state.obstacles.map((o) => ({ ...o, x: o.x * scale })),
        projectiles: state.projectiles.map((p) => ({ ...p, x: p.x * scale })),
        pickups: state.pickups.map((p) => ({ ...p, x: p.x * scale })),
        anglerFish: state.anglerFish.map((f) => ({ ...f, x: f.x * scale })),
    };
}

/**
 * Get the result summary for display.
 */
export function getGameResults(state: GameState) {
    return {
        player1: {
            playerId: 'player1' as PlayerId,
            state: state.players.player1.state,
            maxDepth: state.players.player1.maxDepthReached,
            deathCause: state.players.player1.deathCause,
        },
        player2: {
            playerId: 'player2' as PlayerId,
            state: state.players.player2.state,
            maxDepth: state.players.player2.maxDepthReached,
            deathCause: state.players.player2.deathCause,
        },
        winner: state.winner,
        seed: state.seed,
    };
}
