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
  getNewHeroShardReward,
  getEncounterMaxHealth,
  getEnemiesInStage,
  getPassivePower,
  getStageBandForStage,
  getSummonsUntilLegendaryPity,
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
  minGameNumbers,
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
  type HeroDamageContribution,
  type HeroUpgradeAmount,
} from './types';
import { MAX_ACTIVE_WARBAND_HEROES, getActiveWarbandHeroes } from './warband';

const nowIso = () => new Date().toISOString();

const touchSnapshot = (snapshot: GameSnapshot, now = nowIso()): GameSnapshot => {
  return { ...snapshot, lastSeenAt: now, updatedAt: now };
};

const getHeroPassivePower = (snapshot: Pick<GameSnapshot, 'activeHeroIds' | 'heroes'>) => {
  return getPassivePower(getActiveWarbandHeroes(snapshot));
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
  const enemyIndex = 0;
  const monsterMaxHealth = getEncounterMaxHealth(stage, enemyIndex);

  const now = nowIso();
  return {
    schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
    activeHeroIds: [],
    bossEncounterEndsAt: null,
    comboCount: 0,
    comboExpiresAt: null,
    enemyIndex,
    gold: gameNumber(GAME_BALANCE.initialGold),
    gems: GAME_BALANCE.initialGems,
    heroes: [],
    stage,
    monsterMaxHealth,
    monsterHealth: monsterMaxHealth,
    lastPassiveTickAt: null,
    lastSeenAt: now,
    summonPity: 0,
    updatedAt: now,
  };
};

interface PassiveTickGrant {
  granted: number;
  lastPassiveTickAt: string | null;
}

/**
 * Idle income is paid per elapsed second, never per request. The watermark only
 * moves forward by the ticks actually granted, so a client that posts a batch
 * ten times in a row still earns exactly one second of damage per second.
 *
 * Reaching further back than `passiveTickCatchUpMs` is refused on purpose:
 * long absences belong to claim_offline_rewards, and an uncapped backlog would
 * let a returning player drain hours of idle income in a few requests.
 */
const grantPassiveTicks = (
  snapshot: GameSnapshot,
  requestedTicks: number,
  nowMs: number,
): PassiveTickGrant => {
  if (requestedTicks <= 0) {
    return { granted: 0, lastPassiveTickAt: snapshot.lastPassiveTickAt };
  }

  const watermarkMs = snapshot.lastPassiveTickAt ? Date.parse(snapshot.lastPassiveTickAt) : Number.NaN;
  const baselineMs = Number.isFinite(watermarkMs)
    ? Math.max(watermarkMs, nowMs - GAME_BALANCE.passiveTickCatchUpMs)
    : nowMs - GAME_BALANCE.passiveTickMs;
  const earnedTicks = Math.max(0, Math.floor((nowMs - baselineMs) / GAME_BALANCE.passiveTickMs));
  const granted = Math.min(requestedTicks, earnedTicks, GAME_BALANCE.maxPassiveTicksPerBatch);

  return {
    granted,
    lastPassiveTickAt: granted > 0
      ? new Date(baselineMs + granted * GAME_BALANCE.passiveTickMs).toISOString()
      : snapshot.lastPassiveTickAt,
  };
};

export const applyDamageAction = (
  snapshot: GameSnapshot,
  damage: GameNumber,
  source: 'tap' | 'passive',
  options: {
    comboCount?: number;
    heroContributions?: readonly HeroDamageContribution[];
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

  const appliedDamage = minGameNumbers(snapshot.monsterHealth, damage);
  const nextMonsterHealth = subtractGameNumbers(snapshot.monsterHealth, appliedDamage);
  const hitEvent = {
    type: 'monster_hit' as const,
    comboCount: options.comboCount ?? snapshot.comboCount,
    damage: appliedDamage,
    heroContributions: source === 'passive'
      ? [...(options.heroContributions ?? [])]
      : [],
    isCrit: options.isCrit ?? false,
    monsterHealth: nextMonsterHealth,
    source,
    stage: snapshot.stage,
  };
  if (isPositiveGameNumber(nextMonsterHealth)) {
    const updatedSnapshot = touchSnapshot({
      ...snapshot,
      gold: source === 'tap'
        ? addGameNumbers(snapshot.gold, multiplyGameNumbers(appliedDamage, GAME_BALANCE.clickGoldMultiplier))
        : snapshot.gold,
      monsterHealth: nextMonsterHealth,
    }, actionNow);

    return {
      snapshot: updatedSnapshot,
      events: [hitEvent],
    };
  }

  const defeatedStage = snapshot.stage;
  const defeatedEnemyIndex = snapshot.enemyIndex;
  const enemiesInStage = getEnemiesInStage(defeatedStage);
  const stageCleared = defeatedEnemyIndex + 1 >= enemiesInStage;
  const nextStage = stageCleared ? defeatedStage + 1 : defeatedStage;
  const nextEnemyIndex = stageCleared ? 0 : defeatedEnemyIndex + 1;
  const nextMonsterMaxHealth = getEncounterMaxHealth(nextStage, nextEnemyIndex);
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
      source === 'tap' ? multiplyGameNumbers(appliedDamage, GAME_BALANCE.clickGoldMultiplier) : ZERO_GAME_NUMBER,
    ),
    gems: snapshot.gems + gemReward,
    enemyIndex: nextEnemyIndex,
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
        enemiesInStage,
        enemyIndex: defeatedEnemyIndex,
        nextEnemyIndex,
        stage: defeatedStage,
        nextStage,
        stageCleared,
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
  const activeHeroes = getActiveWarbandHeroes(currentSnapshot);
  const baseClickPower = getBaseClickPower(activeHeroes);
  let encounterDefeated = false;

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
    if (result.events.some(event => event.type === 'monster_defeated')) {
      encounterDefeated = true;
      break;
    }
  }

  const passiveGrant = grantPassiveTicks(currentSnapshot, normalizedPassiveTicks, nowMs);
  if (normalizedTapCount === 0 && passiveGrant.granted === 0) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'passive_ticks_not_earned' }],
    };
  }

  const passiveContributions = activeHeroes
    .filter(hero => isPositiveGameNumber(hero.power))
    .map(hero => ({ damage: hero.power, heroId: hero.id }));
  const passivePower = addGameNumbers(...passiveContributions.map(contribution => contribution.damage));
  let processedPassiveTicks = 0;
  for (
    let index = 0;
    !encounterDefeated && index < passiveGrant.granted && isPositiveGameNumber(passivePower);
    index += 1
  ) {
    const result = applyDamageAction(currentSnapshot, passivePower, 'passive', {
      comboCount,
      heroContributions: passiveContributions,
      now,
    });
    currentSnapshot = result.snapshot;
    events.push(...result.events);
    processedPassiveTicks += 1;
    if (result.events.some(event => event.type === 'monster_defeated')) {
      encounterDefeated = true;
    }
  }

  const skippedPassiveTicks = passiveGrant.granted - processedPassiveTicks;
  const grantedWatermarkMs = passiveGrant.lastPassiveTickAt
    ? Date.parse(passiveGrant.lastPassiveTickAt)
    : Number.NaN;
  const lastPassiveTickAt = !encounterDefeated
    ? passiveGrant.lastPassiveTickAt
    : processedPassiveTicks === 0
      ? currentSnapshot.lastPassiveTickAt
      : new Date(grantedWatermarkMs - skippedPassiveTicks * GAME_BALANCE.passiveTickMs).toISOString();

  const comboExpiresAt = normalizedTapCount > 0
    ? new Date(nowMs + GAME_BALANCE.comboDecayMs).toISOString()
    : (comboExpiresAtMs > nowMs ? currentSnapshot.comboExpiresAt : null);

  return {
    snapshot: touchSnapshot({
      ...currentSnapshot,
      comboCount,
      comboExpiresAt,
      lastPassiveTickAt,
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

  const legendaryPityTriggered = snapshot.summonPity >= GAME_BALANCE.legendaryPityPulls - 1;
  const template = rollSummonTemplate(
    randomValue ?? Math.random(),
    randomValue ?? Math.random(),
    snapshot.summonPity,
    legendaryPityTriggered ? 'Legendary' : undefined,
  );
  const summonPity = template.rarity === 'Legendary' ? 0 : snapshot.summonPity + 1;
  const summonsUntilLegendaryPity = getSummonsUntilLegendaryPity(summonPity);
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
      summonPity,
    });

    return {
      snapshot: updatedSnapshot,
      events: [{
        type: 'hero_summoned',
        hero,
        costGems: GAME_BALANCE.summonCostGems,
        isDuplicate: true,
        legendaryPityTriggered,
        shardsGranted,
        summonsUntilLegendaryPity,
      }],
    };
  }

  const shardsGranted = getNewHeroShardReward(
    template.rarity,
    snapshot.heroes.some(currentHero => currentHero.rarity === template.rarity),
  );
  const hero: Hero = {
    ascension: 0,
    id: template.id,
    name: template.name,
    rarity: template.rarity,
    level: 1,
    power: gameNumber(template.power),
    shards: shardsGranted,
    templateId: template.id,
  };

  const updatedSnapshot = touchSnapshot({
    ...snapshot,
    activeHeroIds: snapshot.activeHeroIds.length < MAX_ACTIVE_WARBAND_HEROES
      ? [...snapshot.activeHeroIds, hero.id]
      : snapshot.activeHeroIds,
    gems: snapshot.gems - GAME_BALANCE.summonCostGems,
    heroes: [...snapshot.heroes, hero],
    summonPity,
  });

  return {
    snapshot: updatedSnapshot,
    events: [{
      type: 'hero_summoned',
      hero,
      costGems: GAME_BALANCE.summonCostGems,
      isDuplicate: false,
      legendaryPityTriggered,
      shardsGranted,
      summonsUntilLegendaryPity,
    }],
  };
};

export const setActiveWarbandAction = (
  snapshot: GameSnapshot,
  heroIds: readonly string[],
): GameActionResult => {
  if (heroIds.length > MAX_ACTIVE_WARBAND_HEROES || new Set(heroIds).size !== heroIds.length) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'invalid_warband' }],
    };
  }

  const ownedHeroIds = new Set(snapshot.heroes.map(hero => hero.id));
  if (heroIds.some(heroId => !ownedHeroIds.has(heroId))) {
    return {
      snapshot,
      events: [{ type: 'action_rejected', reason: 'hero_not_owned' }],
    };
  }

  const nextHeroIds = [...heroIds];
  return {
    snapshot: touchSnapshot({ ...snapshot, activeHeroIds: nextHeroIds }),
    events: [{ type: 'active_warband_updated', heroIds: nextHeroIds }],
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
    case 'set_active_warband':
      return setActiveWarbandAction(snapshot, action.heroIds);
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
