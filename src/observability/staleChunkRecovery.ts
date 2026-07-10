const RECOVERY_STORAGE_KEY = 'void-saga:stale-chunk-reload-at';
const RECOVERY_COOLDOWN_MS = 60_000;

type PreloadErrorEvent = Pick<Event, 'preventDefault'>;

interface RecoveryDependencies {
  now: () => number;
  readLastAttempt: () => number | null;
  reload: () => void;
  writeLastAttempt: (attemptedAt: number) => void;
}

export const createStaleChunkRecoveryHandler = ({
  now,
  readLastAttempt,
  reload,
  writeLastAttempt,
}: RecoveryDependencies) => (event: PreloadErrorEvent) => {
  const attemptedAt = now();
  let lastAttempt: number | null;

  try {
    lastAttempt = readLastAttempt();
  } catch {
    return false;
  }

  if (lastAttempt !== null && attemptedAt - lastAttempt < RECOVERY_COOLDOWN_MS) {
    return false;
  }

  try {
    writeLastAttempt(attemptedAt);
  } catch {
    return false;
  }

  event.preventDefault();
  reload();
  return true;
};

let recoveryInstalled = false;

export const installStaleChunkRecovery = () => {
  if (recoveryInstalled || typeof window === 'undefined') {
    return;
  }
  recoveryInstalled = true;

  const handler = createStaleChunkRecoveryHandler({
    now: Date.now,
    readLastAttempt: () => {
      const rawValue = window.sessionStorage.getItem(RECOVERY_STORAGE_KEY);
      if (rawValue === null) {
        return null;
      }

      const value = Number(rawValue);
      return Number.isFinite(value) ? value : null;
    },
    reload: () => window.location.reload(),
    writeLastAttempt: attemptedAt => {
      window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(attemptedAt));
    },
  });

  window.addEventListener('vite:preloadError', handler);
};
