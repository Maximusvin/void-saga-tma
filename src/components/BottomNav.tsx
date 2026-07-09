import React from 'react';
import { Swords, Sparkles, Users } from 'lucide-react';
import './BottomNav.css';

interface BottomNavProps {
  activeView: 'rift' | 'summon' | 'roster';
  setActiveView: (view: 'rift' | 'summon' | 'roster') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => {
  return (
    <div className="bottom-nav glass-panel">
      <button 
        className={`nav-btn ${activeView === 'rift' ? 'active' : ''}`}
        onClick={() => setActiveView('rift')}
      >
        <Swords size={24} className="icon" />
        <span>Rift</span>
      </button>
      <button 
        className={`nav-btn summon-btn ${activeView === 'summon' ? 'active' : ''}`}
        onClick={() => setActiveView('summon')}
      >
        <div className="summon-icon-wrapper">
          <Sparkles size={28} className="icon" />
        </div>
        <span>Summon</span>
      </button>
      <button 
        className={`nav-btn ${activeView === 'roster' ? 'active' : ''}`}
        onClick={() => setActiveView('roster')}
      >
        <Users size={24} className="icon" />
        <span>Heroes</span>
      </button>
    </div>
  );
};
