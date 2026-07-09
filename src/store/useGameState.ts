import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export type BackendStatus = 'local' | 'loading' | 'synced' | 'error';

const DEV_PLAYER_STORAGE_KEY = 'void_saga_dev_player_id';
const LOCAL_SAVE_DEBOUNCE_MS = 250;

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

  try {
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
  } catch {
    const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    return `dev:ephemeral:${randomPart}`;
  }
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
  const apiEnabled = isGameApiEnabled();
  const [snapshot, setSnapshot] = useState<GameSnapshot>(loadLocalSnapshot);
  const [activeView, setActiveView] = useState<ActiveView>('rift');
  const [comboCount, setComboCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(apiEnabled ? 'loading' : 'local');
  const playerIdRef = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  const actionQueueRef = useRef(Promise.resolve());
  const offlineClaimRequestedRef = useRef(false);
  const pendingLocalSnapshotRef = useRef<GameSnapshot | null>(null);
  const localSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerId = playerIdRef.current ?? getOrCreateDevPlayerId();
  playerIdRef.current = playerId;

  const flushLocalSnapshot = useCallback(() => {
    if (localSaveTimeoutRef.current) {
      clearTimeout(localSaveTimeoutRef.current);
      localSaveTimeoutRef.current = null;
    }

    const pendingSnapshot = pendingLocalSnapshotRef.current;
    if (!pendingSnapshot) {
      return;
    }

    pendingLocalSnapshotRef.current = null;
    persistLocalSnapshot(pendingSnapshot);
  }, []);

  const scheduleLocalSnapshot = useCallback((nextSnapshot: GameSnapshot) => {
    pendingLocalSnapshotRef.current = nextSnapshot;
    if (localSaveTimeoutRef.current) {
      return;
    }

    localSaveTimeoutRef.current = setTimeout(flushLocalSnapshot, LOCAL_SAVE_DEBOUNCE_MS);
  }, [flushLocalSnapshot]);

  const applySnapshot = useCallback((nextSnapshot: GameSnapshot) => {
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    scheduleLocalSnapshot(nextSnapshot);
  }, [scheduleLocalSnapshot]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        flushLocalSnapshot();
      }
    };

    window.addEventListener('pagehide', flushLocalSnapshot);
    document.addEventListener('visibilitychange', flushWhenHidden);

    return () => {
      window.removeEventListener('pagehide', flushLocalSnapshot);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      flushLocalSnapshot();
    };
  }, [flushLocalSnapshot]);

  useEffect(() => {
    if (!apiEnabled) {
      return;
    }

    let isCancelled = false;
    setBackendStatus('loading');

    fetchGameState(playerId)
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
  }, [apiEnabled, applySnapshot, playerId]);

  const runGameAction = useCallback((action: GameAction) => {
    if (!apiEnabled) {
      const result = applyGameAction(snapshotRef.current, action);
      applySnapshot(result.snapshot);
      return Promise.resolve(result.events);
    }

    const nextAction = actionQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await postGameAction(playerId, action);
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
  }, [apiEnabled, applySnapshot, playerId]);

  useEffect(() => {
    if ((apiEnabled && backendStatus !== 'synced') || offlineClaimRequestedRef.current) {
      return;
    }

    offlineClaimRequestedRef.current = true;
    void runGameAction({ type: 'claim_offline_rewards' });
  }, [apiEnabled, backendStatus, runGameAction]);

  useEffect(() => {
    const claimAfterResume = () => {
      if (document.visibilityState === 'visible' && offlineClaimRequestedRef.current) {
        void runGameAction({ type: 'claim_offline_rewards' });
      }
    };

    document.addEventListener('visibilitychange', claimAfterResume);
    return () => document.removeEventListener('visibilitychange', claimAfterResume);
  }, [runGameAction]);

  const isBoss = isBossStage(snapshot.stage);
  const baseClickPower = useMemo(() => getBaseClickPower(snapshot.heroes), [snapshot.heroes]);
  const passivePower = useMemo(() => getPassivePower(snapshot.heroes), [snapshot.heroes]);
  const comboMultiplier = getComboMultiplier(comboCount);
  const clickPower = baseClickPower * comboMultiplier;

  const registerHit = useCallback(() => {
    setComboCount(c => c + 1);
    if (comboResetTimeoutRef.current) {
      clearTimeout(comboResetTimeoutRef.current);
    }
    comboResetTimeoutRef.current = setTimeout(() => {
      comboResetTimeoutRef.current = null;
      setComboCount(0);
    }, GAME_BALANCE.comboDecayMs);
  }, []);

  useEffect(() => {
    return () => {
      if (comboResetTimeoutRef.current) {
        clearTimeout(comboResetTimeoutRef.current);
      }
    };
  }, []);

  const dealDamage = useCallback((amount: number, isPassive = false) => {
    return runGameAction({
      type: 'deal_damage',
      amount: Math.max(0, amount),
      source: isPassive ? 'passive' : 'tap',
    });
  }, [runGameAction]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && activeView === 'rift' && snapshot.heroes.length > 0) {
        void dealDamage(passivePower, true);
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
    playerId,
  };
};
