import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const sourcePath = process.env.VOID_SAGA_DB_PATH ?? '/data/void-saga.sqlite';
const backupDirectory = process.env.VOID_SAGA_BACKUP_PATH ?? '/backup';
const retentionCount = Number(process.env.VOID_SAGA_BACKUP_RETENTION ?? 14);

if (!Number.isSafeInteger(retentionCount) || retentionCount < 1 || retentionCount > 365) {
  throw new Error('VOID_SAGA_BACKUP_RETENTION must be an integer between 1 and 365');
}

await mkdir(backupDirectory, { recursive: true });

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const backupPath = join(backupDirectory, `void-saga-${timestamp}.sqlite`);
const sourceDatabase = new DatabaseSync(sourcePath, { readOnly: true });

try {
  await backup(sourceDatabase, backupPath);
} finally {
  sourceDatabase.close();
}

const backupDatabase = new DatabaseSync(backupPath, { readOnly: true });
try {
  const result = backupDatabase.prepare('PRAGMA quick_check').get();
  if (result?.quick_check !== 'ok') {
    throw new Error('SQLite backup quick_check failed');
  }
} finally {
  backupDatabase.close();
}

const backupStats = await stat(backupPath);
if (backupStats.size === 0) {
  throw new Error('SQLite backup is empty');
}

const backupFiles = (await readdir(backupDirectory))
  .filter((name) => /^void-saga-.*\.sqlite$/.test(name))
  .sort()
  .reverse();

for (const staleBackup of backupFiles.slice(retentionCount)) {
  await unlink(join(backupDirectory, staleBackup));
}

process.stdout.write(`SQLite backup verified: ${backupPath} (${backupStats.size} bytes)\n`);
