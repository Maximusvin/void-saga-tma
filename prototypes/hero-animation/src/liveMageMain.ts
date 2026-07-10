import './style.css';
import { mountLiveMage } from './liveMage';
import type { LiveMageHandle } from './liveMage';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('#app root not found');
}

const header = document.createElement('header');
header.className = 'page-head';
const title = document.createElement('h1');
title.textContent = 'Живий маг — Live2D-стиль (mesh-деформація)';
const lede = document.createElement('p');
lede.className = 'lede';
lede.textContent =
  'Ваш реальний void-mage (фон прибрано локально, обличчя піксель-у-піксель), оживлений ' +
  'деформацією текстурного меша: дихання грудей, похитування голови, гойдання кіс. ' +
  'Тапни / клікни по герою — реакція на удар.';
header.append(title, lede);

const stage = document.createElement('div');
stage.className = 'stage stage-large';
const status = document.createElement('div');
status.className = 'stage-status';
status.textContent = 'завантаження…';
stage.append(status);

root.append(header, stage);

let handle: LiveMageHandle | null = null;
stage.addEventListener('pointerdown', () => handle?.react());

mountLiveMage(stage)
  .then((resolved) => {
    handle = resolved;
    status.remove();
  })
  .catch((error: unknown) => {
    status.textContent = `помилка: ${error instanceof Error ? error.message : String(error)}`;
    status.classList.add('error');
    console.error('[live-mage] mount failed', error);
  });
