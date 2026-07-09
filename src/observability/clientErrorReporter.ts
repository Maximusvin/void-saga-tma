import { GAME_API_BASE_URL, isGameApiEnabled } from '../api/gameApi';
import { getTelegramInitData } from '../utils/telegram';
import { createClientErrorReport, type ClientErrorReportInput } from './clientErrorContract';

const MAX_FINGERPRINTS = 50;
const sentFingerprints = new Set<string>();
let reportingInstalled = false;

const rememberFingerprint = (fingerprint: string) => {
  if (sentFingerprints.has(fingerprint)) {
    return false;
  }

  sentFingerprints.add(fingerprint);
  if (sentFingerprints.size > MAX_FINGERPRINTS) {
    const oldest = sentFingerprints.values().next().value;
    if (oldest) {
      sentFingerprints.delete(oldest);
    }
  }
  return true;
};

const getErrorDetails = (value: unknown) => {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }

  if (typeof value === 'string') {
    return { message: value };
  }

  return { message: 'Unknown client error' };
};

export const reportClientError = (input: ClientErrorReportInput) => {
  if (!isGameApiEnabled() || typeof window === 'undefined') {
    return false;
  }

  const report = createClientErrorReport({
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    path: input.path ?? window.location.pathname,
  });
  const fingerprint = `${report.kind}:${report.message}:${report.stack ?? ''}`;
  if (!rememberFingerprint(fingerprint)) {
    return false;
  }

  const telegramInitData = getTelegramInitData();
  const url = new URL(`${GAME_API_BASE_URL}/api/client-errors`);
  const devPlayerId = import.meta.env.VITE_PLAYER_ID?.trim();
  if (!telegramInitData && devPlayerId) {
    url.searchParams.set('playerId', devPlayerId);
  }

  void fetch(url, {
    body: JSON.stringify(report),
    headers: {
      'content-type': 'application/json',
      ...(telegramInitData ? { 'x-telegram-init-data': telegramInitData } : {}),
    },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined);

  return true;
};

export const installClientErrorReporting = () => {
  if (reportingInstalled || typeof window === 'undefined') {
    return;
  }
  reportingInstalled = true;

  window.addEventListener('error', event => {
    const details = getErrorDetails(event.error ?? event.message);
    reportClientError({ kind: 'window_error', ...details });
  });

  window.addEventListener('unhandledrejection', event => {
    const details = getErrorDetails(event.reason);
    reportClientError({ kind: 'unhandled_rejection', ...details });
  });
};
