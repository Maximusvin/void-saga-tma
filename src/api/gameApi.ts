import type { GameAction, GameEvent, GameSnapshot } from '../game/types';
import { getTelegramInitData } from '../utils/telegram';

interface PlayerStateResponse {
  playerId: string;
  snapshot: GameSnapshot;
}

interface GameActionResponse extends PlayerStateResponse {
  events: GameEvent[];
  replayed: boolean;
}

const normalizeBaseUrl = (value: string | undefined) => {
  return value?.trim().replace(/\/$/, '') ?? '';
};

export const GAME_API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_GAME_API_URL);

export const isGameApiEnabled = () => GAME_API_BASE_URL.length > 0;

export const createGameCommandId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

const requestJson = async <TResponse>(url: string, init?: RequestInit): Promise<TResponse> => {
  const telegramInitData = getTelegramInitData();
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(telegramInitData ? { 'x-telegram-init-data': telegramInitData } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Game API request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
};

export const fetchGameState = (playerId: string) => {
  const url = new URL(`${GAME_API_BASE_URL}/api/game/state`);
  url.searchParams.set('playerId', playerId);

  return requestJson<PlayerStateResponse>(url.toString());
};

export const postGameAction = (playerId: string, commandId: string, action: GameAction) => {
  return requestJson<GameActionResponse>(`${GAME_API_BASE_URL}/api/game/action`, {
    method: 'POST',
    body: JSON.stringify({ playerId, commandId, action }),
  });
};
