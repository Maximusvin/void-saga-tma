import React from 'react';
import { Swords, Sparkles, Users } from 'lucide-react';
import './BottomNav.css';

interface BottomNavProps {
  activeView: 'rift' | 'summon' | 'roster';
  setActiveView: (view: 'rift' | 'summon' | 'roster') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => {
  return (
    <nav className="bottom-nav" aria-label="Primary game navigation">
      <button
        aria-current={activeView === 'rift' ? 'page' : undefined}
        className={`nav-btn ${activeView === 'rift' ? 'active' : ''}`}
        onClick={() => setActiveView('rift')}
        type="button"
      >
        <Swords size={22} className="icon" aria-hidden="true" />
        <span>Rift</span>
      </button>
      <button
        aria-current={activeView === 'summon' ? 'page' : undefined}
        className={`nav-btn summon-btn ${activeView === 'summon' ? 'active' : ''}`}
        onClick={() => setActiveView('summon')}
        type="button"
      >
        <div className="summon-icon-wrapper">
          <Sparkles size={25} className="icon" aria-hidden="true" />
        </div>
        <span>Summon</span>
      </button>
      <button
        aria-current={activeView === 'roster' ? 'page' : undefined}
        className={`nav-btn ${activeView === 'roster' ? 'active' : ''}`}
        onClick={() => setActiveView('roster')}
        type="button"
      >
        <Users size={22} className="icon" aria-hidden="true" />
        <span>Heroes</span>
      </button>
    </nav>
  );
};
