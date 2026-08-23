/**
 * "System" controls that live outside the gameplay input: pause menu and quick restart.
 *
 * Keyboard:
 *   P            - toggle pause menu
 *   Backspace    - hold to restart the round instantly
 *
 * Gamepad (either pad):
 *   START (9) / SELECT (8) - tap toggles the pause menu, hold restarts the round
 *
 * The hook reports hold progress (0..1) so the UI can draw a progress ring and the
 * player always sees that something is happening before the round is thrown away.
 */

import { useEffect, useRef, useState } from 'react';

/** Buttons treated as "system" buttons on a standard gamepad layout */
const SYSTEM_BUTTONS = [8, 9];

/** How long the restart button must be held (ms) */
export const RESTART_HOLD_MS = 800;

interface SystemControlsOptions {
    /** Tap on a system button / P key */
    onTogglePause: () => void;
    /** Hold completed - restart the round */
    onQuickRestart: () => void;
    /** When false the hook ignores all input (e.g. while transitioning screens) */
    enabled?: boolean;
    holdMs?: number;
}

/**
 * Returns the current hold progress (0..1) for the restart gesture.
 */
export function useSystemControls({
    onTogglePause,
    onQuickRestart,
    enabled = true,
    holdMs = RESTART_HOLD_MS,
}: SystemControlsOptions): number {
    const [holdProgress, setHoldProgress] = useState(0);

    // Keep callbacks in refs so the RAF loop never needs to be torn down.
    const callbacksRef = useRef({ onTogglePause, onQuickRestart });
    const enabledRef = useRef(enabled);

    useEffect(() => {
        callbacksRef.current = { onTogglePause, onQuickRestart };
        enabledRef.current = enabled;
    });

    const keyHoldRef = useRef(false);
    const holdStartRef = useRef<number | null>(null);
    const holdFiredRef = useRef(false);
    const holdSourceRef = useRef<'key' | 'gamepad' | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!enabledRef.current) return;

            if (e.code === 'Backspace') {
                e.preventDefault();
                keyHoldRef.current = true;
                return;
            }

            if (e.code === 'KeyP' && !e.repeat) {
                e.preventDefault();
                callbacksRef.current.onTogglePause();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Backspace') {
                keyHoldRef.current = false;
            }
        };

        const handleBlur = () => {
            keyHoldRef.current = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    useEffect(() => {
        let frameId = 0;

        const isSystemButtonPressed = (): boolean => {
            for (const gamepad of navigator.getGamepads()) {
                if (!gamepad) continue;
                for (const buttonIndex of SYSTEM_BUTTONS) {
                    if (gamepad.buttons[buttonIndex]?.pressed) return true;
                }
            }
            return false;
        };

        const tick = (timestamp: number) => {
            frameId = requestAnimationFrame(tick);

            if (!enabledRef.current) {
                holdStartRef.current = null;
                holdFiredRef.current = false;
                setHoldProgress((prev) => (prev === 0 ? prev : 0));
                return;
            }

            const gamepadPressed = isSystemButtonPressed();
            const pressed = gamepadPressed || keyHoldRef.current;

            if (pressed) {
                if (holdStartRef.current === null) {
                    holdStartRef.current = timestamp;
                    holdFiredRef.current = false;
                    holdSourceRef.current = gamepadPressed ? 'gamepad' : 'key';
                }

                if (holdFiredRef.current) return;

                const progress = Math.min(1, (timestamp - holdStartRef.current) / holdMs);
                setHoldProgress((prev) => (prev === progress ? prev : progress));

                if (progress >= 1) {
                    holdFiredRef.current = true;
                    setHoldProgress(0);
                    callbacksRef.current.onQuickRestart();
                }
                return;
            }

            if (holdStartRef.current !== null) {
                const heldFor = timestamp - holdStartRef.current;
                const wasGamepad = holdSourceRef.current === 'gamepad';

                holdStartRef.current = null;
                holdSourceRef.current = null;
                setHoldProgress((prev) => (prev === 0 ? prev : 0));

                // Short press on a gamepad system button = open/close the pause menu.
                // (On the keyboard that role belongs to P, Backspace is hold-only.)
                if (!holdFiredRef.current && wasGamepad && heldFor < holdMs) {
                    callbacksRef.current.onTogglePause();
                }

                holdFiredRef.current = false;
            }
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [holdMs]);

    return holdProgress;
}
