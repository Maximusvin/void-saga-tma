import {
  BOSS_EMOJI,
  BOSS_PHASES,
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  MONSTER_EMOJIS,
  RARITY_COLORS,
  RARITY_GRADIENTS,
  RARITY_ORDER,
  STAGE_BANDS,
  SUMMON_POOL,
  getHeroTemplateById,
  getStageBandForStage,
} from './content';
import type { Hero, HeroRarity, HeroUpgradeAmount, SummonHeroTemplate } from './types';
import {
  ONE_GAME_NUMBER,
  ZERO_GAME_NUMBER,
  addGameNumbers,
  compareGameNumbers,
  floorGameNumber,
  gameNumber,
  multiplyGameNumbers,
  powGameNumber,
  type GameNumberInput,
} from './gameNumber';

export {
  BOSS_EMOJI,
  BOSS_PHASES,
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  MONSTER_EMOJIS,
  RARITY_COLORS,
  RARITY_GRADIENTS,
  RARITY_ORDER,
  STAGE_BANDS,
  SUMMON_POOL,
  getHeroTemplateById,
  getStageBandForStage,
};

export const GAME_BALANCE = {
  storageKey: 'rift_heroes_save',
  initialGold: 1000,
  initialGems: 30,
  initialStage: 1,
  baseMonsterHealth: STAGE_BANDS[0].baseMonsterHealth,
  monsterHealthGrowth: STAGE_BANDS[0].monsterHealthGrowth,
  bossEveryStages: STAGE_BANDS[0].boss.everyStages,
  bossHealthMultiplier: STAGE_BANDS[0].boss.healthMultiplier,
  clickHeroPowerMultiplier: 0.1,
  comboBonusPerHit: 0.02,
  comboMaxBonus: 2,
  comboDecayMs: 1500,
  comboDecayTickMs: 500,
  killGoldMultiplier: 0.18,
  bossGoldMultiplier: STAGE_BANDS[0].boss.goldMultiplier,
  bossGemReward: STAGE_BANDS[0].boss.gemReward,
  clickGoldMultiplier: 0.1,
  passiveTickMs: 1000,
  // The client batches idle ticks instead of posting one request per second.
  maxPassiveTicksPerBatch: 10,
  // How far a batch may reach back for unclaimed ticks. Longer absences are
  // paid out by claim_offline_rewards, not by passive combat.
  passiveTickCatchUpMs: 15_000,
  offlineRewardMinSeconds: 60,
  offlineRewardMaxSeconds: 8 * 60 * 60,
  offlineGoldPerPowerSecond: 0.025,
  // Gold is still credited from 60s away, but the welcome-back modal only
  // interrupts the player after a meaningful absence so tab-aways stay silent.
  offlineRewardModalMinSeconds: 5 * 60,
  summonCostGems: 10,
  legendaryPityPulls: 60,
  summonChargeMs: 1500,
  summonRevealMs: 1500,
  ascensionBaseLevelCap: 50,
  ascensionLevelsPerRank: 50,
  ascensionShardCostByRarity: {
    Common: 3,
    Rare: 2,
    Epic: 2,
    Legendary: 3,
  },
  duplicateShardsByRarity: {
    Common: 1,
    Rare: 2,
    Epic: 3,
    Legendary: 5,
  },
  upgradeBaseGold: 100,
  upgradeCostGrowth: 1.5,
  upgradeRarityCostMultiplier: {
    Common: 1,
    Rare: 1.8,
    Epic: 3.4,
    Legendary: 7,
  },
  upgradePowerMultiplier: 1.5,
  maxBulkUpgradeLevels: 50,
  critChance: 0.1,
  critMultiplier: 2,
  hitFlashMs: 50,
  damageTextLifetimeMs: 800,
  passiveVolleyTravelMs: 420,
  passiveVolleyFeedbackMs: 720,
} as const;

const normalizeStage = (stage: number) => {
  return Number.isFinite(stage) && Number.isSafeInteger(Math.floor(stage))
    ? Math.max(1, Math.floor(stage))
    : GAME_BALANCE.initialStage;
};

export const isBossStage = (stage: number) => {
  const normalizedStage = normalizeStage(stage);
  const stageBand = getStageBandForStage(normalizedStage);
  return normalizedStage % stageBand.boss.everyStages === 0;
};

export const getBossAttemptDurationMs = (stage: number) => {
  const normalizedStage = normalizeStage(stage);
  return getStageBandForStage(normalizedStage).boss.attemptSeconds * 1000;
};

export const getBossPhaseForHealthPercent = (stage: number, healthPercent: number) => {
  const normalizedPercent = Number.isFinite(healthPercent)
    ? Math.max(0, Math.min(100, healthPercent))
    : 100;
  const phases = getStageBandForStage(normalizeStage(stage)).boss.phases;
  return phases.find(phase => normalizedPercent >= phase.minimumHealthPercent) ?? phases[phases.length - 1];
};

export const getMonsterMaxHealth = (stage: number) => {
  return getEncounterMaxHealth(stage, 0);
};

export const getEnemiesInStage = (stage: number) => {
  const normalizedStage = normalizeStage(stage);
  return isBossStage(normalizedStage)
    ? 1
    : getStageBandForStage(normalizedStage).normalEnemiesPerStage;
};

export const normalizeEnemyIndex = (stage: number, enemyIndex: number) => {
  const normalizedIndex = Number.isFinite(enemyIndex) ? Math.max(0, Math.floor(enemyIndex)) : 0;
  return Math.min(normalizedIndex, getEnemiesInStage(stage) - 1);
};

export const getEncounterMaxHealth = (stage: number, enemyIndex: number) => {
  const normalizedStage = normalizeStage(stage);
  const stageBand = getStageBandForStage(normalizedStage);
  const normalizedEnemyIndex = normalizeEnemyIndex(normalizedStage, enemyIndex);
  const scaledHealth = floorGameNumber(
    multiplyGameNumbers(
      stageBand.baseMonsterHealth,
      powGameNumber(stageBand.monsterHealthGrowth, normalizedStage - 1),
    ),
  );

  return multiplyGameNumbers(
    scaledHealth,
    isBossStage(normalizedStage)
      ? stageBand.boss.healthMultiplier
      : powGameNumber(stageBand.normalEnemyHealthGrowth, normalizedEnemyIndex),
  );
};

export const getBaseClickPower = (heroes: Hero[]) => {
  return addGameNumbers(
    ONE_GAME_NUMBER,
    ...heroes.map(hero => multiplyGameNumbers(hero.power, GAME_BALANCE.clickHeroPowerMultiplier)),
  );
};

export const getPassivePower = (heroes: Hero[]) => {
  return addGameNumbers(...heroes.map(hero => hero.power));
};

export const getComboMultiplier = (comboCount: number) => {
  return 1 + Math.min(comboCount * GAME_BALANCE.comboBonusPerHit, GAME_BALANCE.comboMaxBonus);
};

export const MAX_COMBO_HITS = Math.ceil(GAME_BALANCE.comboMaxBonus / GAME_BALANCE.comboBonusPerHit);

export const getUpgradeCost = (hero: Pick<Hero, 'level' | 'rarity'>) => {
  return floorGameNumber(multiplyGameNumbers(
    GAME_BALANCE.upgradeBaseGold,
    GAME_BALANCE.upgradeRarityCostMultiplier[hero.rarity],
    powGameNumber(GAME_BALANCE.upgradeCostGrowth, Math.max(0, hero.level - 1)),
  ));
};

export const getHeroLevelCap = (hero: Pick<Hero, 'ascension'>) => {
  return GAME_BALANCE.ascensionBaseLevelCap +
    Math.max(0, Math.floor(hero.ascension)) * GAME_BALANCE.ascensionLevelsPerRank;
};

export const getAscensionShardCost = (hero: Pick<Hero, 'ascension' | 'rarity'>) => {
  return GAME_BALANCE.ascensionShardCostByRarity[hero.rarity];
};

export const getDuplicateShardReward = (rarity: HeroRarity) => {
  return GAME_BALANCE.duplicateShardsByRarity[rarity];
};

export const isHeroAtLevelCap = (hero: Pick<Hero, 'ascension' | 'level'>) => {
  return hero.level >= getHeroLevelCap(hero);
};

export const getNextHeroPower = (hero: Pick<Hero, 'power'>) => {
  return multiplyGameNumbers(hero.power, GAME_BALANCE.upgradePowerMultiplier);
};

export const getHeroUpgradeQuote = (
  hero: Pick<Hero, 'ascension' | 'level' | 'power' | 'rarity'>,
  availableGold: GameNumberInput,
  amount: HeroUpgradeAmount = 1,
) => {
  const levelCap = getHeroLevelCap(hero);
  const requestedLevels = amount === 'max' ? GAME_BALANCE.maxBulkUpgradeLevels : amount;
  const maximumLevels = Math.min(
    requestedLevels,
    GAME_BALANCE.maxBulkUpgradeLevels,
    Math.max(0, levelCap - hero.level),
  );
  const gold = gameNumber(availableGold);
  let goldCost = ZERO_GAME_NUMBER;
  let level = hero.level;
  let power = hero.power;

  for (let index = 0; index < maximumLevels; index += 1) {
    const nextCost = getUpgradeCost({ level, rarity: hero.rarity });
    const nextTotalCost = addGameNumbers(goldCost, nextCost);
    if (compareGameNumbers(nextTotalCost, gold) > 0) {
      break;
    }

    goldCost = nextTotalCost;
    level += 1;
    power = getNextHeroPower({ power });
  }

  return {
    goldCost,
    level,
    levelsGained: level - hero.level,
    power,
  };
};

export const getHeroIcon = (rarity: HeroRarity) => {
  return SUMMON_POOL.find(hero => hero.rarity === rarity)?.icon ?? '🛡️';
};

export const getSummonDropPercent = (template: SummonHeroTemplate) => {
  return Math.round(template.dropRate * 100);
};

export const getSummonsUntilLegendaryPity = (summonPity: number) => {
  const normalizedPity = Number.isFinite(summonPity) ? Math.max(0, Math.floor(summonPity)) : 0;
  return Math.max(1, GAME_BALANCE.legendaryPityPulls - normalizedPity);
};

export const rollSummonTemplate = (
  randomValue = Math.random(),
  guaranteedRarity?: HeroRarity,
) => {
  const normalizedRoll = Math.max(0, Math.min(randomValue, 0.999999));
  const pool = guaranteedRarity
    ? SUMMON_POOL.filter(hero => hero.rarity === guaranteedRarity)
    : SUMMON_POOL;
  const totalRate = pool.reduce((total, hero) => total + hero.dropRate, 0);
  let cumulativeRate = 0;

  for (const hero of pool) {
    cumulativeRate += hero.dropRate / totalRate;
    if (normalizedRoll < cumulativeRate) {
      return hero;
    }
  }

  return pool[pool.length - 1];
};
