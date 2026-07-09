import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Hero } from '../store/useGameState';
import confetti from 'canvas-confetti';
import { triggerHaptic } from '../utils/haptics';

interface SummonCircleProps {
  gems: number;
  spendGems: (amount: number) => boolean;
  addHero: (hero: Hero) => void;
}

export const SummonCircle: React.FC<SummonCircleProps> = ({ gems, spendGems, addHero }) => {
  const [isSummoning, setIsSummoning] = useState(false);
  const [summonedHero, setSummonedHero] = useState<Hero | null>(null);
  const [showSilhouette, setShowSilhouette] = useState(false);

  const handleSummon = () => {
    if (spendGems(10)) {
      setIsSummoning(true);
      setSummonedHero(null);
      setShowSilhouette(false);
      
      triggerHaptic('medium');

      // 1. Initial gacha spin delay
      setTimeout(() => {
        // Simple randomizer for rarity
        const rand = Math.random();
        let rarity: Hero['rarity'] = 'Common';
        let name = 'Void Grunt';
        let power = 5;

        if (rand > 0.9) { rarity = 'Legendary'; name = 'Void Lord'; power = 50; }
        else if (rand > 0.7) { rarity = 'Epic'; name = 'Void Knight'; power = 20; }
        else if (rand > 0.4) { rarity = 'Rare'; name = 'Void Mage'; power = 10; }

        const newHero: Hero = {
          id: Math.random().toString(),
          name,
          rarity,
          level: 1,
          power
        };

        // 2. Show silhouette
        setSummonedHero(newHero); // Set data but we render silhouette first
        setIsSummoning(false);
        setShowSilhouette(true);
        triggerHaptic('heavy');

        // 3. Reveal hero after silhouette
        setTimeout(() => {
          setShowSilhouette(false);
          addHero(newHero);
          
          triggerHaptic('heavy');
          
          // Fire confetti for good drops
          if (rarity === 'Epic' || rarity === 'Legendary') {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: rarity === 'Legendary' ? ['#ffd700', '#ffaa00'] : ['#ff00ff', '#aa00ff']
            });
          }
        }, 1200);

      }, 1500);
    }
  };

  return (
    <motion.div 
      className="view-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flex: 1
      }}
    >
      <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '40px' }}>Summoning Portal</h2>
      
      <div style={{ position: 'relative', width: '200px', height: '200px', marginBottom: '40px' }}>
        {/* Portal Ring */}
        <motion.div 
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: '50%',
            border: '4px dashed var(--accent-cyan)',
            boxShadow: '0 0 20px var(--accent-cyan)'
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        />
        
        {/* Summon Animation Overlay */}
        <AnimatePresence>
          {isSummoning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0, scale: 2 }}
              style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100px', height: '100px',
                background: 'var(--gem)',
                borderRadius: '50%',
                filter: 'blur(20px)',
                zIndex: 10
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <button 
        className="btn-primary" 
        onClick={handleSummon}
        disabled={isSummoning || gems < 10 || showSilhouette}
        style={{ width: '80%', maxWidth: '300px', opacity: (isSummoning || showSilhouette || gems < 10) ? 0.5 : 1 }}
      >
        Summon (10 Gems)
      </button>

      {/* Silhouette & Result Modal */}
      <AnimatePresence mode="wait">
        {showSilhouette && summonedHero && (
           <motion.div
            key="silhouette"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, filter: 'brightness(0) drop-shadow(0 0 20px #fff)' }}
            exit={{ opacity: 0, scale: 1.2, filter: 'brightness(10)' }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'absolute',
              top: '40%', left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '8rem',
              zIndex: 90
            }}
          >
            {summonedHero.rarity === 'Legendary' ? '👑' : summonedHero.rarity === 'Epic' ? '🔮' : summonedHero.rarity === 'Rare' ? '⚔️' : '🛡️'}
          </motion.div>
        )}
        {!showSilhouette && summonedHero && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="glass-panel"
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '30px',
              textAlign: 'center',
              zIndex: 100,
              border: `2px solid ${summonedHero.rarity === 'Legendary' ? '#ffd700' : summonedHero.rarity === 'Epic' ? '#ff00ff' : '#3498db'}`,
              boxShadow: `0 0 30px ${summonedHero.rarity === 'Legendary' ? '#ffd700' : summonedHero.rarity === 'Epic' ? '#ff00ff' : '#3498db'}88`,
              width: '80%',
              maxWidth: '300px'
            }}
          >
            <div style={{ fontSize: '4rem', marginBottom: '10px' }}>
              {summonedHero.rarity === 'Legendary' ? '👑' : summonedHero.rarity === 'Epic' ? '🔮' : summonedHero.rarity === 'Rare' ? '⚔️' : '🛡️'}
            </div>
            <h3 style={{ 
              color: summonedHero.rarity === 'Legendary' ? '#ffd700' : summonedHero.rarity === 'Epic' ? '#ff00ff' : 'var(--text-light)', 
              marginBottom: '5px',
              fontSize: '1.5rem'
            }}>
              {summonedHero.rarity}!
            </h3>
            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '10px' }}>{summonedHero.name}</p>
            <p style={{ color: 'var(--accent-teal)', marginBottom: '20px' }}>Power: {summonedHero.power}</p>
            <button className="btn-primary" style={{ width: '100%' }} onClick={() => setSummonedHero(null)}>
              Collect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
