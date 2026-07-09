import { useState, useEffect, useCallback, useRef } from 'react';

type HeroRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
type ActiveView = 'rift' | 'summon' | 'roster';

export interface Hero {
  id: string;
  name: string;
  rarity: HeroRarity;
  level: number;
  power: number;
}

interface GameSave {
  gold: number;
  gems: number;
  heroes: Hero[];
  stage: number;
  monsterMaxHealth: number;
  monsterHealth: number;
}

const STORAGE_KEY = 'rift_heroes_save';
const HERO_RARITIES: HeroRarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const isHeroRarity = (value: unknown): value is HeroRarity => {
  return typeof value === 'string' && HERO_RARITIES.includes(value as HeroRarity);
};

const isHero = (value: unknown): value is Hero => {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isHeroRarity(value.rarity) &&
    isFiniteNumber(value.level) &&
    isFiniteNumber(value.power) &&
    value.level >= 1 &&
    value.power >= 0
  );
};

const numberOrDefault = (value: unknown, fallback: number) => {
  return isFiniteNumber(value) ? value : fallback;
};

const sanitizeSave = (value: unknown): GameSave | null => {
  if (!isRecord(value)) {
    return null;
  }

  const monsterMaxHealth = Math.max(1, numberOrDefault(value.monsterMaxHealth, 100));
  const monsterHealth = Math.min(
    monsterMaxHealth,
    Math.max(0, numberOrDefault(value.monsterHealth, monsterMaxHealth)),
  );

  return {
    gold: Math.max(0, numberOrDefault(value.gold, 1000)),
    gems: Math.max(0, numberOrDefault(value.gems, 50)),
    heroes: Array.isArray(value.heroes) ? value.heroes.filter(isHero) : [],
    stage: Math.max(1, Math.floor(numberOrDefault(value.stage, 1))),
    monsterMaxHealth,
    monsterHealth,
  };
};

const loadState = (): GameSave | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return sanitizeSave(JSON.parse(saved));
    }
  } catch {
    console.error('Failed to load save');
  }

  return null;
};

export const useGameState = () => {
  const initialState = loadState();
  const initialStage = initialState?.stage ?? 1;
  const initialMonsterMaxHealth = initialState?.monsterMaxHealth ?? 100;
  const initialMonsterHealth = initialState?.monsterHealth ?? 100;

  const [gold, setGold] = useState(initialState?.gold ?? 1000);
  const [gems, setGems] = useState(initialState?.gems ?? 50);
  const [heroes, setHeroes] = useState<Hero[]>(initialState?.heroes ?? []);
  const [activeView, setActiveView] = useState<ActiveView>('rift');

  const [stage, setStage] = useState(initialStage);
  const [monsterMaxHealth, setMonsterMaxHealth] = useState(initialMonsterMaxHealth);
  const [monsterHealth, setMonsterHealth] = useState(initialMonsterHealth);
  const combatRef = useRef({
    stage: initialStage,
    monsterMaxHealth: initialMonsterMaxHealth,
    monsterHealth: initialMonsterHealth,
  });

  // Combo system
  const [comboCount, setComboCount] = useState(0);
  const [lastHitTime, setLastHitTime] = useState(0);

  const isBoss = stage % 5 === 0;

  // Auto-save
  useEffect(() => {
    const stateToSave = { gold, gems, heroes, stage, monsterMaxHealth, monsterHealth };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch {
      console.error('Failed to persist save');
    }
  }, [gold, gems, heroes, stage, monsterMaxHealth, monsterHealth]);

  useEffect(() => {
    combatRef.current = { stage, monsterMaxHealth, monsterHealth };
  }, [stage, monsterMaxHealth, monsterHealth]);

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
    const damageAmount = Math.max(0, amount);
    if (damageAmount <= 0) {
      return;
    }

    const currentCombat = combatRef.current;
    if (currentCombat.monsterHealth <= 0) {
      return;
    }

    const newHealth = currentCombat.monsterHealth - damageAmount;
    if (newHealth <= 0) {
      const nextStage = currentCombat.stage + 1;
      const isNextBoss = nextStage % 5 === 0;
      const nextHealth = Math.floor(100 * Math.pow(1.2, nextStage - 1)) * (isNextBoss ? 5 : 1);
      const defeatedBoss = currentCombat.stage % 5 === 0;
      const defeatedMaxHealth = currentCombat.monsterMaxHealth;

      combatRef.current = {
        stage: nextStage,
        monsterMaxHealth: nextHealth,
        monsterHealth: nextHealth,
      };

      setStage(nextStage);
      setMonsterMaxHealth(nextHealth);
      setMonsterHealth(nextHealth);

      if (defeatedBoss) {
        setGems(g => g + 2);
        setGold((g) => g + defeatedMaxHealth * 2);
      } else {
        setGold((g) => g + defeatedMaxHealth * 0.5);
      }
    } else {
      combatRef.current = { ...currentCombat, monsterHealth: newHealth };
      setMonsterHealth(newHealth);
    }
    
    if (!isPassive) {
      setGold((g) => g + damageAmount * 0.5);
    }
  }, []);

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
    const heroToUpgrade = heroes.find(hero => hero.id === heroId);
    if (!heroToUpgrade) {
      return false;
    }

    const upgradeCost = heroToUpgrade.level * 100;
    if (gold < upgradeCost) {
      return false;
    }

    setGold(currentGold => currentGold - upgradeCost);
    setHeroes(prev => prev.map(hero => {
      if (hero.id === heroId && hero.level === heroToUpgrade.level) {
        return { ...hero, level: hero.level + 1, power: Math.floor(hero.power * 1.5) };
      }
      return hero;
    }));

    return true;
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
