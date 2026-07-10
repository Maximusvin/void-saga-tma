import React from 'react';
import { motion } from 'framer-motion';
import { Crown, Gem, Shield, Sparkles, Swords, Timer, Trophy, Users } from 'lucide-react';
import type { GameNumber } from '../game/gameNumber';
import { formatNumber } from '../utils/formatNumber';
import './LeaguesHall.css';

interface LeaguesHallProps {
  heroCount: number;
  passivePower: GameNumber;
  stage: number;
}

const DIVISIONS = [
  { className: 'bronze', icon: Shield, label: 'Bronze' },
  { className: 'silver', icon: Swords, label: 'Silver' },
  { className: 'gold', icon: Gem, label: 'Gold' },
  { className: 'mythic', icon: Crown, label: 'Mythic' },
] as const;

export const LeaguesHall: React.FC<LeaguesHallProps> = ({ heroCount, passivePower, stage }) => {
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
          <span className="leagues-kicker"><Trophy aria-hidden="true" size={14} /> Preseason</span>
          <h1>Rift Leagues</h1>
          <span className="leagues-season">Season 0 · Calibration</span>
        </header>

        <section className="league-status-band" aria-label="Current league status">
          <div className="league-crest" aria-hidden="true">
            <span className="league-crest-rays" />
            <Trophy size={38} strokeWidth={1.8} />
          </div>
          <div className="league-standing">
            <span>Current division</span>
            <strong>Unranked</strong>
            <small>Calibration locked</small>
          </div>
          <div className="league-readiness">
            <div>
              <Swords size={15} aria-hidden="true" />
              <span>Campaign</span>
              <strong>Stage {stage}</strong>
            </div>
            <div>
              <Users size={15} aria-hidden="true" />
              <span>Warband</span>
              <strong>{heroCount}/4</strong>
            </div>
            <div>
              <Sparkles size={15} aria-hidden="true" />
              <span>Power</span>
              <strong>{formatNumber(passivePower)}/s</strong>
            </div>
          </div>
        </section>

        <section className="division-path" aria-labelledby="division-path-title">
          <header>
            <div>
              <span>Competitive path</span>
              <strong id="division-path-title">Divisions</strong>
            </div>
            <span className="division-count">4 tiers</span>
          </header>
          <div className="division-grid">
            {DIVISIONS.map(division => {
              const DivisionIcon = division.icon;
              return (
                <div key={division.label} className={`division-tile ${division.className}`}>
                  <span className="division-emblem"><DivisionIcon aria-hidden="true" size={21} /></span>
                  <strong>{division.label}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="league-season-state">
          <Timer size={17} aria-hidden="true" />
          <span>First competitive season</span>
          <strong>Preseason</strong>
        </footer>
      </div>
    </motion.section>
  );
};
