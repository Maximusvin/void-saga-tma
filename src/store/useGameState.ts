import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGameState, isGameApiEnabled, postGameAction } from '../api/gameApi';
import {
  GAME_BALANCE,
  HERO_RARITIES,
  getBaseClickPower,
  getComboMultiplier,
  getMonsterMaxHealth,
  getPassivePower,
  getUpgradeCost,
  isBossStage,
} from '../game/balance';
import { applyGameAction, createInitialGameSnapshot } from '../game/engine';
import type { ActiveView, GameAction, GameEvent, GameSnapshot, Hero, HeroRarity } from '../game/types';
import { getTelegramPlayerId } from '../utils/telegram';

export type { Hero } from '../game/types';

type BackendStatus = 'local' | 'loading' | 'synced' | 'error';

const DEV_PLAYER_STORAGE_KEY = 'void_saga_dev_player_id';

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

const sanitizeSnapshot = (value: unknown): GameSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const stage = Math.max(GAME_BALANCE.initialStage, Math.floor(numberOrDefault(value.stage, GAME_BALANCE.initialStage)));
  const monsterMaxHealth = Math.max(1, numberOrDefault(value.monsterMaxHealth, getMonsterMaxHealth(stage)));
  const monsterHealth = Math.min(
    monsterMaxHealth,
    Math.max(0, numberOrDefault(value.monsterHealth, monsterMaxHealth)),
  );

  return {
    gold: Math.max(0, numberOrDefault(value.gold, GAME_BALANCE.initialGold)),
    gems: Math.max(0, numberOrDefault(value.gems, GAME_BALANCE.initialGems)),
    heroes: Array.isArray(value.heroes) ? value.heroes.filter(isHero) : [],
    stage,
    monsterMaxHealth,
    monsterHealth,
    lastSeenAt: typeof value.lastSeenAt === 'string'
      ? value.lastSeenAt
      : (typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
};

const loadLocalSnapshot = (): GameSnapshot => {
  if (typeof window === 'undefined') {
    return createInitialGameSnapshot();
  }

  try {
    const saved = localStorage.getItem(GAME_BALANCE.storageKey);
    if (saved) {
      return sanitizeSnapshot(JSON.parse(saved)) ?? createInitialGameSnapshot();
    }
  } catch {
    console.error('Failed to load save');
  }

  return createInitialGameSnapshot();
};

const persistLocalSnapshot = (snapshot: GameSnapshot) => {
  try {
    localStorage.setItem(GAME_BALANCE.storageKey, JSON.stringify(snapshot));
  } catch {
    console.error('Failed to persist save');
  }
};

const getOrCreateDevPlayerId = () => {
  if (typeof window === 'undefined') {
    return 'dev:server';
  }

  const configuredPlayerId = import.meta.env.VITE_PLAYER_ID?.trim();
  if (configuredPlayerId) {
    return configuredPlayerId;
  }

  const telegramPlayerId = getTelegramPlayerId();
  if (telegramPlayerId) {
    return telegramPlayerId;
  }

  const existingPlayerId = localStorage.getItem(DEV_PLAYER_STORAGE_KEY);
  if (existingPlayerId) {
    return existingPlayerId;
  }

  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  const playerId = `dev:${randomPart}`;
  localStorage.setItem(DEV_PLAYER_STORAGE_KEY, playerId);
  return playerId;
};

const requireSnapshot = (value: unknown) => {
  const snapshot = sanitizeSnapshot(value);
  if (!snapshot) {
    throw new Error('Game API returned an invalid snapshot');
  }

  return snapshot;
};

const getSummonedHero = (events: GameEvent[]) => {
  return events.find((event): event is Extract<GameEvent, { type: 'hero_summoned' }> => event.type === 'hero_summoned')?.hero ?? null;
};

export const useGameState = () => {
  const initialSnapshot = loadLocalSnapshot();
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [activeView, setActiveView] = useState<ActiveView>('rift');
  const [comboCount, setComboCount] = useState(0);
  const [lastHitTime, setLastHitTime] = useState(0);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(isGameApiEnabled() ? 'loading' : 'local');
  const playerIdRef = useRef(getOrCreateDevPlayerId());
  const snapshotRef = useRef(initialSnapshot);
  const actionQueueRef = useRef(Promise.resolve());
  const offlineClaimRequestedRef = useRef(false);

  const applySnapshot = useCallback((nextSnapshot: GameSnapshot) => {
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    persistLocalSnapshot(nextSnapshot);
  }, []);

  useEffect(() => {
    if (!isGameApiEnabled()) {
      return;
    }

    let isCancelled = false;
    setBackendStatus('loading');

    fetchGameState(playerIdRef.current)
      .then(response => {
        if (isCancelled) {
          return;
        }

        applySnapshot(requireSnapshot(response.snapshot));
        setBackendStatus('synced');
      })
      .catch(error => {
        console.error(error);
        if (!isCancelled) {
          setBackendStatus('error');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [applySnapshot]);

  const runGameAction = useCallback((action: GameAction) => {
    if (!isGameApiEnabled()) {
      const result = applyGameAction(snapshotRef.current, action);
      applySnapshot(result.snapshot);
      return Promise.resolve(result.events);
    }

    const nextAction = actionQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await postGameAction(playerIdRef.current, action);
        applySnapshot(requireSnapshot(response.snapshot));
        setBackendStatus('synced');
        return response.events;
      })
      .catch(error => {
        console.error(error);
        setBackendStatus('error');
        return [] as GameEvent[];
      });

    actionQueueRef.current = nextAction.then(() => undefined);
    return nextAction;
  }, [applySnapshot]);

  useEffect(() => {
    if (!isGameApiEnabled() || backendStatus !== 'synced' || offlineClaimRequestedRef.current) {
      return;
    }

    offlineClaimRequestedRef.current = true;
    void runGameAction({ type: 'claim_offline_rewards' });
  }, [backendStatus, runGameAction]);

  const isBoss = isBossStage(snapshot.stage);
  const baseClickPower = getBaseClickPower(snapshot.heroes);
  const passivePower = getPassivePower(snapshot.heroes);
  const comboMultiplier = getComboMultiplier(comboCount);
  const clickPower = baseClickPower * comboMultiplier;

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
    return runGameAction({
      type: 'deal_damage',
      amount: Math.max(0, amount),
      source: isPassive ? 'passive' : 'tap',
    });
  }, [runGameAction]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeView === 'rift' && snapshot.heroes.length > 0) {
        dealDamage(passivePower, true);
      }
    }, GAME_BALANCE.passiveTickMs);
    
    return () => clearInterval(interval);
  }, [activeView, passivePower, dealDamage, snapshot.heroes.length]);

  const summonHero = useCallback(async () => {
    if (snapshotRef.current.gems < GAME_BALANCE.summonCostGems) {
      return null;
    }

    const events = await runGameAction({ type: 'summon' });
    return getSummonedHero(events);
  }, [runGameAction]);

  const upgradeHero = (heroId: string) => {
    const heroToUpgrade = snapshot.heroes.find(hero => hero.id === heroId);
    if (!heroToUpgrade || snapshot.gold < getUpgradeCost(heroToUpgrade)) {
      return false;
    }

    void runGameAction({ type: 'upgrade_hero', heroId });
    return true;
  };

  return {
    gold: snapshot.gold,
    gems: snapshot.gems,
    heroes: snapshot.heroes,
    upgradeHero,
    summonHero,
    activeView,
    setActiveView,
    stage: snapshot.stage,
    isBoss,
    monsterHealth: snapshot.monsterHealth,
    monsterMaxHealth: snapshot.monsterMaxHealth,
    clickPower,
    dealDamage,
    comboCount,
    comboMultiplier,
    registerHit,
    passivePower,
    backendStatus,
    playerId: playerIdRef.current,
  };
};
