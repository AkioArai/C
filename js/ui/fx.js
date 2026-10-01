// Праздничные эффекты: конфетти из точки (задача решена, новый уровень, серия в тренажёре).
export function confetti(x = innerWidth / 2, y = innerHeight / 3, n = 110) {
  if (document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'fx-confetti';
  const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--yellow', '--green', '--blue', '--violet', '--orange'].map(v => css.getPropertyValue(v).trim() || '#c8f05a');
  const ps = Array.from({ length: n }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 5 + Math.random() * 8;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 4 + Math.random() * 5, h: 2 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0] };
  });
  const t0 = performance.now();
  const tick = (t) => {
    const k = (t - t0) / 1700;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - k * k); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (k < 1) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}
