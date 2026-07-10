import './style.css';

// "Real character animation" showcase — the hero's motion is AI-generated
// (Kling image-to-video), so the character stays solid and anatomically correct
// (head turns, hair follows, subtle expression) instead of the rubbery warp a
// single-image mesh produces. Delivered as a lazy video element, the way a hero
// showcase (like AngelShowcase) would embed it.

const VIDEO_URL = '/prototypes/hero-animation/assets/hero/mage-idle.mp4';
const POSTER_URL = '/prototypes/hero-animation/assets/hero/mage-base.png';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('#app root not found');
}

const header = document.createElement('header');
header.className = 'page-head';
const title = document.createElement('h1');
title.textContent = 'Живий маг — реальна анімація персонажа (AI-рух)';
const lede = document.createElement('p');
lede.className = 'lede';
lede.textContent =
  'Рух згенерований AI (Kling image-to-video) з вашого мага: вона повертає голову, ' +
  'волосся йде за рухом, змінюється вираз — персонаж лишається цілим, як у грі, ' +
  'а не «гумова» деформація картинки. Клікни — програти з початку.';
header.append(title, lede);

const frame = document.createElement('div');
frame.className = 'hero-frame';

const video = document.createElement('video');
video.className = 'hero-video';
video.src = VIDEO_URL;
video.poster = POSTER_URL;
video.loop = true;
video.muted = true;
video.autoplay = true;
video.playsInline = true;
video.preload = 'auto';
frame.append(video);

frame.addEventListener('pointerdown', () => {
  video.currentTime = 0;
  void video.play();
});

root.append(header, frame);
