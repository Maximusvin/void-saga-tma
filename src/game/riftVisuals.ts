export type RiftEnemyArchetype = 'stalker' | 'bulwark' | 'oracle' | 'sovereign';

export interface RiftEnemyPalette {
  core: number;
  dark: number;
  glow: number;
  mid: number;
  wing: number;
}

export interface RiftEnemyRigVariant {
  atlas: string;
  manifest: string;
}

export interface RiftEnemyRigSpec {
  high: RiftEnemyRigVariant;
  kind: 'layered-pixi';
  low: RiftEnemyRigVariant;
}

export interface RiftEnemyVisualSpec {
  id: string;
  name: string;
  title: string;
  zone: string;
  archetype: RiftEnemyArchetype;
  asset: string;
  backdrop: string;
  artHeight: number;
  artAnchorY: number;
  shadowWidth: number;
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
  rig?: RiftEnemyRigSpec;
}

const ENEMY_VISUALS = [
  {
    id: 'mirefang-stalker',
    name: 'Mirefang Stalker',
    title: 'Crystal predator',
    zone: 'Luminous Verge',
    archetype: 'stalker',
    asset: '/assets/rift/mirefang-stalker.webp',
    backdrop: '/assets/rift/luminous-verge.webp',
    artHeight: 286,
    artAnchorY: 0.5,
    shadowWidth: 192,
    palette: {
      core: 0xa8fff4,
      dark: 0x152c2d,
      glow: 0x36e6d4,
      mid: 0x26786d,
      wing: 0x163c42,
    },
    body: { width: 112, height: 104, radius: 28 },
    coreRadius: 14,
    hornHeight: 58,
    particleCount: 22,
    wingSpread: 82,
  },
  {
    id: 'ironroot-marauder',
    name: 'Ironroot Marauder',
    title: 'Runebound colossus',
    zone: 'Luminous Verge',
    archetype: 'bulwark',
    asset: '/assets/rift/ironroot-marauder.webp',
    backdrop: '/assets/rift/luminous-verge.webp',
    artHeight: 320,
    artAnchorY: 0.52,
    shadowWidth: 182,
    palette: {
      core: 0xffd36a,
      dark: 0x263b38,
      glow: 0x69f0d5,
      mid: 0x58736a,
      wing: 0x294943,
    },
    body: { width: 136, height: 122, radius: 30 },
    coreRadius: 18,
    hornHeight: 48,
    particleCount: 19,
    wingSpread: 68,
    rig: {
      kind: 'layered-pixi',
      high: {
        atlas: '/assets/rift/ironroot-rig/ironroot-atlas-high.webp',
        manifest: '/assets/rift/ironroot-rig/ironroot-atlas-high.json',
      },
      low: {
        atlas: '/assets/rift/ironroot-rig/ironroot-atlas-low.webp',
        manifest: '/assets/rift/ironroot-rig/ironroot-atlas-low.json',
      },
    },
  },
  {
    id: 'ashveil-oracle',
    name: 'Ashveil Oracle',
    title: 'Keeper of the veil',
    zone: 'Luminous Verge',
    archetype: 'oracle',
    asset: '/assets/rift/ashveil-oracle.webp',
    backdrop: '/assets/rift/luminous-verge.webp',
    artHeight: 332,
    artAnchorY: 0.51,
    shadowWidth: 134,
    palette: {
      core: 0xe6d8ff,
      dark: 0x18224f,
      glow: 0x9374ff,
      mid: 0x4d5796,
      wing: 0x252b68,
    },
    body: { width: 104, height: 136, radius: 26 },
    coreRadius: 15,
    hornHeight: 72,
    particleCount: 28,
    wingSpread: 86,
  },
] as const satisfies readonly RiftEnemyVisualSpec[];

const BOSS_VISUAL = {
  id: 'crowned-rift-sovereign',
  name: 'Crowned Rift Sovereign',
  title: 'Astral dominion boss',
  zone: 'Sovereign Gate',
  archetype: 'sovereign',
  asset: '/assets/rift/rift-sovereign.webp',
  backdrop: '/assets/rift/sovereign-gate.webp',
  artHeight: 350,
  artAnchorY: 0.5,
  shadowWidth: 188,
  palette: {
    core: 0xffd97d,
    dark: 0x27113c,
    glow: 0xc865ff,
    mid: 0x6e397f,
    wing: 0x432058,
  },
  body: { width: 142, height: 138, radius: 34 },
  coreRadius: 22,
  hornHeight: 84,
  particleCount: 38,
  wingSpread: 108,
} as const satisfies RiftEnemyVisualSpec;

export const getRiftEnemyVisual = (stage: number, isBoss: boolean): RiftEnemyVisualSpec => {
  if (isBoss) {
    return BOSS_VISUAL;
  }

  const normalizedStage = Math.max(1, Math.floor(stage));
  return ENEMY_VISUALS[(normalizedStage - 1) % ENEMY_VISUALS.length];
};
