import type { GameAction } from '../game/types';

const OUTBOX_STORAGE_PREFIX = 'void_saga_action_outbox:';
const MAX_OUTBOX_COMMANDS = 64;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9:_-]{8,96}$/;

export interface PendingGameCommand {
  action: GameAction;
  commandId: string;
}

const memoryOutboxes = new Map<string, PendingGameCommand[]>();

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isGameAction = (value: unknown): value is GameAction => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'combat_batch') {
    return (
      Number.isSafeInteger(value.tapCount) &&
      Number(value.tapCount) >= 0 &&
      Number(value.tapCount) <= 20 &&
      Number.isSafeInteger(value.passiveTicks) &&
      Number(value.passiveTicks) >= 0 &&
      Number(value.passiveTicks) <= 1 &&
      (Number(value.tapCount) > 0 || Number(value.passiveTicks) > 0)
    );
  }

  if (value.type === 'summon') {
    return value.randomValue === undefined;
  }

  if (value.type === 'claim_offline_rewards') {
    return true;
  }

  const hasHeroId = typeof value.heroId === 'string' && value.heroId.trim().length > 0;
  if (value.type === 'ascend_hero') {
    return hasHeroId;
  }

  if (value.type === 'upgrade_hero') {
    return hasHeroId && (
      value.amount === undefined ||
      value.amount === 1 ||
      value.amount === 10 ||
      value.amount === 'max'
    );
  }

  return false;
};

const isPendingCommand = (value: unknown): value is PendingGameCommand => {
  return isRecord(value) &&
    typeof value.commandId === 'string' &&
    COMMAND_ID_PATTERN.test(value.commandId) &&
    isGameAction(value.action);
};

const getStorageKey = (playerId: string) => `${OUTBOX_STORAGE_PREFIX}${playerId}`;

const persistOutbox = (playerId: string, commands: PendingGameCommand[]) => {
  memoryOutboxes.set(playerId, commands);

  try {
    if (commands.length === 0) {
      localStorage.removeItem(getStorageKey(playerId));
      return;
    }

    localStorage.setItem(getStorageKey(playerId), JSON.stringify(commands));
  } catch {
    // The in-memory outbox still protects retries during this page session.
  }
};

export const loadActionOutbox = (playerId: string): PendingGameCommand[] => {
  const inMemory = memoryOutboxes.get(playerId);
  if (inMemory) {
    return [...inMemory];
  }

  try {
    const rawValue = localStorage.getItem(getStorageKey(playerId));
    const parsed = rawValue ? JSON.parse(rawValue) as unknown : [];
    const commands = Array.isArray(parsed) ? parsed.filter(isPendingCommand) : [];
    memoryOutboxes.set(playerId, commands);
    return [...commands];
  } catch {
    memoryOutboxes.set(playerId, []);
    return [];
  }
};

export const appendActionOutbox = (playerId: string, command: PendingGameCommand) => {
  const commands = loadActionOutbox(playerId);
  if (commands.some(item => item.commandId === command.commandId)) {
    return;
  }
  if (commands.length >= MAX_OUTBOX_COMMANDS) {
    throw new Error('Game action outbox is full');
  }

  persistOutbox(playerId, [...commands, command]);
};

export const removeActionOutbox = (playerId: string, commandId: string) => {
  persistOutbox(playerId, loadActionOutbox(playerId).filter(command => command.commandId !== commandId));
};
