import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  appendActionOutbox,
  loadActionOutbox,
  removeActionOutbox,
  type PendingGameCommand,
} from '../api/actionOutbox';
import {
  canDispatchAutomaticGameActions,
  type AutomaticActionBackendStatus,
} from '../api/automaticActionPolicy';
import {
  createGameCommandId,
  fetchGameState,
  fetchRealmLeaderboard,
  fetchRealmDirectory,
  isGameApiEnabled,
  joinRealm,
  postGameAction,
  selectRealmCharacter,
  type PlayerStateResponse,
} from '../api/gameApi';
import {
  GAME_BALANCE,
  getAscensionShardCost,
  getBaseClickPower,
  getComboMultiplier,
  getHeroLevelCap,
  getHeroUpgradeQuote,
  getPassivePower,
  isHeroAtLevelCap,
  isBossStage,
} from '../game/balance';
import { applyGameAction, createInitialGameSnapshot } from '../game/engine';
import { summarizeOfflineReward, type OfflineRewardSummary } from '../game/offlineReward';
import { ZERO_GAME_NUMBER, multiplyGameNumbers, type GameNumber } from '../game/gameNumber';
import { normalizeGameSnapshot } from '../game/snapshot';
import type {
  ActiveView,
  GameAction,
  GameEvent,
  GameSnapshot,
  HeroDamageContribution,
  HeroUpgradeAmount,
} from '../game/types';
import { MAX_ACTIVE_WARBAND_HEROES, getActiveWarbandHeroes } from '../game/warband';
import {
  getLeagueDivision,
  normalizeRealmLeaderboard,
  type RealmLeaderboard,
} from '../shared/leaderboard';
import {
  DEFAULT_PLAYER_PROFILE,
  normalizePlayerProfile,
  type PlayerProfile,
} from '../shared/playerProfile';
import {
  normalizeRealmContext,
  normalizeRealmDirectory,
  type RealmContext,
  type RealmDirectory,
  type RealmSummary,
} from '../shared/realm';
import { getLocalPlayerProfilePreview, getTelegramPlayerId } from '../utils/telegram';

export type { Hero } from '../game/types';

export type BackendStatus = AutomaticActionBackendStatus;
export type LeaderboardStatus = 'idle' | 'loading' | 'ready' | 'error';

const DEV_PLAYER_STORAGE_KEY = 'void_saga_dev_player_id';
const LOCAL_SAVE_DEBOUNCE_MS = 250;
const TAP_BATCH_MAX_SIZE = 20;
const TAP_BATCH_WINDOW_MS = 80;
// Idle ticks accrue locally and ship as one batch, so watching the rift costs a
// request every few seconds instead of one every second. The server still pays
// exactly one tick per elapsed second, so nothing is gained by flushing sooner.
const PASSIVE_FLUSH_TICKS = 5;

interface CombatFeedbackOptions {
  passiveVolley?: boolean;
}

const LOCAL_REALM_CONTEXT: RealmContext = {
  canonicalRealmCode: 'S-1',
  canonicalRealmId: 'realm:local:1',
  characterId: 'character:local:1',
  originRealmCode: 'S-1',
  originRealmId: 'realm:local:1',
};

const LOCAL_REALM_DIRECTORY: RealmDirectory = {
  activeCharacterId: LOCAL_REALM_CONTEXT.characterId,
  realms: [{
    canonicalRealmCode: 'S-1',
    canonicalRealmId: LOCAL_REALM_CONTEXT.canonicalRealmId,
    characterId: LOCAL_REALM_CONTEXT.characterId,
    code: 'S-1',
    hardCapacity: 1,
    id: LOCAL_REALM_CONTEXT.originRealmId,
    isRecommended: true,
    kind: 'standard',
    openedAt: '2026-07-10T00:00:00.000Z',
    population: 1,
    softCapacity: 1,
    status: 'open',
  }],
  recommendedRealmId: LOCAL_REALM_CONTEXT.originRealmId,
};

const createLocalLeaderboard = (
  snapshot: GameSnapshot,
  playerProfile: PlayerProfile,
  realm: RealmContext,
): RealmLeaderboard => {
  const passivePower = getPassivePower(getActiveWarbandHeroes(snapshot));
  const currentPlayer = {
    displayName: playerProfile.displayName,
    division: getLeagueDivision(snapshot.stage),
    enemyIndex: snapshot.enemyIndex,
    isCurrentPlayer: true,
    passivePower,
    photoUrl: playerProfile.photoUrl,
    rank: 1,
    stage: snapshot.stage,
  } as const;

  return {
    currentPlayer,
    generatedAt: new Date().toISOString(),
    realmCode: realm.canonicalRealmCode,
    top: [currentPlayer],
    totalPlayers: 1,
  };
};

interface PendingTap {
  resolve: (events: GameEvent[]) => void;
}

interface PassiveVolleyFeedback {
  damage: GameNumber;
  heroContributions: HeroDamageContribution[];
  signal: number;
}

const loadLocalSnapshot = (): GameSnapshot => {
  if (typeof window === 'undefined') {
    return createInitialGameSnapshot();
  }

  try {
    const saved = localStorage.getItem(GAME_BALANCE.storageKey);
    if (saved) {
      return normalizeGameSnapshot(JSON.parse(saved)) ?? createInitialGameSnapshot();
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
  const snapshot = normalizeGameSnapshot(value);
  if (!snapshot) {
    throw new Error('Game API returned an invalid snapshot');
  }

  return snapshot;
};

const requireRealmContext = (value: unknown) => {
  const realm = normalizeRealmContext(value);
  if (!realm) {
    throw new Error('Game API returned an invalid realm context');
  }
  return realm;
};

const requireRealmDirectory = (value: unknown) => {
  const directory = normalizeRealmDirectory(value);
  if (!directory) {
    throw new Error('Game API returned an invalid realm directory');
  }
  return directory;
};

const getSummonEvent = (events: GameEvent[]) => {
  return events.find((event): event is Extract<GameEvent, { type: 'hero_summoned' }> => (
    event.type === 'hero_summoned'
  )) ?? null;
};

const getActiveComboCount = (snapshot: GameSnapshot) => {
  const expiresAt = snapshot.comboExpiresAt ? Date.parse(snapshot.comboExpiresAt) : 0;
  return Number.isFinite(expiresAt) && expiresAt > Date.now() ? snapshot.comboCount : 0;
};

const splitTapEvents = (events: GameEvent[], tapCount: number) => {
  const groups = Array.from({ length: tapCount }, () => [] as GameEvent[]);
  const leadingEvents: GameEvent[] = [];
  let tapIndex = -1;

  for (const event of events) {
    if (event.type === 'monster_hit' && event.source === 'tap') {
      tapIndex += 1;
      if (tapIndex === 0 && leadingEvents.length > 0) {
        groups[0].push(...leadingEvents);
        leadingEvents.length = 0;
      }
    }

    if (tapIndex >= 0 && tapIndex < groups.length) {
      groups[tapIndex].push(event);
    } else if (event.type === 'action_rejected') {
      groups.forEach(group => group.push(event));
    } else {
      leadingEvents.push(event);
    }
  }

  if (leadingEvents.length > 0 && groups.length > 0) {
    groups[0].push(...leadingEvents);
  }

  return groups;
};

export const useGameState = () => {
  const apiEnabled = isGameApiEnabled();
  const [snapshot, setSnapshot] = useState<GameSnapshot>(loadLocalSnapshot);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(() => (
    apiEnabled ? DEFAULT_PLAYER_PROFILE : getLocalPlayerProfilePreview()
  ));
  const [activeView, setActiveView] = useState<ActiveView>('rift');
  const [comboCount, setComboCount] = useState(() => getActiveComboCount(snapshot));
  const [backendStatus, setBackendStatus] = useState<BackendStatus>(apiEnabled ? 'loading' : 'local');
  const [realmContext, setRealmContext] = useState<RealmContext>(LOCAL_REALM_CONTEXT);
  const [realmDirectory, setRealmDirectory] = useState<RealmDirectory>(LOCAL_REALM_DIRECTORY);
  const [realmSwitching, setRealmSwitching] = useState(false);
  const [leaderboard, setLeaderboard] = useState<RealmLeaderboard | null>(null);
  const [leaderboardStatus, setLeaderboardStatus] = useState<LeaderboardStatus>('idle');
  const [bossEnrageSignal, setBossEnrageSignal] = useState(0);
  const [offlineReward, setOfflineReward] = useState<OfflineRewardSummary | null>(null);
  const [passiveVolleyFeedback, setPassiveVolleyFeedback] = useState<PassiveVolleyFeedback>({
    damage: ZERO_GAME_NUMBER,
    heroContributions: [],
    signal: 0,
  });
  const automaticActionsEnabled = canDispatchAutomaticGameActions(apiEnabled, backendStatus);
  const playerIdRef = useRef<string | null>(null);
  const realmContextRef = useRef(realmContext);
  const snapshotRef = useRef(snapshot);
  const actionQueueRef = useRef(Promise.resolve());
  const offlineClaimRequestedRef = useRef(false);
  const pendingLocalSnapshotRef = useRef<GameSnapshot | null>(null);
  const localSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTapsRef = useRef<PendingTap[]>([]);
  // Ticks predicted locally but not yet acknowledged by the server. Losing these
  // costs nothing: the server's watermark still owes them on the next batch.
  const pendingPassiveTicksRef = useRef(0);
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

  const applyPlayerProfile = useCallback((value: unknown) => {
    const profile = normalizePlayerProfile(value);
    if (profile) {
      setPlayerProfile(profile);
    }
  }, []);

  const applyServerState = useCallback((response: PlayerStateResponse) => {
    applySnapshot(requireSnapshot(response.snapshot));
    applyPlayerProfile(response.playerProfile);
    const nextRealm = requireRealmContext(response.realm);
    if (nextRealm.characterId !== response.characterId) {
      throw new Error('Game API returned a mismatched character context');
    }
    realmContextRef.current = nextRealm;
    setRealmContext(nextRealm);
  }, [applyPlayerProfile, applySnapshot]);

  const executePendingCommand = useCallback(async (
    characterId: string,
    command: PendingGameCommand,
  ) => {
    const response = await postGameAction(
      playerId,
      characterId,
      command.commandId,
      command.action,
    );
    if (response.characterId !== characterId) {
      throw new Error('Game API applied a command to the wrong character');
    }
    applyServerState(response);
    removeActionOutbox(characterId, command.commandId);
    return response.events;
  }, [applyServerState, playerId]);

  const replayActionOutbox = useCallback(async (characterId: string, targetCommandId?: string) => {
    let targetEvents: GameEvent[] = [];

    for (const command of loadActionOutbox(characterId)) {
      const events = await executePendingCommand(characterId, command);
      if (command.commandId === targetCommandId) {
        targetEvents = events;
      }
    }

    return targetEvents;
  }, [executePendingCommand]);

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

        const initialRealm = requireRealmContext(response.realm);
        applyServerState(response);
        await replayActionOutbox(initialRealm.characterId);
        const directory = requireRealmDirectory(await fetchRealmDirectory(playerId));
        if (isCancelled) {
          return;
        }
        setRealmDirectory(directory);
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
  }, [apiEnabled, applyServerState, playerId, replayActionOutbox]);

  const publishCombatFeedback = useCallback((events: GameEvent[], options: CombatFeedbackOptions = {}) => {
    if (events.some(event => event.type === 'boss_enraged')) {
      setBossEnrageSignal(current => current + 1);
    }

    // A batched flush replays idle ticks the predicted volley already showed.
    // Animating them twice would double every hero's attack.
    if (options.passiveVolley === false) {
      return events;
    }

    const passiveHit = events.find(event => event.type === 'monster_hit' && event.source === 'passive');
    if (passiveHit?.type === 'monster_hit') {
      setPassiveVolleyFeedback(current => ({
        damage: passiveHit.damage,
        heroContributions: passiveHit.heroContributions,
        signal: current.signal + 1,
      }));
    }

    return events;
  }, []);

  const runGameAction = useCallback((action: GameAction, feedbackOptions: CombatFeedbackOptions = {}) => {
    if (!apiEnabled) {
      const result = applyGameAction(snapshotRef.current, action);
      applySnapshot(result.snapshot);
      return Promise.resolve(publishCombatFeedback(result.events, feedbackOptions));
    }

    if (backendStatus !== 'synced' || realmSwitching) {
      return Promise.resolve([] as GameEvent[]);
    }

    const characterId = realmContextRef.current.characterId;

    const command: PendingGameCommand = {
      action,
      commandId: createGameCommandId(),
    };

    try {
      appendActionOutbox(characterId, command);
    } catch (error) {
      console.error(error);
      setBackendStatus('error');
      return Promise.resolve([] as GameEvent[]);
    }

    const nextAction = actionQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const events = await replayActionOutbox(characterId, command.commandId);
        setBackendStatus('synced');
        return publishCombatFeedback(events, feedbackOptions);
      })
      .catch(error => {
        console.error(error);
        setBackendStatus('error');
        return [] as GameEvent[];
      });

    actionQueueRef.current = nextAction.then(() => undefined);
    return nextAction;
  }, [apiEnabled, applySnapshot, backendStatus, publishCombatFeedback, realmSwitching, replayActionOutbox]);

  useEffect(() => {
    if (!apiEnabled) {
      return;
    }

    const retryPendingCommands = () => {
      const retry = actionQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await replayActionOutbox(realmContextRef.current.characterId);
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

  const refreshRealmDirectory = useCallback(async () => {
    if (!apiEnabled) {
      return LOCAL_REALM_DIRECTORY;
    }
    try {
      const directory = requireRealmDirectory(await fetchRealmDirectory(playerId));
      setRealmDirectory(directory);
      return directory;
    } catch (error) {
      console.error(error);
      return null;
    }
  }, [apiEnabled, playerId]);

  const refreshLeaderboard = useCallback(async () => {
    if (!apiEnabled) {
      const localLeaderboard = createLocalLeaderboard(
        snapshotRef.current,
        playerProfile,
        realmContextRef.current,
      );
      setLeaderboard(localLeaderboard);
      setLeaderboardStatus('ready');
      return localLeaderboard;
    }
    if (backendStatus !== 'synced' || realmSwitching) {
      return null;
    }

    const requestedCharacterId = realmContextRef.current.characterId;
    setLeaderboardStatus('loading');
    try {
      const response = normalizeRealmLeaderboard(
        await fetchRealmLeaderboard(playerId, requestedCharacterId),
      );
      if (!response) {
        throw new Error('Game API returned an invalid leaderboard');
      }
      if (realmContextRef.current.characterId !== requestedCharacterId) {
        return null;
      }
      setLeaderboard(response);
      setLeaderboardStatus('ready');
      return response;
    } catch (error) {
      console.error(error);
      if (realmContextRef.current.characterId === requestedCharacterId) {
        setLeaderboardStatus('error');
      }
      return null;
    }
  }, [apiEnabled, backendStatus, playerId, playerProfile, realmSwitching]);

  useEffect(() => {
    if (activeView === 'leagues') {
      void refreshLeaderboard();
    }
  }, [activeView, refreshLeaderboard]);

  const switchRealm = useCallback(async (targetRealm: RealmSummary) => {
    if (!apiEnabled || backendStatus !== 'synced' || realmSwitching) {
      return false;
    }
    if (targetRealm.characterId === realmContextRef.current.characterId) {
      return true;
    }

    setRealmSwitching(true);
    setBackendStatus('loading');
    const switchOperation = actionQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const mutation = targetRealm.characterId
          ? await selectRealmCharacter(playerId, targetRealm.characterId)
          : await joinRealm(playerId, targetRealm.id);
        const selectedRealm = requireRealmContext(mutation.realm);
        setLeaderboard(null);
        setLeaderboardStatus('idle');
        const response = await fetchGameState(playerId, selectedRealm.characterId);
        applyServerState(response);
        await replayActionOutbox(selectedRealm.characterId);
        setComboCount(0);
        setPassiveVolleyFeedback({
          damage: ZERO_GAME_NUMBER,
          heroContributions: [],
          signal: 0,
        });
        offlineClaimRequestedRef.current = false;

        await refreshRealmDirectory();
        setBackendStatus('synced');
        return true;
      })
      .catch(error => {
        console.error(error);
        setBackendStatus('error');
        return false;
      })
      .finally(() => {
        setRealmSwitching(false);
      });
    actionQueueRef.current = switchOperation.then(() => undefined);
    return switchOperation;
  }, [apiEnabled, applyServerState, backendStatus, playerId, realmSwitching, refreshRealmDirectory, replayActionOutbox]);

  const applyOfflineRewardEvents = useCallback((events: GameEvent[]) => {
    const summary = summarizeOfflineReward(events, GAME_BALANCE.offlineRewardModalMinSeconds);
    // A claim with no qualifying reward must not clear an already-shown modal,
    // so only set when there is something to show.
    if (summary) {
      setOfflineReward(summary);
    }
  }, []);

  useEffect(() => {
    if (!automaticActionsEnabled || offlineClaimRequestedRef.current) {
      return;
    }

    offlineClaimRequestedRef.current = true;
    void runGameAction({ type: 'claim_offline_rewards' }).then(applyOfflineRewardEvents);
  }, [applyOfflineRewardEvents, automaticActionsEnabled, runGameAction]);

  useEffect(() => {
    const claimAfterResume = () => {
      if (
        automaticActionsEnabled &&
        document.visibilityState === 'visible' &&
        offlineClaimRequestedRef.current
      ) {
        void runGameAction({ type: 'claim_offline_rewards' }).then(applyOfflineRewardEvents);
      }
    };

    document.addEventListener('visibilitychange', claimAfterResume);
    return () => document.removeEventListener('visibilitychange', claimAfterResume);
  }, [applyOfflineRewardEvents, automaticActionsEnabled, runGameAction]);

  const isBoss = isBossStage(snapshot.stage);
  const activeHeroes = useMemo(
    () => getActiveWarbandHeroes({
      activeHeroIds: snapshot.activeHeroIds,
      heroes: snapshot.heroes,
    }),
    [snapshot.activeHeroIds, snapshot.heroes],
  );
  const baseClickPower = useMemo(() => getBaseClickPower(activeHeroes), [activeHeroes]);
  const passivePower = useMemo(() => getPassivePower(activeHeroes), [activeHeroes]);
  const comboMultiplier = getComboMultiplier(comboCount);
  const clickPower = useMemo(
    () => multiplyGameNumbers(baseClickPower, comboMultiplier),
    [baseClickPower, comboMultiplier],
  );

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

  /**
   * The single exit for combat batches. Accrued idle ticks always ride along with
   * whatever is being sent, so a tap flush never adopts a server snapshot that is
   * missing the ticks already predicted locally — that would snap the health bar
   * back up.
   */
  const dispatchCombatBatch = useCallback((tapCount: number) => {
    const passiveTicks = Math.min(pendingPassiveTicksRef.current, GAME_BALANCE.maxPassiveTicksPerBatch);
    if (tapCount === 0 && passiveTicks === 0) {
      return Promise.resolve([] as GameEvent[]);
    }

    pendingPassiveTicksRef.current -= passiveTicks;
    return runGameAction(
      { type: 'combat_batch', tapCount, passiveTicks },
      // Boss ticks are never predicted locally, so their volley must come back
      // from the server; everything else was already animated on prediction.
      { passiveVolley: isBossStage(snapshotRef.current.stage) },
    );
  }, [runGameAction]);

  const flushTapBatch = useCallback(() => {
    if (tapBatchTimeoutRef.current) {
      clearTimeout(tapBatchTimeoutRef.current);
      tapBatchTimeoutRef.current = null;
    }

    const taps = pendingTapsRef.current.splice(0, TAP_BATCH_MAX_SIZE);
    if (taps.length === 0) {
      return;
    }

    void dispatchCombatBatch(taps.length).then(events => {
      const groupedEvents = splitTapEvents(events, taps.length);
      taps.forEach((tap, index) => tap.resolve(groupedEvents[index] ?? []));
    });

    if (pendingTapsRef.current.length > 0) {
      tapBatchTimeoutRef.current = setTimeout(() => flushTapBatch(), TAP_BATCH_WINDOW_MS);
    }
  }, [dispatchCombatBatch]);

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
    if (!automaticActionsEnabled) {
      return;
    }

    const interval = setInterval(() => {
      if (
        document.visibilityState !== 'visible' ||
        activeView !== 'rift' ||
        snapshotRef.current.activeHeroIds.length === 0
      ) {
        return;
      }

      // Without a backend the engine already runs locally, so predicting on top
      // of it would apply every tick twice.
      if (!apiEnabled) {
        void runGameAction({ type: 'combat_batch', tapCount: 0, passiveTicks: 1 });
        return;
      }

      pendingPassiveTicksRef.current += 1;

      // Boss encounters are timed and can enrage mid-fight, so their state has to
      // come from the server rather than a local guess that could disagree.
      if (isBossStage(snapshotRef.current.stage)) {
        void dispatchCombatBatch(0);
        return;
      }

      // Passive damage has no randomness, so replaying this tick on the server
      // yields the same snapshot. Predict it to keep the bar draining every
      // second while the network sees one batch every PASSIVE_FLUSH_TICKS.
      const predicted = applyGameAction(snapshotRef.current, {
        type: 'combat_batch',
        tapCount: 0,
        passiveTicks: 1,
      });
      if (!predicted.events.some(event => event.type === 'action_rejected')) {
        applySnapshot(predicted.snapshot);
        publishCombatFeedback(predicted.events);
      }

      if (pendingPassiveTicksRef.current >= PASSIVE_FLUSH_TICKS) {
        void dispatchCombatBatch(0);
      }
    }, GAME_BALANCE.passiveTickMs);

    return () => clearInterval(interval);
  }, [
    activeView,
    apiEnabled,
    applySnapshot,
    automaticActionsEnabled,
    dispatchCombatBatch,
    publishCombatFeedback,
    runGameAction,
  ]);

  // Anything that takes the player off the rift — tab switch, backgrounding, or
  // closing — must settle the accrued ticks before the next server snapshot
  // arrives without them.
  useEffect(() => {
    if (!apiEnabled) {
      return;
    }

    if (activeView !== 'rift') {
      void dispatchCombatBatch(0);
      return;
    }

    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') {
        void dispatchCombatBatch(0);
      }
    };

    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('pagehide', flushOnHide);

    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flushOnHide);
    };
  }, [activeView, apiEnabled, dispatchCombatBatch]);

  const summonHero = useCallback(async () => {
    if (snapshotRef.current.gems < GAME_BALANCE.summonCostGems) {
      return null;
    }

    const events = await runGameAction({ type: 'summon' });
    return getSummonEvent(events);
  }, [runGameAction]);

  const upgradeHero = (heroId: string, amount: HeroUpgradeAmount = 1) => {
    const currentSnapshot = snapshotRef.current;
    const heroToUpgrade = currentSnapshot.heroes.find(hero => hero.id === heroId);
    if (
      !heroToUpgrade ||
      isHeroAtLevelCap(heroToUpgrade) ||
      getHeroUpgradeQuote(heroToUpgrade, currentSnapshot.gold, amount).levelsGained === 0
    ) {
      return false;
    }

    void runGameAction({ type: 'upgrade_hero', heroId, amount });
    return true;
  };

  const ascendHero = (heroId: string) => {
    const heroToAscend = snapshotRef.current.heroes.find(hero => hero.id === heroId);
    if (
      !heroToAscend ||
      heroToAscend.level < getHeroLevelCap(heroToAscend) ||
      heroToAscend.shards < getAscensionShardCost(heroToAscend)
    ) {
      return false;
    }

    void runGameAction({ type: 'ascend_hero', heroId });
    return true;
  };

  const setActiveWarband = useCallback(async (heroIds: string[]) => {
    const currentSnapshot = snapshotRef.current;
    const ownedHeroIds = new Set(currentSnapshot.heroes.map(hero => hero.id));
    if (
      heroIds.length > MAX_ACTIVE_WARBAND_HEROES ||
      new Set(heroIds).size !== heroIds.length ||
      heroIds.some(heroId => !ownedHeroIds.has(heroId))
    ) {
      return false;
    }

    const events = await runGameAction({ type: 'set_active_warband', heroIds });
    return events.some(event => event.type === 'active_warband_updated');
  }, [runGameAction]);

  return {
    gold: snapshot.gold,
    gems: snapshot.gems,
    heroes: snapshot.heroes,
    activeHeroIds: snapshot.activeHeroIds,
    activeHeroes,
    ascendHero,
    upgradeHero,
    summonHero,
    setActiveWarband,
    activeView,
    setActiveView,
    stage: snapshot.stage,
    enemyIndex: snapshot.enemyIndex,
    isBoss,
    monsterHealth: snapshot.monsterHealth,
    monsterMaxHealth: snapshot.monsterMaxHealth,
    summonPity: snapshot.summonPity,
    bossEncounterEndsAt: snapshot.bossEncounterEndsAt,
    bossEnrageSignal,
    offlineReward,
    dismissOfflineReward: () => setOfflineReward(null),
    snapshotUpdatedAt: snapshot.updatedAt,
    clickPower,
    dealDamage,
    comboCount,
    comboMultiplier,
    registerHit,
    passivePower,
    passiveVolleyDamage: passiveVolleyFeedback.damage,
    passiveVolleyHeroContributions: passiveVolleyFeedback.heroContributions,
    passiveVolleySignal: passiveVolleyFeedback.signal,
    backendStatus,
    leaderboard,
    leaderboardStatus,
    playerProfile,
    playerId,
    realmContext,
    realmDirectory,
    realmSwitching,
    refreshLeaderboard,
    refreshRealmDirectory,
    switchRealm,
  };
};
