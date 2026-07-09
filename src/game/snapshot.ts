import {
  GAME_BALANCE,
  HERO_RARITIES,
  SUMMON_POOL,
  getDuplicateShardReward,
  getMonsterMaxHealth,
} from './balance';
import {
  addGameNumbers,
  compareGameNumbers,
  gameNumber,
  minGameNumbers,
  parseGameNumber,
  tryParseGameNumber,
} from './gameNumber';
import {
  GAME_SNAPSHOT_SCHEMA_VERSION,
  type GameEvent,
  type GameSnapshot,
  type Hero,
  type HeroRarity,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const normalizeInteger = (value: unknown, fallback: number, minimum: number) => {
  if (!isFiniteNumber(value) || !Number.isSafeInteger(Math.floor(value))) {
    return fallback;
  }

  return Math.max(minimum, Math.floor(value));
};

const isHeroRarity = (value: unknown): value is HeroRarity => {
  return typeof value === 'string' && HERO_RARITIES.includes(value as HeroRarity);
};

export const normalizeHero = (value: unknown): Hero | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isHeroRarity(value.rarity)
  ) {
    return null;
  }

  const power = tryParseGameNumber(value.power);
  if (!power) {
    return null;
  }

  const level = normalizeInteger(value.level, 1, 1);
  const matchingTemplate = SUMMON_POOL.find(template => (
    template.id === value.templateId ||
    (template.name === value.name && template.rarity === value.rarity)
  ));
  const minimumAscension = Math.floor(
    Math.max(0, level - 1) / GAME_BALANCE.ascensionLevelsPerRank,
  );

  return {
    ascension: Math.max(normalizeInteger(value.ascension, minimumAscension, 0), minimumAscension),
    id: value.id,
    level,
    name: value.name,
    power,
    rarity: value.rarity,
    shards: normalizeInteger(value.shards, 0, 0),
    templateId: matchingTemplate?.id ?? `legacy:${value.id}`,
  };
};

const mergeDuplicateHeroes = (heroes: readonly Hero[]) => {
  const heroesByTemplate = new Map<string, Hero>();

  for (const hero of heroes) {
    const existing = heroesByTemplate.get(hero.templateId);
    if (!existing) {
      heroesByTemplate.set(hero.templateId, hero);
      continue;
    }

    const level = Math.max(existing.level, hero.level);
    const minimumAscension = Math.floor(
      Math.max(0, level - 1) / GAME_BALANCE.ascensionLevelsPerRank,
    );
    heroesByTemplate.set(hero.templateId, {
      ...existing,
      ascension: Math.max(existing.ascension, hero.ascension, minimumAscension),
      level,
      power: addGameNumbers(existing.power, hero.power),
      shards: existing.shards + hero.shards + getDuplicateShardReward(hero.rarity),
    });
  }

  return [...heroesByTemplate.values()];
};

export const normalizeGameSnapshot = (value: unknown): GameSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const stage = normalizeInteger(value.stage, GAME_BALANCE.initialStage, GAME_BALANCE.initialStage);
  const calculatedMonsterMaxHealth = getMonsterMaxHealth(stage);
  const parsedMonsterMaxHealth = tryParseGameNumber(value.monsterMaxHealth);
  const monsterMaxHealth = parsedMonsterMaxHealth && compareGameNumbers(parsedMonsterMaxHealth, 0) > 0
    ? parsedMonsterMaxHealth
    : calculatedMonsterMaxHealth;
  const monsterHealth = minGameNumbers(
    parseGameNumber(value.monsterHealth, monsterMaxHealth),
    monsterMaxHealth,
  );
  const now = new Date().toISOString();
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : now;

  return {
    schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
    comboCount: normalizeInteger(value.comboCount, 0, 0),
    comboExpiresAt: typeof value.comboExpiresAt === 'string' ? value.comboExpiresAt : null,
    gems: normalizeInteger(value.gems, GAME_BALANCE.initialGems, 0),
    gold: parseGameNumber(value.gold, gameNumber(GAME_BALANCE.initialGold)),
    heroes: Array.isArray(value.heroes)
      ? mergeDuplicateHeroes(value.heroes.map(normalizeHero).filter((hero): hero is Hero => hero !== null))
      : [],
    lastSeenAt: typeof value.lastSeenAt === 'string' ? value.lastSeenAt : updatedAt,
    monsterHealth,
    monsterMaxHealth,
    stage,
    updatedAt,
  };
};

export const normalizeStoredGameEvent = (value: unknown): GameEvent | null => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  switch (value.type) {
    case 'monster_hit': {
      if (
        !isFiniteNumber(value.comboCount) ||
        typeof value.isCrit !== 'boolean' ||
        (value.source !== 'tap' && value.source !== 'passive') ||
        !isFiniteNumber(value.stage)
      ) {
        return null;
      }

      return {
        type: 'monster_hit',
        comboCount: normalizeInteger(value.comboCount, 0, 0),
        damage: parseGameNumber(value.damage),
        isCrit: value.isCrit,
        monsterHealth: parseGameNumber(value.monsterHealth),
        source: value.source,
        stage: normalizeInteger(value.stage, 1, 1),
      };
    }
    case 'monster_defeated': {
      if (!isFiniteNumber(value.stage) || !isFiniteNumber(value.nextStage) || !isFiniteNumber(value.gemReward)) {
        return null;
      }

      return {
        type: 'monster_defeated',
        stage: normalizeInteger(value.stage, 1, 1),
        nextStage: normalizeInteger(value.nextStage, 1, 1),
        goldReward: parseGameNumber(value.goldReward),
        gemReward: normalizeInteger(value.gemReward, 0, 0),
      };
    }
    case 'hero_summoned': {
      const hero = normalizeHero(value.hero);
      if (!hero || !isFiniteNumber(value.costGems)) {
        return null;
      }

      return {
        type: 'hero_summoned',
        hero,
        costGems: normalizeInteger(value.costGems, 0, 0),
        isDuplicate: value.isDuplicate === true,
        shardsGranted: normalizeInteger(value.shardsGranted, 0, 0),
      };
    }
    case 'hero_upgraded': {
      if (typeof value.heroId !== 'string' || !isFiniteNumber(value.level)) {
        return null;
      }

      return {
        type: 'hero_upgraded',
        heroId: value.heroId,
        goldCost: parseGameNumber(value.goldCost),
        level: normalizeInteger(value.level, 1, 1),
        power: parseGameNumber(value.power),
      };
    }
    case 'hero_ascended': {
      if (
        typeof value.heroId !== 'string' ||
        !isFiniteNumber(value.ascension) ||
        !isFiniteNumber(value.levelCap) ||
        !isFiniteNumber(value.shardsRemaining) ||
        !isFiniteNumber(value.shardsSpent)
      ) {
        return null;
      }

      return {
        type: 'hero_ascended',
        heroId: value.heroId,
        ascension: normalizeInteger(value.ascension, 0, 0),
        levelCap: normalizeInteger(value.levelCap, GAME_BALANCE.ascensionBaseLevelCap, 1),
        shardsRemaining: normalizeInteger(value.shardsRemaining, 0, 0),
        shardsSpent: normalizeInteger(value.shardsSpent, 0, 0),
      };
    }
    case 'offline_rewards_claimed': {
      if (!isFiniteNumber(value.elapsedSeconds) || !isFiniteNumber(value.cappedSeconds)) {
        return null;
      }

      return {
        type: 'offline_rewards_claimed',
        elapsedSeconds: normalizeInteger(value.elapsedSeconds, 0, 0),
        cappedSeconds: normalizeInteger(value.cappedSeconds, 0, 0),
        goldReward: parseGameNumber(value.goldReward),
        passivePower: parseGameNumber(value.passivePower),
      };
    }
    case 'action_rejected':
      return typeof value.reason === 'string'
        ? { type: 'action_rejected', reason: value.reason }
        : null;
    default:
      return null;
  }
};

export const normalizeStoredGameEvents = (value: unknown): GameEvent[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeStoredGameEvent)
    .filter((event): event is GameEvent => event !== null);
};
