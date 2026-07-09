export type HeroRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export type ActiveView = 'rift' | 'summon' | 'roster';

export interface Hero {
  id: string;
  name: string;
  rarity: HeroRarity;
  level: number;
  power: number;
}

export interface SummonHeroTemplate {
  id: string;
  name: string;
  rarity: HeroRarity;
  power: number;
  dropRate: number;
  icon: string;
}

export interface BossRule {
  everyStages: number;
  healthMultiplier: number;
  goldMultiplier: number;
  gemReward: number;
  emoji: string;
}

export interface StageBand {
  id: string;
  name: string;
  fromStage: number;
  baseMonsterHealth: number;
  monsterHealthGrowth: number;
  monsterEmojis: readonly string[];
  boss: BossRule;
}

export interface GameContent {
  version: string;
  heroRarities: readonly HeroRarity[];
  summonPool: readonly SummonHeroTemplate[];
  stageBands: readonly StageBand[];
}

export interface GameSnapshot {
  gold: number;
  gems: number;
  heroes: Hero[];
  stage: number;
  monsterMaxHealth: number;
  monsterHealth: number;
  lastSeenAt: string;
  updatedAt: string;
}

export type GameAction =
  | { type: 'deal_damage'; amount: number; source: 'tap' | 'passive' | 'skill' }
  | { type: 'summon'; randomValue?: number }
  | { type: 'upgrade_hero'; heroId: string }
  | { type: 'claim_offline_rewards' };

export type GameEvent =
  | { type: 'monster_hit'; damage: number; monsterHealth: number }
  | { type: 'monster_defeated'; stage: number; nextStage: number; goldReward: number; gemReward: number }
  | { type: 'hero_summoned'; hero: Hero; costGems: number }
  | { type: 'hero_upgraded'; heroId: string; goldCost: number; level: number; power: number }
  | {
      type: 'offline_rewards_claimed';
      elapsedSeconds: number;
      cappedSeconds: number;
      passivePower: number;
      goldReward: number;
    }
  | { type: 'action_rejected'; reason: string };

export interface GameActionResult {
  snapshot: GameSnapshot;
  events: GameEvent[];
}
