export interface EnemyAtlasFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface EnemyAtlasManifest {
  atlas: string;
  frames: Record<string, EnemyAtlasFrame>;
  size: { height: number; width: number };
  sourceScale: number;
  variant: 'high' | 'low';
  version: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

export const parseEnemyAtlasManifest = (value: unknown): EnemyAtlasManifest => {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.size) || !isRecord(value.frames)) {
    throw new Error('Enemy rig atlas manifest has an invalid root shape.');
  }
  if (value.variant !== 'high' && value.variant !== 'low') {
    throw new Error('Enemy rig atlas manifest has an invalid variant.');
  }
  const frames: Record<string, EnemyAtlasFrame> = {};
  for (const [name, frameValue] of Object.entries(value.frames)) {
    if (!isRecord(frameValue)) {
      throw new Error(`Enemy rig frame ${name} is invalid.`);
    }
    const { height, width, x, y } = frameValue;
    if (![height, width, x, y].every(item => typeof item === 'number' && Number.isFinite(item))) {
      throw new Error(`Enemy rig frame ${name} has invalid coordinates.`);
    }
    if ((width as number) <= 0 || (height as number) <= 0 || (x as number) < 0 || (y as number) < 0) {
      throw new Error(`Enemy rig frame ${name} is outside the atlas.`);
    }
    frames[name] = {
      height: height as number,
      width: width as number,
      x: x as number,
      y: y as number,
    };
  }
  const width = value.size.width;
  const height = value.size.height;
  const sourceScale = value.sourceScale;
  const atlas = value.atlas;
  if (
    typeof width !== 'number' || typeof height !== 'number'
    || typeof sourceScale !== 'number' || typeof atlas !== 'string'
  ) {
    throw new Error('Enemy rig atlas manifest metadata is invalid.');
  }
  for (const [name, frame] of Object.entries(frames)) {
    if (frame.x + frame.width > width || frame.y + frame.height > height) {
      throw new Error(`Enemy rig frame ${name} exceeds atlas bounds.`);
    }
  }
  return {
    atlas,
    frames,
    size: { height, width },
    sourceScale,
    variant: value.variant,
    version: 1,
  };
};
