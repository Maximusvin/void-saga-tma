import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { GAME_BALANCE, GAME_CONTENT, SUMMON_POOL } from '../src/game/balance';
import { applyGameAction } from '../src/game/engine';
import type { GameRepository } from './gameRepository';
import { ActionRateLimiter } from './actionRateLimiter';
import { HttpRequestError, getRequestUrl, readJsonBody, sendJson, sendNoContent } from './http';
import { resolvePlayerIdentity } from './playerIdentity';
import { runPlayerMutation } from './playerLocks';
import { parseGameActionRequest } from './validation';

export const createGameRequestHandler = (gameRepository: GameRepository): RequestListener => {
  const actionRateLimiter = new ActionRateLimiter();

  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      if (request.method === 'OPTIONS') {
        sendNoContent(response);
        return;
      }

      const url = getRequestUrl(request);

      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/game/content') {
        sendJson(response, 200, {
          contentVersion: GAME_CONTENT.version,
          content: GAME_CONTENT,
          balance: GAME_BALANCE,
          summonPool: SUMMON_POOL,
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/game/state') {
        const identity = resolvePlayerIdentity(request, url.searchParams.get('playerId'));
        if (!identity.ok) {
          sendJson(response, identity.statusCode, { error: identity.error });
          return;
        }

        sendJson(response, 200, gameRepository.getOrCreatePlayer(identity.playerId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/game/action') {
        const parsedRequest = parseGameActionRequest(await readJsonBody(request));
        if (!parsedRequest) {
          sendJson(response, 400, { error: 'invalid_action_request' });
          return;
        }

        const identity = resolvePlayerIdentity(request, parsedRequest.requestedPlayerId);
        if (!identity.ok) {
          sendJson(response, identity.statusCode, { error: identity.error });
          return;
        }

        const actionResult = await runPlayerMutation(identity.playerId, () => {
          const command = gameRepository.runIdempotentCommand(
            identity.playerId,
            parsedRequest.commandId,
            snapshot => {
              const rateLimitReason = actionRateLimiter.getRejection(identity.playerId, parsedRequest.action);
              if (rateLimitReason) {
                return {
                  snapshot,
                  events: [{ type: 'action_rejected' as const, reason: rateLimitReason }],
                };
              }

              return applyGameAction(snapshot, parsedRequest.action);
            },
          );

          return {
            ...command.result,
            replayed: command.replayed,
          };
        });

        sendJson(response, 200, actionResult);
        return;
      }

      sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        sendJson(response, error.statusCode, { error: error.code });
        return;
      }

      console.error(error);
      sendJson(response, 500, { error: 'internal_server_error' });
    }
  };
};
