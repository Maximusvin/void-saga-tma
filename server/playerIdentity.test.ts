import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerIdentityFromCredentials, verifyTelegramInitData } from './playerIdentity';

const BOT_TOKEN = '123456:test-token';
const NOW_SECONDS = 1_800_000_000;

const getDataCheckString = (params: URLSearchParams) => {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : Number(leftKey > rightKey)))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
};

const createSignedInitData = (authDate = NOW_SECONDS) => {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'test-query');
  params.set('user', JSON.stringify({ id: 777001, first_name: 'Test' }));

  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(getDataCheckString(params)).digest('hex');
  params.set('hash', hash);

  return params.toString();
};

describe('Telegram player identity', () => {
  it('verifies signed Telegram initData and derives player id', () => {
    const result = verifyTelegramInitData(createSignedInitData(), BOT_TOKEN, {
      nowMs: NOW_SECONDS * 1000,
    });

    assert.deepEqual(result, {
      ok: true,
      playerId: 'telegram:777001',
      authDate: NOW_SECONDS,
    });
  });

  it('rejects tampered Telegram initData', () => {
    const initData = createSignedInitData().replace('777001', '777002');
    const result = verifyTelegramInitData(initData, BOT_TOKEN, {
      nowMs: NOW_SECONDS * 1000,
    });

    assert.deepEqual(result, { ok: false, error: 'telegram_init_data_invalid' });
  });

  it('rejects expired Telegram initData', () => {
    const result = verifyTelegramInitData(createSignedInitData(NOW_SECONDS - 90_000), BOT_TOKEN, {
      nowMs: NOW_SECONDS * 1000,
    });

    assert.deepEqual(result, { ok: false, error: 'telegram_init_data_expired' });
  });

  it('requires Telegram auth when bot token is configured', () => {
    const result = resolvePlayerIdentityFromCredentials({
      botToken: BOT_TOKEN,
      requestedPlayerId: 'dev:local',
    });

    assert.deepEqual(result, { ok: false, statusCode: 401, error: 'telegram_auth_required' });
  });

  it('uses Telegram identity instead of requested player id when initData is valid', () => {
    const result = resolvePlayerIdentityFromCredentials({
      botToken: BOT_TOKEN,
      requestedPlayerId: 'dev:spoofed',
      telegramInitData: createSignedInitData(),
      nowMs: NOW_SECONDS * 1000,
    });

    assert.deepEqual(result, { ok: true, playerId: 'telegram:777001', source: 'telegram' });
  });

  it('keeps dev player id fallback when bot token is not configured', () => {
    const result = resolvePlayerIdentityFromCredentials({
      botToken: '',
      requestedPlayerId: 'dev:local',
    });

    assert.deepEqual(result, { ok: true, playerId: 'dev:local', source: 'dev' });
  });
});
