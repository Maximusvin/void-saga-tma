import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHaptic } from '../utils/haptics';
import { formatNumber } from '../utils/formatNumber';
import type { GameNumber } from '../game/gameNumber';
import {
  RARITY_COLORS,
  RARITY_GRADIENTS,
  RARITY_ORDER,
  getAscensionShardCost,
  getHeroIcon,
  getHeroLevelCap,
  getHeroUpgradeQuote,
  getNextHeroPower,
  getUpgradeCost,
  isHeroAtLevelCap,
} from '../game/balance';
import type { Hero, HeroUpgradeAmount } from '../game/types';
import './HeroesRoster.css';

interface HeroesRosterProps {
  ascendHero: (id: string) => boolean;
  heroes: Hero[];
  upgradeHero: (id: string, amount: HeroUpgradeAmount) => boolean;
  gold: GameNumber;
}

export const HeroesRoster: React.FC<HeroesRosterProps> = ({ ascendHero, heroes, upgradeHero, gold }) => {
  const [progressFeedback, setProgressFeedback] = useState<{
    heroId: string;
    levelsGained?: number;
    type: 'ascend' | 'upgrade';
  } | null>(null);
  const [upgradeAmount, setUpgradeAmount] = useState<HeroUpgradeAmount>(1);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showProgressFeedback = (
    heroId: string,
    type: 'ascend' | 'upgrade',
    durationMs: number,
    levelsGained?: number,
  ) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setProgressFeedback({ heroId, levelsGained, type });
    feedbackTimeoutRef.current = setTimeout(() => {
      feedbackTimeoutRef.current = null;
      setProgressFeedback(null);
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const handleUpgrade = (id: string, levelsGained: number) => {
    const wasUpgraded = upgradeHero(id, upgradeAmount);
    if (!wasUpgraded) {
      return;
    }

    triggerHaptic('heavy');
    showProgressFeedback(id, 'upgrade', 500, levelsGained);
  };

  const handleAscend = (id: string) => {
    const wasAscended = ascendHero(id);
    if (!wasAscended) {
      return;
    }

    triggerHaptic('heavy');
    showProgressFeedback(id, 'ascend', 700);
  };

  // Sort heroes: Legendary > Epic > Rare > Common, then by level desc
  const sortedHeroes = [...heroes].sort((a, b) => {
    if (RARITY_ORDER[b.rarity] !== RARITY_ORDER[a.rarity]) {
      return RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity];
    }
    return b.level - a.level;
  });

  return (
    <motion.div 
      className="view-container roster-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flex: 1,
        padding: '2px 4px 12px',
        overflowY: 'auto',
        overflowX: 'hidden'
      }}
    >
      <div className="roster-header">
        <span>Warband</span>
        <h2 className="text-gradient">Your Heroes ({heroes.length})</h2>
        {heroes.length > 0 && (
          <div className="upgrade-mode" aria-label="Upgrade amount">
            {([1, 10, 'max'] as const).map(amount => (
              <button
                key={amount}
                type="button"
                className={upgradeAmount === amount ? 'active' : ''}
                aria-pressed={upgradeAmount === amount}
                onClick={() => setUpgradeAmount(amount)}
              >
                {amount === 'max' ? 'MAX' : `+${amount}`}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {sortedHeroes.length === 0 ? (
        <div className="glass-panel roster-empty">
          <p>The warband is waiting for its first riftbound hero.</p>
        </div>
      ) : (
        <div className="roster-grid">
          <AnimatePresence>
            {sortedHeroes.map((hero) => {
              const atLevelCap = isHeroAtLevelCap(hero);
              const levelCap = getHeroLevelCap(hero);
              const ascensionCost = getAscensionShardCost(hero);
              const canAscend = atLevelCap && hero.shards >= ascensionCost;
              const upgradeQuote = getHeroUpgradeQuote(hero, gold, upgradeAmount);
              const canUpgrade = !atLevelCap && upgradeQuote.levelsGained > 0;
              const displayedUpgradeCost = canUpgrade ? upgradeQuote.goldCost : getUpgradeCost(hero);
              const color = RARITY_COLORS[hero.rarity];
              const nextPower = upgradeQuote.levelsGained > 0
                ? upgradeQuote.power
                : getNextHeroPower(hero);
              const isUpgrading = progressFeedback?.heroId === hero.id && progressFeedback.type === 'upgrade';
              const isAscending = progressFeedback?.heroId === hero.id && progressFeedback.type === 'ascend';

              return (
                <motion.div 
                  key={hero.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1, filter: (isUpgrading || isAscending) ? 'brightness(1.5)' : 'brightness(1)' }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.02 }}
                  className="glass-panel"
                  style={{
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    border: `1px solid ${color}40`,
                    background: RARITY_GRADIENTS[hero.rarity],
                    boxShadow: (isUpgrading || isAscending) ? `0 0 20px ${color}` : `0 4px 12px ${color}15`,
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Level Up Flash Overlay */}
                  <AnimatePresence>
                    {(isUpgrading || isAscending) && (
                      <motion.div
                        initial={{ opacity: 0.8 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        style={{
                          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                          background: 'white', zIndex: 20, pointerEvents: 'none'
                        }}
                      />
                    )}
                  </AnimatePresence>

                  {/* Level Up Text */}
                  <AnimatePresence>
                    {(isUpgrading || isAscending) && (
                      <motion.div
                        initial={{ opacity: 1, y: 0, scale: 0.5 }}
                        animate={{ opacity: 0, y: -40, scale: 1.5 }}
                        style={{
                          position: 'absolute', top: '30%',
                          color: '#fff', fontWeight: 'bold', textShadow: `0 0 5px ${color}`, zIndex: 21, pointerEvents: 'none'
                        }}
                      >
                        {isAscending
                          ? 'ASCENDED!'
                          : `+${progressFeedback?.levelsGained ?? 1} LEVEL${progressFeedback?.levelsGained === 1 ? '' : 'S'}!`}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Rarity Badge */}
                  <div style={{ 
                    position: 'absolute', top: '6px', right: '6px', 
                    fontSize: '0.6rem', fontWeight: 'bold', 
                    padding: '2px 6px', borderRadius: '8px',
                    backgroundColor: `${color}30`, color: color,
                    border: `1px solid ${color}50`
                  }}>
                    {hero.rarity}
                  </div>

                  {/* Icon Placeholder */}
                  <div style={{ 
                    width: '64px', height: '64px', 
                    background: `linear-gradient(135deg, ${color}40, rgba(0,0,0,0.5))`, 
                    borderRadius: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem',
                    border: `2px solid ${color}80`,
                    boxShadow: `inset 0 0 10px ${color}40, 0 0 10px ${color}20`,
                    marginTop: '10px'
                  }}>
                    {getHeroIcon(hero.rarity)}
                  </div>
                  
                  {/* Info */}
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center', color: '#fff', marginTop: '4px' }}>
                    {hero.name}
                  </div>
                  
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px', padding: '0 4px' }}>
                    <span style={{ color: 'var(--text-main)' }}>Lv.{hero.level}/{levelCap}</span>
                    <span style={{ color: color, fontWeight: 'bold' }}>⚡ {formatNumber(hero.power)}</span>
                  </div>

                  {/* Upgrade Power Preview */}
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                    {atLevelCap
                      ? `Ascension ${hero.ascension} · ${hero.shards}/${ascensionCost} shards`
                      : `${upgradeQuote.levelsGained > 0 ? `+${upgradeQuote.levelsGained}` : 'Next'} ⚡ ${formatNumber(nextPower)}`}
                  </div>
                  
                  {/* Upgrade Button */}
                  <button 
                    className="btn-primary"
                    onClick={() => atLevelCap
                      ? handleAscend(hero.id)
                      : handleUpgrade(hero.id, upgradeQuote.levelsGained)}
                    disabled={atLevelCap ? !canAscend : !canUpgrade}
                    style={{
                      padding: '8px',
                      fontSize: '0.75rem',
                      width: '100%',
                      background: (canUpgrade || canAscend) ? `linear-gradient(45deg, ${color}dd, ${color})` : 'rgba(255,255,255,0.1)',
                      color: (canUpgrade || canAscend) ? '#000' : 'rgba(255,255,255,0.5)',
                      border: (canUpgrade || canAscend) ? 'none' : '1px solid rgba(255,255,255,0.2)',
                      boxShadow: (canUpgrade || canAscend) ? `0 0 10px ${color}60` : 'none',
                      borderRadius: '8px',
                      cursor: (canUpgrade || canAscend) ? 'pointer' : 'not-allowed',
                      marginTop: 'auto'
                    }}
                  >
                    {atLevelCap
                      ? (canAscend ? 'ASCEND' : 'NEED SHARDS')
                      : (canUpgrade
                          ? `UPGRADE${upgradeQuote.levelsGained > 1 ? ` +${upgradeQuote.levelsGained}` : ''}`
                          : 'NEED GOLD')}
                    <div style={{ fontSize: '0.65rem', marginTop: '2px', fontWeight: 'normal' }}>
                      {atLevelCap
                        ? `${hero.shards}/${ascensionCost} shards`
                        : <>{formatNumber(displayedUpgradeCost)} <span style={{ color: canUpgrade ? '#000' : 'var(--gold)' }}>g</span></>}
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};
