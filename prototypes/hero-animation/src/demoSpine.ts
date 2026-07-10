import { Application, Assets } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { FpsMeter } from './fps';
import type { DemoHandle } from './demo';

// Demo B — Spine skeletal runtime (spine-pixi-v8) on the official spineboy
// sample. We cannot rig the project's own hero here (Spine authoring is a paid
// GUI + artist work), so this measures the RUNTIME: bundle weight, smoothness,
// and how a real skeletal idle + a triggered "hit" animation feel on the exact
// pixi.js 8 stack the app already ships.

const BASE = '/prototypes/hero-animation/assets/spine';
const SKELETON_ALIAS = 'spineboySkeleton';
const ATLAS_ALIAS = 'spineboyAtlas';

export async function initSpineDemo(host: HTMLDivElement): Promise<DemoHandle> {
  const app = new Application();
  await app.init({
    antialias: true,
    autoDensity: true,
    autoStart: false,
    backgroundAlpha: 0,
    powerPreference: 'high-performance',
    preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    sharedTicker: false,
  });
  app.canvas.className = 'demo-canvas';
  host.append(app.canvas);

  Assets.add({ alias: SKELETON_ALIAS, src: `${BASE}/spineboy-pro.skel` });
  Assets.add({ alias: ATLAS_ALIAS, src: `${BASE}/spineboy-pma.atlas` });
  await Assets.load([SKELETON_ALIAS, ATLAS_ALIAS]);

  const spine = Spine.from({ skeleton: SKELETON_ALIAS, atlas: ATLAS_ALIAS });
  spine.autoUpdate = false;

  const animationNames = spine.skeleton.data.animations.map((animation) => animation.name);
  const idleName = animationNames.includes('idle') ? 'idle' : animationNames[0];
  const hitName = animationNames.includes('jump')
    ? 'jump'
    : animationNames.includes('shoot')
      ? 'shoot'
      : idleName;
  spine.state.setAnimation(0, idleName, true);
  app.stage.addChild(spine);

  const layout = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    app.renderer.resize(w, h);
    const skeletonHeight = spine.skeleton.data.height || 500;
    spine.scale.set((h * 0.66) / skeletonHeight);
    spine.x = w / 2;
    spine.y = h * 0.9;
  };
  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(host);
  layout();

  const fps = new FpsMeter();
  const animate = (ticker: Ticker) => {
    spine.update(Math.min(0.05, ticker.deltaMS / 1000));
    fps.tick();
  };
  app.ticker.add(animate);
  app.start();

  return {
    react: () => {
      spine.state.setAnimation(0, hitName, false);
      spine.state.addAnimation(0, idleName, true, 0);
      navigator.vibrate?.(15);
    },
    fps: () => fps.get(),
    frameStep: (dt: number) => {
      spine.update(dt);
      app.render();
    },
    destroy: () => {
      resizeObserver.disconnect();
      app.ticker.remove(animate);
      app.destroy(true, { children: true });
      void Assets.unload(SKELETON_ALIAS).catch(() => undefined);
      void Assets.unload(ATLAS_ALIAS).catch(() => undefined);
    },
  };
}
