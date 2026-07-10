export const BIOME_LENGTH = 10;

export type StageRole = 'mob' | 'mini-boss' | 'biome-boss';

export interface BiomeSpec {
  id: string;
  name: string;
  skyTop: number;
  skyBottom: number;
  terrain: readonly [number, number, number]; // far, mid, near
  prop: number;
  amplitude: number;
  // Integer, so every sine term completes whole cycles over TERRAIN_PERIOD and
  // the silhouette stays continuous where the sampled coordinate wraps.
  frequency: number;
  propDensity: number; // 0..1
}

export const BIOMES: readonly BiomeSpec[] = [
  { id: 'luminous-verge', name: 'Luminous Verge', skyTop: 0x123a3d, skyBottom: 0x2a6f63, terrain: [0x1c4f4a, 0x14403c, 0x0c2a28], prop: 0x8ff6de, amplitude: 44, frequency: 3, propDensity: 0.55 },
  { id: 'ember-deep', name: 'Ember Deep', skyTop: 0x2a1220, skyBottom: 0x7a2f2a, terrain: [0x5a2320, 0x431a1c, 0x2a1012], prop: 0xffb066, amplitude: 52, frequency: 2, propDensity: 0.45 },
  { id: 'astral-reach', name: 'Astral Reach', skyTop: 0x181149, skyBottom: 0x4b3aa0, terrain: [0x2f2a72, 0x231e55, 0x161238], prop: 0xb79bff, amplitude: 38, frequency: 4, propDensity: 0.6 },
  { id: 'frost-hollow', name: 'Frost Hollow', skyTop: 0x10303f, skyBottom: 0x336d86, terrain: [0x235066, 0x1a3d50, 0x102632], prop: 0x9fe6ff, amplitude: 46, frequency: 3, propDensity: 0.5 },
  { id: 'sunken-ruins', name: 'Sunken Ruins', skyTop: 0x1a2a1f, skyBottom: 0x3f6b45, terrain: [0x2c4a30, 0x213a26, 0x152618], prop: 0xbff29a, amplitude: 42, frequency: 2, propDensity: 0.52 },
] as const;

export const getBiomeIndexForStage = (stage: number): number => {
  return Math.floor((Math.max(1, Math.floor(stage)) - 1) / BIOME_LENGTH);
};

export const getBiomeForStage = (stage: number): BiomeSpec => {
  return BIOMES[getBiomeIndexForStage(stage) % BIOMES.length];
};

export const getStageRole = (stage: number): StageRole => {
  const normalized = Math.max(1, Math.floor(stage));
  if (normalized % 10 === 0) {
    return 'biome-boss';
  }
  if (normalized % 5 === 0) {
    return 'mini-boss';
  }
  return 'mob';
};

// Fold worldX into one period so sin() keeps precision at huge stages. Frequencies
// are integers, so every term completes a whole number of cycles over the period
// and the silhouette is continuous where worldX wraps.
const TERRAIN_PERIOD = 4096;

export const terrainOffsetAt = (worldX: number, spec: BiomeSpec): number => {
  const wrapped = ((worldX % TERRAIN_PERIOD) + TERRAIN_PERIOD) % TERRAIN_PERIOD;
  const t = (wrapped / TERRAIN_PERIOD) * Math.PI * 2;
  const f = spec.frequency;
  return spec.amplitude * (
    0.6 * Math.sin(t * f) +
    0.3 * Math.sin(t * f * 2) +
    0.1 * Math.sin(t * f * 4)
  );
};

export const blendTerrain = (worldX: number, from: BiomeSpec, to: BiomeSpec, t: number): number => {
  const clamped = Math.max(0, Math.min(1, t));
  return terrainOffsetAt(worldX, from) * (1 - clamped) + terrainOffsetAt(worldX, to) * clamped;
};

const PROP_SPACING = 240;

const hashUnit = (seed: number): number => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

export const propSlotAt = (index: number, spec: BiomeSpec): { x: number; scale: number } | null => {
  const gate = hashUnit(index);
  if (gate > spec.propDensity) {
    return null;
  }
  const jitter = hashUnit(index * 1.7) * PROP_SPACING * 0.5;
  return { x: index * PROP_SPACING + jitter, scale: 0.7 + hashUnit(index * 2.3) * 0.7 };
};
