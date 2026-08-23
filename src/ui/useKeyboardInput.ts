/**
 * React hook for handling keyboard AND gamepad input for both players.
 * Maps physical keys and gamepad buttons to player actions in a hot-seat multiplayer setup.
 *
 * Keyboard Controls:
 * Player 1: WASD movement, Q=eject, E=rocket, R=mine
 * Player 2: Arrow keys movement, /=eject, .=rocket, ,=mine
 *
 * Gamepad Controls (Standard layout):
 * Movement: Left stick OR D-pad
 * A/X button: Fire rocket
 * B/Circle button: Deploy mine
 * X/Square or Y/Triangle button: Eject
 * RB/R1: Alternative rocket
 * LB/L1: Alternative mine
 */

import { useEffect, useRef, useCallback } from 'react';
import type { PlayerInputFrame, PlayerId, PlayerAction } from '../engine/types';

// ============ GAMEPAD SUPPORT ============

// Dead zone for analog sticks (to prevent drift)
const STICK_DEADZONE = 0.3;

// Track previous button states for edge detection (fire once per press)
const prevGamepadButtonStates: Record<number, Record<number, boolean>> = {};

interface GamepadMovement {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}

interface GamepadInputResult {
    movement: {
        player1: GamepadMovement;
        player2: GamepadMovement;
    };
    actions: {
        player1: PlayerAction;
        player2: PlayerAction;
    };
}

/**
 * Check if a button was just pressed (not held)
 */
function wasGamepadButtonJustPressed(
    gamepadIndex: number,
    buttonIndex: number,
    currentPressed: boolean
): boolean {
    if (!prevGamepadButtonStates[gamepadIndex]) {
        prevGamepadButtonStates[gamepadIndex] = {};
    }

    const wasPressed = prevGamepadButtonStates[gamepadIndex][buttonIndex] || false;
    prevGamepadButtonStates[gamepadIndex][buttonIndex] = currentPressed;

    // Return true only on the transition from not-pressed to pressed
    return currentPressed && !wasPressed;
}

/**
 * Snapshot current gamepad button states without emitting "just pressed" events.
 * Used when returning from the pause menu so buttons held there don't fire actions.
 */
export function syncGamepadButtonStates(): void {
    for (const gamepad of navigator.getGamepads()) {
        if (!gamepad) continue;
        const states: Record<number, boolean> = {};
        gamepad.buttons.forEach((button, index) => {
            states[index] = button.pressed;
        });
        prevGamepadButtonStates[gamepad.index] = states;
    }
}

/**
 * Get movement state from a gamepad
 */
function getGamepadMovement(gamepad: Gamepad): GamepadMovement {
    const state: GamepadMovement = {
        up: false,
        down: false,
        left: false,
        right: false,
    };

    // Check analog stick (axes 0 and 1)
    if (gamepad.axes.length >= 2) {
        const horizontal = gamepad.axes[0];
        const vertical = gamepad.axes[1];

        if (horizontal < -STICK_DEADZONE) state.left = true;
        if (horizontal > STICK_DEADZONE) state.right = true;
        if (vertical < -STICK_DEADZONE) state.up = true;
        if (vertical > STICK_DEADZONE) state.down = true;
    }

    // Check D-pad (buttons 12-15 on standard gamepad)
    if (gamepad.buttons.length >= 16) {
        if (gamepad.buttons[12]?.pressed) state.up = true;
        if (gamepad.buttons[13]?.pressed) state.down = true;
        if (gamepad.buttons[14]?.pressed) state.left = true;
        if (gamepad.buttons[15]?.pressed) state.right = true;
    }

    return state;
}

/**
 * Get action from a gamepad (rocket, mine, eject)
 */
function getGamepadAction(gamepad: Gamepad): PlayerAction {
    const index = gamepad.index;

    // A button (0) = Fire rocket
    if (gamepad.buttons[0] && wasGamepadButtonJustPressed(index, 0, gamepad.buttons[0].pressed)) {
        return 'fireRocket';
    }

    // B button (1) = Deploy mine
    if (gamepad.buttons[1] && wasGamepadButtonJustPressed(index, 1, gamepad.buttons[1].pressed)) {
        return 'deployMine';
    }

    // X button (2) or Y button (3) = Eject (dumpBallast)
    if (gamepad.buttons[2] && wasGamepadButtonJustPressed(index, 2, gamepad.buttons[2].pressed)) {
        return 'dumpBallast';
    }
    if (gamepad.buttons[3] && wasGamepadButtonJustPressed(index, 3, gamepad.buttons[3].pressed)) {
        return 'dumpBallast';
    }

    // RB/R1 button (5) = Alternative rocket
    if (gamepad.buttons[5] && wasGamepadButtonJustPressed(index, 5, gamepad.buttons[5].pressed)) {
        return 'fireRocket';
    }

    // LB/L1 button (4) = Alternative mine
    if (gamepad.buttons[4] && wasGamepadButtonJustPressed(index, 4, gamepad.buttons[4].pressed)) {
        return 'deployMine';
    }

    return null;
}

/**
 * Sample all connected gamepads
 */
function sampleGamepads(): GamepadInputResult {
    const result: GamepadInputResult = {
        movement: {
            player1: { up: false, down: false, left: false, right: false },
            player2: { up: false, down: false, left: false, right: false },
        },
        actions: {
            player1: null,
            player2: null,
        },
    };

    const gamepads = navigator.getGamepads();

    // Gamepad 0 = Player 1
    if (gamepads[0]) {
        result.movement.player1 = getGamepadMovement(gamepads[0]);
        result.actions.player1 = getGamepadAction(gamepads[0]);
    }

    // Gamepad 1 = Player 2
    if (gamepads[1]) {
        result.movement.player2 = getGamepadMovement(gamepads[1]);
        result.actions.player2 = getGamepadAction(gamepads[1]);
    }

    return result;
}

// ============ KEYBOARD SUPPORT ============

/** Key mappings for Player 1 (WASD + QER) */
const P1_KEYS = {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    eject: 'KeyQ',
    rocket: 'KeyE',
    mine: 'KeyR',
};

/** Key mappings for Player 2 (Arrows + /, ., ,) */
const P2_KEYS = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    eject: 'Slash', // /
    rocket: 'Period', // .
    mine: 'Comma', // ,
};

/** Current state of pressed keys */
interface KeyState {
    player1: {
        up: boolean;
        down: boolean;
        left: boolean;
        right: boolean;
    };
    player2: {
        up: boolean;
        down: boolean;
        left: boolean;
        right: boolean;
    };
}

/** Track which action was just pressed this frame (for single-fire) */
interface ActionPressed {
    player1: PlayerAction;
    player2: PlayerAction;
}

/**
 * Hook that tracks keyboard input for both players.
 * Returns a function to sample the current input state as PlayerInputFrames.
 */
export function useKeyboardInput() {
    const keyState = useRef<KeyState>({
        player1: { up: false, down: false, left: false, right: false },
        player2: { up: false, down: false, left: false, right: false },
    });

    // Track which action key was pressed since last sample (for single-fire behavior)
    const actionPressed = useRef<ActionPressed>({
        player1: null,
        player2: null,
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const code = e.code;

            // Player 1 movement
            if (code === P1_KEYS.up) {
                e.preventDefault();
                keyState.current.player1.up = true;
            }
            if (code === P1_KEYS.down) {
                e.preventDefault();
                keyState.current.player1.down = true;
            }
            if (code === P1_KEYS.left) {
                e.preventDefault();
                keyState.current.player1.left = true;
            }
            if (code === P1_KEYS.right) {
                e.preventDefault();
                keyState.current.player1.right = true;
            }

            // Player 1 actions (only set if not already set this frame)
            if (code === P1_KEYS.eject && !actionPressed.current.player1) {
                e.preventDefault();
                actionPressed.current.player1 = 'dumpBallast';
            }
            if (code === P1_KEYS.rocket && !actionPressed.current.player1) {
                e.preventDefault();
                actionPressed.current.player1 = 'fireRocket';
            }
            if (code === P1_KEYS.mine && !actionPressed.current.player1) {
                e.preventDefault();
                actionPressed.current.player1 = 'deployMine';
            }

            // Player 2 movement
            if (code === P2_KEYS.up) {
                e.preventDefault();
                keyState.current.player2.up = true;
            }
            if (code === P2_KEYS.down) {
                e.preventDefault();
                keyState.current.player2.down = true;
            }
            if (code === P2_KEYS.left) {
                e.preventDefault();
                keyState.current.player2.left = true;
            }
            if (code === P2_KEYS.right) {
                e.preventDefault();
                keyState.current.player2.right = true;
            }

            // Player 2 actions
            if (code === P2_KEYS.eject && !actionPressed.current.player2) {
                e.preventDefault();
                actionPressed.current.player2 = 'dumpBallast';
            }
            if (code === P2_KEYS.rocket && !actionPressed.current.player2) {
                e.preventDefault();
                actionPressed.current.player2 = 'fireRocket';
            }
            if (code === P2_KEYS.mine && !actionPressed.current.player2) {
                e.preventDefault();
                actionPressed.current.player2 = 'deployMine';
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const code = e.code;

            // Player 1
            if (code === P1_KEYS.up) keyState.current.player1.up = false;
            if (code === P1_KEYS.down) keyState.current.player1.down = false;
            if (code === P1_KEYS.left) keyState.current.player1.left = false;
            if (code === P1_KEYS.right) keyState.current.player1.right = false;

            // Player 2
            if (code === P2_KEYS.up) keyState.current.player2.up = false;
            if (code === P2_KEYS.down) keyState.current.player2.down = false;
            if (code === P2_KEYS.left) keyState.current.player2.left = false;
            if (code === P2_KEYS.right) keyState.current.player2.right = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Handle gamepad connection events
        const handleGamepadConnect = (e: GamepadEvent) => {
            console.log(`🎮 Gamepad ${e.gamepad.index + 1} connected: ${e.gamepad.id}`);
        };

        const handleGamepadDisconnect = (e: GamepadEvent) => {
            console.log(`🎮 Gamepad ${e.gamepad.index + 1} disconnected`);
            // Clean up button state tracking
            delete prevGamepadButtonStates[e.gamepad.index];
        };

        // Releasing focus (alt-tab, devtools, fullscreen prompt) can swallow keyup
        // events and leave keys stuck down - reset everything when that happens.
        const handleBlur = () => {
            keyState.current = {
                player1: { up: false, down: false, left: false, right: false },
                player2: { up: false, down: false, left: false, right: false },
            };
            actionPressed.current = { player1: null, player2: null };
        };

        window.addEventListener('gamepadconnected', handleGamepadConnect);
        window.addEventListener('gamepaddisconnected', handleGamepadDisconnect);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('gamepadconnected', handleGamepadConnect);
            window.removeEventListener('gamepaddisconnected', handleGamepadDisconnect);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    /**
     * Drop any buffered input (held keys and pending actions).
     * Called on restart / resume so a key held during a menu doesn't leak into the round.
     */
    const clearInputs = useCallback(() => {
        keyState.current = {
            player1: { up: false, down: false, left: false, right: false },
            player2: { up: false, down: false, left: false, right: false },
        };
        actionPressed.current = { player1: null, player2: null };
        syncGamepadButtonStates();
    }, []);

    /**
     * Sample the current input state for both players.
     * Combines keyboard and gamepad input.
     * This should be called once per game frame.
     * The action is consumed after sampling (single-fire).
     */
    const sampleInputs = useCallback((frame: number): Record<PlayerId, PlayerInputFrame> => {
        // Get keyboard actions
        let p1Action = actionPressed.current.player1;
        let p2Action = actionPressed.current.player2;

        // Reset keyboard action pressed flags after sampling
        actionPressed.current.player1 = null;
        actionPressed.current.player2 = null;

        // Get gamepad input
        const gamepadInput = sampleGamepads();

        // Merge gamepad actions (gamepad takes priority if keyboard action is null)
        if (!p1Action && gamepadInput.actions.player1) {
            p1Action = gamepadInput.actions.player1;
        }
        if (!p2Action && gamepadInput.actions.player2) {
            p2Action = gamepadInput.actions.player2;
        }

        return {
            player1: {
                frame,
                // Combine keyboard and gamepad movement (OR together)
                up: keyState.current.player1.up || gamepadInput.movement.player1.up,
                down: keyState.current.player1.down || gamepadInput.movement.player1.down,
                left: keyState.current.player1.left || gamepadInput.movement.player1.left,
                right: keyState.current.player1.right || gamepadInput.movement.player1.right,
                action: p1Action,
            },
            player2: {
                frame,
                up: keyState.current.player2.up || gamepadInput.movement.player2.up,
                down: keyState.current.player2.down || gamepadInput.movement.player2.down,
                left: keyState.current.player2.left || gamepadInput.movement.player2.left,
                right: keyState.current.player2.right || gamepadInput.movement.player2.right,
                action: p2Action,
            },
        };
    }, []);

    // Get connected gamepad count
    const getGamepadCount = useCallback((): number => {
        return navigator.getGamepads().filter((g) => g !== null).length;
    }, []);

    /**
     * Sample only movement inputs (no actions) - used for ready check.
     * This doesn't consume action button states.
     */
    const sampleMovementOnly = useCallback((): { player1Down: boolean; player2Down: boolean } => {
        // Check keyboard
        const p1KeyDown = keyState.current.player1.down;
        const p2KeyDown = keyState.current.player2.down;

        // Check gamepads (just movement, no button state tracking)
        let p1GamepadDown = false;
        let p2GamepadDown = false;

        const gamepads = navigator.getGamepads();

        // Gamepad 0 = Player 1
        if (gamepads[0]) {
            const gp = gamepads[0];
            // Check stick
            if (gp.axes.length >= 2 && gp.axes[1] > STICK_DEADZONE) {
                p1GamepadDown = true;
            }
            // Check D-pad
            if (gp.buttons.length >= 14 && gp.buttons[13]?.pressed) {
                p1GamepadDown = true;
            }
        }

        // Gamepad 1 = Player 2
        if (gamepads[1]) {
            const gp = gamepads[1];
            // Check stick
            if (gp.axes.length >= 2 && gp.axes[1] > STICK_DEADZONE) {
                p2GamepadDown = true;
            }
            // Check D-pad
            if (gp.buttons.length >= 14 && gp.buttons[13]?.pressed) {
                p2GamepadDown = true;
            }
        }

        return {
            player1Down: p1KeyDown || p1GamepadDown,
            player2Down: p2KeyDown || p2GamepadDown,
        };
    }, []);

    return { sampleInputs, getGamepadCount, sampleMovementOnly, clearInputs };
}
