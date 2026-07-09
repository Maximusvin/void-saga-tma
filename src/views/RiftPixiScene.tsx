import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { getRiftEnemyVisual, type RiftEnemyPalette } from '../game/riftVisuals';

interface RiftPixiSceneProps {
  defeatSignal: number;
  isBossDefeat: boolean;
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

interface Shockwave {
  graphic: Graphics;
  life: number;
  maxLife: number;
  startRadius: number;
  targetRadius: number;
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

const createDeathBurst = (palette: RiftEnemyPalette, isBossDefeat: boolean): ImpactParticle[] => {
  const count = isBossDefeat ? 54 : 32;

  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const speed = (isBossDefeat ? 5.8 : 4.1) + (index % 6) * 0.34;
    const color = index % 4 === 0 ? 0xffffff : (index % 3 === 0 ? palette.core : palette.glow);
    const graphic = buildShard(isBossDefeat ? 10 + (index % 4) * 2 : 7 + (index % 4), color, isBossDefeat ? 0.96 : 0.82);

    return {
      graphic,
      life: 0,
      maxLife: isBossDefeat ? 0.9 : 0.64,
      rotationSpeed: (index % 2 === 0 ? 1 : -1) * (0.14 + (index % 5) * 0.025),
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed * 0.82,
    };
  });
};

const createShockwave = (palette: RiftEnemyPalette, isBossDefeat: boolean, index: number): Shockwave => {
  const graphic = new Graphics()
    .circle(0, 0, 24)
    .stroke({ color: index === 0 ? palette.glow : palette.core, width: isBossDefeat ? 4 : 3, alpha: 0.8 });

  return {
    graphic,
    life: 0,
    maxLife: isBossDefeat ? 0.78 + index * 0.16 : 0.52 + index * 0.12,
    startRadius: 28 + index * 14,
    targetRadius: isBossDefeat ? 190 + index * 48 : 142 + index * 34,
  };
};

export const RiftPixiScene = ({ defeatSignal, isBossDefeat, isBoss, isHit, isLastHitCrit, hitSignal, stage }: RiftPixiSceneProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const defeatSignalRef = useRef(defeatSignal);
  const bossDefeatRef = useRef(isBossDefeat);
  const hitRef = useRef(isHit);
  const critRef = useRef(isLastHitCrit);
  const hitSignalRef = useRef(hitSignal);

  useEffect(() => {
    defeatSignalRef.current = defeatSignal;
    bossDefeatRef.current = isBossDefeat;
  }, [defeatSignal, isBossDefeat]);

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
      const shockwaves = new Container();
      const activeShockwaves: Shockwave[] = [];
      let lastHandledHitSignal = hitSignalRef.current;
      let lastHandledDefeatSignal = defeatSignalRef.current;
      let deathEnergy = 0;

      scene.addChild(halo, ringBack, ringFront, ...particles.map(particle => particle.graphic), beast, shockwaves, impacts);
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
        const hasNewDefeat = defeatSignalRef.current !== lastHandledDefeatSignal;

        if (hasNewHit) {
          const burst = createImpactBurst(palette, critRef.current);
          lastHandledHitSignal = hitSignalRef.current;
          impactParticles.push(...burst);
          impacts.addChild(...burst.map(particle => particle.graphic));
        }

        if (hasNewDefeat) {
          const isBossDeath = bossDefeatRef.current;
          const burst = createDeathBurst(palette, isBossDeath);
          const waves = Array.from({ length: isBossDeath ? 3 : 2 }, (_, index) => createShockwave(palette, isBossDeath, index));

          lastHandledDefeatSignal = defeatSignalRef.current;
          deathEnergy = isBossDeath ? 1.35 : 1;
          impactParticles.push(...burst);
          activeShockwaves.push(...waves);
          impacts.addChild(...burst.map(particle => particle.graphic));
          shockwaves.addChild(...waves.map(wave => wave.graphic));
        }

        const bossPulse = isBoss ? 1.12 : 1;
        const breath = 1 + Math.sin(elapsed * 2.2) * 0.035;
        const hitSquash = impact ? 0.88 + Math.sin(elapsed * 36) * 0.035 : 1;
        const deathPulse = Math.max(0, deathEnergy);

        halo.scale.set((1 + Math.sin(elapsed * 1.4) * 0.08 + deathPulse * 0.22) * bossPulse);
        halo.alpha = Math.min(0.72, (impact ? 0.32 : 0.18 + Math.sin(elapsed * 1.9) * 0.05) + deathPulse * 0.28);
        ringBack.rotation += 0.004 * ticker.deltaTime;
        ringFront.rotation -= 0.006 * ticker.deltaTime;
        ringBack.scale.set(1 + Math.sin(elapsed * 1.2) * 0.035 + deathPulse * 0.16);
        ringFront.scale.set(1 + Math.cos(elapsed * 1.5) * 0.045 + deathPulse * 0.1);

        beast.y = Math.sin(elapsed * 2.4) * 7 - impact * 7;
        beast.rotation = Math.sin(elapsed * 1.7) * 0.035 + (impact ? Math.sin(elapsed * 44) * 0.08 : 0) + deathPulse * Math.sin(elapsed * 28) * 0.09;
        beast.scale.set(breath * hitSquash * (1 + deathPulse * 0.14));
        beast.alpha = Math.max(0.38, 1 - deathPulse * 0.28);

        core.scale.set(1 + Math.sin(elapsed * 5.6) * 0.22 + impact * 0.34 + deathPulse * 0.42);
        coreGlow.scale.set(1 + Math.sin(elapsed * 4.6) * 0.3 + impact * 0.55 + deathPulse * 0.8);
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

        for (let index = activeShockwaves.length - 1; index >= 0; index -= 1) {
          const wave = activeShockwaves[index];

          wave.life += ticker.deltaMS / 1000;
          const progress = Math.min(1, wave.life / wave.maxLife);
          const radius = wave.startRadius + (wave.targetRadius - wave.startRadius) * progress;

          wave.graphic.clear()
            .circle(0, 0, radius)
            .stroke({ color: palette.glow, width: 3 * (1 - progress), alpha: 0.72 * (1 - progress) });

          if (progress >= 1) {
            shockwaves.removeChild(wave.graphic);
            wave.graphic.destroy();
            activeShockwaves.splice(index, 1);
          }
        }

        deathEnergy = Math.max(0, deathEnergy - ticker.deltaMS / (bossDefeatRef.current ? 920 : 680));
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
