/**
 * Tests for game state determinism and core mechanics.
 */

import { describe, it, expect } from 'vitest';
import { createInitialState, updateGameState, rescaleWorldX } from '../gameState';
import type { PlayerInputFrame, PlayerId } from '../types';
import { PlayerState, PickupType } from '../types';
import { FIXED_DT, CANVAS_WIDTH, CANVAS_HEIGHT, MAX_DEPTH } from '../config';

const defaultConfig = {
    seed: 12345,
    maxDepth: MAX_DEPTH,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
};

function createEmptyInput(frame: number): PlayerInputFrame {
    return { frame, up: false, down: false, left: false, right: false, action: null };
}

function createInputs(
    frame: number,
    overrides: Partial<Record<PlayerId, Partial<PlayerInputFrame>>> = {}
): Record<PlayerId, PlayerInputFrame> {
    return {
        player1: { ...createEmptyInput(frame), ...overrides.player1 },
        player2: { ...createEmptyInput(frame), ...overrides.player2 },
    };
}

describe('Game State Determinism', () => {
    it('produces identical states for same seed and inputs', () => {
        const state1 = createInitialState(defaultConfig);
        const state2 = createInitialState(defaultConfig);

        // Run 100 frames with no input
        let s1 = state1;
        let s2 = state2;

        for (let i = 0; i < 100; i++) {
            const inputs = createInputs(i);
            s1 = updateGameState(s1, inputs, FIXED_DT);
            s2 = updateGameState(s2, inputs, FIXED_DT);
        }

        expect(s1.frame).toBe(s2.frame);
        expect(s1.players.player1.y).toBe(s2.players.player1.y);
        expect(s1.players.player2.y).toBe(s2.players.player2.y);
        expect(s1.players.player1.wear).toBe(s2.players.player1.wear);
        expect(s1.obstacles.length).toBe(s2.obstacles.length);
        expect(s1.rngState).toBe(s2.rngState);
    });

    it('produces different obstacle layouts for different seeds', () => {
        const state1 = createInitialState({ ...defaultConfig, seed: 11111 });
        const state2 = createInitialState({ ...defaultConfig, seed: 22222 });

        // Run enough frames to generate obstacles
        let s1 = state1;
        let s2 = state2;

        for (let i = 0; i < 200; i++) {
            const inputs = createInputs(i);
            s1 = updateGameState(s1, inputs, FIXED_DT);
            s2 = updateGameState(s2, inputs, FIXED_DT);
        }

        // Both should have obstacles
        expect(s1.obstacles.length).toBeGreaterThan(0);
        expect(s2.obstacles.length).toBeGreaterThan(0);

        // But they should differ in positions
        const positions1 = s1.obstacles.map((o) => `${o.x.toFixed(2)},${o.y.toFixed(2)}`).sort();
        const positions2 = s2.obstacles.map((o) => `${o.x.toFixed(2)},${o.y.toFixed(2)}`).sort();

        expect(positions1).not.toEqual(positions2);
    });

    it('input affects player position deterministically', () => {
        // Run two simulations with same seed but different inputs
        const state1 = createInitialState(defaultConfig);
        const state2 = createInitialState(defaultConfig);

        let s1 = state1;
        let s2 = state2;

        // Player 1 moves left in first sim, right in second
        for (let i = 0; i < 60; i++) {
            const inputs1 = createInputs(i, { player1: { left: true } });
            const inputs2 = createInputs(i, { player1: { right: true } });

            s1 = updateGameState(s1, inputs1, FIXED_DT);
            s2 = updateGameState(s2, inputs2, FIXED_DT);
        }

        // Player 1 positions should differ
        expect(s1.players.player1.x).not.toBe(s2.players.player1.x);
        expect(s1.players.player1.x).toBeLessThan(s2.players.player1.x);

        // Player 2 should be same in both
        expect(s1.players.player2.x).toBe(s2.players.player2.x);
    });

    it('replay produces identical final state', () => {
        const state = createInitialState(defaultConfig);

        // Record a sequence of inputs
        const inputHistory: Record<PlayerId, PlayerInputFrame>[] = [];
        let s = state;

        for (let i = 0; i < 100; i++) {
            const p1Left = i % 7 < 3;
            const p1Right = i % 11 < 2;
            const p2Left = i % 5 < 2;
            const p2Right = i % 9 < 3;

            const inputs = createInputs(i, {
                player1: { left: p1Left, right: p1Right },
                player2: { left: p2Left, right: p2Right },
            });

            inputHistory.push(inputs);
            s = updateGameState(s, inputs, FIXED_DT);
        }

        const finalState1 = s;

        // Replay with same inputs
        let s2 = createInitialState(defaultConfig);
        for (const inputs of inputHistory) {
            s2 = updateGameState(s2, inputs, FIXED_DT);
        }

        expect(s2.frame).toBe(finalState1.frame);
        expect(s2.players.player1.x).toBeCloseTo(finalState1.players.player1.x, 10);
        expect(s2.players.player1.y).toBeCloseTo(finalState1.players.player1.y, 10);
        expect(s2.players.player2.x).toBeCloseTo(finalState1.players.player2.x, 10);
        expect(s2.players.player2.y).toBeCloseTo(finalState1.players.player2.y, 10);
        expect(s2.rngState).toBe(finalState1.rngState);
    });
});

describe('Game Mechanics', () => {
    it('players descend over time', () => {
        let state = createInitialState(defaultConfig);
        const initialY = state.players.player1.y;

        for (let i = 0; i < 60; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        expect(state.players.player1.y).toBeGreaterThan(initialY);
        expect(state.players.player2.y).toBeGreaterThan(initialY);
    });

    it('wear increases over time', () => {
        let state = createInitialState(defaultConfig);
        const initialWear = state.players.player1.wear;

        for (let i = 0; i < 120; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        expect(state.players.player1.wear).toBeGreaterThan(initialWear);
    });

    it('dump ballast switches player to ascending', () => {
        let state = createInitialState(defaultConfig);

        // Dive for a bit
        for (let i = 0; i < 60; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        expect(state.players.player1.state).toBe(PlayerState.Descending);

        // Player 1 dumps ballast
        const inputs = createInputs(60, { player1: { action: 'dumpBallast' } });
        state = updateGameState(state, inputs, FIXED_DT);

        expect(state.players.player1.state).toBe(PlayerState.Ascending);
        expect(state.players.player1.hp).toBe(1); // Capsule has 1 HP
        expect(state.players.player2.state).toBe(PlayerState.Descending); // P2 still diving
    });

    it('ascending player moves upward', () => {
        let state = createInitialState(defaultConfig);

        // Dive longer to get deeper
        for (let i = 0; i < 200; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        const depthBeforeAscent = state.players.player1.y;
        expect(depthBeforeAscent).toBeGreaterThan(100); // Ensure we dove deep enough

        // Dump ballast
        state = updateGameState(
            state,
            createInputs(200, { player1: { action: 'dumpBallast' } }),
            FIXED_DT
        );

        // Ascend for a few frames (not too many or player will escape)
        for (let i = 201; i < 210; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        // Player should have moved upward (either still ascending or escaped)
        expect(state.players.player1.y).toBeLessThan(depthBeforeAscent);
        expect([PlayerState.Ascending, PlayerState.Escaped]).toContain(state.players.player1.state);
    });

    it('player escapes when reaching surface', () => {
        let state = createInitialState(defaultConfig);

        // Dive a small amount
        for (let i = 0; i < 30; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        // Dump ballast immediately
        state = updateGameState(
            state,
            createInputs(30, { player1: { action: 'dumpBallast' } }),
            FIXED_DT
        );

        // Keep ascending until escaped or timeout
        let frame = 31;
        while (state.players.player1.state === PlayerState.Ascending && frame < 1000) {
            state = updateGameState(state, createInputs(frame), FIXED_DT);
            frame++;
        }

        expect(state.players.player1.state).toBe(PlayerState.Escaped);
    });

    it('game ends when both players are done', () => {
        let state = createInitialState(defaultConfig);

        // Run until game over or timeout
        let frame = 0;
        while (!state.gameOver && frame < 50000) {
            // Both players try to escape early
            const inputs = createInputs(frame, {
                player1: { action: frame === 30 ? 'dumpBallast' : null },
                player2: { action: frame === 30 ? 'dumpBallast' : null },
            });
            state = updateGameState(state, inputs, FIXED_DT);
            frame++;
        }

        expect(state.gameOver).toBe(true);
        expect(state.winner).not.toBeNull();
    });
});

describe('Passengers', () => {
    it('empties one seat per HP lost', () => {
        const state = createInitialState(defaultConfig);
        const damaged = {
            ...state,
            players: {
                ...state.players,
                player1: { ...state.players.player1, hp: 2 },
            },
        };

        const next = updateGameState(damaged, createInputs(0), FIXED_DT);

        expect(next.players.player1.passengers.filter((p) => p.alive).length).toBe(2);
    });

    it('brings passengers back when HP is restored by a pickup', () => {
        const state = createInitialState(defaultConfig);
        const player = state.players.player1;

        const damaged = {
            ...state,
            players: {
                ...state.players,
                player1: {
                    ...player,
                    hp: 2,
                    passengers: player.passengers.map((p, i) => ({ ...p, alive: i < 2 })),
                },
            },
            pickups: [
                {
                    id: 'test-health',
                    type: PickupType.Health,
                    x: player.x,
                    y: player.y,
                    size: 20,
                    active: true,
                },
            ],
        };

        const next = updateGameState(damaged, createInputs(0), FIXED_DT);

        expect(next.players.player1.hp).toBe(3);
        expect(next.players.player1.passengers.filter((p) => p.alive).length).toBe(3);
    });

    it('keeps alive passengers equal to HP for the whole dive', () => {
        let state = createInitialState(defaultConfig);

        for (let i = 0; i < 400; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);

            for (const player of Object.values(state.players)) {
                if (player.passengers.length === 0) continue;
                const alive = player.passengers.filter((p) => p.alive).length;
                expect(alive).toBe(Math.max(0, Math.min(player.hp, player.passengers.length)));
            }
        }
    });
});

describe('World rescaling', () => {
    it('stretches every horizontal coordinate by the same factor', () => {
        let state = createInitialState(defaultConfig);
        for (let i = 0; i < 120; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        const scaled = rescaleWorldX(state, 2);

        expect(scaled.players.player1.x).toBe(state.players.player1.x * 2);
        expect(scaled.players.player2.x).toBe(state.players.player2.x * 2);
        expect(scaled.obstacles.length).toBe(state.obstacles.length);
        scaled.obstacles.forEach((o, i) => {
            expect(o.x).toBe(state.obstacles[i].x * 2);
            expect(o.y).toBe(state.obstacles[i].y);
        });
    });

    it('leaves the state untouched for a no-op scale', () => {
        const state = createInitialState(defaultConfig);
        expect(rescaleWorldX(state, 1)).toBe(state);
        expect(rescaleWorldX(state, 0)).toBe(state);
        expect(rescaleWorldX(state, Number.NaN)).toBe(state);
    });
});

describe('Obstacle Generation', () => {
    it('generates obstacles as players descend', () => {
        let state = createInitialState(defaultConfig);

        expect(state.obstacles.length).toBe(0);

        // Descend for a while
        for (let i = 0; i < 300; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        expect(state.obstacles.length).toBeGreaterThan(0);
    });

    it('obstacle types depend on depth', () => {
        let state = createInitialState({ ...defaultConfig, seed: 99999 });

        // Run for a long time to generate lots of obstacles
        for (let i = 0; i < 1000; i++) {
            state = updateGameState(state, createInputs(i), FIXED_DT);
        }

        // We should have various obstacle types
        const types = new Set(state.obstacles.map((o) => o.type));
        expect(types.size).toBeGreaterThan(1);
    });
});
