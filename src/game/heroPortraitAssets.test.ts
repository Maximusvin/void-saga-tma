import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { SUMMON_POOL } from './content';

const MAX_PORTRAIT_BYTES = 120_000;

const readWebpDimensions = (buffer: Buffer) => {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  const chunk = buffer.toString('ascii', 12, 16);

  if (chunk === 'VP8 ') {
    assert.equal(buffer.toString('hex', 23, 26), '9d012a');
    return {
      height: buffer.readUInt16LE(28) & 0x3fff,
      width: buffer.readUInt16LE(26) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      height: ((bits >> 14) & 0x3fff) + 1,
      width: (bits & 0x3fff) + 1,
    };
  }
  if (chunk === 'VP8X') {
    return {
      height: buffer.readUIntLE(27, 3) + 1,
      width: buffer.readUIntLE(24, 3) + 1,
    };
  }

  throw new Error(`Unsupported WebP chunk ${chunk}`);
};

test('publishes every hero portrait as a bounded square WebP', () => {
  for (const hero of SUMMON_POOL) {
    const path = resolve('public', hero.portrait.slice(1));
    const size = statSync(path).size;
    const dimensions = readWebpDimensions(readFileSync(path));

    assert.ok(size > 8_000, `${hero.id} portrait is unexpectedly empty`);
    assert.ok(size <= MAX_PORTRAIT_BYTES, `${hero.id} portrait exceeds the mobile budget`);
    assert.deepEqual(dimensions, { width: 512, height: 512 }, `${hero.id} portrait dimensions`);
  }
});
