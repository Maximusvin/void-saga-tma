import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  appendActionOutbox,
  loadActionOutbox,
  removeActionOutbox,
  type PendingGameCommand,
} from '../api/actionOutbox';
import { createGameCommandId, fetchGameState, isGameApiEnabled, postGameAction } from '../api/gameApi';
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
const TAP_BATCH_MAX_SIZE = 20;
const TAP_BATCH_WINDOW_MS = 80;

interface PendingTap {
  resolve: (events: GameEvent[]) => void;
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
    comboCount: Math.max(0, Math.floor(numberOrDefault(value.comboCount, 0))),
    comboExpiresAt: typeof value.comboExpiresAt === 'string' ? value.comboExpiresAt : null,
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

const getActiveComboCount = (snapshot: GameSnapshot) => {
  const expiresAt = snapshot.comboExpiresAt ? Date.parse(snapshot.comboExpiresAt) : 0;
  return Number.isFinite(expiresAt) && expiresAt > Date.now() ? snapshot.comboCount : 0;
};

const splitTapEvents = (events: GameEvent[], tapCount: number) => {
  const groups = Array.from({ length: tapCount }, () => [] as GameEvent[]);
  let tapIndex = -1;

  for (const event of events) {
    if (event.type === 'monster_hit' && event.source === 'tap') {
      tapIndex += 1;
    }

    if (tapIndex >= 0 && tapIndex < groups.length) {
      groups[tapIndex].push(event);
    } else if (event.type === 'action_rejected') {
      groups.forEach(group => group.push(event));
    }
  }

  return groups;
};

export const useGameState = () => {
  const apiEnabled = isGameApiEnabled();
  const [snapshot, setSnapshot] = useState<GameSnapshot>(loadLocalSnapshot);
  const [activeView, setActiveView] = useState<ActiveView>('rift');
  const [comboCount, setComboCount] = useState(() => getActiveComboCount(snapshot));
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(apiEnabled ? 'loading' : 'local');
  const playerIdRef = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  const actionQueueRef = useRef(Promise.resolve());
  const offlineClaimRequestedRef = useRef(false);
  const pendingLocalSnapshotRef = useRef<GameSnapshot | null>(null);
  const localSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTapsRef = useRef<PendingTap[]>([]);
  const tapBatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const executePendingCommand = useCallback(async (command: PendingGameCommand) => {
    const response = await postGameAction(playerId, command.commandId, command.action);
    applySnapshot(requireSnapshot(response.snapshot));
    removeActionOutbox(playerId, command.commandId);
    return response.events;
  }, [applySnapshot, playerId]);

  const replayActionOutbox = useCallback(async (targetCommandId?: string) => {
    let targetEvents: GameEvent[] = [];

    for (const command of loadActionOutbox(playerId)) {
      const events = await executePendingCommand(command);
      if (command.commandId === targetCommandId) {
        targetEvents = events;
      }
    }

    return targetEvents;
  }, [executePendingCommand, playerId]);

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

    const bootstrap = fetchGameState(playerId)
      .then(async response => {
        if (isCancelled) {
          return;
        }

        applySnapshot(requireSnapshot(response.snapshot));
        await replayActionOutbox();
        if (isCancelled) {
          return;
        }
        setBackendStatus('synced');
      })
      .catch(error => {
        console.error(error);
        if (!isCancelled) {
          setBackendStatus('error');
        }
      });
    actionQueueRef.current = bootstrap.then(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [apiEnabled, applySnapshot, playerId, replayActionOutbox]);

  const runGameAction = useCallback((action: GameAction) => {
    if (!apiEnabled) {
      const result = applyGameAction(snapshotRef.current, action);
      applySnapshot(result.snapshot);
      return Promise.resolve(result.events);
    }

    const command: PendingGameCommand = {
      action,
      commandId: createGameCommandId(),
    };

    try {
      appendActionOutbox(playerId, command);
    } catch (error) {
      console.error(error);
      setBackendStatus('error');
      return Promise.resolve([] as GameEvent[]);
    }

    const nextAction = actionQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const events = await replayActionOutbox(command.commandId);
        setBackendStatus('synced');
        return events;
      })
      .catch(error => {
        console.error(error);
        setBackendStatus('error');
        return [] as GameEvent[];
      });

    actionQueueRef.current = nextAction.then(() => undefined);
    return nextAction;
  }, [apiEnabled, applySnapshot, playerId, replayActionOutbox]);

  useEffect(() => {
    if (!apiEnabled) {
      return;
    }

    const retryPendingCommands = () => {
      const retry = actionQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await replayActionOutbox();
          setBackendStatus('synced');
        })
        .catch(error => {
          console.error(error);
          setBackendStatus('error');
        });
      actionQueueRef.current = retry.then(() => undefined);
    };

    window.addEventListener('online', retryPendingCommands);
    return () => window.removeEventListener('online', retryPendingCommands);
  }, [apiEnabled, replayActionOutbox]);

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

  const flushTapBatch = useCallback(() => {
    if (tapBatchTimeoutRef.current) {
      clearTimeout(tapBatchTimeoutRef.current);
      tapBatchTimeoutRef.current = null;
    }

    const taps = pendingTapsRef.current.splice(0, TAP_BATCH_MAX_SIZE);
    if (taps.length === 0) {
      return;
    }

    void runGameAction({
      type: 'combat_batch',
      tapCount: taps.length,
      passiveTicks: 0,
    }).then(events => {
      const groupedEvents = splitTapEvents(events, taps.length);
      taps.forEach((tap, index) => tap.resolve(groupedEvents[index] ?? []));
    });

    if (pendingTapsRef.current.length > 0) {
      tapBatchTimeoutRef.current = setTimeout(() => flushTapBatch(), TAP_BATCH_WINDOW_MS);
    }
  }, [runGameAction]);

  const dealDamage = useCallback(() => {
    return new Promise<GameEvent[]>(resolve => {
      pendingTapsRef.current.push({ resolve });

      if (pendingTapsRef.current.length >= TAP_BATCH_MAX_SIZE) {
        queueMicrotask(flushTapBatch);
        return;
      }

      if (!tapBatchTimeoutRef.current) {
        tapBatchTimeoutRef.current = setTimeout(flushTapBatch, TAP_BATCH_WINDOW_MS);
      }
    });
  }, [flushTapBatch]);

  useEffect(() => {
    const flushPendingTaps = () => flushTapBatch();
    window.addEventListener('pagehide', flushPendingTaps);

    return () => {
      window.removeEventListener('pagehide', flushPendingTaps);
      flushTapBatch();
    };
  }, [flushTapBatch]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && activeView === 'rift' && snapshot.heroes.length > 0) {
        void runGameAction({ type: 'combat_batch', tapCount: 0, passiveTicks: 1 });
      }
    }, GAME_BALANCE.passiveTickMs);
    
    return () => clearInterval(interval);
  }, [activeView, passivePower, runGameAction, snapshot.heroes.length]);

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
