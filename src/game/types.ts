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
