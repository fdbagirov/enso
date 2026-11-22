import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverFrame, coverTransform } from '../src/scroll-math.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected);
for (const [w, h, baseW, baseH, sourceW, sourceH] of [
  [100.125, 240.75, 100, 100, 1920, 1080],
  [1440, 900, 630, 402, 1280, 720],
  [93.793, 114.636, 172.174, 210.435, 900, 1600],
  [385.5, 800.25, 1440, 900, 2560, 1978],
]) {
  test('cover preserves source aspect and center at ' + w + 'x' + h, () => {
    const f = coverFrame(w, h, baseW, baseH, sourceW, sourceH);
    const physicalW = baseW * f.scaleX * w / baseW;
    const physicalH = baseH * f.scaleY * h / baseH;
    near(physicalW / physicalH, sourceW / sourceH);
    assert.ok(physicalW >= w - 1e-8 && physicalH >= h - 1e-8);
    near(f.x * w / baseW + physicalW / 2, w / 2);
    near(f.y * h / baseH + physicalH / 2, h / 2);
  });
}
test('subpixel changes are retained rather than snapped to pixels', () => {
  const a = coverTransform(100.01, 200, 100, 100, 1920, 1080);
  const b = coverTransform(100.02, 200, 100, 100, 1920, 1080);
  assert.notEqual(a, b);
  assert.ok(a.startsWith('translate3d('));
});
test('overscan adds 4 percent without shifting the image center', () => {
  const normal = coverFrame(630, 402, 1440, 900, 1280, 720);
  const overscan = coverFrame(630, 402, 1440, 900, 1280, 720, 1.04);
  near(overscan.scaleX / normal.scaleX, 1.04);
  near(overscan.scaleY / normal.scaleY, 1.04);
  near(overscan.x * 630 / 1440 + 630 * overscan.scaleX / 2, 315);
});
