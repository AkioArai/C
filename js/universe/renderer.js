// Отрисовка вселенной на canvas: строгая сетка панелей и мини-таблиц.
// Управление: перетаскивание — перемещение, колесо/щипок — масштаб, касание — выбор.
import { G, colorForType, shortVal } from './scene.js';
import { settings } from '../ui/settings.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const C = {
  bg: '#0a0b09', panel: '#0e100d', panel2: '#121510', card: '#10120f', line: '#20241e', line2: '#2c3128', line3: '#3a4034',
  faint: '#4b5145', muted: '#767d6c', text: '#e6e9df', text2: '#b3b8a9',
  accent: '#c8f05a', yellow: '#e9d85c', green: '#8fd46a', red: '#e0705f', amber: '#e3b36b',
  screen: '#080907', code: '#0d0f0c', cell: '#161914', zebra: 'rgba(255,255,255,0.018)', ptr: '#9fc7a8', star: '210,220,190', screenText: '#e6e9df',
};

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
    this.cam = { x: 400, y: 200, zoom: 0.8 };
    this.target = null;
    this.follow = true;
    this.lastUser = 0;
    this.pointers = new Map();
    this.mouse = null;
    this.hover = null;
    this.insets = { top: 0, bottom: 0, right: 56 };
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
    this.stars = Array.from({ length: 90 }, () => ({ x: r() * 2400, y: r() * 2400, s: r() > 0.85 ? 1.5 : 1, a: 0.08 + r() * 0.16 }));
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

  setInsets(ins) { this.insets = { ...this.insets, ...ins }; }

  // ——— координаты ———
  toScreen(x, y) { return { x: (x - this.cam.x) * this.cam.zoom + this.W / 2, y: (y - this.cam.y) * this.cam.zoom + this.H / 2 }; }
  toWorld(sx, sy) { return { x: (sx - this.W / 2) / this.cam.zoom + this.cam.x, y: (sy - this.H / 2) / this.cam.zoom + this.cam.y }; }

  /** Камера на прямоугольник с учётом панелей сверху/снизу. */
  frameRect(x0, y0, x1, y1, maxZoom = 1.25) {
    const vh = Math.max(80, this.H - this.insets.top - this.insets.bottom);
    const vw = Math.max(80, this.W - this.insets.right);
    const zoom = clamp(Math.min(vw / (x1 - x0 + 30), vh / (y1 - y0 + 30)), 0.12, maxZoom);
    const cy = (y0 + y1) / 2 + ((this.insets.bottom - this.insets.top) / 2) / zoom;
    return { x: (x0 + x1) / 2 + (this.insets.right / 2) / zoom, y: cy, zoom };
  }

  flyTo(x, y, zoom) { this.target = { x, y, zoom: zoom ?? this.cam.zoom }; }

  fitHome(instant) {
    const L = this.scene.L || this.scene.layout((s) => s.length * 7);
    const x1 = (L.heap || L.files) ? G.sideX + G.sideW : G.colW;
    const y1 = Math.max(L.totalH || 300, L.sideH || 0, 300);
    const t = this.frameRect(0, 0, x1, y1, 1.1);
    if (instant) Object.assign(this.cam, t); else this.target = t;
  }

  /** Куда смотреть при слежении: активный кадр (и текущая строка, если кадр высокий). */
  followTarget() {
    const L = this.scene.L;
    if (!L) return null;
    const id = this.scene.focus;
    const box = id && L.frames.get(id);
    const vh = Math.max(80, this.H - this.insets.top - this.insets.bottom);
    const zoom = clamp((this.W - this.insets.right) / (G.colW + 30), 0.2, 1.25);
    if (!box) return this.frameRect(0, 0, G.colW, Math.max(L.totalH, 260), 1.1);
    const want = vh / zoom;
    let y0, y1;
    // ждём ввода или только что был ввод/вывод — показываем экран компьютера и текущую строку
    const io = this.scene.waitingInput || performance.now() - (this.scene.inputBuf.consumedAt || 0) < 1500;
    const ly0 = box.codeY + (box.fr.curLine - box.fr.span.start) * G.lineH;
    if (io && L.computer && ly0 + 40 - L.computer.y <= want * 1.6) {
      y0 = L.computer.y - 10; y1 = Math.max(ly0 + 40, Math.min(box.y + box.h, y0 + want));
    } else if (box.fr.func === 'main' && box.y + box.h < want * 0.95) { y0 = 0; y1 = box.y + box.h; }
    else if (box.h + 20 <= want) { y0 = box.y - 10; y1 = box.y + box.h; }
    else {
      // интересное: текущая строка, активная таблица цикла, последняя изменённая переменная
      const ly = box.codeY + (box.fr.curLine - box.fr.span.start) * G.lineH;
      let a = ly - 30, b = ly + 30;
      const tr = (box.traces || []).find(t => t.lp.active);
      if (tr) { a = Math.min(a, tr.y); b = Math.max(b, tr.y + tr.h); }
      if (b - a > want) { a = ly - 30; b = ly + 30; }
      const wc = L.cards.get(this.scene.lastWriteId);
      if (wc && wc.y >= box.y && wc.y < box.y + box.h) {
        const a2 = Math.min(a, wc.y), b2 = Math.max(b, wc.y + Math.min(wc.h, 160));
        if (b2 - a2 <= want) { a = a2; b = b2; }
      }
      const mid = (a + b) / 2;
      y0 = clamp(mid - want / 2, box.y - 10, Math.max(box.y - 10, box.y + box.h - want)); y1 = y0 + want;
    }
    const cy = (y0 + y1) / 2 + ((this.insets.bottom - this.insets.top) / 2) / zoom;
    const z = Math.min(zoom, vh / (y1 - y0 + 20));
    const zz = clamp(z, 0.2, 1.25);
    return { x: G.colW / 2 + (this.insets.right / 2) / zz, y: cy, zoom: zz };
  }

  focusRect(r, zoom) {
    if (!r) return;
    const t = this.frameRect(r.x - 20, r.y - 20, r.x + r.w + 20, r.y + r.h + 20, zoom ?? 1.3);
    this.target = t;
    this.lastUser = performance.now();
  }

  zoomBy(f, sx = this.W / 2, sy = this.H / 2) {
    const before = this.toWorld(sx, sy);
    this.cam.zoom = clamp(this.cam.zoom * f, 0.1, 3);
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
        this.zoomBy((pinch.z * (d / pinch.d)) / this.cam.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
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
        this.scene.selected = hit?.key || null;
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
    this.hover = h?.key || null;
    this.hoverHit = h;
    this.cv.style.cursor = h ? 'pointer' : 'grab';
  }

  hitTest(sx, sy) {
    const L = this.scene.L;
    if (!L) return null;
    const w = this.toWorld(sx, sy);
    const inR = (r) => r && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;
    for (const [id, c] of L.cards) if (inR(c)) return { kind: 'var', key: 'obj:' + id, o: c.o, rect: c };
    for (const [id, b] of L.frames) {
      for (const t of b.traces) if (inR(t)) return { kind: 'loop', key: `loop:${id}:${t.lp.nodeId}`, lp: t.lp, fr: b.fr, rect: t };
      const code = { x: b.codeX, y: b.codeY, w: b.codeW, h: (b.fr.span.end - b.fr.span.start + 1) * G.lineH };
      if (inR(code)) {
        const line = b.fr.span.start + Math.floor((w.y - code.y) / G.lineH);
        return { kind: 'line', key: `line:${id}:${line}`, fr: b.fr, line, rect: b };
      }
      if (inR(b)) return { kind: 'frame', key: 'frame:' + id, fr: b.fr, rect: b };
    }
    if (inR(L.computer)) return { kind: 'computer', key: 'computer', rect: L.computer };
    if (L.globals && inR(L.globals)) return { kind: 'globals', key: 'globals', rect: L.globals };
    if (L.heap && inR(L.heap)) return { kind: 'heap', key: 'heap', rect: L.heap };
    if (L.files && inR(L.files)) return { kind: 'files', key: 'files', rect: L.files };
    return null;
  }

  // ——— кадр ———
  frame(t) {
    const sc = this.scene;
    sc.tick(t);
    this.t = t;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = `12px ${MONO}`;
    sc.layout(() => 0);
    if (this.follow && !this.target && t - this.lastUser > 3500 && this.pointers.size === 0) {
      const ft = this.followTarget();
      if (ft && (Math.abs(ft.x - this.cam.x) > 2 || Math.abs(ft.y - this.cam.y) > 2 || Math.abs(ft.zoom - this.cam.zoom) > 0.01)) this.target = ft;
    }
    if (this.target) {
      const k = 0.12;
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
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      let x = (s.x - this.cam.x * 0.05) % 2400; if (x < 0) x += 2400;
      let y = (s.y - this.cam.y * 0.05) % 2400; if (y < 0) y += 2400;
      if (x > W || y > H) continue;
      ctx.fillStyle = `rgba(${C.star},${s.a})`;
      ctx.fillRect(x, y, s.s, s.s);
    }
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);
    const L = this.scene.L;
    this.lod = this.cam.zoom < 0.33 ? 0 : 1;
    this.drawComputer(L.computer);
    if (L.globals) this.drawPanel(L.globals, 'глобальные переменные', 'видны во всех функциях, живут всю программу');
    for (const b of L.frames.values()) this.drawFrame(b);
    if (L.heap) this.drawPanel(L.heap, 'куча (heap)', 'память из malloc — живёт до free');
    if (L.files) this.drawFiles(L.files);
    for (const c of L.cards.values()) this.drawCard(c);
    this.drawPointers(L);
    for (const a of this.scene.anims) this.drawAnim(a, L);
    ctx.restore();
  }

  // ——— текст ———
  px(n) { return n / this.cam.zoom; }
  font(size, weight = 400, mono = true) { this.ctx.font = `${weight} ${size}px ${mono ? MONO : SANS}`; }
  fit(str, maxW) {
    str = String(str ?? '');
    const ctx = this.ctx;
    if (ctx.measureText(str).width <= maxW) return str;
    let lo = 0, hi = str.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(str.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1; }
    return str.slice(0, lo) + '…';
  }
  text(str, x, y, { size = 12, color = C.text, weight = 400, mono = true, align = 'left', base = 'middle', maxW = Infinity } = {}) {
    if (size * this.cam.zoom < 4) return 0;
    const ctx = this.ctx;
    this.font(size, weight, mono);
    ctx.textAlign = align;
    ctx.textBaseline = base;
    const s = maxW < Infinity ? this.fit(str, maxW) : String(str);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }
  rect(x, y, w, h, { fill, stroke, lw = 1, r = 4 } = {}) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = this.px(lw); ctx.stroke(); }
  }
  flashA(at, ms = 900) { return clamp(1 - (this.t - (at || 0)) / ms, 0, 1); }

  // ——— компьютер: экран и буфер ввода ———
  drawComputer(r) {
    const sc = this.scene;
    const sel = sc.selected === 'computer';
    this.rect(r.x, r.y, r.w, r.h, { fill: C.panel, stroke: sel ? C.text2 : C.line, r: 8 });
    this.text('компьютер', r.x + 14, r.y + 20, { size: 12, color: C.text2, weight: 500, mono: false });
    const status = sc.waitingInput ? 'ждёт ввода с клавиатуры' : sc.finished ? `программа завершилась (код ${sc.finished.code})` : sc.frameStack.length ? 'выполняет программу' : 'готов';
    this.text(status, r.x + r.w - 14, r.y + 20, { size: 11, color: sc.waitingInput ? C.yellow : sc.finished ? C.green : C.text2, align: 'right', mono: false });
    // экран
    const sx = r.x + 14, sy = r.y + 36, sw = 486, sh = r.screenLines * 20 + 30;
    this.rect(sx, sy, sw, sh, { fill: C.screen, r: 5 });
    this.text('экран', sx + 10, sy + 12, { size: 9.5, color: C.faint, mono: false });
    const scr = sc.screen;
    const n = r.screenLines;
    const first = Math.max(0, scr.lines.length - n);
    const fresh = this.flashA(scr.lastAt, 1200);
    // печатная машинка: сколько символов уже «напечатано»
    const tp = scr.typeDur ? clamp((this.t - scr.typeAt) / scr.typeDur, 0, 1) : 1;
    const visible = tp < 1 ? Math.floor(scr.typeFrom + (scr.typeTo - scr.typeFrom) * tp) : Infinity;
    for (let i = 0; i < n && first + i < scr.lines.length; i++) {
      const li = first + i;
      const ly = sy + 32 + i * 20;
      const start = scr.starts?.[li] ?? 0;
      if (start > visible) break;
      const full = scr.lines[li];
      const line = visible === Infinity ? full : full.slice(0, Math.max(0, visible - start));
      const typing = line.length < full.length || (visible !== Infinity && start + full.length + 1 > visible);
      this.font(13);
      const shown = this.fit(line, sw - 60);
      const w = this.text(shown, sx + 12, ly, { size: 13, color: C.screenText });
      const isLast = li === scr.lines.length - 1 || typing;
      if (scr.ended[li] && !typing) this.text('↵', sx + 16 + w, ly, { size: 12, color: alpha(C.accent, 0.55) });
      if (isLast) {
        const blink = typing || Math.floor(this.t / 530) % 2 === 0;
        if (blink || sc.waitingInput) this.rect(sx + 14 + w, ly - 8, 8, 16, { fill: sc.waitingInput ? C.yellow : alpha(C.accent, 0.8), r: 1 });
        if (typing) break;
      }
    }
    if (fresh > 0 && scr.fresh) {
      const t = scr.fresh.replace(/\n/g, '↵');
      this.text(`+ ${t}`, sx + sw - 12, sy + 12, { size: 10, color: alpha(C.green, fresh), align: 'right', maxW: sw - 120 });
    }
    // буфер ввода
    const bx = sx + sw + 12, bw = r.x + r.w - 14 - bx, bh = 92;
    this.rect(bx, sy, bw, bh, { fill: C.screen, stroke: sc.waitingInput ? alpha(C.yellow, 0.7) : undefined, r: 5 });
    this.text('буфер клавиатуры', bx + 10, sy + 12, { size: 9.5, color: C.faint, mono: false });
    const cw = 16, perRow = Math.floor((bw - 20) / cw);
    const recent = sc.inputBuf.recent || '';
    const rest = sc.inputBuf.text || '';
    const rf = this.flashA(sc.inputBuf.consumedAt, 1500);
    const chars = [...(rf > 0 ? recent : '')].map(ch => ({ ch, used: true })).concat([...rest].map(ch => ({ ch, used: false })));
    if (!chars.length) this.text(sc.waitingInput ? 'введите значение в терминале…' : 'пусто', bx + 10, sy + 40, { size: 10.5, color: sc.waitingInput ? C.yellow : C.faint, mono: false });
    chars.slice(0, perRow * 3).forEach((c, i) => {
      const x = bx + 10 + (i % perRow) * cw, y = sy + 26 + Math.floor(i / perRow) * 20;
      this.rect(x, y, cw - 2, 18, { fill: c.used ? alpha(C.yellow, 0.15 * rf) : 'transparent', stroke: c.used ? alpha(C.yellow, 0.5 * rf + 0.1) : C.line2, r: 2 });
      const g = c.ch === '\n' ? '↵' : c.ch === ' ' ? '·' : c.ch;
      this.text(g, x + (cw - 2) / 2, y + 9, { size: 11, color: c.used ? alpha(C.yellow, 0.4 + 0.6 * rf) : c.ch === '\n' || c.ch === ' ' ? C.faint : C.screenText, align: 'center' });
    });
    // библиотеки и константы
    const ly = sy + sh + 20;
    let x = r.x + 14;
    this.text('подключено:', x, ly, { size: 10.5, color: C.muted, mono: false });
    x += 76;
    for (const h of sc.headers) {
      this.font(11);
      const w = this.ctx.measureText(h.name).width + 12;
      if (x + w > r.x + r.w - 14) break;
      this.rect(x, ly - 9, w, 18, { fill: alpha(C.green, 0.08), r: 3 });
      this.text(h.name, x + 6, ly, { size: 11, color: C.green });
      x += w + 6;
    }
    if (!sc.headers.length) this.text('ничего (нет #include)', x, ly, { size: 10.5, color: C.faint, mono: false });
    if (sc.defines.length) {
      x = Math.max(x + 12, r.x + 330);
      this.text('#define:', x, ly, { size: 10.5, color: C.muted, mono: false });
      x += 52;
      for (const d of sc.defines) {
        const s = `${d.name}${d.params ? '(' + d.params.join(',') + ')' : ''} = ${d.text}`;
        this.font(11);
        const w = Math.min(this.ctx.measureText(s).width + 12, 200);
        if (x + w > r.x + r.w - 14) { this.text('…', x, ly, { size: 11, color: C.muted }); break; }
        this.rect(x, ly - 9, w, 18, { fill: alpha(C.yellow, 0.08), r: 3 });
        this.text(s, x + 6, ly, { size: 11, color: C.yellow, maxW: w - 12 });
        x += w + 6;
      }
    }
  }

  drawPanel(r, title, sub) {
    this.rect(r.x, r.y, r.w, r.h, { fill: C.panel, stroke: C.line, r: 8 });
    this.text(title, r.x + 14, r.y + 18, { size: 13, color: C.text2, weight: 500 });
    this.font(14, 500);
    const w = this.ctx.measureText(title).width;
    this.text(sub, r.x + 26 + w, r.y + 18, { size: 10.5, color: C.muted, mono: false, maxW: r.w - w - 40 });
  }

  // ——— кадр функции ———
  drawFrame(b) {
    const sc = this.scene, fr = b.fr;
    const active = sc.current === fr.id;
    const a = fr.dying ? clamp(1 - (this.t - fr.dying) / 700, 0, 1) : 1;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    // вызов: кадр разворачивается сверху вниз; возврат — сворачивается к заголовку
    const live = settings.get('run.anims') !== false;
    const open = fr.func === 'main' || !live ? 1 : ease(clamp((this.t - (fr.born || 0)) / 480, 0, 1));
    const close = fr.closeAt && live ? 1 - ease(clamp((this.t - fr.closeAt) / 700, 0, 1)) : 1;
    const vis = Math.min(open, close);
    if (vis < 1) {
      const hh = 44 + (b.h - 44) * vis;
      ctx.beginPath();
      ctx.rect(b.x - 4, b.y - 4, b.w + 8, hh + 8);
      ctx.clip();
      if (open < 1) { ctx.strokeStyle = alpha('#d9a6f0', 0.6 * (1 - open)); ctx.lineWidth = this.px(2); ctx.beginPath(); ctx.moveTo(b.x + 8, b.y + hh); ctx.lineTo(b.x + b.w - 8, b.y + hh); ctx.stroke(); }
    }
    const sel = sc.selected === 'frame:' + fr.id;
    this.rect(b.x, b.y, b.w, b.h, { fill: C.panel, stroke: sel ? C.text2 : active ? alpha(C.accent, 0.4) : C.line, r: 8 });
    // заголовок
    const title = `${fr.func}(${(fr.args || []).map(x => x.name + '=' + shortVal(x.display)).join(', ')})`;
    this.text(title, b.x + 14, b.y + 20, { size: 15, color: active ? C.text : C.text2, weight: 500, maxW: b.w * 0.55 });
    const sub = fr.ended ? (fr.ret != null ? `вернула ${fr.ret}` : 'завершилась') : active ? `выполняется · строка ${fr.curLine}` : `ждёт возврата из вызова (строка ${fr.curLine})`;
    this.text(sub, b.x + b.w - 14, b.y + 20, { size: 11, color: fr.ended ? C.green : active ? C.accent : C.muted, align: 'right', mono: false });
    if (fr.callLine && fr.func !== 'main') this.text(`вызвана в строке ${fr.callLine}`, b.x + 14, b.y + 36, { size: 9.5, color: C.faint, mono: false });
    // листинг
    this.drawListing(b);
    if (!fr.vars.length && this.lod) this.text('переменных пока нет', b.x + G.varsX, b.codeY + 16, { size: 11, color: C.faint, mono: false });
    for (const t of b.traces) this.drawTrace(t, fr);
    this.drawJump(b);
    ctx.restore();
  }

  drawListing(b) {
    const fr = b.fr, sc = this.scene;
    const x = b.codeX, y0 = b.codeY, w = b.codeW;
    const n = fr.span.end - fr.span.start + 1;
    this.rect(x, y0 - 6, w, n * G.lineH + 12, { fill: C.code, r: 5 });
    const gutter = 30;
    // скобки циклов слева
    for (const lp of fr.loops.values()) {
      const ya = y0 + (lp.line - fr.span.start) * G.lineH + 3;
      const yb = y0 + (lp.endLine - fr.span.start) * G.lineH + G.lineH - 3;
      const bx = x + 4 + (lp.depth || 0) * 5;
      const ctx = this.ctx;
      ctx.strokeStyle = lp.active ? C.accent : C.line3;
      ctx.lineWidth = this.px(lp.active ? 1.4 : 1);
      ctx.beginPath(); ctx.moveTo(bx + 4, ya); ctx.lineTo(bx, ya); ctx.lineTo(bx, yb); ctx.lineTo(bx + 4, yb); ctx.stroke();
    }
    const lodText = this.lod;
    for (let i = 0; i < n; i++) {
      const ln = fr.span.start + i;
      const ly = y0 + i * G.lineH;
      const cur = ln === fr.curLine && !fr.ended;
      const sel = sc.selected === `line:${fr.id}:${ln}`;
      if (cur) this.rect(x + 1, ly, w - 2, G.lineH, { fill: alpha(C.accent, 0.12), r: 2 });
      else if (sel) this.rect(x + 1, ly, w - 2, G.lineH, { fill: alpha(C.text2, 0.08), r: 2 });
      if (cur) this.rect(x + 1, ly, 2, G.lineH, { fill: C.accent, r: 0 });
      if (!lodText) continue;
      this.text(String(ln), x + gutter - 4, ly + G.lineH / 2, { size: 10, color: cur ? C.accent : fr.visited.has(ln) ? C.muted : C.faint, align: 'right' });
      const src = (sc.srcLines[ln - 1] || '').replace(/\t/g, '    ');
      // справа — результат if/switch и счётчик цикла
      let tag = null, tagColor = C.muted;
      const s = fr.ifs.get(ln);
      if (s) { tag = s.sw !== undefined ? `= ${shortVal(s.sw)}` : s.value ? 'да' : 'нет'; tagColor = s.sw !== undefined ? C.yellow : s.value ? C.green : C.red; }
      const lp = [...fr.loops.values()].find(l => l.line === ln);
      if (lp) { tag = lp.active ? `×${lp.iter}` : `×${lp.iters ?? lp.iter}`; tagColor = lp.active ? C.accent : C.muted; }
      this.font(10.5);
      const tagW = tag ? this.ctx.measureText(tag).width + 10 : 0;
      this.text(src.trimEnd(), x + gutter + 4, ly + G.lineH / 2, { size: 11.5, color: cur ? C.text : fr.visited.has(ln) ? C.text2 : C.muted, maxW: w - gutter - 10 - tagW });
      // вспышка строки: условие проверено — зелёным (истина) или красным (ложь)
      const fsrc = lp ? (lp.lastCond !== undefined ? { at: lp.at, col: lp.lastCond ? C.green : C.red } : null) : s ? { at: s.at, col: tagColor } : null;
      if (fsrc && settings.get('run.flashes')) {
        const cf = this.flashA(fsrc.at, 900);
        if (cf > 0) this.rect(x + 1, ly, w - 2, G.lineH, { fill: alpha(fsrc.col, 0.16 * cf), r: 2 });
      }
      if (tag) {
        const fl = this.flashA(s?.at ?? lp?.at, 700);
        this.rect(x + w - tagW - 4, ly + 3, tagW, G.lineH - 6, { fill: alpha(tagColor, 0.1 + fl * 0.25), r: 3 });
        this.text(tag, x + w - tagW / 2 - 4, ly + G.lineH / 2, { size: 10.5, color: tagColor, align: 'center' });
      }
    }
  }

  /** Стрелка break/continue: откуда и куда перешло выполнение (гаснет за 2 с). */
  drawJump(b) {
    const j = b.fr.jump;
    if (!j) return;
    const a = this.flashA(j.at, 2200);
    if (a <= 0) return;
    const ctx = this.ctx;
    const y = (ln) => b.codeY + (ln - b.fr.span.start) * G.lineH + G.lineH / 2;
    const x = b.codeX + 1, y0 = y(j.from), y1 = y(j.to);
    const col = j.kind === 'break' ? C.red : C.yellow;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = col;
    ctx.lineWidth = this.px(1.4);
    if (j.kind === 'continue') ctx.setLineDash([this.px(4), this.px(3)]);
    ctx.beginPath();
    // дуга слева от листинга, стрелка указывает на строку, куда перешло выполнение
    ctx.moveTo(x + 4, y0);
    ctx.bezierCurveTo(x - 13, y0, x - 13, y1, x + 1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + 7, y1); ctx.lineTo(x, y1 - 4); ctx.lineTo(x, y1 + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ——— таблица трассировки цикла ———
  drawTrace(t, fr) {
    const lp = t.lp;
    const sel = this.scene.selected === `loop:${fr.id}:${lp.nodeId}`;
    this.rect(t.x, t.y, t.w, t.h, { fill: C.card, stroke: sel ? C.text2 : lp.active ? alpha(C.accent, 0.35) : C.line, r: 6 });
    const head = lp.head || lp.text || '';
    this.text(`цикл ${lp.kind === 'do' ? 'do-while' : lp.kind}`, t.x + 10, t.y + 15, { size: 10, color: C.muted, mono: false });
    this.text(head, t.x + 80, t.y + 15, { size: 11, color: lp.active ? C.accent : C.text2, maxW: t.w - 240 });
    const run = lp.runs > 1 ? `проход ${lp.runs} · ` : '';
    this.text(run + (lp.active ? `итерация ${lp.iter}` : `итераций: ${lp.iters ?? lp.iter}${lp.exitReason === 'break' ? ' (break)' : ''}`), t.x + t.w - 10, t.y + 15, { size: 10.5, color: lp.active ? C.accent : C.muted, align: 'right', mono: false });
    if (!this.lod) return;
    const cols = lp.trace.cols;
    const colW = Math.min(110, (t.w - 70 - 90) / Math.max(1, cols.length));
    const hy = t.y + 38;
    this.text('итер.', t.x + 12, hy, { size: 10, color: C.faint, mono: false });
    cols.forEach((c, i) => this.text(c.path, t.x + 50 + i * colW, hy, { size: 10.5, color: C.muted, maxW: colW - 8 }));
    const prevRun = !lp.trace.rows.length;
    this.text(prevRun ? 'прошлый проход' : 'условие', t.x + t.w - 12, hy, { size: 10, color: prevRun ? C.yellow : C.faint, align: 'right', mono: false });
    const ctx = this.ctx;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = this.px(1);
    ctx.beginPath(); ctx.moveTo(t.x + 8, hy + 10); ctx.lineTo(t.x + t.w - 8, hy + 10); ctx.stroke();
    const prev = !lp.trace.rows.length;
    const all = prev ? lp.trace.prevRows || [] : lp.trace.rows;
    const rows = all.slice(-t.rows);
    const hidden = all.length - rows.length;
    let y = hy + 22;
    if (hidden > 0) { this.text(`… ещё ${hidden} строк выше`, t.x + 14, y - 2, { size: 9.5, color: C.faint, mono: false }); y += 18; }
    if (prev) { ctx.save(); ctx.globalAlpha *= 0.4; }
    rows.forEach((row, ri) => {
      const last = ri === rows.length - 1;
      if (last && lp.active) this.rect(t.x + 6, y - 10, t.w - 12, 20, { fill: alpha(C.accent, 0.07), r: 3 });
      this.text(row.iter != null ? String(row.iter) : '—', t.x + 14, y, { size: 11, color: C.text2 });
      cols.forEach((c, i) => {
        const v = row.closed ? row.vals[c.key] ?? '' : '…';
        this.text(v, t.x + 50 + i * colW, y, { size: 11.5, color: row.closed ? C.text : C.faint, maxW: colW - 8 });
      });
      if (row.cond !== null && row.cond !== undefined) this.text(row.cond ? 'истина' : 'ложь → выход', t.x + t.w - 12, y, { size: 10.5, color: row.cond ? C.green : C.red, align: 'right', mono: false });
      y += 20;
    });
    if (prev) ctx.restore();
  }

  // ——— карточки переменных ———
  drawCard(c) {
    const o = c.o;
    const t = this.t;
    let a = clamp((t - (o.ui?.born ?? 0)) / 300, 0, 1);
    if (o.dying) a *= clamp(1 - (t - o.dying) / 700, 0, 1);
    if (a <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    const col = o.freed ? C.faint : colorForType(o.typeName);
    const sel = this.scene.selected === 'obj:' + o.id || this.hover === 'obj:' + o.id;
    const fl = this.flashA(o.ui?.flash, 900);
    this.rect(c.x, c.y, c.w, c.h, { fill: fl > 0 ? alpha(col, 0.02 + fl * 0.07) : C.card, stroke: sel ? C.text2 : fl > 0 ? alpha(col, 0.25 + fl * 0.45) : C.line, r: 6 });
    if (o.shape === 'scalar') this.drawScalar(c, o, col);
    else if (o.shape === 'array') this.drawArray(c, o, col);
    else this.drawRecord(c, o, col);
    ctx.restore();
  }

  /** Заголовок карточки: имя слева, тип справа — без рамок. */
  cardHead(c, name, typeLabel, col) {
    this.font(10.5);
    const tw = Math.min(this.ctx.measureText(typeLabel).width, c.w * 0.55);
    this.text(typeLabel, c.x + c.w - 12, c.y + 15, { size: 10.5, color: alpha(col, 0.8), align: 'right', maxW: c.w * 0.55 });
    this.text(name, c.x + 12, c.y + 15, { size: 13, color: C.text, weight: 500, maxW: c.w - tw - 34 });
  }

  /** Неинициализированная память: мягкая красная штриховка. */
  hatch(x, y, w, h, r = 3) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.fillStyle = alpha(C.red, 0.07);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = alpha(C.red, 0.22);
    ctx.lineWidth = this.px(1);
    ctx.beginPath();
    for (let k = -h; k < w; k += 6) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
    ctx.stroke();
    ctx.restore();
    this.rect(x, y, w, h, { stroke: alpha(C.red, 0.45), r });
  }

  drawScalar(c, o, col) {
    const cell = o.cells[0] || { display: '?' };
    const role = o.kind === 'static' ? 'static ' : o.isConst ? 'const ' : '';
    this.cardHead(c, role + o.name, `${o.typeName} · ${o.size} Б`, col);
    const x = c.x + 12, w = c.w - 24;
    if (!cell.init) {
      this.hatch(x, c.y + 26, Math.min(w, 120), 20);
      this.text('мусор', x + 10, c.y + 36, { size: 11.5, color: C.red, mono: false });
    } else {
      const isPtr = cell.ptr !== undefined;
      const val = isPtr ? (cell.ptr === 0 || cell.display === 'NULL' ? 'NULL' : `→ ${cell.desc || cell.targetPath || cell.display}`) : cell.display;
      const rk = !isPtr && o.ui?.rollAt && settings.get('run.anims') !== false ? clamp((this.t - o.ui.rollAt) / 520, 0, 1) : 1;
      if (rk < 1) {
        // одометр: старое значение уезжает вверх, новое въезжает снизу
        const e = ease(rk), ctx = this.ctx;
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 2, c.y + 25, w + 4, 23); ctx.clip();
        ctx.globalAlpha *= 1 - e;
        this.text(String(o.ui.prevVal), x, c.y + 36 - 18 * e, { size: 16, color: C.muted, maxW: w });
        ctx.globalAlpha = (ctx.globalAlpha / Math.max(1e-3, 1 - e)) * e;
        this.text(val, x, c.y + 36 + 18 * (1 - e), { size: 16, color: C.text, maxW: w });
        ctx.restore();
      } else this.text(val, x, c.y + 36, { size: 16, color: C.text, maxW: w });
      // на сколько изменилось: всплывает и тает
      const dk = o.ui?.rollAt && o.ui.delta ? clamp((this.t - o.ui.rollAt) / 1500, 0, 1) : 1;
      if (dk < 1 && this.lod) {
        const d = o.ui.delta, s = (d > 0 ? '+' : '−') + shortVal(String(Math.abs(d)));
        this.font(11.5, 600);
        const tw = this.ctx.measureText(s).width + 12;
        const bx = c.x + c.w - 12 - tw, by = c.y + 28 - 10 * ease(dk);
        this.ctx.save();
        this.ctx.globalAlpha *= dk < 0.7 ? 1 : 1 - (dk - 0.7) / 0.3;
        const dc = d > 0 ? C.green : C.red;
        this.rect(bx, by, tw, 17, { fill: alpha(dc, 0.14), stroke: alpha(dc, 0.5), r: 8 });
        this.text(s, bx + tw / 2, by + 9, { size: 11.5, weight: 600, color: dc, align: 'center' });
        this.ctx.restore();
      }
    }
    if (!this.lod) return;
    const meta = [o.kind === 'param' ? 'параметр' : '', cell.ptr !== undefined && cell.init ? `адрес ${cell.display}` : ''].filter(Boolean).join(' · ');
    if (meta) this.text(meta, x, c.y + c.h - 9, { size: 9.5, color: C.faint, mono: false, maxW: w });
  }

  drawArray(c, o, col) {
    const title = o.kind === 'heap' ? `${o.name}${o.freed ? ' · освобождён' : ''}` : o.name;
    this.cardHead(c, title, o.kind === 'heap' ? `${o.freed ? '' : o.typeName + ' · '}${o.size} Б` : `${o.typeName} · ${o.size} Б`, col);
    if (!this.lod) return;
    const perRow = Math.max(1, Math.floor((c.w - 40) / G.cellW));
    const dims = o.dims || [o.cells.length];
    const multi = dims.length >= 2 && !o.cells[0]?.label.includes('.');
    const inner = multi ? o.cells.length / Math.max(1, dims[0]) : o.cells.length;
    let y = c.y + 34;
    const cw = G.cellW - 4, ch = G.cellH - 8;
    const pos = {};
    const drawCell = (cell, idx, cx, cy, label) => {
      pos[idx] = { x: cx, y: cy };
      const fl = o.ui?.flashCell === idx ? this.flashA(o.ui.flash, 900) : 0;
      // ячейка «подпрыгивает», когда в неё пишут
      const pop = fl > 0.6 ? Math.sin(((1 - fl) / 0.4) * Math.PI) * 3 : 0;
      cy -= pop;
      if (!cell.init) this.hatch(cx, cy, cw, ch);
      else this.rect(cx, cy, cw, ch, { fill: fl ? alpha(col, 0.12 + fl * 0.3) : C.cell, stroke: fl ? alpha(col, 0.7) : undefined, r: 3 });
      let v = cell.init ? shortVal(cell.ptr !== undefined ? (cell.ptr === 0 ? 'NULL' : '→') : cell.display) : '';
      if (v === "'\\0'") v = '\\0';
      if (v) this.text(v, cx + cw / 2, cy + ch / 2, { size: 11, color: v === '\\0' ? C.muted : C.text, align: 'center', maxW: G.cellW - 8 });
      this.text(label, cx + cw / 2, cy + G.cellH + 1, { size: 9, color: C.faint, align: 'center', maxW: G.cellW });
    };
    if (multi) {
      const rowsShown = Math.min(dims[0], 12);
      for (let r = 0; r < rowsShown; r++) {
        this.text(`[${r}]`, c.x + 12, y + 13, { size: 9.5, color: C.faint });
        for (let k = 0; k < inner; k++) {
          const idx = r * inner + k;
          const cell = o.cells[idx];
          if (!cell) break;
          const cx = c.x + 36 + (k % perRow) * G.cellW, cy = y + Math.floor(k / perRow) * (G.cellH + 16);
          drawCell(cell, idx, cx, cy, cell.label.slice(cell.label.indexOf(']') + 1));
        }
        y += Math.ceil(inner / perRow) * (G.cellH + 16);
      }
    } else {
      const shown = Math.min(o.cells.length, 96);
      for (let i = 0; i < shown; i++) {
        const cell = o.cells[i];
        const cx = c.x + 14 + (i % perRow) * G.cellW, cy = y + Math.floor(i / perRow) * (G.cellH + 16);
        drawCell(cell, i, cx, cy, cell.label.replace(/^\[(\d+)\]$/, '$1'));
      }
      y += Math.ceil(shown / perRow) * (G.cellH + 16);
      if (o.cells.length > shown || o.truncated) this.text(`… ещё элементы`, c.x + c.w - 14, c.y + c.h - 12, { size: 9.5, color: C.faint, align: 'right', mono: false });
    }
    if (o.str != null) this.text(`строка: "${o.str}"`, c.x + 14, y + 6, { size: 11, color: C.amber, maxW: c.w - 28 });
    this.drawIndexCursor(o, pos, cw, col);
  }

  /** Курсор индекса массива: треугольник с подписью [i] переезжает к ячейке, куда идёт запись. */
  drawIndexCursor(o, pos, cw, col) {
    const ui = o.ui;
    if (!ui || ui.curTo == null || !pos[ui.curTo] || settings.get('run.anims') === false) return;
    const age = this.t - ui.curAt;
    if (age > 6000) return;
    const from = pos[ui.curFrom] || pos[ui.curTo], to = pos[ui.curTo];
    const k = ease(clamp(age / 380, 0, 1));
    const sameRow = Math.abs(from.y - to.y) < 1;
    const x = (sameRow ? from.x + (to.x - from.x) * k : to.x) + cw / 2;
    const y = to.y - 3;
    const a = age < 4500 ? 1 : 1 - (age - 4500) / 1500;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= a * (sameRow ? 1 : k);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y - 7); ctx.lineTo(x + 5, y - 7); ctx.closePath(); ctx.fill();
    const s = ui.curLabel || '';
    if (s && this.lod) {
      this.font(9.5, 600);
      const tw = ctx.measureText(s).width + 8;
      this.rect(x - tw / 2, y - 21, tw, 13, { fill: alpha(col, 0.18), r: 6 });
      this.text(s, x, y - 14.5, { size: 9.5, weight: 600, color: col, align: 'center' });
    }
    ctx.restore();
  }

  drawRecord(c, o, col) {
    this.cardHead(c, o.name, `${o.typeName} · ${o.size} Б`, col);
    if (!this.lod) return;
    const shown = o.cells.slice(0, 24);
    const x = c.x + 12;
    shown.forEach((cell, i) => {
      const y = c.y + 34 + i * 22 + 11;
      const fl = o.ui?.flashCell === i ? this.flashA(o.ui.flash, 900) : 0;
      if (fl) this.rect(c.x + 6, y - 10, c.w - 12, 20, { fill: alpha(col, fl * 0.2), r: 3 });
      else if (i % 2 === 0) this.rect(c.x + 6, y - 10, c.w - 12, 20, { fill: C.zebra, r: 3 });
      this.text(cell.label.replace(/^\./, ''), x + 4, y, { size: 11.5, color: C.text2, maxW: c.w * 0.4 });
      this.text(cell.typeName, x + c.w * 0.42, y, { size: 10, color: C.faint, maxW: c.w * 0.2 });
      if (!cell.init) {
        const hw = Math.min(64, c.w * 0.3);
        this.hatch(c.x + c.w - 12 - hw, y - 8, hw, 16);
        this.text('мусор', c.x + c.w - 12 - hw / 2, y, { size: 10, color: C.red, align: 'center', mono: false });
        return;
      }
      const v = cell.ptr !== undefined ? (cell.ptr === 0 ? 'NULL' : '→ ' + (cell.desc || cell.display)) : cell.display;
      this.text(v, c.x + c.w - 14, y, { size: 12, color: C.text, align: 'right', maxW: c.w * 0.36 });
    });
  }

  drawFiles(r) {
    this.drawPanel(r, 'файлы', 'виртуальный диск программы');
    let y = r.y + 40;
    for (const f of r.files) {
      const fl = this.flashA(f.flash, 900);
      const lines = (f.text || '').split('\n');
      const n = Math.min(6, lines.length);
      const h = 26 + n * 17;
      this.rect(r.x + 14, y, r.w - 28, h, { fill: fl ? alpha(C.yellow, fl * 0.06) : C.card, stroke: alpha(C.yellow, 0.3 + fl * 0.4), r: 4 });
      this.text(f.name, r.x + 24, y + 13, { size: 12, color: C.yellow });
      this.text(f.state || '', r.x + r.w - 24, y + 13, { size: 10, color: C.muted, align: 'right', mono: false });
      lines.slice(0, n).forEach((l, i) => this.text(l + (i < lines.length - 1 ? '↵' : ''), r.x + 24, y + 30 + i * 17, { size: 11, color: C.text2, maxW: r.w - 60 }));
      y += h + 8;
    }
  }

  // ——— стрелки указателей ———
  drawPointers(L) {
    const ctx = this.ctx;
    for (const c of L.cards.values()) {
      const o = c.o;
      if (o.dying) continue;
      o.cells.forEach((cell, i) => {
        if (cell.ptr === undefined || !cell.target || !cell.init) return;
        const tc = L.cards.get(cell.target);
        if (!tc || tc === c) return;
        const from = this.cellAnchor(c, i);
        const to = { x: tc.x, y: tc.y + 18 };
        const toRight = { x: tc.x + tc.w, y: tc.y + 18 };
        const end = Math.abs(toRight.x - from.x) < Math.abs(to.x - from.x) ? toRight : to;
        const sel = this.scene.selected === 'obj:' + o.id || this.scene.selected === 'obj:' + tc.o.id;
        ctx.strokeStyle = sel ? alpha(C.ptr, 0.95) : alpha(C.ptr, 0.45);
        ctx.lineWidth = this.px(sel ? 1.5 : 1);
        const mx = Math.max(from.x, end.x) + 40;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(mx, from.y, mx, end.y, end.x, end.y);
        ctx.stroke();
        const ang = Math.atan2(end.y - end.y, end.x - mx);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - Math.cos(ang - 0.4) * 8, end.y - Math.sin(ang - 0.4) * 8);
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - Math.cos(ang + 0.4) * 8, end.y - Math.sin(ang + 0.4) * 8);
        ctx.stroke();
      });
    }
  }

  cellAnchor(c, i) {
    const o = c.o;
    if (o.shape === 'scalar' || i == null || i < 0) return { x: c.x + c.w, y: c.y + c.h / 2 };
    if (o.shape === 'record') return { x: c.x + c.w, y: c.y + 34 + i * 22 + 11 };
    const perRow = Math.max(1, Math.floor((c.w - 40) / G.cellW));
    return { x: c.x + 14 + (i % perRow) * G.cellW + G.cellW / 2, y: c.y + 34 + Math.floor(i / perRow) * (G.cellH + 16) + 12 };
  }

  anchor(ref, L) {
    if (!ref) return null;
    if (ref.obj) {
      const c = L.cards.get(ref.obj);
      if (!c) return null;
      if (ref.cell != null && c.o.shape !== 'scalar') { const p = this.cellAnchor(c, ref.cell); return { x: p.x - 10, y: p.y }; }
      return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    }
    const comp = L.computer;
    if (ref.screen) return { x: comp.x + 250, y: comp.y + 36 + comp.screenLines * 10 + 16 };
    if (ref.input) return { x: comp.x + comp.w - 140, y: comp.y + 80 };
    if (ref.core) return { x: comp.x + comp.w / 2, y: comp.y + comp.h };
    if (ref.frame) { const b = L.frames.get(ref.frame); return b ? { x: b.x + b.w / 2, y: b.y + 20 } : null; }
    if (ref.frameLine) { const b = L.frames.get(ref.frameLine); return b ? { x: b.codeX + b.codeW, y: b.codeY + (b.fr.curLine - b.fr.span.start) * G.lineH + G.lineH / 2 } : null; }
    return null;
  }

  drawAnim(a, L) {
    const t = (this.t - a.t0) / a.dur;
    if (t < 0 || t > 1 || a.type !== 'beam') return;
    const p0 = this.anchor(a.from, L), p1 = this.anchor(a.to, L);
    if (!p0 || !p1) return;
    const ctx = this.ctx;
    const k = ease(Math.min(1, t * 1.3));
    const hx = p0.x + (p1.x - p0.x) * k, hy = p0.y + (p1.y - p0.y) * k;
    const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = alpha(a.color, 0.7);
    ctx.lineWidth = this.px(1.2);
    ctx.setLineDash([this.px(4), this.px(3)]);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = a.color;
    ctx.beginPath(); ctx.arc(hx, hy, this.px(3), 0, TAU); ctx.fill();
    if (a.label && k < 1) {
      this.font(11);
      const s = this.fit(String(a.label).replace(/\n/g, '↵'), 180);
      const w = this.ctx.measureText(s).width + 10;
      this.rect(hx + 8, hy - 20, w, 18, { fill: C.bg, stroke: alpha(a.color, 0.7), r: 3 });
      this.text(s, hx + 13, hy - 11, { size: 11, color: a.color });
    }
    ctx.restore();
  }
}

function typeDesc(t) {
  const m = {
    int: 'целые числа', 'unsigned int': 'целые ≥ 0', short: 'короткие целые', long: 'большие целые', 'long long': 'большие целые',
    'unsigned long': 'большие целые ≥ 0', size_t: 'размеры/количества', char: 'символ (код)', 'unsigned char': 'байт 0…255',
    float: 'дробные, ~7 цифр', double: 'дробные, ~15 цифр', _Bool: 'логическое 0/1', bool: 'логическое 0/1',
  };
  if (m[t]) return m[t];
  if (t.startsWith('enum')) return 'перечисление (целое)';
  if (t.includes('*')) return 'адрес';
  return '';
}
