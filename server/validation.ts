import type { GameAction } from '../src/game/types';

interface GameActionRequest {
  commandId?: unknown;
  playerId?: unknown;
  action?: unknown;
}

const MAX_COMBAT_TAPS_PER_BATCH = 20;
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

export const parseGameActionRequest = (
  value: unknown,
): { commandId: string; requestedPlayerId: string | null; action: GameAction } | null => {
  if (!isRecord(value)) {
    return null;
  }

  const request = value as GameActionRequest;
  const commandId = normalizeCommandId(request.commandId);
  const requestedPlayerId = request.playerId === undefined ? null : normalizePlayerId(request.playerId);
  if (!commandId || (request.playerId !== undefined && !requestedPlayerId) || !isRecord(request.action)) {
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
      passiveTicks > 1 ||
      (tapCount === 0 && passiveTicks === 0)
    ) {
      return null;
    }

    return {
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
      commandId,
      requestedPlayerId,
      action: {
        type: 'summon',
      },
    };
  }

  if (request.action.type === 'upgrade_hero') {
    if (typeof request.action.heroId !== 'string' || !request.action.heroId.trim()) {
      return null;
    }

    return {
      commandId,
      requestedPlayerId,
      action: {
        type: 'upgrade_hero',
        heroId: request.action.heroId,
      },
    };
  }

  if (request.action.type === 'claim_offline_rewards') {
    return {
      commandId,
      requestedPlayerId,
      action: {
        type: 'claim_offline_rewards',
      },
    };
  }

  return null;
};
