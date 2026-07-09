import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Crosshair, Zap } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { formatNumber } from '../utils/formatNumber';
import { GAME_BALANCE } from '../game/balance';
import { RiftPixiScene } from './RiftPixiScene';
import './TheRift.css';

interface TheRiftProps {
  monsterHealth: number;
  monsterMaxHealth: number;
  dealDamage: (amount: number) => void;
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
  const [clickCounter, setClickCounter] = useState(0);
  const [isHit, setIsHit] = useState(false);
  const [impactState, setImpactState] = useState({ id: 0, isCrit: false });

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
    if (passivePower <= GAME_BALANCE.passiveFallbackPower) {
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

      setTimeout(() => {
        setProjectiles(current => current.filter(item => item.id !== projectile.id));
        setIsHit(true);
        setImpactState(current => ({ id: current.id + 1, isCrit: false }));
        setTimeout(() => setIsHit(false), GAME_BALANCE.hitFlashMs);
      }, GAME_BALANCE.autoProjectileTravelMs);
    }, Math.max(
      GAME_BALANCE.autoProjectileMinIntervalMs,
      GAME_BALANCE.autoProjectileBaseIntervalMs - passivePower * GAME_BALANCE.autoProjectilePowerSpeedupMs,
    ));

    return () => clearInterval(interval);
  }, [passivePower]);

  const handleAttack = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if ('cancelable' in event && event.cancelable) {
      event.preventDefault();
    }

    const point = 'touches' in event ? event.touches[0] : event;
    const isCrit = Math.random() < GAME_BALANCE.critChance;
    const finalDamage = isCrit ? clickPower * GAME_BALANCE.critMultiplier : clickPower;
    const nextClick = {
      id: clickCounter,
      x: point.clientX,
      y: point.clientY,
      damage: finalDamage,
      isCrit,
      driftX: (Math.random() - 0.5) * 92,
    };

    dealDamage(finalDamage);
    registerHit();
    triggerHaptic(isCrit ? 'heavy' : (isBoss ? 'medium' : 'light'));
    setIsHit(true);
    setImpactState(current => ({ id: current.id + 1, isCrit }));
    setTimeout(() => setIsHit(false), GAME_BALANCE.hitFlashMs);
    setDamagePops(current => [...current, nextClick]);
    setClickCounter(value => value + 1);
    setTimeout(() => {
      setDamagePops(current => current.filter(item => item.id !== nextClick.id));
    }, GAME_BALANCE.damageTextLifetimeMs);
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
          onMouseDown={handleAttack}
          onTouchStart={handleAttack}
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
            <RiftPixiScene
              hitSignal={impactState.id}
              isBoss={isBoss}
              isHit={isHit}
              isLastHitCrit={impactState.isCrit}
              stage={stage}
            />
          </motion.span>
        </motion.button>
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
