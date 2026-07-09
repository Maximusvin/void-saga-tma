import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_JSON_BODY_BYTES = 16 * 1024;

export class HttpRequestError extends Error {
  constructor(
    readonly statusCode: 400 | 413,
    readonly code: 'invalid_json' | 'payload_too_large',
  ) {
    super(code);
  }
}

export interface JsonRequest<TBody = unknown> {
  body: TBody;
  query: URLSearchParams;
  request: IncomingMessage;
}

export const readJsonBody = async <TBody>(request: IncomingMessage): Promise<TBody> => {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new HttpRequestError(413, 'payload_too_large');
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody) {
    return undefined as TBody;
  }

  try {
    return JSON.parse(rawBody) as TBody;
  } catch {
    throw new HttpRequestError(400, 'invalid_json');
  }
};

export const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    'access-control-allow-headers': 'content-type,x-telegram-init-data',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(body);
};

export const sendNoContent = (response: ServerResponse) => {
  response.writeHead(204, {
    'access-control-allow-headers': 'content-type,x-telegram-init-data',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-origin': '*',
  });
  response.end();
};

export const getRequestUrl = (request: IncomingMessage) => {
  return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
};
