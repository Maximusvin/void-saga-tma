import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';

interface RiftPixiSceneProps {
  isBoss: boolean;
  isHit: boolean;
  stage: number;
}

interface SparkParticle {
  graphic: Graphics;
  angle: number;
  distance: number;
  speed: number;
  size: number;
}

const clampResolution = () => Math.min(window.devicePixelRatio || 1, 2);

const buildCircle = (radius: number, color: number, alpha: number) => {
  return new Graphics()
    .circle(0, 0, radius)
    .fill({ color, alpha });
};

const buildSpike = (width: number, height: number, color: number, alpha = 1) => {
  return new Graphics()
    .poly([
      -width / 2, height / 2,
      0, -height / 2,
      width / 2, height / 2,
    ])
    .fill({ color, alpha });
};

const buildWing = (side: -1 | 1, color: number, glow: number) => {
  const wing = new Graphics()
    .poly([
      0, -10,
      side * 82, -44,
      side * 58, 48,
      side * 8, 26,
    ])
    .fill({ color, alpha: 0.78 })
    .stroke({ color: glow, width: 2, alpha: 0.22 });

  wing.x = side * 40;
  wing.y = 8;
  return wing;
};

export const RiftPixiScene = ({ isBoss, isHit, stage }: RiftPixiSceneProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef(isHit);

  useEffect(() => {
    hitRef.current = isHit;
  }, [isHit]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    let disposed = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | undefined;
    const app = new Application();
    const palette = isBoss
      ? {
          core: 0xffd36a,
          dark: 0x521455,
          glow: 0xff4fa3,
          mid: 0xb52675,
          wing: 0x6e1d58,
        }
      : {
          core: 0x88fff6,
          dark: 0x3b2a99,
          glow: 0x66fcf1,
          mid: 0x9a55d8,
          wing: 0x241b67,
        };

    const initialize = async () => {
      await app.init({
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
        powerPreference: 'high-performance',
        resolution: clampResolution(),
      });
      initialized = true;

      if (disposed) {
        app.destroy(true);
        return;
      }

      app.canvas.className = 'rift-pixi-canvas';
      host.append(app.canvas);

      const scene = new Container();
      const ringBack = new Graphics()
        .circle(0, 0, 122)
        .stroke({ color: palette.glow, width: 2, alpha: 0.18 });
      const ringFront = new Graphics()
        .circle(0, 0, 86)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.34 });
      const halo = buildCircle(92, palette.glow, 0.12);

      const beast = new Container();
      const shadow = new Graphics()
        .ellipse(0, 70, 76, 20)
        .fill({ color: 0x000000, alpha: 0.36 });
      const leftWing = buildWing(-1, palette.wing, palette.glow);
      const rightWing = buildWing(1, palette.wing, palette.glow);
      const body = new Graphics()
        .roundRect(-58, -54, 116, 118, 38)
        .fill({ color: palette.mid, alpha: 1 })
        .stroke({ color: 0xffffff, width: 2, alpha: 0.26 });
      const bodyShade = buildCircle(42, palette.dark, 0.24);
      const core = buildCircle(16, palette.core, 0.95);
      const coreGlow = buildCircle(32, palette.core, 0.18);
      const leftEye = new Graphics().roundRect(-30, -20, 10, 23, 5).fill({ color: 0x12051c, alpha: 0.92 });
      const rightEye = new Graphics().roundRect(20, -20, 10, 23, 5).fill({ color: 0x12051c, alpha: 0.92 });
      const mouth = new Graphics().roundRect(-16, 26, 32, 7, 4).fill({ color: 0x12051c, alpha: 0.72 });
      const leftHorn = buildSpike(28, 62, palette.core, 0.92);
      const rightHorn = buildSpike(28, 62, palette.core, 0.92);
      const leftClaw = buildSpike(30, 52, palette.core, 0.76);
      const rightClaw = buildSpike(30, 52, palette.core, 0.76);

      bodyShade.y = 16;
      coreGlow.y = 2;
      core.y = 2;
      leftHorn.x = -30;
      leftHorn.y = -76;
      leftHorn.rotation = -0.24;
      rightHorn.x = 30;
      rightHorn.y = -76;
      rightHorn.rotation = 0.24;
      leftClaw.x = -40;
      leftClaw.y = 54;
      leftClaw.rotation = 3.02;
      rightClaw.x = 40;
      rightClaw.y = 54;
      rightClaw.rotation = -3.02;

      beast.addChild(
        shadow,
        leftWing,
        rightWing,
        body,
        bodyShade,
        coreGlow,
        core,
        leftEye,
        rightEye,
        mouth,
        leftHorn,
        rightHorn,
        leftClaw,
        rightClaw,
      );

      const particles: SparkParticle[] = Array.from({ length: 28 }, (_, index) => {
        const particle = buildCircle(1.7 + (index % 3), palette.glow, 0.54);

        return {
          angle: (index / 28) * Math.PI * 2,
          distance: 62 + ((index * 23) % 92),
          graphic: particle,
          size: 0.72 + (index % 5) * 0.12,
          speed: 0.24 + (index % 7) * 0.035,
        };
      });

      scene.addChild(halo, ringBack, ringFront, ...particles.map(particle => particle.graphic), beast);
      app.stage.addChild(scene);

      const resize = () => {
        const bounds = host.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width));
        const height = Math.max(1, Math.floor(bounds.height));

        app.renderer.resize(width, height);
        scene.x = width / 2;
        scene.y = height / 2;
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();

      let elapsed = stage * 0.37;
      app.ticker.add((ticker) => {
        elapsed += ticker.deltaMS / 1000;

        const impact = hitRef.current ? 1 : 0;
        const bossPulse = isBoss ? 1.12 : 1;
        const breath = 1 + Math.sin(elapsed * 2.2) * 0.035;
        const hitSquash = impact ? 0.88 + Math.sin(elapsed * 36) * 0.035 : 1;

        halo.scale.set((1 + Math.sin(elapsed * 1.4) * 0.08) * bossPulse);
        halo.alpha = impact ? 0.32 : 0.18 + Math.sin(elapsed * 1.9) * 0.05;
        ringBack.rotation += 0.004 * ticker.deltaTime;
        ringFront.rotation -= 0.006 * ticker.deltaTime;
        ringBack.scale.set(1 + Math.sin(elapsed * 1.2) * 0.035);
        ringFront.scale.set(1 + Math.cos(elapsed * 1.5) * 0.045);

        beast.y = Math.sin(elapsed * 2.4) * 7 - impact * 7;
        beast.rotation = Math.sin(elapsed * 1.7) * 0.035 + (impact ? Math.sin(elapsed * 44) * 0.08 : 0);
        beast.scale.set(breath * hitSquash);

        core.scale.set(1 + Math.sin(elapsed * 5.6) * 0.22 + impact * 0.34);
        coreGlow.scale.set(1 + Math.sin(elapsed * 4.6) * 0.3 + impact * 0.55);
        leftWing.rotation = -0.16 + Math.sin(elapsed * 2.6) * 0.055 - impact * 0.08;
        rightWing.rotation = 0.16 - Math.sin(elapsed * 2.6) * 0.055 + impact * 0.08;

        particles.forEach((particle, index) => {
          const orbit = elapsed * particle.speed + particle.angle;
          const wobble = Math.sin(elapsed * 1.7 + index) * 8;

          particle.graphic.x = Math.cos(orbit) * (particle.distance + wobble);
          particle.graphic.y = Math.sin(orbit) * (particle.distance * 0.72 + wobble);
          particle.graphic.alpha = 0.18 + Math.sin(elapsed * 2.4 + index) * 0.22 + impact * 0.22;
          particle.graphic.scale.set(particle.size + impact * 0.45);
        });
      });
    };

    void initialize();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();

      if (initialized) {
        app.destroy(true, { children: true });
      }
    };
  }, [isBoss, stage]);

  return <div ref={hostRef} className="rift-pixi-scene" aria-hidden="true" />;
};
