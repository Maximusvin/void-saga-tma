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

const createSignedInitData = (
  authDate = NOW_SECONDS,
  user: Record<string, unknown> = {
    first_name: 'Test',
    id: 777001,
    last_name: 'Riftwalker',
    photo_url: 'https://cdn.example.com/avatar.jpeg',
    username: 'test_riftwalker',
  },
) => {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'test-query');
  params.set('user', JSON.stringify(user));

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
      playerProfile: {
        displayName: 'Test Riftwalker',
        photoUrl: 'https://cdn.example.com/avatar.jpeg',
        source: 'telegram',
        username: 'test_riftwalker',
      },
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

    assert.deepEqual(result, {
      ok: true,
      playerId: 'telegram:777001',
      playerProfile: {
        displayName: 'Test Riftwalker',
        photoUrl: 'https://cdn.example.com/avatar.jpeg',
        source: 'telegram',
        username: 'test_riftwalker',
      },
      source: 'telegram',
    });
  });

  it('keeps the verified player name but drops a non-HTTPS profile photo', () => {
    const result = verifyTelegramInitData(createSignedInitData(NOW_SECONDS, {
      first_name: 'Nova',
      id: 777001,
      photo_url: 'javascript:alert(1)',
    }), BOT_TOKEN, {
      nowMs: NOW_SECONDS * 1000,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.playerProfile, {
        displayName: 'Nova',
        photoUrl: null,
        source: 'telegram',
        username: null,
      });
    }
  });

  it('keeps dev player id fallback when bot token is not configured', () => {
    const result = resolvePlayerIdentityFromCredentials({
      botToken: '',
      requestedPlayerId: 'dev:local',
    });

    assert.deepEqual(result, {
      ok: true,
      playerId: 'dev:local',
      playerProfile: {
        displayName: 'Riftwalker',
        photoUrl: null,
        source: 'local',
        username: null,
      },
      source: 'dev',
    });
  });

  it('fails closed when dev identity is disabled for production', () => {
    const result = resolvePlayerIdentityFromCredentials({
      allowDevIdentity: false,
      botToken: '',
      requestedPlayerId: 'dev:spoofed',
    });

    assert.deepEqual(result, { ok: false, statusCode: 401, error: 'telegram_auth_required' });
  });
});
