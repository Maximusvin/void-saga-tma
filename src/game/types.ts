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
  name: string;
  rarity: HeroRarity;
  power: number;
  dropRate: number;
  icon: string;
}

export interface GameSnapshot {
  gold: number;
  gems: number;
  heroes: Hero[];
  stage: number;
  monsterMaxHealth: number;
  monsterHealth: number;
  updatedAt: string;
}

export type GameAction =
  | { type: 'deal_damage'; amount: number; source: 'tap' | 'passive' | 'skill' }
  | { type: 'summon'; randomValue?: number }
  | { type: 'upgrade_hero'; heroId: string };

export type GameEvent =
  | { type: 'monster_hit'; damage: number; monsterHealth: number }
  | { type: 'monster_defeated'; stage: number; nextStage: number; goldReward: number; gemReward: number }
  | { type: 'hero_summoned'; hero: Hero; costGems: number }
  | { type: 'hero_upgraded'; heroId: string; goldCost: number; level: number; power: number }
  | { type: 'action_rejected'; reason: string };

export interface GameActionResult {
  snapshot: GameSnapshot;
  events: GameEvent[];
}
