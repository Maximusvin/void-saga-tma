import type { GameAction, GameEvent, GameSnapshot } from '../game/types';

interface PlayerStateResponse {
  playerId: string;
  snapshot: GameSnapshot;
}

interface GameActionResponse extends PlayerStateResponse {
  events: GameEvent[];
}

const normalizeBaseUrl = (value: string | undefined) => {
  return value?.trim().replace(/\/$/, '') ?? '';
};

export const GAME_API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_GAME_API_URL);

export const isGameApiEnabled = () => GAME_API_BASE_URL.length > 0;

const requestJson = async <TResponse>(url: string, init?: RequestInit): Promise<TResponse> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
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

export const postGameAction = (playerId: string, action: GameAction) => {
  return requestJson<GameActionResponse>(`${GAME_API_BASE_URL}/api/game/action`, {
    method: 'POST',
    body: JSON.stringify({ playerId, action }),
  });
};
