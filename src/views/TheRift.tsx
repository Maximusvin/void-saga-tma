import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHaptic } from '../utils/haptics';
import { formatNumber } from '../utils/formatNumber';

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
    if (passivePower <= 1) return;
    
    const interval = setInterval(() => {
      const angle = Math.random() * Math.PI * 2;
      const radius = window.innerWidth > 500 ? 250 : window.innerWidth / 1.5;
      const startX = Math.cos(angle) * radius;
      const startY = Math.sin(angle) * radius;
      
      const newProj = { id: Date.now() + Math.random(), startX, startY };
      setProjectiles(p => [...p, newProj]);
      
      setTimeout(() => {
        setProjectiles(p => p.filter(proj => proj.id !== newProj.id));
        setIsHit(true);
        setTimeout(() => setIsHit(false), 50);
      }, 400); 
      
    }, Math.max(200, 1000 - passivePower * 5)); // shoots faster with more passive power, min 200ms
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

    const isCrit = Math.random() < 0.1;
    const finalDamage = isCrit ? clickPower * 2 : clickPower;

    dealDamage(finalDamage);
    registerHit();
    
    triggerHaptic(isCrit ? 'heavy' : (isBoss ? 'medium' : 'light'));

    setIsHit(true);
    setTimeout(() => setIsHit(false), 50);

    const newClick = { id: clickCounter, x: clientX, y: clientY, damage: finalDamage, isCrit };
    setClicks((prev) => [...prev, newClick]);
    setClickCounter((c) => c + 1);

    setTimeout(() => {
      setClicks((prev) => prev.filter(c => c.id !== newClick.id));
    }, 800);
  };

  const healthPercent = Math.max(0, Math.min(100, (monsterHealth / monsterMaxHealth) * 100));
  const monsterEmojis = ['👾', '👻', '💀', '👽', '👿', '🧌', '🕷️', '🦂', '🦇'];
  const currentEmoji = isBoss ? '👹' : monsterEmojis[(stage - 1) % monsterEmojis.length];

  // Theme colors based on boss/normal
  const themeColor = isBoss ? '#ff00ff' : '#00ffff';
  const themeGlow = isBoss ? 'rgba(255, 0, 255, 0.5)' : 'rgba(0, 255, 255, 0.5)';
  const themeGradient = isBoss ? 'linear-gradient(135deg, #4a004a, #1a001a)' : 'linear-gradient(135deg, #003333, #001111)';

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
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 50%, rgba(31, 40, 51, 0.8) 0%, rgba(11, 12, 16, 1) 100%)'
      }}
    >
      {/* Immersive Background Grid & Particles */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1, backgroundImage: 'linear-gradient(rgba(102, 252, 241, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(102, 252, 241, 0.2) 1px, transparent 1px)', backgroundSize: '30px 30px', zIndex: 0 }} />
      
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            width: Math.random() * 6 + 2 + 'px',
            height: Math.random() * 6 + 2 + 'px',
            backgroundColor: isBoss ? '#ff00ff' : '#00ffff',
            borderRadius: '50%',
            left: Math.random() * 100 + '%',
            top: Math.random() * 100 + '%',
            zIndex: 0,
            filter: `blur(${Math.random() * 2}px)`,
            opacity: 0
          }}
          animate={{ 
            y: [0, -150 - Math.random() * 100], 
            x: [0, (Math.random() - 0.5) * 50],
            opacity: [0, 0.6, 0] 
          }}
          transition={{ duration: Math.random() * 4 + 4, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      {/* Top Stats HUD */}
      <div style={{ position: 'absolute', top: 20, width: '100%', display: 'flex', justifyContent: 'space-between', padding: '0 20px', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ 
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(102, 252, 241, 0.3)',
          padding: '8px 16px', borderRadius: '20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
        }}>
          <span style={{ fontSize: '1.2rem' }}>⚔️</span>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Auto DPS</div>
            <div style={{ color: '#00ffff', fontWeight: '900' }}>{formatNumber(passivePower)}/s</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <AnimatePresence>
            {comboCount > 0 && (
              <motion.div 
                initial={{ scale: 0, x: 50 }}
                animate={{ scale: 1, x: 0 }}
                exit={{ scale: 0.5, opacity: 0, x: 50 }}
                style={{ 
                  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', 
                  border: comboMultiplier >= 2 ? '2px solid #ff00ff' : '1px solid #00ffff',
                  padding: '8px 16px', borderRadius: '20px', fontSize: '0.9rem',
                  boxShadow: comboMultiplier >= 2 ? '0 0 20px rgba(255,0,255,0.4)' : '0 4px 15px rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <span style={{ color: comboMultiplier >= 2 ? '#ff00ff' : '#00ffff', fontWeight: '900', fontStyle: 'italic' }}>
                  {comboCount} HITS
                </span>
                <span style={{ background: comboMultiplier >= 2 ? '#ff00ff' : '#00ffff', color: '#000', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.75rem' }}>
                  x{comboMultiplier.toFixed(2)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Stage Info */}
      <div style={{ zIndex: 1, textAlign: 'center', marginTop: '60px', marginBottom: '20px' }}>
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          style={{ 
            display: 'inline-block',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
            padding: '5px 40px',
            borderTop: `1px solid ${themeColor}`,
            borderBottom: `1px solid ${themeColor}`
          }}
        >
          <h1 style={{ 
            fontSize: '2rem', margin: 0, 
            background: isBoss ? 'linear-gradient(to right, #ff00ff, #ff88ff)' : 'linear-gradient(to right, #00ffff, #88ffff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textTransform: 'uppercase', letterSpacing: '4px', fontWeight: '900'
          }}>
            Stage {stage}
          </h1>
        </motion.div>
        
        {isBoss && (
          <motion.div 
            animate={{ opacity: [1, 0.5, 1], scale: [1, 1.05, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{ 
              color: '#ff00ff', textShadow: '0 0 15px #ff00ff', 
              fontSize: '1rem', fontWeight: 'bold', letterSpacing: '2px', marginTop: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
            }}
          >
            <span>⚠️</span> EPIC BOSS <span>⚠️</span>
          </motion.div>
        )}
      </div>
      
      {/* Health Bar UI */}
      <div style={{ width: '280px', zIndex: 1, position: 'relative', marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', padding: '0 5px' }}>
          <span>HP</span>
          <span>{formatNumber(Math.ceil(monsterHealth))} / {formatNumber(monsterMaxHealth)}</span>
        </div>
        <div style={{ 
          height: '24px', background: 'rgba(0,0,0,0.8)', borderRadius: '12px', 
          border: '2px solid rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative',
          boxShadow: 'inset 0 0 10px rgba(0,0,0,1)'
        }}>
          {/* Health Fill */}
          <motion.div 
            style={{ 
              height: '100%', 
              background: isBoss 
                ? 'linear-gradient(90deg, #aa0000, #ff0055, #ff00ff)' 
                : 'linear-gradient(90deg, #005555, #00aaaa, #00ffff)',
              boxShadow: isHit ? `0 0 20px ${themeColor}` : 'none'
            }}
            animate={{ width: `${healthPercent}%` }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          >
            {/* Health Bar shine */}
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              style={{
                width: '50%', height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                transform: 'skewX(-20deg)'
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Interactive Monster Arena */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' }}>
        
        {/* Passive Projectiles */}
        <AnimatePresence>
          {projectiles.map(proj => (
            <motion.div
              key={proj.id}
              initial={{ x: proj.startX, y: proj.startY, opacity: 0, scale: 0, rotate: Math.atan2(-proj.startY, -proj.startX) * 180 / Math.PI }}
              animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 3 }}
              transition={{ duration: 0.4, ease: 'easeIn' }}
              style={{
                position: 'absolute',
                width: '15px', height: '4px',
                borderRadius: '2px',
                background: '#00ffff',
                boxShadow: '0 0 15px #00ffff, 0 0 5px #fff',
                zIndex: 2,
                pointerEvents: 'none'
              }}
            />
          ))}
        </AnimatePresence>

        {/* The Monster Entity */}
        <motion.div 
          style={{
            position: 'relative',
            width: isBoss ? '240px' : '200px',
            height: isBoss ? '240px' : '200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'crosshair',
            userSelect: 'none',
            touchAction: 'none',
            zIndex: 1,
            filter: isHit ? 'brightness(1.5) contrast(1.2)' : 'none'
          }}
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: isBoss ? 3 : 2, repeat: Infinity, ease: 'easeInOut' }}
          onMouseDown={handleAttack}
          onTouchStart={handleAttack}
        >
          {/* Monster Aura / Portal */}
          <motion.div 
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: '50%',
              background: themeGradient,
              boxShadow: `0 0 50px ${themeGlow}, inset 0 0 30px ${themeGlow}`,
              border: `2px dashed ${themeColor}`,
              opacity: 0.8
            }}
            animate={{ 
              rotate: isHit ? [0, 10, -10, 0] : [0, 360],
              scale: isHit ? 0.95 : 1
            }}
            transition={{ 
              rotate: isHit ? { duration: 0.2 } : { duration: 20, repeat: Infinity, ease: 'linear' },
              scale: { duration: 0.1 }
            }}
          />

          <motion.div 
            style={{
              position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%',
              borderRadius: '50%',
              background: `radial-gradient(circle, #000 0%, ${themeColor}40 100%)`,
              border: `1px solid ${themeColor}`,
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          />

          {/* The Emoji */}
          <motion.div 
            style={{ 
              fontSize: isBoss ? '7rem' : '6rem', 
              filter: `drop-shadow(0 0 20px ${themeColor})`,
              position: 'relative',
              zIndex: 2,
              pointerEvents: 'none'
            }}
            animate={{ 
              scale: isHit ? 0.9 : 1,
              x: isHit ? (Math.random() - 0.5) * 20 : 0,
              y: isHit ? (Math.random() - 0.5) * 20 : 0
            }}
            transition={{ duration: 0.1 }}
          >
            {currentEmoji}
          </motion.div>
        </motion.div>
      </div>

      {/* Floating Damage Numbers */}
      <AnimatePresence>
        {clicks.map((click) => (
          <motion.div
            key={click.id}
            initial={{ opacity: 1, y: click.y - 50, x: click.x - 30, scale: click.isCrit ? 0.5 : 0.2, rotate: (Math.random() - 0.5) * 30 }}
            animate={{ opacity: 0, y: click.y - 150 - Math.random() * 50, x: click.x - 30 + (Math.random() - 0.5) * 100, scale: click.isCrit ? 1.5 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              position: 'fixed',
              color: click.isCrit ? '#ff00ff' : '#fff',
              fontWeight: '900',
              fontSize: click.isCrit ? '2.5rem' : '1.8rem',
              WebkitTextStroke: '1px black',
              textShadow: click.isCrit ? '0 0 15px #ff00ff' : '0 0 10px #00ffff',
              pointerEvents: 'none',
              zIndex: 100,
              left: 0,
              top: 0
            }}
          >
            {click.isCrit && <span style={{ fontSize: '1rem', display: 'block', textAlign: 'center', marginBottom: '-10px' }}>CRIT!</span>}
            -{formatNumber(click.damage)}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Footer Info */}
      <div style={{ position: 'absolute', bottom: 20, pointerEvents: 'none', zIndex: 10 }}>
        <div style={{ 
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
          padding: '8px 24px', borderRadius: '30px', color: 'rgba(255,255,255,0.7)',
          fontSize: '0.9rem', fontWeight: 'bold', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          🎯 Click Power: <span style={{ color: '#fff' }}>{formatNumber(clickPower)}</span>
        </div>
      </div>
    </motion.div>
  );
};
