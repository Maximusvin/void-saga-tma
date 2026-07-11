import React from 'react';
import { motion } from 'framer-motion';
import {
  Compass,
  Crown,
  Gem,
  Medal,
  RefreshCw,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import type { GameNumber } from '../game/gameNumber';
import {
  getLeagueProgress,
  type LeagueDivision,
  type RealmLeaderboard,
  type RealmLeaderboardEntry,
} from '../shared/leaderboard';
import type { LeaderboardStatus } from '../store/useGameState';
import { formatNumber } from '../utils/formatNumber';
import { triggerHaptic } from '../utils/haptics';
import './LeaguesHall.css';

interface LeaguesHallProps {
  heroCount: number;
  isLocal: boolean;
  leaderboard: RealmLeaderboard | null;
  onOpenCampaign: () => void;
  onRefresh: () => void;
  passivePower: GameNumber;
  stage: number;
  status: LeaderboardStatus;
}

const DIVISION_META = {
  bronze: { icon: Shield, label: 'Bronze' },
  silver: { icon: Swords, label: 'Silver' },
  gold: { icon: Gem, label: 'Gold' },
  mythic: { icon: Crown, label: 'Mythic' },
} as const satisfies Record<LeagueDivision, { icon: typeof Shield; label: string }>;

const getInitials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0])
  .join('')
  .toUpperCase() || 'VS';

const RankMark = ({ rank }: { rank: number }) => {
  if (rank <= 3) {
    return <Medal aria-hidden="true" size={18} />;
  }
  return <span>{rank}</span>;
};

const PlayerRow = ({ entry, pinned = false }: {
  entry: RealmLeaderboardEntry;
  pinned?: boolean;
}) => (
  <li
    className={`league-player-row ${entry.isCurrentPlayer ? 'current' : ''} ${pinned ? 'pinned' : ''}`}
    data-rank={entry.rank}
  >
    <span className={`league-rank rank-${Math.min(entry.rank, 4)}`}>
      <RankMark rank={entry.rank} />
    </span>
    <span className="league-avatar">
      {entry.photoUrl ? (
        <img
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          src={entry.photoUrl}
        />
      ) : (
        <span>{getInitials(entry.displayName)}</span>
      )}
    </span>
    <span className="league-player-copy">
      <strong>{entry.displayName}</strong>
      <small>
        Stage {entry.stage} · Wave {entry.enemyIndex + 1}
      </small>
    </span>
    <span className="league-player-power">
      <strong>{formatNumber(entry.passivePower)}</strong>
      <small>power/s</small>
    </span>
  </li>
);

export const LeaguesHall: React.FC<LeaguesHallProps> = ({
  heroCount,
  isLocal,
  leaderboard,
  onOpenCampaign,
  onRefresh,
  passivePower,
  stage,
  status,
}) => {
  const current = leaderboard?.currentPlayer;
  const division = current?.division ?? 'bronze';
  const divisionMeta = DIVISION_META[division];
  const DivisionIcon = divisionMeta.icon;
  const currentIsInTop = leaderboard?.top.some(entry => entry.isCurrentPlayer) ?? false;
  const campaignStage = current?.stage ?? stage;
  const leagueProgress = getLeagueProgress(campaignStage);
  const nextDivision = leagueProgress.nextDivision
    ? DIVISION_META[leagueProgress.nextDivision]
    : null;
  const openCampaign = () => {
    triggerHaptic('light');
    onOpenCampaign();
  };
  return (
    <motion.section
      className="view-container leagues-view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="leagues-content">
        <header className="leagues-heading">
          <span className="leagues-kicker">
            <Trophy aria-hidden="true" size={13} />
            {leaderboard?.realmCode ?? 'Realm'} standings
          </span>
          <h1>Rift Leagues</h1>
          <span className="leagues-season">
            {isLocal ? 'Practice ranking' : 'All-time campaign rank'}
          </span>
        </header>

        <section className={`league-status-band division-${division}`} aria-label="Current league status">
          <div className="league-crest" aria-hidden="true">
            <span className="league-crest-rays" />
            <DivisionIcon size={36} strokeWidth={1.8} />
          </div>
          <div className="league-standing">
            <span>Current division</span>
            <strong>{divisionMeta.label}</strong>
            <small>
              {current && leaderboard
                ? `#${current.rank} of ${leaderboard.totalPlayers}`
                : status === 'error' ? 'Sync unavailable' : 'Calculating rank'}
            </small>
          </div>
          <div className="league-readiness">
            <div>
              <Trophy size={14} aria-hidden="true" />
              <span>Campaign</span>
              <strong>Stage {current?.stage ?? stage}</strong>
            </div>
            <div>
              <Users size={14} aria-hidden="true" />
              <span>Warband</span>
              <strong>{heroCount}/4</strong>
            </div>
            <div>
              <Sparkles size={14} aria-hidden="true" />
              <span>Power</span>
              <strong>{formatNumber(current?.passivePower ?? passivePower)}/s</strong>
            </div>
          </div>
          <div className="league-promotion">
            <div className="league-promotion-copy">
              <span>{nextDivision
                ? `${leagueProgress.stagesRemaining} stages to ${nextDivision.label}`
                : 'Highest division reached'}</span>
              <strong>{leagueProgress.nextStage
                ? `Reach Stage ${leagueProgress.nextStage}`
                : 'Mythic standing secured'}</strong>
            </div>
            <button
              aria-label="Return to Campaign"
              onClick={openCampaign}
              title="Campaign"
              type="button"
            >
              <Compass aria-hidden="true" size={15} />
              <span>Campaign</span>
            </button>
            <div
              aria-label="Division progress"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(leagueProgress.progressPercent)}
              className="league-promotion-track"
              role="progressbar"
            >
              <span style={{ width: `${leagueProgress.progressPercent}%` }} />
            </div>
          </div>
        </section>

        <section className="realm-standings" aria-labelledby="realm-standings-title">
          <header>
            <div>
              <span>Campaign progress</span>
              <strong id="realm-standings-title">Realm standings</strong>
            </div>
            <button
              aria-label="Refresh leaderboard"
              className="league-refresh"
              disabled={status === 'loading'}
              onClick={onRefresh}
              title="Refresh"
              type="button"
            >
              <RefreshCw aria-hidden="true" size={17} />
            </button>
          </header>

          {status === 'error' && !leaderboard ? (
            <div className="league-empty-state">
              <Shield aria-hidden="true" size={22} />
              <strong>Standings unavailable</strong>
              <button onClick={onRefresh} type="button">Try again</button>
            </div>
          ) : status === 'loading' && !leaderboard ? (
            <div className="league-loading" aria-label="Loading leaderboard">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
          ) : (
            <>
              <ol className="league-player-list">
                {leaderboard?.top.map(entry => (
                  <PlayerRow entry={entry} key={entry.rank} />
                ))}
              </ol>
              {current && !currentIsInTop && (
                <div className="league-current-pin">
                  <span>Your position</span>
                  <ol className="league-player-list">
                    <PlayerRow entry={current} pinned />
                  </ol>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </motion.section>
  );
};
