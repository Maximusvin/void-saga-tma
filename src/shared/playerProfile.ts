export type PlayerProfileSource = 'local' | 'telegram';

export interface PlayerProfile {
  displayName: string;
  photoUrl: string | null;
  source: PlayerProfileSource;
  username: string | null;
}

interface PlayerProfileInput {
  firstName: unknown;
  lastName?: unknown;
  photoUrl?: unknown;
  source: PlayerProfileSource;
  username?: unknown;
}

const MAX_NAME_PART_LENGTH = 48;
const MAX_DISPLAY_NAME_LENGTH = 72;
const MAX_USERNAME_LENGTH = 64;

const normalizeText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizePhotoUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};

export const createPlayerProfile = (input: PlayerProfileInput): PlayerProfile | null => {
  const firstName = normalizeText(input.firstName, MAX_NAME_PART_LENGTH);
  if (!firstName) {
    return null;
  }

  const lastName = normalizeText(input.lastName, MAX_NAME_PART_LENGTH);
  const displayName = [firstName, lastName]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .slice(0, MAX_DISPLAY_NAME_LENGTH);

  return {
    displayName,
    photoUrl: normalizePhotoUrl(input.photoUrl),
    source: input.source,
    username: normalizeText(input.username, MAX_USERNAME_LENGTH),
  };
};

export const DEFAULT_PLAYER_PROFILE: PlayerProfile = {
  displayName: 'Riftwalker',
  photoUrl: null,
  source: 'local',
  username: null,
};

export const normalizePlayerProfile = (value: unknown): PlayerProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const profile = value as Partial<PlayerProfile>;
  if (profile.source !== 'local' && profile.source !== 'telegram') {
    return null;
  }

  return createPlayerProfile({
    firstName: profile.displayName,
    photoUrl: profile.photoUrl,
    source: profile.source,
    username: profile.username,
  });
};

export const getPlayerInitials = (displayName: string) => {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'VS';
  }

  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts.at(-1)?.[0] ?? '' : ''}`.toUpperCase();
};
