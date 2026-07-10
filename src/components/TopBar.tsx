import React, { useEffect, useState } from 'react';
import { ChevronDown, Coins, Gem } from 'lucide-react';
import './TopBar.css';
import { formatNumber } from '../utils/formatNumber';
import type { BackendStatus } from '../store/useGameState';
import type { GameNumber } from '../game/gameNumber';
import { getPlayerInitials, type PlayerProfile } from '../shared/playerProfile';

interface TopBarProps {
  backendStatus: BackendStatus;
  gold: GameNumber;
  gems: number;
  level: number;
  onOpenRealmSwitcher: () => void;
  playerProfile: PlayerProfile;
  realmCode: string;
}

const STATUS_LABELS: Record<BackendStatus, string> = {
  error: 'Progress sync unavailable',
  loading: 'Syncing progress',
  local: 'Local preview save',
  synced: 'Progress synced',
};

interface PlayerAvatarProps {
  backendStatus: BackendStatus;
  level: number;
  playerProfile: PlayerProfile;
}

const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ backendStatus, level, playerProfile }) => {
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setPhotoFailed(false);
  }, [playerProfile.photoUrl]);

  const showPhoto = Boolean(playerProfile.photoUrl) && !photoFailed;

  return (
    <span className="player-avatar-frame">
      {showPhoto ? (
        <img
          alt=""
          className="player-avatar-image"
          decoding="async"
          onError={() => setPhotoFailed(true)}
          referrerPolicy="no-referrer"
          src={playerProfile.photoUrl ?? undefined}
        />
      ) : (
        <span className="player-avatar-fallback" aria-hidden="true">
          {getPlayerInitials(playerProfile.displayName)}
        </span>
      )}
      <span className={`profile-sync-indicator ${backendStatus}`} aria-hidden="true" />
      <span className="player-level-badge">LV {Math.max(1, Math.floor(level))}</span>
    </span>
  );
};

export const TopBar: React.FC<TopBarProps> = ({
  backendStatus,
  gold,
  gems,
  level,
  onOpenRealmSwitcher,
  playerProfile,
  realmCode,
}) => {
  const profileSourceLabel = playerProfile.source === 'telegram' ? 'Telegram linked' : 'Riftbound';

  return (
    <header className="topbar">
      <button
        aria-label={`${playerProfile.displayName}, level ${Math.max(1, Math.floor(level))}, server ${realmCode}. Open server selection.`}
        className="player-hud"
        data-profile-source={playerProfile.source}
        onClick={onOpenRealmSwitcher}
        title={STATUS_LABELS[backendStatus]}
        type="button"
      >
        <PlayerAvatar
          backendStatus={backendStatus}
          level={level}
          playerProfile={playerProfile}
        />
        <span className="player-identity-copy">
          <span className="player-kicker">{realmCode} · {profileSourceLabel}</span>
          <strong className="player-name">{playerProfile.displayName}</strong>
        </span>
        <ChevronDown className="realm-chevron" size={15} aria-hidden="true" />
      </button>
      <div className="resource-cluster" aria-label="Player resources" role="group">
        <div className="resource-item gold">
          <Coins size={17} className="icon" aria-hidden="true" />
          <span className="sr-only">Gold</span>
          <span className="amount">{formatNumber(gold)}</span>
        </div>
        <div className="resource-item gem">
          <Gem size={17} className="icon" aria-hidden="true" />
          <span className="sr-only">Gems</span>
          <span className="amount">{formatNumber(gems)}</span>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">{STATUS_LABELS[backendStatus]}</span>
    </header>
  );
};
