import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Compass, Sparkles, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { ActiveView } from '../game/types';
import { triggerHaptic } from '../utils/haptics';
import './BottomNav.css';

interface BottomNavProps {
  activeView: ActiveView;
  preloadView: (view: ActiveView) => void;
  setActiveView: (view: ActiveView) => void;
  summonReadyCount: number;
  warbandNeedsAttention: boolean;
}

interface NavigationItem {
  icon: LucideIcon;
  label: string;
  primary: boolean;
  view: ActiveView;
}

const NAVIGATION_ITEMS = [
  { icon: Sparkles, label: 'Summon', primary: false, view: 'summon' },
  { icon: Compass, label: 'Campaign', primary: true, view: 'rift' },
  { icon: Trophy, label: 'Leagues', primary: false, view: 'leagues' },
  { icon: Users, label: 'Heroes', primary: false, view: 'roster' },
] as const satisfies readonly NavigationItem[];

export const BottomNav = memo(function BottomNav({
  activeView,
  preloadView,
  setActiveView,
  summonReadyCount,
  warbandNeedsAttention,
}: BottomNavProps) {
  const prefersReducedMotion = useReducedMotion();

  const navigate = (view: ActiveView) => {
    if (view === activeView) {
      return;
    }

    triggerHaptic('light');
    setActiveView(view);
  };

  return (
    <nav className="bottom-nav" aria-label="Primary game navigation">
      {NAVIGATION_ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = item.view === activeView;
        const summonBadge = item.view === 'summon' && summonReadyCount > 0;
        const warbandBadge = item.view === 'roster' && warbandNeedsAttention;

        return (
          <motion.button
            key={item.view}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            className={`nav-btn ${item.primary ? 'nav-primary' : ''} ${isActive ? 'active' : ''}`}
            data-view={item.view}
            onFocus={() => preloadView(item.view)}
            onClick={() => navigate(item.view)}
            onPointerDown={() => preloadView(item.view)}
            onPointerEnter={() => preloadView(item.view)}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            type="button"
            whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
          >
            {isActive && (
              <motion.span
                className="nav-active-rail"
                layoutId="primary-navigation-active-rail"
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              />
            )}
            <span className="nav-icon-shell" aria-hidden="true">
              <Icon className="nav-icon" size={item.primary ? 25 : 22} strokeWidth={2.35} />
            </span>
            {!isActive && (summonBadge || warbandBadge) && (
              <span
                aria-hidden="true"
                className={`nav-badge ${summonBadge ? 'summon' : 'warband'}`}
              >
                {summonBadge ? Math.min(9, summonReadyCount) : ''}
                {summonBadge && summonReadyCount > 9 ? '+' : ''}
              </span>
            )}
            <span className="nav-label">{item.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
});
