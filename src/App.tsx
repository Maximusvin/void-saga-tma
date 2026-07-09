
import { AnimatePresence } from 'framer-motion';
import { useGameState } from './store/useGameState';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { TheRift } from './views/TheRift';
import { SummonCircle } from './views/SummonCircle';
import { HeroesRoster } from './views/HeroesRoster';
import { initializeTelegramApp } from './utils/telegram';
import { useEffect } from 'react';
import './App.css';

function App() {
  useEffect(() => {
    initializeTelegramApp();
  }, []);

  const gameState = useGameState();

  return (
    <main className="app-shell">
      <div className="scene-fog" />
      <div className="game-frame">
      <TopBar backendStatus={gameState.backendStatus} gold={gameState.gold} gems={gameState.gems} />
      
      <div className="view-stage">
        <AnimatePresence mode="wait">
          {gameState.activeView === 'rift' && (
            <TheRift 
              key="rift"
              monsterHealth={gameState.monsterHealth}
              monsterMaxHealth={gameState.monsterMaxHealth}
              dealDamage={gameState.dealDamage}
              clickPower={gameState.clickPower}
              stage={gameState.stage}
              isBoss={gameState.isBoss}
              comboCount={gameState.comboCount}
              comboMultiplier={gameState.comboMultiplier}
              registerHit={gameState.registerHit}
              passivePower={gameState.passivePower}
            />
          )}
          {gameState.activeView === 'summon' && (
            <SummonCircle 
              key="summon" 
              gems={gameState.gems} 
              summonHero={gameState.summonHero} 
            />
          )}
          {gameState.activeView === 'roster' && (
            <HeroesRoster 
              key="roster" 
              heroes={gameState.heroes} 
              ascendHero={gameState.ascendHero}
              upgradeHero={gameState.upgradeHero}
              gold={gameState.gold}
            />
          )}
        </AnimatePresence>
      </div>

      <BottomNav activeView={gameState.activeView} setActiveView={gameState.setActiveView} />
      </div>
    </main>
  );
}

export default App;
