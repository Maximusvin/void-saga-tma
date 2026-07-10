import {
  GAME_BALANCE,
  MAX_COMBO_HITS,
  getBossAttemptDurationMs,
  getAscensionShardCost,
  getBaseClickPower,
  getComboMultiplier,
  getDuplicateShardReward,
  getHeroLevelCap,
  getHeroUpgradeQuote,
  getMonsterMaxHealth,
  getPassivePower,
  getStageBandForStage,
  isHeroAtLevelCap,
  isBossStage,
  rollSummonTemplate,
} from './balance';
import {
  ZERO_GAME_NUMBER,
  addGameNumbers,
  compareGameNumbers,
  floorGameNumber,
  gameNumber,
  isPositiveGameNumber,
  multiplyGameNumbers,
  subtractGameNumbers,
  type GameNumber,
} from './gameNumber';
import {
  GAME_SNAPSHOT_SCHEMA_VERSION,
  type GameAction,
  type GameActionResult,
  type GameSnapshot,
  type Hero,
  type HeroUpgradeAmount,
} from './types';

const nowIso = () => new Date().toISOString();

const touchSnapshot = (snapshot: GameSnapshot, now = nowIso()): GameSnapshot => {
  return { ...snapshot, lastSeenAt: now, updatedAt: now };
};

const getHeroPassivePower = (snapshot: Pick<GameSnapshot, 'heroes'>) => {
  return getPassivePower(snapshot.heroes);
};

const getOfflineElapsedSeconds = (lastSeenAt: string, nowMs: number) => {
  const lastSeenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((nowMs - lastSeenMs) / 1000));
};

const createBossAttemptEndsAt = (stage: number, nowMs: number) => {
  return new Date(nowMs + getBossAttemptDurationMs(stage)).toISOString();
};

const prepareBossAttempt = (snapshot: GameSnapshot, nowMs: number): GameActionResult => {
  if (!isBossStage(snapshot.stage)) {
    return {
      snapshot: snapshot.bossEncounterEndsAt === null
        ? snapshot
        : { ...snapshot, bossEncounterEndsAt: null },
      events: [],
    };
  }

  const currentAttemptEndsAtMs = snapshot.bossEncounterEndsAt
    ? Date.parse(snapshot.bossEncounterEndsAt)
    : Number.NaN;
  if (Number.isFinite(currentAttemptEndsAtMs) && currentAttemptEndsAtMs > nowMs) {
    return { snapshot, events: [] };
  }

  const attemptEndsAt = createBossAttemptEndsAt(snapshot.stage, nowMs);
  const wasDamaged = compareGameNumbers(snapshot.monsterHealth, snapshot.monsterMaxHealth) < 0;
  const nextSnapshot: GameSnapshot = {
    ...snapshot,
    bossEncounterEndsAt: attemptEndsAt,
    comboCount: wasDamaged ? 0 : snapshot.comboCount,
    comboExpiresAt: wasDamaged ? null : snapshot.comboExpiresAt,
    monsterHealth: wasDamaged ? snapshot.monsterMaxHealth : snapshot.monsterHealth,
  };

  return {
    snapshot: nextSnapshot,
    events: wasDamaged
      ? [{
          type: 'boss_enraged',
          attemptEndsAt,
          monsterHealth: nextSnapshot.monsterHealth,
          stage: snapshot.stage,
        }]
      : [],
  };
};

export const createInitialGameSnapshot = (): GameSnapshot => {
  const stage = GAME_BALANCE.initialStage;
  const monsterMaxHealth = getMonsterMaxHealth(stage);

  const now = nowIso();
  return {
    schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
    bossEncounterEndsAt: null,
    comboCount: 0,
    comboExpiresAt: null,
    gold: gameNumber(GAME_BALANCE.initialGold),
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
  damage: GameNumber,
  source: 'tap' | 'passive',
  options: {
    comboCount?: number;
    isCrit?: boolean;
    now?: string;
  } = {},
): GameActionResult => {
  if (!isPositiveGameNumber(damage)) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'damage_must_be_positive' }],
    };
  }

  if (!isPositiveGameNumber(snapshot.monsterHealth)) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'monster_already_defeated' }],
    };
  }

  const actionNow = options.now ?? nowIso();

  const nextMonsterHealth = subtractGameNumbers(snapshot.monsterHealth, damage);
  const hitEvent = {
    type: 'monster_hit' as const,
    comboCount: options.comboCount ?? snapshot.comboCount,
    damage,
    isCrit: options.isCrit ?? false,
    monsterHealth: nextMonsterHealth,
    source,
    stage: snapshot.stage,
  };
  if (isPositiveGameNumber(nextMonsterHealth)) {
    const updatedSnapshot = touchSnapshot({
      ...snapshot,
      gold: source === 'tap'
        ? addGameNumbers(snapshot.gold, multiplyGameNumbers(damage, GAME_BALANCE.clickGoldMultiplier))
        : snapshot.gold,
      monsterHealth: nextMonsterHealth,
    }, actionNow);

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
    ? multiplyGameNumbers(snapshot.monsterMaxHealth, defeatedStageBand.boss.goldMultiplier)
    : multiplyGameNumbers(snapshot.monsterMaxHealth, GAME_BALANCE.killGoldMultiplier);
  const gemReward = defeatedBoss ? defeatedStageBand.boss.gemReward : 0;
  const actionNowMs = Date.parse(actionNow);

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    bossEncounterEndsAt: isBossStage(nextStage)
      ? createBossAttemptEndsAt(nextStage, Number.isFinite(actionNowMs) ? actionNowMs : Date.now())
      : null,
    gold: addGameNumbers(
      snapshot.gold,
      goldReward,
      source === 'tap' ? multiplyGameNumbers(damage, GAME_BALANCE.clickGoldMultiplier) : ZERO_GAME_NUMBER,
    ),
    gems: snapshot.gems + gemReward,
    stage: nextStage,
    monsterMaxHealth: nextMonsterMaxHealth,
    monsterHealth: nextMonsterMaxHealth,
  }, actionNow);

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
  const preparedBossAttempt = prepareBossAttempt(snapshot, nowMs);
  const comboExpiresAtMs = preparedBossAttempt.snapshot.comboExpiresAt
    ? Date.parse(preparedBossAttempt.snapshot.comboExpiresAt)
    : 0;
  let comboCount = Number.isFinite(comboExpiresAtMs) && comboExpiresAtMs > nowMs
    ? Math.max(0, Math.floor(preparedBossAttempt.snapshot.comboCount))
    : 0;
  let currentSnapshot = preparedBossAttempt.snapshot;
  const events: GameActionResult['events'] = [...preparedBossAttempt.events];
  const random = options.random ?? Math.random;
  const baseClickPower = getBaseClickPower(currentSnapshot.heroes);

  for (let index = 0; index < normalizedTapCount; index += 1) {
    const isCrit = random() < GAME_BALANCE.critChance;
    const damage = multiplyGameNumbers(
      baseClickPower,
      getComboMultiplier(comboCount),
      isCrit ? GAME_BALANCE.critMultiplier : 1,
    );
    comboCount = Math.min(MAX_COMBO_HITS, comboCount + 1);

    const result = applyDamageAction(currentSnapshot, damage, 'tap', {
      comboCount,
      isCrit,
      now,
    });
    currentSnapshot = result.snapshot;
    events.push(...result.events);
  }

  const passivePower = getPassivePower(currentSnapshot.heroes);
  for (let index = 0; index < normalizedPassiveTicks && isPositiveGameNumber(passivePower); index += 1) {
    const result = applyDamageAction(currentSnapshot, passivePower, 'passive', {
      comboCount,
      now,
    });
    currentSnapshot = result.snapshot;
    events.push(...result.events);
  }

  const comboExpiresAt = normalizedTapCount > 0
    ? new Date(nowMs + GAME_BALANCE.comboDecayMs).toISOString()
    : (comboExpiresAtMs > nowMs ? currentSnapshot.comboExpiresAt : null);

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
  const existingHero = snapshot.heroes.find(hero => hero.templateId === template.id);
  if (existingHero) {
    const shardsGranted = getDuplicateShardReward(existingHero.rarity);
    const hero = {
      ...existingHero,
      shards: existingHero.shards + shardsGranted,
    };
    const updatedSnapshot = touchSnapshot({
      ...snapshot,
      gems: snapshot.gems - GAME_BALANCE.summonCostGems,
      heroes: snapshot.heroes.map(current => current.id === hero.id ? hero : current),
    });

    return {
      snapshot: updatedSnapshot,
      events: [{
        type: 'hero_summoned',
        hero,
        costGems: GAME_BALANCE.summonCostGems,
        isDuplicate: true,
        shardsGranted,
      }],
    };
  }

  const hero: Hero = {
    ascension: 0,
    id: template.id,
    name: template.name,
    rarity: template.rarity,
    level: 1,
    power: gameNumber(template.power),
    shards: 0,
    templateId: template.id,
  };

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gems: snapshot.gems - GAME_BALANCE.summonCostGems,
    heroes: [...snapshot.heroes, hero],
  });

  return {
    snapshot: updatedSnapshot,
    events: [{
      type: 'hero_summoned',
      hero,
      costGems: GAME_BALANCE.summonCostGems,
      isDuplicate: false,
      shardsGranted: 0,
    }],
  };
};

export const upgradeHeroAction = (
  snapshot: GameSnapshot,
  heroId: string,
  amount: HeroUpgradeAmount = 1,
): GameActionResult => {
  const heroToUpgrade = snapshot.heroes.find(hero => hero.id === heroId);
  if (!heroToUpgrade) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'hero_not_found' }],
    };
  }

  if (isHeroAtLevelCap(heroToUpgrade)) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'level_cap_reached' }],
    };
  }

  const quote = getHeroUpgradeQuote(heroToUpgrade, snapshot.gold, amount);
  if (quote.levelsGained === 0) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'not_enough_gold' }],
    };
  }

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gold: subtractGameNumbers(snapshot.gold, quote.goldCost),
    heroes: snapshot.heroes.map(hero => {
      if (hero.id !== heroId) {
        return hero;
      }

      return {
        ...hero,
        level: quote.level,
        power: quote.power,
      };
    }),
  });

  return {
    snapshot: updatedSnapshot,
    events: [{
      type: 'hero_upgraded',
      heroId,
      fromLevel: heroToUpgrade.level,
      goldCost: quote.goldCost,
      level: quote.level,
      levelsGained: quote.levelsGained,
      power: quote.power,
    }],
  };
};

export const ascendHeroAction = (snapshot: GameSnapshot, heroId: string): GameActionResult => {
  const heroToAscend = snapshot.heroes.find(hero => hero.id === heroId);
  if (!heroToAscend) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'hero_not_found' }],
    };
  }

  if (!isHeroAtLevelCap(heroToAscend)) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'level_cap_not_reached' }],
    };
  }

  const shardsSpent = getAscensionShardCost(heroToAscend);
  if (heroToAscend.shards < shardsSpent) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'not_enough_shards' }],
    };
  }

  const ascendedHero = {
    ...heroToAscend,
    ascension: heroToAscend.ascension + 1,
    shards: heroToAscend.shards - shardsSpent,
  };
  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    heroes: snapshot.heroes.map(hero => hero.id === heroId ? ascendedHero : hero),
  });

  return {
    snapshot: updatedSnapshot,
    events: [{
      type: 'hero_ascended',
      heroId,
      ascension: ascendedHero.ascension,
      levelCap: getHeroLevelCap(ascendedHero),
      shardsRemaining: ascendedHero.shards,
      shardsSpent,
    }],
  };
};

export const claimOfflineRewardsAction = (snapshot: GameSnapshot, nowMs = Date.now()): GameActionResult => {
  const now = new Date(nowMs).toISOString();
  const elapsedSeconds = getOfflineElapsedSeconds(snapshot.lastSeenAt, nowMs);
  const cappedSeconds = Math.min(elapsedSeconds, GAME_BALANCE.offlineRewardMaxSeconds);
  const rewardedSeconds = cappedSeconds >= GAME_BALANCE.offlineRewardMinSeconds ? cappedSeconds : 0;
  const passivePower = getHeroPassivePower(snapshot);
  const goldReward = floorGameNumber(
    multiplyGameNumbers(passivePower, rewardedSeconds, GAME_BALANCE.offlineGoldPerPowerSecond),
  );

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    gold: addGameNumbers(snapshot.gold, goldReward),
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
      return upgradeHeroAction(snapshot, action.heroId, action.amount);
    case 'ascend_hero':
      return ascendHeroAction(snapshot, action.heroId);
    case 'claim_offline_rewards':
      return claimOfflineRewardsAction(snapshot);
  }
};
