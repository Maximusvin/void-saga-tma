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

export interface LeagueProgress {
  division: LeagueDivision;
  nextDivision: LeagueDivision | null;
  nextStage: number | null;
  progressPercent: number;
  stagesRemaining: number;
}

const LEAGUE_THRESHOLDS = [
  { division: 'bronze', minimumStage: 1 },
  { division: 'silver', minimumStage: 50 },
  { division: 'gold', minimumStage: 200 },
  { division: 'mythic', minimumStage: 1_000 },
] as const satisfies readonly { division: LeagueDivision; minimumStage: number }[];

const MAX_LEADERBOARD_ENTRIES = 50;
const MAX_DISPLAY_NAME_LENGTH = 72;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

export const getLeagueDivision = (stage: number): LeagueDivision => {
  const normalizedStage = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
  let division: LeagueDivision = 'bronze';
  for (const threshold of LEAGUE_THRESHOLDS) {
    if (normalizedStage < threshold.minimumStage) {
      break;
    }
    division = threshold.division;
  }
  return division;
};

export const getLeagueProgress = (stage: number): LeagueProgress => {
  const normalizedStage = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
  const divisionIndex = LEAGUE_THRESHOLDS.findIndex(
    threshold => threshold.division === getLeagueDivision(normalizedStage),
  );
  const current = LEAGUE_THRESHOLDS[divisionIndex] ?? LEAGUE_THRESHOLDS[0];
  const next = LEAGUE_THRESHOLDS[divisionIndex + 1];
  if (!next) {
    return {
      division: current.division,
      nextDivision: null,
      nextStage: null,
      progressPercent: 100,
      stagesRemaining: 0,
    };
  }

  const divisionSpan = next.minimumStage - current.minimumStage;
  const completedStages = normalizedStage - current.minimumStage;
  return {
    division: current.division,
    nextDivision: next.division,
    nextStage: next.minimumStage,
    progressPercent: Math.min(100, Math.max(0, completedStages / divisionSpan * 100)),
    stagesRemaining: Math.max(0, next.minimumStage - normalizedStage),
  };
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
