import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Swords, UsersRound } from 'lucide-react';
import { getHeroIcon, getHeroTemplateById } from '../game/balance';
import type { Hero, HeroDamageContribution } from '../game/types';

interface RiftWarbandProps {
  heroes: readonly Hero[];
  heroContributions: readonly HeroDamageContribution[];
  volleySignal: number;
}

const WARBAND_ATTACK_FEEDBACK_MS = 620;

export const RiftWarband = memo(function RiftWarband({
  heroes,
  heroContributions,
  volleySignal,
}: RiftWarbandProps) {
  const prefersReducedMotion = useReducedMotion();
  const [activeSignal, setActiveSignal] = useState<number | null>(null);
  const activeHeroIds = useMemo(
    () => new Set(heroContributions.map(contribution => contribution.heroId)),
    [heroContributions],
  );

  useEffect(() => {
    if (volleySignal <= 0) {
      return;
    }

    setActiveSignal(volleySignal);
    const timeout = setTimeout(() => {
      setActiveSignal(current => current === volleySignal ? null : current);
    }, WARBAND_ATTACK_FEEDBACK_MS);
    return () => clearTimeout(timeout);
  }, [volleySignal]);

  if (heroes.length === 0) {
    return (
      <div className="rift-warband empty" aria-label="Warband empty">
        <UsersRound size={15} aria-hidden="true" />
        <span>No heroes</span>
      </div>
    );
  }

  return (
    <div className="rift-warband" aria-label={`Active warband, ${heroes.length} heroes`}>
      <span className="warband-mark" title="Warband">
        <Swords size={15} aria-hidden="true" />
      </span>
      <div className="warband-slots">
        {heroes.slice(0, 4).map(hero => {
          const template = getHeroTemplateById(hero.templateId);
          const isAttacking = activeSignal === volleySignal && activeHeroIds.has(hero.id);
          const style = {
            '--hero-accent': template?.accentColor ?? '#9eb8b5',
          } as CSSProperties;

          return (
            <div
              key={hero.id}
              className={`warband-slot ${isAttacking ? 'attacking' : ''}`}
              style={style}
              data-attacking={isAttacking ? 'true' : 'false'}
              data-hero-id={hero.id}
              data-last-volley={activeHeroIds.has(hero.id) ? volleySignal : 0}
              role="img"
              aria-label={`${hero.name}, level ${hero.level}, ${template?.combatRole ?? hero.rarity}`}
              title={`${hero.name} · ${template?.combatRole ?? hero.rarity} · Lv.${hero.level}`}
            >
              <motion.span
                key={`${hero.id}-${isAttacking ? volleySignal : 0}`}
                className="warband-portrait"
                initial={isAttacking && !prefersReducedMotion ? { scale: 0.82, y: 4 } : false}
                animate={isAttacking && !prefersReducedMotion
                  ? { scale: [0.82, 1.18, 1], y: [4, -5, 0] }
                  : { scale: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.36, ease: 'easeOut' }}
              >
                {template?.icon ?? getHeroIcon(hero.rarity)}
              </motion.span>
              <span className="warband-level">{hero.level}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
