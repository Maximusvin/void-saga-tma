export const CLIENT_ERROR_KINDS = ['render', 'window_error', 'unhandled_rejection'] as const;

export type ClientErrorKind = typeof CLIENT_ERROR_KINDS[number];

export interface ClientErrorReport {
  schemaVersion: 1;
  kind: ClientErrorKind;
  message: string;
  occurredAt: string;
  path: string;
  stack?: string;
  componentStack?: string;
}

export interface ClientErrorReportInput {
  kind: ClientErrorKind;
  message: string;
  occurredAt?: string;
  path?: string;
  stack?: string;
  componentStack?: string;
}

const MESSAGE_MAX_LENGTH = 500;
const STACK_MAX_LENGTH = 4_000;
const PATH_MAX_LENGTH = 200;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const sanitizeText = (value: string, maxLength: number) => {
  return value
    .replace(/\b\d{8,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted_bot_token]')
    .replace(/\b(hash|signature|query_id|auth_date|user)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, maxLength);
};

const isValidOptionalText = (value: unknown, maxLength: number) => {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
};

export const createClientErrorReport = (input: ClientErrorReportInput): ClientErrorReport => {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const path = input.path?.startsWith('/') ? input.path.split(/[?#]/, 1)[0] : '/';

  return {
    schemaVersion: 1,
    kind: input.kind,
    message: sanitizeText(input.message || 'Unknown client error', MESSAGE_MAX_LENGTH),
    occurredAt,
    path: sanitizeText(path, PATH_MAX_LENGTH),
    ...(input.stack ? { stack: sanitizeText(input.stack, STACK_MAX_LENGTH) } : {}),
    ...(input.componentStack ? { componentStack: sanitizeText(input.componentStack, STACK_MAX_LENGTH) } : {}),
  };
};

export const parseClientErrorReport = (value: unknown): ClientErrorReport | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return null;
  }

  if (!CLIENT_ERROR_KINDS.includes(value.kind as ClientErrorKind)) {
    return null;
  }

  if (typeof value.message !== 'string' || value.message.length === 0 || value.message.length > MESSAGE_MAX_LENGTH) {
    return null;
  }

  if (
    typeof value.path !== 'string'
    || value.path.length === 0
    || value.path.length > PATH_MAX_LENGTH
    || !value.path.startsWith('/')
    || /[?#]/.test(value.path)
  ) {
    return null;
  }

  if (typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt))) {
    return null;
  }

  if (!isValidOptionalText(value.stack, STACK_MAX_LENGTH) || !isValidOptionalText(value.componentStack, STACK_MAX_LENGTH)) {
    return null;
  }

  return createClientErrorReport({
    kind: value.kind as ClientErrorKind,
    message: value.message,
    occurredAt: value.occurredAt,
    path: value.path,
    ...(typeof value.stack === 'string' ? { stack: value.stack } : {}),
    ...(typeof value.componentStack === 'string' ? { componentStack: value.componentStack } : {}),
  });
};
