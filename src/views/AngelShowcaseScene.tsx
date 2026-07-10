import { useEffect, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Sprite, Texture, type Ticker } from 'pixi.js';
import { getAngelShowcaseBudget, getAngelShowcaseFrame } from '../game/angelShowcase';
import type { HeroShowcaseSpec } from '../game/types';
import { getGameRenderProfile } from '../utils/renderQuality';

interface AngelShowcaseSceneProps {
  onError: () => void;
  onReady: () => void;
  showcase: HeroShowcaseSpec;
  surgeSignal: number;
}

interface LightMote {
  amplitude: number;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
  sprite: Sprite;
}

interface ShowcaseTextures {
  body: Texture;
  leftWing: Texture;
  rightWing: Texture;
}

const clampResolution = (resolutionCap: number) => (
  Math.min(window.devicePixelRatio || 1, resolutionCap)
);

const buildHalo = () => {
  const halo = new Container();
  const glow = new Graphics()
    .circle(0, 0, 72)
    .fill({ color: 0x9af9ff, alpha: 0.045 });
  const outerRing = new Graphics()
    .circle(0, 0, 64)
    .stroke({ color: 0xe9d9a2, width: 2, alpha: 0.48 });
  const innerRing = new Graphics()
    .circle(0, 0, 49)
    .stroke({ color: 0x8ef8ff, width: 1.3, alpha: 0.42 });
  const runes = new Graphics();

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const radius = index % 2 === 0 ? 57 : 53;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    runes
      .rect(x - 1.6, y - 4.5, 3.2, 9)
      .fill({ color: index % 3 === 0 ? 0xe8cb77 : 0xb9faff, alpha: 0.62 });
  }

  halo.addChild(glow, outerRing, innerRing, runes);
  return halo;
};

const buildFloorSigil = () => {
  const sigil = new Graphics()
    .ellipse(0, 0, 142, 31)
    .fill({ color: 0x7ae7d4, alpha: 0.025 })
    .stroke({ color: 0xaafcf0, width: 1.2, alpha: 0.34 })
    .ellipse(0, 0, 105, 22)
    .stroke({ color: 0xd9c985, width: 1, alpha: 0.24 })
    .moveTo(-82, 0)
    .lineTo(82, 0)
    .stroke({ color: 0x9efbed, width: 1, alpha: 0.16 });

  sigil.rotation = 0.02;
  return sigil;
};

const buildCore = () => {
  const core = new Container();
  const glow = new Graphics()
    .circle(0, 0, 19)
    .fill({ color: 0x7c61ff, alpha: 0.08 });
  const ring = new Graphics()
    .poly([0, -11, 8, 0, 0, 11, -8, 0])
    .stroke({ color: 0xd7b8ff, width: 0.9, alpha: 0.42 });
  const light = new Graphics()
    .poly([0, -5, 4, 0, 0, 5, -4, 0])
    .fill({ color: 0xc3ffff, alpha: 0.64 });

  core.addChild(glow, ring, light);
  return core;
};

const createLightMotes = (count: number) => Array.from({ length: count }, (_, index): LightMote => {
  const sprite = new Sprite(Texture.WHITE);
  const size = 1.6 + (index % 3) * 0.8;
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size * (1.4 + (index % 2) * 0.5);
  sprite.tint = index % 4 === 0 ? 0xffdf8c : index % 3 === 0 ? 0xb9a2ff : 0xa0fff0;
  sprite.alpha = 0.36 + (index % 4) * 0.1;
  sprite.blendMode = 'add';

  return {
    amplitude: 7 + (index % 5) * 3,
    baseX: ((index * 67) % 310) - 155,
    baseY: ((index * 43) % 430) - 225,
    phase: index * 1.47,
    speed: 0.16 + (index % 5) * 0.035,
    sprite,
  };
});

const selectAssetUrls = (
  showcase: HeroShowcaseSpec,
  useLowResolutionAssets: boolean,
) => ({
  body: useLowResolutionAssets ? showcase.bodyAssetLow : showcase.bodyAsset,
  leftWing: useLowResolutionAssets ? showcase.leftWingAssetLow : showcase.leftWingAsset,
  rightWing: useLowResolutionAssets ? showcase.rightWingAssetLow : showcase.rightWingAsset,
});

export function AngelShowcaseScene({
  onError,
  onReady,
  showcase,
  surgeSignal,
}: AngelShowcaseSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const surgeSignalRef = useRef(surgeSignal);
  const [artLoaded, setArtLoaded] = useState(false);
  const renderProfileRef = useRef(getGameRenderProfile());
  const reduceMotionRef = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const budgetRef = useRef(getAngelShowcaseBudget(renderProfileRef.current, reduceMotionRef.current));

  useEffect(() => {
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
  }, [onError, onReady]);

  useEffect(() => {
    surgeSignalRef.current = surgeSignal;
  }, [surgeSignal]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const renderProfile = renderProfileRef.current;
    const reduceMotion = reduceMotionRef.current;
    const budget = budgetRef.current;
    const assetUrls = selectAssetUrls(showcase, budget.useLowResolutionAssets);
    const loadedAssetUrls = new Set<string>();
    const app = new Application();
    let disposed = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | undefined;
    let sceneBuildCount = 0;

    const unloadLoadedAssets = async () => {
      const assets = [...loadedAssetUrls];
      loadedAssetUrls.clear();
      await Promise.all(assets.map(asset => Assets.unload(asset).catch(() => undefined)));
    };

    const loadTexture = async (asset: string) => {
      const texture = await Assets.load<Texture>(asset);
      loadedAssetUrls.add(asset);
      if (disposed) {
        await unloadLoadedAssets();
        throw new Error('Angel showcase was closed while assets were loading.');
      }
      return texture;
    };

    const initialize = async () => {
      try {
        await app.init({
          antialias: false,
          autoDensity: true,
          autoStart: false,
          backgroundAlpha: 0,
          powerPreference: 'high-performance',
          preference: 'webgl',
          resolution: clampResolution(renderProfile.resolutionCap),
          sharedTicker: false,
        });
        initialized = true;

        if (disposed) {
          app.destroy(true);
          return;
        }

        app.canvas.className = 'angel-showcase-canvas';
        app.canvas.setAttribute('aria-hidden', 'true');
        app.ticker.maxFPS = budget.maxFps;
        host.append(app.canvas);

        const [body, leftWing, rightWing] = await Promise.all([
          loadTexture(assetUrls.body),
          loadTexture(assetUrls.leftWing),
          loadTexture(assetUrls.rightWing),
        ]);

        if (disposed) {
          return;
        }

        const textures: ShowcaseTextures = { body, leftWing, rightWing };
        const scene = new Container();
        const celestialField = new Container();
        const heroRig = new Container();
        const wingLayer = new Container();
        const bodyLayer = new Container();
        const foregroundLight = new Container();
        const halo = buildHalo();
        const floorSigil = buildFloorSigil();
        const core = buildCore();
        const leftWingSprite = new Sprite(textures.leftWing);
        const rightWingSprite = new Sprite(textures.rightWing);
        const bodySprite = new Sprite(textures.body);
        const lightMotes = createLightMotes(budget.particleCount);

        leftWingSprite.anchor.set(0.86, 0.78);
        rightWingSprite.anchor.set(0.14, 0.78);
        bodySprite.anchor.set(0.5, 1);
        leftWingSprite.blendMode = 'normal';
        rightWingSprite.blendMode = 'normal';
        bodySprite.blendMode = 'normal';
        core.blendMode = 'add';
        halo.blendMode = 'add';
        floorSigil.blendMode = 'add';

        celestialField.addChild(halo, floorSigil, ...lightMotes.map(mote => mote.sprite));
        wingLayer.addChild(leftWingSprite, rightWingSprite);
        bodyLayer.addChild(bodySprite);
        foregroundLight.addChild(core);
        heroRig.addChild(wingLayer, bodyLayer, foregroundLight);
        scene.addChild(celestialField, heroRig);
        app.stage.addChild(scene);

        let coreBaseScale = 1;
        const resize = () => {
          const bounds = host.getBoundingClientRect();
          const width = Math.max(1, Math.floor(bounds.width));
          const height = Math.max(1, Math.floor(bounds.height));
          const groundY = height * (height < 620 ? 0.93 : 0.9);
          const bodyHeight = Math.min(height * 0.76, width * 1.62, 720);
          const bodyScale = bodyHeight / textures.body.height;
          const bodyWidth = textures.body.width * bodyScale;
          const wingHeight = Math.min(bodyHeight * 0.58, width * 0.84);
          const leftWingScale = wingHeight / textures.leftWing.height;
          const rightWingScale = wingHeight / textures.rightWing.height;
          const shoulderY = groundY - bodyHeight * 0.68;
          const shoulderOffset = bodyWidth * 0.18;
          const floorScale = Math.min(1.24, width / 350);

          app.renderer.resize(width, height);
          scene.position.set(width / 2, 0);
          heroRig.position.set(0, groundY);
          bodySprite.scale.set(bodyScale);
          leftWingSprite.scale.set(leftWingScale);
          rightWingSprite.scale.set(rightWingScale);
          leftWingSprite.position.set(-shoulderOffset, shoulderY - groundY);
          rightWingSprite.position.set(shoulderOffset, shoulderY - groundY);
          halo.position.set(0, groundY - bodyHeight * 0.83);
          halo.scale.set(Math.max(0.68, bodyHeight / 640));
          floorSigil.position.set(0, groundY - 2);
          floorSigil.scale.set(floorScale);
          core.position.set(0, -bodyHeight * 0.69);
          coreBaseScale = Math.max(0.46, bodyHeight / 760);
          core.scale.set(coreBaseScale);
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resize();

        let elapsedSeconds = 0;
        let surgeEnergy = 0;
        let lastHandledSurgeSignal = surgeSignalRef.current;
        const animateScene = (ticker: Ticker) => {
          const deltaSeconds = Math.min(0.05, ticker.deltaMS / 1000);
          elapsedSeconds += deltaSeconds;

          if (surgeSignalRef.current !== lastHandledSurgeSignal) {
            lastHandledSurgeSignal = surgeSignalRef.current;
            surgeEnergy = 1;
          }
          surgeEnergy = Math.max(0, surgeEnergy - deltaSeconds * 0.92);

          const frame = getAngelShowcaseFrame(elapsedSeconds, surgeEnergy, reduceMotion);
          bodyLayer.y = frame.bodyLift;
          bodyLayer.scale.set(frame.bodyScaleX, frame.bodyScaleY);
          wingLayer.y = frame.bodyLift * 0.58;
          leftWingSprite.rotation = -frame.wingRotation;
          rightWingSprite.rotation = frame.wingRotation;
          wingLayer.scale.set(frame.wingScale);
          halo.rotation = frame.haloRotation;
          halo.alpha = frame.haloAlpha;
          core.scale.set(coreBaseScale * frame.coreScale);
          core.alpha = 0.72 + surgeEnergy * 0.28;
          floorSigil.alpha = 0.5 + Math.sin(elapsedSeconds * 1.3) * 0.12 + surgeEnergy * 0.28;

          for (const mote of lightMotes) {
            const travel = (elapsedSeconds * mote.speed * frame.particleSpeed + mote.phase) % 1;
            mote.sprite.x = mote.baseX + Math.sin(elapsedSeconds * 0.7 + mote.phase) * mote.amplitude;
            mote.sprite.y = mote.baseY - travel * 150;
            mote.sprite.alpha = (0.24 + Math.sin(travel * Math.PI) * 0.58) * (0.85 + surgeEnergy * 0.35);
          }
        };

        const handleVisibilityChange = () => {
          if (document.hidden) {
            app.stop();
          } else {
            app.start();
          }
        };

        app.ticker.add(animateScene);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        app.start();
        sceneBuildCount += 1;
        host.dataset.sceneBuildCount = String(sceneBuildCount);
        host.dataset.particleCount = String(budget.particleCount);
        host.dataset.tickerMaxFps = String(budget.maxFps);
        host.dataset.renderResolution = String(app.renderer.resolution);
        host.dataset.assetVariant = budget.useLowResolutionAssets ? 'low' : 'high';
        setArtLoaded(true);
        onReadyRef.current();

        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          app.ticker.remove(animateScene);
        };
      } catch {
        if (!disposed) {
          onErrorRef.current();
        }
        await unloadLoadedAssets();
        return undefined;
      }
    };

    let cleanupScene: (() => void) | undefined;
    void initialize().then(cleanup => {
      cleanupScene = cleanup;
      if (disposed) {
        cleanupScene?.();
      }
    });

    return () => {
      disposed = true;
      cleanupScene?.();
      resizeObserver?.disconnect();
      if (initialized) {
        app.destroy(true, { children: true });
      }
      void unloadLoadedAssets();
    };
  }, [showcase]);

  return (
    <div
      className="angel-showcase-scene"
      data-art-loaded={artLoaded ? 'true' : 'false'}
      data-render-quality={renderProfileRef.current.quality}
      ref={hostRef}
    />
  );
}
