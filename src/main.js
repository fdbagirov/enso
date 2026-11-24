import { installTypography } from './typography.js';
import { buildNavThemes } from './nav-themes.js';
import gsap from 'gsap';
import { buildRequestForm } from './request-form.js';
import { buildSectionNav } from './section-nav.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';
import Lenis from 'lenis';
import { CARDS, IMAGES, buildCard } from './cards.js';
import { SCRIPTS } from './handwriting.js';
import { heroPen } from './hero-pen.js';
import { buildBook } from './book.js';
import { addAmbient, startAmbient, hoverEnabled } from './ambient.js';
import { buildInfra } from './infra.js';
import { buildPlan } from './plan.js';

gsap.registerPlugin(ScrollTrigger, Flip);
installTypography();

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Основной сброс — inline-скрипт в <head>; здесь — на случай, если браузер всё же успел прокрутить
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------------- Единицы макета ---------------- */
// Позиции карточек растягиваются по вьюпорту (x — по ширине, y — по высоте),
// размеры — по единому коэффициенту, чтобы карточки не наезжали на центр на 1440 и 1920.
const sx = () => innerWidth / 1440;
const sy = () => innerHeight / 900;
const su = () => Math.min(sx(), sy());

/* ---------------- Lenis ---------------- */
const lenis = new Lenis({
  lerp: 0.085,
  wheelMultiplier: 0.9,
});
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
lenis.stop();
if (import.meta.env.DEV) window.__lenis = lenis;

/* ---------------- Карточки ---------------- */
const canvas = $('#canvas');
const makeCard = (data) => {
  const dom = buildCard(data);
  canvas.append(dom.par);
  return { data, ...dom };
};
const cards = CARDS.map(makeCard);

const FLOW_SPEED = 620;
let photoInertia = 0;
const backdropCards = [
  [0.01, .11, 108, 87], [.12, .05, 154, 93], [.22, .24, 120, 81],
  [.03, .49, 145, 108], [.14, .67, 105, 130], [.27, .86, 147, 100],
  [.72, .03, 145, 108], [.84, .19, 150, 148], [.94, .37, 113, 86],
  [.73, .54, 94, 151], [.85, .76, 137, 83], [.98, .9, 142, 130],
].map((geometry, index) => ({ geometry, index })).filter(({ index }) => index !== 2).map(({ geometry: [x, y, width, height], index }) => {
  const element = document.createElement('img');
  element.className = 'canvas__tone';
  element.src = CARDS[(index * 3 + 2) % CARDS.length].layers[0].src;
  element.alt = '';
  element.decoding = 'async';
  canvas.prepend(element);
  return { element, x, y, width, height, speed: .38 + (index % 3) * .12 };
});

/* ---------------- Дорожки фона глав ---------------- */
// В главах фото идут вертикальными дорожками, по две с каждой стороны. Внутри дорожки
// у всех одна скорость, поэтому фото никогда не наезжают друг на друга; соседние дорожки
// едут с разной скоростью — получается глубина. x и ширина — в пикселях макета 1440.
const LANES = [
  { x: -48, w: 150, speed: 0.9, phase: 0 },
  { x: 118, w: 147, speed: 1.08, phase: 0.5 },
  { x: 1147, w: 152, speed: 1, phase: 0.25 },
  { x: 1332, w: 147, speed: 0.82, phase: 0.75 },
];
const MAX_CARD_H = 175; // ограничение высоты, чтобы между фото в дорожке оставался зазор
const WRAP_PAD = 230;
const laneLoop = () => innerHeight + 2 * WRAP_PAD * su();
const WIDTH_PATTERN = [1, 0.82, 0.94, 0.78, 0.9, 0.86];

function assignLanes() {
  const ref = (c) => c.data.hero ?? c.data.story;
  const cx = (c) => ref(c).x + ref(c).w / 2;
  const order = (c) => (c.data.hero ? c.data.hero.y : 1000 + c.data.story.y);
  const left = cards.filter((c) => cx(c) < 720).sort((a, b) => cx(a) - cx(b));
  const right = cards.filter((c) => cx(c) >= 720).sort((a, b) => cx(a) - cx(b));
  const lanes = [
    left.slice(0, Math.ceil(left.length / 2)),
    left.slice(Math.ceil(left.length / 2)),
    right.slice(0, Math.floor(right.length / 2)),
    right.slice(Math.floor(right.length / 2)),
  ];
  lanes.forEach((lane, li) => {
    lane.sort((a, b) => order(a) - order(b));
    lane.forEach((c, slot) => {
      const r = ref(c);
      Object.assign(c, {
        lane: li, slot, laneCount: lane.length,
        aspect: gsap.utils.clamp(0.5, 1.45, r.h / r.w),
        wf: WIDTH_PATTERN[slot % WIDTH_PATTERN.length],
      });
    });
  });
}
assignLanes();

function laneRect(c) {
  const lane = LANES[c.lane];
  let w = lane.w * c.wf * su();
  let h = w * c.aspect;
  if (h > MAX_CARD_H * su()) {
    h = MAX_CARD_H * su();
    w = h / c.aspect;
  }
  const spacing = laneLoop() / c.laneCount;
  return {
    left: lane.x * sx() + (lane.w * su() - w) / 2,
    top: -WRAP_PAD * su() + (c.slot + lane.phase) * spacing,
    width: w,
    height: h,
  };
}

// Длина скролл-таймлайна в условных единицах: 0–1 — уход Hero, далее три главы,
// потом фото третьей главы раскрывается на весь экран и превращается в альбом из трёх разворотов.
// Следующая глава стартует через 0.3 после ухода предыдущей — фото и тексты не пересекаются.
const STORY_LENGTH = 14.7;
let albumDismissed = false;
const ZOOM = { at: 6.6, d: 1.3 }; // фото главы 3 → видео на весь экран (как в Getty)
const ZOOM_END = ZOOM.at + ZOOM.d; // отсюда видео играет, а разворот 01 проявляется сам
let spreadIntro; // появление разворота 01 — по времени, не по скроллу
let introShown = false;
let previousBookTime = 0;
const FLIPS = [ // перелистывания 01 → 02 → 03
  { at: 9.4, d: 1.6 },
  { at: 11.8, d: 1.6 },
];
const CHAPTERS = [
  { enter: 0.55, exit: 2.5 },
  { enter: 2.8, exit: 4.75 },
  { enter: 5.05, exit: null },
];
const BORDER_ON = 'rgba(150, 122, 117, 1)';
const BORDER_OFF = 'rgba(150, 122, 117, 0)';

const rectOf = (s) => ({ left: s.x * sx(), top: s.y * sy(), width: s.w * su(), height: s.h * su() });

function heroVars(c) {
  const { hero, story } = c.data;
  if (hero) {
    // В Hero всё резко, как в макете; глубина резкости включается при уходе в фон глав
    return { ...rectOf(hero), opacity: 1, filter: 'blur(0px)', borderColor: BORDER_ON };
  }
  // Карточки, которых нет в Hero, ждут своего места в дорожке чуть ниже и прозрачными
  const r = laneRect(c);
  return { ...r, top: r.top + 120 * su(), opacity: 0, filter: 'blur(4px)', borderColor: BORDER_OFF };
}

// В главах фото по бокам сохраняют разную прозрачность, как в Hero, — это и даёт глубину
function storyVars(c) {
  const o = (c.data.story ?? c.data.hero)?.o ?? 1;
  return { ...laneRect(c), opacity: 1, filter: 'blur(0px)', borderColor: BORDER_OFF };
}

// Значения-функции: пересчитываются ScrollTrigger'ом при ресайзе
const lazy = (fn, keys = ['left', 'top', 'width', 'height', 'opacity', 'filter', 'borderColor']) =>
  Object.fromEntries(keys.map((k) => [k, () => fn()[k]]));

/* ---------------- Элементы ---------------- */
const header = $('.header');
const logo = $('.logo');
logo.addEventListener('click', event => {
  event.preventDefault();
  if (!document.body.classList.contains('scroll-ready')) return;
  lenis.scrollTo(0, {
    duration: reduceMotion ? 0 : 1.5,
    immediate: reduceMotion,
    force: true,
    onComplete: () => history.replaceState(null, '', location.pathname + location.search),
  });
});
const counter = $('.preloader__count');
const heroLines = $$('.hero__title .line__in');
const heroTags = $$('.hero .tag');
const drawn = Object.fromEntries(
  $$('.script--drawn').map((host) => [host.dataset.script, buildDrawnScript(host, SCRIPTS[host.dataset.script])]),
);

// Рукописная фраза как SVG из контуров букв: каждая буква — отдельный path
function buildDrawnScript(host, data) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${data.width} ${data.height}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.style.width = `calc(var(--u) * ${data.width})`;
  const paths = data.glyphs.map(({ d }) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
    return p;
  });
  host.append(svg);
  if (host.dataset.script === 'hero') return buildFillReveal(svg, paths, data.glyphs);
  paths.forEach((p) => {
    const len = p.getTotalLength();
    p.dataset.len = len;
    gsap.set(p, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len });
  });
  return paths;
}

// Обложка: фраза проявляется, окончание «рии» дописывается одним росчерком.
function buildFillReveal(svg, paths) {
  const create = tag => document.createElementNS(svg.namespaceURI, tag);
  const firstWritten = paths.length - 3;
  const defs = create('defs');
  const clip = create('clipPath');
  clip.id = 'cover-word-ending';
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const points = [];
  let penWidth = 0;
  paths.forEach((outline, index) => {
    Object.assign(outline.style, { stroke: 'none', fillOpacity: '1', visibility: index < firstWritten ? 'visible' : 'hidden' });
    if (index < firstWritten) return;
    const shape = create('path');
    shape.setAttribute('d', outline.getAttribute('d'));
    Object.assign(shape.style, { fill: '#fff', fillOpacity: '1', stroke: 'none' });
    clip.append(shape);
    penWidth = Math.max(penWidth, heroPen[index].width + 3);
    const segments = heroPen[index].strokes.map(d => {
      const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      return Array.from({ length: n.length / 2 }, (_, i) => [n[i * 2], n[i * 2 + 1]]);
    });
    // Join trajectories without lifting the pen or restarting the animation.
    while (segments.length) {
      const last = points[points.length - 1];
      let nearest = 0, reversed = false, distance = Infinity;
      if (last) segments.forEach((segment, i) => {
        [segment[0], segment[segment.length - 1]].forEach((end, side) => {
          const next = Math.hypot(end[0] - last[0], end[1] - last[1]);
          if (next < distance) { distance = next; nearest = i; reversed = side === 1; }
        });
      });
      const segment = segments.splice(nearest, 1)[0];
      points.push(...(reversed ? segment.reverse() : segment));
    }
  });
  defs.append(clip);
  svg.prepend(defs);
  const ink = create('g');
  ink.setAttribute('clip-path', 'url(#cover-word-ending)');
  const stroke = create('path');
  stroke.setAttribute('d', smoothPen('M' + points.map(p => p.join(',')).join(' ')));
  Object.assign(stroke.style, { fill: 'none', fillOpacity: '0', stroke: 'currentColor', strokeWidth: String(penWidth), strokeOpacity: '1', strokeLinecap: 'round', strokeLinejoin: 'round' });
  ink.append(stroke);
  svg.append(ink);
  const length = stroke.getTotalLength();
  gsap.set(svg, { autoAlpha: 0 });
  gsap.set(stroke, { strokeDasharray: `${length} ${length}`, strokeDashoffset: length + 1 });
  return gsap.timeline({ paused: true })
    .to(svg, { autoAlpha: 1, duration: reduceMotion ? .01 : 1.15, ease: 'power1.out' }, 0)
    .to(stroke, { strokeDashoffset: 0, duration: reduceMotion ? .01 : 1.15, ease: 'none' }, 0)
    .set(paths.slice(firstWritten), { visibility: 'visible' })
    .set(ink, { visibility: 'hidden' });
}

// Round the sampled pen trajectory; the glyph clip preserves every font edge.
function smoothPen(d) {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const points = [];
  for (let i = 0; i < numbers.length; i += 2) {
    const point = [numbers[i], numbers[i + 1]];
    const last = points[points.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= 2.5 || i === numbers.length - 2) points.push(point);
  }
  if (points.length < 3) return d;
  let result = `M${points[0].join(',')}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], next = points[i + 1];
    result += `Q${p.join(',')} ${(p[0] + next[0]) / 2},${(p[1] + next[1]) / 2}`;
  }
  return result + `L${points[points.length - 1].join(',')}`;
}

// Сердечко из макета (17ed2.svg) встраиваем как есть, чтобы прорисовать его штрих
async function inlineSvgs() {
  await Promise.all(
    $$('[data-inline-svg]').map(async (host) => {
      host.innerHTML = await fetch(import.meta.env.BASE_URL + host.dataset.inlineSvg.replace(/^\//, '')).then((r) => r.text());
      host.querySelectorAll('path').forEach((p) => {
        const len = p.getTotalLength();
        p.dataset.len = len;
        gsap.set(p, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len });
      });
    }),
  );
}

gsap.set(heroLines, { y: 0, yPercent: 110 });
gsap.set(heroTags, { opacity: 0, y: 16 });
gsap.set(['.header__actions', '.side-widget', '.scroll-btn'], { opacity: 0 });
document.body.classList.remove('is-loading');
document.body.style.overflow = 'hidden';

/* ---------------- Прелоадер: стопка ---------------- */
const stackCards = cards.filter((c) => c.data.hero);
const rnd = gsap.utils.random;

// Крупный логотип и стопка — оба по центру экрана
function preloaderLayout() {
  const cy = innerHeight / 2;
  return { logoW: Math.min(innerWidth * 0.56, 860), logoCy: cy, stackW: 230 * su(), stackH: 300 * su(), stackCy: cy };
}

function layoutStack() {
  const { stackW: w, stackH: h, stackCy } = preloaderLayout();
  const cx = innerWidth / 2;
  stackCards.forEach((c, i) => {
    gsap.set(c.el, {
      left: cx - w / 2 + rnd(-14, 14) * su(),
      top: stackCy - h / 2 + rnd(-10, 10) * su(),
      width: w,
      height: h,
      rotation: rnd(-10, 10),
      zIndex: i + 1,
      opacity: 0,
      borderColor: BORDER_ON,
      filter: 'blur(0px)',
    });
  });
}

function logoStartVars() {
  const { logoW, logoCy } = preloaderLayout();
  return { y: logoCy - 40, scale: logoW / 150 }; // 40 — центр логотипа в хедере
}

layoutStack();
gsap.set(logo, { ...logoStartVars(), opacity: 1 });

/* ---------------- Загрузка ---------------- */
// Проценты = сколько фото уже легло в стопку: 100% ровно на последнем фото.
// Если сеть медленнее анимации, счётчик не обгоняет реальную загрузку.
const progress = { deal: 0, load: 0 };
const renderCount = () => (counter.textContent = `${Math.round(Math.min(progress.deal, progress.load))}%`);
let loaded = 0;
const loadImages = Promise.all(
  IMAGES.map(
    (src) =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = image.onerror = () => {
          loaded += 1;
          progress.load = (loaded / IMAGES.length) * 100;
          renderCount();
          resolve();
        };
        image.src = src;
      }),
  ),
);

// Как в референсе Codrops: фото «выкладываются» на стопку по одному — сразу непрозрачные,
// без растворения, каждое успевает считаться. Видны только три верхних, остальные — под ними.
const DEAL_STEP = 0.17;
const DEAL_START = 0.35;
const lastDeal = DEAL_START + (stackCards.length - 1) * DEAL_STEP;
const intro = gsap.timeline({ paused: true });
intro
  .fromTo(progress, { deal: 0 }, { deal: 100, duration: lastDeal - DEAL_START + 0.01, ease: 'none', onUpdate: renderCount }, DEAL_START);
stackCards.forEach((c, i) => {
  const at = DEAL_START + i * DEAL_STEP;
  intro
    .set(c.el, { opacity: 1 }, at)
    .fromTo(c.el, { scale: 1.06 }, { scale: 1, duration: 0.3, ease: 'power3.out' }, at);
  if (i < stackCards.length - 3) intro.set(c.el, { opacity: 0 }, at + DEAL_STEP * 3);
});
// Не проигрывать стопку пустых рамок при первом визите и медленной сети.
await Promise.all(stackCards.flatMap(card => [...card.el.querySelectorAll('img')]
  .map(image => image.decode().catch(() => {}))));
if (reduceMotion) intro.progress(1);
else intro.play();
renderCount();

await Promise.all([loadImages, document.fonts.ready, inlineSvgs(), intro.then()]);
renderCount();
/* ---------------- Распад стопки → Hero (GSAP Flip) ---------------- */
// Стопка разлетается сразу, как только легло последнее фото и счётчик дошёл до 100%
canvas.classList.remove('is-preloading');
const reveal = gsap.timeline({ delay: 0.12 });
const stackEls = stackCards.map((c) => c.el);
// Спрятанные под верхними фото карточки возвращаем в колоду непрозрачными — разлетаются все
gsap.set(stackEls, { opacity: 1 });
// The extra photos start directly beneath the top print, sharing its silhouette.
const topPrint = stackEls[stackEls.length - 1];
const stackPose = Object.fromEntries(
  ['left', 'top', 'width', 'height', 'rotation'].map(key => [key, gsap.getProperty(topPrint, key)]),
);
const backdropEls = backdropCards.map(card => card.element);
gsap.set(backdropEls, { ...stackPose, opacity: 1 });
const flipState = Flip.getState([...backdropEls, ...stackEls], { props: 'opacity,filter' });
const edge = WRAP_PAD * su();
const wrap = gsap.utils.wrap(-edge, laneLoop() - edge);
for (const card of backdropCards) {
  gsap.set(card.element, { left: 0, top: 0, rotation: 0, ...backdropVars(card, 0, wrap) });
}
stackCards.forEach((c) => gsap.set(c.el, { ...heroVars(c), rotation: 0, zIndex: 'auto' }));
cards.filter((c) => !c.data.hero).forEach((c) => gsap.set(c.el, heroVars(c)));

reveal
  .to(counter, { opacity: 0, duration: 0.4 }, 0)
  .add(
    Flip.from(flipState, {
      duration: 1.6,
      ease: 'expo.inOut',
      stagger: { amount: (stackEls.length - 1) * 0.035, from: 'end' },
    }),
    0,
  )
  .to(logo, { y: 0, scale: 1, duration: 1.6, ease: 'expo.inOut' }, 0.05)
  .to(heroTags, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out' }, 1.15)
  .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out' }, 1.2)
  .call(() => drawn.hero.play(), null, 1.6)
  // Только базовая плашка: варианты --light/--map/--plan лежат на том же месте и включаются своими блоками
  .to(['.header__actions', '.side-widget:not([class*="side-widget--"])'], { opacity: 1, duration: 0.8, ease: 'power2.out' }, 1.5)
  .fromTo('.scroll-btn', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 2.2);

if (reduceMotion) reveal.timeScale(4);
await reveal.then();

document.body.style.overflow = '';
lenis.start();
const book = buildBook($('#book'));
const infra = buildInfra($('#infra'));
const plan = buildPlan($('#genplan'));
const story = buildStory();
setupAfterAlbum();
setupAmbient();
ScrollTrigger.refresh();
document.body.classList.add('scroll-ready');
buildSectionNav(story, lenis, ZOOM_END, STORY_LENGTH);
buildRequestForm(lenis);
buildNavThemes(story, ZOOM_END);
ScrollTrigger.refresh();
lenis.resize();
if (!reduceMotion) {
  let previous = story.time();
  gsap.ticker.add((_, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.064);
    if (!dt) return;
    const time = story.time();
    const velocity = Math.abs(time - previous) / dt;
    previous = time;
    const target = time < ZOOM.at ? Math.min(80, velocity * 48) : 0;
    photoInertia += (target - photoInertia) * (1 - Math.exp(-dt / (target > photoInertia ? 0.16 : 0.8)));
    updateFlow(time);
  });
}
addEventListener('resize', () => {
  gsap.set(infra.root.parentElement.classList.contains('pin-spacer') ? infra.root.parentElement : infra.root, { marginTop: -(innerHeight + innerHeight * 14 * (1 - 13.4 / STORY_LENGTH)) });
  lenis.resize(); ScrollTrigger.refresh();
});
if (import.meta.env.DEV) Object.assign(window, { __story: story, __book: book });

$('.scroll-btn').addEventListener('click', () => {
  const st = story.scrollTrigger;
  lenis.scrollTo(st.start + (st.end - st.start) * ((CHAPTERS[0].enter + 1) / STORY_LENGTH));
});

/* ---------------- Скролл-повествование ---------------- */
// Фото и фоновые прямоугольники идут вверх с разной скоростью.
function backdropVars(card, travel, wrap) {
  const y = wrap(card.y * innerHeight - travel * card.speed);
  const drift = reduceMotion ? 0 : Math.sin(y / innerHeight * Math.PI) * 12 * su();
  return {
    x: card.x * innerWidth + drift, y,
    width: card.width * su(), height: card.height * su(),
  };
}

function updateFlow(time) {
  const travel = reduceMotion ? 0 : Math.min(time, ZOOM.at) * FLOW_SPEED * su();
  const blend = gsap.utils.clamp(0, 1, time / 0.85);
  const edge = WRAP_PAD * su();
  const loop = laneLoop();
  const wrap = gsap.utils.wrap(-edge, loop - edge);
  cards.forEach((card) => {
    const { speed } = LANES[card.lane];
    const top = gsap.getProperty(card.el, 'top');
    const y = wrap(top - travel * speed);
    const side = card.lane < 2 ? -1 : 1;
    const drift = Math.sin((y / innerHeight - 0.5) * Math.PI) * 20;
    const centerX = Number(gsap.getProperty(card.el, 'left')) + Number(gsap.getProperty(card.el, 'width')) / 2;
    const centerY = y + Number(gsap.getProperty(card.el, 'height')) / 2;
    const radialX = (centerX - innerWidth / 2) / (innerWidth / 2);
    const radialY = gsap.utils.clamp(-1, 1, (centerY - innerHeight / 2) / (innerHeight / 2));
    gsap.set(card.par, {
      x: side * drift * blend * su() + radialX * photoInertia * su(),
      y: y - top + radialY * photoInertia * su(),
    });
  });

  for (const card of backdropCards) {
    gsap.set(card.element, backdropVars(card, travel, wrap));
  }
}
// Видео разворота играет только пока его видно (или пока его страница переворачивается).
// Видео с велосипедистом стоит на первом кадре (тот же кадр, что фото главы 3), пока фото
// раскрывается, и запускается, только когда мы уже на развороте «Знакомые места».
function updateBook(t) {
  const cyclist = book.cyclistPhoto;
  if (cyclist) {
    const fullscreen = t >= ZOOM_END;
    const parent = fullscreen ? cyclist.home : cyclist.photo;
    if (cyclist.video.parentElement !== parent) {
      parent.prepend(cyclist.video);
      cyclist.video.className = fullscreen ? 'spread__video' : 'slide__img';
      cyclist.video.style.transform = fullscreen ? '' : 'scale(1.04)';
    }
  }
  const [f1, f2] = FLIPS;
  const want = [
    t >= ZOOM_END && t < f1.at + f1.d,
    t > f1.at - 0.4 && t < f2.at + f2.d,
    t > f2.at - 0.4 && !albumDismissed,
  ];
  book.videos.forEach((v, i) => {
    if (want[i] && v.paused) v.play().catch(() => {});
    else if (!want[i] && !v.paused) v.pause();
  });
  if (t < ZOOM_END && book.videos[0].currentTime > 0) book.videos[0].currentTime = 0;

  // Тексты и коллаж первого разворота не привязаны к скроллу: появляются сами, когда видео раскрылось
  const show = t >= ZOOM_END - 0.05;
  const reversing = t < previousBookTime;
  previousBookTime = t;
  if (reversing && t < ZOOM_END + 0.4) {
    const remaining = gsap.utils.clamp(0, 1, (t - ZOOM_END) / 0.4);
    spreadIntro?.progress(Math.min(spreadIntro.progress(), remaining)).pause();
    introShown = false;
  } else if (show !== introShown) {
    introShown = show;
    if (show) spreadIntro?.play();
    else spreadIntro?.reverse();
  }
  book.setActiveLeaf(FLIPS.findIndex((f) => t >= f.at && t <= f.at + f.d));
  FLIPS.forEach((f, i) => book.renderLeaf(i, gsap.utils.clamp(0, 1, (t - f.at) / f.d)));
}

function buildStory() {
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: () => {
      updateFlow(tl.time());
      updateBook(tl.time());
    },
    scrollTrigger: {
      trigger: '#story',
      start: 'top top',
      end: () => '+=' + innerHeight * 14,
      pin: '.stage',
      pinSpacing: true,
      scrub: true,
      invalidateOnRefresh: true,
    },
  });

  // Фон: Hero-сетка перестраивается в раскладку глав (поток вверх добавляет updateFlow)
  cards.forEach((c) => {
    tl.fromTo(c.el, lazy(() => heroVars(c)), { ...lazy(() => storyVars(c)), duration: 1, ease: 'power2.inOut' }, 0);
  });

  // Hero уезжает вверх, логотип освобождает центр
  tl.to('.hero__block', { y: () => -260 * su(), opacity: 0, duration: 0.5, ease: 'power1.in' }, 0)
    .to('.hero__script', { y: () => -220 * su(), opacity: 0, duration: 0.5, ease: 'power1.in' }, 0)
    .to('.scroll-btn', { opacity: 0, y: 20, duration: 0.3 }, 0)
    .to(logo, { x: () => -(header.clientWidth / 2 - 75 - 24), duration: 0.8, ease: 'power2.inOut' }, 0.05)
    // Непрозрачный эквивалент rgba(67,33,0,.07) на фоне #fdf1e5 — чтобы карточки не просвечивали под кнопкой
    .to('.progress', { opacity: 1, duration: 0.3 }, 0.7)
    .to('.progress__done', { width: () => 109 * su(), duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[1].enter)
    .to('.progress__done', { width: () => 176 * su(), duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[2].enter);

  $$('.slide').forEach((slide, i) => {
    const { enter, exit } = CHAPTERS[i];
    const media = $('.slide__media', slide);
    const image = $('.slide__img', slide);
    const title = $('.slide__title', slide);
    const tags = $$('.tag', slide);
    const glyphs = drawn[`slide${i + 1}`];
    const heart = $$('.slide__heart-in path', slide);
    gsap.set(glyphs, { strokeDashoffset: 0, fillOpacity: 1, strokeOpacity: 0 });
    gsap.set(heart, { strokeDashoffset: 0, strokeOpacity: 1 });
    // Фото третьей главы — первый кадр видео; оно останавливается на том же масштабе 1.04,
    // что и видео разворота, чтобы при раскрытии на весь экран кадр не прыгал
    const rest = slide.classList.contains('slide--3') ? 1.04 : 1;
    gsap.set(image, { rotation: 0, scale: rest });

    // Кадр проявляется через масштаб, затем появляются заголовок и подписи.
    tl.fromTo(media, { opacity: 0, y: () => innerHeight * 0.65 }, { opacity: 1, y: 0, duration: 0.95, ease: 'power2.out' }, enter)
      .fromTo(title, { opacity: 0, y: () => innerHeight * 0.04 }, { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out' }, enter + 0.7)
      .fromTo(
        tags,
        { opacity: 0, y: () => innerHeight * 0.025 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out' },
        enter + 0.8,
      );

    if (exit !== null) {
      tl.to(slide, { opacity: 0, y: () => -innerHeight * 0.65, duration: 0.65, ease: 'power1.inOut' }, exit);
    }
  });


  buildAlbum(tl);
  tl.to({}, { duration: 0.01 }, STORY_LENGTH - 0.01);
  updateFlow(tl.time());
  updateBook(tl.time());
  return tl;
}

/* ---------------- Альбом «Локация» ---------------- */
function buildAlbum(tl) {
  const root = $('#book');
  const [s0, s1, s2] = book.spreads;
  const slide3 = $('.slide--3');
  const photo3 = $('.slide__media', slide3);
  const bg0 = $('.spread__bg', s0);
  const video = book.videos[0];
  const still = $('.slide__img', photo3);
  book.cyclistPhoto = { video, photo: photo3, home: video.parentElement };
  video.pause();
  video.currentTime = 0;
  video.poster = still.src;
  video.className = 'slide__img';
  video.style.transform = 'scale(1.04)';
  still.replaceWith(video);
  const stageW = () => root.clientWidth;
  const stageH = () => root.clientHeight;

  // Пока идут главы, альбом спрятан; следующие развороты ждут своего перелистывания
  gsap.set([s1, s2], { visibility: 'hidden' });
  tl.set(root, { visibility: 'visible' }, ZOOM_END);

  // Grow the original photo element. No replacement layer during the zoom.
  const z = ZOOM.at;
  const initialPhoto = (key) => () => ({
    left: innerWidth / 2 - 321 * su(),
    top: innerHeight / 2 - 290 * su(),
    width: 630 * su(),
    height: 402 * su(),
  })[key];
  gsap.set(bg0, { opacity: 1 });
  tl.fromTo(photo3, {
    left: initialPhoto('left'), top: initialPhoto('top'),
    width: initialPhoto('width'), height: initialPhoto('height'),
  }, {
    left: 0, top: 0, width: stageW, height: stageH,
    borderWidth: 0, duration: ZOOM.d, ease: 'none',
  }, z)
    // Compensate for the expanding media's moving origin: the caption stays
    // at its original screen position while only its opacity changes.
    .fromTo($('.slide__script', photo3), { x: 0, y: 0 }, {
      x: initialPhoto('left'), y: initialPhoto('top'),
      duration: ZOOM.d, ease: 'none', immediateRender: false,
    }, z)
    .fromTo($('.slide__script', photo3), { opacity: 1 }, {
      opacity: 0, duration: ZOOM.d * 0.3, ease: 'power1.out', immediateRender: false,
    }, z)
    // The same paused video moves into the album and starts only at 100% zoom.
    .fromTo($('.spread__veil', s0), { opacity: 0 }, { opacity: 1, duration: 0.35 }, ZOOM_END)
    .set(photo3, { visibility: 'hidden' }, ZOOM_END)
    // Всё вокруг фото расступается
    .to([$('.slide__title', slide3), ...$$('.tag', slide3)], { opacity: 0, y: () => 40 * su(), duration: 0.4, ease: 'power1.in' }, z)
    .to('.canvas', { opacity: 0, duration: 0.8, ease: 'power1.in' }, z)
    .to('.progress', { opacity: 0, duration: 0.3 }, z)
    // Хедер и плашка становятся светлыми, как в макете разворотов
    .to('.side-widget:not(.side-widget--light)', { opacity: 0, duration: 0.5 }, z + 0.6)
    .to('.side-widget--light', { opacity: 1, duration: 0.5 }, z + 0.6);

  /* Первый разворот: тексты и коллаж просто проявляются сами, по времени, а не по скроллу.
     Прокрутили назад до раскрытия — так же сами исчезают. */
  const c0 = $('.spread__content', s0);
  gsap.set(c0, { opacity: 0 });
  spreadIntro = gsap.to(c0, { opacity: 1, duration: 0.7, ease: 'power1.out', paused: true });

  /* Перелистывание: мягкая правая страница изгибается и ложится налево через корешок
     (изгиб и свет полос считает book.renderLeaf в updateBook). Под ней открывается правая
     страница следующего разворота, на обороте листа — его левая страница. */
  FLIPS.forEach(({ at, d }, i) => {
    const from = book.spreads[i];
    const to = book.spreads[i + 1];
    const { el: leaf } = book.leaves[i];
    tl.set(to, { visibility: 'visible' }, at)
      .set(leaf, { visibility: 'visible' }, at)
      .set(from, { clipPath: 'inset(0% 50% 0% 0%)' }, at)
      // Тень от листа на открывающейся правой странице
      .fromTo(book.cast, { opacity: 0 }, { opacity: 1, duration: d * 0.2, ease: 'power1.out' }, at)
      .to(book.cast, { opacity: 0, duration: d * 0.55, ease: 'power1.in' }, at + d * 0.3)
      .set(leaf, { visibility: 'hidden' }, at + d)
      .set(from, { visibility: 'hidden' }, at + d);
  });
}

function setupAfterAlbum() {
  const album = $('#book');
  const happy = $('#happy');
  const map = infra.root;
  const mapTop = () => story.scrollTrigger.end;
  const closeAt = () => {
    const trigger = story.scrollTrigger;
    return trigger.start + (trigger.end - trigger.start) * (13.4 / STORY_LENGTH);
  };
  gsap.set(map, { marginTop: () => -(innerHeight + innerHeight * 14 * (1 - 13.4 / STORY_LENGTH)) });
  const fold = { progress: 0 };
  const lastLeaf = book.leaves.length - 1;
  const closeEnd = () => Math.min(mapTop(), closeAt() + innerHeight * 0.8);

  ScrollTrigger.create({
    trigger: map,
    start: 'top top',
    end: () => closeEnd() + innerHeight * 0.9,
    pin: true,
    pinReparent: true,
    pinSpacing: true,
    onUpdate: self => infra.setActive(self.scroll() >= closeAt() && self.scroll() <= self.end + innerHeight),
    onRefresh: self => infra.setActive(self.scroll() >= closeAt() && self.scroll() <= self.end + innerHeight),
  });

  function syncMap() {
    infra.setActive(window.scrollY >= closeAt() && window.scrollY < closeEnd() + innerHeight);
  }

  function renderFold() {
    const { progress } = fold;
    const folding = progress > 0;
    const folded = progress >= 1;
    album.classList.toggle('is-folding', folding);
    album.classList.toggle('is-folded', folded);
    book.closer.style.visibility = folding && !folded ? 'visible' : 'hidden';
    book.renderLeaf(lastLeaf, Math.min(progress, 1));
    const slide = Math.max(progress - 1, 0);
    album.classList.toggle('is-sliding', slide > 0);
    album.style.translate = reduceMotion ? 'none' : `${-51 * slide}% 0`;
    album.style.opacity = reduceMotion ? 1 - slide : 1;
    album.style.clipPath = folded ? 'inset(0 50% 0 0)' : '';

    // The closed cover occupies the left half of the album element.
    const bounds = album.getBoundingClientRect();
    const coverRight = bounds.left + bounds.width / 2;
    const outsideViewport = folded && (
      coverRight <= 0 || bounds.left >= innerWidth ||
      bounds.bottom <= 0 || bounds.top >= innerHeight
    );
    const dismissed = outsideViewport || (reduceMotion && slide >= 1);
    album.classList.toggle('is-dismissed', dismissed);
    album.style.visibility = dismissed ? 'hidden' : progress > 0 ? 'visible' : '';
    album.inert = folded || dismissed;
    syncMap();
  }

  gsap.to(fold, {
    progress: 2,
    ease: 'none',
    scrollTrigger: {
      start: closeAt,
      end: closeEnd,
      scrub: true,
      invalidateOnRefresh: true,
    },
    onUpdate: () => {
      albumDismissed = fold.progress > 0;
      book.setActiveLeaf(lastLeaf);
      renderFold();
      updateBook(story.time());
    },
  });
  if (!reduceMotion) {
    [
      [map, $('.infra__map', map), 28],

    ].forEach(([section, layers, distance]) => {
      gsap.fromTo(layers, { y: () => -innerHeight * distance / 900 }, {
        y: () => innerHeight * distance / 900, ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }

  ScrollTrigger.create({ trigger: plan.root, start: 'top 8%', end: 'bottom top', onToggle: self => plan.setActive(self.isActive) });
  setupPlanCurtain(plan, happy);
  setupHappy(happy);

}

function setupPlanCurtain(plan, happy) {
  if (reduceMotion) return;
  const shade = document.createElement('div');
  shade.className = 'plan__transition-shade';
  shade.setAttribute('aria-hidden', 'true');
  plan.root.append(shade);
  // Preserve the document height: the next section naturally slides over
  // the held render, without an extra invisible scroll interval.
  ScrollTrigger.create({
    trigger: plan.root, start: 'top top',
    endTrigger: happy, end: 'top top',
    pin: plan.root, pinSpacing: false,
    invalidateOnRefresh: true,
  });
  const transition = gsap.timeline({
    scrollTrigger: {
      trigger: happy, start: 'top bottom', end: 'top top',
      scrub: true, invalidateOnRefresh: true,
    },
  });
  transition
    .fromTo(plan.scene, { scale: 1, y: 0 }, {
      scale: 0.95, y: () => -innerHeight * 0.07,
      duration: 1, ease: 'none', immediateRender: false,
    }, 0)
    .fromTo(shade, { opacity: 0 }, { opacity: 0.28, duration: 1, ease: 'none' }, 0);
}

function setupHappy(root) {
  const amenities = $('.happy__thumb video', root);
  if (amenities) {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) amenities.play().catch(() => {});
      else amenities.pause();
    }, { threshold: 0.15 });
    observer.observe(amenities);
  }
  const lines = $$('.happy__title .line__in', root);
  const cap = $('.happy__cap', root);
  const text = $('.happy__text', root);
  if (!reduceMotion) {
    // The full heading, including the handwritten capital, rises as one group.
    gsap.timeline({ scrollTrigger: { trigger: root, start: 'top 60%', once: true } })
      .from([cap, ...lines], {
        opacity: 0, y: () => 34 * su(), duration: 1,
        stagger: 0.065, ease: 'power3.out',
      }, 0.12)
      .from(text, { opacity: 0, y: () => 18 * su(), duration: 0.9, ease: 'power2.out' }, 0.6)
      .from($('.happy__thumb', root), { opacity: 0, duration: 0.8, ease: 'power2.out' }, 0.05);
    gsap.fromTo($('.happy__photo img', root), { yPercent: -4 }, {
      yPercent: 4, ease: 'none',
      scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true },
    });
    // Independent layer: the courtyard print travels faster than the photo.
    gsap.fromTo($('.happy__thumb', root), { y: () => innerHeight * 0.065 }, {
      y: () => -innerHeight * 0.085, ease: 'none',
      scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });
  }

}

/* ---------------- Живой коллаж: мышь + покачивание ---------------- */
function setupAmbient() {
  // Фон истории: чем непрозрачнее (ближе) карточка, тем сильнее она реагирует
  cards.forEach((c, i) => {
    const o = (c.data.story ?? c.data.hero)?.o ?? 1;
    addAmbient(c.el, {
      amp: 6 + 16 * o,
      rot: 0,
      idle: { y: 3, r: 0, duration: 4.5 + (i % 4) * 0.5, phase: (i * 0.37) % 1 },
    });
  });
  // Фото глав — на среднем плане; тексты неподвижны ради читаемости
  $$('.slide__media').filter((m) => !m.closest('.slide--3')).forEach((m, i) => addAmbient(m, { amp: 10, rot: 0.35, idle: { y: 3, r: 0.25, duration: 5.5, phase: i * 0.3 } }));

  // Развороты: двигаются только две фотографии и карточка-стикер, фон и тексты неподвижны.
  // Цели — оригинал и его копии на переворачиваемых листах.
  const all = (key) => $$(`[data-amb="${key}"]`);
  [0, 1, 2].forEach((s) => {
    addAmbient(all(`s${s}-main`), { amp: 15, rot: 0.8, idle: { y: 5, r: 0.6, duration: 5.6, phase: 0 } });
    addAmbient(all(`s${s}-second`), { amp: 25, rot: 1.5, idle: { y: 5, r: 0.6, duration: 4.8, phase: 0.5 } });
    addAmbient(all(`s${s}-sticker`), { amp: 35, rot: 2, idle: { y: 5, r: 0.6, duration: 6, phase: 0.25 } });
  });
  startAmbient(su);

  // Стикер приподнимается под курсором
  if (!hoverEnabled) return;
  book.spreads.forEach((spread) => {
    const sticker = $('[data-role="sticker"] .sticker', spread);
    sticker.addEventListener('mouseenter', () => {
      sticker.classList.add('is-lifted');
      gsap.to(sticker, { scale: 1.03, duration: 0.5, ease: 'power3.out' });
    });
    sticker.addEventListener('mouseleave', () => {
      sticker.classList.remove('is-lifted');
      gsap.to(sticker, { scale: 1, duration: 0.6, ease: 'power3.out' });
    });
  });
}
