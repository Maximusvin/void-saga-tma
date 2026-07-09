import { createServer } from 'node:http';
import { GAME_BALANCE, GAME_CONTENT, SUMMON_POOL } from '../src/game/balance';
import { applyGameAction } from '../src/game/engine';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';
import { getRequestUrl, readJsonBody, sendJson, sendNoContent } from './http';
import { resolvePlayerIdentity } from './playerIdentity';
import { runPlayerMutation } from './playerLocks';
import { parseGameActionRequest } from './validation';

const PORT = Number(process.env.PORT ?? 8787);

const database = openDatabase();
const gameRepository = new GameRepository(database);

const server = createServer(async (request, response) => {
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
        const playerState = gameRepository.getOrCreatePlayer(identity.playerId);
        const result = applyGameAction(playerState.snapshot, parsedRequest.action);
        const savedState = gameRepository.savePlayer(identity.playerId, result.snapshot);

        return {
          ...savedState,
          events: result.events,
        };
      });

      sendJson(response, 200, actionResult);
      return;
    }

    sendJson(response, 404, { error: 'not_found' });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: 'internal_server_error' });
  }
});

server.listen(PORT, () => {
  console.log(`Void Saga API listening on http://127.0.0.1:${PORT}`);
});
