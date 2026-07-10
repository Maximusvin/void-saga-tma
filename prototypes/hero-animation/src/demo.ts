// Shared contract every demo panel implements.
// A demo owns its own render loop, canvas and assets inside the host div it is given.

export interface DemoHandle {
  /** Trigger the "hit / tap" reaction (called on pointer down over the stage). */
  react: () => void;
  /** Current measured frames-per-second of this demo's own render loop. */
  fps: () => number;
  /** Tear down render loop, canvas and assets. */
  destroy: () => void;
  /**
   * Advance the animation by a fixed delta and force one render, bypassing
   * requestAnimationFrame. Only used for deterministic verification (e.g. when a
   * headless/hidden tab throttles rAF to zero). Omitted where a runtime drives
   * itself internally (Rive).
   */
  frameStep?: (deltaSeconds: number) => void;
}

export type DemoInit = (host: HTMLDivElement) => Promise<DemoHandle>;
