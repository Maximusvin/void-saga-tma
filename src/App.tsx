
import { AnimatePresence } from 'framer-motion';
import { useGameState } from './store/useGameState';
import { getRiftEnemyVisual } from './game/riftVisuals';
import { isBossStage } from './game/balance';
import { ZERO_GAME_NUMBER } from './game/gameNumber';
import type { ActiveView } from './game/types';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { RealmSwitcher } from './components/RealmSwitcher';
import { WelcomeBackModal } from './components/WelcomeBackModal';
import { TheRift } from './views/TheRift';
import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react';
import './App.css';

// The rift is the landing view. Keeping the other three eager would ship them —
// and canvas-confetti, which only Summon uses — in the first-paint chunk.
const loadSummonCircle = () => import('./views/SummonCircle').then(m => ({ default: m.SummonCircle }));
const loadHeroesRoster = () => import('./views/HeroesRoster').then(m => ({ default: m.HeroesRoster }));
const loadLeaguesHall = () => import('./views/LeaguesHall').then(m => ({ default: m.LeaguesHall }));

const SummonCircle = lazy(loadSummonCircle);
const HeroesRoster = lazy(loadHeroesRoster);
const LeaguesHall = lazy(loadLeaguesHall);

const VIEW_PRELOADERS: Partial<Record<ActiveView, () => Promise<unknown>>> = {
  leagues: loadLeaguesHall,
  roster: loadHeroesRoster,
  summon: loadSummonCircle,
};

const preloadView = (view: ActiveView) => {
  void VIEW_PRELOADERS[view]?.();
};

function App() {
  const [realmSwitcherOpen, setRealmSwitcherOpen] = useState(false);

  // Warm the lazy view chunks once the rift is interactive, so switching tabs
  // never waits on a network round trip.
  useEffect(() => {
    const prefetchViews = () => {
      Object.values(VIEW_PRELOADERS).forEach(loader => {
        if (loader) {
          void loader();
        }
      });
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(prefetchViews, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(prefetchViews, 1500);
    return () => window.clearTimeout(handle);
  }, []);

  const gameState = useGameState();
  const presentedStage = gameState.encounterTransition?.defeatedStage ?? gameState.stage;
  const presentedEnemyIndex = gameState.encounterTransition?.enemyIndex ?? gameState.enemyIndex;
  const presentedIsBoss = gameState.encounterTransition?.wasBoss ?? isBossStage(presentedStage);
  const riftVisual = getRiftEnemyVisual(
    presentedIsBoss ? presentedStage : presentedStage + presentedEnemyIndex,
    presentedIsBoss,
  );
  const shellStyle = gameState.activeView === 'rift'
    ? { '--rift-backdrop-image': `url("${riftVisual.backdrop}")` } as CSSProperties
    : undefined;

  return (
    <main
      className={`app-shell view-${gameState.activeView} ${presentedIsBoss ? 'rift-boss' : ''}`}
      style={shellStyle}
    >
      <div className="scene-fog" />
      <div className="game-frame">
      <TopBar
        backendStatus={gameState.backendStatus}
        gems={gameState.gems}
        gold={gameState.gold}
        level={presentedStage}
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
                monsterHealth={gameState.encounterTransition ? ZERO_GAME_NUMBER : gameState.monsterHealth}
                monsterMaxHealth={gameState.encounterTransition?.monsterMaxHealth ?? gameState.monsterMaxHealth}
                dealDamage={gameState.dealDamage}
                clickPower={gameState.clickPower}
                enemyIndex={presentedEnemyIndex}
                stage={presentedStage}
                isBoss={presentedIsBoss}
                encounterTransition={gameState.encounterTransition}
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

      <BottomNav
        activeView={gameState.activeView}
        preloadView={preloadView}
        setActiveView={gameState.setActiveView}
      />
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
