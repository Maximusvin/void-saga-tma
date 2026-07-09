import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { getRiftEnemyVisual, type RiftEnemyPalette } from '../game/riftVisuals';

interface RiftPixiSceneProps {
  isBoss: boolean;
  isHit: boolean;
  isLastHitCrit: boolean;
  hitSignal: number;
  stage: number;
}

interface SparkParticle {
  graphic: Graphics;
  angle: number;
  distance: number;
  speed: number;
  size: number;
}

interface ImpactParticle {
  graphic: Graphics;
  life: number;
  maxLife: number;
  rotationSpeed: number;
  velocityX: number;
  velocityY: number;
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

const buildShard = (size: number, color: number, alpha: number) => {
  return new Graphics()
    .poly([
      0, -size,
      size * 0.58, 0,
      0, size,
      -size * 0.58, 0,
    ])
    .fill({ color, alpha });
};

const buildWing = (side: -1 | 1, color: number, glow: number, spread: number) => {
  const wing = new Graphics()
    .poly([
      0, -10,
      side * spread, -44,
      side * (spread * 0.7), 48,
      side * 8, 26,
    ])
    .fill({ color, alpha: 0.78 })
    .stroke({ color: glow, width: 2, alpha: 0.22 });

  wing.x = side * 40;
  wing.y = 8;
  return wing;
};

const createImpactBurst = (palette: RiftEnemyPalette, isCrit: boolean): ImpactParticle[] => {
  const count = isCrit ? 18 : 10;

  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (isCrit ? 0.14 : 0);
    const speed = (isCrit ? 3.7 : 2.5) + (index % 4) * 0.32;
    const graphic = buildShard(isCrit ? 9 + (index % 3) * 2 : 6 + (index % 3), isCrit ? 0xffd36a : palette.glow, isCrit ? 0.92 : 0.74);

    return {
      graphic,
      life: 0,
      maxLife: isCrit ? 0.48 : 0.34,
      rotationSpeed: (index % 2 === 0 ? 1 : -1) * (0.08 + (index % 5) * 0.02),
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed * 0.78,
    };
  });
};

export const RiftPixiScene = ({ isBoss, isHit, isLastHitCrit, hitSignal, stage }: RiftPixiSceneProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef(isHit);
  const critRef = useRef(isLastHitCrit);
  const hitSignalRef = useRef(hitSignal);

  useEffect(() => {
    hitRef.current = isHit;
  }, [isHit]);

  useEffect(() => {
    critRef.current = isLastHitCrit;
    hitSignalRef.current = hitSignal;
  }, [hitSignal, isLastHitCrit]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    let disposed = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | undefined;
    const app = new Application();
    const visual = getRiftEnemyVisual(stage, isBoss);
    const palette = visual.palette;

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
        .ellipse(0, visual.body.height * 0.58, visual.body.width * 0.66, 20)
        .fill({ color: 0x000000, alpha: 0.36 });
      const leftWing = buildWing(-1, palette.wing, palette.glow, visual.wingSpread);
      const rightWing = buildWing(1, palette.wing, palette.glow, visual.wingSpread);
      const body = new Graphics()
        .roundRect(-visual.body.width / 2, -visual.body.height / 2, visual.body.width, visual.body.height, visual.body.radius)
        .fill({ color: palette.mid, alpha: 1 })
        .stroke({ color: 0xffffff, width: 2, alpha: 0.26 });
      const bodyShade = buildCircle(visual.body.width * 0.34, palette.dark, 0.24);
      const core = buildCircle(visual.coreRadius, palette.core, 0.95);
      const coreGlow = buildCircle(visual.coreRadius * 2, palette.core, 0.18);
      const leftEye = new Graphics().roundRect(-visual.body.width * 0.26, -20, 10, 23, 5).fill({ color: 0x12051c, alpha: 0.92 });
      const rightEye = new Graphics().roundRect(visual.body.width * 0.18, -20, 10, 23, 5).fill({ color: 0x12051c, alpha: 0.92 });
      const mouth = new Graphics().roundRect(-16, 26, 32, 7, 4).fill({ color: 0x12051c, alpha: 0.72 });
      const leftHorn = buildSpike(28, visual.hornHeight, palette.core, 0.92);
      const rightHorn = buildSpike(28, visual.hornHeight, palette.core, 0.92);
      const leftClaw = buildSpike(30, visual.hornHeight * 0.68, palette.core, 0.76);
      const rightClaw = buildSpike(30, visual.hornHeight * 0.68, palette.core, 0.76);

      bodyShade.y = 16;
      coreGlow.y = 2;
      core.y = 2;
      leftHorn.x = -visual.body.width * 0.25;
      leftHorn.y = -visual.body.height * 0.63;
      leftHorn.rotation = -0.24;
      rightHorn.x = visual.body.width * 0.25;
      rightHorn.y = -visual.body.height * 0.63;
      rightHorn.rotation = 0.24;
      leftClaw.x = -visual.body.width * 0.34;
      leftClaw.y = visual.body.height * 0.45;
      leftClaw.rotation = 3.02;
      rightClaw.x = visual.body.width * 0.34;
      rightClaw.y = visual.body.height * 0.45;
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

      const particles: SparkParticle[] = Array.from({ length: visual.particleCount }, (_, index) => {
        const particle = buildCircle(1.7 + (index % 3), palette.glow, 0.54);

        return {
          angle: (index / visual.particleCount) * Math.PI * 2,
          distance: 62 + ((index * 23) % 92),
          graphic: particle,
          size: 0.72 + (index % 5) * 0.12,
          speed: 0.24 + (index % 7) * 0.035,
        };
      });
      const impacts = new Container();
      const impactParticles: ImpactParticle[] = [];
      let lastHandledHitSignal = hitSignalRef.current;

      scene.addChild(halo, ringBack, ringFront, ...particles.map(particle => particle.graphic), beast, impacts);
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
        const hasNewHit = hitSignalRef.current !== lastHandledHitSignal;

        if (hasNewHit) {
          const burst = createImpactBurst(palette, critRef.current);
          lastHandledHitSignal = hitSignalRef.current;
          impactParticles.push(...burst);
          impacts.addChild(...burst.map(particle => particle.graphic));
        }

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

        for (let index = impactParticles.length - 1; index >= 0; index -= 1) {
          const particle = impactParticles[index];

          particle.life += ticker.deltaMS / 1000;
          particle.graphic.x += particle.velocityX * ticker.deltaTime;
          particle.graphic.y += particle.velocityY * ticker.deltaTime;
          particle.graphic.rotation += particle.rotationSpeed * ticker.deltaTime;

          const progress = Math.min(1, particle.life / particle.maxLife);
          particle.graphic.alpha = 1 - progress;
          particle.graphic.scale.set(1 + progress * 0.7);

          if (progress >= 1) {
            impacts.removeChild(particle.graphic);
            particle.graphic.destroy();
            impactParticles.splice(index, 1);
          }
        }
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
