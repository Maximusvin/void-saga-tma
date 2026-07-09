import type { Hero, HeroRarity, SummonHeroTemplate } from './types';

export const GAME_BALANCE = {
  storageKey: 'rift_heroes_save',
  initialGold: 1000,
  initialGems: 50,
  initialStage: 1,
  baseMonsterHealth: 100,
  monsterHealthGrowth: 1.2,
  bossEveryStages: 5,
  bossHealthMultiplier: 5,
  clickHeroPowerMultiplier: 0.1,
  passiveFallbackPower: 1,
  comboBonusPerHit: 0.02,
  comboMaxBonus: 2,
  comboDecayMs: 1500,
  comboDecayTickMs: 500,
  killGoldMultiplier: 0.5,
  bossGoldMultiplier: 2,
  bossGemReward: 2,
  clickGoldMultiplier: 0.5,
  passiveTickMs: 1000,
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

export const HERO_RARITIES: HeroRarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];

export const SUMMON_POOL: SummonHeroTemplate[] = [
  { name: 'Void Grunt', rarity: 'Common', power: 5, dropRate: 0.4, icon: '🛡️' },
  { name: 'Void Mage', rarity: 'Rare', power: 10, dropRate: 0.3, icon: '⚔️' },
  { name: 'Void Knight', rarity: 'Epic', power: 20, dropRate: 0.2, icon: '🔮' },
  { name: 'Void Lord', rarity: 'Legendary', power: 50, dropRate: 0.1, icon: '👑' },
];

export const RARITY_ORDER: Record<HeroRarity, number> = {
  Legendary: 4,
  Epic: 3,
  Rare: 2,
  Common: 1,
};

export const RARITY_COLORS: Record<HeroRarity, string> = {
  Common: '#a0a0a0',
  Rare: '#3498db',
  Epic: '#ff00ff',
  Legendary: '#ffd700',
};

export const RARITY_GRADIENTS: Record<HeroRarity, string> = {
  Common: 'linear-gradient(135deg, rgba(160,160,160,0.1), rgba(160,160,160,0))',
  Rare: 'linear-gradient(135deg, rgba(52,152,219,0.2), rgba(52,152,219,0))',
  Epic: 'linear-gradient(135deg, rgba(255,0,255,0.2), rgba(255,0,255,0))',
  Legendary: 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,215,0,0.05))',
};

export const MONSTER_EMOJIS = ['👾', '👻', '💀', '👽', '👿', '🧌', '🕷️', '🦂', '🦇'] as const;
export const BOSS_EMOJI = '👹';

export const isBossStage = (stage: number) => stage % GAME_BALANCE.bossEveryStages === 0;

export const getMonsterMaxHealth = (stage: number) => {
  const scaledHealth = Math.floor(
    GAME_BALANCE.baseMonsterHealth * Math.pow(GAME_BALANCE.monsterHealthGrowth, stage - 1),
  );

  return scaledHealth * (isBossStage(stage) ? GAME_BALANCE.bossHealthMultiplier : 1);
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
