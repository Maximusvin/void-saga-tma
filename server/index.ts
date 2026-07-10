import { createServer } from 'node:http';
import { createGameRequestHandler } from './app';
import { createClientErrorRequestHandler } from './clientErrorTelemetry';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';
import { RealmRepository } from './realmRepository';

const PORT = Number(process.env.PORT ?? 8787);

const database = openDatabase();
const gameRepository = new GameRepository(database);
const realmRepository = new RealmRepository(database);
const gameRequestHandler = createGameRequestHandler(gameRepository, realmRepository);
const clientErrorRequestHandler = createClientErrorRequestHandler();
const server = createServer(async (request, response) => {
  if (await clientErrorRequestHandler(request, response)) {
    return;
  }

  gameRequestHandler(request, response);
});

server.listen(PORT, () => {
  console.log(`Void Saga API listening on http://127.0.0.1:${PORT}`);
});
