// Превращает рукописные фразы в контуры букв шрифта Gogol, чтобы анимировать их «по trim path».
// Раскладка каждой фразы повторяет макет: кегль, интерлиньяж, ширина блока, центровка.
// Run: npm run handwriting  →  src/handwriting.js
import { readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

const buf = readFileSync('public/fonts/Gogol-Regular.otf');
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));

// width: null — строка без переноса (ширина = ширина текста)
const PHRASES = {
  hero: { size: 105.963, lineHeight: 67.817, width: 780.218, lines: ['Основа', 'для вашей', 'истории'] }, // 127:593
  slide1: { size: 56.947, lineHeight: 31.143, width: 317.519, lines: ['Помнишь,', 'как искали', 'наши окна'] }, // 127:326
  slide2: { size: 64, lineHeight: 44.832, width: null, lines: ['Уснули'] }, // 127:713
  slide3: { size: 66.619, lineHeight: 46.667, width: 303.634, lines: ['Первая', 'прогулка', ''] }, // 127:959
};

const { ascender, descender } = font.tables.hhea;

function layout({ size, lineHeight, width, lines }) {
  const scale = size / font.unitsPerEm;
  // Базовая линия так же, как в CSS-строке: полуинтерлиньяж + асцендер (hhea)
  const baselineOffset = (lineHeight - (ascender - descender) * scale) / 2 + ascender * scale;
  const advances = lines.map((t) => font.getAdvanceWidth(t, size, { kerning: true }));
  const boxWidth = width ?? Math.max(...advances);
  const glyphs = [];
  lines.forEach((text, line) => {
    const x = (boxWidth - advances[line]) / 2;
    const y = line * lineHeight + baselineOffset;
    font.getPaths(text, x, y, size, { kerning: true }).forEach((path) => {
      const d = path.toPathData(2);
      if (d) glyphs.push({ line, d });
    });
  });
  return { width: +boxWidth.toFixed(3), height: +(lineHeight * lines.length).toFixed(3), glyphs };
}

const data = Object.fromEntries(Object.entries(PHRASES).map(([k, v]) => [k, layout(v)]));
writeFileSync(
  'src/handwriting.js',
  `// Сгенерировано scripts/build-handwriting.mjs — не редактировать вручную.\nexport const SCRIPTS = ${JSON.stringify(data)};\n`,
);
for (const [k, v] of Object.entries(data)) console.log(`${k}: ${v.glyphs.length} glyphs, ${v.width}×${v.height}`);
