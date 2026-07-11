import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync('deploy/nginx.conf', 'utf8');

assert.match(
  config,
  /location\s*=\s*\/index\.html\s*\{[^}]*expires\s+-1\s*;/s,
  'production index.html must be revalidated instead of using a stale WebView cache',
);
assert.match(
  config,
  /location\s+\/\s*\{[^}]*try_files\s+\$uri\s+\$uri\/\s+\/index\.html\s*;/s,
  'production SPA fallback must continue routing to index.html',
);
assert.match(
  config,
  /location\s+\/assets\/rift\/ironroot-3d\/\s*\{[^}]*max-age=31536000,\s*immutable[^}]*try_files\s+\$uri\s+=404\s*;/s,
  'versioned Ironroot binaries must use immutable caching without SPA fallback',
);

process.stdout.write('Production nginx cache checks passed.\n');
