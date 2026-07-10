import type { GameAction, GameEvent, GameSnapshot } from '../game/types';
import type { PlayerProfile } from '../shared/playerProfile';
import type { RealmLeaderboard } from '../shared/leaderboard';
import type { RealmContext, RealmDirectory } from '../shared/realm';
import { getTelegramInitData } from '../utils/telegram';

export interface PlayerStateResponse {
  characterId: string;
  playerId: string;
  playerProfile: PlayerProfile;
  realm: RealmContext;
  snapshot: GameSnapshot;
}

interface GameActionResponse extends PlayerStateResponse {
  events: GameEvent[];
  replayed: boolean;
}

interface RealmMutationResponse {
  realm: RealmContext;
}

const normalizeBaseUrl = (value: string | undefined) => {
  return value?.trim().replace(/\/$/, '') ?? '';
};

export const GAME_API_BASE_URL = normalizeBaseUrl(import.meta.env?.VITE_GAME_API_URL);

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

export const fetchGameState = (playerId: string, characterId?: string) => {
  const url = new URL(`${GAME_API_BASE_URL}/api/game/state`);
  url.searchParams.set('playerId', playerId);
  if (characterId) {
    url.searchParams.set('characterId', characterId);
  }

  return requestJson<PlayerStateResponse>(url.toString());
};

export const fetchRealmDirectory = (playerId: string) => {
  const url = new URL(`${GAME_API_BASE_URL}/api/game/realms`);
  url.searchParams.set('playerId', playerId);
  return requestJson<RealmDirectory>(url.toString());
};

export const fetchRealmLeaderboard = (playerId: string, characterId: string) => {
  const url = new URL(`${GAME_API_BASE_URL}/api/game/leaderboard`);
  url.searchParams.set('playerId', playerId);
  url.searchParams.set('characterId', characterId);
  return requestJson<RealmLeaderboard>(url.toString());
};

export const joinRealm = (playerId: string, realmId: string) => {
  return requestJson<RealmMutationResponse>(`${GAME_API_BASE_URL}/api/game/realms/join`, {
    method: 'POST',
    body: JSON.stringify({ playerId, realmId }),
  });
};

export const selectRealmCharacter = (playerId: string, characterId: string) => {
  return requestJson<RealmMutationResponse>(`${GAME_API_BASE_URL}/api/game/realms/select`, {
    method: 'POST',
    body: JSON.stringify({ characterId, playerId }),
  });
};

export const postGameAction = (
  playerId: string,
  characterId: string,
  commandId: string,
  action: GameAction,
) => {
  return requestJson<GameActionResponse>(`${GAME_API_BASE_URL}/api/game/action`, {
    method: 'POST',
    body: JSON.stringify({ characterId, playerId, commandId, action }),
  });
};
