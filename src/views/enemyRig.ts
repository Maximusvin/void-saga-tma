import {
  Container,
  MeshPlane,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import {
  advanceEnemyRigMotion,
  applyEnemyCrit,
  applyEnemyImpact,
  beginEnemyDeath,
  createEnemyRigMotionState,
  type EnemyCritSignal,
  type EnemyImpactSignal,
} from '../game/enemyRigMotion';
import type { EnemyAtlasManifest } from '../game/enemyRigManifest';
import type { RiftEnemyVisualSpec } from '../game/riftVisuals';

export interface LoadedEnemyRigAsset {
  atlas: Texture;
  manifest: EnemyAtlasManifest;
}


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
  kind: 'layered-pixi' | 'static-sprite';
  update: (input: EnemyRigUpdateInput) => void;
}

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

const lerpColor = (from: number, to: number, progress: number) => {
  const red = Math.round(lerp((from >> 16) & 0xff, (to >> 16) & 0xff, progress));
  const green = Math.round(lerp((from >> 8) & 0xff, (to >> 8) & 0xff, progress));
  const blue = Math.round(lerp(from & 0xff, to & 0xff, progress));
  return (red << 16) | (green << 8) | blue;
};

const assertFrame = (manifest: EnemyAtlasManifest, name: string) => {
  const frame = manifest.frames[name];
  if (!frame) {
    throw new Error(`Missing enemy rig atlas frame: ${name}`);
  }
  return frame;
};

const createFrameTextures = (asset: LoadedEnemyRigAsset) => {
  const textures = new Map<string, Texture>();
  for (const [name, frame] of Object.entries(asset.manifest.frames)) {
    textures.set(name, new Texture({
      frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
      label: `ironroot-${name}`,
      source: asset.atlas.source,
    }));
  }
  return textures;
};

const createSprite = (
  textures: Map<string, Texture>,
  name: string,
  anchorX: number,
  anchorY: number,
) => {
  const texture = textures.get(name);
  if (!texture) {
    throw new Error(`Missing enemy rig texture: ${name}`);
  }
  const sprite = new Sprite(texture);
  sprite.anchor.set(anchorX, anchorY);
  return sprite;
};

interface MossMesh {
  basePositions: Float32Array;
  mesh: MeshPlane;
  positions: Float32Array;
}

const createMossMesh = (textures: Map<string, Texture>, name: string): MossMesh => {
  const texture = textures.get(name);
  if (!texture) {
    throw new Error(`Missing enemy moss texture: ${name}`);
  }
  const mesh = new MeshPlane({ texture, verticesX: 3, verticesY: 5 });
  const positionBuffer = mesh.geometry.getAttribute('aPosition').buffer;
  if (!(positionBuffer.data instanceof Float32Array)) {
    throw new Error(`Enemy moss mesh ${name} has no Float32Array position buffer.`);
  }
  return {
    basePositions: new Float32Array(positionBuffer.data),
    mesh,
    positions: positionBuffer.data,
  };
};

const bendMoss = (moss: MossMesh, bend: number, phase: number) => {
  const height = moss.mesh.texture.height;
  for (let index = 0; index < moss.positions.length; index += 2) {
    const baseX = moss.basePositions[index];
    const baseY = moss.basePositions[index + 1];
    const normalizedY = height > 0 ? baseY / height : 0;
    const falloff = normalizedY * normalizedY;
    moss.positions[index] = baseX + bend * falloff * 54 + Math.sin(phase + normalizedY * 2.4) * falloff * 1.4;
    moss.positions[index + 1] = baseY - Math.abs(bend) * falloff * 4;
  }
  moss.mesh.geometry.getAttribute('aPosition').buffer.update();
};

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

export const createIronrootEnemyRig = (
  asset: LoadedEnemyRigAsset,
  visual: RiftEnemyVisualSpec,
  reduceMotion: boolean,
): EnemyRig => {
  for (const name of [
    'back', 'torso', 'head', 'pelvis',
    'left_shoulder', 'left_upper_arm', 'left_forearm', 'left_hand',
    'right_shoulder', 'right_upper_arm', 'right_forearm', 'right_hand',
    'left_thigh', 'left_shin_foot', 'right_thigh', 'right_shin_foot',
    'moss_left', 'moss_center', 'moss_right', 'chest_glow',
  ]) {
    assertFrame(asset.manifest, name);
  }

  const textures = createFrameTextures(asset);
  const container = new Container();
  const rigRoot = new Container();
  const backBone = new Container();
  const torsoBone = new Container();
  const pelvisBone = new Container();
  const headBone = new Container();
  const leftArm = new Container();
  const leftForearm = new Container();
  const leftHand = new Container();
  const rightArm = new Container();
  const rightForearm = new Container();
  const rightHand = new Container();
  const leftLeg = new Container();
  const leftShin = new Container();
  const rightLeg = new Container();
  const rightShin = new Container();
  const leftShoulder = new Container();
  const rightShoulder = new Container();
  const glowBone = new Container();
  const motion = createEnemyRigMotionState();
  const artSprites: Sprite[] = [];
  const baseScale = visual.artHeight / 880;
  let lastImpactId = -1;
  let lastCritId = -1;
  let lastDirection: EnemyRigDebugState['direction'] = 'center';

  const addSprite = (
    parent: Container,
    name: string,
    anchorX: number,
    anchorY: number,
    x = 0,
    y = 0,
  ) => {
    const sprite = createSprite(textures, name, anchorX, anchorY);
    sprite.position.set(x, y);
    parent.addChild(sprite);
    artSprites.push(sprite);
    return sprite;
  };

  addSprite(backBone, 'back', 0.5, 0.82);
  addSprite(torsoBone, 'torso', 0.5, 0.86);
  addSprite(pelvisBone, 'pelvis', 0.5, 0.52);
  addSprite(headBone, 'head', 0.5, 0.88);
  addSprite(leftArm, 'left_upper_arm', 0.5, 0.1);
  addSprite(leftForearm, 'left_forearm', 0.5, 0.08);
  addSprite(leftHand, 'left_hand', 0.5, 0.08);
  addSprite(rightArm, 'right_upper_arm', 0.5, 0.1);
  addSprite(rightForearm, 'right_forearm', 0.5, 0.08);
  addSprite(rightHand, 'right_hand', 0.5, 0.08);
  addSprite(leftLeg, 'left_thigh', 0.5, 0.1);
  addSprite(leftShin, 'left_shin_foot', 0.5, 0.1);
  addSprite(rightLeg, 'right_thigh', 0.5, 0.1);
  addSprite(rightShin, 'right_shin_foot', 0.5, 0.1);
  addSprite(leftShoulder, 'left_shoulder', 0.64, 0.68);
  addSprite(rightShoulder, 'right_shoulder', 0.36, 0.68);
  const glow = addSprite(glowBone, 'chest_glow', 0.5, 0.5);
  glow.blendMode = 'add';

  const mossLeft = createMossMesh(textures, 'moss_left');
  const mossCenter = createMossMesh(textures, 'moss_center');
  const mossRight = createMossMesh(textures, 'moss_right');
  mossLeft.mesh.position.set(-112, -642);
  mossCenter.mesh.position.set(-mossCenter.mesh.texture.width / 2, -686);
  mossRight.mesh.position.set(36, -642);

  leftArm.position.set(-142, -616);
  leftForearm.position.set(-8, 126);
  leftHand.position.set(-5, 202);
  leftArm.addChild(leftForearm);
  leftForearm.addChild(leftHand);
  rightArm.position.set(142, -616);
  rightForearm.position.set(7, 126);
  rightHand.position.set(4, 205);
  rightArm.addChild(rightForearm);
  rightForearm.addChild(rightHand);
  leftLeg.position.set(-74, -368);
  leftShin.position.set(-2, 125);
  leftLeg.addChild(leftShin);
  rightLeg.position.set(74, -368);
  rightShin.position.set(2, 125);
  rightLeg.addChild(rightShin);
  backBone.position.set(0, -460);
  torsoBone.position.set(0, -445);
  pelvisBone.position.set(0, -360);
  headBone.position.set(0, -700);
  leftShoulder.position.set(-128, -642);
  rightShoulder.position.set(128, -642);
  glowBone.position.set(0, -520);

  rigRoot.addChild(
    leftLeg,
    rightLeg,
    backBone,
    leftArm,
    rightArm,
    torsoBone,
    pelvisBone,
    leftShoulder,
    rightShoulder,
    headBone,
    mossLeft.mesh,
    mossRight.mesh,
    mossCenter.mesh,
    glowBone,
  );
  rigRoot.position.y = visual.artHeight * (1 - visual.artAnchorY);
  rigRoot.scale.set(baseScale);
  container.addChild(rigRoot);

  return {
    applyCrit: signal => {
      if (signal.id === lastCritId) {
        return;
      }
      lastCritId = signal.id;
      applyEnemyCrit(motion);
    },
    applyImpact: signal => {
      if (signal.id === lastImpactId) {
        return;
      }
      lastImpactId = signal.id;
      lastDirection = signal.normalizedX < -0.12 ? 'left' : signal.normalizedX > 0.12 ? 'right' : 'center';
      applyEnemyImpact(motion, signal, reduceMotion);
    },
    beginDeath: () => {
      beginEnemyDeath(motion);
    },
    container,
    debugState: () => ({
      direction: lastDirection,
      phase: motion.deathProgress > 0 ? 'death' : motion.hitEnergy > 0.04 ? 'impact' : 'idle',
      rootScale: rigRoot.scale.x / baseScale,
    }),
    destroy: () => {
      container.destroy({ children: true });
      for (const texture of textures.values()) {
        texture.destroy(false);
      }
    },
    kind: 'layered-pixi',
    update: ({ deltaSeconds, elapsedSeconds, enrageEnergy, reduceMotion: frameReduceMotion }) => {
      const pose = advanceEnemyRigMotion(motion, elapsedSeconds, deltaSeconds, frameReduceMotion);
      rigRoot.x = pose.rootX;
      rigRoot.y = visual.artHeight * (1 - visual.artAnchorY) + pose.rootY;
      rigRoot.rotation = pose.deathProgress * 0.02;
      rigRoot.scale.set(baseScale);
      torsoBone.rotation = pose.torsoRotation;
      torsoBone.scale.set(1, pose.breathScale);
      backBone.rotation = pose.torsoRotation * 0.72;
      pelvisBone.y = -360 + pose.kneeCompression * 0.18;
      pelvisBone.rotation = -pose.torsoRotation * 0.18;
      headBone.rotation = pose.headRotation;
      leftShoulder.rotation = pose.torsoRotation * 0.46 - pose.armLag * 0.18;
      rightShoulder.rotation = pose.torsoRotation * 0.46 + pose.armLag * 0.18;
      leftArm.rotation = pose.torsoRotation * 0.34 - pose.armLag * 0.3 - pose.deathProgress * 0.16;
      rightArm.rotation = pose.torsoRotation * 0.34 + pose.armLag * 0.3 + pose.deathProgress * 0.2;
      leftForearm.rotation = -pose.armLag * 0.34 + pose.deathProgress * 0.1;
      rightForearm.rotation = pose.armLag * 0.34 - pose.deathProgress * 0.12;
      leftHand.rotation = -pose.armLag * 0.24;
      rightHand.rotation = pose.armLag * 0.24;
      leftLeg.rotation = pose.torsoRotation * -0.1 + pose.deathProgress * 0.07;
      rightLeg.rotation = pose.torsoRotation * -0.1 - pose.deathProgress * 0.06;
      leftShin.y = 125 + pose.kneeCompression;
      rightShin.y = 125 + pose.kneeCompression;
      leftShin.rotation = pose.deathProgress * 0.08;
      rightShin.rotation = -pose.deathProgress * 0.06;

      bendMoss(mossLeft, pose.secondaryRotation * 0.72, elapsedSeconds * 1.1);
      bendMoss(mossCenter, pose.secondaryRotation, elapsedSeconds * 0.9 + 1.3);
      bendMoss(mossRight, pose.secondaryRotation * 0.78, elapsedSeconds * 1.03 + 2.1);

      const flashStrength = Math.min(1, pose.hitEnergy * 0.34 + pose.critEnergy * 0.68 + enrageEnergy * 0.4);
      const tint = lerpColor(0xffffff, 0xffd7a3, flashStrength);
      for (const sprite of artSprites) {
        sprite.tint = tint;
      }
      glow.alpha = Math.min(1, 0.42 + Math.sin(elapsedSeconds * 3.1) * 0.08 + pose.hitEnergy * 0.35 + pose.critEnergy * 0.58);
      glow.scale.set(0.78 + Math.sin(elapsedSeconds * 2.8) * 0.04 + pose.critEnergy * 0.18);
      container.alpha = Math.max(0.12, 1 - pose.deathProgress * 0.82);
    },
  };
};
