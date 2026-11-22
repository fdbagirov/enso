// A fixed-size mask is scaled by the parent; invert that scale to preserve cover cropping.
export function coverFrame(w, h, baseW, baseH, sourceW, sourceH, overscan = 1) {
  const k = Math.max(w / sourceW, h / sourceH) * overscan;
  return {
    x: (w - sourceW * k) / 2 * baseW / w,
    y: (h - sourceH * k) / 2 * baseH / h,
    scaleX: sourceW * k / w,
    scaleY: sourceH * k / h,
  };
}

export function coverTransform(...args) {
  const { x, y, scaleX, scaleY } = coverFrame(...args);
  return `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`;
}
