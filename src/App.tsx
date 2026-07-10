
import { AnimatePresence } from 'framer-motion';
import { useGameState } from './store/useGameState';
import { getRiftEnemyVisual } from './game/riftVisuals';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { RealmSwitcher } from './components/RealmSwitcher';
import { WelcomeBackModal } from './components/WelcomeBackModal';
import { TheRift } from './views/TheRift';
import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react';
import './App.css';

// The rift is the landing view. Keeping the other three eager would ship them —
// and canvas-confetti, which only Summon uses — in the first-paint chunk.
const SummonCircle = lazy(() => import('./views/SummonCircle').then(m => ({ default: m.SummonCircle })));
const HeroesRoster = lazy(() => import('./views/HeroesRoster').then(m => ({ default: m.HeroesRoster })));
const LeaguesHall = lazy(() => import('./views/LeaguesHall').then(m => ({ default: m.LeaguesHall })));

function App() {
  const [realmSwitcherOpen, setRealmSwitcherOpen] = useState(false);

  // Warm the lazy view chunks once the rift is interactive, so switching tabs
  // never waits on a network round trip.
  useEffect(() => {
    const prefetchViews = () => {
      void import('./views/SummonCircle');
      void import('./views/HeroesRoster');
      void import('./views/LeaguesHall');
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(prefetchViews, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(prefetchViews, 1500);
    return () => window.clearTimeout(handle);
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
        <Suspense fallback={null}>
          <AnimatePresence mode="wait">
            {gameState.activeView === 'rift' && (
              <TheRift
                key="rift"
                monsterHealth={gameState.monsterHealth}
                monsterMaxHealth={gameState.monsterMaxHealth}
                dealDamage={gameState.dealDamage}
                clickPower={gameState.clickPower}
                enemyIndex={gameState.enemyIndex}
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
                summonPity={gameState.summonPity}
                summonHero={gameState.summonHero}
              />
            )}
            {gameState.activeView === 'roster' && (
              <HeroesRoster
                key="roster"
                activeHeroIds={gameState.activeHeroIds}
                heroes={gameState.heroes}
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
                isLocal={gameState.backendStatus === 'local'}
                leaderboard={gameState.leaderboard}
                onRefresh={() => {
                  void gameState.refreshLeaderboard();
                }}
                passivePower={gameState.passivePower}
                stage={gameState.stage}
                status={gameState.leaderboardStatus}
              />
            )}
          </AnimatePresence>
        </Suspense>
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
      <AnimatePresence>
        {gameState.offlineReward && (
          <WelcomeBackModal
            key="welcome-back"
            reward={gameState.offlineReward}
            onCollect={gameState.dismissOfflineReward}
          />
        )}
      </AnimatePresence>
      </div>
    </main>
  );
}

export default App;
