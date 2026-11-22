import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';
import Lenis from 'lenis';
import { CARDS, IMAGES, buildCard } from './cards.js';
import { SCRIPTS } from './handwriting.js';
import { buildBook } from './book.js';
import { addAmbient, startAmbient, hoverEnabled } from './ambient.js';
import { buildInfra } from './infra.js';
import { buildPlan } from './plan.js';
import { coverTransform } from './scroll-math.js';
import { buildBenefits } from './benefits.js';

gsap.registerPlugin(ScrollTrigger, Flip);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Основной сброс — inline-скрипт в <head>; здесь — на случай, если браузер всё же успел прокрутить
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------------- Единицы макета ---------------- */
// Позиции карточек растягиваются по вьюпорту (x — по ширине, y — по высоте),
// размеры — по единому коэффициенту, чтобы карточки не наезжали на центр на 1440 и 1920.
const viewport = { w: document.documentElement.clientWidth, h: $('.stage').clientHeight };
const metrics = { media: [] };
const sx = () => viewport.w / 1440;
const sy = () => viewport.h / 900;
const su = () => Math.min(sx(), sy());

/* ---------------- Lenis ---------------- */
const lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9 });
lenis.on('scroll', ScrollTrigger.update);
// Lenis runs before the GSAP root timeline, so the scrub tween consumes this frame's scroll.
gsap.ticker.add((time) => lenis.raf(time * 1000), false, true);
ScrollTrigger.config({ ignoreMobileResize: true });
gsap.ticker.lagSmoothing(0);
lenis.stop();
if (import.meta.env.DEV) window.__lenis = lenis;

/* ---------------- Карточки ---------------- */
const canvas = $('#canvas');
const stage = $('.stage');
const makeCard = (data) => {
  const dom = buildCard(data);
  canvas.append(dom.par);
  return { data, ...dom };
};
const cards = CARDS.map(makeCard);

// Сколько пикселей макета проезжает дорожка со скоростью 1 за одну единицу таймлайна
const FLOW_PER_UNIT = 700;

/* ---------------- Дорожки фона глав ---------------- */
// В главах фото идут вертикальными дорожками, по две с каждой стороны. Внутри дорожки
// у всех одна скорость, поэтому фото никогда не наезжают друг на друга; соседние дорожки
// едут с разной скоростью — получается глубина. x и ширина — в пикселях макета 1440.
const LANES = [
  { x: -30, w: 120, speed: 0.72, phase: 0 },
  { x: 128, w: 104, speed: 1, phase: 0.5 },
  { x: 1118, w: 104, speed: 1, phase: 0.25 },
  { x: 1262, w: 120, speed: 0.72, phase: 0.75 },
];
const PER_LANE = 6;
const RING_PULL = 80; // насколько дорожки стягиваются к центру у верха и низа экрана (px макета)
const MAX_CARD_H = 175; // ограничение высоты, чтобы между фото в дорожке оставался зазор
const WRAP_PAD = 230;
const laneLoop = () => viewport.h + 2 * WRAP_PAD * su();
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
  // Своих фото пока мало — добиваем дорожки повторами тех же снимков
  let k = 0;
  lanes.forEach((lane, li) => {
    while (lane.length < PER_LANE) {
      const src = cards[(k * 5 + li * 3) % CARDS.length].data;
      const clone = makeCard({
        id: `repeat-${k}`, layers: src.layers, flipped: src.flipped, hero: null,
        story: { ...(src.hero ?? src.story) },
      });
      cards.push(clone);
      lane.push(clone);
      k += 1;
    }
    lane.sort((a, b) => order(a) - order(b));
    lane.forEach((c, slot) => {
      const r = ref(c);
      Object.assign(c, {
        lane: li, slot,
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
  const spacing = laneLoop() / PER_LANE;
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
const STORY_LENGTH = 20.6; // .story = 2460svh; late transitions are time-based.
const CLOSE = { at: 14.4 };
const PLAN = { at: 15.9 };
const HAPPY = { at: 17.5 };
const BENEFITS = { at: 19.1 };
let postScenes;
let happyIntro;
const ZOOM = { at: 6.25, d: 0.65 }; // фото главы 3 → видео на весь экран (как в Getty)
const ZOOM_END = ZOOM.at + ZOOM.d; // отсюда видео играет, а разворот 01 проявляется сам
let spreadIntro; // появление разворота 01 — по времени, не по скроллу
let introShown = false;
const FLIPS = [ // перелистывания 01 → 02 → 03
  { at: 8.0, d: 1.15 },
  { at: 10.0, d: 1.15 },
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
    return { ...rectOf(hero), opacity: hero.o, filter: 'blur(0px)', borderColor: BORDER_ON };
  }
  // Карточки, которых нет в Hero, ждут своего места в дорожке чуть ниже и прозрачными
  const r = laneRect(c);
  return { ...r, top: r.top + 120 * su(), opacity: 0, filter: 'blur(4px)', borderColor: BORDER_OFF };
}

// В главах фото по бокам сохраняют разную прозрачность, как в Hero, — это и даёт глубину
function storyVars(c) {
  const o = (c.data.story ?? c.data.hero)?.o ?? 1;
  return { ...laneRect(c), opacity: o, filter: 'blur(0px)', borderColor: BORDER_OFF };
}

// Значения-функции: пересчитываются ScrollTrigger'ом при ресайзе
const lazy = (fn, keys = ['left', 'top', 'width', 'height', 'opacity', 'borderColor']) =>
  Object.fromEntries(keys.map((k) => [k, () => fn()[k]]));

/* ---------------- Элементы ---------------- */
const header = $('.header');
const logo = $('.logo');
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
  paths.forEach((p) => {
    const len = p.getTotalLength();
    p.dataset.len = len;
    gsap.set(p, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len });
  });
  return paths;
}

// «Trim path»: контур каждой буквы прорисовывается по очереди, следом буква заливается.
// Длительность буквы пропорциональна длине контура, весь проход — одной плавной кривой.
// lineStrokes — штрихи без заливки (сердечко): только прорисовываются и остаются.
function makeDraw(paths, { total = 2.2, lineStrokes = [] } = {}) {
  const inner = gsap.timeline({ paused: true });
  let t = 0;
  paths.forEach((p) => {
    const d = Math.max(0.12, Number(p.dataset.len) / 900);
    inner
      .to(p, { strokeDashoffset: 0, duration: d, ease: 'none' }, t)
      .to(p, { fillOpacity: 1, duration: d * 0.9, ease: 'power1.in' }, t + d * 0.45);
    t += d * 0.62;
  });
  inner.to(paths, { strokeOpacity: 0, duration: 0.25, ease: 'none' }, '>-0.25');
  lineStrokes.forEach((p) => {
    inner.to(p, { strokeDashoffset: 0, duration: Number(p.dataset.len) / 160, ease: 'power1.inOut' }, '>-0.35');
  });
  return gsap.to(inner, { progress: 1, duration: total, ease: 'none', paused: true });
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

// Keep the centered logo clear of the CTA when Chrome is a narrow desktop window.
function logoHomeX() {
  const w = metrics.headerWidth;
  return Math.max(-(w / 2 - 75.5 - 24), Math.min(0, w / 2 - 115.5 - metrics.actionsWidth));
}

function logoStartVars() {
  const { logoW, logoCy } = preloaderLayout();
  return { y: logoCy - 40, scale: logoW / 151 }; // 40 — центр логотипа в хедере
}

layoutStack();
gsap.set(logo, { ...logoStartVars(), opacity: 0 });

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
const intro = gsap.timeline();
intro
  .to(logo, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.1)
  .fromTo(progress, { deal: 0 }, { deal: 100, duration: lastDeal - DEAL_START + 0.01, ease: 'none', onUpdate: renderCount }, DEAL_START);
stackCards.forEach((c, i) => {
  const at = DEAL_START + i * DEAL_STEP;
  intro
    .set(c.el, { opacity: 1 }, at)
    .fromTo(c.el, { scale: 1.06 }, { scale: 1, duration: 0.3, ease: 'power3.out' }, at);
  if (i < stackCards.length - 3) intro.set(c.el, { opacity: 0 }, at + DEAL_STEP * 3);
});
if (reduceMotion) intro.progress(1);
renderCount();

await Promise.all([loadImages, document.fonts.ready, inlineSvgs(), intro.then()]);
renderCount();
metrics.headerWidth = header.clientWidth;
metrics.actionsWidth = $('.header__actions').offsetWidth;
/* ---------------- Распад стопки → Hero (GSAP Flip) ---------------- */
// Стопка разлетается сразу, как только легло последнее фото и счётчик дошёл до 100%
const reveal = gsap.timeline({ delay: 0.12 });
const stackEls = stackCards.map((c) => c.el);
// Спрятанные под верхними фото карточки возвращаем в колоду непрозрачными — разлетаются все
gsap.set(stackEls, { opacity: 1 });
const flipState = Flip.getState(stackEls, { props: 'opacity,filter' });
stackCards.forEach((c) => gsap.set(c.el, { ...heroVars(c), rotation: 0, zIndex: 'auto' }));
cards.filter((c) => !c.data.hero).forEach((c) => gsap.set(c.el, heroVars(c)));

reveal
  .to(counter, { opacity: 0, duration: 0.4 }, 0)
  .add(
    Flip.from(flipState, {
      duration: 1.6,
      ease: 'expo.inOut',
      stagger: { each: 0.035, from: 'end' },
    }),
    0,
  )
  .to(logo, { x: logoHomeX, y: 0, scale: 1, duration: 1.6, ease: 'expo.inOut' }, 0.05)
  .to(heroTags, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out' }, 1.15)
  .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out' }, 1.2)
  .call(() => makeDraw(drawn.hero).play(), null, 1.6)
  // Только базовая плашка: варианты --light/--map/--plan лежат на том же месте и включаются своими блоками
  .to(['.header__actions', '.side-widget:not([class*="side-widget--"])'], { opacity: 1, duration: 0.8, ease: 'power2.out' }, 1.5)
  .fromTo('.scroll-btn', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 2.2);

if (reduceMotion) reveal.timeScale(4);
await reveal.then();

document.body.style.overflow = '';
lenis.start();
// A photo collage and its caption/sticker share one motion surface, including page copies.
$$('#book > .spread').forEach((spread, i) => {
  const content = $('.spread__content', spread);
  const group = document.createElement('div');
  group.className = 'spread__collage';
  group.dataset.amb = `s${i}-collage`;
  const figures = $$(':scope > .collage-item', content);
  content.insertBefore(group, $('.spread__spine', content));
  figures.forEach(figure => {
    $$('[data-amb]', figure).forEach(el => el.removeAttribute('data-amb'));
    group.append(figure);
  });
});
$$('.sp-cap').forEach(cap => {
  const letter = cap.textContent.trim();
  cap.textContent = '';
  cap.classList.add('script--drawn');
  const paths = buildDrawnScript(cap, SCRIPTS['cap' + letter]);
  gsap.set(paths, {fillOpacity: 1, strokeOpacity: 0, strokeDashoffset: 0});
  cap._draw = gsap.fromTo(cap, {opacity: 0}, {opacity: 1, duration: 0.6, ease: 'power2.out', paused: true});
});
const book = buildBook($('#book'));
const pageTurns = FLIPS.map(() => ({p:0, target:0}));
const infra = buildInfra($('#infra'));
const plan = buildPlan($('#genplan'));
const benefits = buildBenefits($('#benefits'), su);
prepareCardSurfaces();
measureScene();
ScrollTrigger.addEventListener('refreshInit', measureScene);
const story = buildStory();
// refreshInit measures; refresh renders the rebuilt model even when the playhead did not move.
ScrollTrigger.addEventListener('refresh', () => {
  // Before the first logo tween starts, invalidation alone retains its previous start transform.
  if (story.time() <= 0.05) gsap.set(logo, { x: logoHomeX });
  updateFlow(story.time());
  updateBook(story.time());
});
setupAmbient();
if (import.meta.env.DEV) Object.assign(window, { __story: story, __book: book });

$('.scroll-btn').addEventListener('click', () => {
  const st = story.scrollTrigger;
  lenis.scrollTo(st.start + (st.end - st.start) * ((CHAPTERS[0].enter + 1) / STORY_LENGTH), { duration: 1.8 });
});

/* ---------------- Скролл-повествование ---------------- */
// Фон как в Getty: фото по бокам непрерывно текут вверх, ушедшие за верх возвращаются снизу.
// «Барабан»: у середины экрана фото ближе и крупнее, к краям уходят вглубь и к краю экрана.
// All layout reads happen at startup / refreshInit, before timeline writes.
function measureScene() {
  viewport.w = document.documentElement.clientWidth;
  viewport.h = $('.stage').clientHeight;
  metrics.headerWidth = header.clientWidth;
  metrics.actionsWidth = $('.header__actions').offsetWidth;
  metrics.media = $$('.slide__media').map(el => ({
    left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight,
  }));
  infra.resize(viewport.w, viewport.h);
  plan.resize(viewport.w, viewport.h);
}

function prepareCardSurfaces() {
  cards.forEach(c => {
    // Geometry is a numeric model; the DOM surface has a fixed size throughout scrolling.
    c.el.classList.add('is-surface');
    c.rect = { ...heroVars(c) };
    c.base = { w: 100, h: 100 };
    gsap.set(c.el, {
      autoRound: false, left: 0, top: 0, width: c.base.w, height: c.base.h,
      x: 0, y: 0, scale: 1, rotation: 0, filter: 'none', transformOrigin: '0 0',
    });
    c.layers = [...c.el.querySelectorAll('.card__layer')].map(image => {
      image.style.objectFit = 'fill';
      image.style.transformOrigin = '0 0';
      return { image, w: image.naturalWidth || 1, h: image.naturalHeight || 1 };
    });
  });
}

function updateFlow(time) {
  // Once the canvas is hidden, no card styles need to be updated.
  const visible = time < ZOOM_END;
  stage.classList.toggle('is-chapters', visible);
  canvas.classList.toggle('is-moving', visible);
  canvas.classList.toggle('is-under-header', visible && time > 0.35);
  if (!visible) return;
  const strength = gsap.utils.clamp(0, 1, time);
  const u = su(), min = -WRAP_PAD * u, loop = laneLoop();
  for (const c of cards) {
    const { left, top, width, height, opacity, borderColor } = c.rect;
    const flow = time * FLOW_PER_UNIT * u * LANES[c.lane].speed;
    const y = gsap.utils.wrap(min, min + loop, top - flow);
    const v = gsap.utils.clamp(-1, 1, ((y + height / 2) / viewport.h - 0.5) * 2);
    const arc = 1 - Math.sqrt(1 - v * v);
    const side = left + width / 2 < viewport.w / 2 ? 1 : -1;
    const ring = 1 - strength * 0.05 * arc;
    const x = left + side * strength * RING_PULL * u * arc;
    c.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${width / c.base.w * ring}, ${height / c.base.h * ring})`;
    c.el.style.opacity = opacity;
    c.el.style.outlineColor = borderColor;
    for (const { image, w, h } of c.layers) {
      image.style.transform = coverTransform(width, height, c.base.w, c.base.h, w, h);
    }
  }
}
// Видео разворота играет только пока его видно (или пока его страница переворачивается).
// Видео с велосипедистом стоит на первом кадре (тот же кадр, что фото главы 3), пока фото
// раскрывается, и запускается, только когда мы уже на развороте «Знакомые места».
function updateBook(t) {
  const [f1, f2] = FLIPS;
  $('#book').classList.toggle('has-spine', t >= ZOOM_END);
  $('#book').classList.toggle('is-zooming', t >= ZOOM.at && t < ZOOM_END);
  const want = [
    t >= ZOOM_END && t < f1.at + f1.d,
    t > f1.at - 0.4 && t < f2.at + f2.d,
    t > f2.at - 0.4 && (t < CLOSE.at || postScenes?.bookVisible),
  ];
  book.videos.forEach((v, i) => {
    if (want[i] && v.paused) v.play().catch(() => {});
    else if (!want[i] && !v.paused) v.pause();
  });
  if (t < ZOOM_END && book.videos[0].currentTime > 0) book.videos[0].currentTime = 0;

  // Тексты и коллаж первого разворота не привязаны к скроллу: появляются сами, когда видео раскрылось
  const show = t >= ZOOM_END - 0.05;
  if (show !== introShown) {
    introShown = show;
    if (show) spreadIntro?.play();
    else spreadIntro?.reverse();
  }
  postScenes?.update(t);
  book.setActiveLeaf(FLIPS.findIndex((f) => t >= f.at && t <= f.at + f.d));
  FLIPS.forEach((f, i) => {
    const turn=pageTurns[i], target=t >= f.at ? 1 : 0;
    if (target !== turn.target) {
      turn.target=target;
      gsap.to(turn,{p:target,duration:reduceMotion?0.2:1.15,ease:'power2.inOut',overwrite:true,onUpdate:()=>{
        const moving=turn.p>0 && turn.p<1;
        gsap.set(book.leaves[i].el,{visibility:moving?'visible':'hidden'});
        gsap.set(book.spreads[i],{visibility:turn.p<1?'visible':'hidden',clipPath:turn.p>0?'inset(0% 50% 0% 0%)':'inset(0%)'});
        if (turn.p>0) gsap.set(book.spreads[i+1],{visibility:'visible'});
        book.setActiveLeaf(moving?i:-1);
        book.renderLeaf(i,turn.p);
      }});
    }
  });
  book.spreads.forEach((spread,i)=>{
    const cap=$('.sp-cap',spread);
    const visible=t >= (i===0?ZOOM_END:FLIPS[i-1].at);
    if(cap?._draw && visible!==cap._writing){
      cap._writing=visible;
      visible?cap._draw.restart():cap._draw.pause(0);
      if(i>0){
        const copy=$('.sp-line, .sp-lead, .sp-list li',spread);
        cap._copyTween?.kill();
        gsap.set(copy,{opacity:0});
        if(visible) cap._copyTween=gsap.to(copy,{opacity:1,duration:0.85,stagger:0.08,delay:0.65,ease:'power2.out'});
      }
    }
  });
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
      end: 'bottom bottom',
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  // Фон: Hero-сетка перестраивается в раскладку глав (поток вверх добавляет updateFlow)
  cards.forEach((c) => {
    tl.fromTo(c.rect, lazy(() => heroVars(c)), { ...lazy(() => storyVars(c)), duration: 1, ease: 'power2.inOut' }, 0);
  });

  // Hero уезжает вверх, логотип освобождает центр
  tl.to('.hero__block', { y: () => -260 * su(), opacity: 0, duration: 0.5, ease: 'power1.in' }, 0)
    .to('.hero__script', { y: () => -220 * su(), opacity: 0, duration: 0.5, ease: 'power1.in' }, 0)
    .to('.scroll-btn', { opacity: 0, y: 20, duration: 0.3 }, 0)
    .fromTo(logo, { x: logoHomeX }, { x: () => -(metrics.headerWidth / 2 - 75.5 - 24), duration: 0.8, ease: 'power2.inOut' }, 0.05)
    // Непрозрачный эквивалент rgba(67,33,0,.07) на фоне #fdf1e5 — чтобы карточки не просвечивали под кнопкой
    .to('.btn-burger', { backgroundColor: '#f0e2d5', duration: 0.6 }, 0.1)
    .to('.progress', { opacity: 1, duration: 0.3 }, 0.7)
    .to('.progress__done', { scaleX: 109 / 210, duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[1].enter)
    .to('.progress__dot', { x: () => 109 * su(), duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[1].enter)
    .to('.progress__done', { scaleX: 176 / 210, duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[2].enter)
    .to('.progress__dot', { x: () => 176 * su(), duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[2].enter);

  tl.set('.progress__dot', { x: () => 58 * su() }, 0);
  const medias = [];
  $$('.slide').forEach((slide, i) => {
    const { enter, exit } = CHAPTERS[i];
    const media = $('.slide__media', slide);
    const image = $('.slide__img', slide);
    const title = $('.slide__title', slide);
    const tags = $$('.tag', slide);
    const glyphs = drawn[`slide${i + 1}`];
    const heart = $$('.slide__heart-in path', slide);
    const draw = makeDraw(glyphs, { total: 1.8, lineStrokes: heart });
    // Фото третьей главы — первый кадр видео; оно останавливается на том же масштабе 1.04,
    // что и видео разворота, чтобы при раскрытии на весь экран кадр не прыгал
    const rest = slide.classList.contains('slide--3') ? 1.04 : 1;
    gsap.set(image, { rotation: 0, scale: rest });
    medias.push(media);

    // Фото выезжает снизу, как при обычной прокрутке, и встаёт в центр
    tl.fromTo(media, { y: () => viewport.h - metrics.media[i].top + 40 * su() }, { y: 0, duration: 0.8, ease: 'power2.out' }, enter)
      .fromTo(image, { scale: 1.12 * rest }, { scale: rest, duration: 1.2, ease: 'power1.out' }, enter)
      .fromTo(title, { y: () => 160 * su(), opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out' }, enter + 0.7)
      .fromTo(
        tags,
        { y: () => 120 * su(), opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: 'power2.out' },
        enter + 0.8,
      )
      // Рукопись на фото пишется по trim path, когда фото уже встало: вперёд — играет, назад — сбрасывается
      .call(() => (tl.scrollTrigger?.direction === -1 ? draw.pause(0) : draw.restart()), null, enter + 0.8);

    if (exit !== null) {
      // Глава уезжает вверх, освобождая место следующей, которая поднимается снизу
      // Глава уезжает вверх одним блоком: текст едет следом за фото, как при обычной прокрутке.
      // Следующее фото выходит снизу уже за текстом, поэтому ничего не перекрывается.
      tl.to([media, $('.slide__text', slide)], { y: () => -(viewport.h + 40 * su()), duration: 0.8, ease: 'power1.in' }, exit);
    }
  });

  // До запуска истории фото глав спрятаны CSS-ом; теперь они стоят за нижним краем
  gsap.set(medias, { opacity: 1 });
  buildAlbum(tl);
  postScenes = buildPostScenes();
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
  gsap.set(bg0, { opacity: 0 });
  const bgInner = $('.spread__bg-in', bg0);
  const video = $('video', bgInner);

  // Пока идут главы, альбом спрятан; следующие развороты ждут своего перелистывания
  gsap.set([s1, s2], { visibility: 'hidden' });
  tl.set(root, { visibility: 'visible' }, ZOOM.at);

  /* Фото главы 3 растёт до размеров экрана и становится видео с велосипедистом.
     Видео сразу встаёт ровно в рамку фото (то же кадрирование и зеркало) и проявляется поверх,
     затем рамка расширяется на весь экран — как раскрытие картины в Getty Tracing Art. */
  const z = ZOOM.at;
  const zoom = { p: 0 };
  video.style.objectFit = 'fill';
  bg0.style.transformOrigin = bgInner.style.transformOrigin = '0 0';
  function renderZoom() {
    const r = metrics.media[2], p = zoom.p;
    const w = r.width + (viewport.w - r.width) * p;
    const h = r.height + (viewport.h - r.height) * p;
    bg0.style.transform = `translate3d(${r.left * (1 - p)}px, ${r.top * (1 - p)}px, 0) scale(${w / viewport.w}, ${h / viewport.h})`;
    bgInner.style.transform = coverTransform(w, h, viewport.w, viewport.h, video.videoWidth || 1920, video.videoHeight || 1080, 1.04);
  }
  tl.fromTo(zoom, { p: 0 }, { p: 1, duration: ZOOM.d, ease: 'power2.inOut', onUpdate: renderZoom }, z)
    .to(bg0, { opacity: 1, duration: 0.15 }, z)
    .fromTo($('.spread__veil', s0), { opacity: 0 }, { opacity: 1, duration: ZOOM.d, ease: 'power1.inOut' }, z + 0.2)
    .set(photo3, { visibility: 'hidden' }, z + 0.35)
    // Всё вокруг фото расступается
    .to([$('.slide__title', slide3), ...$$('.tag', slide3)], { opacity: 0, y: () => 40 * su(), duration: 0.4, ease: 'power1.in' }, z)
    .to('.canvas', { opacity: 0, duration: 0.8, ease: 'power1.in' }, z)
    .to('.progress', { opacity: 0, duration: 0.3 }, z)
    // Хедер и плашка становятся светлыми, как в макете разворотов
    .to(logo, { backgroundColor: '#fff', duration: 0.5 }, z + 0.6)
    .to('.btn--dark', { backgroundColor: '#fff', color: '#422f2c', duration: 0.5 }, z + 0.6)
    .to('.btn-burger', { backgroundColor: 'rgba(255, 255, 255, 0.12)', duration: 0.5 }, z + 0.6)
    .to('.btn-burger span', { backgroundColor: '#fff', duration: 0.5 }, z + 0.6)
    .to('.side-widget:not(.side-widget--light)', { opacity: 0, duration: 0.5 }, z + 0.6)
    .to('.side-widget--light', { opacity: 1, duration: 0.5 }, z + 0.6);
  renderZoom();
  ScrollTrigger.addEventListener('refresh', renderZoom);

  // First spread: writing, then copy, photos and sticker arrive in a quiet sequence.
  // The following two spreads retain their original presentation.
  const c0 = $('.spread__content', s0);
  spreadIntro = gsap.timeline({ paused: true })
    .fromTo($$('.sp-line', c0), { opacity: 0, y: () => 18 * su() },
      { opacity: 1, y: 0, duration: 1, stagger: 0.12, ease: 'power2.out' }, 0.65)
    .fromTo($$('.sp-lead, .sp-list li', c0), { opacity: 0, y: () => 12 * su() },
      { opacity: 1, y: 0, duration: 0.85, stagger: 0.12, ease: 'power2.out' }, 0.95)
    .fromTo($('[data-role="main"]', c0), { opacity: 0, y: () => 32 * su() },
      { opacity: 1, y: 0, duration: 1.15, ease: 'power2.out' }, 0.65)
    .fromTo($('[data-role="second"]', c0), { opacity: 0, y: () => 26 * su(), rotation: 2 },
      { opacity: 1, y: 0, rotation: 0, duration: 1.1, ease: 'power2.out' }, 0.95)
    .fromTo($('[data-role="sticker"]', c0), { opacity: 0, y: () => 22 * su(), rotation: -2 },
      { opacity: 1, y: 0, rotation: 0, duration: 1.1, ease: 'power2.out' }, 1.2)
    .fromTo($('.sp-count', c0), { opacity: 0 }, { opacity: 1, duration: 0.8 }, 0.85);
  if (reduceMotion) spreadIntro.timeScale(4);

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

/* ---------------- Time-based scenes after the album ---------------- */
// Scroll selects a scene once. The transition always finishes on its own, even if scrolling stops.
// Each change cancels the previous transition; jumping or reversing cannot leave a half-open book.
function buildPostScenes() {
  const bookRoot = $('#book'), happy = $('#happy');
  const s3 = book.spreads[2];
  const { el: closer, shades: [front, back], cast } = book.closer;
  const widgets = $$('.side-widget');
  const happyPhoto = $('.happy__photo img', happy);
  let current = 'album', transition = null, bookVisible = false;
  let returningToChapters = false;

  const lines = $$('.happy__title .line__in', happy);
  happyIntro = gsap.timeline({ paused: true })
    .fromTo($('.happy__cap', happy),
      { clipPath: 'inset(-30% 130% -30% -40%)' },
      { clipPath: 'inset(-30% -40% -30% -40%)', duration: 1.5, ease: 'sine.inOut' }, 0)
    .fromTo(lines, { yPercent: 110 },
      { yPercent: 0, duration: 1.25, stagger: 0.14, ease: 'power2.out' }, 0.4)
    .fromTo($('.happy__text', happy), { opacity: 0, y: () => 16 * su() },
      { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, 0.8);
  if (reduceMotion) happyIntro.timeScale(4);

  function header(tl, theme, at = 0) {
    const navy = theme === 'infra';
    const paper = theme === 'benefits';
    const ink = paper ? '#422f2c' : navy ? '#2f4765' : '#ffffff';
    tl.to(logo, { backgroundColor: ink, duration: 0.45 }, at)
      .to('.btn--dark', { backgroundColor: paper ? '#ffffff' : ink, color: navy ? '#ffffff' : '#422f2c', duration: 0.45 }, at)
      .to('.btn-burger', { backgroundColor: navy ? '#bbcfe2' : theme === 'happy' ? 'rgba(47,71,101,0.35)' : 'rgba(255,255,255,0.12)', boxShadow: theme === 'plan' ? 'inset 0 0 0 1px #a7a7a7' : 'inset 0 0 0 1px rgba(167,167,167,0)', duration: 0.45 }, at)
      .to('.btn-burger span', { backgroundColor: paper ? '#ffffff' : ink, duration: 0.45 }, at)
      .to(widgets, { opacity: 0, duration: 0.35 }, at)
      .to(theme === 'benefits' ? '.side-widget--benefits' : theme === 'infra' ? '.side-widget--map' : theme === 'plan' || theme === 'happy' ? '.side-widget--plan' : '.side-widget--light', { opacity: 1, duration: 0.35 }, at);
  }

  function paperHeader(t) {
    gsap.set(logo, { backgroundColor: '#422f2c' });
    gsap.set('.btn--dark', { backgroundColor: '#422f2c', color: '#ffffff' });
    gsap.set('.btn-burger', { backgroundColor: t > 0.1 ? '#f0e2d5' : '#ffffff', boxShadow: 'none' });
    gsap.set('.btn-burger span', { backgroundColor: '#422f2c' });
    gsap.set(widgets, { opacity: 0 });
    gsap.set('.side-widget:not([class*="side-widget--"])', { opacity: 1 });
  }

  function album(t) {
    bookVisible = false;
    infra.setVisible(false);
    // The backdrop belongs to the late scenes. It must never cover the earlier chapters.
    gsap.set('.backdrop', { visibility: 'hidden' });
    gsap.set([infra.root, plan.root, happy, benefits.root], { autoAlpha: 0 });
    gsap.set([closer, cast], { autoAlpha: 0 });
    gsap.set(s3, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, visibility: t >= FLIPS[1].at ? 'visible' : 'hidden' });
    gsap.set(bookRoot, { scale: 1, x: 0, y: 0, opacity: 1, visibility: t >= ZOOM.at ? 'visible' : 'hidden' });
    returningToChapters = t >= ZOOM.at;
    if (t >= ZOOM.at + 0.6) header(transition, 'album');
    else paperHeader(t);
  }

  function infrastructure(previous) {
    const fromBook = previous === 'album';
    const arrival = fromBook ? 1.05 : 0;
    gsap.set('.backdrop', { visibility: 'visible' });
    gsap.set([plan.root, happy, benefits.root], { autoAlpha: 0 });
    gsap.set(infra.root, { autoAlpha: 0 });
    gsap.set($('.infra__bg', infra.root), { opacity: 1 });
    infra.setVisible(true);
    Object.assign(infra.state, { rx: 0, rz: -40, sc: 1.12, op: 1 });
    infra.touch();
    if (fromBook) {
      bookVisible = true;
      book.freezeCloser();
      gsap.set(bookRoot, { visibility: 'visible', opacity: 1, x: 0, y: 0, scale: 1, transformOrigin: '25% 50%' });
      gsap.set(s3, { clipPath: 'inset(0% 50% 0% 0%)', opacity: 1 });
      transition
        .set(closer, { autoAlpha: 1, rotationY: 0, z: 0 }, 0)
        .set(cast, { autoAlpha: 0 }, 0)
        .to(closer, { rotationY: -180, duration: 0.9, ease: 'power2.inOut' }, 0)
        .fromTo(closer, { z: 0 }, { z: () => 35 * su(), duration: 0.45, repeat: 1, yoyo: true, ease: 'sine.inOut' }, 0)
        .fromTo(front, { opacity: 0 }, { opacity: 0.65, duration: 0.8 }, 0)
        .fromTo(back, { opacity: 0.4 }, { opacity: 0, duration: 0.45 }, 0.45)
        // Once fully shut, the opaque cover replaces the page. No translucent text remains.
        .set(s3, { visibility: 'hidden' }, 0.9)
        .to(bookRoot, { scale: 1, x: () => -viewport.w * 0.85, y: 0, opacity: 0, duration: 0.7, ease: 'power2.in' }, 0.9)
        .set(bookRoot, { visibility: 'hidden' }, 1.6)
        .call(() => { bookVisible = false; book.videos[2].pause(); }, null, 1.6);
    } else {
      bookVisible = false;
      gsap.set(bookRoot, { autoAlpha: 0 });
    }
    transition
      .to(infra.root, { autoAlpha: 1, duration: 0.65, ease: 'power1.out' }, arrival)
      .to(infra.state, { rx: 63, rz: -63, sc: 1, duration: 1.15, ease: 'power2.inOut', onUpdate: infra.touch }, arrival)
      .call(() => infra.setActive(true), null, arrival + 0.7);
    header(transition, 'infra', arrival);
  }

  function genplan() {
    bookVisible = false;
    infra.setVisible(true);
    gsap.set(plan.root, { autoAlpha: 0, x: 0, y: 0, scale: 1, clipPath: 'none' });
    gsap.set(plan.scene, { scale: 1 });
    transition
      .to([bookRoot, happy, infra.root, benefits.root], { autoAlpha: 0, duration: 0.45, ease: 'power1.inOut' }, 0)
      .to(plan.root, { autoAlpha: 1, duration: 0.7, ease: 'power1.inOut' }, 0)
      .call(() => { infra.setVisible(false); plan.setActive(true); }, null, 0.45);
    header(transition, 'plan');
  }

  function happiness() {
    bookVisible = false;
    gsap.set(happy, { autoAlpha: 0 });
    // The roof thumbnail is a standalone photo. The genplan never flies into it.
    transition
      .to([bookRoot, infra.root, plan.root, benefits.root], { autoAlpha: 0, duration: 0.55, ease: 'power1.inOut' }, 0)
      .to(happy, { autoAlpha: 1, duration: 0.75, ease: 'power1.inOut' }, 0)
      .fromTo(happyPhoto, { scale: 1.025 }, { scale: 1, duration: 1.1, ease: 'power2.out' }, 0)
      .call(() => { infra.setVisible(false); happyIntro.restart(); }, null, 0.2);
    header(transition, 'happy');
  }

  function advantages() {
    bookVisible = false;
    gsap.set(benefits.root, { autoAlpha: 0 });
    transition
      .to([bookRoot, infra.root, plan.root, happy], { autoAlpha: 0, duration: 0.5, ease: 'power1.inOut' }, 0)
      .to(benefits.root, { autoAlpha: 1, duration: 0.75, ease: 'power1.inOut' }, 0)
      .call(() => { infra.setVisible(false); benefits.setActive(true); }, null, 0.2);
    header(transition, 'benefits');
  }

  return {
    get bookVisible() { return bookVisible; },
    update(t) {
      const next = t >= BENEFITS.at ? 'benefits' : t >= HAPPY.at ? 'happy' : t >= PLAN.at ? 'plan' : t >= CLOSE.at ? 'infra' : 'album';
      if (next === current) {
        if (next === 'album' && returningToChapters && t < ZOOM.at) {
          // Stop the autonomous white-header tween before returning ownership to the scroll timeline.
          transition?.kill();
          returningToChapters = false;
          paperHeader(t);
          gsap.set(bookRoot, { visibility: 'hidden' });
        }
        return;
      }
      const previous = current;
      current = next;
      transition?.kill();
      infra.setActive(false);
      plan.setActive(false);
      benefits.setActive(false);
      happyIntro.pause(0);
      transition = gsap.timeline();
      if (reduceMotion) transition.timeScale(4);
      if (next === 'album') album(t);
      else if (next === 'infra') infrastructure(previous);
      else if (next === 'plan') genplan();
      else if (next === 'benefits') advantages();
      else happiness();
    },
  };
}

/* ---------------- Живой коллаж: мышь + покачивание ---------------- */
function setupAmbient() {
  book.spreads.forEach((spread, s) => {
    $('.spread__collage > .collage-item', spread).forEach((figure, index) => addAmbient(figure, {
      // Only deliberate cursor movement remains; no sub-30px idle oscillation.
      amp: [32, 42, 35][index % 3], rot: [0.2, 0.45, 0.7][index % 3], duration: [1.4, 0.8, 1.9][index % 3],
      active: () => {
        const t = story.time();
        const start = s === 0 ? ZOOM_END : FLIPS[s - 1].at;
        const end = s === 2 ? CLOSE.at : FLIPS[s].at + FLIPS[s].d;
        return t >= start && t < end;
      },
    }));
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
