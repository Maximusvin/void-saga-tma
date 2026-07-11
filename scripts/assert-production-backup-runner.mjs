import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shell = process.env.SH_BIN ?? 'sh';
const tempRoot = mkdtempSync(join(tmpdir(), 'void-saga-backup-runner-'));
const fakeDocker = join(tempRoot, 'docker');
const invocationLog = join(tempRoot, 'compose-invocation.txt');

writeFileSync(fakeDocker, `#!/bin/sh
set -eu
case "$1" in
  ps)
    printf '%s\\n' 'api-container-id'
    ;;
  inspect)
    printf '%s\\n' "\${FAKE_DOCKER_IMAGE:-registry.local/void-saga-api:deadbeef}"
    ;;
  image)
    exit 0
    ;;
  compose)
    printf '%s\\n' "\${VOID_SAGA_BACKUP_IMAGE:-}" > "\${FAKE_DOCKER_LOG:?}"
    printf '%s\\n' "$*" >> "\${FAKE_DOCKER_LOG:?}"
    ;;
  *)
    printf '%s\\n' "Unexpected fake docker command: $*" >&2
    exit 2
    ;;
esac
`, { encoding: 'utf8', mode: 0o755 });
chmodSync(fakeDocker, 0o755);

const runBackup = (image) => spawnSync(
  shell,
  [join(repoRoot, 'deploy/run-backup.sh')],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DOCKER_BIN: fakeDocker,
      FAKE_DOCKER_IMAGE: image,
      FAKE_DOCKER_LOG: invocationLog,
      VOID_SAGA_ENV_FILE: join(repoRoot, '.env.production.example'),
      VOID_SAGA_REPO_DIR: repoRoot,
    },
  },
);

try {
  const deployedImage = 'registry.local/void-saga-api:deadbeef';
  const success = runBackup(deployedImage);
  assert.equal(success.status, 0, success.stderr);
  const [renderedImage, command] = readFileSync(invocationLog, 'utf8').trim().split(/\r?\n/);
  assert.equal(renderedImage, deployedImage);
  assert.match(command, /^compose --env-file /);
  assert.match(command, /-f docker-compose\.prod\.yml -f docker-compose\.backup\.yml/);
  assert.match(command, /--profile backup run --rm --no-deps --pull never backup$/);

  writeFileSync(invocationLog, '', 'utf8');
  const latest = runBackup('void-saga-api:latest');
  assert.notEqual(latest.status, 0, 'latest image must be rejected');
  assert.match(latest.stderr, /Refusing backup/);
  assert.equal(readFileSync(invocationLog, 'utf8'), '', 'compose must not run after rejecting latest');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write('Production backup runner checks passed.\n');
