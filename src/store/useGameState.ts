import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GAME_BALANCE,
  HERO_RARITIES,
  getBaseClickPower,
  getComboMultiplier,
  getMonsterMaxHealth,
  getNextHeroPower,
  getPassivePower,
  getUpgradeCost,
  isBossStage,
} from '../game/balance';
import type { ActiveView, Hero, HeroRarity } from '../game/types';

export type { Hero } from '../game/types';

interface GameSave {
  gold: number;
  gems: number;
  heroes: Hero[];
  stage: number;
  monsterMaxHealth: number;
  monsterHealth: number;
}

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

  const monsterMaxHealth = Math.max(1, numberOrDefault(value.monsterMaxHealth, GAME_BALANCE.baseMonsterHealth));
  const monsterHealth = Math.min(
    monsterMaxHealth,
    Math.max(0, numberOrDefault(value.monsterHealth, monsterMaxHealth)),
  );

  return {
    gold: Math.max(0, numberOrDefault(value.gold, GAME_BALANCE.initialGold)),
    gems: Math.max(0, numberOrDefault(value.gems, GAME_BALANCE.initialGems)),
    heroes: Array.isArray(value.heroes) ? value.heroes.filter(isHero) : [],
    stage: Math.max(GAME_BALANCE.initialStage, Math.floor(numberOrDefault(value.stage, GAME_BALANCE.initialStage))),
    monsterMaxHealth,
    monsterHealth,
  };
};

const loadState = (): GameSave | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const saved = localStorage.getItem(GAME_BALANCE.storageKey);
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
  const initialStage = initialState?.stage ?? GAME_BALANCE.initialStage;
  const initialMonsterMaxHealth = initialState?.monsterMaxHealth ?? getMonsterMaxHealth(initialStage);
  const initialMonsterHealth = initialState?.monsterHealth ?? initialMonsterMaxHealth;

  const [gold, setGold] = useState(initialState?.gold ?? GAME_BALANCE.initialGold);
  const [gems, setGems] = useState(initialState?.gems ?? GAME_BALANCE.initialGems);
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

  const isBoss = isBossStage(stage);

  // Auto-save
  useEffect(() => {
    const stateToSave = { gold, gems, heroes, stage, monsterMaxHealth, monsterHealth };
    try {
      localStorage.setItem(GAME_BALANCE.storageKey, JSON.stringify(stateToSave));
    } catch {
      console.error('Failed to persist save');
    }
  }, [gold, gems, heroes, stage, monsterMaxHealth, monsterHealth]);

  useEffect(() => {
    combatRef.current = { stage, monsterMaxHealth, monsterHealth };
  }, [stage, monsterMaxHealth, monsterHealth]);

  const baseClickPower = getBaseClickPower(heroes);
  const passivePower = getPassivePower(heroes);

  const comboMultiplier = getComboMultiplier(comboCount);
  const clickPower = baseClickPower * comboMultiplier;

  // Combo decay
  useEffect(() => {
    const interval = setInterval(() => {
      if (comboCount > 0 && Date.now() - lastHitTime > GAME_BALANCE.comboDecayMs) {
        setComboCount(0);
      }
    }, GAME_BALANCE.comboDecayTickMs);
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
      const nextHealth = getMonsterMaxHealth(nextStage);
      const defeatedBoss = isBossStage(currentCombat.stage);
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
        setGems(g => g + GAME_BALANCE.bossGemReward);
        setGold((g) => g + defeatedMaxHealth * GAME_BALANCE.bossGoldMultiplier);
      } else {
        setGold((g) => g + defeatedMaxHealth * GAME_BALANCE.killGoldMultiplier);
      }
    } else {
      combatRef.current = { ...currentCombat, monsterHealth: newHealth };
      setMonsterHealth(newHealth);
    }
    
    if (!isPassive) {
      setGold((g) => g + damageAmount * GAME_BALANCE.clickGoldMultiplier);
    }
  }, []);

  // Passive damage/gold generation
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeView === 'rift' && heroes.length > 0) {
        dealDamage(passivePower, true);
      }
    }, GAME_BALANCE.passiveTickMs);
    
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

    const upgradeCost = getUpgradeCost(heroToUpgrade);
    if (gold < upgradeCost) {
      return false;
    }

    setGold(currentGold => currentGold - upgradeCost);
    setHeroes(prev => prev.map(hero => {
      if (hero.id === heroId && hero.level === heroToUpgrade.level) {
        return { ...hero, level: hero.level + 1, power: getNextHeroPower(hero) };
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
