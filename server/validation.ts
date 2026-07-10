import { GAME_BALANCE } from '../src/game/balance';
import type { GameAction } from '../src/game/types';

interface GameActionRequest {
  characterId?: unknown;
  commandId?: unknown;
  playerId?: unknown;
  action?: unknown;
}

interface RealmJoinRequest {
  playerId?: unknown;
  realmId?: unknown;
}

interface RealmSelectRequest {
  characterId?: unknown;
  playerId?: unknown;
}

const MAX_COMBAT_TAPS_PER_BATCH = 20;
const MAX_ACTIVE_WARBAND_HEROES = 4;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9:_-]{8,96}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isSafeInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isSafeInteger(value);
};

export const normalizePlayerId = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96) {
    return null;
  }

  return trimmed;
};

export const normalizeCommandId = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return COMMAND_ID_PATTERN.test(trimmed) ? trimmed : null;
};

export const normalizeRealmEntityId = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return /^[A-Za-z0-9:_-]{8,96}$/.test(trimmed) ? trimmed : null;
};

export const parseRealmJoinRequest = (
  value: unknown,
): { realmId: string; requestedPlayerId: string | null } | null => {
  if (!isRecord(value)) {
    return null;
  }
  const request = value as RealmJoinRequest;
  const realmId = normalizeRealmEntityId(request.realmId);
  const requestedPlayerId = request.playerId === undefined ? null : normalizePlayerId(request.playerId);
  if (!realmId || (request.playerId !== undefined && !requestedPlayerId)) {
    return null;
  }

  return { realmId, requestedPlayerId };
};

export const parseRealmSelectRequest = (
  value: unknown,
): { characterId: string; requestedPlayerId: string | null } | null => {
  if (!isRecord(value)) {
    return null;
  }
  const request = value as RealmSelectRequest;
  const characterId = normalizeRealmEntityId(request.characterId);
  const requestedPlayerId = request.playerId === undefined ? null : normalizePlayerId(request.playerId);
  if (!characterId || (request.playerId !== undefined && !requestedPlayerId)) {
    return null;
  }

  return { characterId, requestedPlayerId };
};

export const parseGameActionRequest = (
  value: unknown,
): { characterId: string | null; commandId: string; requestedPlayerId: string | null; action: GameAction } | null => {
  if (!isRecord(value)) {
    return null;
  }

  const request = value as GameActionRequest;
  const characterId = request.characterId === undefined ? null : normalizeRealmEntityId(request.characterId);
  const commandId = normalizeCommandId(request.commandId);
  const requestedPlayerId = request.playerId === undefined ? null : normalizePlayerId(request.playerId);
  if (
    !commandId ||
    (request.characterId !== undefined && !characterId) ||
    (request.playerId !== undefined && !requestedPlayerId) ||
    !isRecord(request.action)
  ) {
    return null;
  }

  if (request.action.type === 'combat_batch') {
    const tapCount = request.action.tapCount;
    const passiveTicks = request.action.passiveTicks;
    if (
      !isSafeInteger(tapCount) ||
      tapCount < 0 ||
      tapCount > MAX_COMBAT_TAPS_PER_BATCH ||
      !isSafeInteger(passiveTicks) ||
      passiveTicks < 0 ||
      passiveTicks > GAME_BALANCE.maxPassiveTicksPerBatch ||
      (tapCount === 0 && passiveTicks === 0)
    ) {
      return null;
    }

    return {
      characterId,
      commandId,
      requestedPlayerId,
      action: {
        type: 'combat_batch',
        tapCount,
        passiveTicks,
      },
    };
  }

  if (request.action.type === 'summon') {
    if (request.action.randomValue !== undefined) {
      return null;
    }

    return {
      characterId,
      commandId,
      requestedPlayerId,
      action: {
        type: 'summon',
      },
    };
  }

  if (request.action.type === 'set_active_warband') {
    const heroIds = request.action.heroIds;
    if (
      !Array.isArray(heroIds) ||
      heroIds.length > MAX_ACTIVE_WARBAND_HEROES ||
      heroIds.some(heroId => typeof heroId !== 'string' || !heroId.trim() || heroId.length > 128) ||
      new Set(heroIds).size !== heroIds.length
    ) {
      return null;
    }

    return {
      characterId,
      commandId,
      requestedPlayerId,
      action: {
        type: 'set_active_warband',
        heroIds,
      },
    };
  }

  if (request.action.type === 'upgrade_hero') {
    if (typeof request.action.heroId !== 'string' || !request.action.heroId.trim()) {
      return null;
    }
    const amount = request.action.amount ?? 1;
    if (amount !== 1 && amount !== 10 && amount !== 'max') {
      return null;
    }

    return {
      characterId,
      commandId,
      requestedPlayerId,
      action: {
        type: 'upgrade_hero',
        heroId: request.action.heroId,
        amount,
      },
    };
  }

  if (request.action.type === 'ascend_hero') {
    if (typeof request.action.heroId !== 'string' || !request.action.heroId.trim()) {
      return null;
    }

    return {
      characterId,
      commandId,
      requestedPlayerId,
      action: {
        type: 'ascend_hero',
        heroId: request.action.heroId,
      },
    };
  }

  if (request.action.type === 'claim_offline_rewards') {
    return {
      characterId,
      commandId,
      requestedPlayerId,
      action: {
        type: 'claim_offline_rewards',
      },
    };
  }

  return null;
};
