// Состояние «вселенной»: компьютер (экран + буфер ввода), кадры стека функций
// (листинг кода, карточки переменных, таблицы трассировки циклов), куча, файлы.
// Раскладка — строгая сетка, поэтому ничего не накладывается.
import { settings } from '../ui/settings.js';

export const TYPE_COLORS = {
  int: '#c8f05a', 'unsigned int': '#c8f05a', short: '#c8f05a', 'unsigned short': '#c8f05a', 'enum': '#c8f05a',
  long: '#8fd46a', 'unsigned long': '#8fd46a', 'long long': '#8fd46a', 'unsigned long long': '#8fd46a', size_t: '#8fd46a',
  char: '#e3b36b', 'unsigned char': '#e3b36b', 'signed char': '#e3b36b',
  float: '#e9d85c', double: '#e9d85c', 'long double': '#e9d85c',
  _Bool: '#a9d6a0', bool: '#a9d6a0',
};
export const colorForType = (t) => {
  if (!t) return '#b3b8a9';
  if (t.includes('(*)')) return '#b3b8a9';
  if (t.includes('*')) return '#9fc7a8';
  if (t.startsWith('struct') || t.startsWith('union')) return '#d6c27a';
  const base = t.replace(/\[.*$/, '').replace(/^enum.*/, 'enum').trim();
  return TYPE_COLORS[base] || '#b3b8a9';
};

// ——— геометрия (мировые единицы) ———
export const G = {
  colW: 800,
  pad: 14,
  codeW: 300,
  cardW: 222,
  cardGap: 12,
  scalarH: 60,
  lineH: 19,
  cellW: 48,
  cellH: 34,
  sideX: 860,
  sideW: 420,
};
G.varsX = G.pad + G.codeW + 16;
G.varsW = G.colW - G.varsX - G.pad;

export class Scene {
  constructor() {
    this.listeners = new Set();
    this.reset();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  reset() {
    this.now = performance.now();
    this.version = (this.version || 0) + 1;
    this.objects = new Map();        // id -> объект (снимок + состояние отображения)
    this.frames = new Map();         // id -> кадр
    this.frameOrder = [];
    this.frameStack = [];
    this.anims = [];
    this.derefs = [];
    this.bpHit = null;
    this.crashed = null;                // импульсы по стрелкам указателей (*p = …)
    this.swap = null;                // последний обнаруженный обмен значений
    this.lastScalarW = null;
    this.headers = [];
    this.defines = [];
    this.files = new Map();
    this.screen = { lines: [''], ended: [], lastAt: 0, fresh: 0, starts: [0], total: 0 };
    this.inputBuf = { text: '', consumedAt: 0, recent: '' };
    this.waitingInput = false;
    this.selected = null;
    this.focus = null;
    this.program = null;
    this.srcLines = [];
    this.spans = new Map();
    this.funcSpans = new Map();
    this.boxes = [];                 // прямоугольники для попаданий курсора
    this.stderrLines = [];
    this.finished = null;
    this.locale = 'C';
  }

  setProgram(compiled) {
    this.program = compiled;
    this.srcLines = compiled.source.split('\n');
    const src = compiled.source;
    const lineOf = (off) => { let n = 1; for (let i = 0; i < off && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; };
    const walk = (n, depth) => {
      if (!n || typeof n !== 'object') return;
      if (['For', 'While', 'DoWhile', 'If', 'Switch'].includes(n.type)) {
        this.spans.set(n.id, { line: n.line, endLine: lineOf(n.end), depth, type: n.type });
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
  frame(id) { return this.frames.get(id); }

  // ——— анимации ———
  anim(a) {
    if (a.type === 'beam' && !settings.get('run.beams')) { a.onDone?.(); return; }
    a.t0 = this.now + (a.delay || 0);
    if (!a.dur) { a.onDone?.(); return; }
    this.anims.push(a);
    if (this.anims.length > 60) this.anims.shift().onDone?.();
  }
  tick(now) {
    this.now = now;
    this.anims = this.anims.filter(a => { if ((now - a.t0) / a.dur >= 1) { a.onDone?.(); return false; } return true; });
    for (const [id, o] of this.objects) if (o.dying && now > o.dying + 700) this.objects.delete(id);
    for (const [id, f] of this.frames) if (f.dying && now > f.dying + 700) { this.frames.delete(id); this.frameOrder = this.frameOrder.filter(x => x !== id); }
  }

  // ——— экран ———
  printText(text, fresh = true, dur = 0) {
    const scr = this.screen;
    scr.starts ||= [0];
    scr.total ||= 0;
    const from = scr.total;
    for (const ch of text) {
      if (ch === '\r') continue;
      scr.total++;
      if (ch === '\n') { scr.ended[scr.lines.length - 1] = true; scr.lines.push(''); scr.starts.push(scr.total); }
      else scr.lines[scr.lines.length - 1] += ch;
    }
    if (scr.lines.length > 400) { const k = scr.lines.length - 300; scr.lines.splice(0, k); scr.ended.splice(0, k); scr.starts.splice(0, k); }
    if (fresh) {
      scr.lastAt = this.now; scr.fresh = text;
      // печатная машинка: новые символы появляются по одному
      scr.typeFrom = from; scr.typeTo = scr.total; scr.typeAt = this.now;
      scr.typeDur = dur && settings.get('run.typewriter') ? Math.min(dur * 0.9, 30 + (scr.total - from) * 28) : 0;
    }
  }

  // ——— применение событий ———
  apply(ev, dur = 600) {
    const now = this.now;
    switch (ev.type) {
      case 'include': this.headers.push({ name: ev.header, line: ev.line }); break;
      case 'define': this.defines.push({ name: ev.name, text: ev.text, params: ev.params, line: ev.line }); break;
      case 'frame-enter': {
        const span = this.funcSpans.get(ev.frame.func) || { start: ev.line, end: ev.line };
        const fr = {
          id: ev.frame.id, func: ev.frame.func, depth: ev.frame.depth, parentId: ev.frame.parentId, span,
          curLine: span.start, visited: new Set([span.start]), loops: new Map(), ifs: new Map(), vars: [],
          args: ev.args, callLine: ev.callLine, ret: null, retType: ev.ret, born: now,
        };
        const caller = this.current;
        this.frames.set(fr.id, fr);
        this.frameOrder.push(fr.id);
        this.frameStack.push(fr.id);
        if (caller && fr.func !== 'main') {
          const label = `${fr.func}(${(ev.args || []).map(x => shortVal(x.display)).join(', ')})`;
          this.anim({ type: 'beam', from: { frameLine: caller }, to: { frame: fr.id }, color: '#d9a6f0', dur, label, delay: 60 });
        }
        this.focus = fr.id;
        break;
      }
      case 'frame-exit': {
        const fr = this.frames.get(ev.frameId);
        this.frameStack.pop();
        if (fr) {
          fr.ret = ev.ret;
          fr.ended = true;
          if (fr.func !== 'main') {
            fr.dying = now + dur * 1.2;
            fr.closeAt = now;
            for (const id of fr.vars) { const o = this.objects.get(id); if (o) o.dying = now + dur; }
            const parent = this.current;
            if (parent && ev.ret != null) this.anim({ type: 'beam', from: { frame: fr.id }, to: { frameLine: parent }, color: '#8fd46a', dur, label: ev.ret });
          }
        }
        this.focus = this.current;
        break;
      }
      case 'var': this.addObject(ev.obj, ev, dur); break;
      case 'alloc': this.addObject(ev.obj, ev, dur); break;
      case 'heap-view': {
        const o = this.objects.get(ev.objId);
        if (o) Object.assign(o, { ...ev.snap, ui: o.ui });
        break;
      }
      case 'free': {
        const o = this.objects.get(ev.objId);
        if (o) { o.freed = true; o.dying = now + dur * 2; }
        break;
      }
      case 'write': {
        const o = this.objects.get(ev.objId);
        if (!o) break;
        const before = o.shape === 'scalar' && o.cells[0]?.init ? o.cells[0].display : null;
        if (o.shape === 'array' && ev.cell >= 0) {
          // курсор индекса: переезжает от прошлой записанной ячейки к новой
          o.ui.curFrom = o.ui.curTo ?? ev.cell;
          o.ui.curTo = ev.cell;
          o.ui.curAt = now;
          o.ui.curLabel = (ev.path || '').replace(/^[^[]*/, '') || `[${ev.cell}]`;
        }
        // обмен значений: a[i] и a[j] (или x и y) поменялись местами через временную переменную
        if (o.shape === 'array' && ev.cell >= 0) {
          const lw = o.ui.lastW;
          if (lw && lw.cell !== ev.cell && now - lw.at < 15000 && ev.display === lw.old && o.cells[lw.cell]?.display === ev.old && ev.old !== ev.display)
            this.swap = { a: { obj: o.id, cell: lw.cell }, b: { obj: o.id, cell: ev.cell }, at: now, x: ev.display, y: ev.old };
          o.ui.lastW = { cell: ev.cell, old: ev.old, val: ev.display, at: now };
        } else if (o.shape === 'scalar' && !ev.target) {
          const lw = this.lastScalarW;
          if (lw && lw.obj !== o.id && now - lw.at < 15000 && ev.display === lw.old && this.objects.get(lw.obj)?.cells[0]?.display === ev.old && ev.old !== ev.display)
            this.swap = { a: { obj: lw.obj }, b: { obj: o.id }, at: now, x: ev.display, y: ev.old };
          this.lastScalarW = { obj: o.id, old: ev.old, val: ev.display, at: now };
        }
        // запись через указатель: импульс бежит по стрелке от указателя к цели
        for (const s of ev.sources || []) {
          const po = this.objects.get(s.objId);
          if (po && po.shape === 'scalar' && po.cells[0]?.target === o.id) { this.derefs.push({ from: po.id, to: o.id, at: now }); if (this.derefs.length > 8) this.derefs.shift(); }
        }
        if (ev.snap) Object.assign(o, { ...ev.snap, ui: o.ui });
        else if (ev.cell >= 0 && o.cells[ev.cell]) {
          const c = o.cells[ev.cell];
          if (ev.target !== undefined && c.target !== ev.target) c.ptrAt = now; // стрелка будет «прорисовываться»
          c.display = ev.display; c.init = true;
          if (ev.target !== undefined) { c.target = ev.target; c.targetPath = ev.targetPath; c.desc = ev.desc; c.ptr = 1; }
        }
        o.garbage = false;
        // переполнение: значение «перекрутилось» через край диапазона типа
        {
          const po = this.pendingOvf;
          let wrap = po && po.line === ev.line && now - po.at < 5000 ? { from: po.exact, to: ev.display } : null;
          const a = parseFloat(String(ev.old)), b = parseFloat(String(ev.display));
          if (!wrap && Number.isFinite(a) && Number.isFinite(b) && !String(ev.typeName || '').includes('*')) {
            const incr = ev.op === '++' || (ev.op === '+=' && !/^\s*-/.test(ev.exprText || ''));
            const decr = ev.op === '--' || (ev.op === '-=' && !/^\s*-/.test(ev.exprText || ''));
            if ((incr && b < a) || (decr && b > a)) wrap = { from: incr ? `${a} ${ev.op === '++' ? '+ 1' : '+ ' + ev.exprText}` : `${a} ${ev.op === '--' ? '− 1' : '− ' + ev.exprText}`, to: String(b) };
          }
          if (wrap) { o.ui.ovf = { ...wrap, at: now, cell: ev.cell }; this.pendingOvf = null; }
        }
        if (o.shape === 'scalar') {
          // «одометр»: старое значение уезжает вверх, новое въезжает, рядом — на сколько изменилось
          const after = o.cells[0]?.display;
          if (before !== null && after !== before) {
            o.ui.prevVal = before;
            o.ui.rollAt = now;
            const a = Number(String(before).replace(',', '.')), b = Number(String(after).replace(',', '.'));
            o.ui.delta = Number.isFinite(a) && Number.isFinite(b) && !/['"]/.test(String(after)) ? Math.round((b - a) * 1e6) / 1e6 : null;
          } else o.ui.rollAt = 0;
        }
        this.lastWriteId = ev.objId;
        o.ui.flash = now;
        o.ui.flashCell = ev.cell;
        o.ui.history.push({ line: ev.line, path: ev.path, display: ev.display ?? '…', how: ev.via });
        if (o.ui.history.length > 80) o.ui.history.splice(0, 20);
        this.noteLoopWrite(o, ev);
        const fromIn = ev.via === 'scanf' || ev.via === 'fgets' || ev.via === 'gets' || ev.via === 'fscanf' || ev.via === 'sscanf';
        if (fromIn) this.anim({ type: 'beam', from: { input: true }, to: { obj: o.id, cell: ev.cell }, color: '#e9d85c', dur, label: ev.inputText ?? ev.display });
        else {
          const srcs = [...new Map((ev.sources || []).filter(s => s.objId !== o.id && this.objects.has(s.objId)).map(s => [s.objId, s])).values()];
          for (const s of srcs) { const so = this.objects.get(s.objId); if (so) so.ui.readAt = now; }
          for (const s of srcs.slice(0, 4)) this.anim({ type: 'beam', from: { obj: s.objId }, to: { obj: o.id, cell: ev.cell }, color: colorForType(this.objects.get(s.objId)?.typeName), dur: dur * 0.9, label: s.display != null ? String(s.display) : undefined });
        }
        break;
      }
      case 'uninit': {
        const o = this.objects.get(ev.objId);
        if (o) { o.garbage = !ev.heap; o.ui.flash = now; }
        break;
      }
      case 'scope-exit':
        for (const id of ev.ids) { const o = this.objects.get(id); if (o) o.dying = now + dur * 0.6; }
        break;
      case 'output': {
        if (ev.stream === 'stdout') {
          this.printText(ev.text, true, dur);
          const srcs = [...new Map((ev.sources || []).filter(s => this.objects.has(s.objId)).map(s => [s.objId, s])).values()];
          for (const s of srcs) { const so = this.objects.get(s.objId); if (so) so.ui.readAt = now; }
          for (const s of srcs.slice(0, 4)) this.anim({ type: 'beam', from: { obj: s.objId }, to: { screen: true }, color: '#8fd46a', dur, label: s.display != null ? String(s.display) : undefined });
        } else if (ev.stream === 'stderr') {
          this.stderrLines.push(ev.text);
        } else if (ev.stream === 'file') {
          const f = this.files.get(ev.target) || { name: ev.target };
          f.text = ev.fileText; f.flash = now;
          this.files.set(ev.target, f);
        }
        break;
      }
      case 'file': {
        const f = this.files.get(ev.name) || { name: ev.name, text: '' };
        if (ev.text !== undefined) f.text = ev.text;
        f.state = ev.action === 'open' ? `открыт (“${ev.mode}”)` : ev.action === 'close' ? 'закрыт' : ev.action === 'open-fail' ? 'не найден' : ev.action;
        f.flash = now;
        if (ev.action === 'remove') this.files.delete(ev.name); else this.files.set(ev.name, f);
        break;
      }
      case 'input-wait':
        this.waitingInput = true;
        this.inputBuf.text = ev.buffer ?? this.inputBuf.text;
        break;
      case 'input':
        this.waitingInput = false;
        if (ev.stream === 'stdin') {
          this.inputBuf.recent = (ev.buffer ?? ev.text ?? '').slice(0, ev.consumedLen ?? (ev.text || '').length);
          this.inputBuf.text = (ev.buffer ?? '').slice(ev.consumedLen ?? 0);
          this.inputBuf.consumedAt = now;
          this.inputBuf.eaten = this.inputBuf.recent.length;
        }
        break;
      case 'cond': {
        const fr = this.frames.get(this.current);
        if (!fr) break;
        if (ev.kind === 'if') {
          const s = fr.ifs.get(ev.line) || { hits: 0 };
          s.value = ev.value; s.hits++; s.at = now; s.text = ev.text;
          fr.ifs.set(ev.line, s);
        } else {
          const lp = this.loopOf(fr, ev.nodeId, ev);
          lp.lastCond = ev.value; lp.at = now; lp.checks = (lp.checks || 0) + 1;
          if (lp.checks > 1 && lp.kind !== 'do') lp.backAt = now; // выполнение вернулось к заголовку цикла
          for (const r of ev.reads || []) this.addTraceCol(lp, r.objId, r.path);
          this.closeTraceRow(lp, fr);
          lp.trace.rows.push({ iter: ev.value ? ev.iter + 1 : null, cond: ev.value, vals: {} });
          if (lp.trace.rows.length > 60) lp.trace.rows.splice(0, 20);
          if (!ev.value) lp.active = false;
        }
        break;
      }
      case 'overflow': this.pendingOvf = { line: ev.line, exact: ev.exact, result: ev.result, at: now }; break;
      case 'switch': {
        const fr = this.frames.get(this.current);
        if (fr && ev.caseLine && ev.caseLine !== ev.line) fr.jump = { kind: 'switch', from: ev.line, to: ev.caseLine, at: now };
        if (fr) fr.ifs.set(ev.line, { value: true, sw: ev.display, hits: (fr.ifs.get(ev.line)?.hits || 0) + 1, at: now, text: ev.text, caseLine: ev.caseLine });
        break;
      }
      case 'loop-enter': {
        const fr = this.frames.get(this.current);
        if (!fr) break;
        const lp = this.loopOf(fr, ev.nodeId, ev);
        lp.active = true; lp.iter = 0; lp.runs = (lp.runs || 0) + 1; lp.head = ev.head; lp.kind = ev.kind; lp.at = now;
        // строки прошлого прохода (вложенный цикл) видны, пока не появится первая новая
        lp.trace = { cols: lp.trace?.cols || [], rows: [], prevRows: lp.trace?.rows?.length ? lp.trace.rows : lp.trace?.prevRows };
        fr.loopStack = [...(fr.loopStack || []), lp];
        break;
      }
      case 'loop-iter': {
        const fr = this.frames.get(this.current);
        const lp = fr?.loops.get(ev.nodeId);
        if (lp) {
          lp.iter = ev.iter; lp.total = (lp.total || 0) + 1; lp.iterAt = now;
          if (lp.kind === 'do' && ev.iter > 1) lp.backAt = now;
          if (lp.kind === 'do' && ev.iter === 1) lp.trace.rows.push({ iter: 1, cond: null, vals: {} });
        }
        break;
      }
      case 'loop-exit': {
        const fr = this.frames.get(this.current);
        const lp = fr?.loops.get(ev.nodeId);
        if (lp) {
          lp.active = false; lp.exitReason = ev.reason; lp.at = now; lp.iters = ev.iters;
          this.closeTraceRow(lp, fr);
          fr.loopStack = (fr.loopStack || []).filter(x => x !== lp);
        }
        break;
      }
      case 'jump': {
        // стрелка прыжка в листинге: break — за конец цикла, continue — к заголовку
        const fr = this.frames.get(this.current);
        const lp = fr?.loopStack?.[fr.loopStack.length - 1];
        if (fr && lp && (ev.kind === 'break' || ev.kind === 'continue'))
          fr.jump = { from: ev.line, to: ev.kind === 'break' ? Math.min(lp.endLine + 1, fr.span.end) : lp.line, kind: ev.kind, at: now };
        break;
      }
      case 'exit': this.finished = { code: ev.code, at: now }; break;
      case 'locale': this.locale = ev.comma ? 'ru' : 'C'; break;
    }
  }

  addObject(snap, ev, dur) {
    const o = { ...snap, ui: { born: this.now, flash: this.now, history: [], via: ev.via } };
    o.garbage = snap.shape === 'scalar' && snap.cells.length === 1 && !snap.cells[0].init;
    o.ui.history.push({ line: ev.line, path: snap.name, display: snap.shape === 'scalar' ? snap.cells[0]?.display : '…', how: ev.via || ev.fn });
    const prev = this.objects.get(o.id);
    this.objects.set(o.id, o);
    if (o.kind === 'heap' || o.kind === 'string') return;
    const fr = this.frames.get(o.frameId);
    if (fr && !prev) {
      // повторное объявление в цикле: старую карточку того же имени убираем
      for (const id of fr.vars) { const x = this.objects.get(id); if (x && x.name === o.name && !x.dying && x.line === o.line) x.dying = this.now; }
      fr.vars.push(o.id);
    }
    if (ev.via === 'decl' || ev.via === 'global') this.anim({ type: 'beam', from: { core: true }, to: { obj: o.id }, color: '#c8f05a', dur: dur * 0.8, detect: true });
  }

  loopOf(fr, nodeId, ev) {
    let lp = fr.loops.get(nodeId);
    if (!lp) {
      const span = this.spans.get(nodeId) || { line: ev.line, endLine: ev.line, depth: 0 };
      lp = { nodeId, line: span.line, endLine: span.endLine, depth: span.depth, text: ev.text, kind: ev.kind, trace: { cols: [], rows: [] }, iter: 0 };
      fr.loops.set(nodeId, lp);
    }
    return lp;
  }

  addTraceCol(lp, objId, path) {
    const o = this.objects.get(objId);
    if (!o || o.kind === 'heap' || o.kind === 'string') return;
    const key = path;
    if (!lp.trace.cols.some(c => c.key === key) && lp.trace.cols.length < 5) lp.trace.cols.push({ key, objId, path });
  }

  noteLoopWrite(o, ev) {
    const fr = this.frames.get(this.current);
    const lp = fr?.loopStack?.[fr.loopStack.length - 1];
    if (!lp) return;
    this.addTraceCol(lp, o.id, ev.path);
  }

  closeTraceRow(lp, fr) {
    const row = lp.trace.rows[lp.trace.rows.length - 1];
    if (!row || row.closed) return;
    for (const c of lp.trace.cols) {
      const o = this.objects.get(c.objId);
      if (!o) continue;
      const cell = o.cells.find(x => (o.name + x.label) === c.path) || (o.cells.length === 1 ? o.cells[0] : null);
      row.vals[c.key] = cell ? (cell.init ? shortVal(cell.display) : '?') : '';
    }
    row.closed = true;
  }

  setLine(line) {
    const fr = this.frames.get(this.current);
    if (fr && line >= fr.span.start && line <= fr.span.end) { fr.curLine = line; fr.visited.add(line); }
  }

  // ——— раскладка ———
  /** Вычисляет прямоугольники всех панелей. Вызывается при каждой отрисовке (дёшево). */
  layout(measure) {
    const L = { panels: [], cards: new Map(), frames: new Map() };
    let y = 0;
    // компьютер
    const screenLines = Math.max(3, Math.min(8, this.screen.lines.length + 1));
    const compH = 40 + screenLines * 20 + 16 + 36;
    L.computer = { x: 0, y, w: G.colW, h: compH, screenLines };
    y += compH + 26;
    // глобальные переменные
    const globals = [...this.objects.values()].filter(o => o.frameId === 'global' && !(o.dying && this.now > o.dying));
    if (globals.length) {
      const g = { id: 'global', x: 0, y, w: G.colW, title: 'глобальные переменные', vars: globals };
      const h = this.layoutVars(globals, 0 + G.pad, y + 40, G.colW - 2 * G.pad, L, measure);
      g.h = h + 52;
      L.globals = g;
      y += g.h + 22;
    }
    // кадры стека
    for (const id of this.frameOrder) {
      const fr = this.frames.get(id);
      if (!fr) continue;
      const vars = fr.vars.map(v => this.objects.get(v)).filter(Boolean);
      const nLines = fr.span.end - fr.span.start + 1;
      const codeH = nLines * G.lineH + 16;
      const vx = G.varsX, vy = y + 46;
      let vh = this.layoutVars(vars, vx, vy, G.varsW, L, measure);
      // таблицы трассировки циклов
      const traces = [];
      let ty = vy + vh + (vh ? 14 : 0);
      for (const lp of fr.loops.values()) {
        const all = lp.trace.rows.length ? lp.trace.rows : lp.trace.prevRows || [];
        if (!all.length) continue;
        const rows = Math.min(all.length, 6);
        const th = 30 + 22 + rows * 20 + (all.length > 6 ? 18 : 0) + 8;
        traces.push({ lp, x: vx, y: ty, w: G.varsW, h: th, rows });
        ty += th + 12;
      }
      const contentH = Math.max(codeH, ty - vy);
      const h = 46 + contentH + 16;
      const box = { id, fr, x: 0, y, w: G.colW, h, codeX: G.pad, codeY: y + 46, codeW: G.codeW, traces };
      L.frames.set(id, box);
      y += h + 22;
    }
    L.totalH = y;
    // справа: куча и файлы
    let sy = 0;
    const heap = [...this.objects.values()].filter(o => o.kind === 'heap');
    if (heap.length) {
      const hy = sy + 40;
      const h = this.layoutVars(heap, G.sideX + G.pad, hy, G.sideW - 2 * G.pad, L, measure, true);
      L.heap = { x: G.sideX, y: sy, w: G.sideW, h: h + 54 };
      sy += L.heap.h + 22;
    }
    if (this.files.size) {
      const files = [...this.files.values()];
      const fh = 40 + files.reduce((s, f) => s + 30 + Math.min(6, (f.text || '').split('\n').length) * 17 + 8, 0);
      L.files = { x: G.sideX, y: sy, w: G.sideW, h: fh, files };
      sy += fh + 22;
    }
    L.sideH = sy;
    this.L = L;
    return L;
  }

  /** Раскладывает карточки переменных по сетке: скаляры — в две колонки, массивы/структуры — на всю ширину. */
  layoutVars(objs, x0, y0, w, L, measure, full = false) {
    const cols = full ? 1 : Math.max(1, Math.floor((w + G.cardGap) / (G.cardW + G.cardGap)));
    const cw = full ? w : (w - (cols - 1) * G.cardGap) / cols;
    let y = y0, col = 0, rowH = 0;
    for (const o of objs) {
      const wide = o.shape !== 'scalar' || full;
      if (wide) {
        if (col > 0) { y += rowH + G.cardGap; col = 0; rowH = 0; }
        const h = this.cardHeight(o, w);
        L.cards.set(o.id, { x: x0, y, w, h, o });
        y += h + G.cardGap;
        continue;
      }
      const h = G.scalarH;
      L.cards.set(o.id, { x: x0 + col * (cw + G.cardGap), y, w: cw, h, o });
      rowH = Math.max(rowH, h);
      col++;
      if (col >= cols) { col = 0; y += rowH + G.cardGap; rowH = 0; }
    }
    if (col > 0) y += rowH + G.cardGap;
    return Math.max(0, y - y0 - (objs.length ? G.cardGap : 0));
  }

  cardHeight(o, w) {
    if (o.shape === 'record') return 34 + Math.min(o.cells.length, 24) * 22 + 10;
    if (o.shape === 'array') {
      const perRow = Math.max(1, Math.floor((w - 40) / G.cellW));
      const dims = o.dims || [o.cells.length];
      let rows;
      if (dims.length >= 2 && !isRecordElem(o)) {
        const inner = o.cells.length / Math.max(1, dims[0]);
        rows = Math.min(dims[0], 12) * Math.ceil(inner / perRow);
      } else rows = Math.ceil(Math.min(o.cells.length, 96) / perRow);
      return 34 + rows * (G.cellH + 16) + (o.str != null ? 22 : 0) + 8;
    }
    return G.scalarH;
  }

  /** Все живые объекты для вкладки «Процессы». */
  tree() {
    const frames = this.frameOrder.map(id => this.frames.get(id)).filter(f => f && !f.dying);
    return {
      headers: this.headers, defines: this.defines,
      globals: [...this.objects.values()].filter(o => o.frameId === 'global' && !o.dying),
      frames: frames.map(fr => ({ fr, vars: fr.vars.map(id => this.objects.get(id)).filter(o => o && !o.dying), loops: [...fr.loops.values()] })),
      heap: [...this.objects.values()].filter(o => o.kind === 'heap'),
      files: [...this.files.values()],
    };
  }
}

function isRecordElem(o) { return o.cells[0]?.label?.includes('.'); }
export function shortVal(d) {
  if (d == null) return '';
  const s = String(d);
  const m = /^(-?\d+) '(.+)'$/.exec(s);
  if (m) return `'${m[2]}'`;
  return s.length > 14 ? s.slice(0, 13) + '…' : s;
}
