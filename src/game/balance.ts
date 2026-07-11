import {
  BOSS_EMOJI,
  BOSS_PHASES,
  ENEMY_TRAITS,
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  MONSTER_EMOJIS,
  RARITY_COLORS,
  RARITY_GRADIENTS,
  RARITY_ORDER,
  STAGE_BANDS,
  SUMMON_POOL,
  SUMMON_RARITY_RATES,
  getHeroTemplateById,
  getEnemyTraitById,
  getStageBandForStage,
} from './content';
import type { Hero, HeroCombatProfile, HeroRarity, HeroUpgradeAmount } from './types';
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
  ENEMY_TRAITS,
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  MONSTER_EMOJIS,
  RARITY_COLORS,
  RARITY_GRADIENTS,
  RARITY_ORDER,
  STAGE_BANDS,
  SUMMON_POOL,
  SUMMON_RARITY_RATES,
  getHeroTemplateById,
  getEnemyTraitById,
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
  legendaryPityPulls: 80,
  legendarySoftPityStartsAt: 60,
  legendarySoftPityRateIncrease: 0.03,
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

export const getEnemyTraitForEncounter = (stage: number, enemyIndex: number) => {
  const normalizedStage = normalizeStage(stage);
  const stageBand = getStageBandForStage(normalizedStage);
  if (isBossStage(normalizedStage) || normalizedStage < 6) {
    return getEnemyTraitById('unbound');
  }

  const normalizedEnemyIndex = normalizeEnemyIndex(normalizedStage, enemyIndex);
  const traitIndex = (normalizedStage + normalizedEnemyIndex) % stageBand.normalEnemyTraitIds.length;
  return getEnemyTraitById(stageBand.normalEnemyTraitIds[traitIndex]);
};

export const getEncounterCombatRule = (
  stage: number,
  enemyIndex: number,
  healthPercent: number,
) => {
  return isBossStage(stage)
    ? getBossPhaseForHealthPercent(stage, healthPercent)
    : getEnemyTraitForEncounter(stage, enemyIndex);
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

const DEFAULT_HERO_COMBAT_PROFILE: Readonly<HeroCombatProfile> = {
  passivePowerMultiplier: 1,
  tapPowerMultiplier: 1,
};

export const getHeroCombatProfile = (hero: Pick<Hero, 'templateId'>) => {
  return getHeroTemplateById(hero.templateId)?.combatProfile ?? DEFAULT_HERO_COMBAT_PROFILE;
};

export const getHeroCombatFocus = (hero: Pick<Hero, 'templateId'>): 'Balanced' | 'Idle' | 'Tap' => {
  const profile = getHeroCombatProfile(hero);
  if (profile.tapPowerMultiplier > 1) {
    return 'Tap';
  }
  if (profile.passivePowerMultiplier > 1) {
    return 'Idle';
  }
  return 'Balanced';
};

export const getHeroTapPower = (hero: Pick<Hero, 'power' | 'templateId'>) => {
  return multiplyGameNumbers(
    hero.power,
    GAME_BALANCE.clickHeroPowerMultiplier,
    getHeroCombatProfile(hero).tapPowerMultiplier,
  );
};

export const getHeroPassivePower = (hero: Pick<Hero, 'power' | 'templateId'>) => {
  return multiplyGameNumbers(
    hero.power,
    getHeroCombatProfile(hero).passivePowerMultiplier,
  );
};

export const getBaseClickPower = (heroes: Hero[]) => {
  return addGameNumbers(
    ONE_GAME_NUMBER,
    ...heroes.map(getHeroTapPower),
  );
};

export const getPassivePower = (heroes: Hero[]) => {
  return addGameNumbers(...heroes.map(getHeroPassivePower));
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

export const getBaseDuplicateShardReward = (rarity: HeroRarity) => {
  return GAME_BALANCE.duplicateShardsByRarity[rarity];
};

export const getDuplicateShardReward = (rarity: HeroRarity) => {
  const templatesInRarity = SUMMON_POOL.filter(template => template.rarity === rarity).length;
  return getBaseDuplicateShardReward(rarity) * Math.max(1, templatesInRarity);
};

export const getNewHeroShardReward = (rarity: HeroRarity, ownsHeroInRarity: boolean) => {
  return ownsHeroInRarity ? getBaseDuplicateShardReward(rarity) : 0;
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

export const getSummonRarityRates = (summonPity = 0): Record<HeroRarity, number> => {
  const normalizedPity = Number.isFinite(summonPity) ? Math.max(0, Math.floor(summonPity)) : 0;
  const hardPityIndex = GAME_BALANCE.legendaryPityPulls - 1;
  const legendaryRate = normalizedPity >= hardPityIndex
    ? 1
    : Math.min(
      1,
      SUMMON_RARITY_RATES.Legendary + (
        normalizedPity >= GAME_BALANCE.legendarySoftPityStartsAt
          ? (normalizedPity - GAME_BALANCE.legendarySoftPityStartsAt + 1) *
            GAME_BALANCE.legendarySoftPityRateIncrease
          : 0
      ),
    );
  const baseNonLegendaryRate = 1 - SUMMON_RARITY_RATES.Legendary;
  const nonLegendaryScale = (1 - legendaryRate) / baseNonLegendaryRate;

  return {
    Common: SUMMON_RARITY_RATES.Common * nonLegendaryScale,
    Rare: SUMMON_RARITY_RATES.Rare * nonLegendaryScale,
    Epic: SUMMON_RARITY_RATES.Epic * nonLegendaryScale,
    Legendary: legendaryRate,
  };
};

export const getSummonDropPercent = (rarity: HeroRarity, summonPity = 0) => {
  return Math.round(getSummonRarityRates(summonPity)[rarity] * 1_000) / 10;
};

export const getSummonsUntilLegendaryPity = (summonPity: number) => {
  const normalizedPity = Number.isFinite(summonPity) ? Math.max(0, Math.floor(summonPity)) : 0;
  return Math.max(1, GAME_BALANCE.legendaryPityPulls - normalizedPity);
};

export const rollSummonTemplate = (
  rarityRandomValue = Math.random(),
  templateRandomValue = Math.random(),
  summonPity = 0,
  guaranteedRarity?: HeroRarity,
) => {
  const normalizedRarityRoll = Math.max(0, Math.min(rarityRandomValue, 0.999999));
  const normalizedTemplateRoll = Math.max(0, Math.min(templateRandomValue, 0.999999));
  const rarityRates = getSummonRarityRates(summonPity);
  let rarity = guaranteedRarity ?? HERO_RARITIES[HERO_RARITIES.length - 1];
  let cumulativeRarityRate = 0;

  if (!guaranteedRarity) {
    for (const candidateRarity of HERO_RARITIES) {
      cumulativeRarityRate += rarityRates[candidateRarity];
      if (normalizedRarityRoll < cumulativeRarityRate) {
        rarity = candidateRarity;
        break;
      }
    }
  }

  const pool = SUMMON_POOL.filter(hero => hero.rarity === rarity);
  const totalWeight = pool.reduce((total, hero) => total + hero.summonWeight, 0);
  let cumulativeTemplateWeight = 0;

  for (const hero of pool) {
    cumulativeTemplateWeight += hero.summonWeight / totalWeight;
    if (normalizedTemplateRoll < cumulativeTemplateWeight) {
      return hero;
    }
  }

  return pool[pool.length - 1];
};
