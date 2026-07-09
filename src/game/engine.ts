import {
  GAME_BALANCE,
  MAX_COMBO_HITS,
  getBaseClickPower,
  getComboMultiplier,
  getMonsterMaxHealth,
  getNextHeroPower,
  getPassivePower,
  getStageBandForStage,
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

const touchSnapshot = (snapshot: GameSnapshot, now = nowIso()): GameSnapshot => {
  return { ...snapshot, lastSeenAt: now, updatedAt: now };
};

const getHeroPassivePower = (snapshot: Pick<GameSnapshot, 'heroes'>) => {
  return snapshot.heroes.reduce((total, hero) => total + hero.power, 0);
};

const getOfflineElapsedSeconds = (lastSeenAt: string, nowMs: number) => {
  const lastSeenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((nowMs - lastSeenMs) / 1000));
};

export const createInitialGameSnapshot = (): GameSnapshot => {
  const stage = GAME_BALANCE.initialStage;
  const monsterMaxHealth = getMonsterMaxHealth(stage);

  const now = nowIso();
  return {
    comboCount: 0,
    comboExpiresAt: null,
    gold: GAME_BALANCE.initialGold,
    gems: GAME_BALANCE.initialGems,
    heroes: [],
    stage,
    monsterMaxHealth,
    monsterHealth: monsterMaxHealth,
    lastSeenAt: now,
    updatedAt: now,
  };
};

export const applyDamageAction = (
  snapshot: GameSnapshot,
  amount: number,
  source: 'tap' | 'passive',
  options: {
    comboCount?: number;
    isCrit?: boolean;
    now?: string;
  } = {},
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
  const hitEvent = {
    type: 'monster_hit' as const,
    comboCount: options.comboCount ?? snapshot.comboCount,
    damage,
    isCrit: options.isCrit ?? false,
    monsterHealth: Math.max(0, nextMonsterHealth),
    source,
    stage: snapshot.stage,
  };
  if (nextMonsterHealth > 0) {
    const updatedSnapshot = touchSnapshot({
      ...snapshot,
      gold: source === 'tap' ? snapshot.gold + damage * GAME_BALANCE.clickGoldMultiplier : snapshot.gold,
      monsterHealth: nextMonsterHealth,
    }, options.now);

    return {
      snapshot: updatedSnapshot,
      events: [hitEvent],
    };
  }

  const defeatedStage = snapshot.stage;
  const nextStage = defeatedStage + 1;
  const nextMonsterMaxHealth = getMonsterMaxHealth(nextStage);
  const defeatedStageBand = getStageBandForStage(defeatedStage);
  const defeatedBoss = isBossStage(defeatedStage);
  const goldReward = defeatedBoss
    ? snapshot.monsterMaxHealth * defeatedStageBand.boss.goldMultiplier
    : snapshot.monsterMaxHealth * GAME_BALANCE.killGoldMultiplier;
  const gemReward = defeatedBoss ? defeatedStageBand.boss.gemReward : 0;

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gold: snapshot.gold + goldReward + (source === 'tap' ? damage * GAME_BALANCE.clickGoldMultiplier : 0),
    gems: snapshot.gems + gemReward,
    stage: nextStage,
    monsterMaxHealth: nextMonsterMaxHealth,
    monsterHealth: nextMonsterMaxHealth,
  }, options.now);

  return {
    snapshot: updatedSnapshot,
    events: [
      hitEvent,
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

interface CombatBatchOptions {
  nowMs?: number;
  random?: () => number;
}

export const applyCombatBatchAction = (
  snapshot: GameSnapshot,
  tapCount: number,
  passiveTicks: number,
  options: CombatBatchOptions = {},
): GameActionResult => {
  const normalizedTapCount = Math.max(0, Math.floor(tapCount));
  const normalizedPassiveTicks = Math.max(0, Math.floor(passiveTicks));
  if (normalizedTapCount === 0 && normalizedPassiveTicks === 0) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'combat_batch_empty' }],
    };
  }

  const nowMs = options.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const comboExpiresAtMs = snapshot.comboExpiresAt ? Date.parse(snapshot.comboExpiresAt) : 0;
  let comboCount = Number.isFinite(comboExpiresAtMs) && comboExpiresAtMs > nowMs
    ? Math.max(0, Math.floor(snapshot.comboCount))
    : 0;
  let currentSnapshot = snapshot;
  const events: GameActionResult['events'] = [];
  const random = options.random ?? Math.random;
  const baseClickPower = getBaseClickPower(snapshot.heroes);

  for (let index = 0; index < normalizedTapCount; index += 1) {
    const isCrit = random() < GAME_BALANCE.critChance;
    const damage = baseClickPower
      * getComboMultiplier(comboCount)
      * (isCrit ? GAME_BALANCE.critMultiplier : 1);
    comboCount = Math.min(MAX_COMBO_HITS, comboCount + 1);

    const result = applyDamageAction(currentSnapshot, damage, 'tap', {
      comboCount,
      isCrit,
      now,
    });
    currentSnapshot = result.snapshot;
    events.push(...result.events);
  }

  const passivePower = getPassivePower(snapshot.heroes);
  for (let index = 0; index < normalizedPassiveTicks && passivePower > 0; index += 1) {
    const result = applyDamageAction(currentSnapshot, passivePower, 'passive', {
      comboCount,
      now,
    });
    currentSnapshot = result.snapshot;
    events.push(...result.events);
  }

  const comboExpiresAt = normalizedTapCount > 0
    ? new Date(nowMs + GAME_BALANCE.comboDecayMs).toISOString()
    : (comboExpiresAtMs > nowMs ? snapshot.comboExpiresAt : null);

  return {
    snapshot: touchSnapshot({
      ...currentSnapshot,
      comboCount,
      comboExpiresAt,
    }, now),
    events,
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

export const claimOfflineRewardsAction = (snapshot: GameSnapshot, nowMs = Date.now()): GameActionResult => {
  const now = new Date(nowMs).toISOString();
  const elapsedSeconds = getOfflineElapsedSeconds(snapshot.lastSeenAt, nowMs);
  const cappedSeconds = Math.min(elapsedSeconds, GAME_BALANCE.offlineRewardMaxSeconds);
  const rewardedSeconds = cappedSeconds >= GAME_BALANCE.offlineRewardMinSeconds ? cappedSeconds : 0;
  const passivePower = getHeroPassivePower(snapshot);
  const goldReward = Math.floor(passivePower * rewardedSeconds * GAME_BALANCE.offlineGoldPerPowerSecond);

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gold: snapshot.gold + goldReward,
  }, now);

  return {
    snapshot: updatedSnapshot,
    events: [{
      type: 'offline_rewards_claimed',
      elapsedSeconds,
      cappedSeconds,
      passivePower,
      goldReward,
    }],
  };
};

export const applyGameAction = (snapshot: GameSnapshot, action: GameAction): GameActionResult => {
  switch (action.type) {
    case 'combat_batch':
      return applyCombatBatchAction(snapshot, action.tapCount, action.passiveTicks);
    case 'summon':
      return summonHeroAction(snapshot, action.randomValue);
    case 'upgrade_hero':
      return upgradeHeroAction(snapshot, action.heroId);
    case 'claim_offline_rewards':
      return claimOfflineRewardsAction(snapshot);
  }
};
