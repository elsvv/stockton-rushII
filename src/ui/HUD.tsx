/**
 * Heads-Up Display component showing player stats.
 * Features prominent HP display and wear indicators.
 */

import type { GameState, PlayerId } from '../engine/types';
import { PlayerState } from '../engine/types';
import { SUB_STARTING_HP } from '../engine/config';

interface HUDProps {
    gameState: GameState;
}

/** HP Bar component - visual health display */
function HPBar({ hp, maxHp, color }: { hp: number; maxHp: number; color: string }) {
    return (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {Array.from({ length: maxHp }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '4px',
                        backgroundColor: i < hp ? color : '#333',
                        border: `2px solid ${i < hp ? color : '#555'}`,
                        boxShadow: i < hp ? `0 0 8px ${color}` : 'none',
                        transition: 'all 0.2s',
                    }}
                />
            ))}
        </div>
    );
}

/** Wear gauge component */
function WearGauge({ wear }: { wear: number }) {
    const wearColor = wear > 80 ? '#FF4444' : wear > 50 ? '#FFAA00' : '#44FF44';
    const critical = wear > 80;

    return (
        <div style={{ marginTop: '8px' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    fontSize: '12px',
                }}
            >
                <span>HULL STRESS</span>
                <span
                    style={{
                        color: wearColor,
                        fontWeight: 'bold',
                        animation: critical ? 'pulse 0.5s infinite' : 'none',
                    }}
                >
                    {Math.floor(wear)}%
                </span>
            </div>
            <div
                style={{
                    width: '100%',
                    height: '12px',
                    backgroundColor: '#222',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid #444',
                }}
            >
                <div
                    style={{
                        width: `${wear}%`,
                        height: '100%',
                        backgroundColor: wearColor,
                        transition: 'width 0.1s, background-color 0.3s',
                        boxShadow: critical ? `0 0 10px ${wearColor}` : 'none',
                    }}
                />
            </div>
        </div>
    );
}

function PlayerHUD({
    playerId,
    gameState,
    side,
}: {
    playerId: PlayerId;
    gameState: GameState;
    side: 'left' | 'right';
}) {
    const player = gameState.players[playerId];
    const isPlayer1 = playerId === 'player1';
    const playerColor = isPlayer1 ? '#FFA500' : '#00FF7F';

    const getStateLabel = (): string => {
        switch (player.state) {
            case PlayerState.Descending:
                return '↓ DIVING';
            case PlayerState.Ascending:
                return '↑ ESCAPING';
            case PlayerState.Dead:
                return '✕ DEAD';
            case PlayerState.Escaped:
                return '✓ ESCAPED';
            default:
                return 'UNKNOWN';
        }
    };

    const getStateColor = (): string => {
        switch (player.state) {
            case PlayerState.Descending:
                return '#4A90D9';
            case PlayerState.Ascending:
                return '#FFD700';
            case PlayerState.Dead:
                return '#FF4444';
            case PlayerState.Escaped:
                return '#44FF44';
            default:
                return '#FFFFFF';
        }
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: 20,
                [side]: 20,
                padding: '16px 20px',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                borderRadius: '12px',
                color: '#FFFFFF',
                fontFamily: 'monospace',
                fontSize: '14px',
                minWidth: '180px',
                border: `2px solid ${playerColor}40`,
                boxShadow: `0 0 20px ${playerColor}20`,
            }}
        >
            {/* Player name */}
            <div
                style={{
                    fontWeight: 'bold',
                    fontSize: '18px',
                    marginBottom: '12px',
                    color: playerColor,
                    textShadow: `0 0 10px ${playerColor}`,
                }}
            >
                {isPlayer1 ? 'PLAYER 1' : 'PLAYER 2'}
            </div>

            {/* Status */}
            <div
                style={{
                    marginBottom: '8px',
                    color: getStateColor(),
                    fontWeight: 'bold',
                    fontSize: '16px',
                }}
            >
                {getStateLabel()}
            </div>

            {/* Depth */}
            <div
                style={{
                    marginBottom: '8px',
                    fontSize: '20px',
                    fontWeight: 'bold',
                }}
            >
                {Math.floor(player.y)}
                <span style={{ fontSize: '14px', color: '#888' }}>m</span>
            </div>

            {/* HP Bar - always visible when alive */}
            {(player.state === PlayerState.Descending ||
                player.state === PlayerState.Ascending) && (
                <>
                    <div style={{ fontSize: '12px', marginBottom: '4px', color: '#888' }}>
                        {player.state === PlayerState.Ascending ? 'CAPSULE' : 'HULL INTEGRITY'}
                    </div>
                    <HPBar
                        hp={player.hp}
                        maxHp={player.state === PlayerState.Ascending ? 1 : SUB_STARTING_HP}
                        color={player.hp === 1 ? '#FF4444' : playerColor}
                    />

                    {/* Wear gauge - only for submarine */}
                    {player.state === PlayerState.Descending && <WearGauge wear={player.wear} />}

                    {/* Weapons - only for submarine */}
                    {player.state === PlayerState.Descending && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: player.rocketsRemaining > 0 ? '#FF6644' : '#555',
                                }}
                            >
                                <span style={{ fontSize: '16px' }}>🚀</span>
                                <span style={{ fontWeight: 'bold' }}>
                                    ×{player.rocketsRemaining}
                                </span>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: player.minesRemaining > 0 ? '#FF4444' : '#555',
                                }}
                            >
                                <span style={{ fontSize: '16px' }}>💣</span>
                                <span style={{ fontWeight: 'bold' }}>×{player.minesRemaining}</span>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Death info */}
            {player.state === PlayerState.Dead && (
                <div style={{ color: '#888', marginTop: '8px' }}>
                    Best: {Math.floor(player.maxDepthReached)}m
                </div>
            )}

            {/* Escape info */}
            {player.state === PlayerState.Escaped && (
                <div style={{ color: '#44FF44', marginTop: '8px', fontWeight: 'bold' }}>
                    Survived from {Math.floor(player.maxDepthReached)}m
                </div>
            )}
        </div>
    );
}

export function HUD({ gameState }: HUDProps) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
            }}
        >
            <PlayerHUD playerId="player1" gameState={gameState} side="left" />
            <PlayerHUD playerId="player2" gameState={gameState} side="right" />
        </div>
    );
}
