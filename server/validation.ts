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

export const parseGameActionRequest = (value: unknown): { playerId: string; action: GameAction } | null => {
  if (!isRecord(value)) {
    return null;
  }

  const request = value as GameActionRequest;
  const playerId = normalizePlayerId(request.playerId);
  if (!playerId || !isRecord(request.action)) {
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
      playerId,
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
      playerId,
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
      playerId,
      action: {
        type: 'upgrade_hero',
        heroId: request.action.heroId,
      },
    };
  }

  return null;
};
