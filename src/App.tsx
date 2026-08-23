/**
 * Main App component for Titan Escape game.
 * Manages screen transitions between menu, game, and game over.
 */

import { useState, useCallback } from 'react';
import type { GameState } from './engine/types';
import { MainMenu } from './ui/MainMenu';
import { GameView } from './ui/GameView';
import { GameOverScreen } from './ui/GameOverScreen';

type Screen = 'menu' | 'game' | 'gameOver';

function App() {
    const [screen, setScreen] = useState<Screen>('menu');
    const [seed, setSeed] = useState<number>(0);
    const [finalGameState, setFinalGameState] = useState<GameState | null>(null);

    const handleStartGame = useCallback((gameSeed: number) => {
        setSeed(gameSeed);
        setScreen('game');
    }, []);

    const handleGameOver = useCallback((state: GameState) => {
        setFinalGameState(state);
        setScreen('gameOver');
    }, []);

    const handleRestart = useCallback((gameSeed: number) => {
        setSeed(gameSeed);
        setFinalGameState(null);
        setScreen('game');
    }, []);

    const handleMainMenu = useCallback(() => {
        setFinalGameState(null);
        setScreen('menu');
    }, []);

    return (
        <>
            {screen === 'menu' && <MainMenu onStartGame={handleStartGame} />}

            {screen === 'game' && (
                <GameView
                    key={seed}
                    seed={seed}
                    onGameOver={handleGameOver}
                    onExitToMenu={handleMainMenu}
                />
            )}

            {screen === 'gameOver' && finalGameState && (
                <GameOverScreen
                    gameState={finalGameState}
                    onRestart={handleRestart}
                    onMainMenu={handleMainMenu}
                />
            )}
        </>
    );
}

export default App;
