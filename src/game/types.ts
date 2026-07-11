import type { GameNumber } from './gameNumber';

export type HeroRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export type HeroUpgradeAmount = 1 | 10 | 'max';
export type ActiveView = 'rift' | 'summon' | 'leagues' | 'roster';
export type BossPhaseId = 'dominion' | 'fracture' | 'cataclysm';
export type HeroAttackStyle = 'slash' | 'bolt' | 'hex' | 'nova';
export type HeroCombatRole =
  | 'Vanguard'
  | 'Ranger'
  | 'Arcanist'
  | 'Spellblade'
  | 'Oracle'
  | 'Celestial'
  | 'Sovereign';
export type HeroPortraitMotion = 'still' | 'aura' | 'embers' | 'mythic';

export const GAME_SNAPSHOT_SCHEMA_VERSION = 7;

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
  combatProfile: HeroCombatProfile;
  combatRole: HeroCombatRole;
  id: string;
  name: string;
  portrait: string;
  portraitMotion: HeroPortraitMotion;
  showcase?: HeroShowcaseSpec;
  videoShowcase?: HeroVideoShowcaseSpec;
  rarity: HeroRarity;
  power: number;
  summonWeight: number;
  icon: string;
}

export interface HeroCombatProfile {
  passivePowerMultiplier: number;
  tapPowerMultiplier: number;
}

export interface HeroShowcaseSpec {
  bodyAsset: string;
  bodyAssetLow: string;
  id: string;
  leftWingAsset: string;
  leftWingAssetLow: string;
  rightWingAsset: string;
  rightWingAssetLow: string;
}

export interface HeroVideoShowcaseSpec {
  id: string;
  video: string;
  poster: string;
  tagline: string;
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
  normalEnemiesPerStage: number;
  normalEnemyHealthGrowth: number;
  monsterEmojis: readonly string[];
  boss: BossRule;
}

export interface GameContent {
  version: string;
  heroRarities: readonly HeroRarity[];
  summonRarityRates: Readonly<Record<HeroRarity, number>>;
  summonPool: readonly SummonHeroTemplate[];
  stageBands: readonly StageBand[];
}

export interface GameSnapshot {
  schemaVersion: typeof GAME_SNAPSHOT_SCHEMA_VERSION;
  activeHeroIds: string[];
  bossEncounterEndsAt: string | null;
  comboCount: number;
  comboExpiresAt: string | null;
  enemyIndex: number;
  gold: GameNumber;
  gems: number;
  heroes: Hero[];
  stage: number;
  monsterMaxHealth: GameNumber;
  monsterHealth: GameNumber;
  // Watermark for idle income. The server advances it by exactly the ticks it
  // grants, so a client cannot earn passive damage faster than wall-clock time.
  lastPassiveTickAt: string | null;
  lastSeenAt: string;
  summonPity: number;
  updatedAt: string;
}

export type GameAction =
  | { type: 'combat_batch'; tapCount: number; passiveTicks: number }
  | { type: 'set_active_warband'; heroIds: string[] }
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
  | {
      type: 'monster_defeated';
      enemiesInStage: number;
      enemyIndex: number;
      gemReward: number;
      goldReward: GameNumber;
      nextEnemyIndex: number;
      nextStage: number;
      stage: number;
      stageCleared: boolean;
    }
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
      legendaryPityTriggered: boolean;
      shardsGranted: number;
      summonsUntilLegendaryPity: number;
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
  | { type: 'active_warband_updated'; heroIds: string[] }
  | { type: 'action_rejected'; reason: string };

export interface GameActionResult {
  snapshot: GameSnapshot;
  events: GameEvent[];
}
