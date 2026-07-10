export interface BossClockSync {
  remainingAtSyncMs: number;
  syncedAtClientMs: number;
}

const parseTimestamp = (value: string | null) => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const createBossClockSync = (
  attemptEndsAt: string | null,
  snapshotUpdatedAt: string,
  syncedAtClientMs: number,
  attemptDurationMs: number,
): BossClockSync => {
  const attemptEndsAtMs = parseTimestamp(attemptEndsAt);
  const snapshotUpdatedAtMs = parseTimestamp(snapshotUpdatedAt);
  const rawRemainingMs = attemptEndsAtMs === null || snapshotUpdatedAtMs === null
    ? 0
    : attemptEndsAtMs - snapshotUpdatedAtMs;

  return {
    remainingAtSyncMs: Math.max(0, Math.min(attemptDurationMs, rawRemainingMs)),
    syncedAtClientMs,
  };
};

export const getBossClockRemainingMs = (clock: BossClockSync, clientNowMs: number) => {
  const elapsedClientMs = Math.max(0, clientNowMs - clock.syncedAtClientMs);
  return Math.max(0, clock.remainingAtSyncMs - elapsedClientMs);
};
