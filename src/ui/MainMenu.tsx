/**
 * Main menu screen for the Titan Escape game.
 * Fullscreen with animated background and gamepad support.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { generateRandomSeed } from '../engine/rng';

interface MainMenuProps {
    onStartGame: (seed: number) => void;
}

/** Check how many gamepads are connected */
function getConnectedGamepads(): Gamepad[] {
    return Array.from(navigator.getGamepads()).filter((g): g is Gamepad => g !== null);
}

export function MainMenu({ onStartGame }: MainMenuProps) {
    const [customSeed, setCustomSeed] = useState('');
    const [showControls, setShowControls] = useState(false);
    const [gamepads, setGamepads] = useState<Gamepad[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);

    const handleStart = useCallback(() => {
        const seed = customSeed.trim()
            ? parseInt(customSeed, 10) || generateRandomSeed()
            : generateRandomSeed();

        // Ask for fullscreen while we still have the user gesture from this click.
        // Once granted it is kept for the whole session, including restarts.
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }

        onStartGame(seed);
    }, [customSeed, onStartGame]);

    const canStartWithGamepads = gamepads.length >= 2;

    // Poll gamepads and check for X button to start game
    useEffect(() => {
        let prevButtonStates: boolean[] = [];

        const checkGamepads = () => {
            const connected = getConnectedGamepads();
            setGamepads(connected);

            // Check for X button (button 2) press on any gamepad to start game
            // Only if 2 gamepads are connected
            if (connected.length >= 2) {
                for (const gp of connected) {
                    const xPressed = gp.buttons[2]?.pressed || false;
                    const wasPressed = prevButtonStates[gp.index] || false;

                    // Start game on button press (not hold)
                    if (xPressed && !wasPressed) {
                        handleStart();
                        return;
                    }

                    prevButtonStates[gp.index] = xPressed;
                }
            }
        };

        const interval = setInterval(checkGamepads, 100); // Faster polling for button detection
        checkGamepads();

        const handleConnect = () => checkGamepads();
        const handleDisconnect = () => checkGamepads();

        window.addEventListener('gamepadconnected', handleConnect);
        window.addEventListener('gamepaddisconnected', handleDisconnect);

        return () => {
            clearInterval(interval);
            window.removeEventListener('gamepadconnected', handleConnect);
            window.removeEventListener('gamepaddisconnected', handleDisconnect);
        };
    }, [handleStart]);

    // Animated background
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frame = 0;
        const bubbles: Array<{
            x: number;
            y: number;
            size: number;
            speed: number;
            opacity: number;
        }> = [];

        // Create initial bubbles
        for (let i = 0; i < 30; i++) {
            bubbles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: 2 + Math.random() * 6,
                speed: 0.3 + Math.random() * 0.7,
                opacity: 0.1 + Math.random() * 0.3,
            });
        }

        const animate = () => {
            frame++;

            // Gradient background
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#0A1628');
            gradient.addColorStop(0.5, '#0D2340');
            gradient.addColorStop(1, '#051018');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw and update bubbles
            for (const bubble of bubbles) {
                ctx.fillStyle = `rgba(135, 206, 235, ${bubble.opacity})`;
                ctx.beginPath();
                ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
                ctx.fill();

                bubble.y -= bubble.speed;
                bubble.x += Math.sin(frame * 0.02 + bubble.y * 0.01) * 0.3;

                if (bubble.y < -10) {
                    bubble.y = canvas.height + 10;
                    bubble.x = Math.random() * canvas.width;
                }
            }

            // Draw light rays from top
            ctx.save();
            ctx.globalAlpha = 0.03;
            for (let i = 0; i < 5; i++) {
                const x = canvas.width * (0.2 + i * 0.15);
                const rayGradient = ctx.createLinearGradient(x, 0, x, canvas.height * 0.7);
                rayGradient.addColorStop(0, '#87CEEB');
                rayGradient.addColorStop(1, 'transparent');
                ctx.fillStyle = rayGradient;
                ctx.beginPath();
                ctx.moveTo(x - 30, 0);
                ctx.lineTo(x + 30, 0);
                ctx.lineTo(x + 80, canvas.height * 0.7);
                ctx.lineTo(x - 80, canvas.height * 0.7);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => cancelAnimationFrame(animationRef.current);
    }, []);

    // Resize canvas
    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                overflow: 'hidden',
            }}
        >
            {/* Animated background canvas */}
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 0,
                }}
            />
            {/* Content container */}
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <h1
                    style={{
                        fontSize: '64px',
                        marginBottom: '10px',
                        background: 'linear-gradient(135deg, #87CEEB, #1E4D6B)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        textShadow: '0 0 30px rgba(135, 206, 235, 0.3)',
                        letterSpacing: '4px',
                    }}
                >
                    🌊 TITAN ESCAPE 🌊
                </h1>

                <p
                    style={{
                        fontSize: '18px',
                        color: '#8AA',
                        marginBottom: '40px',
                        textAlign: 'center',
                        maxWidth: '500px',
                        margin: '0 auto 40px',
                    }}
                >
                    Dive deep into the abyss and race to escape before your submersible implodes!
                </p>

                {/* Gamepad status */}
                <div
                    style={{
                        marginBottom: '30px',
                        padding: '15px 25px',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderRadius: '12px',
                        display: 'inline-block',
                    }}
                >
                    <div style={{ fontSize: '14px', color: '#888', marginBottom: '10px' }}>
                        🎮 GAMEPAD STATUS
                    </div>
                    {gamepads.length === 0 ? (
                        <div style={{ color: '#FF6666' }}>No gamepads connected</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {gamepads.map((gp, i) => (
                                <div
                                    key={gp.index}
                                    style={{ color: i === 0 ? '#FFA500' : '#00FF7F' }}
                                >
                                    <strong>Player {i + 1}:</strong> {gp.id.split('(')[0].trim()}
                                </div>
                            ))}
                            {gamepads.length === 1 && (
                                <div style={{ color: '#888', fontSize: '12px' }}>
                                    Connect 1 more gamepad for 2-player mode
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '15px',
                        width: '350px',
                        margin: '0 auto',
                    }}
                >
                    <input
                        type="text"
                        placeholder="Custom seed (optional)"
                        value={customSeed}
                        onChange={(e) => setCustomSeed(e.target.value)}
                        style={{
                            padding: '12px 16px',
                            fontSize: '16px',
                            borderRadius: '8px',
                            border: '2px solid #2A4A6A',
                            backgroundColor: 'rgba(26, 42, 58, 0.8)',
                            color: '#FFFFFF',
                            outline: 'none',
                            textAlign: 'center',
                        }}
                    />

                    <button
                        onClick={handleStart}
                        style={{
                            padding: '18px 36px',
                            fontSize: '20px',
                            fontWeight: 'bold',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#4A90D9',
                            color: '#FFFFFF',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#5AA0E9';
                            e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = '#4A90D9';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        ⌨️ START WITH KEYBOARD
                    </button>

                    <button
                        onClick={canStartWithGamepads ? handleStart : undefined}
                        disabled={!canStartWithGamepads}
                        style={{
                            padding: '18px 36px',
                            fontSize: '20px',
                            fontWeight: 'bold',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: canStartWithGamepads ? '#2E8B57' : '#333',
                            color: canStartWithGamepads ? '#FFFFFF' : '#666',
                            cursor: canStartWithGamepads ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s',
                            opacity: canStartWithGamepads ? 1 : 0.6,
                        }}
                        onMouseOver={(e) => {
                            if (canStartWithGamepads) {
                                e.currentTarget.style.backgroundColor = '#3E9B67';
                                e.currentTarget.style.transform = 'scale(1.02)';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (canStartWithGamepads) {
                                e.currentTarget.style.backgroundColor = '#2E8B57';
                                e.currentTarget.style.transform = 'scale(1)';
                            }
                        }}
                    >
                        🎮 START WITH GAMEPADS
                        {!canStartWithGamepads && (
                            <span style={{ display: 'block', fontSize: '12px', marginTop: '4px' }}>
                                (requires 2 gamepads)
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setShowControls(!showControls)}
                        style={{
                            padding: '12px 24px',
                            fontSize: '16px',
                            borderRadius: '8px',
                            border: '2px solid #4A90D9',
                            backgroundColor: 'transparent',
                            color: '#4A90D9',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        {showControls ? 'HIDE CONTROLS' : 'SHOW CONTROLS'}
                    </button>
                </div>
            </div>

            {showControls && (
                <div
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        marginTop: '30px',
                        padding: '20px 30px',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        borderRadius: '12px',
                        border: '1px solid #2A4A6A',
                        maxWidth: '700px',
                    }}
                >
                    <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#87CEEB' }}>
                        ⌨️ Keyboard Controls
                    </h3>

                    <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
                        <div>
                            <h4 style={{ color: '#FFA500', margin: '0 0 10px 0' }}>Player 1</h4>
                            <div
                                style={{
                                    fontFamily: 'monospace',
                                    lineHeight: '1.8',
                                    fontSize: '14px',
                                }}
                            >
                                <div>
                                    <kbd style={kbdStyle}>W</kbd>
                                    <kbd style={kbdStyle}>A</kbd>
                                    <kbd style={kbdStyle}>S</kbd>
                                    <kbd style={kbdStyle}>D</kbd> Move
                                </div>
                                <div>
                                    <kbd style={kbdStyle}>Q</kbd> Eject
                                </div>
                                <div>
                                    <kbd style={kbdStyle}>E</kbd> 🚀 Rocket
                                </div>
                                <div>
                                    <kbd style={kbdStyle}>R</kbd> 💣 Mine
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 style={{ color: '#00FF7F', margin: '0 0 10px 0' }}>Player 2</h4>
                            <div
                                style={{
                                    fontFamily: 'monospace',
                                    lineHeight: '1.8',
                                    fontSize: '14px',
                                }}
                            >
                                <div>
                                    <kbd style={kbdStyle}>↑</kbd>
                                    <kbd style={kbdStyle}>←</kbd>
                                    <kbd style={kbdStyle}>↓</kbd>
                                    <kbd style={kbdStyle}>→</kbd> Move
                                </div>
                                <div>
                                    <kbd style={kbdStyle}>/</kbd> Eject
                                </div>
                                <div>
                                    <kbd style={kbdStyle}>.</kbd> 🚀 Rocket
                                </div>
                                <div>
                                    <kbd style={kbdStyle}>,</kbd> 💣 Mine
                                </div>
                            </div>
                        </div>
                    </div>

                    <h3 style={{ marginTop: '20px', marginBottom: '15px', color: '#87CEEB' }}>
                        🎮 Gamepad Controls
                    </h3>
                    <div
                        style={{
                            fontFamily: 'monospace',
                            lineHeight: '1.8',
                            fontSize: '14px',
                            textAlign: 'center',
                        }}
                    >
                        <div>
                            <strong>Left Stick / D-Pad:</strong> Move
                        </div>
                        <div>
                            <strong>A / X:</strong> 🚀 Fire Rocket
                        </div>
                        <div>
                            <strong>B / Circle:</strong> 💣 Deploy Mine
                        </div>
                        <div>
                            <strong>X / Square:</strong> Eject
                        </div>
                    </div>

                    <div
                        style={{
                            marginTop: '20px',
                            padding: '10px',
                            backgroundColor: 'rgba(255, 100, 100, 0.2)',
                            borderRadius: '8px',
                            fontSize: '14px',
                        }}
                    >
                        <strong style={{ color: '#FF6B6B' }}>⚠️ Warning:</strong> Ejecting launches
                        you in a fragile escape capsule. Any collision = instant death!
                    </div>
                </div>
            )}

            <div
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    color: '#556',
                    fontSize: '12px',
                    zIndex: 1,
                }}
            >
                A deterministic hot-seat 2-player submarine survival game
                <div style={{ marginTop: '6px', color: '#445' }}>
                    In game: P / START — pause · hold START or Backspace — restart round · Esc —
                    leave fullscreen
                </div>
            </div>
        </div>
    );
}

const kbdStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: 'rgba(42, 74, 106, 0.8)',
    borderRadius: '4px',
    marginRight: '4px',
    minWidth: '20px',
    textAlign: 'center',
    fontSize: '12px',
};
