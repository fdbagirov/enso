import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const advantages = document.querySelector('.advantages');
const choices = [...advantages.querySelectorAll('button[aria-controls]')];
const visuals = [...advantages.querySelectorAll('.advantages__visual')];

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let selected = -1;

// Use the original SVG artwork inline so its stroke can be drawn, as in infra.
const ovals = await Promise.all(choices.map(async button => {
  const image = button.querySelector('.advantages__oval');
  if (!image) return [];
  const response = await fetch(image.src);
  if (!response.ok) return [];
  const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  const svg = document.importNode(parsed.documentElement, true);
  svg.removeAttribute('id');
  svg.classList.add('advantages__oval');
  svg.setAttribute('aria-hidden', 'true');
  image.replaceWith(svg);
  const paths = [...svg.querySelectorAll('path')];
  paths.forEach(path => {
    const length = path.getTotalLength();
    path.dataset.len = length;
    gsap.set(path, { opacity: 0, strokeDasharray: `${length} ${length}`, strokeDashoffset: length });
  });
  return paths;
}));

function select(index) {
  if (index === selected) return;
  const previous = selected;
  selected = index;
  if (previous >= 0) gsap.to(ovals[previous], { opacity: 0, duration: reduce ? 0 : .3, overwrite: true });
  if (index >= 0) gsap.fromTo(ovals[index], {
    opacity: 1, strokeDashoffset: (_, path) => Number(path.dataset.len),
  }, { strokeDashoffset: 0, duration: reduce ? 0 : .9, ease: 'power2.inOut', overwrite: true });
  choices.forEach((button, position) => {
    const active = index === position;
    const detail = document.getElementById(button.getAttribute('aria-controls'));
    button.setAttribute('aria-expanded', String(active));
    detail.hidden = false;
    gsap.to(detail, { height: active ? 'auto' : 0, opacity: active ? 1 : 0,
      duration: reduce ? 0 : 0.35, ease: 'power2.out', overwrite: true });
    visuals[position].classList.toggle('is-active', position === (index < 0 ? 0 : index));
    visuals[position].inert = position !== (index < 0 ? 0 : index);
    visuals[position].setAttribute('aria-hidden', String(position !== (index < 0 ? 0 : index)));
  });
  if (index < 0) return;
  const visual = visuals[index];
  gsap.fromTo(visual.querySelector('.advantages__image'), { scale: reduce ? 1 : 1.04 },
    { scale: 1, duration: 0.9, ease: 'power2.out', overwrite: true });
  gsap.fromTo(visual.querySelector('figcaption'), { opacity: 0, y: reduce ? 0 : 14 },
    { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', overwrite: true });
}
choices.forEach((button, index) => {
  const detail = document.getElementById(button.getAttribute('aria-controls'));
  detail.hidden = false;
  gsap.set(detail, { height: index === selected ? 'auto' : 0, opacity: index === selected ? 1 : 0, overflow: 'hidden' });
  button.setAttribute('aria-expanded', String(index === selected));
  button.addEventListener('focus', () => select(index));
});

const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
choices.forEach((choice, index) => {
  choice.addEventListener('click', () => select(index));
});
if (hover) {
  advantages.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const row = event.target.closest('.advantages__choice');
    const button = row?.querySelector('button[aria-controls]');
    select(button ? choices.indexOf(button) : -1);
  });
  advantages.addEventListener('pointerleave', () => select(-1));
}
advantages.addEventListener('focusout', event => {
  if (!advantages.contains(event.relatedTarget)) select(-1);
});

gsap.registerPlugin(ScrollTrigger);
if (!reduce) {
  gsap.from(advantages.querySelectorAll('.advantages__body > .tag, .advantages__choices > *'), {
    opacity: 0, y: 16, duration: 0.6, stagger: 0.07, ease: 'power3.out',
    scrollTrigger: { trigger: advantages, start: 'top 85%', end: 'top 20%', scrub: true },
  });
}

const apartments = document.querySelector('.apartments');
const gallery = apartments.querySelector('.apartments__gallery');
const cards = [...gallery.querySelectorAll('.apartment')];
const filters = [...apartments.querySelectorAll('[data-filter]')];
const arrows = [...apartments.querySelectorAll('[data-step]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function updateArrows() {
  const max = gallery.scrollWidth - gallery.clientWidth;
  arrows[0].disabled = gallery.scrollLeft <= 1;
  arrows[1].disabled = gallery.scrollLeft >= max - 1;
}

function filterCards(filter) {
  filters.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  cards.forEach((card) => {
    card.hidden = filter !== 'all' && !card.dataset.features.split(' ').includes(filter);
  });
  gallery.scrollTo({ left: 0, behavior: 'instant' });
  updateArrows();
}

filters.forEach((button) => button.addEventListener('click', () => filterCards(button.dataset.filter)));
apartments.querySelectorAll('[data-show-all]').forEach((button) => {
  button.addEventListener('click', () => filterCards('all'));
});
arrows.forEach((button) => {
  button.addEventListener('click', () => gallery.scrollBy({
    left: Number(button.dataset.step) * (() => {
      const visible = cards.filter(card => !card.hidden);
      return visible.length > 1 ? visible[1].offsetLeft - visible[0].offsetLeft : gallery.clientWidth;
    })(),
    behavior: reducedMotion.matches ? 'instant' : 'smooth',
  }));
});
gallery.addEventListener('scroll', updateArrows, { passive: true });
new ResizeObserver(updateArrows).observe(gallery);
updateArrows();
