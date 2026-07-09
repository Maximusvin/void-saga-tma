
import { AnimatePresence } from 'framer-motion';
import { useGameState } from './store/useGameState';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { TheRift } from './views/TheRift';
import { SummonCircle } from './views/SummonCircle';
import { HeroesRoster } from './views/HeroesRoster';
import { initializeTelegramApp } from './utils/telegram';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    initializeTelegramApp();
  }, []);

  const gameState = useGameState();

  return (
    <>
      <TopBar gold={gameState.gold} gems={gameState.gems} />
      
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
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
              upgradeHero={gameState.upgradeHero}
              gold={gameState.gold}
            />
          )}
        </AnimatePresence>
      </div>

      <BottomNav activeView={gameState.activeView} setActiveView={gameState.setActiveView} />
    </>
  );
}

export default App;
