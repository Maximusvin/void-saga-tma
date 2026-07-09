import type { GameContent, HeroRarity, StageBand, SummonHeroTemplate } from './types';

export const GAME_CONTENT_VERSION = 'void-saga-content-002';

export const HERO_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary'] as const satisfies readonly HeroRarity[];

export const SUMMON_POOL = [
  { id: 'void-grunt', name: 'Void Grunt', rarity: 'Common', power: 5, dropRate: 0.4, icon: '🛡️' },
  { id: 'void-mage', name: 'Void Mage', rarity: 'Rare', power: 10, dropRate: 0.3, icon: '⚔️' },
  { id: 'void-knight', name: 'Void Knight', rarity: 'Epic', power: 20, dropRate: 0.2, icon: '🔮' },
  { id: 'void-lord', name: 'Void Lord', rarity: 'Legendary', power: 50, dropRate: 0.1, icon: '👑' },
] as const satisfies readonly SummonHeroTemplate[];

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

export const STAGE_BANDS = [
  {
    id: 'rift-outskirts',
    name: 'Rift Outskirts',
    fromStage: 1,
    baseMonsterHealth: 100,
    monsterHealthGrowth: 1.2,
    monsterEmojis: MONSTER_EMOJIS,
    boss: {
      everyStages: 5,
      healthMultiplier: 5,
      goldMultiplier: 2,
      gemReward: 2,
      emoji: BOSS_EMOJI,
    },
  },
] as const satisfies readonly StageBand[];

export const GAME_CONTENT = {
  version: GAME_CONTENT_VERSION,
  heroRarities: HERO_RARITIES,
  summonPool: SUMMON_POOL,
  stageBands: STAGE_BANDS,
} as const satisfies GameContent;

export const getStageBandForStage = (stage: number) => {
  const normalizedStage = Math.max(1, Math.floor(stage));
  return [...STAGE_BANDS]
    .reverse()
    .find(stageBand => normalizedStage >= stageBand.fromStage) ?? STAGE_BANDS[0];
};
