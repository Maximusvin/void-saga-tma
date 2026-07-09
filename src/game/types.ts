import type { GameNumber } from './gameNumber';

export type HeroRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export type ActiveView = 'rift' | 'summon' | 'roster';

export const GAME_SNAPSHOT_SCHEMA_VERSION = 3;

export interface Hero {
  ascension: number;
  id: string;
  name: string;
  rarity: HeroRarity;
  level: number;
  power: GameNumber;
  shards: number;
  templateId: string;
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
  schemaVersion: typeof GAME_SNAPSHOT_SCHEMA_VERSION;
  comboCount: number;
  comboExpiresAt: string | null;
  gold: GameNumber;
  gems: number;
  heroes: Hero[];
  stage: number;
  monsterMaxHealth: GameNumber;
  monsterHealth: GameNumber;
  lastSeenAt: string;
  updatedAt: string;
}

export type GameAction =
  | { type: 'combat_batch'; tapCount: number; passiveTicks: number }
  | { type: 'summon'; randomValue?: number }
  | { type: 'upgrade_hero'; heroId: string }
  | { type: 'ascend_hero'; heroId: string }
  | { type: 'claim_offline_rewards' };

export type GameEvent =
  | {
      type: 'monster_hit';
      comboCount: number;
      damage: GameNumber;
      isCrit: boolean;
      monsterHealth: GameNumber;
      source: 'tap' | 'passive';
      stage: number;
    }
  | { type: 'monster_defeated'; stage: number; nextStage: number; goldReward: GameNumber; gemReward: number }
  | {
      type: 'hero_summoned';
      hero: Hero;
      costGems: number;
      isDuplicate: boolean;
      shardsGranted: number;
    }
  | { type: 'hero_upgraded'; heroId: string; goldCost: GameNumber; level: number; power: GameNumber }
  | {
      type: 'hero_ascended';
      heroId: string;
      ascension: number;
      levelCap: number;
      shardsRemaining: number;
      shardsSpent: number;
    }
  | {
      type: 'offline_rewards_claimed';
      elapsedSeconds: number;
      cappedSeconds: number;
      passivePower: GameNumber;
      goldReward: GameNumber;
    }
  | { type: 'action_rejected'; reason: string };

export interface GameActionResult {
  snapshot: GameSnapshot;
  events: GameEvent[];
}
