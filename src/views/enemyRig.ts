import { Container, Sprite, type Texture } from 'pixi.js';
import type { EnemyCritSignal, EnemyImpactSignal } from '../game/enemyImpactSignals';
import type { RiftEnemyVisualSpec } from '../game/riftVisuals';

interface EnemyRigUpdateInput {
  deltaSeconds: number;
  elapsedSeconds: number;
  enrageEnergy: number;
  reduceMotion: boolean;
}

export interface EnemyRigDebugState {
  direction: 'center' | 'left' | 'right';
  phase: 'death' | 'idle' | 'impact';
  rootScale: number;
}

export interface EnemyRig {
  applyCrit: (signal: EnemyCritSignal) => void;
  applyImpact: (signal: EnemyImpactSignal) => void;
  beginDeath: () => void;
  container: Container;
  debugState: () => EnemyRigDebugState;
  destroy: () => void;
  kind: 'static-sprite';
  update: (input: EnemyRigUpdateInput) => void;
}

export const createStaticEnemyRig = (
  texture: Texture,
  visual: RiftEnemyVisualSpec,
): EnemyRig => {
  const container = new Container();
  const art = new Sprite(texture);
  const flash = new Sprite(texture);
  const artScale = visual.artHeight / texture.height;
  let impactEnergy = 0;
  let critEnergy = 0;
  let deathProgress = 0;
  let direction: EnemyRigDebugState['direction'] = 'center';

  art.anchor.set(0.5, visual.artAnchorY);
  art.scale.set(artScale);
  flash.anchor.set(0.5, visual.artAnchorY);
  flash.scale.set(artScale);
  flash.blendMode = 'add';
  flash.alpha = 0;
  container.addChild(art, flash);

  return {
    applyCrit: () => {
      critEnergy = 1;
    },
    applyImpact: signal => {
      impactEnergy = Math.min(1.35, impactEnergy + 1);
      direction = signal.normalizedX < -0.12 ? 'left' : signal.normalizedX > 0.12 ? 'right' : 'center';
    },
    beginDeath: () => {
      deathProgress = Math.max(deathProgress, 0.001);
    },
    container,
    debugState: () => ({
      direction,
      phase: deathProgress > 0 ? 'death' : impactEnergy > 0.04 ? 'impact' : 'idle',
      rootScale: container.scale.x,
    }),
    destroy: () => {
      container.destroy({ children: true });
    },
    kind: 'static-sprite',
    update: ({ deltaSeconds, elapsedSeconds, enrageEnergy, reduceMotion }) => {
      impactEnergy = Math.max(0, impactEnergy - deltaSeconds / 0.18);
      critEnergy = Math.max(0, critEnergy - deltaSeconds / 0.2);
      if (deathProgress > 0) {
        deathProgress = Math.min(1, deathProgress + deltaSeconds / 0.68);
      }
      const breath = reduceMotion ? 1 : 1 + Math.sin(elapsedSeconds * 2.2) * 0.035;
      const hitSquash = 1 - impactEnergy * 0.12;
      container.x = impactEnergy * Math.sin(elapsedSeconds * 42) * 9;
      container.y = (reduceMotion ? 0 : Math.sin(elapsedSeconds * 2.4) * 7) - impactEnergy * 7 + deathProgress * 26;
      container.rotation = (reduceMotion ? 0 : Math.sin(elapsedSeconds * 1.7) * 0.018)
        + impactEnergy * Math.sin(elapsedSeconds * 44) * 0.05
        + deathProgress * 0.09;
      container.scale.set(breath * hitSquash * (1 + enrageEnergy * 0.08));
      container.alpha = Math.max(0.38, 1 - deathProgress * 0.28);
      art.skew.x = reduceMotion ? 0 : Math.sin(elapsedSeconds * 1.3) * 0.008;
      flash.skew.x = art.skew.x;
      flash.alpha = Math.min(0.84, impactEnergy * 0.42 + critEnergy * 0.72 + deathProgress * 0.38 + enrageEnergy * 0.56);
    },
  };
};
