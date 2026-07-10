export type RealmKind = 'standard' | 'consolidated';
export type RealmStatus = 'open' | 'locked' | 'merged';

export interface RealmContext {
  canonicalRealmCode: string;
  canonicalRealmId: string;
  characterId: string;
  originRealmCode: string;
  originRealmId: string;
}

export interface RealmSummary {
  canonicalRealmCode: string;
  canonicalRealmId: string;
  characterId: string | null;
  code: string;
  hardCapacity: number;
  id: string;
  isRecommended: boolean;
  kind: RealmKind;
  openedAt: string;
  population: number;
  softCapacity: number;
  status: RealmStatus;
}

export interface RealmDirectory {
  activeCharacterId: string | null;
  realms: RealmSummary[];
  recommendedRealmId: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const isRealmKind = (value: unknown): value is RealmKind => (
  value === 'standard' || value === 'consolidated'
);

const isRealmStatus = (value: unknown): value is RealmStatus => (
  value === 'open' || value === 'locked' || value === 'merged'
);

const isBoundedId = (value: unknown): value is string => (
  typeof value === 'string' && value.length >= 3 && value.length <= 96
);

export const normalizeRealmContext = (value: unknown): RealmContext | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isBoundedId(value.canonicalRealmCode) ||
    !isBoundedId(value.canonicalRealmId) ||
    !isBoundedId(value.characterId) ||
    !isBoundedId(value.originRealmCode) ||
    !isBoundedId(value.originRealmId)
  ) {
    return null;
  }

  return {
    canonicalRealmCode: value.canonicalRealmCode,
    canonicalRealmId: value.canonicalRealmId,
    characterId: value.characterId,
    originRealmCode: value.originRealmCode,
    originRealmId: value.originRealmId,
  };
};

const normalizeRealmSummary = (value: unknown): RealmSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isBoundedId(value.canonicalRealmCode) ||
    !isBoundedId(value.canonicalRealmId) ||
    (value.characterId !== null && !isBoundedId(value.characterId)) ||
    !isBoundedId(value.code) ||
    !isBoundedId(value.id) ||
    !isRealmKind(value.kind) ||
    !isRealmStatus(value.status) ||
    typeof value.openedAt !== 'string' || !Number.isFinite(Date.parse(value.openedAt)) ||
    !Number.isSafeInteger(value.population) ||
    !Number.isSafeInteger(value.softCapacity) ||
    !Number.isSafeInteger(value.hardCapacity) ||
    Number(value.population) < 0 ||
    Number(value.softCapacity) <= 0 ||
    Number(value.hardCapacity) < Number(value.softCapacity) ||
    typeof value.isRecommended !== 'boolean'
  ) {
    return null;
  }

  return value as unknown as RealmSummary;
};

export const normalizeRealmDirectory = (value: unknown): RealmDirectory | null => {
  if (!isRecord(value) || !Array.isArray(value.realms)) {
    return null;
  }
  const realms = value.realms.map(normalizeRealmSummary);
  if (
    realms.some(realm => realm === null) ||
    (value.activeCharacterId !== null && !isBoundedId(value.activeCharacterId)) ||
    (value.recommendedRealmId !== null && !isBoundedId(value.recommendedRealmId))
  ) {
    return null;
  }

  return {
    activeCharacterId: value.activeCharacterId as string | null,
    realms: realms as RealmSummary[],
    recommendedRealmId: value.recommendedRealmId as string | null,
  };
};
