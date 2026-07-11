import { isPositiveGameNumber, type GameNumber } from './gameNumber';
import type { GameEvent } from './types';

export interface OfflineRewardSummary {
  /** Gold already credited to the snapshot while the player was away. */
  goldReward: GameNumber;
  /** The paid window in seconds — the capped absence, not the raw one. */
  awaySeconds: number;
  /** Human label for that window, e.g. "2h 14m". */
  awayLabel: string;
  /** Active warband income per second, shown as context. */
  passivePower: GameNumber;
  /** True when the real absence outran the 8h earning ceiling. */
  cappedAt: boolean;
}

export const formatAwayDuration = (seconds: number): string => {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

/**
 * Decides whether a claim is worth a "welcome back" modal. Returns null unless
 * the batch actually paid gold for an absence at least `minSeconds` long, so a
 * short tab-away credits silently and never pops the modal.
 */
export const summarizeOfflineReward = (
  events: readonly GameEvent[],
  minSeconds: number,
): OfflineRewardSummary | null => {
  const event = events.find(
    (candidate): candidate is Extract<GameEvent, { type: 'offline_rewards_claimed' }> => (
      candidate.type === 'offline_rewards_claimed'
    ),
  );

  if (!event || !isPositiveGameNumber(event.goldReward) || event.cappedSeconds < minSeconds) {
    return null;
  }

  return {
    goldReward: event.goldReward,
    awaySeconds: event.cappedSeconds,
    awayLabel: formatAwayDuration(event.cappedSeconds),
    passivePower: event.passivePower,
    cappedAt: event.elapsedSeconds > event.cappedSeconds,
  };
};
