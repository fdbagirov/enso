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
  const ids = buildings.map((b) => b.dataset.building);

  const resize = (w, h) => {
    frame.style.setProperty('--s', Math.max(w / 1440, h / 900));
    if (current) place(current);
  };

  let current = null;
  let hideTimer = 0;
  let active = false;

  function place(id) {
    const card = cards[ids.indexOf(id)];
    const r = buildings[ids.indexOf(id)].getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    // Справа от корпуса, если помещается, иначе слева; по высоте — по центру экрана, как в макете
    let x = r.right - OVERLAP;
    if (x + w > innerWidth - EDGE) x = r.left + OVERLAP - w;
    x = gsap.utils.clamp(EDGE, Math.max(EDGE, innerWidth - EDGE - w), x);
    const y = gsap.utils.clamp(80, Math.max(80, innerHeight - 104 - h), innerHeight / 2 - h / 2);
    card.style.translate = `${x}px ${y}px 0px`;
    card.dataset.side = x < r.left ? 'left' : 'right';
  }

  function show(id) {
    clearTimeout(hideTimer);
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
      b.addEventListener('mouseenter', () => active && show(id));
      b.addEventListener('mouseleave', hideSoon);
    }
    b.addEventListener('click', () => active && show(current === id && !canHover ? null : id));
  });
  keys.forEach((k) => {
    const id = k.dataset.building;
    k.addEventListener('click', () => show(current === id ? null : id));
    if (canHover) {
      k.addEventListener('mouseenter', () => show(id));
      k.addEventListener('mouseleave', hideSoon);
    }
  });
  cards.forEach((c) => {
    c.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    if (canHover) c.addEventListener('mouseleave', hideSoon);
  });
  // Касание мимо корпуса, ключа и карточки закрывает карточку
  scene.addEventListener('click', (e) => {
    if (!e.target.closest('.bld, .plan__key')) show(null);
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
    resize,
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
