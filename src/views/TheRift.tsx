import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, Crown, Crosshair, Zap } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { formatNumber } from '../utils/formatNumber';
import {
  GAME_BALANCE,
  getBossAttemptDurationMs,
  getBossPhaseForHealthPercent,
  getHeroTemplateById,
  getStageBandForStage,
  isBossStage,
} from '../game/balance';
import {
  ceilGameNumber,
  gameNumberToPercent,
  type GameNumber,
} from '../game/gameNumber';
import type { GameEvent, Hero, HeroAttackStyle, HeroDamageContribution } from '../game/types';
import { getGameRenderProfile } from '../utils/renderQuality';
import { getRiftEnemyVisual } from '../game/riftVisuals';
import { BossClock } from './BossClock';
import { RiftWarband } from './RiftWarband';
import './TheRift.css';

const RiftPixiScene = lazy(async () => {
  const module = await import('./RiftPixiScene');
  return { default: module.RiftPixiScene };
});

interface TheRiftProps {
  monsterHealth: GameNumber;
  monsterMaxHealth: GameNumber;
  dealDamage: () => Promise<GameEvent[]>;
  clickPower: GameNumber;
  stage: number;
  isBoss: boolean;
  comboCount: number;
  comboMultiplier: number;
  registerHit: () => void;
  passivePower: GameNumber;
  heroes: Hero[];
  passiveVolleyDamage: GameNumber;
  passiveVolleyHeroContributions: HeroDamageContribution[];
  passiveVolleySignal: number;
  bossEncounterEndsAt: string | null;
  bossEnrageSignal: number;
  snapshotUpdatedAt: string;
}

interface DamagePop {
  id: number;
  x: number;
  y: number;
  damage: GameNumber;
  isCrit: boolean;
  driftX: number;
}

interface Projectile {
  attackStyle: HeroAttackStyle;
  color: string;
  id: number;
  startX: number;
  startY: number;
  rotate: number;
  volleySignal: number;
}

interface DefeatTransition {
  id: number;
  defeatedStage: number;
  nextStage: number;
  wasBoss: boolean;
  goldReward: GameNumber | null;
  gemReward: number | null;
}

type MonsterDefeatedEvent = Extract<GameEvent, { type: 'monster_defeated' }>;
type MonsterHitEvent = Extract<GameEvent, { type: 'monster_hit' }>;

const RiftAmbientSparks = memo(function RiftAmbientSparks({ count }: { count: number }) {
  const prefersReducedMotion = useReducedMotion();
  const sparks = useMemo(() => {
    return Array.from({ length: count }, (_, id) => ({
      id,
      left: 8 + ((id * 37) % 84),
      delay: (id % 6) * 0.42,
      duration: 4.6 + (id % 5) * 0.32,
      scale: 0.65 + (id % 4) * 0.18,
    }));
  }, [count]);

  if (prefersReducedMotion) {
    return null;
  }

  return sparks.map(spark => (
    <motion.span
      key={spark.id}
      className="rift-spark"
      style={{ left: `${spark.left}%`, scale: spark.scale }}
      animate={{ y: ['18vh', '-76vh'], opacity: [0, 0.78, 0] }}
      transition={{ duration: spark.duration, delay: spark.delay, repeat: Infinity, ease: 'linear' }}
    />
  ));
});

const getMonsterDefeatedEvent = (events: GameEvent[]) => {
  return events.find((event): event is MonsterDefeatedEvent => event.type === 'monster_defeated') ?? null;
};

const getTapHitEvent = (events: GameEvent[]) => {
  return events.find(
    (event): event is MonsterHitEvent => event.type === 'monster_hit' && event.source === 'tap',
  ) ?? null;
};

export const TheRift: React.FC<TheRiftProps> = ({
  monsterHealth,
  monsterMaxHealth,
  dealDamage,
  clickPower,
  stage,
  isBoss,
  comboCount,
  comboMultiplier,
  registerHit,
  passivePower,
  heroes,
  passiveVolleyDamage,
  passiveVolleyHeroContributions,
  passiveVolleySignal,
  bossEncounterEndsAt,
  bossEnrageSignal,
  snapshotUpdatedAt,
}) => {
  const [damagePops, setDamagePops] = useState<DamagePop[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [isHit, setIsHit] = useState(false);
  const [impactState, setImpactState] = useState({ id: 0, isCrit: false });
  const [defeatTransition, setDefeatTransition] = useState<DefeatTransition | null>(null);
  const [visiblePassiveVolleySignal, setVisiblePassiveVolleySignal] = useState<number | null>(null);
  const bossAttemptDurationMs = getBossAttemptDurationMs(stage);
  const [visibleBossEnrageSignal, setVisibleBossEnrageSignal] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const renderProfile = useMemo(getGameRenderProfile, []);
  const previousStageRef = useRef(stage);
  const previousBossRef = useRef(isBoss);
  const lastHandledBossEnrageSignalRef = useRef(bossEnrageSignal);
  const lastHandledPassiveVolleySignalRef = useRef(passiveVolleySignal);
  const lastDefeatStageRef = useRef<number | null>(null);
  const clickCounterRef = useRef(0);
  const hitResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      timeoutsRef.current.delete(timeout);
      callback();
    }, delay);
    timeoutsRef.current.add(timeout);
    return timeout;
  }, []);

  const flashHit = useCallback(() => {
    setIsHit(true);
    if (hitResetTimeoutRef.current) {
      clearTimeout(hitResetTimeoutRef.current);
      timeoutsRef.current.delete(hitResetTimeoutRef.current);
    }
    hitResetTimeoutRef.current = scheduleTimeout(() => {
      hitResetTimeoutRef.current = null;
      setIsHit(false);
    }, GAME_BALANCE.hitFlashMs);
  }, [scheduleTimeout]);

  useEffect(() => {
    const activeTimeouts = timeoutsRef.current;
    return () => {
      activeTimeouts.forEach(clearTimeout);
      activeTimeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (bossEnrageSignal === lastHandledBossEnrageSignalRef.current) {
      return;
    }

    lastHandledBossEnrageSignalRef.current = bossEnrageSignal;
    setVisibleBossEnrageSignal(bossEnrageSignal);
    scheduleTimeout(() => {
      setVisibleBossEnrageSignal(current => current === bossEnrageSignal ? null : current);
    }, 1_250);
  }, [bossEnrageSignal, scheduleTimeout]);

  useEffect(() => {
    if (
      passiveVolleySignal === lastHandledPassiveVolleySignalRef.current ||
      passiveVolleyHeroContributions.length === 0
    ) {
      return;
    }

    lastHandledPassiveVolleySignalRef.current = passiveVolleySignal;
    const heroById = new Map(heroes.map(hero => [hero.id, hero]));
    const contributionCount = passiveVolleyHeroContributions.length;
    const nextProjectiles = passiveVolleyHeroContributions.flatMap((contribution, index) => {
      const hero = heroById.get(contribution.heroId);
      const template = hero ? getHeroTemplateById(hero.templateId) : null;
      if (!hero || !template) {
        return [];
      }

      const startX = (index - (contributionCount - 1) / 2) * 54;
      const startY = 150 + (index % 2) * 18;
      return [{
        attackStyle: template.attackStyle,
        color: template.accentColor,
        id: passiveVolleySignal * 10 + index,
        rotate: Math.atan2(-startY, -startX) * 180 / Math.PI,
        startX,
        startY,
        volleySignal: passiveVolleySignal,
      }];
    });

    setProjectiles(nextProjectiles);
    setVisiblePassiveVolleySignal(passiveVolleySignal);

    scheduleTimeout(() => {
      setProjectiles(current => current.filter(projectile => projectile.volleySignal !== passiveVolleySignal));
      flashHit();
      setImpactState(current => ({ id: current.id + 1, isCrit: false }));
    }, GAME_BALANCE.passiveVolleyTravelMs);
    scheduleTimeout(() => {
      setVisiblePassiveVolleySignal(current => current === passiveVolleySignal ? null : current);
    }, GAME_BALANCE.passiveVolleyFeedbackMs);
  }, [
    flashHit,
    heroes,
    passiveVolleyHeroContributions,
    passiveVolleySignal,
    scheduleTimeout,
  ]);

  const triggerDefeatTransition = (
    defeatedStage: number,
    nextStage: number,
    wasBoss: boolean,
    rewards?: Pick<MonsterDefeatedEvent, 'goldReward' | 'gemReward'>,
  ) => {
    lastDefeatStageRef.current = defeatedStage;
    setDefeatTransition(current => ({
      id: (current?.id ?? 0) + 1,
      defeatedStage,
      nextStage,
      wasBoss,
      goldReward: rewards?.goldReward ?? null,
      gemReward: rewards?.gemReward ?? null,
    }));
  };

  const applyDefeatRewardEvent = (defeatedEvent: MonsterDefeatedEvent) => {
    lastDefeatStageRef.current = defeatedEvent.stage;
    setDefeatTransition(current => {
      if (current?.defeatedStage === defeatedEvent.stage) {
        return {
          ...current,
          nextStage: defeatedEvent.nextStage,
          wasBoss: isBossStage(defeatedEvent.stage),
          goldReward: defeatedEvent.goldReward,
          gemReward: defeatedEvent.gemReward,
        };
      }

      return {
        id: (current?.id ?? 0) + 1,
        defeatedStage: defeatedEvent.stage,
        nextStage: defeatedEvent.nextStage,
        wasBoss: isBossStage(defeatedEvent.stage),
        goldReward: defeatedEvent.goldReward,
        gemReward: defeatedEvent.gemReward,
      };
    });
  };

  useEffect(() => {
    const previousStage = previousStageRef.current;
    const previousWasBoss = previousBossRef.current;

    if (stage > previousStage && lastDefeatStageRef.current !== previousStage) {
      triggerDefeatTransition(previousStage, stage, previousWasBoss);
    }

    previousStageRef.current = stage;
    previousBossRef.current = isBoss;
  }, [isBoss, stage]);

  useEffect(() => {
    if (!defeatTransition) {
      return;
    }

    const activeTimeouts = timeoutsRef.current;
    const timeout = scheduleTimeout(
      () => setDefeatTransition(null),
      defeatTransition.wasBoss ? 2100 : 1650,
    );
    return () => {
      clearTimeout(timeout);
      activeTimeouts.delete(timeout);
    };
  }, [defeatTransition, scheduleTimeout]);

  const attackAt = (clientX: number, clientY: number) => {
    const clickId = clickCounterRef.current;
    clickCounterRef.current += 1;

    void dealDamage().then(events => {
      const hitEvent = getTapHitEvent(events);
      const defeatedEvent = getMonsterDefeatedEvent(events);
      if (hitEvent) {
        const nextClick = {
          id: clickId,
          x: clientX,
          y: clientY,
          damage: hitEvent.damage,
          isCrit: hitEvent.isCrit,
          driftX: (Math.random() - 0.5) * 92,
        };
        setDamagePops(current => [...current.slice(-23), nextClick]);
        scheduleTimeout(() => {
          setDamagePops(current => current.filter(item => item.id !== nextClick.id));
        }, GAME_BALANCE.damageTextLifetimeMs);

        if (hitEvent.isCrit) {
          triggerHaptic('heavy');
          setImpactState(current => ({ id: current.id + 1, isCrit: true }));
        }
      }
      if (defeatedEvent) {
        applyDefeatRewardEvent(defeatedEvent);
      }
    });
    registerHit();
    triggerHaptic(isBoss ? 'medium' : 'light');
    flashHit();
    setImpactState(current => ({ id: current.id + 1, isCrit: false }));
  };

  const handleAttack = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    attackAt(event.clientX, event.clientY);
  };

  const handleAttackKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    attackAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  };

  const healthPercent = gameNumberToPercent(monsterHealth, monsterMaxHealth);
  const combatTone = isBoss ? 'boss' : 'normal';
  const enemyVisual = getRiftEnemyVisual(stage, isBoss);
  const riftIndex = Math.floor((Math.max(1, stage) - 1) / 3) + 1;
  const bossPhases = getStageBandForStage(stage).boss.phases;
  const bossPhase = getBossPhaseForHealthPercent(stage, healthPercent);
  const bossPhaseIndex = Math.max(1, bossPhases.findIndex(phase => phase.id === bossPhase.id) + 1);

  return (
    <motion.section
      className={`rift-view ${combatTone} ${isBoss ? `boss-phase-${bossPhaseIndex}` : ''}`}
      data-render-quality={renderProfile.quality}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="rift-skyline" />
      <RiftAmbientSparks count={renderProfile.ambientSparkCount} />

      <header className="rift-stage-hud">
        <div className="stage-mark" aria-label={`Stage ${stage}`}>
          <span className="stage-mark-value">
            {isBoss && <Crown size={16} aria-hidden="true" />}
            <strong>{stage}</strong>
          </span>
          <span>{isBoss ? 'Boss' : `Rift ${String(riftIndex).padStart(2, '0')}`}</span>
        </div>
        <div className="stage-location">
          <span>{enemyVisual.zone}</span>
          <strong>{isBoss ? 'Sovereign breach' : 'Hunt in progress'}</strong>
        </div>
        <div className="combat-chip auto-chip">
          <Activity size={15} />
          <span>Auto</span>
          <strong>{formatNumber(passivePower)}/s</strong>
        </div>
      </header>

      <div className="rift-arena">
        <div className="combat-dashboard">
          <div className={`encounter-rank ${isBoss ? 'boss' : ''}`}>
            {isBoss && <Crown size={14} aria-hidden="true" />}
            <span>{isBoss ? `Phase ${bossPhaseIndex} · ${bossPhase.label}` : enemyVisual.title}</span>
          </div>
          <div className="combat-status-right">
            {isBoss && (
              <BossClock
                attemptDurationMs={bossAttemptDurationMs}
                attemptEndsAt={bossEncounterEndsAt}
                snapshotUpdatedAt={snapshotUpdatedAt}
              />
            )}
            <AnimatePresence>
              {comboCount > 0 && (
                <motion.div
                  className="combo-chip"
                  initial={{ opacity: 0, x: 26, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 26, scale: 0.9 }}
                >
                  <span>{comboCount} hits</span>
                  <strong>x{comboMultiplier.toFixed(2)}</strong>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence>
          {projectiles.map(projectile => (
            <motion.span
              key={projectile.id}
              className={`warband-projectile ${projectile.attackStyle}`}
              style={{ '--projectile-color': projectile.color } as React.CSSProperties}
              initial={prefersReducedMotion
                ? { x: 0, y: 0, opacity: 0, scale: 1, rotate: 0 }
                : { x: projectile.startX, y: projectile.startY, opacity: 0, scaleX: 0.4, rotate: projectile.rotate }}
              animate={{ x: 0, y: 0, opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: prefersReducedMotion ? 0 : GAME_BALANCE.passiveVolleyTravelMs / 1000, ease: 'easeIn' }}
            />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {visiblePassiveVolleySignal !== null && (
            <motion.div
              key={visiblePassiveVolleySignal}
              className="warband-damage-pop"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.84 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: -10, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: 'easeOut' }}
              aria-hidden="true"
            >
              <span>Warband</span>
              -{formatNumber(passiveVolleyDamage)}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label={`Attack ${enemyVisual.name}`}
          className={`monster-button ${isHit ? 'hit' : ''}`}
          onPointerDown={handleAttack}
          onKeyDown={handleAttackKeyDown}
        >
          <span className="monster-ring outer" />
          <span className="monster-ring inner" />
          <motion.span
            className="rift-beast-shell"
            animate={isHit
              ? { scale: [1, 0.88, 1.05, 1], rotate: [0, -5, 5, 0] }
              : { scale: 1, rotate: 0 }}
            transition={{
              duration: isHit && !prefersReducedMotion ? 0.18 : 0,
              repeat: 0,
              ease: 'easeInOut',
            }}
          >
            <Suspense fallback={<span className="rift-pixi-loading" />}>
              <RiftPixiScene
                defeatSignal={defeatTransition?.id ?? 0}
                enrageSignal={bossEnrageSignal}
                hitSignal={impactState.id}
                bossPhase={bossPhaseIndex}
                isBoss={isBoss}
                isBossDefeat={defeatTransition?.wasBoss ?? false}
                isHit={isHit}
                isLastHitCrit={impactState.isCrit}
                stage={stage}
              />
            </Suspense>
          </motion.span>
        </motion.button>

        <AnimatePresence>
          {visibleBossEnrageSignal !== null && (
            <motion.div
              key={visibleBossEnrageSignal}
              className="boss-enrage-banner"
              initial={prefersReducedMotion
                ? { opacity: 0, x: '-50%', scale: 1 }
                : { opacity: 0, x: '-50%', scale: 0.76 }}
              animate={prefersReducedMotion
                ? { opacity: 1, x: '-50%', scale: 1 }
                : { opacity: 1, x: '-50%', scale: [0.76, 1.08, 1] }}
              exit={prefersReducedMotion
                ? { opacity: 0, x: '-50%', scale: 1 }
                : { opacity: 0, x: '-50%', scale: 1.08 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: 'easeOut' }}
              role="status"
            >
              <span>Rift collapse</span>
              <strong>HP restored</strong>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="enemy-panel">
          <div className="enemy-title-row">
            <div>
              <span>{isBoss ? 'Mythic encounter' : enemyVisual.title}</span>
              <h2>{enemyVisual.name}</h2>
            </div>
            <strong className="health-percent">{Math.round(healthPercent)}%</strong>
          </div>
          <div
            className="health-track"
            role="progressbar"
            aria-label={`${enemyVisual.name} health`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(healthPercent)}
          >
            <motion.div
              className="health-fill"
              animate={{ width: `${healthPercent}%` }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            />
            <span className="health-sheen" />
          </div>
          <div className="health-meta">
            <span>{isBoss ? 'Boss integrity' : 'Enemy integrity'}</span>
            <strong>{formatNumber(ceilGameNumber(monsterHealth))} / {formatNumber(monsterMaxHealth)}</strong>
          </div>
        </div>

        <AnimatePresence>
          {defeatTransition && (
            <motion.div
              key={defeatTransition.id}
              className={`rift-clear-banner ${defeatTransition.wasBoss ? 'boss' : 'normal'}`}
              initial={{ opacity: 0, x: '-50%', y: 20, scale: 0.86 }}
              animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
              exit={{ opacity: 0, x: '-50%', y: -22, scale: 0.94 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
            >
              <div className="reward-chest" aria-hidden="true">
                <span className="reward-chest-glow" />
                <span className="reward-chest-lid" />
                <span className="reward-chest-body" />
                <span className="reward-chest-shine" />
              </div>
              <div className="rift-clear-copy">
                <span>{defeatTransition.wasBoss ? 'Boss Rift Cleared' : 'Rift Cleared'}</span>
                <strong>Stage {defeatTransition.nextStage}</strong>
              </div>
              <div className="rift-reward-row">
                {defeatTransition.goldReward === null ? (
                  <span className="reward-pill claimed">Rewards claimed</span>
                ) : (
                  <span className="reward-pill gold">+{formatNumber(defeatTransition.goldReward)} Gold</span>
                )}
                {(defeatTransition.gemReward ?? 0) > 0 && (
                  <span className="reward-pill gem">+{formatNumber(defeatTransition.gemReward ?? 0)} Gems</span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="rift-combat-footer">
        <RiftWarband
          heroes={heroes}
          heroContributions={passiveVolleyHeroContributions}
          volleySignal={passiveVolleySignal}
        />
        <div className="rift-footer">
          <Crosshair size={17} />
          <span>Tap power</span>
          <strong>{formatNumber(clickPower)}</strong>
          <Zap size={16} />
        </div>
      </footer>

      <AnimatePresence>
        {damagePops.map(pop => (
          <motion.div
            key={pop.id}
            className={`damage-pop ${pop.isCrit ? 'crit' : ''}`}
            initial={{ opacity: 1, x: pop.x - 30, y: pop.y - 44, scale: pop.isCrit ? 0.7 : 0.45 }}
            animate={{ opacity: 0, x: pop.x - 30 + pop.driftX, y: pop.y - 142, scale: pop.isCrit ? 1.48 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.78, ease: 'easeOut' }}
          >
            {pop.isCrit && <span>CRIT</span>}
            -{formatNumber(pop.damage)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.section>
  );
};
