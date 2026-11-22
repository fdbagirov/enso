# ЭНСО — первый блок сайта

Прелоадер → Hero → три главы скролл-истории. Vite + GSAP (Flip, ScrollTrigger) + Lenis, без фреймворка.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Где что

- `index.html` — разметка экранов.
- `src/style.css` — стили; размеры заданы в пикселях макета 1440×900 через `--u`.
- `src/cards.js` — фоновые карточки: позиции в Hero (`127:224`) и в главах (`127:278`), слои картинок.
- `src/main.js` — прелоадер (стопка → сетка через Flip), выход логотипа в хедер, скролл-таймлайн глав.
- `scripts/optimize-images.mjs` — пересобирает `public/img/*.webp` из исходников Figma в `assets-src/` (в git не попадают).

Макеты: Figma «ЭНСО», страница «Дизайн», фреймы `v2 · 01 Хиро`, `v2 · 02 Глава 2–4`.

## Шрифты

`public/fonts/OpiumNew-Regular.otf` и `Gogol-Regular.otf` скопированы из системных шрифтов. Перед публикацией сайта
проверьте, что лицензия разрешает веб-встраивание; Golos Text подключён из `@fontsource` (OFL).
