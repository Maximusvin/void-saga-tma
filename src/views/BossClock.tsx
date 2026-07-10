import { memo, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Timer } from 'lucide-react';
import { createBossClockSync, getBossClockRemainingMs } from '../game/bossEncounter';

interface BossClockProps {
  attemptDurationMs: number;
  attemptEndsAt: string | null;
  snapshotUpdatedAt: string;
}

export const BossClock = memo(function BossClock({
  attemptDurationMs,
  attemptEndsAt,
  snapshotUpdatedAt,
}: BossClockProps) {
  const prefersReducedMotion = useReducedMotion();
  const [clock, setClock] = useState(() => createBossClockSync(
    attemptEndsAt,
    snapshotUpdatedAt,
    Date.now(),
    attemptDurationMs,
  ));
  const [clientNowMs, setClientNowMs] = useState(() => Date.now());

  useEffect(() => {
    const syncedAtClientMs = Date.now();
    setClock(createBossClockSync(
      attemptEndsAt,
      snapshotUpdatedAt,
      syncedAtClientMs,
      attemptDurationMs,
    ));
    setClientNowMs(syncedAtClientMs);
  }, [attemptDurationMs, attemptEndsAt, snapshotUpdatedAt]);

  useEffect(() => {
    if (!attemptEndsAt) {
      return;
    }

    const interval = setInterval(() => setClientNowMs(Date.now()), 250);
    return () => clearInterval(interval);
  }, [attemptEndsAt]);

  const remainingMs = getBossClockRemainingMs(clock, clientNowMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const timerPercent = Math.min(100, remainingMs / attemptDurationMs * 100);
  const isUrgent = attemptEndsAt !== null && remainingMs <= 10_000;

  return (
    <div
      className={`boss-clock ${isUrgent ? 'urgent' : ''}`}
      role="timer"
      aria-label={attemptEndsAt
        ? `${remainingSeconds} seconds remain in the boss attempt`
        : 'Boss attempt ready'}
    >
      <Timer size={14} aria-hidden="true" />
      <strong>{attemptEndsAt ? `${remainingSeconds}s` : 'Ready'}</strong>
      <span className="boss-clock-track" aria-hidden="true">
        <motion.span
          animate={{ width: `${timerPercent}%` }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'linear' }}
        />
      </span>
    </div>
  );
});
