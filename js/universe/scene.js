// Состояние вселенной: объекты (законы, звёзды-константы, области функций,
// переменные, циклы, ветвления) и анимации (лучи, импульсы).
import { HEADERS } from '../compiler/stdlib.js';

export const TYPE_COLORS = {
  int: '#c8f05a', 'unsigned int': '#c8f05a', short: '#c8f05a', 'unsigned short': '#c8f05a',
  long: '#8fd46a', 'unsigned long': '#8fd46a', 'long long': '#8fd46a', 'unsigned long long': '#8fd46a',
  char: '#e3b36b', 'unsigned char': '#e3b36b', 'signed char': '#e3b36b',
  float: '#e9d85c', double: '#e9d85c', 'long double': '#e9d85c',
  bool: '#a9d6a0',
};
const LAW_COLORS = ['#8fd46a', '#c8f05a', '#e9d85c', '#a9b89a', '#d6c27a'];
export const colorForType = (t) => {
  if (!t) return '#b3b8a9';
  if (t.includes('[')) return colorForType(t.replace(/\[.*$/, ''));
  if (t.includes('*')) return '#b3b8a9';
  return TYPE_COLORS[t] || '#b3b8a9';
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
}

const SLOT_ANGLES = [0, 58, -58, 116, -116, 174];
function slotPos(slot) {
  if (slot === 0) return { x: 700, y: 0 };
  if (slot < SLOT_ANGLES.length) {
    const a = (SLOT_ANGLES[slot] * Math.PI) / 180;
    return { x: Math.cos(a) * 980, y: Math.sin(a) * 980 };
  }
  const k = slot - SLOT_ANGLES.length;
  const ring = Math.floor(k / 12);
  const a = ((k % 12) * 30 + 15 + ring * 7) * (Math.PI / 180);
  const R = 1650 + ring * 760;
  return { x: Math.cos(a) * R, y: Math.sin(a) * R };
}

export class Scene {
  constructor() {
    this.listeners = new Set();
    this.reset();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { this.version++; for (const fn of this.listeners) fn(this); }

  reset() {
    this.entities = new Map();
    this.anims = [];
    this.frameStack = [];
    this.slots = [];
    this.now = performance.now();
    this.version = (this.version || 0) + 1;
    this.focus = null; // куда смотреть камере
    this.selected = null;
    this.coreFlash = 0;
    this.program = null;
    this.spans = new Map();
    this.funcSpans = new Map();
    this.entities.set('core', { kind: 'core', id: 'core', name: 'Компьютер', x: 0, y: 0, r: 64 });
    this.lawCount = 0;
    this.constCount = 0;
    this.lastLine = 0;
    this.changed();
  }

  /** Сведения о программе: границы функций и конструкций в строках. */
  setProgram(compiled) {
    this.program = compiled;
    const src = compiled.source;
    const lineOf = (off) => { let n = 1; for (let i = 0; i < off && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; };
    const walk = (n, depth) => {
      if (!n || typeof n !== 'object') return;
      if (['For', 'While', 'DoWhile', 'If', 'Switch'].includes(n.type)) {
        this.spans.set(n.id, { line: n.line, endLine: lineOf(n.end), depth });
        depth++;
      }
      for (const v of Object.values(n)) {
        if (Array.isArray(v)) v.forEach((x) => walk(x, depth));
        else if (v && typeof v === 'object' && v.type) walk(v, depth);
      }
    };
    for (const f of compiled.program?.funcs || []) {
      if (f.type !== 'FuncDef') continue;
      this.funcSpans.set(f.name, { start: f.line, end: f.body.endLine });
      walk(f.body, 0);
    }
  }

  get current() { return this.frameStack[this.frameStack.length - 1] || null; }

  regionOf(id) { return this.entities.get(id); }

  lineY(region, line) {
    const top = region.y - region.r * 0.74, bottom = region.y + region.r * 0.74;
    const { start, end } = region.span;
    const t = end > start ? (line - start) / (end - start) : 0.5;
    return top + Math.max(0, Math.min(1, t)) * (bottom - top);
  }
  spineX(region) { return region.x - region.r * 0.6; }

  probePos(frameId) {
    const r = this.entities.get(frameId || this.current);
    if (!r) return { x: 0, y: 0 };
    return { x: this.spineX(r), y: this.lineY(r, r.probeLine || r.span.start) };
  }

  // ——— анимации ———
  anim(a) {
    a.t0 = this.now + (a.delay || 0);
    if (!a.dur) { a.onDone?.(); return; }
    this.anims.push(a);
    if (this.anims.length > 80) {
      const old = this.anims.shift();
      old.onDone?.();
    }
  }

  pos(ref) {
    if (!ref) return { x: 0, y: 0 };
    if (typeof ref === 'string') {
      if (ref.startsWith('probe:')) return this.probePos(ref.slice(6));
      const e = this.entities.get(ref);
      return e ? { x: e.x, y: e.y } : { x: 0, y: 0 };
    }
    return ref;
  }

  tick(now) {
    this.now = now;
    const keep = [];
    for (const a of this.anims) {
      const t = (now - a.t0) / a.dur;
      if (t >= 1) a.onDone?.();
      else keep.push(a);
    }
    this.anims = keep;
    for (const e of this.entities.values()) {
      if (e.dying && now - e.dying > 1400) this.entities.delete(e.id);
    }
  }

  // ——— размещение ———
  placeVar(region, name, big) {
    const rand = rng(hash(name + '|' + region.func + '|' + region.depth));
    const others = [...this.entities.values()].filter(e => e.kind === 'var' && e.regionId === region.id && !e.dying);
    const minD = big ? 150 : 108;
    const sx = this.spineX(region);
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 40; k++) {
      const x = sx + 110 + rand() * (region.x + region.r * 0.8 - sx - 110);
      const y = region.y - region.r * 0.72 + rand() * region.r * 1.44;
      const dx = x - region.x, dy = y - region.y;
      if (Math.hypot(dx, dy) > region.r * (big ? 0.72 : 0.8)) continue;
      let dmin = Infinity;
      for (const o of others) dmin = Math.min(dmin, Math.hypot(o.x - x, (o.y - y) * 1.3) - (o.isArray ? 60 : 0));
      if (dmin >= minD) return { x, y };
      if (dmin > bestScore) { bestScore = dmin; best = { x, y }; }
    }
    if (!best || bestScore < 40) {
      // область переполнена — расширяем её
      region.r *= 1.08;
      return this.placeVar(region, name + '*', big);
    }
    return best;
  }

  newRegion(frame, extra) {
    let slot = -1;
    if (frame.id !== 'global') {
      slot = this.slots.findIndex(s => !s);
      if (slot < 0) slot = this.slots.length;
      this.slots[slot] = frame.id;
    }
    const p = frame.id === 'global' ? { x: 0, y: -600 } : slotPos(slot);
    const span = this.funcSpans.get(frame.func) || { start: 1, end: 10 };
    const r = frame.id === 'global' ? 250 : 340;
    const region = {
      kind: 'region', id: frame.id, func: frame.func, name: frame.id === 'global' ? 'глобальная область' : frame.func + '()',
      x: p.x, y: p.y, r, depth: frame.depth ?? 0, slot, span, probeLine: span.start, born: this.now,
      parentId: frame.parentId, ...extra,
    };
    this.entities.set(region.id, region);
    return region;
  }

  structure(nodeId, kind, extra = {}) {
    const fr = this.current;
    const id = `${kind}:${nodeId}:${fr}`;
    let s = this.entities.get(id);
    if (!s) {
      const region = this.entities.get(fr);
      if (!region) return null;
      const span = this.spans.get(nodeId) || { line: extra.line, endLine: extra.line, depth: 0 };
      s = {
        kind, id, nodeId, regionId: fr, line: span.line, endLine: span.endLine, nest: span.depth,
        x: this.spineX(region), y: this.lineY(region, span.line), iter: 0, hits: 0, born: this.now, ...extra,
      };
      this.entities.set(id, s);
    }
    return s;
  }

  // ——— применение событий ———
  apply(ev, dur = 600) {
    const now = this.now;
    switch (ev.type) {
      case 'include': {
        const h = HEADERS[ev.header];
        const i = this.lawCount++;
        const law = {
          kind: 'law', id: 'law:' + ev.header, name: '<' + ev.header + '>', header: ev.header, title: h.title, law: h.law,
          color: LAW_COLORS[i % LAW_COLORS.length], radius: 120 + i * 40, angle: -Math.PI / 2 + i * 0.9, funcs: Object.keys(h.funcs), consts: Object.keys(h.consts),
          line: ev.line, born: now,
        };
        law.x = Math.cos(law.angle) * law.radius;
        law.y = Math.sin(law.angle) * law.radius;
        this.entities.set(law.id, law);
        this.anim({ type: 'ring', at: { x: 0, y: 0 }, r0: 60, r1: law.radius, color: law.color, dur: dur * 1.2 });
        break;
      }
      case 'define': {
        const i = this.constCount++;
        const a = -Math.PI * 0.8 + (i % 7) * 0.26 + Math.floor(i / 7) * 0.13;
        const R = 560 + Math.floor(i / 7) * 90;
        const st = { kind: 'const', id: 'def:' + ev.name, name: ev.name, text: ev.text, x: Math.cos(a) * R - 380, y: Math.sin(a) * R * 0.55 - 250, line: ev.line, born: now };
        this.entities.set(st.id, st);
        this.anim({ type: 'beam', from: 'core', to: st.id, color: '#e9d85c', dur, label: ev.text });
        break;
      }
      case 'frame-enter': {
        const parent = this.current;
        const region = this.newRegion(ev.frame, { args: ev.args, ret: ev.ret, callLine: ev.callLine });
        this.frameStack.push(ev.frame.id);
        this.focus = region.id;
        if (parent) this.anim({ type: 'beam', from: 'probe:' + parent, to: region.id, color: '#b3b8a9', dur: dur * 1.2, label: ev.frame.func + '(' + ev.args.map(a => a.display).join(', ') + ')' });
        else this.anim({ type: 'beam', from: 'core', to: region.id, color: '#b3b8a9', dur: dur * 1.2, label: 'main()' });
        this.anim({ type: 'ring', at: region.id, r0: 20, r1: region.r, color: '#b3b8a9', dur: dur * 1.4 });
        break;
      }
      case 'frame-exit': {
        const region = this.entities.get(ev.frameId);
        this.frameStack.pop();
        const parent = this.current;
        if (region && ev.func === 'main') {
          region.ended = true;
          region.ret = ev.ret;
        } else if (region) {
          region.dying = now + dur;
          region.ret = ev.ret;
          this.slots[region.slot] = null;
          for (const e of this.entities.values()) if (e.regionId === region.id && !e.dying) e.dying = now + dur;
          if (parent && ev.ret != null) this.anim({ type: 'beam', from: region.id, to: 'probe:' + parent, color: '#8fd46a', dur, label: ev.ret });
        }
        this.focus = parent;
        break;
      }
      case 'var': {
        const c = ev.cell;
        const region = this.entities.get(c.frameId) || (c.frameId === 'global' ? this.newRegion({ id: 'global', func: '(глобальные)', depth: 0 }) : null);
        if (!region) break;
        const p = this.placeVar(region, c.name, c.isArray);
        const v = {
          kind: 'var', id: c.id, name: c.name, typeName: c.typeName, display: c.display, shown: c.isArray ? null : (dur ? '…' : c.display), init: c.init,
          isArray: c.isArray, len: c.len, elems: c.elems ? [...c.elems] : null, shownElems: c.elems ? [...c.elems] : null,
          addr: c.addr, size: c.size, regionId: region.id, x: p.x, y: p.y, line: ev.line, born: now, isParam: c.isParam, global: c.global,
          history: [{ line: ev.line, display: c.isArray ? '[…]' : c.display, how: ev.via }], color: colorForType(c.typeName), flash: now,
        };
        this.entities.set(v.id, v);
        const done = () => { v.shown = v.display; v.flash = this.now; };
        if (ev.via === 'param') this.anim({ type: 'beam', from: 'probe:' + region.id, to: v.id, color: v.color, dur: dur * 0.7, onDone: done });
        else this.anim({ type: 'beam', from: 'core', to: v.id, color: '#c8f05a', dur, width: 1.4, label: c.init ? c.display : null, onDone: done, detect: true });
        break;
      }
      case 'write': {
        const v = this.entities.get(ev.id);
        if (!v) break;
        const done = () => {
          if (ev.elemsUpdate) v.shownElems = [...ev.elemsUpdate];
          else if (ev.elemIndex !== undefined && v.shownElems) v.shownElems[ev.elemIndex] = ev.display;
          else v.shown = ev.display;
          v.flash = this.now;
          v.flashIdx = ev.elemIndex;
        };
        if (ev.elemsUpdate) v.elems = [...ev.elemsUpdate];
        else if (ev.elemIndex !== undefined && v.elems) v.elems[ev.elemIndex] = ev.display;
        else v.display = ev.display;
        v.init = true;
        v.garbage = false;
        v.history.push({ line: ev.line, display: ev.elemIndex !== undefined ? `[${ev.elemIndex}] = ${ev.display}` : ev.display, how: ev.via });
        if (v.history.length > 60) v.history.splice(1, v.history.length - 60);
        if (ev.via === 'scanf') {
          this.coreFlash = now;
          this.anim({ type: 'beam', from: 'core', to: v.id, color: '#e9d85c', dur, width: 2.2, label: ev.inputText ?? ev.display, onDone: done });
        } else {
          const srcs = (ev.sources || []).filter(s => s.id !== ev.id && this.entities.has(s.id));
          const uniq = [...new Map(srcs.map(s => [s.id, s])).values()];
          if (uniq.length) {
            uniq.forEach((s, i) => this.anim({ type: 'beam', from: s.id, to: v.id, color: this.entities.get(s.id).color, dur, label: i === 0 ? null : null, onDone: i === 0 ? done : undefined }));
            this.anim({ type: 'float', at: v.id, text: ev.display, color: v.color, dur: dur * 1.3, delay: dur * 0.6 });
          } else {
            this.anim({ type: 'beam', from: 'probe:' + (this.current || v.regionId), to: v.id, color: v.color, dur, label: ev.display, onDone: done });
          }
        }
        this.focus = v.regionId;
        break;
      }
      case 'uninit': {
        const v = this.entities.get(ev.id);
        if (v) { v.garbage = true; if (ev.elemIndex === undefined) { v.display = ev.display; v.shown = ev.display; } this.anim({ type: 'ring', at: v.id, r0: 10, r1: 70, color: '#e0705f', dur }); }
        break;
      }
      case 'scope-exit':
        for (const id of ev.ids) { const v = this.entities.get(id); if (v) v.dying = now + dur * 0.5; }
        break;
      case 'output': {
        this.coreFlash = now;
        this.screenBuf = ((this.screenBuf || '') + ev.text).slice(-400);
        this.screenLines = this.screenBuf.split('\n').filter((l, i, a) => l || i === a.length - 1).slice(-3);
        const srcs = [...new Map((ev.sources || []).filter(s => this.entities.has(s.id)).map(s => [s.id, s])).values()];
        if (srcs.length) srcs.forEach(s => this.anim({ type: 'beam', from: s.id, to: 'core', color: '#8fd46a', dur, label: s.display }));
        else this.anim({ type: 'beam', from: 'probe:' + this.current, to: 'core', color: '#8fd46a', dur, label: ev.text.replace(/\n/g, '⏎').slice(0, 24) });
        this.anim({ type: 'screen', text: ev.text, dur: dur * 2.2, delay: dur * 0.8 });
        break;
      }
      case 'input-wait':
        this.coreFlash = now;
        this.waitingInput = true;
        break;
      case 'input':
        this.waitingInput = false;
        break;
      case 'cond': {
        const kind = ev.kind === 'if' ? 'branch' : 'loop';
        const s = this.structure(ev.nodeId, kind, { line: ev.line, text: ev.text, loopKind: ev.kind });
        if (!s) break;
        s.lastValue = ev.value;
        s.hits++;
        s.flash = now;
        s.text = ev.text;
        if (kind === 'loop') { s.iterDone = ev.iter; if (!ev.value) s.active = false; }
        this.anim({ type: 'ring', at: s.id, r0: 8, r1: 46, color: ev.value ? '#8fd46a' : '#e0705f', dur: dur * 0.9 });
        for (const r of ev.reads || []) if (this.entities.has(r.id)) this.anim({ type: 'beam', from: r.id, to: s.id, color: '#767d6c', dur: dur * 0.8, width: 0.8 });
        break;
      }
      case 'switch': {
        const s = this.structure(ev.nodeId, 'branch', { line: ev.line, text: 'switch (' + ev.text + ')', isSwitch: true });
        if (!s) break;
        s.lastValue = true; s.hits++; s.flash = now; s.switchValue = ev.display;
        for (const r of ev.reads || []) if (this.entities.has(r.id)) this.anim({ type: 'beam', from: r.id, to: s.id, color: '#767d6c', dur: dur * 0.8, width: 0.8 });
        break;
      }
      case 'loop-enter': {
        const s = this.structure(ev.nodeId, 'loop', { line: ev.line, text: ev.text, loopKind: ev.kind, head: ev.head });
        if (s) { s.active = true; s.iter = 0; s.runs = (s.runs || 0) + 1; s.flash = now; s.head = ev.head; }
        break;
      }
      case 'loop-iter': {
        const s = this.entities.get(`loop:${ev.nodeId}:${this.current}`);
        if (s) { s.iter = ev.iter; s.totalIter = (s.totalIter || 0) + 1; s.spin = now; }
        break;
      }
      case 'loop-exit': {
        const s = this.entities.get(`loop:${ev.nodeId}:${this.current}`);
        if (s) { s.active = false; s.exitReason = ev.reason; s.flash = now; }
        break;
      }
      case 'return': {
        const r = this.entities.get(this.current);
        if (r) r.ret = ev.display;
        break;
      }
      case 'exit':
        this.finished = { code: ev.code };
        break;
      case 'locale':
        this.locale = ev.comma ? 'ru' : 'C';
        break;
    }
  }

  /** Переместить «зонд» выполнения на строку. */
  setLine(line) {
    this.lastLine = line;
    const r = this.entities.get(this.current);
    if (r && line >= r.span.start && line <= r.span.end) r.probeLine = line;
  }

  /** Все живые объекты для вкладки «Процессы». */
  tree() {
    const all = [...this.entities.values()].filter(e => !e.dying);
    const laws = all.filter(e => e.kind === 'law');
    const consts = all.filter(e => e.kind === 'const');
    const regions = all.filter(e => e.kind === 'region').sort((a, b) => a.depth - b.depth);
    return {
      laws, consts,
      regions: regions.map(r => ({
        region: r,
        vars: all.filter(e => e.kind === 'var' && e.regionId === r.id).sort((a, b) => a.line - b.line),
        structs: all.filter(e => (e.kind === 'loop' || e.kind === 'branch') && e.regionId === r.id).sort((a, b) => a.line - b.line),
      })),
    };
  }
}
