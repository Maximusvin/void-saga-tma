import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { triggerHaptic, triggerHapticNotification } from '../utils/haptics';
import {
  GAME_BALANCE,
  RARITY_COLORS,
  RARITY_ORDER,
  SUMMON_POOL,
  getHeroIcon,
  getSummonDropPercent,
} from '../game/balance';
import type { Hero } from '../game/types';
import './SummonCircle.css';

interface SummonCircleProps {
  gems: number;
  summonHero: () => Promise<Hero | null>;
}

export const SummonCircle: React.FC<SummonCircleProps> = ({ gems, summonHero }) => {
  const [isSummoning, setIsSummoning] = useState(false);
  const [summonedHero, setSummonedHero] = useState<Hero | null>(null);
  const [showSilhouette, setShowSilhouette] = useState(false);

  const handleSummon = () => {
    if (gems < GAME_BALANCE.summonCostGems) {
      triggerHapticNotification('error');
      return;
    }

    setIsSummoning(true);
    setSummonedHero(null);
    setShowSilhouette(false);
    
    triggerHaptic('medium');

    setTimeout(() => {
      void summonHero().then(newHero => {
        if (!newHero) {
          triggerHapticNotification('error');
          setIsSummoning(false);
          return;
        }

        setSummonedHero(newHero);
        setIsSummoning(false);
        setShowSilhouette(true);
        triggerHaptic('heavy');

        setTimeout(() => {
          setShowSilhouette(false);
          triggerHaptic('heavy');
          
          if (newHero.rarity === 'Epic' || newHero.rarity === 'Legendary') {
            confetti({
              particleCount: 150,
              spread: 100,
              origin: { y: 0.6 },
              colors: newHero.rarity === 'Legendary' ? ['#ffd700', '#ffaa00', '#ffffff'] : ['#ff00ff', '#aa00ff', '#00ffff']
            });
          }
        }, GAME_BALANCE.summonRevealMs);
      });
    }, GAME_BALANCE.summonChargeMs);
  };

  const sortedSummonPool = [...SUMMON_POOL].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);

  return (
    <motion.div 
      className="view-container summon-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        height: '100%',
        flex: 1,
        padding: '18px 16px 12px',
        overflowY: 'auto'
      }}
    >
      <div className="summon-heading">
        <h2 className="text-gradient">
          Void Summon
        </h2>
        <p>
          Awaken the legendary heroes of the rift
        </p>
      </div>
      
      {/* Portal Area */}
      <div style={{ position: 'relative', width: '220px', height: '220px', marginBottom: '30px' }}>
        {/* Outer Ring */}
        <motion.div 
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: '50%',
            border: '2px solid rgba(102, 252, 241, 0.2)',
            borderTopColor: 'var(--accent-cyan)',
            borderBottomColor: 'var(--accent-cyan)',
            boxShadow: '0 0 20px rgba(102, 252, 241, 0.2)'
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />
        
        {/* Inner Ring */}
        <motion.div 
          style={{
            position: 'absolute', top: '20px', left: '20px', right: '20px', bottom: '20px',
            borderRadius: '50%',
            border: '3px dashed rgba(255, 0, 255, 0.3)',
            borderLeftColor: '#ff00ff',
            borderRightColor: '#ff00ff',
            boxShadow: 'inset 0 0 20px rgba(255, 0, 255, 0.2)'
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        />

        {/* Center Void Core */}
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            boxShadow: [
              '0 0 30px rgba(102, 252, 241, 0.5)',
              '0 0 60px rgba(255, 0, 255, 0.8)',
              '0 0 30px rgba(102, 252, 241, 0.5)'
            ]
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80px', height: '80px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #ffffff 0%, #00ffff 40%, #ff00ff 100%)',
            filter: 'blur(5px)',
            opacity: 0.8
          }}
        />
        
        {/* Summon Animation Overlay */}
        <AnimatePresence>
          {isSummoning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.1 }}
              animate={{ opacity: 1, scale: 2 }}
              exit={{ opacity: 0, scale: 3 }}
              transition={{ duration: 1.5 }}
              style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '100px', height: '100px',
                background: '#ffffff',
                borderRadius: '50%',
                filter: 'blur(10px)',
                zIndex: 10
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Drop Rates Info */}
      <div className="glass-panel summon-rates" style={{
        width: '100%', maxWidth: '320px', padding: '15px', borderRadius: '15px', 
        marginBottom: '30px', display: 'flex', justifyContent: 'space-between',
        fontSize: '0.8rem', fontWeight: 'bold'
      }}>
        {sortedSummonPool.map(template => (
          <div key={template.rarity} style={{ textAlign: 'center' }}>
            <div style={{ color: RARITY_COLORS[template.rarity] }}>{getSummonDropPercent(template)}%</div>
            <div style={{ color: '#aaa', fontSize: '0.7rem' }}>{template.rarity}</div>
          </div>
        ))}
      </div>

      {/* Summon Button */}
      <motion.button 
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.02 }}
        onClick={handleSummon}
        disabled={isSummoning || gems < GAME_BALANCE.summonCostGems || showSilhouette}
        style={{ 
          width: '100%', maxWidth: '320px', 
          padding: '16px', borderRadius: '20px',
          border: 'none',
          background: (isSummoning || showSilhouette || gems < GAME_BALANCE.summonCostGems) 
            ? 'rgba(255,255,255,0.1)' 
            : 'linear-gradient(45deg, #00ffff, #ff00ff)',
          color: (isSummoning || showSilhouette || gems < GAME_BALANCE.summonCostGems) ? 'rgba(255,255,255,0.4)' : '#000',
          fontWeight: '900', fontSize: '1.2rem',
          boxShadow: (isSummoning || showSilhouette || gems < GAME_BALANCE.summonCostGems) ? 'none' : '0 10px 20px rgba(255,0,255,0.3)',
          cursor: (isSummoning || showSilhouette || gems < GAME_BALANCE.summonCostGems) ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
        }}
      >
        <span>Summon</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px 10px', borderRadius: '10px', fontSize: '1rem' }}>
          {GAME_BALANCE.summonCostGems} <span style={{ color: '#fff', textShadow: '0 0 5px #ff00ff' }}>💎</span>
        </span>
      </motion.button>

      {/* Silhouette & Result Modal */}
      <AnimatePresence mode="wait">
        {showSilhouette && summonedHero && (
           <motion.div
            key="silhouette"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1.5, filter: 'brightness(0) drop-shadow(0 0 30px #fff)' }}
            exit={{ opacity: 0, scale: 2, filter: 'brightness(10)' }}
            transition={{ duration: 1.5, ease: "easeIn" }}
            style={{
              position: 'absolute', top: '40%', left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '8rem', zIndex: 90
            }}
          >
            {getHeroIcon(summonedHero.rarity)}
          </motion.div>
        )}
        {!showSilhouette && summonedHero && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              zIndex: 100, padding: '20px'
            }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                background: `linear-gradient(135deg, rgba(31,40,51,0.9), rgba(11,12,16,0.9))`,
                border: `2px solid ${RARITY_COLORS[summonedHero.rarity]}`,
                boxShadow: `0 0 50px ${RARITY_COLORS[summonedHero.rarity]}88`,
                padding: '40px', borderRadius: '24px', textAlign: 'center', width: '100%', maxWidth: '320px',
                position: 'relative', overflow: 'hidden'
              }}
            >
              {/* Shine effect */}
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '200%' }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '50%', height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                  transform: 'skewX(-20deg)', zIndex: 0
                }}
              />

              <div style={{ fontSize: '5rem', marginBottom: '10px', position: 'relative', zIndex: 1, textShadow: `0 0 20px ${RARITY_COLORS[summonedHero.rarity]}` }}>
                {getHeroIcon(summonedHero.rarity)}
              </div>
              <h3 style={{ 
                color: RARITY_COLORS[summonedHero.rarity], 
                marginBottom: '5px', fontSize: '2rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', position: 'relative', zIndex: 1
              }}>
                {summonedHero.rarity}!
              </h3>
              <p style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '15px', position: 'relative', zIndex: 1 }}>{summonedHero.name}</p>
              
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '12px', marginBottom: '30px', position: 'relative', zIndex: 1 }}>
                <p style={{ color: 'var(--accent-teal)', fontSize: '1.2rem' }}>⚡ Power: {summonedHero.power}</p>
              </div>

              <motion.button 
                whileTap={{ scale: 0.95 }}
                className="btn-primary" 
                style={{ width: '100%', fontSize: '1.2rem', position: 'relative', zIndex: 1 }} 
                onClick={() => setSummonedHero(null)}
              >
                Claim Hero
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
