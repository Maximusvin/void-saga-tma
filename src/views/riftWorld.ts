import { Container, Graphics } from 'pixi.js';
import { type BiomeSpec, propSlotAt, terrainOffsetAt } from '../game/biome';
import { createShardPool, type ShardPool } from './shardPool';

/**
 * A persistent, procedurally generated parallax world that scrolls behind the
 * rift combat. Terrain is a continuous function of world-x (no tiles, no seams);
 * biomes crossfade through their palette and silhouette. It owns no combat state
 * and is never rebuilt when the enemy changes — only its `render` is driven each
 * frame, so the tuned combat scene above it stays untouched.
 */

const SAMPLE_STEP = 16;
const SKY_BANDS = 14;
const PROP_MARGIN = 120;

// Atmospheric perspective: far layers wash toward the sky so distance reads as
// haze; the ridge of each layer catches a rim of light for volume.
const LAYER_HAZE = [0.44, 0.26, 0.08] as const;
const RIDGE_WIDTH = [1.4, 1.8, 2.4] as const;

// Nearer layers scroll faster to sell depth.
const LAYERS = [
  { parallax: 0.18, baseline: 0.58, amplitude: 0.5 },
  { parallax: 0.45, baseline: 0.68, amplitude: 0.75 },
  { parallax: 0.82, baseline: 0.8, amplitude: 1 },
] as const;

const PROP_PARALLAX = 0.82;

export interface RiftWorldProfile {
  layerCount: number; // 2 on low, 3 otherwise
  propBudget: number; // max concurrent props
}

export interface RiftWorldFrame {
  cameraX: number;
  from: BiomeSpec;
  to: BiomeSpec;
  blend: number; // 0 → from, 1 → to
}

export interface RiftWorld {
  container: Container;
  layout(width: number, height: number): void;
  render(frame: RiftWorldFrame): void;
  destroy(): void;
}

const channel = (color: number, shift: number) => (color >> shift) & 0xff;

const lerpColor = (from: number, to: number, t: number): number => {
  const r = Math.round(channel(from, 16) + (channel(to, 16) - channel(from, 16)) * t);
  const g = Math.round(channel(from, 8) + (channel(to, 8) - channel(from, 8)) * t);
  const b = Math.round(channel(from, 0) + (channel(to, 0) - channel(from, 0)) * t);
  return (r << 16) | (g << 8) | b;
};

export const createRiftWorld = (profile: RiftWorldProfile): RiftWorld => {
  const container = new Container();

  const skyBands: Graphics[] = [];
  const sky = new Container();
  for (let index = 0; index < SKY_BANDS; index += 1) {
    const band = new Graphics().rect(0, 0, 1, 1).fill({ color: 0xffffff });
    skyBands.push(band);
    sky.addChild(band);
  }

  const terrainLayers: Graphics[] = [];
  const terrain = new Container();
  for (let index = 0; index < profile.layerCount; index += 1) {
    const layer = new Graphics();
    terrainLayers.push(layer);
    terrain.addChild(layer);
  }

  const propsContainer = new Container();
  const propPool: ShardPool<Graphics> = createShardPool<Graphics>(
    propsContainer,
    // A faceted crystal cluster with a soft glow halo behind it; the pool tints
    // the whole thing per biome and scales it per slot.
    () => new Graphics()
      .ellipse(0, -4, 16, 20)
      .fill({ color: 0xffffff, alpha: 0.12 })
      .poly([-1, -22, 5, -6, 2, 13, -3, 13, -6, -5])
      .fill({ color: 0xffffff, alpha: 0.95 })
      .poly([4, -14, 9, -3, 6, 11, 2, 11])
      .fill({ color: 0xffffff, alpha: 0.6 })
      .poly([-6, -10, -2, -3, -3, 10, -8, 8])
      .fill({ color: 0xffffff, alpha: 0.7 }),
    graphic => graphic.destroy(),
  );
  const activeProps = new Map<number, Graphics>();

  container.addChild(sky, terrain, propsContainer);

  let width = 1;
  let height = 1;

  const layout = (nextWidth: number, nextHeight: number) => {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    // Local (0,0) maps to screen top-left despite the centered stage.
    container.position.set(-width / 2, -height / 2);

    const bandHeight = Math.ceil(height / SKY_BANDS);
    skyBands.forEach((band, index) => {
      band.scale.set(width, bandHeight + 1);
      band.position.set(0, index * bandHeight);
    });
  };

  const drawTerrain = (layer: Graphics, from: BiomeSpec, to: BiomeSpec, blend: number, layerIndex: number, cameraX: number) => {
    const { parallax, baseline, amplitude } = LAYERS[layerIndex];
    const baselineY = height * baseline;
    const base = lerpColor(from.terrain[layerIndex], to.terrain[layerIndex], blend);
    const haze = lerpColor(from.skyBottom, to.skyBottom, blend);
    const fill = lerpColor(base, haze, LAYER_HAZE[layerIndex] ?? 0.1);
    const ridge = lerpColor(fill, 0xffffff, 0.34);

    // Sample the silhouette once and reuse it for the fill and the ridge light.
    const top: number[] = [];
    for (let x = 0; x <= width; x += SAMPLE_STEP) {
      const worldX = cameraX * parallax + x;
      const offset = terrainOffsetAt(worldX, from) * (1 - blend) + terrainOffsetAt(worldX, to) * blend;
      top.push(x, baselineY - offset * amplitude);
    }

    layer.clear();
    layer.moveTo(0, height);
    for (let index = 0; index < top.length; index += 2) {
      layer.lineTo(top[index], top[index + 1]);
    }
    layer.lineTo(width, height);
    layer.lineTo(0, height);
    layer.fill({ color: fill, alpha: 1 });

    layer.moveTo(top[0], top[1]);
    for (let index = 2; index < top.length; index += 2) {
      layer.lineTo(top[index], top[index + 1]);
    }
    layer.stroke({ color: ridge, width: RIDGE_WIDTH[layerIndex] ?? 1.5, alpha: 0.5 });
  };

  const render = (frame: RiftWorldFrame) => {
    const { cameraX, from, to, blend } = frame;

    skyBands.forEach((band, index) => {
      const t = index / (SKY_BANDS - 1);
      const fromColor = lerpColor(from.skyTop, from.skyBottom, t);
      const toColor = lerpColor(to.skyTop, to.skyBottom, t);
      band.tint = lerpColor(fromColor, toColor, blend);
    });

    terrainLayers.forEach((layer, index) => {
      drawTerrain(layer, from, to, blend, index, cameraX);
    });

    // Props ride the nearest layer. Recycle slots leaving the window, spawn ones entering it.
    const groundY = height * LAYERS[LAYERS.length - 1].baseline;
    const left = cameraX * PROP_PARALLAX - PROP_MARGIN;
    const right = cameraX * PROP_PARALLAX + width + PROP_MARGIN;
    const propColor = lerpColor(from.prop, to.prop, blend);

    for (const [index, graphic] of activeProps) {
      const slot = propSlotAt(index, to);
      if (!slot || slot.x < left || slot.x > right) {
        propPool.release(graphic);
        activeProps.delete(index);
      }
    }

    const firstIndex = Math.floor(left / 240) - 1;
    const lastIndex = Math.ceil(right / 240) + 1;
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      if (activeProps.has(index) || activeProps.size >= profile.propBudget) {
        continue;
      }
      const slot = propSlotAt(index, to);
      if (!slot || slot.x < left || slot.x > right) {
        continue;
      }
      const graphic = propPool.acquire();
      graphic.tint = propColor;
      graphic.alpha = 0.85;
      activeProps.set(index, graphic);
    }

    for (const [index, graphic] of activeProps) {
      const slot = propSlotAt(index, to);
      if (!slot) {
        continue;
      }
      graphic.position.set(slot.x - cameraX * PROP_PARALLAX, groundY - 6);
      graphic.scale.set(slot.scale * 1.6);
      graphic.tint = propColor;
    }
  };

  const destroy = () => {
    for (const [, graphic] of activeProps) {
      propPool.release(graphic);
    }
    activeProps.clear();
    propPool.destroy();
    container.destroy({ children: true });
  };

  return { container, layout, render, destroy };
};
