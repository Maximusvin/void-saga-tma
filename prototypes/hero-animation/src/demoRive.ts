import { Rive, Layout, Fit, Alignment } from '@rive-app/canvas';
import { FpsMeter } from './fps';
import type { DemoHandle } from './demo';

// Demo C — Rive runtime (@rive-app/canvas, WASM). Same honesty as Spine: we
// cannot author the project's hero in code, so this loads Rive's official
// vehicles.riv sample to measure the RUNTIME — WASM bundle weight, vector
// smoothness, and interaction. Self-configuring: it prefers a state-machine
// input for the tap; the vehicles sample exposes none, so it falls back to
// playing a one-shot reaction animation ("bounce") and resuming idle.

const RIV_URL = '/prototypes/hero-animation/assets/rive/vehicles.riv';
const REACTION_PATTERN = /bounce|hit|jump|react|tap|curves|press/i;
const IDLE_PATTERN = /idle|loop/i;

interface RiveInputLike {
  name: string;
  value?: number | boolean;
  fire?: () => void;
}

export async function initRiveDemo(host: HTMLDivElement): Promise<DemoHandle> {
  const canvas = document.createElement('canvas');
  canvas.className = 'demo-canvas';
  host.append(canvas);

  const fps = new FpsMeter();
  let inputs: RiveInputLike[] = [];
  let stateMachine: string | null = null;
  let idleAnimation: string | null = null;
  let reactionAnimation: string | null = null;

  const rive = await new Promise<Rive>((resolve, reject) => {
    const instance = new Rive({
      src: RIV_URL,
      canvas,
      autoplay: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      onLoad: () => {
        instance.resizeDrawingSurfaceToCanvas();
        const machines = instance.stateMachineNames ?? [];
        const animations = instance.animationNames ?? [];
        if (machines.length > 0) {
          stateMachine = machines[0];
          inputs = (instance.stateMachineInputs(stateMachine) ?? []) as RiveInputLike[];
        }
        idleAnimation = animations.find((name) => IDLE_PATTERN.test(name)) ?? animations[0] ?? null;
        reactionAnimation = animations.find((name) => REACTION_PATTERN.test(name)) ?? null;

        // Prefer an interactive state machine; otherwise loop an idle animation.
        if (inputs.length > 0 && stateMachine) {
          instance.play(stateMachine);
        } else if (idleAnimation) {
          instance.play(idleAnimation);
        } else if (stateMachine) {
          instance.play(stateMachine);
        }

        const introspection = {
          machines,
          animations,
          inputs: inputs.map((input) => ({
            name: input.name,
            valueType: typeof input.value,
            hasFire: typeof input.fire === 'function',
          })),
          idleAnimation,
          reactionAnimation,
        };
        console.info('[rive] sample introspection:', introspection);
        (window as unknown as { __riveInfo?: unknown }).__riveInfo = introspection;
        resolve(instance);
      },
      onLoadError: (error) => reject(error),
    });
  });

  const resizeObserver = new ResizeObserver(() => rive.resizeDrawingSurfaceToCanvas());
  resizeObserver.observe(host);

  // Rive owns its internal rAF loop; sample display cadence for the FPS badge.
  let alive = true;
  const sampleFps = () => {
    if (!alive) {
      return;
    }
    fps.tick();
    requestAnimationFrame(sampleFps);
  };
  requestAnimationFrame(sampleFps);

  const react = () => {
    const trigger = inputs.find((input) => typeof input.fire === 'function' && input.value === undefined);
    const boolean = inputs.find((input) => typeof input.value === 'boolean');
    const number = inputs.find((input) => typeof input.value === 'number');

    if (trigger?.fire) {
      trigger.fire();
    } else if (boolean) {
      boolean.value = true;
      window.setTimeout(() => {
        boolean.value = false;
      }, 320);
    } else if (number && typeof number.value === 'number') {
      number.value += 1;
    } else if (reactionAnimation) {
      // No inputs (vehicles sample): play a one-shot reaction, then resume idle.
      rive.stop();
      rive.play(reactionAnimation);
      const resume = idleAnimation && idleAnimation !== reactionAnimation ? idleAnimation : stateMachine;
      if (resume) {
        window.setTimeout(() => {
          rive.stop();
          rive.play(resume);
        }, 900);
      }
    } else if (stateMachine) {
      rive.reset();
      rive.play(stateMachine);
    }
    navigator.vibrate?.(15);
  };

  return {
    react,
    fps: () => fps.get(),
    destroy: () => {
      alive = false;
      resizeObserver.disconnect();
      rive.cleanup();
      canvas.remove();
    },
  };
}
