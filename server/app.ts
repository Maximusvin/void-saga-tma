import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { GAME_BALANCE, GAME_CONTENT, SUMMON_POOL } from '../src/game/balance';
import { applyGameAction } from '../src/game/engine';
import type { GameRepository } from './gameRepository';
import { ActionRateLimiter } from './actionRateLimiter';
import { HttpRequestError, getRequestUrl, readJsonBody, sendJson, sendNoContent } from './http';
import { resolvePlayerIdentity } from './playerIdentity';
import { runPlayerMutation } from './playerLocks';
import { RealmDomainError, type RealmRepository } from './realmRepository';
import { parseGameActionRequest, parseRealmJoinRequest, parseRealmSelectRequest } from './validation';

export const createGameRequestHandler = (
  gameRepository: GameRepository,
  realmRepository: RealmRepository,
): RequestListener => {
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

      if (request.method === 'GET' && url.pathname === '/api/game/realms') {
        const identity = resolvePlayerIdentity(request, url.searchParams.get('playerId'));
        if (!identity.ok) {
          sendJson(response, identity.statusCode, { error: identity.error });
          return;
        }

        sendJson(response, 200, realmRepository.getDirectory(identity.playerId));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/game/realms/join') {
        const parsedRequest = parseRealmJoinRequest(await readJsonBody(request));
        if (!parsedRequest) {
          sendJson(response, 400, { error: 'invalid_realm_join_request' });
          return;
        }
        const identity = resolvePlayerIdentity(request, parsedRequest.requestedPlayerId);
        if (!identity.ok) {
          sendJson(response, identity.statusCode, { error: identity.error });
          return;
        }

        sendJson(response, 200, {
          realm: realmRepository.joinRealm(identity.playerId, parsedRequest.realmId),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/game/realms/select') {
        const parsedRequest = parseRealmSelectRequest(await readJsonBody(request));
        if (!parsedRequest) {
          sendJson(response, 400, { error: 'invalid_realm_select_request' });
          return;
        }
        const identity = resolvePlayerIdentity(request, parsedRequest.requestedPlayerId);
        if (!identity.ok) {
          sendJson(response, identity.statusCode, { error: identity.error });
          return;
        }

        sendJson(response, 200, {
          realm: realmRepository.selectCharacter(identity.playerId, parsedRequest.characterId),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/game/state') {
        const identity = resolvePlayerIdentity(request, url.searchParams.get('playerId'));
        if (!identity.ok) {
          sendJson(response, identity.statusCode, { error: identity.error });
          return;
        }

        const requestedCharacterId = url.searchParams.get('characterId');
        const realm = requestedCharacterId
          ? realmRepository.getOwnedCharacter(identity.playerId, requestedCharacterId)
          : realmRepository.resolveActiveCharacter(identity.playerId);
        const state = gameRepository.getOrCreatePlayer(realm.characterId);
        sendJson(response, 200, {
          characterId: realm.characterId,
          playerId: identity.playerId,
          playerProfile: identity.playerProfile,
          realm,
          snapshot: state.snapshot,
        });
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

        const realm = parsedRequest.characterId
          ? realmRepository.getOwnedCharacter(identity.playerId, parsedRequest.characterId)
          : realmRepository.resolveActiveCharacter(identity.playerId);
        const actionResult = await runPlayerMutation(realm.characterId, () => {
          const command = gameRepository.runIdempotentCommand(
            realm.characterId,
            parsedRequest.commandId,
            snapshot => {
              const rateLimitReason = actionRateLimiter.getRejection(realm.characterId, parsedRequest.action);
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
            characterId: realm.characterId,
            events: command.result.events,
            playerId: identity.playerId,
            playerProfile: identity.playerProfile,
            realm,
            replayed: command.replayed,
            snapshot: command.result.snapshot,
          };
        });

        sendJson(response, 200, actionResult);
        return;
      }

      sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof RealmDomainError) {
        const statusCode = error.code === 'character_not_owned'
          ? 403
          : error.code === 'character_not_found' || error.code === 'realm_not_found'
            ? 404
            : 409;
        sendJson(response, statusCode, { error: error.code });
        return;
      }

      if (error instanceof HttpRequestError) {
        sendJson(response, error.statusCode, { error: error.code });
        return;
      }

      console.error(error);
      sendJson(response, 500, { error: 'internal_server_error' });
    }
  };
};
