import { createHmac, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseClientErrorReport, type ClientErrorReport } from '../src/observability/clientErrorContract';
import { HttpRequestError, getRequestUrl, readJsonBody, sendJson, sendNoContent } from './http';
import { resolvePlayerIdentity } from './playerIdentity';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REPORTS = 12;

interface ClientErrorLogEntry extends ClientErrorReport {
  event: 'client_error';
  level: 'error';
  playerHash: string;
  requestId: string;
  receivedAt: string;
}

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

type ClientErrorLogger = (entry: ClientErrorLogEntry) => void;

const defaultLogger: ClientErrorLogger = entry => {
  console.error(JSON.stringify(entry));
};

const hashPlayerId = (playerId: string) => {
  const key = process.env.TELEGRAM_BOT_TOKEN?.trim() || 'void-saga-local-telemetry';
  return createHmac('sha256', key).update(playerId).digest('hex').slice(0, 16);
};

export const createClientErrorRequestHandler = (logger: ClientErrorLogger = defaultLogger) => {
  const rateLimits = new Map<string, RateLimitEntry>();

  const consumeRateLimit = (playerId: string) => {
    const now = Date.now();
    const current = rateLimits.get(playerId);
    if (!current || now - current.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
      if (rateLimits.size >= 1_000) {
        for (const [key, entry] of rateLimits) {
          if (now - entry.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
            rateLimits.delete(key);
          }
        }
      }
      if (rateLimits.size >= 1_000) {
        const oldestKey = rateLimits.keys().next().value;
        if (oldestKey) {
          rateLimits.delete(oldestKey);
        }
      }
      rateLimits.set(playerId, { count: 1, windowStartedAt: now });
      return true;
    }

    if (current.count >= RATE_LIMIT_MAX_REPORTS) {
      return false;
    }

    current.count += 1;
    return true;
  };

  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = getRequestUrl(request);
    if (url.pathname !== '/api/client-errors') {
      return false;
    }

    if (request.method === 'OPTIONS') {
      sendNoContent(response);
      return true;
    }

    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return true;
    }

    try {
      const report = parseClientErrorReport(await readJsonBody(request));
      if (!report) {
        sendJson(response, 400, { error: 'invalid_client_error_report' });
        return true;
      }

      const identity = resolvePlayerIdentity(request, url.searchParams.get('playerId'));
      if (!identity.ok) {
        sendJson(response, identity.statusCode, { error: identity.error });
        return true;
      }

      if (!consumeRateLimit(identity.playerId)) {
        sendJson(response, 429, { error: 'client_error_rate_limited' });
        return true;
      }

      logger({
        ...report,
        event: 'client_error',
        level: 'error',
        playerHash: hashPlayerId(identity.playerId),
        requestId: randomUUID(),
        receivedAt: new Date().toISOString(),
      });
      sendNoContent(response);
      return true;
    } catch (error) {
      if (error instanceof HttpRequestError) {
        sendJson(response, error.statusCode, { error: error.code });
        return true;
      }

      console.error(error);
      sendJson(response, 500, { error: 'internal_server_error' });
      return true;
    }
  };
};

export type { ClientErrorLogEntry };
