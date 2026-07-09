export type RiftEnemyArchetype = 'wisp' | 'stalker' | 'bulwark' | 'overlord';

export interface RiftEnemyPalette {
  core: number;
  dark: number;
  glow: number;
  mid: number;
  wing: number;
}

export interface RiftEnemyVisualSpec {
  id: string;
  archetype: RiftEnemyArchetype;
  palette: RiftEnemyPalette;
  body: {
    width: number;
    height: number;
    radius: number;
  };
  coreRadius: number;
  hornHeight: number;
  particleCount: number;
  wingSpread: number;
}

const ENEMY_VISUALS = [
  {
    id: 'rift-wisp',
    archetype: 'wisp',
    palette: {
      core: 0x88fff6,
      dark: 0x24356f,
      glow: 0x66fcf1,
      mid: 0x7a5ee4,
      wing: 0x21195d,
    },
    body: { width: 108, height: 112, radius: 42 },
    coreRadius: 15,
    hornHeight: 56,
    particleCount: 26,
    wingSpread: 74,
  },
  {
    id: 'void-stalker',
    archetype: 'stalker',
    palette: {
      core: 0xb9fbff,
      dark: 0x1e2558,
      glow: 0x42d7ff,
      mid: 0x5d4bc8,
      wing: 0x17133f,
    },
    body: { width: 100, height: 128, radius: 34 },
    coreRadius: 13,
    hornHeight: 72,
    particleCount: 30,
    wingSpread: 88,
  },
  {
    id: 'rift-bulwark',
    archetype: 'bulwark',
    palette: {
      core: 0xd4fff4,
      dark: 0x2d314d,
      glow: 0x7af7bc,
      mid: 0x4e88a8,
      wing: 0x183c54,
    },
    body: { width: 128, height: 108, radius: 28 },
    coreRadius: 18,
    hornHeight: 48,
    particleCount: 24,
    wingSpread: 66,
  },
] as const satisfies readonly RiftEnemyVisualSpec[];

const BOSS_VISUAL = {
  id: 'rift-overlord',
  archetype: 'overlord',
  palette: {
    core: 0xffd36a,
    dark: 0x521455,
    glow: 0xff4fa3,
    mid: 0xb52675,
    wing: 0x6e1d58,
  },
  body: { width: 138, height: 132, radius: 34 },
  coreRadius: 20,
  hornHeight: 82,
  particleCount: 36,
  wingSpread: 104,
} as const satisfies RiftEnemyVisualSpec;

export const getRiftEnemyVisual = (stage: number, isBoss: boolean): RiftEnemyVisualSpec => {
  if (isBoss) {
    return BOSS_VISUAL;
  }

  const normalizedStage = Math.max(1, Math.floor(stage));
  return ENEMY_VISUALS[(normalizedStage - 1) % ENEMY_VISUALS.length];
};
