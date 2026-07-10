import { motion, useReducedMotion } from 'framer-motion';
import { Coins, Sparkles } from 'lucide-react';
import { formatNumber } from '../utils/formatNumber';
import type { OfflineRewardSummary } from '../game/offlineReward';
import './WelcomeBackModal.css';

interface WelcomeBackModalProps {
  reward: OfflineRewardSummary;
  onCollect: () => void;
}

export function WelcomeBackModal({ reward, onCollect }: WelcomeBackModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const cardMotion = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.86, y: 24 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.92, y: 12 },
      };

  return (
    <motion.div
      className="welcome-back-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="welcome-back-modal glass-panel"
        role="dialog"
        aria-label="Welcome back"
        {...cardMotion}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        <span className="welcome-back-glimmer" aria-hidden="true" />
        <span className="welcome-back-kicker">
          <Sparkles size={14} aria-hidden="true" /> Rift не спав
        </span>
        <h2 className="welcome-back-title text-gradient">З поверненням</h2>
        <p className="welcome-back-away">
          Тебе не було <strong>{reward.awayLabel}</strong>
          {reward.cappedAt && <span className="welcome-back-cap"> · максимум 8г</span>}
        </p>

        <div className="welcome-back-reward">
          <Coins size={26} className="welcome-back-coin" aria-hidden="true" />
          <span className="welcome-back-gold">+{formatNumber(reward.goldReward)}</span>
          <span className="welcome-back-gold-label">золота</span>
        </div>

        <p className="welcome-back-rate">
          Загін фармив {formatNumber(reward.passivePower)}/с, поки тебе не було
        </p>

        <button type="button" className="btn-primary welcome-back-collect" onClick={onCollect}>
          Забрати
        </button>
      </motion.div>
    </motion.div>
  );
}
