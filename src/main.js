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
const sx = () => innerWidth / 1440;
const sy = () => innerHeight / 900;
const su = () => Math.min(sx(), sy());

/* ---------------- Lenis ---------------- */
const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
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
const STORY_LENGTH = 23.8; // вместе с высотой .story в style.css (2840vh)
// Альбом закрывается: левая страница разворота 03 со всем содержимым ложится через корешок на правую,
// показывая тёмную обложку; позади уже голубой фон карты. Закрытый альбом уходит, из фона проступает
// карта района — сначала сверху, потом ложится в перспективу. Содержимое блока появляется само, по времени.
const CLOSE = { at: 14.4, d: 1.4 };
const MAP = { goneAt: CLOSE.at + CLOSE.d + 0.15, tiltAt: 16.4, tilt: 1.6 };
const MAP_SETTLED = MAP.tiltAt + MAP.tilt;
const PLAN = { at: 19.1, d: 1.6 }; // карта района → генплан
const PLAN_SETTLED = PLAN.at + PLAN.d;
const HAPPY = { at: 21.3, d: 1.8 }; // генплан уменьшается в кадр крыши блока «Счастье в каждом кадре»
const HAPPY_SETTLED = HAPPY.at + HAPPY.d;
let happyIntro; // заголовок и текст блока — по времени, не по скроллу
let happyShown = false;
let closing = false;
const ZOOM = { at: 6.6, d: 1.3 }; // фото главы 3 → видео на весь экран (как в Getty)
const ZOOM_END = ZOOM.at + ZOOM.d; // отсюда видео играет, а разворот 01 проявляется сам
let spreadIntro; // появление разворота 01 — по времени, не по скроллу
let introShown = false;
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
const lazy = (fn, keys = ['left', 'top', 'width', 'height', 'opacity', 'filter', 'borderColor']) =>
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
function makeDraw(paths, { total = 1.7, lineStrokes = [] } = {}) {
  const inner = gsap.timeline({ paused: true });
  let t = 0;
  paths.forEach((p) => {
    const d = Math.max(0.12, Number(p.dataset.len) / 900);
    inner
      .to(p, { strokeDashoffset: 0, duration: d, ease: 'none' }, t)
      .to(p, { fillOpacity: 1, duration: d * 0.9, ease: 'power1.in' }, t + d * 0.45);
    t += d * 0.62;
  });
  inner.to(paths, { strokeOpacity: 0, duration: 0.4 }, '>-0.1');
  lineStrokes.forEach((p) => {
    inner.to(p, { strokeDashoffset: 0, duration: Number(p.dataset.len) / 160, ease: 'power1.inOut' }, '>-0.35');
  });
  return gsap.to(inner, { progress: 1, duration: total, ease: 'power1.inOut', paused: true });
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
  .to(logo, { y: 0, scale: 1, duration: 1.6, ease: 'expo.inOut' }, 0.05)
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
const book = buildBook($('#book'));
const infra = buildInfra($('#infra'));
const plan = buildPlan($('#genplan'));
const story = buildStory();
setupAmbient();
if (import.meta.env.DEV) Object.assign(window, { __story: story, __book: book });

$('.scroll-btn').addEventListener('click', () => {
  const st = story.scrollTrigger;
  lenis.scrollTo(st.start + (st.end - st.start) * ((CHAPTERS[0].enter + 1) / STORY_LENGTH), { duration: 1.8 });
});

/* ---------------- Скролл-повествование ---------------- */
// Фон как в Getty: фото по бокам непрерывно текут вверх, ушедшие за верх возвращаются снизу.
// «Барабан»: у середины экрана фото ближе и крупнее, к краям уходят вглубь и к краю экрана.
function updateFlow(time) {
  const vw = innerWidth;
  const strength = gsap.utils.clamp(0, 1, time); // 0 — ровно макет Hero, 1 — режим глав
  const min = -WRAP_PAD * su();
  const loop = laneLoop();
  cards.forEach((c) => {
    const top = gsap.getProperty(c.el, 'top');
    const left = gsap.getProperty(c.el, 'left');
    const w = gsap.getProperty(c.el, 'width');
    const h = gsap.getProperty(c.el, 'height');
    const flow = time * FLOW_PER_UNIT * su() * LANES[c.lane].speed;
    const screenTop = gsap.utils.wrap(min, min + loop, top - flow);
    // Кольцо вокруг центра, как в Getty: на середине высоты фото дальше всего от центра,
    // к верху и низу дорожки стягиваются к центру по дуге окружности
    const v = gsap.utils.clamp(-1, 1, ((screenTop + h / 2) / innerHeight - 0.5) * 2);
    const arc = 1 - Math.sqrt(1 - v * v); // 0 на середине, 1 у верхнего и нижнего края
    const side = left + w / 2 < vw / 2 ? 1 : -1; // направление к центру экрана
    gsap.set(c.par, { y: screenTop - top });
    gsap.set(c.el, {
      x: side * strength * RING_PULL * su() * arc,
      scale: 1 - strength * 0.05 * arc,
    });
  });
}
// Видео разворота играет только пока его видно (или пока его страница переворачивается).
// Видео с велосипедистом стоит на первом кадре (тот же кадр, что фото главы 3), пока фото
// раскрывается, и запускается, только когда мы уже на развороте «Знакомые места».
function updateBook(t) {
  const [f1, f2] = FLIPS;
  const want = [
    t >= ZOOM_END && t < f1.at + f1.d,
    t > f1.at - 0.4 && t < f2.at + f2.d,
    t > f2.at - 0.4 && t < MAP.goneAt + 0.6,
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
  // Страница начинает закрываться — на её копию кладём текущий кадр видео
  const isClosing = t >= CLOSE.at && t <= CLOSE.at + CLOSE.d;
  if (isClosing && !closing) book.freezeCloser();
  closing = isClosing;
  infra.setActive(t >= MAP_SETTLED - 0.1 && t < PLAN.at);
  plan.setActive(t >= PLAN_SETTLED - 0.1 && t < HAPPY.at);
  const happy = t >= HAPPY_SETTLED - 0.3;
  if (happy !== happyShown) {
    happyShown = happy;
    if (happy) happyIntro.play();
    else happyIntro.reverse();
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
      end: 'bottom bottom',
      scrub: 0.6,
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
    .to(logo, { x: () => -(header.clientWidth / 2 - 75.5 - 24), duration: 0.8, ease: 'power2.inOut' }, 0.05)
    // Непрозрачный эквивалент rgba(67,33,0,.07) на фоне #fdf1e5 — чтобы карточки не просвечивали под кнопкой
    .to('.btn-burger', { backgroundColor: '#f0e2d5', duration: 0.6 }, 0.1)
    .to('.progress', { opacity: 1, duration: 0.3 }, 0.7)
    .to('.progress__done', { width: () => 109 * su(), duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[1].enter)
    .to('.progress__done', { width: () => 176 * su(), duration: 0.7, ease: 'power1.inOut' }, CHAPTERS[2].enter);

  const medias = [];
  $$('.slide').forEach((slide, i) => {
    const { enter, exit } = CHAPTERS[i];
    const media = $('.slide__media', slide);
    const image = $('.slide__img', slide);
    const title = $('.slide__title', slide);
    const tags = $$('.tag', slide);
    const glyphs = drawn[`slide${i + 1}`];
    const heart = $$('.slide__heart-in path', slide);
    const draw = makeDraw(glyphs, { total: 1.3, lineStrokes: heart });
    // Фото третьей главы — первый кадр видео; оно останавливается на том же масштабе 1.04,
    // что и видео разворота, чтобы при раскрытии на весь экран кадр не прыгал
    const rest = slide.classList.contains('slide--3') ? 1.04 : 1;
    gsap.set(image, { rotation: 0, scale: rest });
    medias.push(media);

    // Фото выезжает снизу, как при обычной прокрутке, и встаёт в центр
    tl.fromTo(media, { y: () => innerHeight - media.offsetTop + 40 * su() }, { y: 0, duration: 0.8, ease: 'power2.out' }, enter)
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
      tl.to([media, $('.slide__text', slide)], { y: () => -(innerHeight + 40 * su()), duration: 0.8, ease: 'power1.in' }, exit);
    }
  });

  // До запуска истории фото глав спрятаны CSS-ом; теперь они стоят за нижним краем
  gsap.set(medias, { opacity: 1 });
  buildAlbum(tl);
  buildMapTransition(tl);
  buildPlanTransition(tl);
  buildHappyTransition(tl);
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
  const stageW = () => root.clientWidth;
  const stageH = () => root.clientHeight;

  // Пока идут главы, альбом спрятан; следующие развороты ждут своего перелистывания
  gsap.set([s1, s2], { visibility: 'hidden' });
  tl.set(root, { visibility: 'visible' }, ZOOM.at);

  /* Фото главы 3 растёт до размеров экрана и становится видео с велосипедистом.
     Видео сразу встаёт ровно в рамку фото (то же кадрирование и зеркало) и проявляется поверх,
     затем рамка расширяется на весь экран — как раскрытие картины в Getty Tracing Art. */
  const z = ZOOM.at;
  const photoRect = (k) => () => {
    const r = { left: photo3.offsetLeft, top: photo3.offsetTop, width: photo3.offsetWidth, height: photo3.offsetHeight };
    return r[k];
  };
  tl.fromTo(
    bg0,
    { left: photoRect('left'), top: photoRect('top'), width: photoRect('width'), height: photoRect('height'), opacity: 0 },
    { left: 0, top: 0, width: stageW, height: stageH, duration: ZOOM.d, ease: 'expo.inOut' },
    z,
  )
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

/* ---------------- Переход: альбом → карта района ---------------- */
function buildMapTransition(tl) {
  const s3 = book.spreads[2];
  const { el: closer, shades: [front, back], cast } = book.closer;
  const c = CLOSE.at;
  const map = infra.state;

  // Позади альбома — голубой фон следующего блока
  tl.set('.backdrop', { visibility: 'visible' }, c)
    // Правая страница (вместе с видео, текстами и коллажем) отрывается от разворота…
    .set(closer, { visibility: 'visible' }, c)
    .set(s3, { clipPath: 'inset(0% 50% 0% 0%)' }, c)
    // …и, как при листании, ложится через корешок налево: видим тёмную обложку альбома
    .fromTo(closer, { rotationY: 0 }, { rotationY: -180, duration: CLOSE.d, ease: 'power2.inOut' }, c)
    .fromTo(closer, { z: 0 }, { z: () => 60 * su(), duration: CLOSE.d / 2, ease: 'sine.out', yoyo: true, repeat: 1 }, c)
    .fromTo(front, { opacity: 0 }, { opacity: 0.85, duration: CLOSE.d / 2, ease: 'power1.in' }, c)
    .fromTo(back, { opacity: 0.6 }, { opacity: 0, duration: CLOSE.d / 2, ease: 'power1.out' }, c + CLOSE.d / 2)
    // Тень закрывающейся страницы на левой странице сгущается к концу
    .fromTo(cast, { opacity: 0 }, { opacity: 1, duration: CLOSE.d * 0.9, ease: 'power2.in' }, c + CLOSE.d * 0.1)
    // Закрытый альбом уходит: чуть отдаляется и тает
    .to([s3, closer], { opacity: 0, duration: 0.6, ease: 'power1.in' }, MAP.goneAt)
    .to(cast, { opacity: 0, duration: 0.3 }, MAP.goneAt)
    .fromTo($('#book'), { scale: 1 }, { scale: 0.94, duration: 0.6, ease: 'power1.in' }, MAP.goneAt)
    // Растаявший альбом больше не рисуем: под картой он невидим, но браузер продолжал бы его отрисовывать
    .set($('#book'), { visibility: 'hidden' }, MAP.goneAt + 0.65)
    // Блок карты: фон того же цвета, карта проступает сверху и ложится в перспективу
    .set(infra.root, { visibility: 'visible' }, MAP.tiltAt)
    .set($('.infra__bg', infra.root), { opacity: 1 }, MAP.tiltAt)
    .fromTo(map, { op: 0 }, { op: 1, duration: 0.6, ease: 'power1.out', onUpdate: infra.touch }, MAP.tiltAt)
    .fromTo(map, { rx: 0, rz: -40, sc: 1.35 }, { rx: 63, rz: -63, sc: 1, duration: MAP.tilt, ease: 'power2.inOut', onUpdate: infra.touch }, MAP.tiltAt)
    // Хедер снова тёмный, плашка — голубая, как в макете блока
    .to(logo, { backgroundColor: '#2f4765', duration: 0.5 }, MAP.goneAt)
    .to('.btn--dark', { backgroundColor: '#2f4765', color: '#ffffff', duration: 0.5 }, MAP.goneAt)
    .to('.btn-burger', { backgroundColor: '#bbcfe2', duration: 0.5 }, MAP.goneAt)
    .to('.btn-burger span', { backgroundColor: '#2f4765', duration: 0.5 }, MAP.goneAt)
    .to('.side-widget--light', { opacity: 0, duration: 0.5 }, MAP.goneAt)
    .to('.side-widget--map', { opacity: 1, duration: 0.5 }, MAP.goneAt);
}

/* ---------------- Переход: карта района → генплан ---------------- */
// Карта «ныряет» к комплексу (окно карты растёт вокруг метки ЭНСО и тает), а рендер генплана
// проступает поверх из лёгкого зума — будто камера опустилась к кварталу.
function buildPlanTransition(tl) {
  const p = PLAN.at;
  const map = infra.state;
  tl.to(map, { sc: 2.4, duration: PLAN.d, ease: 'power2.in', onUpdate: infra.touch }, p)
    .to($$('.infra__text, .infra__marks', infra.root), { opacity: 0, duration: 0.5, ease: 'power1.in' }, p)
    .set(plan.root, { visibility: 'visible' }, p + 0.35)
    .fromTo(plan.root, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power1.inOut' }, p + 0.35)
    .fromTo(plan.scene, { scale: 1.18 }, { scale: 1, duration: PLAN.d - 0.35, ease: 'power2.out' }, p + 0.35)
    // Хедер — белый логотип и стеклянный бургер поверх рендера, плашка справа тоже стеклянная
    .to(logo, { backgroundColor: '#ffffff', duration: 0.5 }, p + 0.6)
    .to('.btn-burger', { backgroundColor: 'rgba(255, 255, 255, 0.1)', boxShadow: 'inset 0 0 0 1px #a7a7a7', duration: 0.5 }, p + 0.6)
    .to('.btn-burger span', { backgroundColor: '#ffffff', duration: 0.5 }, p + 0.6)
    .to('.side-widget--map', { opacity: 0, duration: 0.5 }, p + 0.6)
    .to('.side-widget--plan', { opacity: 1, duration: 0.5 }, p + 0.6)
    // Генплан закрыл экран целиком — 3D-карту под ним не рисуем
    .set(infra.root, { visibility: 'hidden' }, PLAN_SETTLED);
}

/* ---------------- Переход: генплан → «Счастье в каждом кадре» ---------------- */
// Генплан — вид сверху — уменьшается ровно в рамку кадра крыши-сада (тоже вид сверху) и в ней
// сменяется этим кадром; позади проступает полноэкранное фото. Заголовок и текст — сами, по времени.
function buildHappyTransition(tl) {
  const p = HAPPY.at;
  const root = $('#happy');
  const thumb = $('.happy__thumb', root);
  const photo = $('.happy__photo img', root);
  // Куда встаёт экран генплана: масштаб «cover» в рамку, лишнее срезается clip-path
  const fitBox = () => {
    const W = root.clientWidth;
    const H = root.clientHeight;
    const w = thumb.offsetWidth;
    const h = thumb.offsetHeight;
    const k = Math.max(w / W, h / H);
    const cx = (W - w / k) / 2;
    const cy = (H - h / k) / 2;
    return { k, cx, cy, x: thumb.offsetLeft - cx * k, y: thumb.offsetTop - cy * k };
  };
  const box = (key) => () => fitBox()[key];

  gsap.set(plan.root, { transformOrigin: '0 0' });
  tl.set(root, { visibility: 'visible' }, p)
    .set(infra.root, { visibility: 'hidden' }, p)
    .to('.plan__shade', { opacity: 0, duration: 0.4 }, p)
    .fromTo(
      plan.root,
      { x: 0, y: 0, scale: 1, clipPath: 'inset(0px 0px 0px 0px)' },
      {
        x: box('x'),
        y: box('y'),
        scale: box('k'),
        clipPath: () => { const b = fitBox(); return `inset(${b.cy}px ${b.cx}px ${b.cy}px ${b.cx}px)`; },
        duration: 1.4,
        ease: 'power3.inOut',
      },
      p,
    )
    // В рамке генплан сменяется кадром крыши, который лежит ровно под ним
    .to(plan.root, { opacity: 0, duration: 0.35, ease: 'power1.inOut' }, p + 1.25)
    .fromTo(photo, { scale: 1.12 }, { scale: 1, duration: HAPPY.d, ease: 'power2.out' }, p)
    // Хедер: белая кнопка заявки и светлое стекло бургера, как в макете
    .to('.btn--dark', { backgroundColor: '#ffffff', color: '#422f2c', duration: 0.5 }, p + 0.6)
    .to('.btn-burger', { backgroundColor: 'rgba(255, 255, 255, 0.12)', boxShadow: 'inset 0 0 0 1px rgba(167, 167, 167, 0)', duration: 0.5 }, p + 0.6);

  // Появление по времени: строки заголовка поднимаются из-под маски, буква «С» прописывается слева направо
  const lines = $$('.happy__title .line__in', root);
  const cap = $('.happy__cap', root);
  const text = $('.happy__text', root);
  happyIntro = gsap.timeline({ paused: true })
    // Росчерк «С» выходит за бокс глифа — маска шире бокса
    .fromTo(cap, { clipPath: 'inset(-30% 130% -30% -40%)' }, { clipPath: 'inset(-30% -40% -30% -40%)', duration: 0.9, ease: 'power2.inOut' }, 0)
    .fromTo(lines, { yPercent: 110 }, { yPercent: 0, duration: 1, stagger: 0.1, ease: 'expo.out' }, 0.25)
    .fromTo(text, { opacity: 0, y: () => 16 * su() }, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 0.55);
  if (reduceMotion) happyIntro.timeScale(4);
  happyIntro.progress(0).pause();
}

/* ---------------- Живой коллаж: мышь + покачивание ---------------- */
function setupAmbient() {
  // Фон истории: чем непрозрачнее (ближе) карточка, тем сильнее она реагирует
  cards.forEach((c, i) => {
    const o = (c.data.story ?? c.data.hero)?.o ?? 1;
    addAmbient(c.el, {
      amp: 6 + 16 * o,
      rot: 0.3 + 0.7 * o,
      idle: { y: 3 + 2 * o, r: 0.5, duration: 4.5 + (i % 4) * 0.5, phase: (i * 0.37) % 1 },
    });
  });
  // Фото глав — на среднем плане; тексты неподвижны ради читаемости
  $$('.slide__media').forEach((m, i) => addAmbient(m, { amp: 10, rot: 0.35, idle: { y: 3, r: 0.25, duration: 5.5, phase: i * 0.3 } }));

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
