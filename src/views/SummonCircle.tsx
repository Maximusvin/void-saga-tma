import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Crown,
  Gem,
  Shield,
  Sparkles,
  Swords,
  WandSparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { HeroPortrait } from '../components/HeroPortrait';
import { triggerHaptic, triggerHapticNotification } from '../utils/haptics';
import {
  GAME_BALANCE,
  HERO_RARITIES,
  RARITY_COLORS,
  RARITY_ORDER,
  getHeroCombatFocus,
  getHeroTemplateById,
  getSummonDropPercent,
  getSummonsUntilLegendaryPity,
} from '../game/balance';
import type { GameEvent, Hero, HeroRarity } from '../game/types';
import { formatNumber } from '../utils/formatNumber';
import { getGameRenderProfile } from '../utils/renderQuality';
import './SummonCircle.css';

interface SummonCircleProps {
  gems: number;
  summonPity: number;
  summonHero: () => Promise<Extract<GameEvent, { type: 'hero_summoned' }> | null>;
}

type SummonPhase = 'idle' | 'charging' | 'silhouette' | 'result';

const RARITY_ICONS: Record<HeroRarity, LucideIcon> = {
  Common: Shield,
  Rare: WandSparkles,
  Epic: Swords,
  Legendary: Crown,
};

const SummonHeroGlyph = ({ rarity, size = 56 }: { rarity: HeroRarity; size?: number }) => {
  const Icon = RARITY_ICONS[rarity];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.65} />;
};

export const SummonCircle = ({ gems, summonPity, summonHero }: SummonCircleProps) => {
  const [phase, setPhase] = useState<SummonPhase>('idle');
  const [summonedHero, setSummonedHero] = useState<Hero | null>(null);
  const [duplicateShards, setDuplicateShards] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const renderProfile = useMemo(getGameRenderProfile, []);
  const claimButtonRef = useRef<HTMLButtonElement | null>(null);
  const resultActionsRef = useRef<HTMLDivElement | null>(null);
  const timeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const isMountedRef = useRef(true);

  const sortedSummonRarities = useMemo(
    () => [...HERO_RARITIES].sort((a, b) => RARITY_ORDER[b] - RARITY_ORDER[a]),
    [],
  );
  const celebrationParticleCount = Math.max(28, Math.round(150 * renderProfile.burstScale));

  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      timeoutsRef.current.delete(timeout);
      callback();
    }, delay);
    timeoutsRef.current.add(timeout);
    return timeout;
  }, []);

  useEffect(() => {
    const activeTimeouts = timeoutsRef.current;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeTimeouts.forEach(clearTimeout);
      activeTimeouts.clear();
      confetti.reset();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'result') {
      return;
    }

    const animationFrame = requestAnimationFrame(() => {
      claimButtonRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [phase]);

  const launchCelebration = useCallback((hero: Hero) => {
    if (
      prefersReducedMotion ||
      (hero.rarity !== 'Epic' && hero.rarity !== 'Legendary')
    ) {
      return;
    }

    confetti({
      particleCount: celebrationParticleCount,
      spread: 96,
      startVelocity: 34,
      ticks: renderProfile.quality === 'low' ? 90 : 120,
      scalar: renderProfile.quality === 'low' ? 0.78 : 0.92,
      origin: { y: 0.58 },
      colors: hero.rarity === 'Legendary'
        ? ['#ffd36f', '#fff1bc', '#74ead6']
        : ['#d58aff', '#8deee0', '#ffffff'],
      disableForReducedMotion: true,
    });
  }, [celebrationParticleCount, prefersReducedMotion, renderProfile.quality]);

  const handleSummon = () => {
    if (phase !== 'idle' && phase !== 'result') {
      return;
    }
    if (gems < GAME_BALANCE.summonCostGems) {
      triggerHapticNotification('error');
      return;
    }

    setPhase('charging');
    setSummonedHero(null);
    setDuplicateShards(0);
    confetti.reset();
    triggerHaptic('medium');

    scheduleTimeout(() => {
      void summonHero().then(result => {
        if (!isMountedRef.current) {
          return;
        }
        if (!result) {
          triggerHapticNotification('error');
          setPhase('idle');
          return;
        }

        setSummonedHero(result.hero);
        setDuplicateShards(result.isDuplicate ? result.shardsGranted : 0);
        setPhase('silhouette');
        triggerHaptic('heavy');

        scheduleTimeout(() => {
          if (!isMountedRef.current) {
            return;
          }
          setPhase('result');
          triggerHapticNotification('success');
          launchCelebration(result.hero);
        }, prefersReducedMotion ? 180 : GAME_BALANCE.summonRevealMs);
      });
    }, prefersReducedMotion ? 120 : GAME_BALANCE.summonChargeMs);
  };

  const claimHero = () => {
    setSummonedHero(null);
    setDuplicateShards(0);
    setPhase('idle');
    confetti.reset();
    triggerHaptic('light');
  };

  const canSummon = phase === 'idle' && gems >= GAME_BALANCE.summonCostGems;
  const canSummonAgain = phase === 'result' && gems >= GAME_BALANCE.summonCostGems;
  const summonsUntilLegendaryPity = getSummonsUntilLegendaryPity(summonPity);
  const resultStyle = summonedHero
    ? { '--summon-rarity': RARITY_COLORS[summonedHero.rarity] } as CSSProperties
    : undefined;
  const summonedTemplate = summonedHero ? getHeroTemplateById(summonedHero.templateId) : null;
  const summonedCombatFocus = summonedHero ? getHeroCombatFocus(summonedHero) : null;

  return (
    <motion.section
      animate={{ opacity: 1 }}
      className={`view-container summon-view phase-${phase}`}
      data-celebration-particle-count={celebrationParticleCount}
      data-render-quality={renderProfile.quality}
      data-summon-phase={phase}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <header className="summon-heading">
        <span>Rift sanctuary</span>
        <h2>Void Summon</h2>
        <p>Call a champion through the celestial gate</p>
      </header>

      <div className="summon-stage" aria-live="polite">
        <span className="summon-orbit outer" aria-hidden="true" />
        <span className="summon-orbit inner" aria-hidden="true" />
        <motion.div
          animate={phase === 'charging' && !prefersReducedMotion
            ? { scale: [1, 1.12, 0.96, 1.08], rotate: [0, 4, -4, 0] }
            : { scale: 1, rotate: 0 }}
          className="summon-core"
          transition={{ duration: 1.1, repeat: phase === 'charging' ? Infinity : 0 }}
        >
          <Sparkles aria-hidden="true" size={34} strokeWidth={1.7} />
        </motion.div>
        <div className="summon-stage-copy">
          <span>{phase === 'charging' ? 'Channeling' : 'Sanctuary attuned'}</span>
          <strong>{phase === 'charging' ? 'Opening the rift...' : 'One champion awaits'}</strong>
        </div>
      </div>

      <div className="summon-dock">
        <div className="summon-rates" aria-label="Summon drop rates" role="list">
          {sortedSummonRarities.map(rarity => (
            <div
              aria-label={`${rarity} ${getSummonDropPercent(rarity, summonPity)}%`}
              className={`summon-rate rarity-${rarity.toLowerCase()}`}
              key={rarity}
              role="listitem"
            >
              <SummonHeroGlyph rarity={rarity} size={17} />
              <span aria-hidden="true">{rarity}</span>
              <strong>{getSummonDropPercent(rarity, summonPity)}%</strong>
            </div>
          ))}
        </div>

        <motion.button
          className="summon-action"
          disabled={!canSummon}
          onClick={handleSummon}
          type="button"
          whileTap={canSummon && !prefersReducedMotion ? { scale: 0.97 } : undefined}
        >
          <span className="summon-action-icon" aria-hidden="true"><Sparkles size={21} /></span>
          <span className="summon-action-copy">
            <strong>{phase === 'charging' ? 'Opening...' : 'Open the rift'}</strong>
            <small>{canSummon
              ? `Legendary guaranteed in ${summonsUntilLegendaryPity}`
              : phase !== 'idle' ? 'Rift in motion' : 'Not enough gems'}</small>
          </span>
          <span className="summon-cost"><Gem aria-hidden="true" size={17} />{GAME_BALANCE.summonCostGems}</span>
        </motion.button>
      </div>

      <AnimatePresence>
        {phase === 'silhouette' && summonedHero && (
          <motion.div
            animate={{ opacity: 1 }}
            className="summon-silhouette"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="summon-silhouette"
            style={resultStyle}
          >
            <span className="summon-silhouette-rays" aria-hidden="true" />
            <motion.div
              animate={{ scale: prefersReducedMotion ? 1 : 1.34 }}
              className="summon-silhouette-glyph"
              exit={{ scale: prefersReducedMotion ? 1 : 1.7 }}
              initial={{ scale: prefersReducedMotion ? 1 : 0.64 }}
            >
              <SummonHeroGlyph rarity={summonedHero.rarity} size={94} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'result' && summonedHero && (
          <motion.div
            animate={{ opacity: 1 }}
            aria-labelledby="summon-result-title"
            aria-modal="true"
            className="summon-result-backdrop"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="summon-result"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                claimHero();
                return;
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                const actions = Array.from(
                  resultActionsRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
                );
                if (actions.length === 0) {
                  return;
                }
                const currentIndex = actions.indexOf(document.activeElement as HTMLButtonElement);
                const direction = event.shiftKey ? -1 : 1;
                const nextIndex = (currentIndex + direction + actions.length) % actions.length;
                actions[nextIndex]?.focus();
              }
            }}
            role="dialog"
            style={resultStyle}
          >
            <motion.article
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className={`summon-result-card rarity-${summonedHero.rarity.toLowerCase()}`}
              initial={prefersReducedMotion
                ? { opacity: 0, scale: 1, y: 0 }
                : { opacity: 0, scale: 0.86, y: 28 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.34, ease: 'easeOut' }}
            >
              <div className="summon-result-emblem">
                <span aria-hidden="true" />
                <HeroPortrait animated eager hero={summonedHero} />
              </div>
              <div className="summon-result-copy">
                <span>{duplicateShards > 0 ? 'Echo recovered' : `${summonedHero.rarity} champion`}</span>
                <h3 id="summon-result-title">{summonedHero.name}</h3>
                <p>
                  {duplicateShards > 0
                    ? 'Duplicate converted into ascension progress'
                    : `${summonedTemplate?.combatRole ?? 'Riftbound'} · ${summonedCombatFocus}${summonedCombatFocus === 'Balanced' ? '' : ' specialist'}`}
                </p>
              </div>
              <div className="summon-result-stat">
                {duplicateShards > 0 ? <Sparkles aria-hidden="true" size={20} /> : <Zap aria-hidden="true" size={20} />}
                <span>{duplicateShards > 0 ? 'Ascension shards' : 'Starting power'}</span>
                <strong>{duplicateShards > 0 ? `+${duplicateShards}` : formatNumber(summonedHero.power)}</strong>
              </div>
              <div className="summon-result-actions" ref={resultActionsRef}>
                <motion.button
                  className="summon-claim"
                  onClick={claimHero}
                  ref={claimButtonRef}
                  type="button"
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                >
                  <span>Claim champion</span>
                </motion.button>
                <motion.button
                  aria-label={`Summon again for ${GAME_BALANCE.summonCostGems} gems`}
                  className="summon-repeat"
                  disabled={!canSummonAgain}
                  onClick={handleSummon}
                  type="button"
                  whileTap={canSummonAgain && !prefersReducedMotion ? { scale: 0.97 } : undefined}
                >
                  <span>Summon again</span>
                  <strong><Gem aria-hidden="true" size={15} />{GAME_BALANCE.summonCostGems}</strong>
                </motion.button>
              </div>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};
