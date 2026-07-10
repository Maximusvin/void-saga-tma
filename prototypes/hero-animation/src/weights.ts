// Real measured payloads for this stand (gzip transfer sizes where noted),
// measured on the installed runtime versions on 2026-07-10.
//   spine-pixi-v8 4.3.10, @rive-app/canvas 2.38.5, pixi.js 8.19.x
// These feed the on-screen weight badges and the comparison table so the
// numbers the operator sees are grounded, not invented.

export interface WeightFacts {
  /** Extra JS/WASM added to the app bundle, gzip KB. null = reuses what the app already ships. */
  runtimeGzKb: number | null;
  /** Per-hero asset payload, KB (raw file size on disk). */
  assetKb: number;
  /** Plain-language note on how cost grows as you add heroes. */
  scaling: string;
}

export const WEIGHTS: Record<'procedural' | 'spine' | 'rive', WeightFacts> = {
  procedural: {
    runtimeGzKb: null, // reuses pixi.js already in the app
    assetKb: 57, // void-knight.webp for the flat variant; the layered hero is drawn in code (~0 KB)
    scaling: 'Рантайм +0. Кожен герой: або код+вектор (~0), або шаровий webp. Ручна робота на КОЖНОГО героя.',
  },
  spine: {
    runtimeGzKb: 100, // spine-pixi-v8 + spine-core, bundled + minified (approx.)
    assetKb: 308, // spineboy: png atlas 241 + skel 65 + atlas 2
    scaling: 'Рантайм ~100 KB один раз. Кожен герой тягне свій атлас-текстуру (~сотні KB) — росте лінійно.',
  },
  rive: {
    runtimeGzKb: 793, // rive.js 74 + rive.wasm 720 (WASM, one-time, cached, shared by all heroes)
    assetKb: 59, // sample vehicles.riv
    scaling: 'Рантайм ~793 KB (WASM) один раз на всіх. Кожен герой: крихітний .riv (~10–60 KB). Амортизується на масштабі.',
  },
};
