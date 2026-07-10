import { Application, Assets, Container, MeshPlane, Sprite } from 'pixi.js';
import type { Ticker, Texture } from 'pixi.js';

// "Living portrait" via textured mesh deformation — the Live2D technique, on the
// project's real hero art (rembg cutout of void-mage), rendered with a Pixi mesh
// (the same GPU path spine-pixi uses under the hood). One texture, a deform grid
// whose vertices are pushed by sine fields: chest breathing, head sway, braid
// sway, plus a tap recoil. No rigid part-cutting, no seams.

const TEXTURE_URL = '/prototypes/hero-animation/assets/hero/mage-base.png';
const GRID_X = 18;
const GRID_Y = 22;

export interface LiveMageHandle {
  react: () => void;
  destroy: () => void;
}

export async function mountLiveMage(host: HTMLDivElement): Promise<LiveMageHandle> {
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

  const texture = await Assets.load<Texture>(TEXTURE_URL);
  const texW = texture.width;
  const texH = texture.height;

  const mesh = new MeshPlane({ texture, verticesX: GRID_X, verticesY: GRID_Y });
  // Snapshot the undeformed grid so every frame deforms from the rest pose.
  const positions = mesh.geometry.positions;
  const base = Float32Array.from(positions);

  // Soft additive tap flash sitting over the mesh.
  const flash = new Sprite(texture);
  flash.tint = 0xffffff;
  flash.blendMode = 'add';
  flash.alpha = 0;

  const rig = new Container();
  rig.addChild(mesh, flash);
  app.stage.addChild(rig);

  let baseRigX = 0;
  let baseRigY = 0;
  const layout = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    app.renderer.resize(w, h);
    const scale = Math.min((w * 0.92) / texW, (h * 0.96) / texH);
    rig.scale.set(scale);
    baseRigX = (w - texW * scale) / 2;
    baseRigY = (h - texH * scale) / 2;
    rig.position.set(baseRigX, baseRigY);
    flash.width = texW;
    flash.height = texH;
  };
  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(host);
  layout();

  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

  let elapsed = 0;
  let recoil = 0;

  const advance = (dt: number) => {
    elapsed += dt;
    recoil = Math.max(0, recoil - dt * 3.2);
    const ease = recoil * recoil;

    const breathe = Math.sin(elapsed * 1.5);
    const sway = Math.sin(elapsed * 0.9 + 0.5);
    const hairWave = Math.sin(elapsed * 1.15 + 0.7);

    let i = 0;
    for (let row = 0; row < GRID_Y; row += 1) {
      const ny = row / (GRID_Y - 1); // 0 = top (head), 1 = bottom (chest)
      const headMask = clamp01((0.48 - ny) / 0.48); // 1 at crown → 0 at neck
      const chestMask = clamp01((ny - 0.5) / 0.5); // 0 at neck → 1 at base
      for (let col = 0; col < GRID_X; col += 1) {
        const nx = col / (GRID_X - 1); // 0 = left, 1 = right
        // braids fall on the left and hang lower → pendulum growing downward
        const hairMask = clamp01((0.42 - nx) / 0.42) * clamp01((ny - 0.32) / 0.68);

        const bx = base[i];
        const by = base[i + 1];

        // chest breathing: gentle lift + slight widening low on the torso
        const dyBreathe = -breathe * 3.2 * chestMask + ease * 8 * chestMask;
        const dxBreathe = (nx - 0.5) * breathe * 2.2 * chestMask;
        // head sway about the neck, with a sharp tap jerk
        const dxHead = (sway * 5.5 - ease * 15) * headMask;
        const dyHead = -Math.abs(sway) * 1.2 * headMask + ease * 6 * headMask;
        // braid sway
        const dxHair = (hairWave * 5.5 + ease * 6) * hairMask;

        positions[i] = bx + dxBreathe + dxHead + dxHair;
        positions[i + 1] = by + dyBreathe + dyHead;
        i += 2;
      }
    }
    mesh.geometry.getBuffer('aPosition').update();
    // whole-portrait recoil shove on tap
    rig.position.set(baseRigX - ease * 5, baseRigY + ease * 9);
    flash.alpha = ease * 0.55;
  };

  const animate = (ticker: Ticker) => {
    advance(Math.min(0.05, ticker.deltaMS / 1000));
  };
  app.ticker.add(animate);
  app.start();

  const react = () => {
    recoil = 1;
    navigator.vibrate?.(15);
  };

  // expose a frame stepper for headless verification (throttled rAF)
  (window as unknown as { __liveMage?: unknown }).__liveMage = {
    react,
    frameStep: (dt: number) => {
      advance(dt);
      app.render();
    },
    maxDisplacement: () => {
      let max = 0;
      for (let k = 0; k < positions.length; k += 1) {
        const d = Math.abs(positions[k] - base[k]);
        if (d > max) {
          max = d;
        }
      }
      return max;
    },
  };

  return {
    react,
    destroy: () => {
      resizeObserver.disconnect();
      app.ticker.remove(animate);
      app.destroy(true, { children: true });
      void Assets.unload(TEXTURE_URL).catch(() => undefined);
    },
  };
}
