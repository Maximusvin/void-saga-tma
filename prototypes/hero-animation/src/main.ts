import './style.css';
import { WEIGHTS } from './weights';
import { initProceduralDemo } from './demoProcedural';
import { initSpineDemo } from './demoSpine';
import { initRiveDemo } from './demoRive';
import type { DemoHandle, DemoInit } from './demo';

type PanelId = 'procedural' | 'spine' | 'rive';

interface PanelConfig {
  id: PanelId;
  title: string;
  tech: string;
  character: string;
  tapHint: string;
  init: DemoInit;
}

const PANELS: PanelConfig[] = [
  {
    id: 'procedural',
    title: 'Процедурний Pixi',
    tech: 'pixi.js 8 · sine-математика на шарах',
    character: 'Ваш герой — авторський шаровий void-маг (+ реальний void-knight.webp)',
    tapHint: 'Тап по герою → recoil + спалах',
    init: initProceduralDemo,
  },
  {
    id: 'spine',
    title: 'Spine',
    tech: 'spine-pixi-v8 4.3 · скелетна анімація',
    character: 'Sample: spineboy — офіційний приклад Esoteric',
    tapHint: 'Тап → анімація стрибка',
    init: initSpineDemo,
  },
  {
    id: 'rive',
    title: 'Rive',
    tech: '@rive-app/canvas 2.38 · WASM + state machine',
    character: 'Sample: vehicles.riv — офіційний приклад Rive',
    tapHint: 'Тап → state-machine input',
    init: initRiveDemo,
  },
];

const weightLine = (id: PanelId): string => {
  const facts = WEIGHTS[id];
  const runtime = facts.runtimeGzKb === null ? '+0 (той самий Pixi)' : `+${facts.runtimeGzKb} KB gz`;
  return `Рантайм ${runtime} · ассет героя ~${facts.assetKb} KB`;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

const buildHeader = (onTapAll: () => void): HTMLElement => {
  const header = el('header', 'page-head');
  header.append(el('h1', undefined, 'Жива анімація героя — стенд порівняння'));
  const intro = el(
    'p',
    'lede',
    'Один герой, три технології, поруч. Дивіться вагу й FPS у кутку кожної панелі, ' +
      'і тапайте по героях — вони мають «ожити». Процедурний Pixi — на вашому герої; ' +
      'Spine та Rive — на офіційних sample-персонажах (їхнього героя не зрігати кодом, ' +
      'лише в GUI-редакторі художником). Порівнюємо ТЕХНОЛОГІЮ, не арт.',
  );
  header.append(intro);
  const tapAll = el('button', 'tap-all', '⚡ Тапнути всіх одночасно');
  tapAll.addEventListener('click', onTapAll);
  header.append(tapAll);
  return header;
};

interface PanelView {
  config: PanelConfig;
  stage: HTMLDivElement;
  fpsLabel: HTMLElement;
  status: HTMLElement;
}

const buildPanel = (config: PanelConfig): { card: HTMLElement; view: PanelView } => {
  const card = el('section', 'card');
  card.dataset.demo = config.id;

  const head = el('div', 'card-head');
  head.append(el('h2', undefined, config.title));
  head.append(el('span', 'tech', config.tech));
  card.append(head);

  const stage = el('div', 'stage');
  const fpsLabel = el('span', 'fps', '— fps');
  stage.append(fpsLabel);
  const status = el('div', 'stage-status', 'завантаження…');
  stage.append(status);
  card.append(stage);

  const meta = el('div', 'card-meta');
  meta.append(el('p', 'weight', weightLine(config.id)));
  meta.append(el('p', 'character', config.character));
  meta.append(el('p', 'tap-hint', config.tapHint));
  card.append(meta);

  return { card, view: { config, stage, fpsLabel, status } };
};

const buildComparison = (): HTMLElement => {
  const section = el('section', 'summary');
  section.append(el('h2', undefined, 'Порівняння й рекомендація'));

  const table = el('table', 'cmp');
  table.innerHTML = `
    <thead>
      <tr><th>Критерій</th><th>Процедурний Pixi</th><th>Spine</th><th>Rive</th></tr>
    </thead>
    <tbody>
      <tr><td>Рантайм (gzip)</td><td class="good">+0 — той самий Pixi</td><td>~100 KB, один раз</td><td class="warn">~793 KB WASM, один раз</td></tr>
      <tr><td>Ассет на героя</td><td>~0 (вектор) / webp</td><td class="warn">~300 KB атлас</td><td class="good">~10–60 KB .riv</td></tr>
      <tr><td>Масштаб на 100 героїв</td><td class="warn">ручна робота на кожного</td><td class="warn">×100 атласів</td><td class="good">×100 крихітних .riv</td></tr>
      <tr><td>Багатство руху</td><td class="warn">просте (дихання, гойдання)</td><td class="good">будь-яка скелетна анімація</td><td class="good">складна + інтерактивна</td></tr>
      <tr><td>Хто рігає героя</td><td class="good">агент кодом</td><td class="warn">художник у Spine (платно)</td><td class="warn">художник у Rive (підписка)</td></tr>
      <tr><td>Стек проєкту</td><td class="good">рідний (уже є)</td><td class="good">поверх Pixi (ADR-намічено)</td><td class="warn">окремий рантайм</td></tr>
    </tbody>`;
  section.append(table);

  const verdict = el('div', 'verdict');
  verdict.innerHTML = `
    <p><strong>Коротко:</strong> «жива» базова анімація (дихання, похитування, волосся, реакція на тап) —
    це не відео, а риг. Ви вже маєте <em>процедурний</em> варіант у проді (ангел).</p>
    <ul>
      <li><strong>Зараз / дешево:</strong> процедурний Pixi — 0 нових залежностей, рідний стек. Межа: кожен герой потребує ручного розкладання на шари + код руху, і рух простий.</li>
      <li><strong>Коли треба багатий рух на багато героїв:</strong> Spine — художник рігає раз, скелетна анімація будь-якої складності, лягає поверх вашого ж Pixi (namічено в ADR 0003). Ціна: атлас-текстура на кожного героя.</li>
      <li><strong>Rive:</strong> найлегші файли героїв і найкраща інтерактивність, але важкий WASM-рантайм (~0.8 МБ) — виправданий лише на масштабі й якщо ок додати окремий рантайм у бандл TMA.</li>
    </ul>
    <p class="muted">Live2D і 3D свідомо не в стенді: Live2D — важчий рантайм + ліцензія; 3D — перемалювати весь 2D-WebP-арт у моделі, зміна всього пайплайну. Обидва погано лягають на ваш перф-строгий 2D-стек.</p>`;
  section.append(verdict);
  return section;
};

// ---- assemble page ----
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('#app root not found');
}

const handles = new Map<PanelId, DemoHandle>();
const tapAll = () => {
  for (const handle of handles.values()) {
    handle.react();
  }
};

app.append(buildHeader(tapAll));
const grid = el('div', 'grid');
const views = PANELS.map((config) => {
  const { card, view } = buildPanel(config);
  grid.append(card);
  return view;
});
app.append(grid);
app.append(buildComparison());

// Verification hook: lets a headless/hidden tab drive frames deterministically
// when requestAnimationFrame is throttled to zero. Harmless in normal use.
(window as unknown as { __heroDemo?: unknown }).__heroDemo = { handles, tapAll };

for (const view of views) {
  view.config
    .init(view.stage)
    .then((handle) => {
      handles.set(view.config.id, handle);
      view.status.remove();
      view.stage.addEventListener('pointerdown', () => handle.react());
    })
    .catch((error: unknown) => {
      view.status.textContent = `⚠ помилка: ${error instanceof Error ? error.message : String(error)}`;
      view.status.classList.add('error');
      console.error(`[${view.config.id}] init failed`, error);
    });
}

window.setInterval(() => {
  for (const view of views) {
    const handle = handles.get(view.config.id);
    view.fpsLabel.textContent = handle ? `${handle.fps()} fps` : '— fps';
  }
}, 500);
