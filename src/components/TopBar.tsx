import React from 'react';
import { Coins, Gem } from 'lucide-react';
import './TopBar.css';
import { formatNumber } from '../utils/formatNumber';

interface TopBarProps {
  gold: number;
  gems: number;
}

export const TopBar: React.FC<TopBarProps> = ({ gold, gems }) => {
  return (
    <div className="topbar">
      <div className="topbar-status">
        <span className="status-dot" />
        <span>Rift Stable</span>
      </div>
      <div className="resource-pill gold">
        <Coins size={18} className="icon" />
        <span className="amount">{formatNumber(gold)}</span>
      </div>
      <div className="resource-pill gem">
        <Gem size={18} className="icon" />
        <span className="amount">{formatNumber(gems)}</span>
      </div>
    </div>
  );
};
