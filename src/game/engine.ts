import {
  GAME_BALANCE,
  getMonsterMaxHealth,
  getNextHeroPower,
  getUpgradeCost,
  isBossStage,
  rollSummonTemplate,
} from './balance';
import type { GameAction, GameActionResult, GameSnapshot, Hero } from './types';

const nowIso = () => new Date().toISOString();

const createHeroId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};

const touchSnapshot = (snapshot: Omit<GameSnapshot, 'updatedAt'>): GameSnapshot => {
  return { ...snapshot, updatedAt: nowIso() };
};

export const createInitialGameSnapshot = (): GameSnapshot => {
  const stage = GAME_BALANCE.initialStage;
  const monsterMaxHealth = getMonsterMaxHealth(stage);

  return {
    gold: GAME_BALANCE.initialGold,
    gems: GAME_BALANCE.initialGems,
    heroes: [],
    stage,
    monsterMaxHealth,
    monsterHealth: monsterMaxHealth,
    updatedAt: nowIso(),
  };
};

export const applyDamageAction = (
  snapshot: GameSnapshot,
  amount: number,
  source: 'tap' | 'passive' | 'skill',
): GameActionResult => {
  const damage = Math.max(0, amount);
  if (damage <= 0) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'damage_must_be_positive' }],
    };
  }

  if (snapshot.monsterHealth <= 0) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'monster_already_defeated' }],
    };
  }

  const nextMonsterHealth = snapshot.monsterHealth - damage;
  if (nextMonsterHealth > 0) {
    const updatedSnapshot = touchSnapshot({
      ...snapshot,
      gold: source === 'tap' ? snapshot.gold + damage * GAME_BALANCE.clickGoldMultiplier : snapshot.gold,
      monsterHealth: nextMonsterHealth,
    });

    return {
      snapshot: updatedSnapshot,
      events: [{ type: 'monster_hit', damage, monsterHealth: nextMonsterHealth }],
    };
  }

  const defeatedStage = snapshot.stage;
  const nextStage = defeatedStage + 1;
  const nextMonsterMaxHealth = getMonsterMaxHealth(nextStage);
  const defeatedBoss = isBossStage(defeatedStage);
  const goldReward = defeatedBoss
    ? snapshot.monsterMaxHealth * GAME_BALANCE.bossGoldMultiplier
    : snapshot.monsterMaxHealth * GAME_BALANCE.killGoldMultiplier;
  const gemReward = defeatedBoss ? GAME_BALANCE.bossGemReward : 0;

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gold: snapshot.gold + goldReward + (source === 'tap' ? damage * GAME_BALANCE.clickGoldMultiplier : 0),
    gems: snapshot.gems + gemReward,
    stage: nextStage,
    monsterMaxHealth: nextMonsterMaxHealth,
    monsterHealth: nextMonsterMaxHealth,
  });

  return {
    snapshot: updatedSnapshot,
    events: [
      {
        type: 'monster_defeated',
        stage: defeatedStage,
        nextStage,
        goldReward,
        gemReward,
      },
    ],
  };
};

export const summonHeroAction = (snapshot: GameSnapshot, randomValue?: number): GameActionResult => {
  if (snapshot.gems < GAME_BALANCE.summonCostGems) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'not_enough_gems' }],
    };
  }

  const template = rollSummonTemplate(randomValue);
  const hero: Hero = {
    id: createHeroId(),
    name: template.name,
    rarity: template.rarity,
    level: 1,
    power: template.power,
  };

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gems: snapshot.gems - GAME_BALANCE.summonCostGems,
    heroes: [...snapshot.heroes, hero],
  });

  return {
    snapshot: updatedSnapshot,
    events: [{ type: 'hero_summoned', hero, costGems: GAME_BALANCE.summonCostGems }],
  };
};

export const upgradeHeroAction = (snapshot: GameSnapshot, heroId: string): GameActionResult => {
  const heroToUpgrade = snapshot.heroes.find(hero => hero.id === heroId);
  if (!heroToUpgrade) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'hero_not_found' }],
    };
  }

  const goldCost = getUpgradeCost(heroToUpgrade);
  if (snapshot.gold < goldCost) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'not_enough_gold' }],
    };
  }

  const nextLevel = heroToUpgrade.level + 1;
  const nextPower = getNextHeroPower(heroToUpgrade);
  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gold: snapshot.gold - goldCost,
    heroes: snapshot.heroes.map(hero => {
      if (hero.id !== heroId) {
        return hero;
      }

      return {
        ...hero,
        level: nextLevel,
        power: nextPower,
      };
    }),
  });

  return {
    snapshot: updatedSnapshot,
    events: [{ type: 'hero_upgraded', heroId, goldCost, level: nextLevel, power: nextPower }],
  };
};

export const applyGameAction = (snapshot: GameSnapshot, action: GameAction): GameActionResult => {
  switch (action.type) {
    case 'deal_damage':
      return applyDamageAction(snapshot, action.amount, action.source);
    case 'summon':
      return summonHeroAction(snapshot, action.randomValue);
    case 'upgrade_hero':
      return upgradeHeroAction(snapshot, action.heroId);
  }
};
