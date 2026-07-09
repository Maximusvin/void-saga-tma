import type { IncomingMessage, ServerResponse } from 'node:http';

export interface JsonRequest<TBody = unknown> {
  body: TBody;
  query: URLSearchParams;
  request: IncomingMessage;
}

export const readJsonBody = async <TBody>(request: IncomingMessage): Promise<TBody> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody) {
    return undefined as TBody;
  }

  return JSON.parse(rawBody) as TBody;
};

export const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(body);
};

export const sendNoContent = (response: ServerResponse) => {
  response.writeHead(204, {
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-origin': '*',
  });
  response.end();
};

export const getRequestUrl = (request: IncomingMessage) => {
  return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
};
