import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClientErrorReport, parseClientErrorReport } from './clientErrorContract';

describe('client error contract', () => {
  it('bounds reports and redacts Telegram credentials', () => {
    const report = createClientErrorReport({
      kind: 'window_error',
      message: `request failed hash=secret 12345678:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ${'x'.repeat(600)}`,
      occurredAt: '2026-07-10T00:00:00.000Z',
      path: '/rift?hash=secret',
      stack: 'query_id=private-value',
    });

    assert.equal(report.path, '/rift');
    assert.equal(report.message.includes('12345678:'), false);
    assert.equal(report.message.includes('hash=secret'), false);
    assert.equal(report.message.length, 500);
    assert.equal(report.stack, 'query_id=[redacted]');
  });

  it('accepts a bounded privacy-safe report', () => {
    const report = createClientErrorReport({
      kind: 'render',
      message: 'Pixi renderer failed',
      occurredAt: '2026-07-10T00:00:00.000Z',
      path: '/',
      componentStack: 'at RiftPixiScene',
    });

    assert.deepEqual(parseClientErrorReport(report), report);
  });

  it('rejects oversized or query-bearing server payloads', () => {
    const baseReport = {
      schemaVersion: 1,
      kind: 'render',
      message: 'failure',
      occurredAt: '2026-07-10T00:00:00.000Z',
      path: '/',
    };

    assert.equal(parseClientErrorReport({ ...baseReport, message: 'x'.repeat(501) }), null);
    assert.equal(parseClientErrorReport({ ...baseReport, path: '/?hash=secret' }), null);
  });

  it('whitelists fields and redacts accepted server payloads', () => {
    const parsed = parseClientErrorReport({
      schemaVersion: 1,
      kind: 'render',
      message: 'failed hash=private',
      occurredAt: '2026-07-10T00:00:00.000Z',
      path: '/',
      unexpectedSecret: 'must-not-be-logged',
    });

    assert.equal(parsed?.message, 'failed hash=[redacted]');
    assert.equal(JSON.stringify(parsed).includes('must-not-be-logged'), false);
  });
});
