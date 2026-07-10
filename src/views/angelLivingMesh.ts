import type { AngelShowcaseFrame } from '../game/angelShowcase';

export const ANGEL_BODY_MESH_VERTICES_X = 7;
export const ANGEL_BODY_MESH_VERTICES_Y = 13;
export const ANGEL_HEAD_PIVOT_X = 0.52;
export const ANGEL_HEAD_PIVOT_Y = 0.255;

interface DeformAngelBodyMeshOptions {
  basePositions: Float32Array;
  frame: AngelShowcaseFrame;
  height: number;
  positions: Float32Array;
  width: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (from: number, to: number, value: number) => {
  const normalized = clamp01((value - from) / (to - from));
  return normalized * normalized * (3 - 2 * normalized);
};

export const deformAngelBodyMesh = ({
  basePositions,
  frame,
  height,
  positions,
  width,
}: DeformAngelBodyMeshOptions) => {
  const pivotX = width * ANGEL_HEAD_PIVOT_X;
  const pivotY = height * ANGEL_HEAD_PIVOT_Y;
  const cosine = Math.cos(frame.headRotation);
  const sine = Math.sin(frame.headRotation);

  for (let index = 0; index < basePositions.length; index += 2) {
    const baseX = basePositions[index];
    const baseY = basePositions[index + 1];
    const normalizedX = baseX / width;
    const normalizedY = baseY / height;
    const headWeight = 1 - smoothstep(0.2, 0.335, normalizedY);
    const chestWeight = smoothstep(0.205, 0.3, normalizedY)
      * (1 - smoothstep(0.3, 0.48, normalizedY));
    const hairSideWeight = smoothstep(0.12, 0.38, Math.abs(normalizedX - 0.5));
    const hairHeightWeight = 1 - smoothstep(0.04, 0.31, normalizedY);
    const distanceX = baseX - pivotX;
    const distanceY = baseY - pivotY;
    const rotatedX = pivotX + distanceX * cosine - distanceY * sine;
    const rotatedY = pivotY + distanceX * sine + distanceY * cosine;
    const headX = baseX + (rotatedX - baseX + frame.headOffsetX) * headWeight;
    const headY = baseY + (rotatedY - baseY + frame.headOffsetY) * headWeight;
    const chestDirection = normalizedX < 0.5 ? -1 : 1;

    positions[index] = headX
      + chestDirection * frame.chestExpansion * 3.2 * chestWeight
      + frame.hairWind * 5.2 * hairSideWeight * hairHeightWeight;
    positions[index + 1] = headY
      - frame.chestExpansion * 1.7 * chestWeight
      + Math.abs(frame.hairWind) * 0.8 * hairSideWeight * hairHeightWeight;
  }
};
