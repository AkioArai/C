// Отрисовка вселенной на canvas: камера, звёздное небо, объекты, лучи.
// Управление: перетаскивание — перемещение, колесо/щипок — масштаб, касание — выбор объекта.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Renderer {
  constructor(canvas, scene, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = scene;
    this.opts = opts;
    this.cam = { x: 380, y: 0, zoom: 0.4 };
    this.target = null;
    this.follow = true;
    this.lastUser = 0;
    this.pointers = new Map();
    this.mouse = null;
    this.hover = null;
    this.makeStars();
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement);
    this.resize();
    this.fitHome(true);
    const loop = (t) => { this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  makeStars() {
    const r = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    this.stars = [0.08, 0.2, 0.42].map((par, li) =>
      Array.from({ length: 170 }, () => ({ x: r() * 2400, y: r() * 2400, s: (0.4 + r() * 1.2) * (li + 1) * 0.55, tw: r() * TAU, par, hue: r() })));
  }

  resize() {
    const p = this.cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(50, p.width);
    this.H = Math.max(50, p.height);
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    this.dpr = dpr;
  }

  // ——— координаты ———
  toScreen(x, y) { return { x: (x - this.cam.x) * this.cam.zoom + this.W / 2, y: (y - this.cam.y) * this.cam.zoom + this.H / 2 }; }
  toWorld(sx, sy) { return { x: (sx - this.W / 2) / this.cam.zoom + this.cam.x, y: (sy - this.H / 2) / this.cam.zoom + this.cam.y }; }

  /** Кадр камеры для области: для main захватываем и компьютер. */
  frameFor(r) {
    let minX = r.x - r.r, maxX = r.x + r.r, minY = r.y - r.r - 50, maxY = r.y + r.r;
    if (r.func === 'main' || r.id === 'global') { minX = Math.min(minX, -170); maxX = Math.max(maxX, 170); minY = Math.min(minY, -170); maxY = Math.max(maxY, 170); }
    const topPad = 150; // место под панель пояснений
    const zoom = clamp(Math.min(this.W / (maxX - minX + 60), (this.H - topPad) / (maxY - minY + 40)), 0.1, 1.1);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 - topPad / 2 / zoom, zoom };
  }

  flyTo(x, y, zoom) { this.target = { x, y, zoom: zoom ?? this.cam.zoom }; }
  fitHome(instant) {
    const regions = [...this.scene.entities.values()].filter(e => e.kind === 'region' && !e.dying);
    let minX = -200, maxX = 200, minY = -200, maxY = 200;
    for (const r of regions) { minX = Math.min(minX, r.x - r.r); maxX = Math.max(maxX, r.x + r.r); minY = Math.min(minY, r.y - r.r); maxY = Math.max(maxY, r.y + r.r); }
    if (!regions.length) { maxX = 1250; minY = -380; maxY = 380; }
    const zoom = clamp(Math.min(this.W / (maxX - minX + 160), this.H / (maxY - minY + 160)), 0.08, 1.4);
    const t = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
    if (instant) Object.assign(this.cam, t); else this.target = t;
  }
  focusEntity(e, zoomIn = true) {
    if (!e) return;
    const z = e.kind === 'region' ? clamp(Math.min(this.W, this.H) / (e.r * 2.3), 0.15, 1.2) : e.kind === 'law' ? 0.9 : Math.max(this.cam.zoom, zoomIn ? 1.0 : this.cam.zoom);
    const x = e.kind === 'law' ? e.x : e.x, y = e.y;
    this.flyTo(x, y, z);
    this.lastUser = performance.now();
  }
  zoomBy(f, sx = this.W / 2, sy = this.H / 2) {
    const before = this.toWorld(sx, sy);
    this.cam.zoom = clamp(this.cam.zoom * f, 0.06, 3.5);
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.target = null;
  }

  // ——— ввод ———
  bindInput() {
    const cv = this.cv;
    cv.style.touchAction = 'none';
    let moved = 0, pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.zoom };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.offsetX, y: e.offsetY };
      const p = this.pointers.get(e.pointerId);
      if (!p) { this.updateHover(); return; }
      const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
      p.x = e.offsetX; p.y = e.offsetY;
      if (this.pointers.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 4) {
          this.cam.x -= dx / this.cam.zoom;
          this.cam.y -= dy / this.cam.zoom;
          this.target = null;
          this.lastUser = performance.now();
        }
      } else if (this.pointers.size === 2 && pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const f = (pinch.z * (d / pinch.d)) / this.cam.zoom;
        this.zoomBy(f, (a.x + b.x) / 2, (a.y + b.y) / 2);
        moved = 100;
        this.lastUser = performance.now();
      }
    });
    const up = (e) => {
      const had = this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinch = null;
      if (had && moved <= 6 && e.type === 'pointerup') {
        const hit = this.hitTest(e.offsetX, e.offsetY);
        this.scene.selected = hit?.id || null;
        this.opts.onSelect?.(hit);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { this.mouse = null; this.hover = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
      this.lastUser = performance.now();
    }, { passive: false });
  }

  updateHover() {
    if (!this.mouse) return;
    const h = this.hitTest(this.mouse.x, this.mouse.y);
    this.hover = h?.id || null;
    this.cv.style.cursor = h ? 'pointer' : 'grab';
  }

  hitTest(sx, sy) {
    const w = this.toWorld(sx, sy);
    const z = this.cam.zoom;
    let best = null, bd = Infinity;
    for (const e of this.scene.entities.values()) {
      if (e.dying) continue;
      let d;
      if (e.kind === 'var') {
        if (e.isArray) {
          const n = Math.min(e.len, 12), cw = 36, x0 = e.x - (n * cw) / 2;
          if (w.x >= x0 - 10 && w.x <= x0 + n * cw + 10 && w.y >= e.y - 34 && w.y <= e.y + 36) d = 0;
        } else d = Math.hypot(w.x - e.x, w.y - e.y) - 34;
      } else if (e.kind === 'const') d = Math.hypot(w.x - e.x, w.y - e.y) - 26;
      else if (e.kind === 'loop' || e.kind === 'branch') d = Math.hypot(w.x - e.x, w.y - e.y) - 22;
      else if (e.kind === 'core') d = Math.hypot(w.x, w.y) - 75;
      else if (e.kind === 'law') d = Math.abs(Math.hypot(w.x, w.y) - e.radius) - 6 / z;
      else if (e.kind === 'region') {
        const dd = Math.hypot(w.x - e.x, w.y - e.y);
        d = dd < e.r ? 30 + dd / 100 : Infinity; // регион — самый «слабый» кандидат
      }
      if (d !== undefined && d < 8 / z && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ——— кадр ———
  frame(t) {
    const sc = this.scene;
    sc.tick(t);
    this.t = t;
    // камера
    if (this.follow && sc.focus && !this.target && t - this.lastUser > 3500 && this.pointers.size === 0) {
      const r = sc.entities.get(sc.focus);
      if (r && r.kind === 'region' && (r !== this.lastFocus || Math.hypot(this.cam.x - r.x, this.cam.y - r.y) > r.r * 1.2)) {
        this.lastFocus = r;
        this.target = this.frameFor(r);
      }
    }
    if (this.target) {
      const k = 0.1;
      this.cam.x += (this.target.x - this.cam.x) * k;
      this.cam.y += (this.target.y - this.cam.y) * k;
      this.cam.zoom += (this.target.zoom - this.cam.zoom) * k;
      if (Math.abs(this.target.x - this.cam.x) < 0.5 && Math.abs(this.target.y - this.cam.y) < 0.5 && Math.abs(this.target.zoom - this.cam.zoom) < 0.001) this.target = null;
    }
    this.draw();
    this.opts.onFrame?.(this);
  }

  draw() {
    const { ctx, W, H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#0b1024');
    g.addColorStop(1, '#03050c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this.drawStars();
    this.drawGrid();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);
    const sc = this.scene;
    const ents = [...sc.entities.values()];
    for (const e of ents) if (e.kind === 'region') this.drawRegion(e);
    for (const e of ents) if (e.kind === 'law') this.drawLaw(e);
    for (const e of ents) if (e.kind === 'const') this.drawConst(e);
    for (const e of ents) if (e.kind === 'loop' || e.kind === 'branch') this.drawStruct(e);
    this.drawCore();
    for (const a of sc.anims) this.drawAnim(a, 'under');
    for (const e of ents) if (e.kind === 'var') this.drawVar(e);
    for (const a of sc.anims) this.drawAnim(a, 'over');
    ctx.restore();
  }

  fadeOf(e) {
    const t = this.t;
    let a = clamp((t - (e.born ?? 0)) / 400, 0, 1);
    if (e.dying) a *= clamp(1 - (t - e.dying) / 900, 0, 1);
    return a;
  }

  drawStars() {
    const { ctx, W, H } = this;
    for (const layer of this.stars) {
      for (const s of layer) {
        const par = s.par;
        let x = (s.x - this.cam.x * par * this.cam.zoom * 2) % 2400; if (x < 0) x += 2400;
        let y = (s.y - this.cam.y * par * this.cam.zoom * 2) % 2400; if (y < 0) y += 2400;
        if (x > W + 4 || y > H + 4) continue;
        const tw = 0.55 + 0.45 * Math.sin(this.t * 0.0012 + s.tw);
        ctx.fillStyle = s.hue > 0.85 ? `rgba(180,160,255,${0.7 * tw})` : s.hue > 0.7 ? `rgba(140,220,255,${0.7 * tw})` : `rgba(230,236,255,${0.65 * tw})`;
        ctx.fillRect(x, y, s.s, s.s);
      }
    }
  }

  drawGrid() {
    const { ctx, W, H } = this;
    const z = this.cam.zoom;
    let step = 100;
    while (step * z < 60) step *= 2;
    while (step * z > 180) step /= 2;
    const tl = this.toWorld(0, 0), br = this.toWorld(W, H);
    ctx.lineWidth = 1;
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = 'rgba(120,150,200,0.35)';
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      const sx = Math.round(this.toScreen(x, 0).x) + 0.5;
      ctx.strokeStyle = x === 0 ? 'rgba(120,170,255,0.18)' : 'rgba(90,120,180,0.06)';
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      ctx.fillText(String(Math.round(x)), sx + 3, H - 6);
    }
    for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
      const sy = Math.round(this.toScreen(0, y).y) + 0.5;
      ctx.strokeStyle = y === 0 ? 'rgba(120,170,255,0.18)' : 'rgba(90,120,180,0.06)';
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      ctx.fillText(String(Math.round(y)), 4, sy - 3);
    }
  }

  // текст с минимальным экранным размером
  text(str, x, y, px, color, opts = {}) {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const screenPx = px * z;
    if (screenPx < (opts.min ?? 4.5)) return;
    let size = px;
    if (screenPx > 26) size = 26 / z;
    else if (screenPx < 12) size = Math.min(px * 1.9, 12 / z); // мелкий текст подтягиваем до читаемого
    ctx.font = `${opts.weight || 500} ${size}px ${opts.mono ? MONO : SANS}`;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.base || 'middle';
    if (opts.bg) {
      const w = ctx.measureText(str).width + size * 0.9;
      const h = size * 1.55;
      const bx = opts.align === 'left' ? x - size * 0.45 : opts.align === 'right' ? x - w + size * 0.45 : x - w / 2;
      ctx.fillStyle = opts.bg;
      roundRect(ctx, bx, y - h / 2, w, h, h * 0.3);
      ctx.fill();
      if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 1 / z; ctx.stroke(); }
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y + size * 0.04);
  }

  glow(x, y, r, color, a = 1) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, alpha(color, 0.55 * a));
    g.addColorStop(0.4, alpha(color, 0.18 * a));
    g.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  drawCore() {
    const ctx = this.ctx, sc = this.scene, t = this.t, z = this.cam.zoom;
    const flash = clamp(1 - (t - sc.coreFlash) / 700, 0, 1);
    const waiting = sc.waitingInput;
    this.glow(0, 0, 150 + flash * 60, waiting ? '#ffb86b' : '#4fd1ff', 0.7 + flash * 0.5);
    // монитор
    const w = 120, h = 82;
    ctx.fillStyle = '#0d1426';
    ctx.strokeStyle = waiting ? '#ffb86b' : '#6fe0ff';
    ctx.lineWidth = 2.5;
    roundRect(ctx, -w / 2, -h / 2 - 8, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#050a14';
    roundRect(ctx, -w / 2 + 8, -h / 2, w - 16, h - 16, 5); ctx.fill();
    ctx.fillStyle = '#6fe0ff';
    ctx.fillRect(-10, h / 2 - 8, 20, 12);
    roundRect(ctx, -30, h / 2 + 3, 60, 7, 3); ctx.fill();
    // экран
    const blink = Math.floor(t / 500) % 2 === 0;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `600 11px ${MONO}`;
    const lines = sc.screenLines || [];
    if (waiting) {
      ctx.fillStyle = '#ffb86b';
      ctx.fillText('scanf ждёт', -w / 2 + 14, -h / 2 + 6);
      ctx.fillText('ввода' + (blink ? '█' : ''), -w / 2 + 14, -h / 2 + 22);
    } else if (lines.length) {
      ctx.fillStyle = '#9ef0b0';
      lines.slice(-3).forEach((l, i) => ctx.fillText(l.slice(0, 13), -w / 2 + 14, -h / 2 + 5 + i * 15));
    } else {
      ctx.fillStyle = '#6fe0ff';
      ctx.fillText('>' + (blink ? '_' : ''), -w / 2 + 14, -h / 2 + 6);
    }
    this.text('КОМПЬЮТЕР · (0, 0)', 0, h / 2 + 30, 13, 'rgba(160,220,255,0.85)', { weight: 700 });
    if (z > 0.5) this.text('терминал: ввод ⌨ / вывод 🖥', 0, h / 2 + 48, 10, 'rgba(160,190,230,0.55)');
  }

  drawLaw(e) {
    const ctx = this.ctx, t = this.t, a = this.fadeOf(e);
    const sel = this.scene.selected === e.id || this.hover === e.id;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = alpha(e.color, sel ? 0.8 : 0.4);
    ctx.lineWidth = (sel ? 2.4 : 1.3);
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 0.01;
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // спутники-функции
    const n = e.funcs.length;
    e.funcs.forEach((fn, i) => {
      const ang = e.angle + 0.35 + (i / Math.max(n, 1)) * TAU * 0.85 + t * 0.00004 * (1 + (i % 3));
      const x = Math.cos(ang) * e.radius, y = Math.sin(ang) * e.radius;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      if (this.cam.zoom > 0.75) this.text(fn, x, y - 12, 9, alpha(e.color, 0.85), { mono: true });
    });
    this.text(`${e.name}`, e.x, e.y, 13, e.color, { mono: true, weight: 700, bg: 'rgba(5,10,20,0.85)', border: alpha(e.color, 0.5) });
    ctx.restore();
  }

  drawConst(e) {
    const ctx = this.ctx, t = this.t, a = this.fadeOf(e);
    const sel = this.scene.selected === e.id || this.hover === e.id;
    ctx.save();
    ctx.globalAlpha = a;
    this.glow(e.x, e.y, 46, '#ffd166', 0.8 + 0.2 * Math.sin(t * 0.003));
    ctx.fillStyle = '#ffe9a8';
    star(ctx, e.x, e.y, 5, sel ? 15 : 12, 5);
    ctx.fill();
    this.text(`${e.name} = ${e.text}`, e.x, e.y + 26, 12, '#ffe08a', { mono: true, weight: 600, bg: 'rgba(20,16,4,0.7)' });
    if (this.cam.zoom > 0.6) this.text('#define · константа', e.x, e.y - 24, 9, 'rgba(255,224,138,0.6)');
    ctx.restore();
  }

  drawRegion(r) {
    const ctx = this.ctx, t = this.t, a = this.fadeOf(r);
    const sel = this.scene.selected === r.id;
    const active = this.scene.current === r.id;
    ctx.save();
    ctx.globalAlpha = a;
    const col = r.id === 'global' ? '#7ee787' : '#8b7bff';
    const g = ctx.createRadialGradient(r.x, r.y, r.r * 0.1, r.x, r.y, r.r);
    g.addColorStop(0, alpha(col, 0.13));
    g.addColorStop(0.7, alpha(col, 0.06));
    g.addColorStop(1, alpha(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = alpha(col, active ? 0.65 : sel ? 0.8 : 0.28);
    ctx.lineWidth = active ? 2 : 1.2;
    ctx.setLineDash([4, 10]);
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // заголовок
    this.text(r.name, r.x, r.y - r.r - 22, 22, active ? '#d8d0ff' : '#a99cff', { mono: true, weight: 700 });
    const sub = r.id === 'global' ? 'видна всем функциям' : `кадр стека · глубина ${r.depth} · центр (${Math.round(r.x)}, ${Math.round(r.y)})`;
    this.text(sub, r.x, r.y - r.r - 2, 10, 'rgba(180,170,255,0.6)');
    if (r.ret != null && r.dying) this.text(`вернула ${r.ret}`, r.x, r.y + r.r + 18, 14, '#7ee787', { mono: true, weight: 700 });
    // ось кода (строки)
    if (r.id !== 'global') {
      const sx = this.scene.spineX(r);
      const y0 = this.scene.lineY(r, r.span.start), y1 = this.scene.lineY(r, r.span.end);
      ctx.strokeStyle = 'rgba(150,170,230,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx, y1); ctx.stroke();
      const n = r.span.end - r.span.start;
      const every = Math.max(1, Math.ceil(n / (this.cam.zoom > 0.9 ? 40 : this.cam.zoom > 0.5 ? 16 : 6)));
      for (let ln = r.span.start; ln <= r.span.end; ln += every) {
        const y = this.scene.lineY(r, ln);
        ctx.fillStyle = 'rgba(150,170,230,0.35)';
        ctx.fillRect(sx - 4, y - 0.5, 8, 1);
        this.text(String(ln), sx + 8, y, 8, 'rgba(150,170,230,0.45)', { align: 'left', mono: true, min: 6 });
      }
      this.text('строки кода', sx, y0 - 14, 9, 'rgba(150,170,230,0.5)');
      // зонд выполнения
      const py = this.scene.lineY(r, r.probeLine);
      r.probeY = r.probeY == null ? py : r.probeY + (py - r.probeY) * 0.25;
      if (active || r.dying) {
        this.glow(sx, r.probeY, 36, '#4fd1ff', 1);
        ctx.fillStyle = '#bff3ff';
        ctx.beginPath(); ctx.arc(sx, r.probeY, 6, 0, TAU); ctx.fill();
        this.text(`▶ строка ${r.probeLine}`, sx + 14, r.probeY - 15, 13, '#9fe8ff', { align: 'left', mono: true, weight: 700 });
      }
    }
    ctx.restore();
  }

  drawStruct(s) {
    const ctx = this.ctx, t = this.t, a = this.fadeOf(s);
    const region = this.scene.entities.get(s.regionId);
    if (!region) return;
    const sel = this.scene.selected === s.id || this.hover === s.id;
    const flash = clamp(1 - (t - (s.flash || 0)) / 600, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    const sx = this.scene.spineX(region);
    const y0 = this.scene.lineY(region, s.line);
    s.x = sx; s.y = y0;
    if (s.kind === 'loop') {
      const y1 = Math.max(this.scene.lineY(region, s.endLine), y0 + 18);
      const bulge = 38 + (s.nest || 0) * 20;
      const col = s.active ? '#4fd1ff' : '#6f86b8';
      ctx.strokeStyle = alpha(col, s.active ? 0.9 : 0.5);
      ctx.lineWidth = sel ? 3.5 : 2.2;
      if (s.active) { ctx.setLineDash([7, 6]); ctx.lineDashOffset = t * 0.03; }
      ctx.beginPath();
      ctx.moveTo(sx - 4, y1);
      ctx.bezierCurveTo(sx - bulge * 1.4, y1, sx - bulge * 1.4, y0, sx - 4, y0);
      ctx.stroke();
      ctx.setLineDash([]);
      // стрелка к началу цикла
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(sx - 2, y0); ctx.lineTo(sx - 12, y0 - 6); ctx.lineTo(sx - 12, y0 + 6); ctx.fill();
      this.glow(sx, y0, 24 + flash * 30, s.lastValue === false ? '#ff6b81' : '#4fd1ff', 0.4 + flash);
      ctx.fillStyle = '#0a1224'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, y0, 10, 0, TAU); ctx.fill(); ctx.stroke();
      const spin = s.active ? t * 0.006 : 0;
      ctx.strokeStyle = '#bff3ff';
      ctx.beginPath(); ctx.arc(sx, y0, 6, spin, spin + 4.4); ctx.stroke();
      const label = `${s.loopKind === 'do' ? 'do-while' : s.loopKind} · ${s.active ? 'итерация ' + s.iter : 'завершён (' + (s.iterDone ?? s.iter) + ')'}`;
      this.text(label, sx - bulge - 8, (y0 + y1) / 2, 13, s.active ? '#bff3ff' : '#8ea4cf', { align: 'right', mono: true, weight: 700, bg: 'rgba(5,10,22,0.8)' });
      if (this.cam.zoom > 0.4) this.text(s.text, sx - bulge - 8, (y0 + y1) / 2 + 19, 11, 'rgba(170,200,240,0.7)', { align: 'right', mono: true });
    } else {
      const val = s.lastValue;
      const col = val === undefined ? '#8ea4cf' : val ? '#7ee787' : '#ff6b81';
      this.glow(sx, y0, 22 + flash * 30, col, 0.4 + flash);
      ctx.fillStyle = '#0a1224'; ctx.strokeStyle = col; ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(sx, y0 - 12); ctx.lineTo(sx + 12, y0); ctx.lineTo(sx, y0 + 12); ctx.lineTo(sx - 12, y0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      const txt = s.isSwitch ? `${s.text} = ${s.switchValue}` : `if (${s.text}) → ${val ? 'истина' : 'ложь'}`;
      this.text(txt, sx - 20, y0, 13, col, { align: 'right', mono: true, weight: 700, bg: 'rgba(5,10,22,0.8)' });
    }
    ctx.restore();
  }

  drawVar(v) {
    const ctx = this.ctx, t = this.t, a = this.fadeOf(v);
    if (a <= 0) return;
    const sel = this.scene.selected === v.id || this.hover === v.id;
    const flash = clamp(1 - (t - (v.flash || 0)) / 800, 0, 1);
    const floatY = Math.sin(t * 0.0015 + v.x * 0.01) * 3;
    const x = v.x, y = v.y + floatY;
    ctx.save();
    ctx.globalAlpha = a;
    const col = v.garbage ? '#ff6b81' : v.color;
    if (v.isArray) {
      const n = Math.min(v.len, 12), cw = 36, x0 = x - (n * cw) / 2;
      this.glow(x, y, 60 + n * 10 + flash * 30, col, 0.35 + flash * 0.6);
      this.text(`${v.name}[${v.len}]`, x, y - 30, 15, col, { mono: true, weight: 800 });
      for (let i = 0; i < n; i++) {
        const cx = x0 + i * cw;
        const fl = v.flashIdx === i ? flash : 0;
        ctx.fillStyle = fl ? alpha(col, 0.25 + fl * 0.4) : 'rgba(10,18,36,0.9)';
        ctx.strokeStyle = alpha(col, sel ? 1 : 0.65);
        ctx.lineWidth = 1.5;
        roundRect(ctx, cx + 2, y - 14, cw - 4, 28, 4); ctx.fill(); ctx.stroke();
        const txt = (v.shownElems || [])[i] ?? '?';
        this.text(String(txt).split(' ')[0].slice(0, 6), cx + cw / 2, y, 10, txt === '?' ? '#ff9aa9' : '#e8f4ff', { mono: true, weight: 700, min: 4 });
        this.text(String(i), cx + cw / 2, y + 22, 8, 'rgba(170,190,230,0.6)', { mono: true, min: 5 });
      }
      if (v.len > n) this.text(`… ещё ${v.len - n}`, x0 + n * cw + 26, y, 10, 'rgba(170,190,230,0.7)');
      this.text(v.typeName, x, y + 40, 9, 'rgba(170,190,230,0.6)', { mono: true });
      ctx.restore();
      return;
    }
    this.glow(x, y, 44 + flash * 40, col, 0.55 + flash * 0.8);
    const g = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, 17);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, col);
    g.addColorStop(1, alpha(col, 0.35));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 15 + flash * 4, 0, TAU); ctx.fill();
    if (sel) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 23, 0, TAU); ctx.stroke(); }
    // имя
    this.text(v.name, x, y - 31, 17, '#f2f7ff', { mono: true, weight: 800 });
    // значение
    let shown = v.shown ?? '?';
    if (shown === '?' || v.garbage) {
      const glyphs = '?#%&@$';
      const noise = v.garbage ? shown : glyphs[Math.floor(t / 120 + v.x) % glyphs.length];
      this.text(noise, x, y + 31, 14, '#ff9aa9', { mono: true, weight: 700, bg: 'rgba(40,6,14,0.8)', border: 'rgba(255,107,129,0.5)' });
    } else {
      this.text(String(shown).slice(0, 22), x, y + 31, 14, '#ffffff', { mono: true, weight: 700, bg: alpha(col, 0.22), border: alpha(col, 0.6) });
    }
    if (this.cam.zoom > 0.45) this.text(`${v.isParam ? 'параметр ' : ''}${v.typeName} · ${v.size} Б`, x, y + 52, 10, 'rgba(170,190,230,0.6)', { mono: true });
    ctx.restore();
  }

  drawAnim(a, layer) {
    const sc = this.scene, ctx = this.ctx;
    const t = (this.t - a.t0) / a.dur;
    if (t < 0 || t > 1) return;
    if (a.type === 'beam' && layer === 'under') {
      const p0 = sc.pos(a.from), p1 = sc.pos(a.to);
      const k = ease(Math.min(1, t * 1.25));
      const hx = p0.x + (p1.x - p0.x) * k, hy = p0.y + (p1.y - p0.y) * k;
      const fade = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      const w = (a.width || 1.6) * 2 / Math.max(0.35, this.cam.zoom);
      const g = ctx.createLinearGradient(p0.x, p0.y, hx, hy);
      g.addColorStop(0, alpha(a.color, 0.05));
      g.addColorStop(1, alpha(a.color, 0.95));
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(hx, hy); ctx.stroke();
      this.glow(hx, hy, 26 / Math.max(0.5, this.cam.zoom), a.color, 1);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(hx, hy, 3.5 / Math.max(0.5, this.cam.zoom), 0, TAU); ctx.fill();
      if (a.detect && k >= 1) {
        // «захват» объекта лучом
        ctx.strokeStyle = alpha(a.color, 0.9);
        ctx.lineWidth = 2;
        const rr = 20 + (1 - fade) * 20;
        ctx.beginPath(); ctx.arc(p1.x, p1.y, rr, 0, TAU); ctx.stroke();
      }
      ctx.restore();
      if (a.label && k < 1) this.text(String(a.label).slice(0, 26), hx, hy - 18 / Math.max(0.6, this.cam.zoom), 12, '#ffffff', { mono: true, weight: 700, bg: alpha(a.color, 0.45), min: 7 });
    } else if (a.type === 'ring' && layer === 'under') {
      const p = sc.pos(a.at);
      const r = a.r0 + (a.r1 - a.r0) * ease(t);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3 / Math.max(0.4, this.cam.zoom);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (a.type === 'float' && layer === 'over') {
      const p = sc.pos(a.at);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      this.text(a.text, p.x + 30, p.y - 20 - t * 30, 13, a.color, { mono: true, weight: 800 });
      ctx.restore();
    } else if (a.type === 'screen' && layer === 'over') {
      const text = a.text.replace(/\n/g, '⏎').slice(0, 40);
      ctx.save();
      ctx.globalAlpha = t < 0.1 ? t * 10 : t > 0.8 ? (1 - t) * 5 : 1;
      this.text('🖥 ' + text, 0, -118 - t * 24, 13, '#9ef0b0', { mono: true, weight: 700, bg: 'rgba(4,20,10,0.85)', border: 'rgba(126,231,135,0.6)' });
      ctx.restore();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, spikes, outer, inner) {
  let rot = -Math.PI / 2;
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
    rot += Math.PI / spikes;
    ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
    rot += Math.PI / spikes;
  }
  ctx.closePath();
}
