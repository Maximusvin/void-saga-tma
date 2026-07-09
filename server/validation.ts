import type { GameAction } from '../src/game/types';

interface GameActionRequest {
  playerId?: unknown;
  action?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
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

export const parseGameActionRequest = (value: unknown): { requestedPlayerId: string | null; action: GameAction } | null => {
  if (!isRecord(value)) {
    return null;
  }

  const request = value as GameActionRequest;
  const requestedPlayerId = request.playerId === undefined ? null : normalizePlayerId(request.playerId);
  if ((request.playerId !== undefined && !requestedPlayerId) || !isRecord(request.action)) {
    return null;
  }

  if (request.action.type === 'deal_damage') {
    if (
      !isFiniteNumber(request.action.amount) ||
      (
        request.action.source !== 'tap' &&
        request.action.source !== 'passive' &&
        request.action.source !== 'skill'
      )
    ) {
      return null;
    }

    return {
      requestedPlayerId,
      action: {
        type: 'deal_damage',
        amount: request.action.amount,
        source: request.action.source,
      },
    };
  }

  if (request.action.type === 'summon') {
    if (request.action.randomValue !== undefined && !isFiniteNumber(request.action.randomValue)) {
      return null;
    }

    return {
      requestedPlayerId,
      action: {
        type: 'summon',
        randomValue: request.action.randomValue,
      },
    };
  }

  if (request.action.type === 'upgrade_hero') {
    if (typeof request.action.heroId !== 'string' || !request.action.heroId.trim()) {
      return null;
    }

    return {
      requestedPlayerId,
      action: {
        type: 'upgrade_hero',
        heroId: request.action.heroId,
      },
    };
  }

  return null;
};
