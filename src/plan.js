// Генплан: 3D-рендер комплекса, контуры корпусов поверх него, метки-ключи и карточка корпуса.
// Сцена .plan__frame — макет 1440×900 в пикселях макета; масштабируется «cover», чтобы рендер
// всегда закрывал экран (--s задаёт этот модуль). Контуры лежат в той же рамке и совпадают со зданиями.
// Интерфейс (нижняя панель, карточка) — в пикселях экрана, как хедер.
// Наведение на корпус: заливка контура проявляется за 180 мс (как Smart Animate в макете 162:47),
// рядом с корпусом появляется его карточка. Ключи и клавиатура выбирают корпус так же.
import gsap from 'gsap';

const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const OVERLAP = 11; // карточка в макете чуть заходит на контур корпуса (179:5856)
const EDGE = 24;
const HIDE_DELAY = 220; // время, чтобы перевести курсор с корпуса на карточку

export function buildPlan(root) {
  const frame = root.querySelector('.plan__frame');
  const scene = root.querySelector('.plan__scene');
  const buildings = [...root.querySelectorAll('.bld')];
  const keys = [...root.querySelectorAll('.plan__key')];
  const cards = [...root.querySelectorAll('.bcard')];
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const hoverGeometry = [
    ['b565d.svg',485.568,242.46,132.624,288.63],
    ['10645.svg',223.488,286.56,276.48,322.65],
    ['3eed7.svg',210,285,420,440],
    ['a995d.svg',590,170,290,640],
    ['38d08.svg',880,35,280,620],
  ];
  const highlights = hoverGeometry.map(([file,x,y,w,h]) => {
    const image = document.createElement('img');
    image.className = 'plan__hover-shape';
    image.src = `/img/plan/hover/${file}`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    Object.assign(image.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    scene.append(image);
    return image;
  });
  function highlight(index) {
    highlights.forEach((image, i) => image.classList.toggle('is-on', i === index));
    keys.forEach(key => key.classList.toggle('is-hovered', Number(key.dataset.highlight) === index));
  }


  // Exact SVG silhouettes supply hit areas, including all three low sections.
  hoverGeometry.forEach(async ([file,x,y,w,h], index) => {
    const response = await fetch(`/img/plan/hover/${file}`);
    if (!response.ok) return;
    const documentSvg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const hit = document.importNode(documentSvg.documentElement, true);
    hit.classList.add('plan__building-hit');
    hit.setAttribute('aria-hidden', 'true');
    Object.assign(hit.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    const id = ['d', 'e', 'c', 'a', 'b'][index];
    const open = () => { if (active) { show(id); highlight(index); } };
    if (canHover) {
      hit.addEventListener('mouseenter', open);
      hit.addEventListener('mouseleave', hideSoon);
    }
    hit.addEventListener('click', open);
    scene.append(hit);
  });

  const fit = () => frame.style.setProperty('--s', Math.max(innerWidth / 1440, innerHeight / 900));
  fit();
  addEventListener('resize', () => {
    fit();
    if (current) place(current);
  });

  let current = null;
  let hideTimer = 0;
  let active = false;
  root.addEventListener('pointermove', () => {
    if (current) place(current);
  }, { passive: true });

  function place(id) {
    const card = cards[ids.indexOf(id)];
    const anchor = buildings.find(building => building.dataset.building === id) || keys.find(key => key.dataset.building === id);
    const r = anchor.getBoundingClientRect();
    const bounds = root.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    // Справа от корпуса, если помещается, иначе слева; по высоте — по центру экрана, как в макете
    let x = r.right - bounds.left - OVERLAP;
    if (x + w > innerWidth - EDGE) x = r.left - bounds.left + OVERLAP - w;
    x = gsap.utils.clamp(EDGE, Math.max(EDGE, innerWidth - EDGE - w), x);
    const y = gsap.utils.clamp(80, Math.max(80, innerHeight - 104 - h), innerHeight / 2 - h / 2);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.dataset.side = x < r.left - bounds.left ? 'left' : 'right';
  }

  function show(id) {
    clearTimeout(hideTimer);
    if (!id) highlight(-1);
    if (id === current) return;
    const prev = current;
    current = id;
    root.classList.toggle('has-building', !!id);
    buildings.forEach((b) => b.classList.toggle('is-on', b.dataset.building === id));
    keys.forEach((k) => k.setAttribute('aria-expanded', k.dataset.building === id));
    if (prev) {
      const old = cards[ids.indexOf(prev)];
      const dx = old.dataset.side === 'left' ? -10 : 10;
      gsap.to(old, { opacity: 0, x: dx, duration: 0.2, ease: 'power2.in', overwrite: true, onComplete: () => (old.hidden = true) });
    }
    if (id) {
      const card = cards[ids.indexOf(id)];
      card.hidden = false;
      place(id);
      const dx = card.dataset.side === 'left' ? -14 : 14;
      gsap.fromTo(card, { opacity: 0, x: reduceMotion ? 0 : dx }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out', overwrite: true });
    }
  }
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => show(null), HIDE_DELAY);
  };

  buildings.forEach((b) => {
    const id = b.dataset.building;
    if (canHover) {
      b.addEventListener('mouseenter', () => { if (active) { show(id); highlight(id === 'a' ? 3 : id === 'b' ? 4 : 2); } });
      b.addEventListener('mouseleave', hideSoon);
    }
    b.addEventListener('click', () => active && show(current === id && !canHover ? null : id));
  });
  keys.forEach((k) => {
    const id = k.dataset.building;
    const open = () => { show(id); highlight(Number(k.dataset.highlight)); };
    k.addEventListener('focus', open);
    k.addEventListener('click', (event) => { if (current === id && !canHover && event.detail) show(null); else open(); });
    if (canHover) {
      k.addEventListener('mouseenter', open);
      k.addEventListener('mouseleave', hideSoon);
    }
  });
  cards.forEach((c) => {
    c.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    if (canHover) c.addEventListener('mouseleave', hideSoon);
  });
  // Касание мимо корпуса, ключа и карточки закрывает карточку
  scene.addEventListener('click', (e) => {
    if (!e.target.closest('.bld, .plan__key, .plan__building-hit')) show(null);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) {
      const key = keys.find((k) => k.dataset.building === current);
      show(null);
      key?.focus();
    }
  });

  /* Появление содержимого: само, по времени, когда сцена встала на место */
  const intro = gsap.timeline({ paused: true });
  intro
    .fromTo(keys, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(2.2)' }, 0)
    .fromTo(root.querySelectorAll('.plan__bar > *'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.07, ease: 'power3.out' }, 0.15);
  if (reduceMotion) intro.timeScale(4);

  return {
    root,
    scene,
    setActive(on) {
      if (on === active) return;
      active = on;
      root.classList.toggle('is-active', on);
      if (on) intro.play();
      else {
        show(null);
        intro.reverse();
      }
    },
  };
}
