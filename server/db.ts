import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyGameMigrations } from './migrations';

const DEFAULT_DB_PATH = 'data/void-saga.sqlite';

export const getDatabasePath = (configuredPath = process.env.VOID_SAGA_DB_PATH) => {
  return resolve(configuredPath ?? DEFAULT_DB_PATH);
};

export const openDatabase = (configuredPath?: string) => {
  const databasePath = getDatabasePath(configuredPath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  applyGameMigrations(database);

  return database;
};
