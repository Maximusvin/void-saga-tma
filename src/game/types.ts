import type { GameNumber } from './gameNumber';

export type HeroRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export type HeroUpgradeAmount = 1 | 10 | 'max';
export type ActiveView = 'rift' | 'summon' | 'leagues' | 'roster';
export type BossPhaseId = 'dominion' | 'fracture' | 'cataclysm';
export type HeroAttackStyle = 'slash' | 'bolt' | 'hex' | 'nova';
export type HeroCombatRole = 'Vanguard' | 'Arcanist' | 'Spellblade' | 'Sovereign';

export const GAME_SNAPSHOT_SCHEMA_VERSION = 4;

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
  accentColor: string;
  attackStyle: HeroAttackStyle;
  combatRole: HeroCombatRole;
  id: string;
  name: string;
  rarity: HeroRarity;
  power: number;
  dropRate: number;
  icon: string;
}

export interface HeroDamageContribution {
  damage: GameNumber;
  heroId: string;
}

export interface BossRule {
  attemptSeconds: number;
  everyStages: number;
  healthMultiplier: number;
  goldMultiplier: number;
  gemReward: number;
  emoji: string;
  phases: readonly BossPhaseRule[];
}

export interface BossPhaseRule {
  id: BossPhaseId;
  label: string;
  minimumHealthPercent: number;
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
  bossEncounterEndsAt: string | null;
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
  | { type: 'upgrade_hero'; heroId: string; amount?: HeroUpgradeAmount }
  | { type: 'ascend_hero'; heroId: string }
  | { type: 'claim_offline_rewards' };

export type GameEvent =
  | {
      type: 'monster_hit';
      comboCount: number;
      damage: GameNumber;
      heroContributions: HeroDamageContribution[];
      isCrit: boolean;
      monsterHealth: GameNumber;
      source: 'tap' | 'passive';
      stage: number;
    }
  | { type: 'monster_defeated'; stage: number; nextStage: number; goldReward: GameNumber; gemReward: number }
  | {
      type: 'boss_enraged';
      attemptEndsAt: string;
      monsterHealth: GameNumber;
      stage: number;
    }
  | {
      type: 'hero_summoned';
      hero: Hero;
      costGems: number;
      isDuplicate: boolean;
      shardsGranted: number;
    }
  | {
      type: 'hero_upgraded';
      heroId: string;
      fromLevel: number;
      goldCost: GameNumber;
      level: number;
      levelsGained: number;
      power: GameNumber;
    }
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
