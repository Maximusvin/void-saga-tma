import React from 'react';
import { Coins, Gem } from 'lucide-react';
import './TopBar.css';

interface TopBarProps {
  gold: number;
  gems: number;
}

const formatNumber = (num: number) => {
  if (num >= 1e33) return (num / 1e33).toFixed(1) + 'Dc'; // Decillion
  if (num >= 1e30) return (num / 1e30).toFixed(1) + 'No'; // Nonillion
  if (num >= 1e27) return (num / 1e27).toFixed(1) + 'Oc'; // Octillion
  if (num >= 1e24) return (num / 1e24).toFixed(1) + 'Sp'; // Septillion
  if (num >= 1e21) return (num / 1e21).toFixed(1) + 'Sx'; // Sextillion
  if (num >= 1e18) return (num / 1e18).toFixed(1) + 'Qi'; // Quintillion
  if (num >= 1e15) return (num / 1e15).toFixed(1) + 'Qa'; // Quadrillion
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T'; // Trillion
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Math.floor(num).toString();
};

export const TopBar: React.FC<TopBarProps> = ({ gold, gems }) => {
  return (
    <div className="topbar glass-panel">
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
