/**
 * In-game pause menu overlay.
 * Navigable with keyboard (arrows / WASD + Enter), gamepad (D-pad / stick + A) and mouse.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/SoundEngine';

export type PauseMenuAction = 'continue' | 'restartNewSeed' | 'restartSameSeed' | 'mainMenu';

interface PauseMenuItem {
    action: PauseMenuAction;
    label: string;
    hint: string;
    accent: string;
}

const MENU_ITEMS: PauseMenuItem[] = [
    {
        action: 'continue',
        label: '▶  CONTINUE',
        hint: 'Back to the dive',
        accent: '#87CEEB',
    },
    {
        action: 'restartNewSeed',
        label: '🎲  RESTART ROUND',
        hint: 'Fresh map, new seed',
        accent: '#2E8B57',
    },
    {
        action: 'restartSameSeed',
        label: '🔁  REPLAY SAME MAP',
        hint: 'Same seed, rematch',
        accent: '#4A90D9',
    },
    {
        action: 'mainMenu',
        label: '🏠  MAIN MENU',
        hint: 'Leave the round',
        accent: '#8A8FA3',
    },
];

/** Analog stick deadzone for menu navigation */
const STICK_DEADZONE = 0.5;

interface PauseMenuProps {
    seed: number;
    onSelect: (action: PauseMenuAction) => void;
}

export function PauseMenu({ seed, onSelect }: PauseMenuProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Mirrors for the keyboard / gamepad listeners, which are bound once.
    const selectedIndexRef = useRef(0);
    const onSelectRef = useRef(onSelect);

    useEffect(() => {
        selectedIndexRef.current = selectedIndex;
        onSelectRef.current = onSelect;
    });

    const move = useCallback((delta: number) => {
        setSelectedIndex((prev) => {
            const next = (prev + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
            if (next !== prev) soundEngine.playImpact('light');
            return next;
        });
    }, []);

    const confirm = useCallback((index: number) => {
        soundEngine.playImpact('light');
        onSelectRef.current(MENU_ITEMS[index].action);
    }, []);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'ArrowUp':
                case 'KeyW':
                    e.preventDefault();
                    move(-1);
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    e.preventDefault();
                    move(1);
                    break;
                case 'Enter':
                case 'Space':
                    e.preventDefault();
                    confirm(selectedIndexRef.current);
                    break;
                case 'Escape':
                    e.preventDefault();
                    onSelectRef.current('continue');
                    break;
                default:
                    break;
            }
        };

        // Capture phase so gameplay handlers don't also see these keys.
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [move, confirm]);

    // Gamepad navigation
    useEffect(() => {
        let frameId = 0;
        // Treat every button as "held" initially so a button still pressed when the
        // menu opened cannot instantly confirm the highlighted item.
        let prevUp = true;
        let prevDown = true;
        let prevConfirm = true;
        let prevCancel = true;

        const tick = () => {
            frameId = requestAnimationFrame(tick);

            let up = false;
            let down = false;
            let confirmPressed = false;
            let cancelPressed = false;

            for (const gamepad of navigator.getGamepads()) {
                if (!gamepad) continue;

                if (gamepad.buttons[12]?.pressed) up = true;
                if (gamepad.buttons[13]?.pressed) down = true;
                if (gamepad.axes.length >= 2) {
                    if (gamepad.axes[1] < -STICK_DEADZONE) up = true;
                    if (gamepad.axes[1] > STICK_DEADZONE) down = true;
                }
                if (gamepad.buttons[0]?.pressed) confirmPressed = true;
                if (gamepad.buttons[1]?.pressed) cancelPressed = true;
            }

            if (up && !prevUp) move(-1);
            if (down && !prevDown) move(1);
            if (confirmPressed && !prevConfirm) confirm(selectedIndexRef.current);
            if (cancelPressed && !prevCancel) onSelectRef.current('continue');

            prevUp = up;
            prevDown = down;
            prevConfirm = confirmPressed;
            prevCancel = cancelPressed;
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [move, confirm]);

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(3, 10, 20, 0.82)',
                backdropFilter: 'blur(3px)',
                zIndex: 200,
                cursor: 'default',
                fontFamily: 'monospace',
            }}
        >
            <h1
                style={{
                    fontSize: '52px',
                    color: '#87CEEB',
                    letterSpacing: '12px',
                    margin: '0 0 8px 0',
                    textShadow: '0 0 30px rgba(135, 206, 235, 0.45)',
                }}
            >
                PAUSED
            </h1>

            <div style={{ color: '#5A7A96', fontSize: '13px', marginBottom: '34px' }}>
                Seed: {seed}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '360px' }}>
                {MENU_ITEMS.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                        <button
                            key={item.action}
                            onMouseEnter={() => setSelectedIndex(index)}
                            onClick={() => confirm(index)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '20px',
                                padding: '16px 22px',
                                fontFamily: 'monospace',
                                fontSize: '19px',
                                fontWeight: 'bold',
                                textAlign: 'left',
                                borderRadius: '10px',
                                border: `2px solid ${isSelected ? item.accent : '#22384F'}`,
                                backgroundColor: isSelected
                                    ? `${item.accent}22`
                                    : 'rgba(0, 0, 0, 0.45)',
                                color: isSelected ? item.accent : '#9FB4C7',
                                cursor: 'pointer',
                                transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                                transition: 'all 0.12s ease-out',
                                boxShadow: isSelected ? `0 0 22px ${item.accent}44` : 'none',
                            }}
                        >
                            <span>{item.label}</span>
                            <span style={{ fontSize: '12px', fontWeight: 'normal', opacity: 0.75 }}>
                                {item.hint}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div
                style={{
                    marginTop: '32px',
                    color: '#5A7A96',
                    fontSize: '13px',
                    textAlign: 'center',
                    lineHeight: 1.7,
                }}
            >
                <div>↑ ↓ / D-Pad — select &nbsp;·&nbsp; Enter / A — confirm &nbsp;·&nbsp; P / START — resume</div>
                <div>Hold START or Backspace anytime — instant restart</div>
            </div>
        </div>
    );
}
