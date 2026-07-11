import type { BossPhaseRule, GameContent, HeroRarity, StageBand, SummonHeroTemplate } from './types';

export const GAME_CONTENT_VERSION = 'void-saga-content-009';

export const HERO_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary'] as const satisfies readonly HeroRarity[];

export const SUMMON_RARITY_RATES = {
  Common: 0.65,
  Rare: 0.262,
  Epic: 0.08,
  Legendary: 0.008,
} as const satisfies Readonly<Record<HeroRarity, number>>;

export const SUMMON_POOL: readonly SummonHeroTemplate[] = [
  {
    accentColor: '#79d9c4',
    attackStyle: 'slash',
    combatProfile: { passivePowerMultiplier: 1, tapPowerMultiplier: 1 },
    combatRole: 'Vanguard',
    id: 'void-grunt',
    name: 'Void Grunt',
    portrait: '/assets/heroes/void-grunt.webp',
    portraitMotion: 'still',
    rarity: 'Common',
    power: 5,
    summonWeight: 1,
    icon: '🛡️',
  },
  {
    accentColor: '#90b7a2',
    attackStyle: 'bolt',
    combatProfile: { passivePowerMultiplier: 0.648, tapPowerMultiplier: 1.8 },
    combatRole: 'Ranger',
    id: 'rift-scavenger',
    name: 'Rift Scavenger',
    portrait: '/assets/heroes/rift-scavenger.webp',
    portraitMotion: 'still',
    rarity: 'Common',
    power: 5,
    summonWeight: 1,
    icon: '🏹',
  },
  {
    accentColor: '#63d9ff',
    attackStyle: 'bolt',
    combatProfile: { passivePowerMultiplier: 1, tapPowerMultiplier: 1 },
    combatRole: 'Arcanist',
    id: 'void-mage',
    name: 'Void Mage',
    portrait: '/assets/heroes/void-mage.webp',
    portraitMotion: 'aura',
    videoShowcase: {
      id: 'void-mage-living-idle',
      video: '/assets/heroes/showcase/void-mage-idle.mp4',
      poster: '/assets/heroes/void-mage.webp',
      tagline: 'Arcanist of the Void',
    },
    rarity: 'Rare',
    power: 10,
    summonWeight: 1,
    icon: '✨',
  },
  {
    accentColor: '#58a6ff',
    attackStyle: 'bolt',
    combatProfile: { passivePowerMultiplier: 0.714, tapPowerMultiplier: 1.65 },
    combatRole: 'Ranger',
    id: 'storm-ranger',
    name: 'Storm Ranger',
    portrait: '/assets/heroes/storm-ranger.webp',
    portraitMotion: 'aura',
    rarity: 'Rare',
    power: 10,
    summonWeight: 1,
    icon: '⚡',
  },
  {
    accentColor: '#d27cff',
    attackStyle: 'hex',
    combatProfile: { passivePowerMultiplier: 1, tapPowerMultiplier: 1 },
    combatRole: 'Spellblade',
    id: 'void-knight',
    name: 'Void Knight',
    portrait: '/assets/heroes/void-knight.webp',
    portraitMotion: 'embers',
    rarity: 'Epic',
    power: 20,
    summonWeight: 1,
    icon: '⚔️',
  },
  {
    accentColor: '#ff7247',
    attackStyle: 'hex',
    combatProfile: { passivePowerMultiplier: 1.198, tapPowerMultiplier: 0.55 },
    combatRole: 'Oracle',
    id: 'ember-oracle',
    name: 'Ember Oracle',
    portrait: '/assets/heroes/ember-oracle.webp',
    portraitMotion: 'embers',
    rarity: 'Epic',
    power: 20,
    summonWeight: 1,
    icon: '🔥',
  },
  {
    accentColor: '#ffd36f',
    attackStyle: 'nova',
    combatProfile: { passivePowerMultiplier: 1, tapPowerMultiplier: 1 },
    combatRole: 'Sovereign',
    id: 'void-lord',
    name: 'Void Lord',
    portrait: '/assets/heroes/void-lord.webp',
    portraitMotion: 'mythic',
    showcase: {
      bodyAsset: '/assets/heroes/showcase/void-lord-body.webp',
      bodyAssetLow: '/assets/heroes/showcase/void-lord-body-low.webp',
      id: 'celestial-dragon-sovereign',
      leftWingAsset: '/assets/heroes/showcase/void-lord-wing-left.webp',
      leftWingAssetLow: '/assets/heroes/showcase/void-lord-wing-left-low.webp',
      rightWingAsset: '/assets/heroes/showcase/void-lord-wing-right.webp',
      rightWingAssetLow: '/assets/heroes/showcase/void-lord-wing-right-low.webp',
    },
    rarity: 'Legendary',
    power: 50,
    summonWeight: 1,
    icon: '👑',
  },
  {
    accentColor: '#f2d99b',
    attackStyle: 'nova',
    combatProfile: { passivePowerMultiplier: 1.242, tapPowerMultiplier: 0.45 },
    combatRole: 'Celestial',
    id: 'seraph-aurelia',
    name: 'Seraph Aurelia',
    portrait: '/assets/heroes/seraph-aurelia.webp',
    portraitMotion: 'mythic',
    rarity: 'Legendary',
    power: 50,
    summonWeight: 1,
    icon: '🪽',
  },
] as const;

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

export const BOSS_PHASES = [
  { id: 'dominion', label: 'Dominion', minimumHealthPercent: 67 },
  { id: 'fracture', label: 'Fracture', minimumHealthPercent: 34 },
  { id: 'cataclysm', label: 'Cataclysm', minimumHealthPercent: 0 },
] as const satisfies readonly BossPhaseRule[];

export const STAGE_BANDS = [
  {
    id: 'rift-outskirts',
    name: 'Rift Outskirts',
    fromStage: 1,
    baseMonsterHealth: 100,
    monsterHealthGrowth: 1.2,
    normalEnemiesPerStage: 4,
    normalEnemyHealthGrowth: 1.18,
    monsterEmojis: MONSTER_EMOJIS,
    boss: {
      attemptSeconds: 60,
      everyStages: 5,
      healthMultiplier: 10,
      goldMultiplier: 1.25,
      gemReward: 2,
      emoji: BOSS_EMOJI,
      phases: BOSS_PHASES,
    },
  },
  {
    id: 'rift-depths',
    name: 'Rift Depths',
    fromStage: 201,
    baseMonsterHealth: 100,
    monsterHealthGrowth: 1.2,
    normalEnemiesPerStage: 5,
    normalEnemyHealthGrowth: 1.15,
    monsterEmojis: MONSTER_EMOJIS,
    boss: {
      attemptSeconds: 65,
      everyStages: 5,
      healthMultiplier: 11,
      goldMultiplier: 1.2,
      gemReward: 2,
      emoji: BOSS_EMOJI,
      phases: BOSS_PHASES,
    },
  },
  {
    id: 'void-dominion',
    name: 'Void Dominion',
    fromStage: 1001,
    baseMonsterHealth: 100,
    monsterHealthGrowth: 1.2,
    normalEnemiesPerStage: 6,
    normalEnemyHealthGrowth: 1.12,
    monsterEmojis: MONSTER_EMOJIS,
    boss: {
      attemptSeconds: 75,
      everyStages: 5,
      healthMultiplier: 14,
      goldMultiplier: 1.15,
      gemReward: 2,
      emoji: BOSS_EMOJI,
      phases: BOSS_PHASES,
    },
  },
] as const satisfies readonly StageBand[];

export const GAME_CONTENT = {
  version: GAME_CONTENT_VERSION,
  heroRarities: HERO_RARITIES,
  summonRarityRates: SUMMON_RARITY_RATES,
  summonPool: SUMMON_POOL,
  stageBands: STAGE_BANDS,
} as const satisfies GameContent;

export const getStageBandForStage = (stage: number) => {
  const normalizedStage = Math.max(1, Math.floor(stage));
  return [...STAGE_BANDS]
    .reverse()
    .find(stageBand => normalizedStage >= stageBand.fromStage) ?? STAGE_BANDS[0];
};

export const getHeroTemplateById = (templateId: string): SummonHeroTemplate | null => {
  return SUMMON_POOL.find(template => template.id === templateId) ?? null;
};
