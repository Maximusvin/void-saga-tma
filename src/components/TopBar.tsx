import React from 'react';
import { Coins, Gem } from 'lucide-react';
import './TopBar.css';
import { formatNumber } from '../utils/formatNumber';
import type { BackendStatus } from '../store/useGameState';
import type { GameNumber } from '../game/gameNumber';

interface TopBarProps {
  backendStatus: BackendStatus;
  gold: GameNumber;
  gems: number;
}

const STATUS_LABELS: Record<BackendStatus, string> = {
  error: 'Sync error',
  loading: 'Syncing',
  local: 'Local save',
  synced: 'Cloud save',
};

export const TopBar: React.FC<TopBarProps> = ({ backendStatus, gold, gems }) => {
  return (
    <div className="topbar">
      <div className={`topbar-status ${backendStatus}`} aria-live="polite">
        <span className="status-dot" />
        <span>{STATUS_LABELS[backendStatus]}</span>
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
