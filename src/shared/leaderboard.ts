import { tryParseGameNumber, type GameNumber } from '../game/gameNumber';

export type LeagueDivision = 'bronze' | 'silver' | 'gold' | 'mythic';

export interface RealmLeaderboardEntry {
  displayName: string;
  division: LeagueDivision;
  enemyIndex: number;
  isCurrentPlayer: boolean;
  passivePower: GameNumber;
  photoUrl: string | null;
  rank: number;
  stage: number;
}

export interface RealmLeaderboard {
  currentPlayer: RealmLeaderboardEntry;
  generatedAt: string;
  realmCode: string;
  top: RealmLeaderboardEntry[];
  totalPlayers: number;
}

const MAX_LEADERBOARD_ENTRIES = 50;
const MAX_DISPLAY_NAME_LENGTH = 72;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

export const getLeagueDivision = (stage: number): LeagueDivision => {
  const normalizedStage = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
  if (normalizedStage >= 1_000) {
    return 'mythic';
  }
  if (normalizedStage >= 200) {
    return 'gold';
  }
  if (normalizedStage >= 50) {
    return 'silver';
  }
  return 'bronze';
};

const normalizePhotoUrl = (value: unknown) => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.length > 2_048) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};

const normalizeEntry = (value: unknown): RealmLeaderboardEntry | null => {
  if (!isRecord(value)) {
    return null;
  }
  const passivePower = tryParseGameNumber(value.passivePower);
  if (
    typeof value.displayName !== 'string' ||
    value.displayName.trim().length === 0 ||
    value.displayName.length > MAX_DISPLAY_NAME_LENGTH ||
    !Number.isSafeInteger(value.enemyIndex) ||
    Number(value.enemyIndex) < 0 ||
    typeof value.isCurrentPlayer !== 'boolean' ||
    !passivePower ||
    !Number.isSafeInteger(value.rank) ||
    Number(value.rank) < 1 ||
    !Number.isSafeInteger(value.stage) ||
    Number(value.stage) < 1
  ) {
    return null;
  }
  const division = getLeagueDivision(Number(value.stage));
  if (value.division !== division) {
    return null;
  }
  const photoUrl = normalizePhotoUrl(value.photoUrl);
  if (value.photoUrl !== null && photoUrl === null) {
    return null;
  }

  return {
    displayName: value.displayName.trim(),
    division,
    enemyIndex: Number(value.enemyIndex),
    isCurrentPlayer: value.isCurrentPlayer,
    passivePower,
    photoUrl,
    rank: Number(value.rank),
    stage: Number(value.stage),
  };
};

export const normalizeRealmLeaderboard = (value: unknown): RealmLeaderboard | null => {
  if (!isRecord(value) || !Array.isArray(value.top)) {
    return null;
  }
  const top = value.top.map(normalizeEntry);
  const currentPlayer = normalizeEntry(value.currentPlayer);
  if (
    top.length > MAX_LEADERBOARD_ENTRIES ||
    top.length === 0 ||
    top.some(entry => entry === null) ||
    !currentPlayer ||
    !currentPlayer.isCurrentPlayer ||
    typeof value.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    typeof value.realmCode !== 'string' ||
    value.realmCode.length < 2 ||
    value.realmCode.length > 32 ||
    !Number.isSafeInteger(value.totalPlayers) ||
    Number(value.totalPlayers) < 1 ||
    top.length > Number(value.totalPlayers) ||
    top.some((entry, index) => entry?.rank !== index + 1) ||
    top.filter(entry => entry?.isCurrentPlayer).length > 1 ||
    currentPlayer.rank > Number(value.totalPlayers)
  ) {
    return null;
  }

  return {
    currentPlayer,
    generatedAt: value.generatedAt,
    realmCode: value.realmCode,
    top: top as RealmLeaderboardEntry[],
    totalPlayers: Number(value.totalPlayers),
  };
};
