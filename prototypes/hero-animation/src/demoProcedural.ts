import { Application, Assets, Container, Sprite } from 'pixi.js';
import type { Ticker, Texture } from 'pixi.js';
import { buildHeroRig } from './layeredHero';
import { FpsMeter } from './fps';
import type { DemoHandle } from './demo';

// Demo A — the "procedural layered" approach, the one technique that runs on
// the project's real pipeline (pixi.js 8, sine-math on layers) and can be built
// on an actual hero without any GUI rigging tool.
//   * "Layered": an authored void-mage whose head, hair and body move
//     independently — breathing, head-nod, hair-sway, blink, tap-recoil.
//   * "Flat": a real production sprite (void-knight.webp). Same technique, but a
//     single flat image only allows whole-body breathing + recoil — no isolated
//     head or hair. This is exactly the trade-off the operator needs to feel.

const FLAT_HERO_URL = '/assets/heroes/void-knight.webp';

export async function initProceduralDemo(host: HTMLDivElement): Promise<DemoHandle> {
  // NOTE: this evaluation stand always animates idle so the operator can feel it.
  // Production hero code SHOULD gate idle on prefers-reduced-motion, exactly like
  // AngelShowcase does (getAngelShowcaseFrame → `idle = reduceMotion ? 0 : …`).
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

  const rig = buildHeroRig();
  // The head container sits at the neck (see buildHeroRig). Capture that home Y
  // before the animation loop starts writing small offsets onto head.y.
  const HEAD_HOME_Y = rig.head.position.y;
  const layered = new Container();
  layered.addChild(rig.root);

  const flat = new Container();
  let flatSprite: Sprite | null = null;
  try {
    const texture = await Assets.load<Texture>(FLAT_HERO_URL);
    flatSprite = new Sprite(texture);
    flatSprite.anchor.set(0.5, 1);
    flat.addChild(flatSprite);
  } catch {
    // Flat variant is optional; the layered hero is the star of this demo.
  }
  flat.visible = false;

  app.stage.addChild(layered, flat);

  let mode: 'layered' | 'flat' = 'layered';

  const layout = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    app.renderer.resize(w, h);
    const groundY = h * 0.95;

    layered.position.set(w / 2, groundY);
    layered.scale.set((h * 0.82) / rig.designHeight);

    if (flatSprite) {
      flat.position.set(w / 2, groundY);
      flatSprite.scale.set((h * 0.9) / flatSprite.texture.height);
    }
  };
  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(host);
  layout();

  const fps = new FpsMeter();
  let elapsed = 0;
  let recoil = 0;

  const advance = (dt: number) => {
    elapsed += dt;
    recoil = Math.max(0, recoil - dt * 3.4);
    const ease = recoil * recoil; // punchy hit, soft tail

    const idle = Math.sin(elapsed * 1.6);
    const wind = Math.sin(elapsed * 0.7) * 0.6 + Math.sin(elapsed * 1.27 + 1) * 0.4;

    if (mode === 'layered') {
      rig.body.scale.set(1 - idle * 0.01 + ease * 0.03, 1 + idle * 0.02 - ease * 0.05);
      rig.body.y = idle * -2 + ease * 7;
      rig.head.rotation = idle * 0.035 - ease * 0.12;
      // head sits at neck (design y -218); animation is a small offset on top of
      // that home, never a replacement — otherwise the head drops to the feet.
      rig.head.y = HEAD_HOME_Y + idle * -1.4 + ease * 5;
      rig.backHair.rotation = wind * 0.05 + idle * 0.01 + ease * 0.14;
      rig.braid.rotation = wind * 0.11 + Math.sin(elapsed * 0.9) * 0.03 + ease * 0.24;
      rig.core.scale.set(1 + Math.sin(elapsed * 2.2) * 0.08 + ease * 0.4);
      rig.core.alpha = 0.75 + Math.sin(elapsed * 2.2) * 0.15 + ease * 0.25;
      rig.flash.alpha = ease * 0.5;

      const blink = elapsed % 4.6;
      rig.eyes.scale.y = blink < 0.14 ? Math.max(0.08, Math.abs(blink - 0.07) / 0.07) : 1;

      rig.root.y = ease * 6;
      rig.root.x = ease * -4;
    } else {
      flat.scale.set(1 - idle * 0.008 + ease * 0.03, 1 + idle * 0.018 - ease * 0.05);
      flat.y = host.clientHeight * 0.95 + idle * -2 + ease * 10;
    }
  };

  const animate = (ticker: Ticker) => {
    advance(Math.min(0.05, ticker.deltaMS / 1000));
    fps.tick();
  };
  app.ticker.add(animate);
  app.start();

  // In-panel Layered / Flat switch (the demo owns its own controls).
  const toggle = document.createElement('div');
  toggle.className = 'proc-toggle';
  const makeButton = (label: string, value: 'layered' | 'flat') => {
    const button = document.createElement('button');
    button.textContent = label;
    button.dataset.value = value;
    button.dataset.active = String(value === mode);
    button.addEventListener('click', () => {
      mode = value;
      layered.visible = value === 'layered';
      flat.visible = value === 'flat';
      for (const child of Array.from(toggle.children)) {
        const element = child as HTMLElement;
        element.dataset.active = String(element.dataset.value === mode);
      }
    });
    return button;
  };
  const flatButton = makeButton('Плоский · void-knight.webp', 'flat');
  toggle.append(makeButton('Шаровий · авторський', 'layered'), flatButton);
  if (!flatSprite) {
    flatButton.disabled = true;
  }
  host.append(toggle);

  return {
    react: () => {
      recoil = 1;
      navigator.vibrate?.(15);
    },
    fps: () => fps.get(),
    frameStep: (dt: number) => {
      advance(dt);
      app.render();
    },
    destroy: () => {
      resizeObserver.disconnect();
      app.ticker.remove(animate);
      toggle.remove();
      app.destroy(true, { children: true });
      void Assets.unload(FLAT_HERO_URL).catch(() => undefined);
    },
  };
}
