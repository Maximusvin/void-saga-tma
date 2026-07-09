import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Crosshair, Zap } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { formatNumber } from '../utils/formatNumber';
import { GAME_BALANCE, isBossStage } from '../game/balance';
import type { GameEvent } from '../game/types';
import './TheRift.css';

const RiftPixiScene = lazy(async () => {
  const module = await import('./RiftPixiScene');
  return { default: module.RiftPixiScene };
});

interface TheRiftProps {
  monsterHealth: number;
  monsterMaxHealth: number;
  dealDamage: () => Promise<GameEvent[]>;
  clickPower: number;
  stage: number;
  isBoss: boolean;
  comboCount: number;
  comboMultiplier: number;
  registerHit: () => void;
  passivePower: number;
}

interface DamagePop {
  id: number;
  x: number;
  y: number;
  damage: number;
  isCrit: boolean;
  driftX: number;
}

interface Projectile {
  id: number;
  startX: number;
  startY: number;
  rotate: number;
}

interface DefeatTransition {
  id: number;
  defeatedStage: number;
  nextStage: number;
  wasBoss: boolean;
  goldReward: number | null;
  gemReward: number | null;
}

type MonsterDefeatedEvent = Extract<GameEvent, { type: 'monster_defeated' }>;
type MonsterHitEvent = Extract<GameEvent, { type: 'monster_hit' }>;

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
}) => {
  const [damagePops, setDamagePops] = useState<DamagePop[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [isHit, setIsHit] = useState(false);
  const [impactState, setImpactState] = useState({ id: 0, isCrit: false });
  const [defeatTransition, setDefeatTransition] = useState<DefeatTransition | null>(null);
  const previousStageRef = useRef(stage);
  const previousBossRef = useRef(isBoss);
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

  const sparks = useMemo(() => {
    return Array.from({ length: 18 }, (_, id) => ({
      id,
      left: 8 + ((id * 37) % 84),
      delay: (id % 6) * 0.42,
      duration: 4.6 + (id % 5) * 0.32,
      scale: 0.65 + (id % 4) * 0.18,
    }));
  }, []);

  useEffect(() => {
    if (passivePower <= GAME_BALANCE.passiveProjectileThreshold) {
      return;
    }

    const interval = setInterval(() => {
      const angle = Math.random() * Math.PI * 2;
      const radius = window.innerWidth > 500 ? 280 : window.innerWidth * 0.82;
      const startX = Math.cos(angle) * radius;
      const startY = Math.sin(angle) * radius;
      const projectile = {
        id: Date.now() + Math.random(),
        startX,
        startY,
        rotate: Math.atan2(-startY, -startX) * 180 / Math.PI,
      };

      setProjectiles(current => [...current, projectile]);

      scheduleTimeout(() => {
        setProjectiles(current => current.filter(item => item.id !== projectile.id));
        flashHit();
        setImpactState(current => ({ id: current.id + 1, isCrit: false }));
      }, GAME_BALANCE.autoProjectileTravelMs);
    }, Math.max(
      GAME_BALANCE.autoProjectileMinIntervalMs,
      GAME_BALANCE.autoProjectileBaseIntervalMs - passivePower * GAME_BALANCE.autoProjectilePowerSpeedupMs,
    ));

    return () => clearInterval(interval);
  }, [flashHit, passivePower, scheduleTimeout]);

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

  const healthPercent = Math.max(0, Math.min(100, (monsterHealth / monsterMaxHealth) * 100));
  const combatTone = isBoss ? 'boss' : 'normal';

  return (
    <motion.section
      className={`rift-view ${combatTone}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="rift-skyline" />
      {sparks.map(spark => (
        <motion.span
          key={spark.id}
          className="rift-spark"
          style={{ left: `${spark.left}%`, scale: spark.scale }}
          animate={{ y: ['18vh', '-76vh'], opacity: [0, 0.78, 0] }}
          transition={{ duration: spark.duration, delay: spark.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      <header className="rift-stage-hud">
        <div className="stage-kicker">{isBoss ? 'Boss Rift' : 'Void Rift'}</div>
        <h1>Stage {stage}</h1>
        {isBoss && (
          <motion.div
            className="boss-alert"
            animate={{ opacity: [0.72, 1, 0.72] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            Epic boss breach
          </motion.div>
        )}
      </header>

      <div className="combat-dashboard">
        <div className="combat-chip">
          <Activity size={16} />
          <span>Auto</span>
          <strong>{formatNumber(passivePower)}/s</strong>
        </div>
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

      <div className="health-panel">
        <div className="health-meta">
          <span>Enemy integrity</span>
          <strong>{formatNumber(Math.ceil(monsterHealth))} / {formatNumber(monsterMaxHealth)}</strong>
        </div>
        <div className="health-track">
          <motion.div
            className="health-fill"
            animate={{ width: `${healthPercent}%` }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="rift-arena">
        <AnimatePresence>
          {projectiles.map(projectile => (
            <motion.span
              key={projectile.id}
              className="auto-projectile"
              initial={{ x: projectile.startX, y: projectile.startY, opacity: 0, scaleX: 0.4, rotate: projectile.rotate }}
              animate={{ x: 0, y: 0, opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 0.4, ease: 'easeIn' }}
            />
          ))}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label="Attack rift monster"
          className={`monster-button ${isHit ? 'hit' : ''}`}
          onPointerDown={handleAttack}
          onKeyDown={handleAttackKeyDown}
          animate={{ y: [0, -16, 0] }}
          transition={{ duration: isBoss ? 3.1 : 2.35, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="monster-ring outer" />
          <span className="monster-ring inner" />
          <motion.span
            className="rift-beast-shell"
            animate={isHit ? { scale: [1, 0.88, 1.05, 1], rotate: [0, -5, 5, 0] } : { scale: [1, 1.035, 1] }}
            transition={{ duration: isHit ? 0.18 : 2.2, repeat: isHit ? 0 : Infinity, ease: 'easeInOut' }}
          >
            <Suspense fallback={<span className="rift-pixi-loading" />}>
              <RiftPixiScene
                defeatSignal={defeatTransition?.id ?? 0}
                hitSignal={impactState.id}
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

      <footer className="rift-footer">
        <Crosshair size={17} />
        <span>Tap power</span>
        <strong>{formatNumber(clickPower)}</strong>
        <Zap size={16} />
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
