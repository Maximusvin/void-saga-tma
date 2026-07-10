import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { createPlayerProfile, DEFAULT_PLAYER_PROFILE, type PlayerProfile } from '../src/shared/playerProfile';
import { normalizePlayerId } from './validation';

export const TELEGRAM_INIT_DATA_HEADER = 'x-telegram-init-data';

const DEFAULT_TELEGRAM_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;
const TELEGRAM_AUTH_CLOCK_SKEW_SECONDS = 60;

interface TelegramUserPayload {
  first_name?: unknown;
  id?: unknown;
  last_name?: unknown;
  photo_url?: unknown;
  username?: unknown;
}

interface TelegramVerificationOptions {
  maxAgeSeconds?: number;
  nowMs?: number;
}

interface PlayerIdentityOptions extends TelegramVerificationOptions {
  allowDevIdentity?: boolean;
  botToken?: string;
  requestedPlayerId?: unknown;
  telegramInitData?: string | null;
}

type TelegramVerificationResult =
  | { ok: true; playerId: string; authDate: number; playerProfile: PlayerProfile }
  | { ok: false; error: 'telegram_init_data_invalid' | 'telegram_init_data_expired' };

export type PlayerIdentityResult =
  | { ok: true; playerId: string; playerProfile: PlayerProfile; source: 'telegram' | 'dev' }
  | { ok: false; statusCode: 400 | 401; error: 'playerId_required' | 'telegram_auth_required' | 'telegram_auth_invalid' };

const getHeaderValue = (request: IncomingMessage, name: string) => {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
};

const getTelegramAuthMaxAgeSeconds = () => {
  const configuredValue = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS);
  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : DEFAULT_TELEGRAM_AUTH_MAX_AGE_SECONDS;
};

const getTelegramBotToken = () => {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
};

const safeCompareHex = (actualHex: string, expectedHex: string) => {
  if (!/^[\da-f]+$/i.test(actualHex) || !/^[\da-f]+$/i.test(expectedHex)) {
    return false;
  }

  const actual = Buffer.from(actualHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const getDataCheckString = (params: URLSearchParams) => {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : Number(leftKey > rightKey)))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
};

const parseTelegramUser = (rawUser: string | null) => {
  if (!rawUser) {
    return null;
  }

  try {
    const user = JSON.parse(rawUser) as TelegramUserPayload;
    if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) {
      return null;
    }

    const playerProfile = createPlayerProfile({
      firstName: user.first_name,
      lastName: user.last_name,
      photoUrl: user.photo_url,
      source: 'telegram',
      username: user.username,
    });

    return playerProfile ? { playerProfile, userId: user.id } : null;
  } catch {
    return null;
  }
};

export const verifyTelegramInitData = (
  initData: string,
  botToken: string,
  options: TelegramVerificationOptions = {},
): TelegramVerificationResult => {
  const token = botToken.trim();
  if (!initData.trim() || !token) {
    return { ok: false, error: 'telegram_init_data_invalid' };
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const telegramUser = parseTelegramUser(params.get('user'));

  if (!receivedHash || !Number.isSafeInteger(authDate) || authDate <= 0 || !telegramUser) {
    return { ok: false, error: 'telegram_init_data_invalid' };
  }

  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const calculatedHash = createHmac('sha256', secretKey).update(getDataCheckString(params)).digest('hex');
  if (!safeCompareHex(receivedHash, calculatedHash)) {
    return { ok: false, error: 'telegram_init_data_invalid' };
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? getTelegramAuthMaxAgeSeconds();
  const ageSeconds = nowSeconds - authDate;
  if (ageSeconds > maxAgeSeconds || ageSeconds < -TELEGRAM_AUTH_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: 'telegram_init_data_expired' };
  }

  return {
    ok: true,
    playerId: `telegram:${telegramUser.userId}`,
    playerProfile: telegramUser.playerProfile,
    authDate,
  };
};

export const resolvePlayerIdentityFromCredentials = (options: PlayerIdentityOptions): PlayerIdentityResult => {
  const botToken = options.botToken?.trim() ?? getTelegramBotToken();
  if (botToken) {
    if (!options.telegramInitData) {
      return { ok: false, statusCode: 401, error: 'telegram_auth_required' };
    }

    const verified = verifyTelegramInitData(options.telegramInitData, botToken, {
      maxAgeSeconds: options.maxAgeSeconds,
      nowMs: options.nowMs,
    });

    if (!verified.ok) {
      return { ok: false, statusCode: 401, error: 'telegram_auth_invalid' };
    }

    return {
      ok: true,
      playerId: verified.playerId,
      playerProfile: verified.playerProfile,
      source: 'telegram',
    };
  }

  const allowDevIdentity = options.allowDevIdentity ?? process.env.NODE_ENV !== 'production';
  if (!allowDevIdentity) {
    return { ok: false, statusCode: 401, error: 'telegram_auth_required' };
  }

  const playerId = normalizePlayerId(options.requestedPlayerId);
  if (!playerId) {
    return { ok: false, statusCode: 400, error: 'playerId_required' };
  }

  return { ok: true, playerId, playerProfile: DEFAULT_PLAYER_PROFILE, source: 'dev' };
};

export const resolvePlayerIdentity = (request: IncomingMessage, requestedPlayerId?: unknown) => {
  return resolvePlayerIdentityFromCredentials({
    requestedPlayerId,
    telegramInitData: getHeaderValue(request, TELEGRAM_INIT_DATA_HEADER),
  });
};
