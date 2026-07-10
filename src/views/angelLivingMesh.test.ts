import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAngelShowcaseFrame } from '../game/angelShowcase';
import {
  ANGEL_BODY_MESH_VERTICES_X,
  ANGEL_BODY_MESH_VERTICES_Y,
  deformAngelBodyMesh,
} from './angelLivingMesh';

const buildGrid = (width: number, height: number) => {
  const positions = new Float32Array(ANGEL_BODY_MESH_VERTICES_X * ANGEL_BODY_MESH_VERTICES_Y * 2);
  let offset = 0;
  for (let row = 0; row < ANGEL_BODY_MESH_VERTICES_Y; row += 1) {
    for (let column = 0; column < ANGEL_BODY_MESH_VERTICES_X; column += 1) {
      positions[offset] = (column / (ANGEL_BODY_MESH_VERTICES_X - 1)) * width;
      positions[offset + 1] = (row / (ANGEL_BODY_MESH_VERTICES_Y - 1)) * height;
      offset += 2;
    }
  }
  return positions;
};

describe('angel living mesh', () => {
  it('moves the head and upper silhouette while keeping planted feet stable', () => {
    const width = 494;
    const height = 1152;
    const basePositions = buildGrid(width, height);
    const positions = new Float32Array(basePositions);
    const frame = getAngelShowcaseFrame(3, 0, false);

    deformAngelBodyMesh({ basePositions, frame, height, positions, width });

    const headCenterOffset = ANGEL_BODY_MESH_VERTICES_X * 2 + 3 * 2;
    const footRowOffset = (ANGEL_BODY_MESH_VERTICES_Y - 1) * ANGEL_BODY_MESH_VERTICES_X * 2;
    assert.notEqual(positions[headCenterOffset], basePositions[headCenterOffset]);
    assert.deepEqual(
      [...positions.slice(footRowOffset)],
      [...basePositions.slice(footRowOffset)],
    );
    assert.ok([...positions].every(Number.isFinite));
  });

  it('leaves every vertex untouched for reduced motion', () => {
    const width = 494;
    const height = 1152;
    const basePositions = buildGrid(width, height);
    const positions = new Float32Array(basePositions);

    deformAngelBodyMesh({
      basePositions,
      frame: getAngelShowcaseFrame(3, 0, true),
      height,
      positions,
      width,
    });

    assert.deepEqual([...positions], [...basePositions]);
  });
});
