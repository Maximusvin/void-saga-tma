
import { AnimatePresence } from 'framer-motion';
import { useGameState } from './store/useGameState';
import { getRiftEnemyVisual } from './game/riftVisuals';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { TheRift } from './views/TheRift';
import { SummonCircle } from './views/SummonCircle';
import { HeroesRoster } from './views/HeroesRoster';
import { initializeTelegramApp } from './utils/telegram';
import { useEffect, type CSSProperties } from 'react';
import './App.css';

function App() {
  useEffect(() => {
    initializeTelegramApp();
  }, []);

  const gameState = useGameState();
  const riftVisual = getRiftEnemyVisual(gameState.stage, gameState.isBoss);
  const shellStyle = gameState.activeView === 'rift'
    ? { '--rift-backdrop-image': `url("${riftVisual.backdrop}")` } as CSSProperties
    : undefined;

  return (
    <main
      className={`app-shell view-${gameState.activeView} ${gameState.isBoss ? 'rift-boss' : ''}`}
      style={shellStyle}
    >
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
              bossEncounterEndsAt={gameState.bossEncounterEndsAt}
              bossEnrageSignal={gameState.bossEnrageSignal}
              snapshotUpdatedAt={gameState.snapshotUpdatedAt}
              comboCount={gameState.comboCount}
              comboMultiplier={gameState.comboMultiplier}
              registerHit={gameState.registerHit}
              passivePower={gameState.passivePower}
              heroes={gameState.heroes}
              passiveVolleyDamage={gameState.passiveVolleyDamage}
              passiveVolleyHeroContributions={gameState.passiveVolleyHeroContributions}
              passiveVolleySignal={gameState.passiveVolleySignal}
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
