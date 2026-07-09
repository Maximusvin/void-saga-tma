import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const command = spawnSync(
  process.platform === 'win32' ? 'docker.exe' : 'docker',
  [
    'compose',
    '--env-file',
    '.env.production.example',
    '-f',
    'docker-compose.prod.yml',
    '--profile',
    'backup',
    'config',
    '--format',
    'json',
  ],
  { encoding: 'utf8' },
);

if (command.status !== 0) {
  process.stderr.write(command.stderr);
  process.exit(command.status ?? 1);
}

const config = JSON.parse(command.stdout);
const serviceNames = Object.keys(config.services ?? {}).sort();
assert.deepEqual(serviceNames, ['api', 'backup', 'web'], 'production compose must contain exactly api, backup and web');

for (const serviceName of ['api', 'web']) {
  const service = config.services[serviceName];
  assert.ok(service.build, `${serviceName} must be built from this repository`);
  assert.ok(!service.ports || service.ports.length === 0, `${serviceName} must not publish host ports`);
  assert.deepEqual(Object.keys(service.networks ?? {}), ['proxy'], `${serviceName} must only use the proxy network`);
}

for (const serviceName of ['api', 'backup', 'web']) {
  const logging = config.services[serviceName].logging;
  assert.equal(logging?.driver, 'json-file', `${serviceName} logs must use the bounded json-file driver`);
  assert.equal(logging?.options?.['max-size'], '10m', `${serviceName} logs must rotate at 10 MB`);
  assert.equal(logging?.options?.['max-file'], '5', `${serviceName} must retain exactly five log files`);
}

const backupService = config.services.backup;
assert.deepEqual(backupService.profiles, ['backup'], 'backup must require the explicit backup profile');
assert.equal(backupService.network_mode, 'none', 'backup must not have network access');
assert.ok(!backupService.ports || backupService.ports.length === 0, 'backup must not publish host ports');
assert.equal(backupService.volumes?.[0]?.read_only, true, 'backup must mount gameplay data read-only');
assert.equal(backupService.volumes?.[1]?.target, '/backup', 'backup must write only to the backup mount');

assert.equal(config.networks?.proxy?.external, true, 'proxy network must be external');
assert.equal(config.networks?.proxy?.name, 'coolify', 'proxy network must resolve to the shared coolify network');

const apiLabels = config.services.api.labels ?? {};
const webLabels = config.services.web.labels ?? {};
assert.match(
  apiLabels['traefik.http.routers.void-saga-api-https.rule'] ?? '',
  /Host\(`game\.riy\.contact`\).*PathPrefix\(`\/api`\)/,
  'API router must target game.riy.contact /api paths',
);
assert.equal(
  apiLabels['traefik.http.routers.void-saga-api-https.priority'],
  '100',
  'API router must win over the frontend catch-all',
);
assert.equal(
  webLabels['traefik.http.routers.void-saga-web-https.rule'],
  'Host(`game.riy.contact`)',
  'web router must be the host catch-all',
);
assert.equal(
  webLabels['traefik.http.routers.void-saga-web-https.priority'],
  '1',
  'web router must remain lower priority than API',
);

process.stdout.write('Production Compose isolation checks passed.\n');
