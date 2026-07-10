import { memo, type CSSProperties } from 'react';
import { getHeroIcon, getHeroTemplateById } from '../game/balance';
import type { Hero } from '../game/types';
import './HeroPortrait.css';

interface HeroPortraitProps {
  animated?: boolean;
  className?: string;
  eager?: boolean;
  hero: Pick<Hero, 'name' | 'rarity' | 'templateId'>;
}

export const HeroPortrait = memo(function HeroPortrait({
  animated = false,
  className = '',
  eager = false,
  hero,
}: HeroPortraitProps) {
  const template = getHeroTemplateById(hero.templateId);
  const motion = animated ? (template?.portraitMotion ?? 'still') : 'still';
  const style = {
    '--portrait-accent': template?.accentColor ?? '#9eb8b5',
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={`hero-portrait-art rarity-${hero.rarity.toLowerCase()} motion-${motion} ${className}`}
      data-motion={motion}
      style={style}
    >
      {template?.portrait ? (
        <img
          alt=""
          decoding="async"
          draggable={false}
          fetchPriority={eager ? 'high' : 'auto'}
          loading={eager ? 'eager' : 'lazy'}
          src={template.portrait}
        />
      ) : (
        <span className="hero-portrait-fallback">{getHeroIcon(hero.rarity)}</span>
      )}
      {motion !== 'still' && <span className="portrait-aura" />}
      {(motion === 'embers' || motion === 'mythic') && (
        <span className="portrait-motes" aria-hidden="true">
          <i />
          <i />
        </span>
      )}
    </span>
  );
});
