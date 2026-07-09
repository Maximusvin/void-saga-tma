import { useState, useEffect, useCallback } from 'react';

export interface Hero {
  id: string;
  name: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  level: number;
  power: number;
}

const STORAGE_KEY = 'rift_heroes_save';

const loadState = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse save", e);
    }
  }
  return null;
};

export const useGameState = () => {
  const initialState = loadState();

  const [gold, setGold] = useState(initialState?.gold ?? 1000);
  const [gems, setGems] = useState(initialState?.gems ?? 50);
  const [heroes, setHeroes] = useState<Hero[]>(initialState?.heroes ?? []);
  const [activeView, setActiveView] = useState<'rift' | 'summon' | 'roster'>('rift');

  const [stage, setStage] = useState(initialState?.stage ?? 1);
  const [monsterMaxHealth, setMonsterMaxHealth] = useState(initialState?.monsterMaxHealth ?? 100);
  const [monsterHealth, setMonsterHealth] = useState(initialState?.monsterHealth ?? 100);

  // Combo system
  const [comboCount, setComboCount] = useState(0);
  const [lastHitTime, setLastHitTime] = useState(0);

  const isBoss = stage % 5 === 0;

  // Auto-save
  useEffect(() => {
    const stateToSave = { gold, gems, heroes, stage, monsterMaxHealth, monsterHealth };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [gold, gems, heroes, stage, monsterMaxHealth, monsterHealth]);

  const baseClickPower = 1 + heroes.reduce((acc, hero) => acc + hero.power * 0.1, 0);
  const passivePower = heroes.reduce((acc, hero) => acc + hero.power, 0) || 1;

  // Calculate combo multiplier (max 3x at 100 combo)
  const comboMultiplier = 1 + Math.min(comboCount * 0.02, 2);
  const clickPower = baseClickPower * comboMultiplier;

  // Combo decay
  useEffect(() => {
    const interval = setInterval(() => {
      if (comboCount > 0 && Date.now() - lastHitTime > 1500) {
        setComboCount(0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [comboCount, lastHitTime]);

  const registerHit = () => {
    setComboCount(c => c + 1);
    setLastHitTime(Date.now());
  };

  const dealDamage = useCallback((amount: number, isPassive = false) => {
    setMonsterHealth((prev) => {
      const newHealth = prev - amount;
      if (newHealth <= 0) {
        // Monster defeated
        setStage(s => {
          const nextStage = s + 1;
          const isNextBoss = nextStage % 5 === 0;
          const nextHealth = Math.floor(100 * Math.pow(1.2, nextStage - 1)) * (isNextBoss ? 5 : 1);
          setMonsterMaxHealth(nextHealth);
          return nextStage;
        });
        
        // Rewards
        if (isBoss) {
          setGems(g => g + 2); // Bosses drop gems
          setGold((g) => g + monsterMaxHealth * 2);
        } else {
          setGold((g) => g + monsterMaxHealth * 0.5);
        }
        
        return 0;
      }
      return newHealth;
    });
    
    if (!isPassive) {
      setGold((g) => g + amount * 0.5);
    }
  }, [monsterMaxHealth, isBoss]);

  // Fix: reset monster health when stage changes (or when it hits 0)
  useEffect(() => {
    if (monsterHealth <= 0) {
      setMonsterHealth(monsterMaxHealth);
    }
  }, [monsterHealth, monsterMaxHealth]);

  // Passive damage/gold generation
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeView === 'rift' && heroes.length > 0) {
        dealDamage(passivePower, true);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [activeView, passivePower, dealDamage, heroes.length]);

  const addHero = (hero: Hero) => {
    setHeroes(prev => [...prev, hero]);
  };

  const spendGold = (amount: number) => {
    if (gold >= amount) {
      setGold(prev => prev - amount);
      return true;
    }
    return false;
  };

  const spendGems = (amount: number) => {
    if (gems >= amount) {
      setGems(prev => prev - amount);
      return true;
    }
    return false;
  };

  const upgradeHero = (heroId: string) => {
    setHeroes(prev => prev.map(hero => {
      if (hero.id === heroId) {
        const upgradeCost = hero.level * 100;
        if (gold >= upgradeCost) {
          setGold(g => g - upgradeCost);
          return { ...hero, level: hero.level + 1, power: Math.floor(hero.power * 1.5) };
        }
      }
      return hero;
    }));
  };

  return {
    gold,
    setGold,
    gems,
    setGems,
    heroes,
    addHero,
    upgradeHero,
    activeView,
    setActiveView,
    spendGold,
    spendGems,
    stage,
    isBoss,
    monsterHealth,
    monsterMaxHealth,
    clickPower,
    dealDamage,
    comboCount,
    comboMultiplier,
    registerHit,
    passivePower
  };
};
