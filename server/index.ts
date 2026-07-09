import { createServer } from 'node:http';
import { createGameRequestHandler } from './app';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';

const PORT = Number(process.env.PORT ?? 8787);

const database = openDatabase();
const gameRepository = new GameRepository(database);
const server = createServer(createGameRequestHandler(gameRepository));

server.listen(PORT, () => {
  console.log(`Void Saga API listening on http://127.0.0.1:${PORT}`);
});
