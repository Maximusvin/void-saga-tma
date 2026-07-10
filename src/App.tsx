
import { AnimatePresence } from 'framer-motion';
import { useGameState } from './store/useGameState';
import { getRiftEnemyVisual } from './game/riftVisuals';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { RealmSwitcher } from './components/RealmSwitcher';
import { TheRift } from './views/TheRift';
import { SummonCircle } from './views/SummonCircle';
import { HeroesRoster } from './views/HeroesRoster';
import { LeaguesHall } from './views/LeaguesHall';
import { initializeTelegramApp } from './utils/telegram';
import { useEffect, useState, type CSSProperties } from 'react';
import './App.css';

function App() {
  const [realmSwitcherOpen, setRealmSwitcherOpen] = useState(false);
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
      <TopBar
        backendStatus={gameState.backendStatus}
        gems={gameState.gems}
        gold={gameState.gold}
        level={gameState.stage}
        onOpenRealmSwitcher={() => {
          setRealmSwitcherOpen(true);
          void gameState.refreshRealmDirectory();
        }}
        playerProfile={gameState.playerProfile}
        realmCode={gameState.realmContext.canonicalRealmCode}
      />
      
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
              heroes={gameState.activeHeroes}
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
              activeHeroIds={gameState.activeHeroIds}
              ascendHero={gameState.ascendHero}
              setActiveWarband={gameState.setActiveWarband}
              upgradeHero={gameState.upgradeHero}
              gold={gameState.gold}
            />
          )}
          {gameState.activeView === 'leagues' && (
            <LeaguesHall
              key="leagues"
              heroCount={gameState.activeHeroes.length}
              passivePower={gameState.passivePower}
              stage={gameState.stage}
            />
          )}
        </AnimatePresence>
      </div>

      <BottomNav activeView={gameState.activeView} setActiveView={gameState.setActiveView} />
      <AnimatePresence>
        {realmSwitcherOpen && (
          <RealmSwitcher
            activeRealm={gameState.realmContext}
            busy={gameState.realmSwitching}
            directory={gameState.realmDirectory}
            key="realm-switcher"
            onClose={() => setRealmSwitcherOpen(false)}
            onSelect={gameState.switchRealm}
          />
        )}
      </AnimatePresence>
      </div>
    </main>
  );
}

export default App;
