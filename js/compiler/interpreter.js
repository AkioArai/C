// Пошаговый интерпретатор C. Выполнение — генератор: каждый шаг отдаёт
// набор событий, по которым вселенная строит визуализацию.
import { T, ptr, arr, isInt, isFloat, isPtr, is64, commonType, promote, convert, isTruthy, typeName } from './types.js';
import { HEADERS } from './stdlib.js';
import { formatPrintf, runScanf, NeedInput, decodeBytes, charToByte, encodeUtf8 } from './format.js';
import { numLiteralValue } from './analyzer.js';

export class RuntimeError extends Error {
  constructor(message, node, hint = '', kind = 'runtime') {
    super(message);
    this.line = node?.line ?? 0;
    this.col = node?.col ?? 0;
    this.hint = hint;
    this.kind = kind;
  }
}
class BreakSig { constructor(node) { this.node = node; } }
class ContinueSig { constructor(node) { this.node = node; } }
class ReturnSig { constructor(value, node) { this.value = value; this.node = node; } }
class ExitSig { constructor(code) { this.code = code; } }

// ——— glibc rand() ———
class GlibcRand {
  constructor(seed = 1) { this.seed(seed); }
  seed(s) {
    s = s >>> 0;
    if (s === 0) s = 1;
    const r = new Array(34);
    r[0] = s | 0;
    for (let i = 1; i < 31; i++) {
      const hi = Math.trunc(r[i - 1] / 127773), lo = r[i - 1] % 127773;
      let word = 16807 * lo - 2836 * hi;
      if (word < 0) word += 2147483647;
      r[i] = word;
    }
    for (let i = 31; i < 34; i++) r[i] = r[i - 31];
    this.r = r;
    for (let i = 34; i < 344; i++) this.next(true);
  }
  next(discard) {
    const r = this.r;
    const n = r.length;
    const v = (r[n - 31] + r[n - 3]) | 0;
    r.push(v);
    if (r.length > 64) r.splice(0, r.length - 34);
    return discard ? 0 : (v >>> 1);
  }
}

// ——— отображение значений ———
export function display(t, v) {
  if (v === undefined) return '?';
  if (t && (t.k === 'ptr' || t.k === 'arr')) {
    if (v === null || v.isNull) return 'NULL';
    return '0x' + (v.addr ?? 0).toString(16);
  }
  if (typeof v === 'bigint') return v.toString();
  if (t && isFloat(t)) {
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toFixed(1);
    const s = t.k === 'float' ? Number(v.toPrecision(7)).toString() : Number(v.toPrecision(12)).toString();
    return s;
  }
  if (t && t.size === 1 && t.k !== 'bool') {
    const u = v & 0xff;
    let ch;
    if (u >= 32 && u < 127) ch = `'${String.fromCharCode(u)}'`;
    else if (u === 10) ch = "'\\n'";
    else if (u === 0) ch = "'\\0'";
    else if (u === 9) ch = "'\\t'";
    else if (u === 32) ch = "' '";
    else if (u >= 0xc0) ch = `'${decodeBytes([u])}'`;
    return ch ? `${v} ${ch}` : String(v);
  }
  return String(v);
}

let cellSeq = 0;

export class Interpreter {
  constructor(program, pp, opts = {}) {
    this.prog = program;
    this.pp = pp;
    this.src = opts.source || '';
    this.funcs = new Map();
    for (const f of program.funcs) if (f.type === 'FuncDef' || !this.funcs.has(f.name)) this.funcs.set(f.name, f);
    this.interactive = opts.stdin == null;
    this.input = { text: opts.stdin ?? '', pos: 0, eof: !this.interactive };
    this.stepLimit = opts.stepLimit ?? 5_000_000;
    this.maxDepth = opts.maxDepth ?? 3000;
    this.steps = 0;
    this.events = [];
    this.reads = [];
    this.output = '';
    this.globals = new Map();
    this.frames = [];
    this.frameSeq = 0;
    this.stackAddr = 0x7ffd5c40;
    this.globalAddr = 0x601040;
    this.strAddr = 0x402004;
    this.strings = new Map();
    this.rng = new GlibcRand(1);
    this.decimalComma = false;
    this.uninitWarned = new Set();
    this.exitCode = null;
    this.warnedRuntime = new Set();
    cellSeq = 0;
  }

  // ——— события ———
  emit(ev) { this.events.push(ev); }
  *pause(node, kind = 'stmt', extra) {
    this.steps++;
    if (this.steps > this.stepLimit)
      throw new RuntimeError(`превышен лимит шагов (${this.stepLimit.toLocaleString('ru')}) — программа, вероятно, зациклилась`, node,
        'Проверьте условие цикла: переменная из условия должна изменяться в теле цикла так, чтобы условие когда-нибудь стало ложным.', 'limit');
    const evs = this.events;
    this.events = [];
    this.reads = [];
    yield { line: node.line, node, kind, events: evs, ...extra };
  }

  provideInput(text) {
    this.input.text += text;
  }
  closeInput() { this.input.eof = true; }

  // ——— память ———
  allocAddr(size, global) {
    const align = Math.min(8, Math.max(1, size));
    if (global) {
      this.globalAddr = Math.ceil(this.globalAddr / align) * align;
      const a = this.globalAddr;
      this.globalAddr += Math.max(size, 1);
      return a;
    }
    this.stackAddr -= Math.max(size, 1);
    this.stackAddr = Math.floor(this.stackAddr / align) * align;
    return this.stackAddr;
  }

  newCell(name, type, frameId, global = false) {
    const id = 'c' + (++cellSeq);
    if (type.k === 'arr') {
      const addr = this.allocAddr(type.size, global);
      const elems = [];
      for (let i = 0; i < type.len; i++)
        elems.push({ id: id + '_' + i, type: type.of, value: undefined, init: global, addr: addr + i * type.of.size, arrId: id, index: i });
      const c = { id, name, type, isArray: true, elems, addr, frameId, global };
      if (global) for (const e of elems) e.value = isFloat(type.of) ? 0 : is64(type.of) ? 0n : 0;
      return c;
    }
    const addr = this.allocAddr(type.size, global);
    const c = { id, name, type, value: undefined, init: false, addr, frameId, global };
    if (global) { c.value = convert(0, type); c.init = true; }
    return c;
  }

  cellSnapshot(c, extra = {}) {
    const s = {
      id: c.id, name: c.name, typeName: typeName(c.type), addr: c.addr, frameId: c.frameId,
      isArray: !!c.isArray, global: !!c.global, isConst: !!c.isConst, isParam: !!c.isParam, size: c.type.size, ...extra,
    };
    if (c.isArray) {
      s.len = c.type.len;
      s.elemType = typeName(c.type.of);
      s.elems = c.elems.map(e => (e.init ? display(e.type, e.value) : '?'));
    } else {
      s.display = c.init ? display(c.type, c.value) : '?';
      s.init = c.init;
    }
    return s;
  }

  get frame() { return this.frames[this.frames.length - 1]; }

  lookup(name) {
    const f = this.frame;
    if (f) for (let i = f.scopes.length - 1; i >= 0; i--) { const sc = f.scopes[i]; if (sc) { const c = sc.get(name); if (c) return c; } }
    return this.globals.get(name) || null;
  }

  /** Текущая (самая внутренняя) область видимости; создаётся лениво. */
  topScope() {
    const sc = this.frame.scopes;
    return sc[sc.length - 1] || (sc[sc.length - 1] = new Map());
  }

  garbageFor(t, c) {
    const h = ((c.addr * 2654435761) >>> 0);
    if (isFloat(t)) return t.k === 'float' ? Math.fround((h % 10000) * 1e-41) : (h % 100000) * 1e-310;
    if (t.size === 8) return BigInt(h) * 4099n + 140724603453440n;
    return convert(h % 3 === 0 ? 32764 + (h % 7) : h % 3 === 1 ? 0 : h, t);
  }

  readCell(c, node) {
    if (!c.init) {
      c.value = this.garbageFor(c.type, c);
      c.init = true;
      c.garbage = true;
      const key = c.id;
      if (!this.uninitWarned.has(key)) {
        this.uninitWarned.add(key);
        const nm = c.arrId ? `${this.nameOfArr(c)}[${c.index}]` : c.name;
        this.emit({ type: 'uninit', id: c.arrId || c.id, elemIndex: c.arrId ? c.index : undefined, name: nm, display: display(c.type, c.value), line: node?.line });
      }
    }
    this.reads.push({ id: c.arrId || c.id, name: c.arrId ? `${this.nameOfArr(c)}[${c.index}]` : c.name, display: display(c.type, c.value) });
    return c.value;
  }

  nameOfArr(e) { return this.arrays?.get(e.arrId)?.name ?? '?'; }

  writeCell(c, value, node, via, extra = {}) {
    const old = c.init ? display(c.type, c.value) : '?';
    c.value = convert(value, c.type);
    c.init = true;
    c.garbage = false;
    const isElem = !!c.arrId;
    this.emit({
      type: 'write', id: isElem ? c.arrId : c.id, elemIndex: isElem ? c.index : undefined,
      name: isElem ? `${this.nameOfArr(c)}[${c.index}]` : c.name, display: display(c.type, c.value), old,
      typeName: typeName(c.type), line: node?.line, via, sources: this.reads.slice(), ...extra,
    });
  }

  registerArray(c) {
    if (!this.arrays) this.arrays = new Map();
    this.arrays.set(c.id, c);
  }

  stringLiteral(bytes) {
    const key = bytes.join(',');
    if (this.strings.has(key)) return this.strings.get(key);
    const addr = this.strAddr;
    this.strAddr += bytes.length + 1;
    const elems = [...bytes, 0].map((b, i) => ({ id: 's' + addr + '_' + i, type: T.char, value: (b << 24) >> 24, init: true, addr: addr + i, index: i, readonly: true }));
    const a = { id: 's' + addr, name: '"…"', type: arr(T.char, elems.length), isArray: true, elems, addr, readonly: true };
    for (const e of elems) e.arrId = a.id;
    this.registerArray(a);
    this.strings.set(key, a);
    return a;
  }

  ptrTo(target, index) {
    // target: ячейка-скаляр или массив
    if (target.isArray) {
      const addr = target.addr + index * target.type.of.size;
      return { arr: target, index, addr };
    }
    return { cell: target, addr: target.addr };
  }

  derefLoc(p, node) {
    if (!p || p.isNull || (p.arr === undefined && p.cell === undefined)) {
      throw new RuntimeError('обращение по нулевому или неверному адресу (Segmentation fault)', node,
        'Указатель не указывает ни на какую переменную. Если это scanf — проверьте, что перед переменной стоит &.', 'segfault');
    }
    if (p.arr) {
      if (p.index < 0 || p.index >= p.arr.elems.length)
        throw new RuntimeError(`выход за границы массива «${p.arr.name}»: индекс ${p.index}, а допустимы 0…${p.arr.elems.length - 1}`, node,
          `Элементы массива из ${p.arr.elems.length} элементов нумеруются с 0 до ${p.arr.elems.length - 1}. В настоящем C такая ошибка не проверяется и приводит к порче памяти.`, 'bounds');
      return p.arr.elems[p.index];
    }
    return p.cell;
  }

  // ——— запуск ———
  *run() {
    // Законы вселенной: библиотеки и константы
    for (const d of this.pp.directives) {
      if (d.kind === 'include') this.emit({ type: 'include', header: d.name, line: d.line });
      else this.emit({ type: 'define', name: d.name, text: d.text, line: d.line });
    }
    yield* this.pause({ line: this.pp.directives[0]?.line ?? 1 }, 'preprocess');

    // глобальные переменные
    for (const g of this.prog.globals) yield* this.execDecl(g, null, true);
    if (this.prog.globals.length) yield* this.pause(this.prog.globals[0], 'globals');

    const main = this.funcs.get('main');
    if (!main || main.type !== 'FuncDef') throw new RuntimeError('нет функции main', { line: 1 });
    let code = 0;
    try {
      const r = yield* this.callUser(main, [], { line: main.line });
      code = r ? Number(r.v) : 0;
    } catch (e) {
      if (e instanceof ExitSig) code = e.code;
      else throw e;
    }
    this.exitCode = code;
    this.emit({ type: 'exit', code, line: main.body.endLine });
    yield* this.pause({ line: main.body.endLine }, 'exit', { done: true });
    return code;
  }

  *callUser(f, args, callNode) {
    if (f.type !== 'FuncDef') {
      const def = this.prog.funcs.find(x => x.name === f.name && x.type === 'FuncDef');
      if (!def) throw new RuntimeError(`функция «${f.name}» объявлена, но не определена (нет тела)`, callNode, 'Напишите тело функции { ... }.');
      f = def;
    }
    if (this.frames.length >= this.maxDepth)
      throw new RuntimeError(`переполнение стека: слишком глубокая рекурсия (${this.maxDepth} вызовов)`, callNode,
        'Проверьте, что у рекурсивной функции есть условие выхода (базовый случай), которое обязательно достигается.', 'stack');
    const frame = { id: 'f' + (++this.frameSeq), func: f.name, scopes: [new Map()], parentId: this.frame?.id ?? null, depth: this.frames.length, savedSP: this.stackAddr };
    const argDisplays = [];
    const params = [];
    for (let i = 0; i < f.params.length; i++) {
      const p = f.params[i];
      const c = this.newCell(p.name || `_arg${i}`, p.type, frame.id);
      c.isParam = true;
      const a = args[i] || { t: T.int, v: 0 };
      c.value = isPtr(p.type) ? a.v : convert(a.v, p.type);
      c.init = true;
      frame.scopes[0].set(c.name, c);
      params.push(c);
      argDisplays.push({ name: c.name, display: display(c.type, c.value) });
    }
    this.frames.push(frame);
    this.emit({ type: 'frame-enter', frame: { id: frame.id, func: f.name, depth: frame.depth, parentId: frame.parentId }, args: argDisplays, line: f.line, callLine: callNode.line, ret: typeName(f.ret) });
    for (const c of params) this.emit({ type: 'var', cell: this.cellSnapshot(c), line: f.line, via: 'param' });
    yield* this.pause(f, 'enter');
    let ret = null;
    try {
      yield* this.execBlock(f.body, true);
    } catch (e) {
      if (e instanceof ReturnSig) ret = e.value;
      else { this.frames.pop(); throw e; }
    }
    if (ret && f.ret !== T.void) ret = { t: f.ret, v: isPtr(f.ret) ? ret.v : convert(ret.v, f.ret) };
    if (!ret && f.ret !== T.void && f.name !== 'main') {
      this.runtimeWarn(`функция «${f.name}» завершилась без return — возвращено случайное значение`, f.body.endLine ? { line: f.body.endLine } : f, 'Добавьте return в конце функции.');
      ret = { t: f.ret, v: convert(0, f.ret) };
    }
    const ids = [];
    for (const s of frame.scopes) if (s) for (const c of s.values()) ids.push(c.id);
    this.frames.pop();
    this.stackAddr = frame.savedSP;
    this.emit({ type: 'frame-exit', frameId: frame.id, func: f.name, ret: ret ? display(ret.t, ret.v) : null, ids, line: f.body.endLine ?? f.line });
    return ret;
  }

  runtimeWarn(message, node, hint) {
    const key = message + (node?.line ?? '');
    if (this.warnedRuntime.has(key)) return;
    this.warnedRuntime.add(key);
    this.emit({ type: 'runtime-warning', message, hint, line: node?.line });
  }

  // ——— операторы ———
  *execBlock(b, isFuncBody = false) {
    const f = this.frame;
    if (!isFuncBody) f.scopes.push(null);
    try {
      for (const s of b.body) yield* this.exec(s);
    } finally {
      if (!isFuncBody) {
        const scope = f.scopes.pop();
        if (scope && scope.size) {
          const ids = [...scope.values()].map(c => c.id);
          this.emit({ type: 'scope-exit', ids, names: [...scope.keys()], line: b.endLine });
        }
      }
    }
  }

  *execDecl(s, frame, global = false) {
    for (const d of s.decls) {
      let type = d.type;
      if (d.dims.length) {
        for (let k = d.dims.length - 1; k >= 0; k--) {
          const dim = d.dims[k];
          let len;
          if (dim) {
            const v = yield* this.eval(dim.expr);
            len = Number(v.v);
            if (!(len > 0)) throw new RuntimeError(`неверный размер массива «${d.name}»: ${len}`, dim.expr, 'Размер массива должен быть положительным целым числом.');
            if (len > 100000) throw new RuntimeError(`слишком большой массив «${d.name}» (${len} элементов)`, dim.expr, 'В учебной вселенной массивы ограничены 100 000 элементов.');
          } else if (d.init?.type === 'InitList') len = d.init.items.length;
          else if (d.init?.type === 'Str') len = d.init.bytes.length + 1;
          else len = 1;
          type = arr(type, len);
        }
      }
      const c = this.newCell(d.name, type, global ? 'global' : this.frame.id, global);
      c.isConst = d.isConst;
      c.declLine = d.line;
      if (c.isArray) this.registerArray(c);
      if (global) this.globals.set(d.name, c);
      else this.topScope().set(d.name, c);
      let initDesc = null;
      if (d.init) {
        if (c.isArray) {
          if (d.init.type === 'InitList') {
            for (let i = 0; i < c.elems.length; i++) {
              const it = d.init.items[i];
              if (it) { const v = yield* this.eval(it); c.elems[i].value = convert(v.v, c.type.of); }
              else c.elems[i].value = convert(0, c.type.of);
              c.elems[i].init = true;
            }
          } else if (d.init.type === 'Str') {
            const bytes = d.init.bytes;
            for (let i = 0; i < c.elems.length; i++) { c.elems[i].value = convert(i < bytes.length ? bytes[i] : 0, c.type.of); c.elems[i].init = true; }
          }
        } else {
          const v = yield* this.eval(d.init);
          c.value = isPtr(c.type) ? v.v : convert(v.v, c.type);
          c.init = true;
          initDesc = { exprText: this.src.slice(d.init.start, d.init.end), sources: this.reads.slice() };
        }
      }
      this.emit({ type: 'var', cell: this.cellSnapshot(c), line: d.line, via: global ? 'global' : 'decl', init: initDesc });
    }
  }

  *exec(s) {
    switch (s.type) {
      case 'Decl':
        yield* this.execDecl(s);
        yield* this.pause(s);
        return;
      case 'ExprStmt':
        yield* this.eval(s.expr);
        yield* this.pause(s);
        return;
      case 'Block':
        yield* this.execBlock(s);
        return;
      case 'Empty':
        yield* this.pause(s, 'empty');
        return;
      case 'If': {
        const c = yield* this.eval(s.cond);
        const val = isTruthy(c.v);
        this.emit({ type: 'cond', kind: 'if', nodeId: s.id, text: this.src.slice(s.cond.start, s.cond.end), value: val, raw: display(c.t, c.v), line: s.line, reads: this.reads.slice(), hasElse: !!s.alt, elseLine: s.elseLine });
        yield* this.pause(s, 'cond');
        if (val) yield* this.execScoped(s.cons);
        else if (s.alt) yield* this.execScoped(s.alt);
        return;
      }
      case 'While': case 'DoWhile': case 'For':
        yield* this.execLoop(s);
        return;
      case 'Switch': yield* this.execSwitch(s); return;
      case 'Break':
        this.emit({ type: 'jump', kind: 'break', line: s.line });
        yield* this.pause(s);
        throw new BreakSig(s);
      case 'Continue':
        this.emit({ type: 'jump', kind: 'continue', line: s.line });
        yield* this.pause(s);
        throw new ContinueSig(s);
      case 'Return': {
        let v = null;
        if (s.arg) v = yield* this.eval(s.arg);
        this.emit({ type: 'return', func: this.frame.func, display: v ? display(v.t, v.v) : null, line: s.line, sources: this.reads.slice(), exprText: s.arg ? this.src.slice(s.arg.start, s.arg.end) : '' });
        yield* this.pause(s);
        throw new ReturnSig(v, s);
      }
      case 'Case': case 'Default':
        return;
      default:
        throw new RuntimeError(`неподдерживаемый оператор ${s.type}`, s);
    }
  }

  *execScoped(s) {
    if (s.type === 'Block') { yield* this.execBlock(s); return; }
    const f = this.frame;
    f.scopes.push(null);
    try { yield* this.exec(s); } finally { f.scopes.pop(); }
  }

  *execLoop(s) {
    const kind = s.type === 'While' ? 'while' : s.type === 'DoWhile' ? 'do' : 'for';
    const f = this.frame;
    const condText = s.cond ? this.src.slice(s.cond.start, s.cond.end) : '(всегда истина)';
    let pushed = false;
    if (kind === 'for') { f.scopes.push(null); pushed = true; }
    this.emit({ type: 'loop-enter', nodeId: s.id, kind, line: s.line, text: condText, head: this.src.slice(s.start, s.body.start).trim() });
    let iter = 0;
    let reason = 'cond';
    try {
      if (kind === 'for' && s.init) {
        if (s.init.type === 'Decl') yield* this.execDecl(s.init);
        else yield* this.eval(s.init.expr);
        this.emit({ type: 'loop-init', nodeId: s.id, text: this.src.slice(s.init.start, s.init.end).replace(/;$/, ''), line: s.line });
        yield* this.pause(s, 'loop-init');
      }
      for (;;) {
        if (kind !== 'do' || iter > 0) {
          let val = true, raw = '1';
          if (s.cond) { const c = yield* this.eval(s.cond); val = isTruthy(c.v); raw = display(c.t, c.v); }
          this.emit({ type: 'cond', kind, nodeId: s.id, text: condText, value: val, raw, iter, line: kind === 'do' ? s.whileLine : s.line, reads: this.reads.slice() });
          yield* this.pause(kind === 'do' ? { line: s.whileLine, id: s.id } : s, 'cond');
          if (!val) break;
        }
        iter++;
        this.emit({ type: 'loop-iter', nodeId: s.id, iter, line: s.line });
        try {
          yield* this.execScoped(s.body);
        } catch (e) {
          if (e instanceof BreakSig) { reason = 'break'; break; }
          if (!(e instanceof ContinueSig)) throw e;
        }
        if (kind === 'for' && s.update) {
          yield* this.eval(s.update);
          this.emit({ type: 'loop-update', nodeId: s.id, text: this.src.slice(s.update.start, s.update.end), line: s.line });
          yield* this.pause(s, 'loop-update');
        }
      }
    } catch (e) {
      if (e instanceof ReturnSig || e instanceof ExitSig) reason = 'return';
      this.emit({ type: 'loop-exit', nodeId: s.id, iters: iter, reason: e instanceof RuntimeError ? 'error' : reason, line: s.line });
      if (pushed) this.popScope(f, s);
      throw e;
    }
    this.emit({ type: 'loop-exit', nodeId: s.id, iters: iter, reason, line: s.line });
    if (pushed) this.popScope(f, s);
  }

  popScope(f, s) {
    const sc = f.scopes.pop();
    if (sc && sc.size) this.emit({ type: 'scope-exit', ids: [...sc.values()].map(c => c.id), names: [...sc.keys()], line: s.line });
  }

  *execSwitch(s) {
    const d = yield* this.eval(s.disc);
    const val = convert(d.v, promote(isInt(d.t) ? d.t : T.int));
    const body = s.body.body;
    let start = -1, matched = null;
    for (let i = 0; i < body.length; i++) {
      const x = body[i];
      if (x.type === 'Case') {
        const cv = yield* this.eval(x.test);
        if (convert(cv.v, promote(d.t)) == val) { start = i; matched = x; break; }
      }
    }
    if (start < 0) {
      const di = body.findIndex(x => x.type === 'Default');
      if (di >= 0) { start = di; matched = body[di]; }
    }
    this.emit({ type: 'switch', nodeId: s.id, text: this.src.slice(s.disc.start, s.disc.end), display: display(d.t, d.v), caseLine: matched?.line ?? null, isDefault: matched?.type === 'Default', line: s.line, reads: this.reads.slice() });
    yield* this.pause(s, 'cond');
    if (start < 0) return;
    const f = this.frame;
    f.scopes.push(null);
    try {
      for (let i = start; i < body.length; i++) {
        const x = body[i];
        if ((x.type === 'Case' || x.type === 'Default') && i !== start) this.emit({ type: 'fallthrough', line: x.line });
        yield* this.exec(x);
      }
    } catch (e) {
      if (!(e instanceof BreakSig)) throw e;
    } finally {
      this.popScope(f, s);
    }
  }

  // ——— выражения ———
  *lvalue(e) {
    switch (e.type) {
      case 'Ident': {
        const c = this.lookup(e.name);
        if (!c) throw new RuntimeError(`«${e.name}» не объявлена`, e);
        if (c.isArray) throw new RuntimeError(`нельзя присвоить значение массиву «${e.name}» целиком`, e, 'Присваивайте элементам по одному: a[i] = ...');
        return c;
      }
      case 'Index': {
        const base = yield* this.eval(e.obj);
        const idx = yield* this.eval(e.index);
        const p = base.v;
        if (!p || typeof p !== 'object') throw new RuntimeError('индексирование не массива', e);
        const q = { ...p, index: (p.index ?? 0) + Number(idx.v) };
        if (p.cell && Number(idx.v) !== 0) throw new RuntimeError('выход за пределы переменной при индексировании', e);
        return this.derefLoc(q, e);
      }
      case 'Deref': {
        const p = yield* this.eval(e.arg);
        return this.derefLoc(p.v, e);
      }
      default:
        throw new RuntimeError('ожидалась переменная', e);
    }
  }

  cellType(c) { return c.type; }

  *eval(e) {
    switch (e.type) {
      case 'Num': return e._lit || (e._lit = numLiteralValue(e));
      case 'Char': return { t: T.int, v: e.value > 127 ? (charToByte(e.value) << 24) >> 24 : e.value };
      case 'Str': {
        const a = this.stringLiteral(e.bytes);
        return { t: ptr(T.char), v: this.ptrTo(a, 0) };
      }
      case 'Ident': {
        const c = this.lookup(e.name);
        if (!c) {
          for (const h of this.pp.includes) {
            const k = HEADERS[h.name].consts[e.name];
            if (k) return { t: k.type, v: k.value };
          }
          throw new RuntimeError(`«${e.name}» не объявлена`, e);
        }
        if (c.isArray) {
          this.reads.push({ id: c.id, name: c.name, display: '[массив]' });
          return { t: ptr(c.type.of), v: this.ptrTo(c, 0), arrayName: c.name };
        }
        return { t: c.type, v: this.readCell(c, e) };
      }
      case 'Assign': return yield* this.evalAssign(e);
      case 'Update': {
        const c = yield* this.lvalue(e.arg);
        const old = this.readCell(c, e);
        let nv;
        const delta = e.op === '++' ? 1 : -1;
        if (isPtr(c.type)) nv = old && old.arr ? { ...old, index: old.index + delta, addr: old.addr + delta * c.type.to.size } : old;
        else if (isFloat(c.type)) nv = old + delta;
        else if (typeof old === 'bigint') nv = old + BigInt(delta);
        else nv = old + delta;
        this.writeCell(c, nv, e, 'inc', { op: e.op, exprText: this.src.slice(e.start, e.end) });
        return { t: c.type, v: e.prefix ? c.value : old };
      }
      case 'Binary': {
        const a = yield* this.eval(e.left);
        const b = yield* this.eval(e.right);
        return this.binop(e.op, a, b, e);
      }
      case 'Logical': {
        const a = yield* this.eval(e.left);
        const av = isTruthy(a.v);
        if (e.op === '&&' && !av) { this.emit({ type: 'shortcircuit', op: '&&', line: e.line, text: this.src.slice(e.right.start, e.right.end) }); return { t: T.int, v: 0 }; }
        if (e.op === '||' && av) { this.emit({ type: 'shortcircuit', op: '||', line: e.line, text: this.src.slice(e.right.start, e.right.end) }); return { t: T.int, v: 1 }; }
        const b = yield* this.eval(e.right);
        return { t: T.int, v: isTruthy(b.v) ? 1 : 0 };
      }
      case 'Unary': {
        const a = yield* this.eval(e.arg);
        if (e.op === '!') return { t: T.int, v: isTruthy(a.v) ? 0 : 1 };
        const t = promote(a.t);
        const v = convert(a.v, t);
        if (e.op === '+') return { t, v };
        if (e.op === '-') return { t, v: convert(typeof v === 'bigint' ? -v : -v, t) };
        if (e.op === '~') return { t, v: convert(typeof v === 'bigint' ? ~v : ~v, t) };
        break;
      }
      case 'Cast': {
        const a = yield* this.eval(e.arg);
        if (isPtr(e.ctype)) return { t: e.ctype, v: a.v };
        return { t: e.ctype, v: convert(a.v, e.ctype) };
      }
      case 'SizeofType': return { t: T.ulong, v: BigInt(e.ctype.size) };
      case 'SizeofExpr': {
        if (e.arg.type === 'Ident') {
          const c = this.lookup(e.arg.name);
          if (c) return { t: T.ulong, v: BigInt(c.type.size) };
        }
        if (e.arg.type === 'Str') return { t: T.ulong, v: BigInt(e.arg.bytes.length + 1) };
        const saved = { reads: this.reads.length };
        const a = yield* this.eval(e.arg);
        this.reads.length = saved.reads;
        return { t: T.ulong, v: BigInt(a.t.size) };
      }
      case 'AddrOf': {
        if (e.arg.type === 'Ident') {
          const c = this.lookup(e.arg.name);
          if (!c) throw new RuntimeError(`«${e.arg.name}» не объявлена`, e);
          if (c.isArray) return { t: ptr(c.type), v: this.ptrTo(c, 0) };
          return { t: ptr(c.type), v: this.ptrTo(c), target: c };
        }
        if (e.arg.type === 'Index') {
          const base = yield* this.eval(e.arg.obj);
          const idx = yield* this.eval(e.arg.index);
          const p = base.v;
          const index = (p.index ?? 0) + Number(idx.v);
          const q = { ...p, index, addr: (p.arr ? p.arr.addr + index * p.arr.type.of.size : p.addr) };
          this.derefLoc(q, e);
          return { t: ptr(base.t.to), v: q, target: p.arr?.elems[index] };
        }
        if (e.arg.type === 'Deref') { return yield* this.eval(e.arg.arg); }
        throw new RuntimeError('нельзя взять адрес этого выражения', e);
      }
      case 'Deref': {
        const p = yield* this.eval(e.arg);
        const c = this.derefLoc(p.v, e);
        if (c.isArray) return { t: ptr(c.type.of), v: this.ptrTo(c, 0) };
        return { t: c.type, v: this.readCell(c, e) };
      }
      case 'Index': {
        const base = yield* this.eval(e.obj);
        const idx = yield* this.eval(e.index);
        if (!base.v || typeof base.v !== 'object') throw new RuntimeError('индексировать можно только массив', e);
        const p = base.v;
        const i = Number(idx.v);
        if (p.cell) { if (i !== 0) throw new RuntimeError('выход за пределы переменной', e); return { t: p.cell.type, v: this.readCell(p.cell, e) }; }
        const c = this.derefLoc({ ...p, index: p.index + i }, e);
        return { t: c.type, v: this.readCell(c, e) };
      }
      case 'Cond': {
        const c = yield* this.eval(e.cond);
        const val = isTruthy(c.v);
        this.emit({ type: 'ternary', text: this.src.slice(e.cond.start, e.cond.end), value: val, line: e.line });
        const r = val ? yield* this.eval(e.a) : yield* this.eval(e.b);
        return r;
      }
      case 'Comma': {
        let r;
        for (const x of e.list) r = yield* this.eval(x);
        return r;
      }
      case 'Call': return yield* this.evalCall(e);
    }
    throw new RuntimeError(`не удалось вычислить выражение (${e.type})`, e);
  }

  *evalAssign(e) {
    const c = yield* this.lvalue(e.target);
    if (c.readonly) throw new RuntimeError('попытка изменить строковую константу', e, 'Строковые литералы "..." хранятся в памяти только для чтения.');
    let rhs = yield* this.eval(e.value);
    let nv;
    if (e.op === '=') nv = rhs.v;
    else {
      const cur = { t: c.type, v: this.readCell(c, e.target) };
      const r = this.binop(e.op.slice(0, -1), cur, rhs, e);
      nv = r.v;
    }
    if (!isPtr(c.type)) nv = convert(nv, c.type);
    this.writeCell(c, nv, e, e.op === '=' ? 'assign' : 'compound', { op: e.op, exprText: this.src.slice(e.value.start, e.value.end), fullText: this.src.slice(e.start, e.end) });
    return { t: c.type, v: c.value };
  }

  binop(op, a, b, node) {
    const pa = a.t && isPtr(a.t) && a.v && typeof a.v === 'object';
    const pb = b.t && isPtr(b.t) && b.v && typeof b.v === 'object';
    if (pa || pb) {
      if ((op === '+' || op === '-') && pa && !pb) {
        const n = Number(b.v) * (op === '-' ? -1 : 1);
        const sz = a.t.to ? a.t.to.size : a.t.of.size;
        return { t: a.t, v: { ...a.v, index: (a.v.index ?? 0) + n, addr: a.v.addr + n * sz } };
      }
      if (op === '+' && pb && !pa) {
        const n = Number(a.v);
        return { t: b.t, v: { ...b.v, index: (b.v.index ?? 0) + n, addr: b.v.addr + n * b.t.to.size } };
      }
      const x = pa ? a.v.addr : Number(a.v ?? 0), y = pb ? b.v.addr : Number(b.v ?? 0);
      if (op === '-' && pa && pb) return { t: T.long, v: BigInt((x - y) / (a.t.to?.size || 1)) };
      const cmp = { '==': x === y, '!=': x !== y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y }[op];
      if (cmp !== undefined) return { t: T.int, v: cmp ? 1 : 0 };
      throw new RuntimeError(`операция ${op} не применима к адресам`, node);
    }
    const ct = (op === '<<' || op === '>>') ? promote(a.t) : commonType(a.t, b.t);
    const x = convert(a.v, ct);
    const y = (op === '<<' || op === '>>') ? convert(b.v, promote(b.t)) : convert(b.v, ct);
    switch (op) {
      case '<': return { t: T.int, v: x < y ? 1 : 0 };
      case '>': return { t: T.int, v: x > y ? 1 : 0 };
      case '<=': return { t: T.int, v: x <= y ? 1 : 0 };
      case '>=': return { t: T.int, v: x >= y ? 1 : 0 };
      case '==': return { t: T.int, v: x == y ? 1 : 0 };
      case '!=': return { t: T.int, v: x != y ? 1 : 0 };
    }
    if (isFloat(ct)) {
      let r;
      switch (op) {
        case '+': r = x + y; break;
        case '-': r = x - y; break;
        case '*': r = x * y; break;
        case '/': r = x / y;
          if (y === 0) this.runtimeWarn('деление вещественного числа на ноль', node, 'Результат — inf (бесконечность) или nan (не число). Проверяйте делитель перед делением.');
          break;
        default: throw new RuntimeError(`операция ${op} неприменима к вещественным числам`, node);
      }
      return { t: ct, v: convert(r, ct) };
    }
    const zeroCheck = () => {
      if (y == 0) throw new RuntimeError('целочисленное деление на ноль (Floating point exception)', node,
        'Делить целые числа на 0 нельзя — программа аварийно завершается. Проверьте делитель перед делением: if (b != 0) ...', 'div0');
    };
    if (typeof x === 'bigint') {
      let r;
      switch (op) {
        case '+': r = x + y; break;
        case '-': r = x - y; break;
        case '*': r = x * y; break;
        case '/': zeroCheck(); r = x / y; break;
        case '%': zeroCheck(); r = x % y; break;
        case '&': r = x & y; break;
        case '|': r = x | y; break;
        case '^': r = x ^ y; break;
        case '<<': r = x << BigInt(Number(y) & 63); break;
        case '>>': r = x >> BigInt(Number(y) & 63); break;
      }
      return { t: ct, v: convert(r, ct) };
    }
    let r;
    const yy = typeof y === 'bigint' ? Number(y) : y;
    switch (op) {
      case '+': r = x + yy; break;
      case '-': r = x - yy; break;
      case '*': r = ct.signed ? Math.imul(x, yy) : Math.imul(x, yy) >>> 0; break;
      case '/': zeroCheck(); r = Math.trunc(x / yy); break;
      case '%': zeroCheck(); r = x % yy; break;
      case '&': r = x & yy; break;
      case '|': r = x | yy; break;
      case '^': r = x ^ yy; break;
      case '<<': r = x << (yy & 31); break;
      case '>>': r = ct.signed ? x >> (yy & 31) : x >>> (yy & 31); break;
    }
    const res = convert(r, ct);
    if (ct.signed && (op === '+' || op === '-' || op === '*')) {
      const exact = op === '*' ? x * yy : r;
      if (exact !== res) this.runtimeWarn(`переполнение типа ${typeName(ct)}: результат ${op === '*' ? x + '*' + yy : x + op + yy} не помещается и «перескакивает» в ${res}`, node,
        `Диапазон ${typeName(ct)}: ${ct.size === 4 ? '−2 147 483 648 … 2 147 483 647' : ''}. Используйте тип пошире: long (и %ld в printf).`);
    }
    return { t: ct, v: res };
  }

  readString(p) {
    const bytes = [];
    if (p.cell) { bytes.push(Number(p.cell.value) & 0xff); return bytes; }
    if (!p.arr) return bytes;
    for (let i = p.index; i < p.arr.elems.length; i++) {
      const e = p.arr.elems[i];
      const b = e.init ? Number(e.value) & 0xff : 0;
      if (b === 0) return bytes;
      bytes.push(b);
    }
    return bytes;
  }

  *evalCall(e) {
    const name = e.callee;
    const f = this.funcs.get(name);
    if (f) {
      const args = [];
      for (const a of e.args) args.push(yield* this.eval(a));
      const argReads = this.reads.slice();
      this.emit({ type: 'call', func: name, line: e.line, args: args.map(a => display(a.t, a.v)), sources: argReads });
      yield* this.pause(e, 'call');
      const r = yield* this.callUser(f, args, e);
      this.reads = [{ id: 'fn:' + name, name: name + '()', display: r ? display(r.t, r.v) : 'void' }];
      return r || { t: T.void, v: 0 };
    }
    // стандартные функции
    switch (name) {
      case 'printf': return yield* this.doPrintf(e);
      case 'scanf': return yield* this.doScanf(e);
      case 'puts': {
        const s = yield* this.eval(e.args[0]);
        const bytes = this.readString(s.v);
        this.writeOut(decodeBytes(bytes) + '\n', e, 'puts');
        return { t: T.int, v: 1 };
      }
      case 'putchar': {
        const c = yield* this.eval(e.args[0]);
        this.writeOut(decodeBytes([Number(c.v) & 0xff]), e, 'putchar');
        return { t: T.int, v: Number(c.v) & 0xff };
      }
      case 'getchar': {
        for (;;) {
          if (this.input.pos < this.input.text.length) {
            const ch = this.input.text[this.input.pos++];
            const code = ch.charCodeAt(0);
            this.emit({ type: 'input', fn: 'getchar', text: ch === '\n' ? '\\n' : ch, targets: [], line: e.line });
            return { t: T.int, v: code < 128 ? code : charToByte(code) };
          }
          if (this.input.eof) return { t: T.int, v: -1 };
          yield* this.waitInput(e);
        }
      }
      case 'setlocale': {
        const cat = yield* this.eval(e.args[0]);
        const loc = yield* this.eval(e.args[1]);
        const s = loc.v && typeof loc.v === 'object' ? decodeBytes(this.readString(loc.v)) : 'C';
        this.decimalComma = s === '' || /ru|Rus/i.test(s);
        this.emit({ type: 'locale', comma: this.decimalComma, value: s, line: e.line });
        const res = this.stringLiteral(encodeUtf8(this.decimalComma ? 'ru_RU.UTF-8' : 'C'));
        return { t: ptr(T.char), v: this.ptrTo(res, 0) };
      }
      case 'system': {
        const a = yield* this.eval(e.args[0]);
        const s = decodeBytes(this.readString(a.v));
        this.emit({ type: 'note', text: `system("${s}") — команда операционной системы. В учебной вселенной она пропускается.`, line: e.line });
        return { t: T.int, v: 0 };
      }
      case 'exit': {
        const a = yield* this.eval(e.args[0]);
        this.emit({ type: 'note', text: `exit(${Number(a.v)}) — программа завершается немедленно.`, line: e.line });
        throw new ExitSig(Number(a.v));
      }
      case 'rand': {
        const v = this.rng.next();
        this.emit({ type: 'builtin', fn: 'rand', args: [], result: String(v), line: e.line });
        return { t: T.int, v };
      }
      case 'srand': {
        const a = yield* this.eval(e.args[0]);
        this.rng.seed(Number(convert(a.v, T.uint)));
        this.emit({ type: 'builtin', fn: 'srand', args: [display(a.t, a.v)], result: null, line: e.line });
        return { t: T.void, v: 0 };
      }
      case 'time': {
        if (e.args[0]) yield* this.eval(e.args[0]);
        return { t: T.long, v: BigInt(Math.floor(Date.now() / 1000)) };
      }
      case 'strlen': {
        const a = yield* this.eval(e.args[0]);
        return { t: T.ulong, v: BigInt(this.readString(a.v).length) };
      }
    }
    const MATH1 = {
      sqrt: Math.sqrt, cbrt: Math.cbrt, fabs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
      asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2,
      floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
      round: (x) => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5)),
    };
    const MATH2 = { pow: Math.pow, atan2: Math.atan2, fmod: (a, b) => a % b, hypot: Math.hypot };
    const INT1 = {
      abs: (x) => convert(Math.abs(x), T.int), labs: (x) => (x < 0n ? -x : x),
      isdigit: (c) => (c >= 48 && c <= 57 ? 2048 : 0), isalpha: (c) => (/[A-Za-z]/.test(String.fromCharCode(c)) ? 1024 : 0),
      isspace: (c) => ([32, 9, 10, 11, 12, 13].includes(c) ? 8192 : 0), isupper: (c) => (c >= 65 && c <= 90 ? 256 : 0),
      islower: (c) => (c >= 97 && c <= 122 ? 512 : 0), toupper: (c) => (c >= 97 && c <= 122 ? c - 32 : c), tolower: (c) => (c >= 65 && c <= 90 ? c + 32 : c),
    };
    if (MATH1[name] || MATH2[name]) {
      const args = [];
      for (const a of e.args) { const v = yield* this.eval(a); args.push(Number(convert(v.v, T.double))); }
      const r = MATH1[name] ? MATH1[name](args[0]) : MATH2[name](args[0], args[1]);
      if (Number.isNaN(r) && !args.some(Number.isNaN))
        this.runtimeWarn(`${name}(${args.join(', ')}) не определено в вещественных числах — результат nan`, e,
          name === 'sqrt' ? 'Корень из отрицательного числа не существует. Проверьте знак подкоренного выражения (например, дискриминанта) перед вызовом sqrt.' : name.startsWith('log') ? 'Логарифм определён только для положительных чисел.' : 'Проверьте область определения функции.');
      this.emit({ type: 'builtin', fn: name, args: args.map(x => display(T.double, x)), result: display(T.double, r), line: e.line, sources: this.reads.slice() });
      return { t: T.double, v: r };
    }
    if (INT1[name]) {
      const a = yield* this.eval(e.args[0]);
      const t = name === 'labs' ? T.long : T.int;
      const r = INT1[name](convert(a.v, t));
      this.emit({ type: 'builtin', fn: name, args: [display(a.t, a.v)], result: display(t, r), line: e.line, sources: this.reads.slice() });
      return { t, v: r };
    }
    throw new RuntimeError(`функция «${name}» не найдена`, e);
  }

  writeOut(text, node, fn, extra = {}) {
    this.output += text;
    this.emit({ type: 'output', fn, text, line: node.line, sources: this.reads.slice(), ...extra });
  }

  *waitInput(node) {
    this.emit({ type: 'input-wait', line: node.line });
    yield* this.pause(node, 'input', { needInput: true });
  }

  *doPrintf(e) {
    const args = [];
    for (const a of e.args) args.push(yield* this.eval(a));
    const fmt = args[0];
    if (!fmt.v || typeof fmt.v !== 'object') throw new RuntimeError('printf: первый аргумент не строка', e);
    const fmtBytes = this.readString(fmt.v);
    const res = formatPrintf(fmtBytes, args.slice(1), { readString: (p) => this.readString(p), decimalComma: this.decimalComma });
    if (res.issues.includes('missing'))
      this.runtimeWarn('printf: аргументов меньше, чем спецификаторов — выведен «мусор»', e, 'Для каждого % нужно передать значение.');
    const text = decodeBytes(res.bytes);
    this.writeOut(text, e, 'printf', { fmt: decodeBytes(fmtBytes) });
    return { t: T.int, v: res.bytes.length };
  }

  *doScanf(e) {
    const fmtV = yield* this.eval(e.args[0]);
    const fmt = String.fromCharCode(...this.readString(fmtV.v));
    const targets = [];
    for (const a of e.args.slice(1)) {
      const v = yield* this.eval(a);
      targets.push({ node: a, val: v });
    }
    let res;
    for (;;) {
      try {
        res = runScanf(fmt, this.input, { decimalComma: this.decimalComma });
        break;
      } catch (err) {
        if (!(err instanceof NeedInput)) throw err;
        yield* this.waitInput(e);
      }
    }
    const consumed = this.input.text.slice(this.input.pos, res.pos);
    this.input.pos = res.pos;
    const written = [];
    let ti = 0;
    for (const it of res.items) {
      if (it.suppressed) continue;
      const tg = targets[ti++];
      if (!tg) break;
      const p = tg.val.v;
      if (!p || typeof p !== 'object' || (!p.cell && !p.arr)) {
        const nm = tg.node.type === 'Ident' ? tg.node.name : this.src.slice(tg.node.start, tg.node.end);
        throw new RuntimeError(`Segmentation fault: scanf получил значение ${display(tg.val.t, tg.val.v)} вместо адреса переменной «${nm}»`, tg.node,
          `scanf должен знать, КУДА записать число — ему нужен адрес: &${nm}. Без & значение переменной (${display(tg.val.t, tg.val.v)}) было принято за адрес в памяти, и запись туда уничтожила программу.`, 'segfault');
      }
      if (it.conv === 's') {
        const bytes = encodeUtf8(it.value);
        if (!p.arr) throw new RuntimeError('%s в scanf требует массив символов', tg.node, 'Объявите char s[100]; и передайте s (без &).');
        for (let k = 0; k <= bytes.length; k++) {
          const cell = this.derefLoc({ ...p, index: p.index + k }, tg.node);
          cell.value = k < bytes.length ? (bytes[k] << 24) >> 24 : 0;
          cell.init = true;
        }
        this.emit({ type: 'write', id: p.arr.id, name: p.arr.name, display: JSON.stringify(it.value), old: '', line: e.line, via: 'scanf', sources: [], typeName: 'char[]', elemsUpdate: p.arr.elems.map(x => (x.init ? display(x.type, x.value) : '?')) });
        written.push({ name: p.arr.name, display: it.value, id: p.arr.id });
        continue;
      }
      const cell = this.derefLoc(p, tg.node);
      const tt = cell.type;
      let v;
      if ('fFeEgG'.includes(it.conv)) {
        const isDoubleSpec = it.len === 'l' || it.len === 'L';
        if (tt.k === 'double' && !isDoubleSpec) {
          // %f в double: реальная программа запишет 4 байта float в младшую часть double
          const dv = new DataView(new ArrayBuffer(8));
          dv.setFloat64(0, cell.init ? cell.value : 0, true);
          dv.setFloat32(0, it.value, true);
          v = dv.getFloat64(0, true);
          this.runtimeWarn(`scanf("%f") записал float в переменную double «${cell.name}» — получился мусор ${display(T.double, v)}`, tg.node, 'Для double используйте %lf.');
        } else if (tt.k === 'float' && isDoubleSpec) {
          v = it.value;
          this.runtimeWarn(`scanf("%lf") в переменную float «${cell.name}» — запись 8 байт в 4-байтовую переменную`, tg.node, 'Для float используйте %f.');
        } else v = it.value;
      } else if (it.conv === 'c') {
        const code = it.value.charCodeAt(0);
        v = code < 128 ? code : charToByte(code);
      } else {
        v = it.value; // BigInt
        if (isFloat(tt)) this.runtimeWarn(`scanf("%${it.conv}") в вещественную переменную «${cell.name}»`, tg.node, 'Для double используйте %lf, для float — %f.');
      }
      this.reads = [];
      this.writeCell(cell, v, e, 'scanf', { inputText: it.text });
      written.push({ name: cell.name, display: display(cell.type, cell.value), id: cell.arrId || cell.id, elemIndex: cell.arrId ? cell.index : undefined });
    }
    this.emit({ type: 'input', fn: 'scanf', fmt, text: consumed.replace(/\n/g, '⏎'), targets: written, count: res.count, expected: targets.length, line: e.line });
    if (res.count < targets.length && res.count !== -1 && targets.length)
      this.runtimeWarn(`scanf прочитал ${res.count} из ${targets.length} значений — ввод не совпал с форматом «${fmt}»`, e,
        'Проверьте, что вводите числа в нужном формате (например, целое для %d). Непрочитанные переменные сохранят старые значения.');
    if (res.count === -1) this.emit({ type: 'note', text: 'scanf: ввод закончился (EOF) — вернул -1', line: e.line });
    return { t: T.int, v: res.count };
  }
}
