/**
 * Main game view that orchestrates the game loop and rendering.
 * Supports fullscreen mode with audio.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '../engine/types';
import { PlayerState } from '../engine/types';
import { createInitialState, updateGameState } from '../engine/gameState';
import { generateRandomSeed } from '../engine/rng';
import { FIXED_DT, MAX_DEPTH, setCanvasDimensions } from '../engine/config';
import { GameCanvas } from './GameCanvas';
import { HUD } from './HUD';
import { useKeyboardInput } from './useKeyboardInput';
import { useSystemControls } from './useSystemControls';
import { PauseMenu } from './PauseMenu';
import type { PauseMenuAction } from './PauseMenu';
import { soundEngine } from '../audio/SoundEngine';
import { vibrateGamepad, VibrationPatterns } from '../audio/vibrationEngine';

/** How long "GAME OVER" stays on screen before the results screen */
const GAME_OVER_DELAY_MS = 1500;

/** Master volume during play and while paused */
const BASE_VOLUME = 0.7;
const PAUSED_VOLUME = 0.12;

interface GameViewProps {
    seed: number;
    onGameOver: (state: GameState) => void;
    /** Leave the round and go back to the main menu */
    onExitToMenu: () => void;
}

export function GameView({ seed, onGameOver, onExitToMenu }: GameViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });
    // Use global audio state from SoundEngine
    const [audioInitialized, setAudioInitialized] = useState(soundEngine.isReady());

    // Ready state - both players must press DOWN to start
    const [player1Ready, setPlayer1Ready] = useState(false);
    const [player2Ready, setPlayer2Ready] = useState(false);
    const gameStarted = player1Ready && player2Ready;

    // Pause menu
    const [paused, setPaused] = useState(false);

    // Seed of the round currently being played (changes on in-game restart)
    const [currentSeed, setCurrentSeed] = useState(seed);

    // Update canvas dimensions in config
    useEffect(() => {
        setCanvasDimensions(dimensions.width, dimensions.height);
    }, [dimensions]);

    const [gameState, setGameState] = useState<GameState>(() =>
        createInitialState({
            seed,
            maxDepth: MAX_DEPTH,
            canvasWidth: dimensions.width,
            canvasHeight: dimensions.height,
        })
    );

    const { sampleInputs, sampleMovementOnly, clearInputs } = useKeyboardInput();
    const gameStateRef = useRef(gameState);
    const prevStateRef = useRef(gameState);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const lastTimeRef = useRef<number>(0);
    const accumulatedTimeRef = useRef<number>(0);

    // Request fullscreen mode on mount
    useEffect(() => {
        const requestFullscreen = async () => {
            try {
                if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (e) {
                console.log('Fullscreen request failed:', e);
            }
        };

        // Small delay to ensure the component is mounted
        const timer = setTimeout(requestFullscreen, 100);

        // NOTE: fullscreen is deliberately NOT released on unmount. Leaving it would
        // drop the player out of fullscreen on every game over, and re-entering from
        // an effect is blocked by the browser (no user gesture) - which used to force
        // a manual page reload to get back into a playable state.
        return () => clearTimeout(timer);
    }, []);

    // Track fullscreen state (used to decide which top badge to show)
    const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Initialize audio on first interaction
    const initAudio = useCallback(async () => {
        if (!soundEngine.isReady()) {
            await soundEngine.init();
            setAudioInitialized(true);
        } else if (!audioInitialized) {
            // Already initialized from previous game, just update local state
            setAudioInitialized(true);
        }
    }, [audioInitialized]);

    // Auto-initialize audio on first keypress or gamepad input
    useEffect(() => {
        if (audioInitialized) return;

        const handleKeyDown = () => {
            initAudio();
        };

        const handleGamepad = () => {
            const gamepads = navigator.getGamepads();
            for (const gp of gamepads) {
                if (gp && gp.buttons.some(b => b.pressed)) {
                    initAudio();
                    break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, { once: true });
        
        // Poll for gamepad input
        const gamepadInterval = setInterval(handleGamepad, 100);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            clearInterval(gamepadInterval);
        };
    }, [audioInitialized, initAudio]);

    // Request fullscreen
    const requestFullscreen = useCallback(async () => {
        try {
            await initAudio();
            if (containerRef.current && !document.fullscreenElement) {
                await containerRef.current.requestFullscreen();
            }
        } catch (e) {
            console.warn('Fullscreen request failed:', e);
        }
    }, [initAudio]);

    // Keep ref in sync with state
    useEffect(() => {
        gameStateRef.current = gameState;
    }, [gameState]);

    // Handle audio events based on game state changes
    useEffect(() => {
        if (!audioInitialized) return;

        const prev = prevStateRef.current;
        const curr = gameState;

        // Update depth for ambient audio
        soundEngine.updateDepth(curr.currentMaxDepth);

        // Check for collisions (HP decreased)
        for (const playerId of ['player1', 'player2'] as const) {
            const prevPlayer = prev.players[playerId];
            const currPlayer = curr.players[playerId];
            const gamepadIndex = playerId === 'player1' ? 0 : 1;

            // Collision sound (metal scrape + impact) + vibration
            if (currPlayer.hp < prevPlayer.hp && currPlayer.state !== PlayerState.Dead) {
                const isHeavy = currPlayer.hp === 1;
                soundEngine.playImpact(isHeavy ? 'heavy' : 'light');
                soundEngine.playMetalScrape(isHeavy ? 'heavy' : 'light');
                vibrateGamepad(
                    gamepadIndex,
                    isHeavy ? VibrationPatterns.collisionHeavy : VibrationPatterns.collision
                );
            }

            // Ascent sound + vibration
            if (
                prevPlayer.state === PlayerState.Descending &&
                currPlayer.state === PlayerState.Ascending
            ) {
                soundEngine.playAscent();
                vibrateGamepad(gamepadIndex, VibrationPatterns.eject);
            }

            // Death sound + vibration
            if (prevPlayer.state !== PlayerState.Dead && currPlayer.state === PlayerState.Dead) {
                soundEngine.playDeath();
                vibrateGamepad(gamepadIndex, VibrationPatterns.death);
            }

            // Victory sound
            if (
                prevPlayer.state !== PlayerState.Escaped &&
                currPlayer.state === PlayerState.Escaped
            ) {
                soundEngine.playVictory();
            }

            // Rocket fire sound + vibration
            if (currPlayer.rocketsRemaining < prevPlayer.rocketsRemaining) {
                soundEngine.playRocketLaunch();
                vibrateGamepad(gamepadIndex, VibrationPatterns.rocketFire);
            }

            // Mine deploy sound + vibration
            if (currPlayer.minesRemaining < prevPlayer.minesRemaining) {
                soundEngine.playMineDeploy();
                vibrateGamepad(gamepadIndex, VibrationPatterns.mineDeploy);
            }
        }

        // Check for projectile hits (new projectiles destroyed = explosion)
        const prevProjectileCount = prev.projectiles.length;
        const currProjectileCount = curr.projectiles.length;

        // If projectiles were removed but not just by timing out, play explosion
        // This is a simplified check - we look for decrease in projectile count
        if (prevProjectileCount > currProjectileCount) {
            const removedCount = prevProjectileCount - currProjectileCount;
            for (let i = 0; i < Math.min(removedCount, 3); i++) {
                setTimeout(() => soundEngine.playExplosion('small'), i * 50);
            }
        }

        prevStateRef.current = curr;
    }, [gameState, audioInitialized]);

    // Track game over state with delay
    const [gameOverDelay, setGameOverDelay] = useState(false);
    const gameOverTimeoutRef = useRef<number | undefined>(undefined);
    const gameOverHandledRef = useRef(false);

    // Check for game over with delay.
    // The timeout is guarded by a ref (not by state) - keying it off `gameOverDelay`
    // made this effect re-run and clear its own timer, so the results screen never
    // appeared and the round hung on "GAME OVER" forever.
    useEffect(() => {
        if (!gameState.gameOver || gameOverHandledRef.current) return;

        gameOverHandledRef.current = true;
        setGameOverDelay(true);

        gameOverTimeoutRef.current = window.setTimeout(() => {
            gameOverTimeoutRef.current = undefined;
            onGameOver(gameStateRef.current);
        }, GAME_OVER_DELAY_MS);
    }, [gameState.gameOver, onGameOver]);

    // Clear the pending results timer only when the view actually goes away
    useEffect(() => {
        return () => {
            if (gameOverTimeoutRef.current) {
                clearTimeout(gameOverTimeoutRef.current);
                gameOverTimeoutRef.current = undefined;
            }
        };
    }, []);

    // Reset ambient sounds on unmount (keeps context for next game)
    useEffect(() => {
        return () => {
            soundEngine.setVolume(BASE_VOLUME);
            soundEngine.reset();
        };
    }, []);

    /**
     * Restart the round in place - no unmount, no page reload, fullscreen is kept.
     */
    const restartRound = useCallback(
        (nextSeed: number) => {
            if (gameOverTimeoutRef.current) {
                clearTimeout(gameOverTimeoutRef.current);
                gameOverTimeoutRef.current = undefined;
            }

            const freshState = createInitialState({
                seed: nextSeed,
                maxDepth: MAX_DEPTH,
                canvasWidth: dimensions.width,
                canvasHeight: dimensions.height,
            });

            gameStateRef.current = freshState;
            prevStateRef.current = freshState;
            lastTimeRef.current = 0;
            accumulatedTimeRef.current = 0;
            gameOverHandledRef.current = false;

            clearInputs();
            soundEngine.setVolume(BASE_VOLUME);
            soundEngine.reset();

            setCurrentSeed(nextSeed);
            setGameState(freshState);
            setGameOverDelay(false);
            setPaused(false);
            setPlayer1Ready(false);
            setPlayer2Ready(false);
        },
        [dimensions.width, dimensions.height, clearInputs]
    );

    const togglePause = useCallback(() => {
        // No point pausing once the round is already over - restart instead.
        if (gameStateRef.current.gameOver) return;

        setPaused((prev) => {
            if (prev) {
                clearInputs();
                lastTimeRef.current = 0;
            }
            return !prev;
        });
    }, [clearInputs]);

    const handleQuickRestart = useCallback(() => {
        restartRound(generateRandomSeed());
    }, [restartRound]);

    const handlePauseSelect = useCallback(
        (action: PauseMenuAction) => {
            switch (action) {
                case 'continue':
                    clearInputs();
                    lastTimeRef.current = 0;
                    setPaused(false);
                    break;
                case 'restartNewSeed':
                    restartRound(generateRandomSeed());
                    break;
                case 'restartSameSeed':
                    restartRound(currentSeed);
                    break;
                case 'mainMenu':
                    setPaused(false);
                    onExitToMenu();
                    break;
            }
        },
        [clearInputs, restartRound, currentSeed, onExitToMenu]
    );

    // Pause menu / hold-to-restart (keyboard P + Backspace, gamepad START/SELECT)
    const restartHoldProgress = useSystemControls({
        onTogglePause: togglePause,
        onQuickRestart: handleQuickRestart,
    });

    // Duck the audio while paused
    useEffect(() => {
        if (!audioInitialized) return;
        soundEngine.setVolume(paused ? PAUSED_VOLUME : BASE_VOLUME);
    }, [paused, audioInitialized]);

    // Main game loop
    const gameLoop = useCallback(
        (timestamp: number) => {
            if (lastTimeRef.current === 0) {
                lastTimeRef.current = timestamp;
            }

            const deltaTime = (timestamp - lastTimeRef.current) / 1000;
            lastTimeRef.current = timestamp;

            accumulatedTimeRef.current += deltaTime;

            if (accumulatedTimeRef.current > 0.2) {
                accumulatedTimeRef.current = 0.2;
            }

            // Paused or already finished - keep the frame pump alive but freeze
            // simulation time, so an in-place restart resumes without re-mounting.
            if (paused || gameStateRef.current.gameOver) {
                accumulatedTimeRef.current = 0;
                animationFrameRef.current = requestAnimationFrame(gameLoop);
                return;
            }

            // Check ready state before game starts
            if (!gameStarted) {
                // Use movement-only sampling to not consume action button states
                const movement = sampleMovementOnly();

                // Check if players pressed DOWN to ready up
                if (movement.player1Down && !player1Ready) {
                    setPlayer1Ready(true);
                    soundEngine.playImpact('light');
                }
                if (movement.player2Down && !player2Ready) {
                    setPlayer2Ready(true);
                    soundEngine.playImpact('light');
                }

                // Keep animation frame going but don't update game
                animationFrameRef.current = requestAnimationFrame(gameLoop);
                return;
            }

            let newState = gameStateRef.current;
            while (accumulatedTimeRef.current >= FIXED_DT) {
                const frameInputs = sampleInputs(newState.frame);
                newState = updateGameState(newState, frameInputs, FIXED_DT);
                accumulatedTimeRef.current -= FIXED_DT;
            }

            if (newState !== gameStateRef.current) {
                gameStateRef.current = newState;
                setGameState(newState);
            }

            animationFrameRef.current = requestAnimationFrame(gameLoop);
        },
        [sampleInputs, sampleMovementOnly, gameStarted, player1Ready, player2Ready, paused]
    );

    // Start/stop game loop
    useEffect(() => {
        animationFrameRef.current = requestAnimationFrame(gameLoop);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [gameLoop]);

    return (
        <div
            ref={containerRef}
            onClick={initAudio}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: '#0A1628',
                overflow: 'hidden',
                cursor: paused ? 'default' : 'none',
            }}
        >
            <GameCanvas gameState={gameState} width={dimensions.width} height={dimensions.height} />
            <HUD gameState={gameState} />

            {/* Game Over overlay - shows for 3 seconds before results */}
            {gameOverDelay && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        zIndex: 100,
                        animation: 'fadeIn 0.5s ease-out',
                    }}
                >
                    <h1
                        style={{
                            fontSize: '72px',
                            color: '#FF4444',
                            marginBottom: '20px',
                            textShadow: '0 0 30px rgba(255, 68, 68, 0.8), 0 0 60px rgba(255, 68, 68, 0.5)',
                            animation: 'pulse 1s ease-in-out infinite',
                            fontFamily: 'monospace',
                            letterSpacing: '10px',
                        }}
                    >
                        GAME OVER
                    </h1>
                    
                    {gameState.winner && (
                        <p
                            style={{
                                fontSize: '32px',
                                color: gameState.winner === 'player1' ? '#FFA500' : '#00FF7F',
                                textShadow: '0 0 15px currentColor',
                                fontFamily: 'monospace',
                            }}
                        >
                            🏆 {gameState.winner === 'player1' ? 'PLAYER 1' : 'PLAYER 2'} WINS! 🏆
                        </p>
                    )}
                    
                    <p
                        style={{
                            fontSize: '16px',
                            color: '#888',
                            marginTop: '40px',
                            fontFamily: 'monospace',
                        }}
                    >
                        Loading results...
                    </p>

                    <p
                        style={{
                            fontSize: '13px',
                            color: '#5A7A96',
                            marginTop: '10px',
                            fontFamily: 'monospace',
                        }}
                    >
                        hold START / Backspace — restart right now
                    </p>
                </div>
            )}
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                    }
                `}
            </style>

            {/* Ready overlay - shows until both players press DOWN */}
            {!gameStarted && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        zIndex: 100,
                    }}
                >
                    <h1
                        style={{
                            fontSize: '48px',
                            color: '#87CEEB',
                            marginBottom: '20px',
                            textShadow: '0 0 20px rgba(135, 206, 235, 0.5)',
                        }}
                    >
                        🌊 GET READY! 🌊
                    </h1>

                    <p
                        style={{
                            fontSize: '20px',
                            color: '#AAA',
                            marginBottom: '40px',
                        }}
                    >
                        Both players must press DOWN to dive!
                    </p>

                    <div style={{ display: 'flex', gap: '60px' }}>
                        {/* Player 1 Ready Status */}
                        <div
                            style={{
                                padding: '30px 50px',
                                backgroundColor: player1Ready
                                    ? 'rgba(255, 165, 0, 0.3)'
                                    : 'rgba(0, 0, 0, 0.5)',
                                border: `3px solid ${player1Ready ? '#FFA500' : '#444'}`,
                                borderRadius: '16px',
                                textAlign: 'center',
                                transition: 'all 0.3s',
                            }}
                        >
                            <div
                                style={{ fontSize: '24px', color: '#FFA500', marginBottom: '10px' }}
                            >
                                PLAYER 1
                            </div>
                            <div style={{ fontSize: '40px' }}>{player1Ready ? '✅' : '⬇️'}</div>
                            <div style={{ fontSize: '14px', color: '#888', marginTop: '10px' }}>
                                {player1Ready ? 'READY!' : 'Press S or ↓'}
                            </div>
                        </div>

                        {/* Player 2 Ready Status */}
                        <div
                            style={{
                                padding: '30px 50px',
                                backgroundColor: player2Ready
                                    ? 'rgba(0, 255, 127, 0.3)'
                                    : 'rgba(0, 0, 0, 0.5)',
                                border: `3px solid ${player2Ready ? '#00FF7F' : '#444'}`,
                                borderRadius: '16px',
                                textAlign: 'center',
                                transition: 'all 0.3s',
                            }}
                        >
                            <div
                                style={{ fontSize: '24px', color: '#00FF7F', marginBottom: '10px' }}
                            >
                                PLAYER 2
                            </div>
                            <div style={{ fontSize: '40px' }}>{player2Ready ? '✅' : '⬇️'}</div>
                            <div style={{ fontSize: '14px', color: '#888', marginTop: '10px' }}>
                                {player2Ready ? 'READY!' : 'Press S or ↓'}
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '40px', color: '#666', fontSize: '14px' }}>
                        🎮 Gamepad: Press Down on D-pad or Left Stick
                    </div>

                    <div style={{ marginTop: '12px', color: '#4A6A86', fontSize: '13px' }}>
                        P / START — pause menu &nbsp;·&nbsp; hold START / Backspace — restart
                    </div>
                </div>
            )}

            {/* Pause menu */}
            {paused && <PauseMenu seed={currentSeed} onSelect={handlePauseSelect} />}

            {/* Hold-to-restart progress ring */}
            {restartHoldProgress > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        zIndex: 300,
                        pointerEvents: 'none',
                        fontFamily: 'monospace',
                    }}
                >
                    <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle
                            cx="60"
                            cy="60"
                            r="52"
                            fill="rgba(3, 10, 20, 0.65)"
                            stroke="#22384F"
                            strokeWidth="8"
                        />
                        <circle
                            cx="60"
                            cy="60"
                            r="52"
                            fill="none"
                            stroke="#FFA500"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 52}
                            strokeDashoffset={2 * Math.PI * 52 * (1 - restartHoldProgress)}
                            transform="rotate(-90 60 60)"
                            style={{ filter: 'drop-shadow(0 0 8px rgba(255, 165, 0, 0.7))' }}
                        />
                        <text
                            x="60"
                            y="66"
                            textAnchor="middle"
                            fill="#FFA500"
                            fontSize="26"
                            fontFamily="monospace"
                        >
                            {Math.round(restartHoldProgress * 100)}%
                        </text>
                    </svg>
                    <div style={{ color: '#FFA500', fontSize: '15px', letterSpacing: '3px' }}>
                        RESTARTING…
                    </div>
                </div>
            )}

            {/* Controls hint */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    padding: '10px 20px',
                    borderRadius: '8px',
                }}
            >
                <div style={{ marginBottom: '4px' }}>
                    <strong>P1:</strong> WASD move | Q eject | E rocket | R mine
                </div>
                <div style={{ marginBottom: '4px' }}>
                    <strong>P2:</strong> Arrows move | / eject | . rocket | , mine
                </div>
                <div style={{ color: 'rgba(255, 165, 0, 0.75)' }}>
                    <strong>P</strong> / <strong>START</strong> pause &nbsp;·&nbsp; hold{' '}
                    <strong>START</strong> or <strong>Backspace</strong> — instant restart
                </div>
            </div>

            {/* Fullscreen button */}
            {(!isFullscreen || !audioInitialized) && (
                <button
                    onClick={requestFullscreen}
                    style={{
                        position: 'absolute',
                        top: 20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '10px 20px',
                        backgroundColor: 'rgba(74, 144, 217, 0.8)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        pointerEvents: 'auto',
                    }}
                >
                    🔊 Click to Enable Sound & Fullscreen
                </button>
            )}

            {/* Audio indicator */}
            {audioInitialized && (
                <div
                    style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
                        color: 'rgba(255, 255, 255, 0.25)',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        pointerEvents: 'none',
                    }}
                >
                    🔊 Audio Active
                </div>
            )}
        </div>
    );
}
