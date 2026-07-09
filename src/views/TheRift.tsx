import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHaptic } from '../utils/haptics';

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

export const TheRift: React.FC<TheRiftProps> = ({ 
  monsterHealth, monsterMaxHealth, dealDamage, clickPower, stage, isBoss,
  comboCount, comboMultiplier, registerHit, passivePower
}) => {
  const [clicks, setClicks] = useState<{ id: number, x: number, y: number, damage: number, isCrit: boolean }[]>([]);
  const [projectiles, setProjectiles] = useState<{ id: number, startX: number, startY: number }[]>([]);
  const [clickCounter, setClickCounter] = useState(0);
  const [isHit, setIsHit] = useState(false);

  // Auto-attack visual projectiles
  useEffect(() => {
    if (passivePower <= 1) return; // don't show if almost no passive
    
    const interval = setInterval(() => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 200; // spawn from outside
      const startX = Math.cos(angle) * radius;
      const startY = Math.sin(angle) * radius;
      
      const newProj = { id: Date.now() + Math.random(), startX, startY };
      setProjectiles(p => [...p, newProj]);
      
      setTimeout(() => {
        setProjectiles(p => p.filter(proj => proj.id !== newProj.id));
        // Small hit flash on passive landing
        setIsHit(true);
        setTimeout(() => setIsHit(false), 50);
      }, 300); // 300ms fly time
      
    }, 1000);
    return () => clearInterval(interval);
  }, [passivePower]);

  const handleAttack = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if ('cancelable' in e && e.cancelable) e.preventDefault();
    
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    // Critical hit logic: 10% chance for 2x damage
    const isCrit = Math.random() < 0.1;
    const finalDamage = isCrit ? clickPower * 2 : clickPower;

    dealDamage(finalDamage);
    registerHit();
    
    // Haptics
    triggerHaptic(isCrit ? 'heavy' : (isBoss ? 'medium' : 'light'));

    // Visual hit effect
    setIsHit(true);
    setTimeout(() => setIsHit(false), 50);

    const newClick = { id: clickCounter, x: clientX, y: clientY, damage: finalDamage, isCrit };
    setClicks((prev) => [...prev, newClick]);
    setClickCounter((c) => c + 1);

    setTimeout(() => {
      setClicks((prev) => prev.filter(c => c.id !== newClick.id));
    }, 1000);
  };

  const healthPercent = Math.max(0, Math.min(100, (monsterHealth / monsterMaxHealth) * 100));
  const monsterEmojis = ['👾', '👻', '💀', '👽', '👿', '🧌'];
  const currentEmoji = isBoss ? '👹' : monsterEmojis[stage % monsterEmojis.length];

  return (
    <motion.div 
      className="view-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flex: 1,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background Particles */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            width: Math.random() * 4 + 1 + 'px',
            height: Math.random() * 4 + 1 + 'px',
            backgroundColor: 'rgba(102, 252, 241, 0.4)',
            borderRadius: '50%',
            left: Math.random() * 100 + '%',
            top: Math.random() * 100 + '%',
            zIndex: 0
          }}
          animate={{ y: [0, -100 - Math.random() * 100], opacity: [0, 0.8, 0] }}
          transition={{ duration: Math.random() * 5 + 3, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      {/* Header Stats */}
      <div style={{ position: 'absolute', top: 20, width: '100%', display: 'flex', justifyContent: 'space-between', padding: '0 20px', zIndex: 10 }}>
        <div className="glass-panel" style={{ padding: '6px 12px', borderRadius: '12px', fontSize: '0.8rem' }}>
          Passive DPS: <span style={{ color: 'var(--accent-teal)', fontWeight: 'bold' }}>{passivePower.toFixed(1)}</span>
        </div>
        <AnimatePresence>
          {comboCount > 0 && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="glass-panel" 
              style={{ 
                padding: '6px 12px', borderRadius: '12px', fontSize: '0.8rem',
                border: comboMultiplier >= 2 ? '1px solid #ff00ff' : '1px solid var(--accent-cyan)'
              }}
            >
              Combo <span style={{ color: comboMultiplier >= 2 ? '#ff00ff' : 'var(--accent-cyan)', fontWeight: 'bold' }}>x{comboMultiplier.toFixed(2)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ zIndex: 1, textAlign: 'center', marginTop: '40px' }}>
        <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '5px' }}>
          Stage {stage}
        </h1>
        {isBoss && (
          <h2 style={{ color: '#ff00ff', textShadow: '0 0 10px #ff00ff', fontSize: '1.2rem', marginBottom: '10px' }}>
            ⚠️ BOSS WARNING ⚠️
          </h2>
        )}
      </div>
      
      {/* Monster Health Bar */}
      <div style={{ width: '240px', height: '16px', background: 'rgba(0,0,0,0.6)', borderRadius: '8px', margin: '20px 0', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', zIndex: 1, position: 'relative' }}>
        <motion.div 
          style={{ height: '100%', background: isBoss ? 'linear-gradient(90deg, #ff0000, #ff00ff)' : 'linear-gradient(90deg, #ff416c, #ff4b2b)' }}
          animate={{ width: `${healthPercent}%` }}
          transition={{ duration: 0.1 }}
        />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: 'white', textShadow: '1px 1px 2px black' }}>
          {Math.ceil(monsterHealth)} / {monsterMaxHealth}
        </div>
      </div>

      {/* Monster Container */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '30px' }}>
        
        {/* Passive Projectiles */}
        <AnimatePresence>
          {projectiles.map(proj => (
            <motion.div
              key={proj.id}
              initial={{ x: proj.startX, y: proj.startY, opacity: 0, scale: 0 }}
              animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 2 }}
              transition={{ duration: 0.3, ease: 'easeIn' }}
              style={{
                position: 'absolute',
                width: '10px', height: '10px',
                borderRadius: '50%',
                background: 'var(--accent-cyan)',
                boxShadow: '0 0 10px var(--accent-cyan)',
                zIndex: 2,
                pointerEvents: 'none'
              }}
            />
          ))}
        </AnimatePresence>

        {/* Enemy */}
        <motion.div 
          style={{
            width: isBoss ? '220px' : '180px',
            height: isBoss ? '220px' : '180px',
            borderRadius: isBoss ? '40px' : '30px',
            background: isBoss ? 'linear-gradient(135deg, #2b0b10, #0b0c10)' : 'linear-gradient(135deg, #1f2833, #0b0c10)',
            border: isBoss ? '3px solid #ff00ff' : '2px solid #ff416c',
            boxShadow: isBoss ? '0 0 50px rgba(255, 0, 255, 0.4)' : '0 0 30px rgba(255, 65, 108, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            touchAction: 'none',
            zIndex: 1,
            filter: isHit ? 'brightness(2) contrast(1.5)' : 'none'
          }}
          animate={{ 
            y: [0, -15, 0],
            x: isHit ? [-5, 5, -5, 5, 0] : 0 
          }}
          transition={{ 
            y: { duration: isBoss ? 3 : 2, repeat: Infinity, ease: 'easeInOut' },
            x: { duration: 0.1 }
          }}
          whileTap={{ scale: 0.95 }}
          onMouseDown={handleAttack}
          onTouchStart={handleAttack}
        >
          <div style={{ fontSize: isBoss ? '6rem' : '5rem', filter: isBoss ? 'drop-shadow(0 0 15px rgba(255,0,255,0.8))' : 'drop-shadow(0 0 10px rgba(255,65,108,0.8))' }}>
            {currentEmoji}
          </div>
        </motion.div>
      </div>

      <div className="glass-panel" style={{ padding: '10px 20px', textAlign: 'center', borderRadius: '15px', zIndex: 1 }}>
        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--accent-teal)' }}>
          Click DMG: {clickPower.toFixed(1)}
        </div>
      </div>

      {/* Floating Damage Numbers */}
      <AnimatePresence>
        {clicks.map((click) => (
          <motion.div
            key={click.id}
            initial={{ opacity: 1, y: click.y - 50, x: click.x - 20, scale: click.isCrit ? 0.8 : 0.5 }}
            animate={{ opacity: 0, y: click.y - 150, scale: click.isCrit ? 2 : 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              position: 'fixed',
              color: click.isCrit ? '#ff00ff' : '#fff',
              fontWeight: '900',
              fontSize: click.isCrit ? '2rem' : '1.5rem',
              textShadow: click.isCrit ? '0 0 10px #ff00ff' : '0 0 5px #ff416c',
              pointerEvents: 'none',
              zIndex: 100,
              left: 0,
              top: 0
            }}
          >
            {click.isCrit ? 'CRIT ' : ''}-{click.damage.toFixed(1)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
};
