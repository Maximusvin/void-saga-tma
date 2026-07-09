import React from 'react';
import { Coins, Gem } from 'lucide-react';
import './TopBar.css';

interface TopBarProps {
  gold: number;
  gems: number;
}

export const TopBar: React.FC<TopBarProps> = ({ gold, gems }) => {
  return (
    <div className="topbar glass-panel">
      <div className="resource-pill gold">
        <Coins size={18} className="icon" />
        <span className="amount">{gold.toLocaleString()}</span>
      </div>
      <div className="resource-pill gem">
        <Gem size={18} className="icon" />
        <span className="amount">{gems.toLocaleString()}</span>
      </div>
    </div>
  );
};
