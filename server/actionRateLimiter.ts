import type { GameAction } from '../src/game/types';

const TAP_WINDOW_MS = 1_000;
const MAX_TAPS_PER_WINDOW = 20;
const PASSIVE_MIN_INTERVAL_MS = 900;
const STALE_PLAYER_MS = 5 * 60_000;

interface PlayerActionRate {
  lastPassiveAt: number;
  lastSeenAt: number;
  tapCount: number;
  tapWindowStartedAt: number;
}

export class ActionRateLimiter {
  private readonly players = new Map<string, PlayerActionRate>();
  private lastPrunedAt = 0;

  getRejection(playerId: string, action: GameAction, nowMs = Date.now()) {
    if (action.type !== 'combat_batch') {
      return null;
    }

    this.prune(nowMs);
    const rate = this.players.get(playerId) ?? {
      lastPassiveAt: Number.NEGATIVE_INFINITY,
      lastSeenAt: nowMs,
      tapCount: 0,
      tapWindowStartedAt: nowMs,
    };
    if (nowMs - rate.tapWindowStartedAt >= TAP_WINDOW_MS) {
      rate.tapWindowStartedAt = nowMs;
      rate.tapCount = 0;
    }

    if (rate.tapCount + action.tapCount > MAX_TAPS_PER_WINDOW) {
      return 'action_rate_limited';
    }

    if (action.passiveTicks > 0 && nowMs - rate.lastPassiveAt < PASSIVE_MIN_INTERVAL_MS) {
      return 'action_rate_limited';
    }

    rate.lastSeenAt = nowMs;
    rate.tapCount += action.tapCount;
    if (action.passiveTicks > 0) {
      rate.lastPassiveAt = nowMs;
    }
    this.players.set(playerId, rate);
    return null;
  }

  private prune(nowMs: number) {
    if (nowMs - this.lastPrunedAt < STALE_PLAYER_MS) {
      return;
    }

    this.lastPrunedAt = nowMs;
    for (const [playerId, rate] of this.players) {
      if (nowMs - rate.lastSeenAt >= STALE_PLAYER_MS) {
        this.players.delete(playerId);
      }
    }
  }
}
