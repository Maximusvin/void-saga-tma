import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] ? resolve(process.argv[2]) : null;

if (!input || !existsSync(input)) {
  process.stderr.write('Usage: npm run asset:ironroot:optimize -- <raw.glb>\n');
  process.exit(1);
}

const cli = resolve(repoRoot, 'node_modules/@gltf-transform/cli/bin/cli.js');

const variants = [
  { name: 'high', textureSize: 1024 },
  { name: 'low', textureSize: 512 },
];

for (const variant of variants) {
  const output = resolve(repoRoot, `public/assets/rift/ironroot-3d/ironroot-${variant.name}.glb`);
  const result = spawnSync(process.execPath, [
    cli,
    'optimize',
    input,
    output,
    '--compress',
    'meshopt',
    '--texture-compress',
    'webp',
    '--texture-size',
    String(variant.textureSize),
    '--simplify',
    'false',
  ], { encoding: 'utf8', stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  process.stdout.write(`${variant.name}: ${statSync(output).size} bytes\n`);
}
