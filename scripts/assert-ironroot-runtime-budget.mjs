import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const manifestPath = 'dist/.vite/manifest.json';
assert.ok(existsSync(manifestPath), 'run npm run build before the Ironroot budget gate');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sceneKey = 'src/views/RiftThreeEnemyScene.tsx';
const scene = manifest[sceneKey];
assert.ok(scene?.isDynamicEntry, 'RiftThreeEnemyScene must remain a lazy dynamic entry');

const entryKey = Object.keys(manifest).find(key => manifest[key].isEntry);
assert.ok(entryKey, 'Vite manifest has no application entry');

const collectClosure = (startKey) => {
  const keys = new Set();
  const visit = (key) => {
    if (keys.has(key) || !manifest[key]) {
      return;
    }
    keys.add(key);
    for (const dependency of manifest[key].imports ?? []) {
      visit(dependency);
    }
  };
  visit(startKey);
  return keys;
};

const initialKeys = collectClosure(entryKey);
const lazyKeys = [...collectClosure(sceneKey)].filter(key => !initialKeys.has(key));
assert.ok(lazyKeys.includes(sceneKey), 'the Ironroot scene was accidentally pulled into the initial bundle');

const chunks = lazyKeys.map(key => {
  const file = manifest[key].file;
  const bytes = readFileSync(`dist/${file}`);
  return { file, gzipBytes: gzipSync(bytes).length, rawBytes: bytes.length };
});
const lazyGzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);
const sceneChunk = chunks.find(chunk => chunk.file === scene.file);
assert.ok(sceneChunk, 'Ironroot scene chunk is missing from its lazy dependency closure');

const highModelBytes = statSync('public/assets/rift/ironroot-3d/ironroot-high.glb').size;
const lowModelBytes = statSync('public/assets/rift/ironroot-3d/ironroot-low.glb').size;
const lowColdNetworkBytes = lazyGzipBytes + lowModelBytes;
const highColdNetworkBytes = lazyGzipBytes + highModelBytes;

assert.ok(!existsSync('dist/assets/three/basis'), 'obsolete Basis/KTX2 transcoder was shipped');
assert.ok(sceneChunk.gzipBytes <= 5_000, `scene glue is ${sceneChunk.gzipBytes} gzip bytes`);
assert.ok(lazyGzipBytes <= 170_000, `lazy Three.js runtime is ${lazyGzipBytes} gzip bytes`);
assert.ok(lowModelBytes <= 550_000, `low model is ${lowModelBytes} bytes`);
assert.ok(highModelBytes <= 750_000, `high model is ${highModelBytes} bytes`);
assert.ok(lowColdNetworkBytes <= 720_000, `low cold load is ${lowColdNetworkBytes} bytes`);
assert.ok(highColdNetworkBytes <= 920_000, `high cold load is ${highColdNetworkBytes} bytes`);
for (const chunk of chunks) {
  assert.ok(chunk.rawBytes <= 500_000, `${chunk.file} exceeds Vite's 500 kB warning threshold`);
}

process.stdout.write([
  `Ironroot lazy JS: ${lazyGzipBytes} gzip bytes across ${chunks.length} chunks.`,
  `LOW cold network: ${lowColdNetworkBytes} bytes.`,
  `HIGH cold network: ${highColdNetworkBytes} bytes.`,
  'No Basis/KTX2 transcoder is shipped.',
].join('\n') + '\n');
