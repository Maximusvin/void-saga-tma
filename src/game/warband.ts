import type { GameSnapshot, Hero } from './types';

export const MAX_ACTIVE_WARBAND_HEROES = 4;

export const getActiveWarbandHeroes = (
  snapshot: Pick<GameSnapshot, 'activeHeroIds' | 'heroes'>,
): Hero[] => {
  const heroesById = new Map(snapshot.heroes.map(hero => [hero.id, hero]));
  return snapshot.activeHeroIds.flatMap(heroId => {
    const hero = heroesById.get(heroId);
    return hero ? [hero] : [];
  });
};

export const getDefaultWarbandHeroIds = (heroes: readonly Hero[]) => {
  return heroes.slice(0, MAX_ACTIVE_WARBAND_HEROES).map(hero => hero.id);
};

export const normalizeWarbandHeroIds = (value: unknown, heroes: readonly Hero[]) => {
  if (!Array.isArray(value)) {
    return getDefaultWarbandHeroIds(heroes);
  }

  const ownedHeroIds = new Set(heroes.map(hero => hero.id));
  const normalizedHeroIds: string[] = [];
  for (const heroId of value) {
    if (
      typeof heroId === 'string' &&
      ownedHeroIds.has(heroId) &&
      !normalizedHeroIds.includes(heroId)
    ) {
      normalizedHeroIds.push(heroId);
    }
    if (normalizedHeroIds.length === MAX_ACTIVE_WARBAND_HEROES) {
      break;
    }
  }

  return normalizedHeroIds;
};
