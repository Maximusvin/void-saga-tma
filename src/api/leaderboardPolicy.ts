import type { AutomaticActionBackendStatus } from './automaticActionPolicy';

export type LeaderboardStatus = 'idle' | 'loading' | 'ready' | 'error';

export const getLeaderboardStatusWhenBackendIsBlocked = (
  currentStatus: LeaderboardStatus,
  backendStatus: AutomaticActionBackendStatus,
): LeaderboardStatus => {
  if (backendStatus !== 'error') {
    return currentStatus;
  }

  return currentStatus === 'ready' ? 'ready' : 'error';
};
