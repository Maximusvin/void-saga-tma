import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { createClientErrorRequestHandler, type ClientErrorLogEntry } from './clientErrorTelemetry';
import { sendJson } from './http';

const listen = async (server: Server) => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
};

const closeServer = async (server: Server) => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
};

const createTelemetryServer = (logs: ClientErrorLogEntry[]) => {
  const handler = createClientErrorRequestHandler(entry => logs.push(entry));
  return createServer(async (request, response) => {
    if (!await handler(request, response)) {
      sendJson(response, 404, { error: 'not_found' });
    }
  });
};

const validReport = {
  schemaVersion: 1,
  kind: 'render',
  message: 'Pixi renderer failed',
  occurredAt: '2026-07-10T00:00:00.000Z',
  path: '/',
};

const BOT_TOKEN = '123456:test-token';

const createSignedInitData = () => {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'telemetry-test-query');
  params.set('user', JSON.stringify({ id: 777001, first_name: 'Test' }));
  const check = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
};

describe('client error telemetry endpoint', () => {
  it('logs an authenticated, privacy-safe structured event', async () => {
    const logs: ClientErrorLogEntry[] = [];
    const server = createTelemetryServer(logs);

    try {
      await listen(server);
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/client-errors?playerId=dev:telemetry-test`, {
        body: JSON.stringify(validReport),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      assert.equal(response.status, 204);
      assert.equal(logs.length, 1);
      assert.equal(logs[0]?.event, 'client_error');
      assert.match(logs[0]?.playerHash ?? '', /^[a-f0-9]{16}$/);
      assert.equal(JSON.stringify(logs[0]).includes('dev:telemetry-test'), false);
    } finally {
      await closeServer(server);
    }
  });

  it('rejects invalid payloads and bounds reports per player', async () => {
    const logs: ClientErrorLogEntry[] = [];
    const server = createTelemetryServer(logs);

    try {
      await listen(server);
      const { port } = server.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${port}/api/client-errors?playerId=dev:rate-test`;
      const invalid = await fetch(endpoint, {
        body: JSON.stringify({ message: 'missing schema' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(invalid.status, 400);

      const statuses: number[] = [];
      for (let index = 0; index < 13; index += 1) {
        const response = await fetch(endpoint, {
          body: JSON.stringify({ ...validReport, message: `failure-${index}` }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        statuses.push(response.status);
      }

      assert.deepEqual(statuses.slice(0, 12), Array.from({ length: 12 }, () => 204));
      assert.equal(statuses[12], 429);
      assert.equal(logs.length, 12);
    } finally {
      await closeServer(server);
    }
  });

  it('requires and accepts signed Telegram identity in bot mode', async () => {
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const logs: ClientErrorLogEntry[] = [];
    const server = createTelemetryServer(logs);

    try {
      await listen(server);
      const { port } = server.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${port}/api/client-errors`;
      const unauthorized = await fetch(endpoint, {
        body: JSON.stringify(validReport),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(unauthorized.status, 401);

      const authorized = await fetch(endpoint, {
        body: JSON.stringify({ ...validReport, message: 'failed hash=private', unexpectedSecret: 'drop-me' }),
        headers: {
          'content-type': 'application/json',
          'x-telegram-init-data': createSignedInitData(),
        },
        method: 'POST',
      });
      assert.equal(authorized.status, 204);
      assert.equal(logs[0]?.message, 'failed hash=[redacted]');
      assert.equal(JSON.stringify(logs[0]).includes('drop-me'), false);
    } finally {
      await closeServer(server);
      if (previousToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = previousToken;
      }
    }
  });
});
