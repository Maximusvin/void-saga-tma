// Rolling FPS meter. Call tick() once per rendered frame; get() returns a
// smoothed frames-per-second value updated roughly twice a second.
export class FpsMeter {
  private frames = 0;
  private last = performance.now();
  private value = 0;

  tick(now: number = performance.now()): void {
    this.frames += 1;
    const elapsed = now - this.last;
    if (elapsed >= 500) {
      this.value = (this.frames * 1000) / elapsed;
      this.frames = 0;
      this.last = now;
    }
  }

  get(): number {
    return Math.round(this.value);
  }
}
