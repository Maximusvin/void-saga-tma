import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { EnemyCritSignal, EnemyImpactSignal } from '../game/enemyImpactSignals';
import type { RiftEnemyThreeRigSpec, RiftEnemyVisualSpec } from '../game/riftVisuals';
import { getGameRenderProfile } from '../utils/renderQuality';

interface RiftThreeEnemySceneProps {
  critSignal: EnemyCritSignal;
  defeatSignal: number;
  impactSignal: EnemyImpactSignal;
  reduceMotion: boolean;
  visual: RiftEnemyVisualSpec & { rig: RiftEnemyThreeRigSpec };
}

type HitDirection = 'center' | 'left' | 'right';
type ReactionPhase = 'death' | 'idle' | 'impact';

interface RuntimeController {
  applyCrit: () => void;
  applyImpact: (direction: HitDirection) => void;
  playDeath: () => void;
}

const HIT_POOL_SIZE = 4;
const VIEW_HEIGHT = 4.8;

const disposeObject = (root: THREE.Object3D) => {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      }
      material.dispose();
    });
  });
};

const findRequiredClip = (clips: THREE.AnimationClip[], name: string) => {
  const clip = THREE.AnimationClip.findByName(clips, name);
  if (!clip) {
    throw new Error(`Ironroot animation clip "${name}" is missing.`);
  }
  return clip;
};

const createAdditiveActionPool = (
  mixer: THREE.AnimationMixer,
  clip: THREE.AnimationClip,
  root: THREE.Object3D,
  poolName: string,
) => Array.from({ length: HIT_POOL_SIZE }, (_, index) => {
  const additiveClip = clip.clone();
  additiveClip.name = `${poolName}-${index}`;
  THREE.AnimationUtils.makeClipAdditive(additiveClip, 0, clip, 30);
  const action = mixer.clipAction(additiveClip, root);
  action.blendMode = THREE.AdditiveAnimationBlendMode;
  action.clampWhenFinished = false;
  action.loop = THREE.LoopOnce;
  return action;
});

export const RiftThreeEnemyScene = ({
  critSignal,
  defeatSignal,
  impactSignal,
  reduceMotion,
  visual,
}: RiftThreeEnemySceneProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<RuntimeController | null>(null);
  const lastCritRef = useRef(critSignal.id);
  const lastDefeatRef = useRef(defeatSignal);
  const lastImpactRef = useRef(impactSignal.id);
  const latestSignalsRef = useRef({ critSignal, defeatSignal, impactSignal });
  latestSignalsRef.current = { critSignal, defeatSignal, impactSignal };
  const [artLoaded, setArtLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hitDirection, setHitDirection] = useState<HitDirection>('center');
  const [phase, setPhase] = useState<ReactionPhase>('idle');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const profile = getGameRenderProfile();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: profile.antialias,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }

    const canvas = renderer.domElement;
    canvas.className = 'rift-three-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.resolutionCap));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2.4, 2.4, 2.4, -2.4, 0.1, 30);
    camera.position.set(0, 0.18, 7);
    camera.lookAt(0, 0.12, 0);

    const hemisphere = new THREE.HemisphereLight(0xc8fff4, 0x18231f, 2.15);
    const key = new THREE.DirectionalLight(0xffe2ae, 4.5);
    key.position.set(-3.4, 5.5, 5.2);
    const rim = new THREE.DirectionalLight(0x63ffe1, 3.2);
    rim.position.set(4.5, 2.2, -3.8);
    const critLight = new THREE.PointLight(0xfff2bf, 0, 7, 2);
    critLight.position.set(0.55, 0.55, 3.2);
    scene.add(hemisphere, key, rim, critLight);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 48),
      new THREE.MeshBasicMaterial({ color: 0x06100e, opacity: 0.36, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.18, 0.58, 1);
    shadow.position.set(0, -1.76, 0.12);
    scene.add(shadow);

    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath('/assets/three/basis/')
      .detectSupport(renderer);
    const loader = new GLTFLoader()
      .setKTX2Loader(ktx2Loader)
      .setMeshoptDecoder(MeshoptDecoder);
    const modelUrl = profile.quality === 'high' ? visual.rig.high.model : visual.rig.low.model;
    let animationFrame = 0;
    let disposed = false;
    let rendererActive = true;
    let loadedRoot: THREE.Object3D | null = null;
    let hitIdleTimeout = 0;
    let critTimeout = 0;
    let lastFrameAt = performance.now();
    let lastRenderAt = 0;
    let isIntersecting = true;

    const resize = () => {
      if (!rendererActive) {
        return;
      }
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      camera.left = -VIEW_HEIGHT * aspect / 2;
      camera.right = VIEW_HEIGHT * aspect / 2;
      camera.top = VIEW_HEIGHT / 2;
      camera.bottom = -VIEW_HEIGHT / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const intersectionObserver = new IntersectionObserver(entries => {
      isIntersecting = entries.some(entry => entry.isIntersecting);
    });
    intersectionObserver.observe(host);

    const releaseRenderer = () => {
      if (!rendererActive) {
        return;
      }
      rendererActive = false;
      canvas.remove();
      renderer.dispose();
      renderer.forceContextLoss();
    };

    void loader.loadAsync(modelUrl).then(gltf => {
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }

      const rigRoot = new THREE.Group();
      const normalizedModel = new THREE.Group();
      loadedRoot = rigRoot;
      gltf.scene.rotation.y = -Math.PI / 2;
      gltf.scene.updateMatrixWorld(true);
      normalizedModel.add(gltf.scene);
      rigRoot.add(normalizedModel);
      scene.add(rigRoot);

      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const normalizedHeight = 3.82;
      const assetScale = normalizedHeight / Math.max(0.001, size.y);
      normalizedModel.scale.setScalar(assetScale);
      normalizedModel.position.set(
        -center.x * assetScale,
        -1.72 - bounds.min.y * assetScale,
        -center.z * assetScale,
      );

      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.envMapIntensity = 0.72;
            material.roughness = Math.max(0.48, material.roughness);
          }
        });
      });

      const mixer = new THREE.AnimationMixer(gltf.scene);
      const idleClip = findRequiredClip(gltf.animations, visual.rig.clips.idle);
      const hitLeftClip = findRequiredClip(gltf.animations, visual.rig.clips.hitLeft);
      const hitRightClip = findRequiredClip(gltf.animations, visual.rig.clips.hitRight);
      const deathClip = findRequiredClip(gltf.animations, visual.rig.clips.death);
      const idleAction = mixer.clipAction(idleClip, gltf.scene);
      idleAction.loop = THREE.LoopRepeat;
      idleAction.enabled = !reduceMotion;
      idleAction.setEffectiveWeight(reduceMotion ? 0 : 1);
      idleAction.play();

      const hitPools = {
        left: createAdditiveActionPool(mixer, hitLeftClip, gltf.scene, 'HitLeftRuntime'),
        right: createAdditiveActionPool(mixer, hitRightClip, gltf.scene, 'HitRightRuntime'),
      };
      const poolCursor = { left: 0, right: 0 };
      const deathAction = mixer.clipAction(deathClip, gltf.scene);
      deathAction.clampWhenFinished = true;
      deathAction.loop = THREE.LoopOnce;
      let deathStarted = false;

      const applyImpact = (direction: HitDirection) => {
        if (deathStarted) {
          return;
        }
        const side = direction === 'right' ? 'right' : 'left';
        const pool = hitPools[side];
        const action = pool[poolCursor[side] % pool.length];
        poolCursor[side] += 1;
        const activeCount = [...hitPools.left, ...hitPools.right].filter(candidate => candidate.isRunning()).length;
        const boundedWeight = (reduceMotion ? 0.28 : 0.82) / (1 + activeCount * 0.22);
        action.stop();
        action.reset();
        action.enabled = true;
        action.setEffectiveTimeScale(reduceMotion ? 1.55 : 1);
        action.setEffectiveWeight(boundedWeight);
        action.play();
        setHitDirection(direction);
        setPhase('impact');
        window.clearTimeout(hitIdleTimeout);
        hitIdleTimeout = window.setTimeout(() => {
          setPhase(current => current === 'death' ? current : 'idle');
        }, reduceMotion ? 280 : 500);
      };

      runtimeRef.current = {
        applyCrit: () => {
          if (deathStarted) {
            return;
          }
          critLight.intensity = reduceMotion ? 2.1 : 5.4;
          window.clearTimeout(critTimeout);
          critTimeout = window.setTimeout(() => {
            critLight.intensity = 0;
          }, reduceMotion ? 90 : 170);
        },
        applyImpact,
        playDeath: () => {
          if (deathStarted) {
            return;
          }
          deathStarted = true;
          window.clearTimeout(hitIdleTimeout);
          setPhase('death');
          idleAction.fadeOut(reduceMotion ? 0.04 : 0.12);
          [...hitPools.left, ...hitPools.right].forEach(action => action.fadeOut(0.06));
          deathAction.reset();
          deathAction.setEffectiveTimeScale(reduceMotion ? 1.35 : 1);
          deathAction.fadeIn(reduceMotion ? 0.03 : 0.08);
          deathAction.play();
        },
      };

      const pendingSignals = latestSignalsRef.current;
      if (pendingSignals.impactSignal.id !== lastImpactRef.current) {
        lastImpactRef.current = pendingSignals.impactSignal.id;
        const pendingDirection = pendingSignals.impactSignal.normalizedX < -0.12
          ? 'left'
          : pendingSignals.impactSignal.normalizedX > 0.12 ? 'right' : 'center';
        runtimeRef.current.applyImpact(pendingDirection);
      }
      if (pendingSignals.critSignal.id !== lastCritRef.current) {
        lastCritRef.current = pendingSignals.critSignal.id;
        runtimeRef.current.applyCrit();
      }
      if (pendingSignals.defeatSignal !== lastDefeatRef.current) {
        lastDefeatRef.current = pendingSignals.defeatSignal;
        runtimeRef.current.playDeath();
      }

      const frameInterval = 1000 / profile.maxFps;
      const animate = (now: number) => {
        animationFrame = window.requestAnimationFrame(animate);
        if (document.hidden || !isIntersecting || now - lastRenderAt < frameInterval) {
          return;
        }
        const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000));
        lastFrameAt = now;
        lastRenderAt = now;
        mixer.update(deltaSeconds);
        renderer.render(scene, camera);
      };
      animationFrame = window.requestAnimationFrame(animate);
      setArtLoaded(true);
    }).catch(() => {
      if (!disposed) {
        releaseRenderer();
        setFailed(true);
      }
    });

    return () => {
      disposed = true;
      runtimeRef.current = null;
      window.clearTimeout(hitIdleTimeout);
      window.clearTimeout(critTimeout);
      window.cancelAnimationFrame(animationFrame);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      ktx2Loader.dispose();
      if (loadedRoot) {
        disposeObject(loadedRoot);
        scene.remove(loadedRoot);
      }
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      releaseRenderer();
    };
  }, [reduceMotion, visual]);

  useEffect(() => {
    if (impactSignal.id === lastImpactRef.current) {
      return;
    }
    const direction = impactSignal.normalizedX < -0.12
      ? 'left'
      : impactSignal.normalizedX > 0.12 ? 'right' : 'center';
    if (runtimeRef.current) {
      lastImpactRef.current = impactSignal.id;
      runtimeRef.current.applyImpact(direction);
    }
  }, [impactSignal]);

  useEffect(() => {
    if (critSignal.id === lastCritRef.current) {
      return;
    }
    if (runtimeRef.current) {
      lastCritRef.current = critSignal.id;
      runtimeRef.current.applyCrit();
    }
  }, [critSignal]);

  useEffect(() => {
    if (defeatSignal === lastDefeatRef.current) {
      return;
    }
    if (runtimeRef.current) {
      lastDefeatRef.current = defeatSignal;
      runtimeRef.current.playDeath();
    }
  }, [defeatSignal]);

  return (
    <div
      ref={hostRef}
      className="rift-three-scene"
      data-art-loaded={artLoaded || failed ? 'true' : 'false'}
      data-enemy-id={visual.id}
      data-enemy-rig={failed ? 'static-sprite' : 'skinned-three'}
      data-hit-direction={hitDirection}
      data-hit-reaction-phase={phase}
      data-rig-root-scale="1.0000"
      data-scene-build-count="1"
    >
      {failed && (
        <img
          className="rift-three-fallback"
          src={visual.asset}
          alt=""
          aria-hidden="true"
        />
      )}
    </div>
  );
};
