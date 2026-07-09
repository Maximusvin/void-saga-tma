import {
  BOSS_EMOJI,
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  MONSTER_EMOJIS,
  RARITY_COLORS,
  RARITY_GRADIENTS,
  RARITY_ORDER,
  STAGE_BANDS,
  SUMMON_POOL,
  getStageBandForStage,
} from './content';
import type { Hero, HeroRarity, SummonHeroTemplate } from './types';

export {
  BOSS_EMOJI,
  GAME_CONTENT,
  GAME_CONTENT_VERSION,
  HERO_RARITIES,
  MONSTER_EMOJIS,
  RARITY_COLORS,
  RARITY_GRADIENTS,
  RARITY_ORDER,
  STAGE_BANDS,
  SUMMON_POOL,
  getStageBandForStage,
};

export const GAME_BALANCE = {
  storageKey: 'rift_heroes_save',
  initialGold: 1000,
  initialGems: 50,
  initialStage: 1,
  baseMonsterHealth: STAGE_BANDS[0].baseMonsterHealth,
  monsterHealthGrowth: STAGE_BANDS[0].monsterHealthGrowth,
  bossEveryStages: STAGE_BANDS[0].boss.everyStages,
  bossHealthMultiplier: STAGE_BANDS[0].boss.healthMultiplier,
  clickHeroPowerMultiplier: 0.1,
  passiveFallbackPower: 1,
  comboBonusPerHit: 0.02,
  comboMaxBonus: 2,
  comboDecayMs: 1500,
  comboDecayTickMs: 500,
  killGoldMultiplier: 0.5,
  bossGoldMultiplier: STAGE_BANDS[0].boss.goldMultiplier,
  bossGemReward: STAGE_BANDS[0].boss.gemReward,
  clickGoldMultiplier: 0.5,
  passiveTickMs: 1000,
  offlineRewardMinSeconds: 60,
  offlineRewardMaxSeconds: 8 * 60 * 60,
  offlineGoldPerPowerSecond: 0.05,
  summonCostGems: 10,
  summonChargeMs: 1500,
  summonRevealMs: 1500,
  upgradeGoldPerLevel: 100,
  upgradePowerMultiplier: 1.5,
  critChance: 0.1,
  critMultiplier: 2,
  hitFlashMs: 50,
  damageTextLifetimeMs: 800,
  autoProjectileBaseIntervalMs: 1000,
  autoProjectilePowerSpeedupMs: 5,
  autoProjectileMinIntervalMs: 200,
  autoProjectileTravelMs: 400,
} as const;

export const isBossStage = (stage: number) => {
  const stageBand = getStageBandForStage(stage);
  return stage % stageBand.boss.everyStages === 0;
};

export const getMonsterMaxHealth = (stage: number) => {
  const stageBand = getStageBandForStage(stage);
  const scaledHealth = Math.floor(
    stageBand.baseMonsterHealth * Math.pow(stageBand.monsterHealthGrowth, stage - 1),
  );

  return scaledHealth * (isBossStage(stage) ? stageBand.boss.healthMultiplier : 1);
};

export const getBaseClickPower = (heroes: Hero[]) => {
  return 1 + heroes.reduce((acc, hero) => acc + hero.power * GAME_BALANCE.clickHeroPowerMultiplier, 0);
};

export const getPassivePower = (heroes: Hero[]) => {
  return heroes.reduce((acc, hero) => acc + hero.power, 0) || GAME_BALANCE.passiveFallbackPower;
};

export const getComboMultiplier = (comboCount: number) => {
  return 1 + Math.min(comboCount * GAME_BALANCE.comboBonusPerHit, GAME_BALANCE.comboMaxBonus);
};

export const getUpgradeCost = (hero: Pick<Hero, 'level'>) => {
  return hero.level * GAME_BALANCE.upgradeGoldPerLevel;
};

export const getNextHeroPower = (hero: Pick<Hero, 'power'>) => {
  return Math.floor(hero.power * GAME_BALANCE.upgradePowerMultiplier);
};

export const getHeroIcon = (rarity: HeroRarity) => {
  return SUMMON_POOL.find(hero => hero.rarity === rarity)?.icon ?? '🛡️';
};

export const getSummonDropPercent = (template: SummonHeroTemplate) => {
  return Math.round(template.dropRate * 100);
};

export const rollSummonTemplate = (randomValue = Math.random()) => {
  const normalizedRoll = Math.max(0, Math.min(randomValue, 0.999999));
  let cumulativeRate = 0;

  for (const hero of SUMMON_POOL) {
    cumulativeRate += hero.dropRate;
    if (normalizedRoll < cumulativeRate) {
      return hero;
    }
  }

  return SUMMON_POOL[SUMMON_POOL.length - 1];
};
