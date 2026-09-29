// Пошаговый интерпретатор C с байтовой моделью памяти.
// Выполнение — генератор: каждый шаг отдаёт набор событий, по которым строится визуализация,
// и «трассу вычислений» (как именно считалось выражение).
import { T, ptr, arr, isInt, isFloat, isPointer, isRecord, isArith, commonType, promote, convert, isTruthy, typeName, rangeOf } from './types.js';
import { HEADERS, STD_STREAMS, FILE_T } from './stdlib.js';
import { formatPrintf, runScanf, NeedInput, decodeBytes, charToByte, encodeUtf8 } from './format.js';
import { numLiteralValue } from './analyzer.js';
import { Memory, MemFault, STACK_TOP, TEXT_BASE } from './memory.js';

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
class GotoSig { constructor(label, node) { this.label = label; this.node = node; } }

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
    for (let i = 34; i < 344; i++) this.next();
  }
  next() {
    const r = this.r;
    const n = r.length;
    const v = (r[n - 31] + r[n - 3]) | 0;
    r.push(v);
    if (r.length > 64) r.splice(0, r.length - 34);
    return v >>> 1;
  }
}

// ——— отображение значений ———
export function display(t, v) {
  if (v === undefined) return '?';
  if (t && t.k === 'ptr') return v === 0 ? 'NULL' : '0x' + Number(v).toString(16);
  if (typeof v === 'bigint') return v.toString();
  if (t && isFloat(t)) {
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toFixed(1);
    return t.k === 'float' ? Number(v.toPrecision(7)).toString() : Number(v.toPrecision(12)).toString();
  }
  if (t && t.size === 1 && t.k !== '_Bool') {
    const u = v & 0xff;
    let ch;
    if (u >= 33 && u < 127) ch = `'${String.fromCharCode(u)}'`;
    else if (u === 32) ch = "' '";
    else if (u === 10) ch = "'\\n'";
    else if (u === 0) ch = "'\\0'";
    else if (u === 9) ch = "'\\t'";
    else if (u >= 0xc0) ch = `'${decodeBytes([u])}'`;
    return ch ? `${v} ${ch}` : String(v);
  }
  return String(v);
}

const MAX_CELLS = 256;
const FAULT_TEXT = {
  null: ['Segmentation fault: разыменование нулевого указателя (NULL)', 'Указатель равен NULL — он никуда не указывает. Проверьте, что указатель получил адрес (например, p = &x или p = malloc(...)) и что malloc/fopen не вернули NULL.'],
  segv: ['Segmentation fault: обращение по неверному адресу', 'Указатель содержит «мусор» или вышел далеко за пределы массива. Если это scanf — проверьте, что перед переменной стоит &.'],
  readonly: ['Segmentation fault: попытка изменить строковую константу', 'Строка в кавычках "..." хранится в памяти только для чтения. Чтобы менять текст, скопируйте его в массив: char s[] = "...";'],
  bad: ['обращение по неверному адресу', ''],
  oom: ['недостаточно памяти', 'Программа выделила слишком много памяти в куче.'],
};

export class Interpreter {
  constructor(program, pp, opts = {}) {
    this.prog = program;
    this.pp = pp;
    this.src = opts.source || '';
    this.interactive = opts.stdin == null;
    this.input = { text: opts.stdin ?? '', pos: 0, eof: !this.interactive };
    this.stepLimit = opts.stepLimit ?? 5_000_000;
    this.maxDepth = opts.maxDepth ?? 2500;
    this.tracing = opts.tracing ?? true;
    this.steps = 0;
    this.events = [];
    this.reads = [];
    this.trace = [];
    this.output = '';
    this.stderr = '';
    this.mem = new Memory();
    this.objects = [];
    this.objById = new Map();
    this.objSeq = 0;
    this.sp = STACK_TOP;
    this.frames = [];
    this.frameSeq = 0;
    this.globals = new Map();
    this.statics = new Map();
    this.strings = new Map();
    this.heapSeq = 0;
    this.rng = new GlibcRand(1);
    this.decimalComma = false;
    this.warned = new Set();
    this.exitCode = null;
    // функции и их «адреса»
    this.funcs = new Map();
    for (const f of program.funcs) if (f.type === 'FuncDef' || !this.funcs.has(f.name)) this.funcs.set(f.name, f);
    this.funcAddr = new Map();
    this.addrFunc = new Map();
    let k = 0;
    for (const [name, f] of this.funcs) {
      const a = TEXT_BASE + 0x33 * k++;
      this.funcAddr.set(name, a);
      this.addrFunc.set(a, { user: f, name });
    }
    this.builtinAddr = new Map();
    let b = 0;
    for (const h of pp.includes) for (const fn of Object.keys(HEADERS[h.name].funcs)) {
      const a = 0x7f3a2c4b1000 + 0x40 * b++;
      this.builtinAddr.set(fn, a);
      this.addrFunc.set(a, { builtin: fn, name: fn });
    }
    // файлы
    this.files = new Map();
    for (const [name, text] of Object.entries(opts.files || {})) this.files.set(name, { bytes: encodeUtf8(text) });
    this.handles = new Map();
    this.handles.set(STD_STREAMS.stdin, { std: 'stdin', name: 'stdin' });
    this.handles.set(STD_STREAMS.stdout, { std: 'stdout', name: 'stdout' });
    this.handles.set(STD_STREAMS.stderr, { std: 'stderr', name: 'stderr' });
    this.clock0 = 0;
  }

  // ——— события ———
  emit(ev) { this.events.push(ev); }
  tr(entry) { if (this.tracing && this.trace.length < 24) this.trace.push(entry); }
  src_(n) { return n && n.start != null ? this.src.slice(n.start, n.end) : ''; }

  *pause(node, kind = 'stmt', extra) {
    this.steps++;
    if (this.steps > this.stepLimit)
      throw new RuntimeError(`превышен лимит шагов (${this.stepLimit.toLocaleString('ru')}) — программа, вероятно, зациклилась`, node,
        'Проверьте условие цикла: переменная из условия должна изменяться в теле цикла так, чтобы условие когда-нибудь стало ложным.', 'limit');
    const evs = this.events, trace = this.trace;
    this.events = [];
    this.reads = [];
    this.trace = [];
    yield { line: node.line, node, kind, events: evs, trace, frameId: this.frame?.id, ...extra };
  }

  provideInput(text) { this.input.text += text; }
  closeInput() { this.input.eof = true; }

  get frame() { return this.frames[this.frames.length - 1]; }

  /** Переполнение: точный результат вышел за диапазон типа и «перескочил». */
  emitOverflow(t, exact, res, node) {
    if (!this.tracing) return;
    const rg = rangeOf(t);
    if (!rg) return;
    this.emit({ type: 'overflow', line: node?.line, typeName: typeName(t), signed: !!t.signed, exact: String(exact), result: String(res), min: String(rg[0]), max: String(rg[1]) });
  }

  runtimeWarn(message, node, hint) {
    const key = message + (node?.line ?? '');
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.emit({ type: 'runtime-warning', message, hint, line: node?.line });
  }

  fault(err, node, extra = '') {
    if (err instanceof MemFault) {
      const [m, h] = FAULT_TEXT[err.kind] || FAULT_TEXT.bad;
      return new RuntimeError(m + (err.kind === 'segv' ? ' 0x' + Math.max(0, err.addr).toString(16) : '') + extra, node, h, 'segfault');
    }
    return err;
  }

  // ——— объекты в памяти ———
  newObject(name, type, kind, frameId, node) {
    const size = Math.max(type.size, 1), align = Math.max(1, type.align || 1);
    let addr;
    if (kind === 'global' || kind === 'static') addr = this.mem.allocStatic(size, align);
    else if (kind === 'string') addr = this.mem.allocStatic(size, 1, true);
    else if (kind === 'heap') addr = this.mem.heapAlloc(size);
    else {
      const key = node ? `${node.id}:${name}` : null;
      const fr = this.frame;
      if (key && fr && fr.slots.has(key) && fr.slots.get(key).size >= size) addr = fr.slots.get(key).addr;
      else {
        this.sp -= size;
        this.sp = Math.floor(this.sp / Math.max(align, 1)) * Math.max(align, 1);
        if (this.sp < STACK_TOP - (4 << 20) + 4096)
          throw new RuntimeError('переполнение стека (stack overflow)', node, 'Слишком много локальных данных или слишком глубокая рекурсия.', 'stack');
        addr = this.sp;
        if (key && fr) fr.slots.set(key, { addr, size });
      }
      this.mem.markInit(addr, size, 0);
    }
    const obj = { id: 'o' + (++this.objSeq), name, type, kind, addr, size, frameId, alive: true, line: node?.line };
    this.objects.push(obj);
    this.objById.set(obj.id, obj);
    return obj;
  }

  killObject(obj) {
    obj.alive = false;
    const i = this.objects.lastIndexOf(obj);
    if (i >= 0) this.objects.splice(i, 1);
  }

  objectAt(addr, size = 1) {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (addr >= o.addr && addr + size <= o.addr + o.size) return o;
    }
    return null;
  }

  /** Путь к ячейке внутри объекта: a[2], p.x, arr[1].name[0]. */
  pathIn(type, off, name, size) {
    if (off === 0 && (size == null || size === type.size || !(type.k === 'arr' || isRecord(type)))) return name;
    if (type.k === 'arr' && type.of.size > 0) {
      const i = Math.floor(off / type.of.size);
      return this.pathIn(type.of, off - i * type.of.size, `${name}[${i}]`, size);
    }
    if (isRecord(type) && type.fields) {
      const f = type.fields.find(ff => off >= ff.offset && off < ff.offset + Math.max(ff.type.size, 1));
      if (f) return this.pathIn(f.type, off - f.offset, `${name}.${f.name}`, size);
    }
    if (type.k === 'heapview') return name;
    return off ? `${name}+${off}` : name;
  }

  pathOf(addr, size) {
    const o = this.objectAt(addr, 1);
    if (!o) return null;
    const vt = o.viewType && o.kind === 'heap' ? arr(o.viewType, Math.max(1, Math.floor(o.size / Math.max(1, o.viewType.size)))) : o.type;
    return { obj: o, path: this.pathIn(vt, addr - o.addr, o.name, size) };
  }

  describePtr(v, size = 1) {
    if (v === 0) return 'NULL';
    const f = this.addrFunc.get(v);
    if (f) return `функция ${f.name}`;
    const p = this.pathOf(v, size);
    if (!p) return null;
    if (p.obj.kind === 'string') return `строка "${decodeBytes(this.safeCString(p.obj.addr, 30))}"`;
    return (p.obj.alive ? '' : '(исчезнувший) ') + (p.obj.freed ? '(освобождённый) ' : '') + p.path;
  }

  safeCString(addr, max) { try { return this.mem.cstring(addr, max); } catch { return []; } }

  // ——— раскладка объекта на «ячейки» для визуализации ———
  cellsOf(obj) {
    const type = obj.kind === 'heap' ? (obj.viewType ? arr(obj.viewType, Math.max(1, Math.floor(obj.size / Math.max(1, obj.viewType.size)))) : arr(T.uchar, obj.size)) : obj.type;
    const cells = [];
    const walk = (t, off, label) => {
      if (cells.length >= MAX_CELLS) return;
      if (t.k === 'arr') { for (let i = 0; i < (t.len ?? 0) && cells.length < MAX_CELLS; i++) walk(t.of, off + i * t.of.size, `${label}[${i}]`); return; }
      if (isRecord(t) && t.fields) {
        if (t.k === 'union') { for (const f of t.fields) walk(f.type, off, `${label}.${f.name}`); return; }
        for (const f of t.fields) walk(f.type, off + f.offset, `${label}.${f.name}`); return;
      }
      if (t === FILE_T) { cells.push({ label, off, t: T.uchar, opaque: true }); return; }
      cells.push({ label, off, t });
    };
    walk(type, 0, '');
    return { type, cells };
  }

  cellValue(obj, c) {
    if (c.opaque) return { display: 'FILE', init: true };
    const addr = obj.addr + c.off;
    let init = true, v;
    try {
      init = this.mem.isInit(addr, c.t.size);
      v = this.mem.read(addr, c.t);
    } catch { return { display: '?', init: false }; }
    const out = { display: display(c.t, v), init };
    if (c.t.k === 'ptr') {
      out.ptr = v;
      const sz = c.t.to?.size || 1;
      const p = v ? this.pathOf(v, sz) : null;
      if (p) { out.target = p.obj.id; out.targetPath = p.path; out.targetKind = p.obj.kind; }
      out.desc = this.describePtr(v, sz);
    }
    return out;
  }

  snapshot(obj) {
    const { type, cells } = this.cellsOf(obj);
    const s = {
      id: obj.id, name: obj.name, kind: obj.kind, typeName: obj.kind === 'heap' ? (obj.viewType ? `${typeName(obj.viewType)}[${Math.floor(obj.size / obj.viewType.size)}]` : `${obj.size} байт`) : typeName(obj.type),
      type, addr: obj.addr, size: obj.size, frameId: obj.frameId, line: obj.line, isConst: !!obj.isConst, freed: !!obj.freed,
      shape: type.k === 'arr' ? 'array' : isRecord(type) ? 'record' : 'scalar',
      truncated: cells.length >= MAX_CELLS,
      cells: cells.map(c => ({ label: c.label, off: c.off, typeName: typeName(c.t), ...this.cellValue(obj, c) })),
    };
    if (type.k === 'arr') {
      const dims = []; let t = type;
      while (t.k === 'arr') { dims.push(t.len); t = t.of; }
      s.dims = dims; s.elemType = typeName(t);
      if (isInt(t) && t.size === 1) {
        const bytes = this.safeCString(obj.addr, obj.size);
        s.str = bytes.length < obj.size ? decodeBytes(bytes) : null;
      }
    }
    if (isRecord(type)) s.fields = type.fields.map(f => ({ name: f.name, typeName: typeName(f.type), offset: f.offset, size: f.type.size }));
    return s;
  }

  cellIndexOf(obj, addr) {
    const { cells } = this.cellsOf(obj);
    const off = addr - obj.addr;
    for (let i = 0; i < cells.length; i++) if (cells[i].off === off) return i;
    return -1;
  }

  // ——— чтение и запись ———
  checkAccess(addr, size, prov, node, write) {
    const po = prov ? this.objById.get(prov) : null;
    if (po) {
      if (po.freed) throw new RuntimeError(`обращение к освобождённой памяти (блок ${po.name} уже освобождён free)`, node, 'После free(p) память больше не принадлежит программе. Не используйте указатель после освобождения; присвойте ему NULL.', 'uaf');
      if (!po.alive && po.kind !== 'heap') throw new RuntimeError(`обращение к переменной «${po.name}», которая уже не существует (висячий указатель)`, node, 'Локальные переменные исчезают, когда функция завершается или блок { } заканчивается. Не возвращайте и не храните их адреса.', 'dangling');
      if (addr < po.addr || addr + size > po.addr + po.size) {
        const et = po.viewType || (po.type.k === 'arr' ? po.type.of : null);
        const es = et?.size || 1;
        const idx = Math.floor((addr - po.addr) / es);
        const n = Math.floor(po.size / es);
        throw new RuntimeError(`выход за границы ${po.kind === 'heap' ? 'блока памяти' : 'массива'} «${po.name}»: индекс ${idx}, а допустимы 0…${n - 1}`, node,
          `Элементы массива из ${n} элементов нумеруются с 0 до ${n - 1}. В настоящем C такая ошибка не проверяется и тихо портит соседние данные.`, 'bounds');
      }
    } else if (size > 0) {
      const o = this.objectAt(addr, size);
      if (!o) {
        const seg = this.mem.seg(addr, size);
        if (seg && (seg.name === 'stack' || seg.name === 'heap')) {
          const near = this.objectAt(addr, 1);
          if (near?.freed) throw new RuntimeError(`обращение к освобождённой памяти (${near.name})`, node, 'После free память использовать нельзя.', 'uaf');
          throw new RuntimeError(`обращение к памяти, не принадлежащей ни одной переменной (адрес 0x${addr.toString(16)})`, node, 'Указатель вышел за пределы массива или указывает на исчезнувшую переменную.', 'bounds');
        }
      } else if (o.freed) throw new RuntimeError(`обращение к освобождённой памяти (${o.name})`, node, 'После free память использовать нельзя.', 'uaf');
    }
  }

  load(lv, node) {
    const t = lv.t;
    this.checkAccess(lv.addr, t.size, lv.prov, node, false);
    let v;
    try {
      if (isRecord(t)) {
        const bytes = this.mem.readBytes(lv.addr, t.size);
        return { t, bytes };
      }
      v = this.mem.read(lv.addr, t);
    } catch (e) { throw this.fault(e, node); }
    if (!this.mem.isInit(lv.addr, t.size)) {
      const p = this.pathOf(lv.addr, t.size);
      const key = 'u' + (p ? p.obj.id + p.path : lv.addr);
      if (!this.warned.has(key)) {
        this.warned.add(key);
        this.emit({ type: 'uninit', objId: p?.obj.id, path: p?.path ?? '?', display: display(t, v), line: node?.line, heap: p?.obj.kind === 'heap' });
      }
    }
    if (this.tracing) {
      const p = this.pathOf(lv.addr, t.size);
      if (p) this.reads.push({ objId: p.obj.id, path: p.path, display: display(t, v) });
    }
    return { t, v };
  }

  store(lv, val, node, via, extra = {}) {
    const t = lv.t;
    this.checkAccess(lv.addr, t.size, lv.prov, node, true);
    let oldDisp = '?';
    const p = this.pathOf(lv.addr, t.size);
    try {
      if (this.mem.isInit(lv.addr, t.size) && !isRecord(t)) oldDisp = display(t, this.mem.read(lv.addr, t));
      if (isRecord(t)) this.mem.writeBytes(lv.addr, val.bytes);
      else this.mem.write(lv.addr, t, val);
    } catch (e) { throw this.fault(e, node); }
    if (p) {
      const ev = { type: 'write', objId: p.obj.id, path: p.path, typeName: typeName(t), old: oldDisp, line: node?.line, via, sources: this.reads.slice(), ...extra };
      if (isRecord(t) || p.obj.kind === 'heap') ev.snap = this.snapshot(p.obj);
      else {
        const nv = this.mem.read(lv.addr, t);
        ev.display = display(t, nv);
        ev.cell = this.cellIndexOf(p.obj, lv.addr);
        if (t.k === 'ptr') {
          const sz = t.to?.size || 1;
          const tp = nv ? this.pathOf(nv, sz) : null;
          ev.target = tp?.obj.id; ev.targetPath = tp?.path; ev.desc = this.describePtr(nv, sz);
          // куча принимает тип указателя, который на неё смотрит
          if (tp && tp.obj.kind === 'heap' && !tp.obj.viewType && t.to.size > 0 && t.to.k !== 'void') {
            tp.obj.viewType = t.to;
            this.emit({ type: 'heap-view', objId: tp.obj.id, snap: this.snapshot(tp.obj) });
          }
        }
      }
      this.emit(ev);
    }
    return isRecord(t) ? val : this.mem.read(lv.addr, t);
  }

  /** Вспомогательно: значение-«как-есть» (без события). */
  peek(addr, t) { try { return this.mem.read(addr, t); } catch { return 0; } }

  // ——— типы с размерами времени выполнения (VLA) ———
  *resolveType(t, node) {
    if (t.k !== 'arr') return t;
    const of = yield* this.resolveType(t.of, node);
    let len = t.len;
    if (len == null && t.lenExpr) {
      const v = yield* this.eval(t.lenExpr);
      len = Number(v.v);
      if (!(len > 0)) throw new RuntimeError(`неверный размер массива: ${len}`, node, 'Размер массива должен быть положительным целым числом.');
      if (len * of.size > (2 << 20)) throw new RuntimeError(`слишком большой массив (${len} элементов) для стека`, node, 'Большие массивы создавайте в куче: malloc(n * sizeof(int)).');
    }
    return of === t.of && len === t.len ? t : arr(of, len);
  }

  // ——— запуск ———
  *run() {
    for (const d of this.pp.directives) {
      if (d.kind === 'include') this.emit({ type: 'include', header: d.name, line: d.line });
      else this.emit({ type: 'define', name: d.name, text: d.text, params: d.params, line: d.line });
    }
    yield* this.pause({ line: this.pp.directives[0]?.line ?? 1 }, 'preprocess');

    // глобальные переменные
    let hadGlobals = false;
    for (const g of this.prog.globals) {
      for (const d of g.decls) {
        if (d.isExtern) continue;
        if (this.globals.has(d.name)) { const o = this.globals.get(d.name); if (d.init) yield* this.initObject(o.addr, o.type, d.init, g); continue; }
        const obj = this.newObject(d.name, d.type, 'global', 'global', d);
        obj.isConst = d.isConst;
        this.globals.set(d.name, obj);
        if (d.init) yield* this.initObject(obj.addr, obj.type, d.init, g);
        this.emit({ type: 'var', obj: this.snapshot(obj), line: d.line, via: 'global' });
        hadGlobals = true;
      }
    }
    if (hadGlobals) yield* this.pause(this.prog.globals[0], 'globals');

    const main = this.funcs.get('main');
    if (!main || main.type !== 'FuncDef') throw new RuntimeError('нет функции main', { line: 1 });
    let code = 0;
    try {
      const r = yield* this.callUser(main, [], { line: main.line });
      code = r && r.v !== undefined ? Number(r.v) : 0;
    } catch (e) {
      if (e instanceof ExitSig) code = e.code;
      else throw e;
    }
    this.exitCode = code;
    const leaks = this.objects.filter(o => o.kind === 'heap' && !o.freed);
    if (leaks.length) this.emit({ type: 'leak', blocks: leaks.length, bytes: leaks.reduce((s, o) => s + o.size, 0), line: main.body.endLine });
    for (const [, h] of this.handles) if (h.file && h.open) this.flushFile(h);
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
    const frame = { id: 'f' + (++this.frameSeq), func: f.name, scopes: [new Map()], parentId: this.frame?.id ?? null, depth: this.frames.length, savedSP: this.sp, slots: new Map(), objs: [], callLine: callNode.line };
    this.frames.push(frame);
    const params = [];
    const argDisp = [];
    for (let i = 0; i < f.params.length; i++) {
      const p = f.params[i];
      const obj = this.newObject(p.name || `_arg${i}`, p.type, 'param', frame.id, null);
      obj.isParam = true;
      frame.objs.push(obj);
      const a = args[i] || { t: T.int, v: 0 };
      try {
        if (isRecord(p.type)) this.mem.writeBytes(obj.addr, a.bytes);
        else this.mem.write(obj.addr, p.type, a.v);
      } catch (e) { throw this.fault(e, callNode); }
      if (p.name) frame.scopes[0].set(p.name, obj);
      params.push(obj);
      argDisp.push({ name: obj.name, display: isRecord(p.type) ? '{…}' : display(p.type, this.mem.read(obj.addr, p.type)) });
    }
    this.emit({ type: 'frame-enter', frame: { id: frame.id, func: f.name, depth: frame.depth, parentId: frame.parentId, line: f.line, endLine: f.body.endLine }, args: argDisp, line: f.line, callLine: callNode.line, ret: typeName(f.ret) });
    for (const o of params) this.emit({ type: 'var', obj: this.snapshot(o), line: f.line, via: 'param' });
    yield* this.pause(f, 'enter');
    let ret = null;
    try {
      yield* this.execBlock(f.body, true);
    } catch (e) {
      if (e instanceof ReturnSig) ret = e.value;
      else if (e instanceof GotoSig) throw new RuntimeError(`метка «${e.label}» не найдена в функции ${f.name}`, e.node);
      else { this.frames.pop(); throw e; }
    }
    if (ret && f.ret.k !== 'void') ret = isRecord(f.ret) ? { t: f.ret, bytes: ret.bytes } : { t: f.ret, v: convert(ret.v, f.ret) };
    if (!ret && f.ret.k !== 'void' && f.name !== 'main') {
      this.runtimeWarn(`функция «${f.name}» завершилась без return — возвращено случайное значение`, { line: f.body.endLine }, 'Добавьте return в конце функции.');
      ret = { t: f.ret, v: convert(0, f.ret) };
    }
    const ids = [];
    for (const o of frame.objs) { ids.push(o.id); this.killObject(o); }
    this.frames.pop();
    this.sp = frame.savedSP;
    this.emit({ type: 'frame-exit', frameId: frame.id, func: f.name, ret: ret ? (isRecord(ret.t) ? '{…}' : display(ret.t, ret.v)) : null, ids, line: f.body.endLine ?? f.line });
    return ret;
  }

  lookup(name) {
    const f = this.frame;
    if (f) for (let i = f.scopes.length - 1; i >= 0; i--) { const sc = f.scopes[i]; if (sc) { const o = sc.get(name); if (o) return o; } }
    return this.globals.get(name) || null;
  }
  topScope() {
    const sc = this.frame.scopes;
    return sc[sc.length - 1] || (sc[sc.length - 1] = new Map());
  }

  // ——— операторы ———
  *execBlock(b, isFuncBody = false) {
    const f = this.frame;
    if (!isFuncBody) f.scopes.push(null);
    const body = b.body;
    try {
      let i = 0;
      while (i < body.length) {
        try {
          for (; i < body.length; i++) yield* this.exec(body[i]);
        } catch (e) {
          if (e instanceof GotoSig) {
            const idx = findLabel(body, e.label);
            if (idx >= 0) { i = idx; this.emit({ type: 'jump', kind: 'goto', label: e.label, line: e.node.line }); continue; }
          }
          throw e;
        }
      }
    } finally {
      if (!isFuncBody) this.closeScope(f, b.endLine);
    }
  }

  closeScope(f, line) {
    const scope = f.scopes.pop();
    if (scope && scope.size) {
      const objs = [...scope.values()].filter(o => o.kind !== 'static');
      for (const o of objs) this.killObject(o);
      if (objs.length) this.emit({ type: 'scope-exit', ids: objs.map(o => o.id), names: objs.map(o => o.name), line });
    }
  }

  *execDecl(s) {
    if (s.typedef) return;
    for (const d of s.decls) {
      if (d.isExtern) { const g = this.globals.get(d.name); if (g) this.topScope().set(d.name, g); continue; }
      if (d.isStatic) {
        const key = `${d.line}:${d.col}:${d.name}`;
        let obj = this.statics.get(key);
        const first = !obj;
        if (first) {
          obj = this.newObject(d.name, d.type, 'static', this.frame.id, d);
          this.statics.set(key, obj);
          if (d.init) yield* this.initObject(obj.addr, obj.type, d.init, d);
        }
        this.topScope().set(d.name, obj);
        this.emit({ type: 'var', obj: this.snapshot(obj), line: d.line, via: first ? 'static' : 'static-again' });
        continue;
      }
      const type = yield* this.resolveType(d.type, d);
      const obj = this.newObject(d.name, type, 'local', this.frame.id, d);
      obj.isConst = d.isConst;
      this.frame.objs.push(obj);
      this.topScope().set(d.name, obj);
      let initDesc = null;
      if (d.init) {
        yield* this.initObject(obj.addr, type, d.init, d);
        initDesc = { exprText: this.src_(d.init), sources: this.reads.slice() };
        if (isPointer(type)) {
          const v = this.peek(obj.addr, type);
          const tp = v ? this.pathOf(v, 1) : null;
          if (tp && tp.obj.kind === 'heap' && !tp.obj.viewType && type.to.size > 0 && type.to.k !== 'void') {
            tp.obj.viewType = type.to;
            this.emit({ type: 'heap-view', objId: tp.obj.id, snap: this.snapshot(tp.obj) });
          }
        }
      }
      this.emit({ type: 'var', obj: this.snapshot(obj), line: d.line, via: 'decl', init: initDesc });
    }
  }

  /** Инициализация объекта по адресу: скаляр, массив, структура, строка; с «пропуском скобок». */
  *initObject(addr, type, init, node) {
    if (init.type === 'InitList' || (init.type === 'Str' && type.k === 'arr')) {
      this.mem.fill(addr, type.size, 0); // всё, что не указано явно, — нули
      if (init.type === 'Str') { this.initString(addr, type, init, node); return; }
      yield* this.initAggregate(addr, type, { items: init.items, i: 0 }, node, true);
      return;
    }
    const v = yield* this.eval(init);
    if (isRecord(type)) {
      if (!v.bytes) throw new RuntimeError('структуру можно инициализировать только структурой того же типа или списком { }', node);
      this.mem.writeBytes(addr, v.bytes);
      return;
    }
    const cn = convNote(v.t, type);
    this.tr({ text: `${node.name ?? ''} = ${this.src_(init)}`, calc: '', value: display(type, convert(v.v, type)), note: cn,
      vis: cn && isArith(v.t) && isArith(type) ? { t: 'conv', explicit: false, from: typeName(v.t), to: typeName(type), before: disp(v), after: display(type, convert(v.v, type)), what: this.src_(init), target: node.name, fromFloat: isFloat(v.t), toFloat: isFloat(type), toChar: type.size === 1 && isInt(type) } : undefined });
    try { this.mem.write(addr, type, v.v); } catch (e) { throw this.fault(e, node); }
  }

  initString(addr, type, init, node) {
    const bytes = init.bytes;
    if (bytes.length > type.len) throw new RuntimeError(`строка из ${bytes.length} байт не помещается в массив из ${type.len} элементов`, node, 'Увеличьте размер массива: нужен ещё 1 байт под завершающий \\0.');
    this.mem.writeBytes(addr, Uint8Array.from(bytes.slice(0, type.len)));
  }

  *initAggregate(addr, type, it, node, braced) {
    if (type.k === 'arr') {
      let idx = 0;
      while (it.i < it.items.length && (type.len == null || idx < type.len || (braced && it.items[it.i].desig?.length))) {
        const item = it.items[it.i];
        if (item.desig?.length && braced) {
          const d = item.desig[0];
          if (d.index == null) break;
          idx = d.index;
        } else if (item.desig?.length && !braced) break;
        const ea = addr + idx * type.of.size;
        yield* this.initElement(ea, type.of, it, node);
        idx++;
      }
      return;
    }
    if (isRecord(type)) {
      let fi = 0;
      while (it.i < it.items.length && (fi < type.fields.length || (braced && it.items[it.i].desig?.length))) {
        const item = it.items[it.i];
        if (item.desig?.length) {
          if (!braced) break;
          const d = item.desig[0];
          const k = type.fields.findIndex(f => f.name === d.field);
          if (k < 0) throw new RuntimeError(`в ${typeName(type)} нет поля «${d.field}»`, item);
          fi = k;
        }
        const f = type.fields[fi];
        yield* this.initElement(addr + f.offset, f.type, it, node);
        fi++;
        if (type.k === 'union') break;
      }
      return;
    }
    yield* this.initElement(addr, type, it, node);
  }

  *initElement(addr, t, it, node) {
    const item = it.items[it.i];
    const clean = item.desig ? { ...item, desig: item.desig.length > 1 ? item.desig.slice(1) : undefined } : item;
    if (t.k === 'arr' || isRecord(t)) {
      if (clean.type === 'InitList') { it.i++; yield* this.initAggregate(addr, t, { items: clean.items, i: 0 }, node, true); return; }
      if (clean.type === 'Str' && t.k === 'arr') { it.i++; this.initString(addr, t, clean, node); return; }
      if (isRecord(t) && clean.type !== 'InitList') {
        // структура из выражения того же типа
        const probe = yield* this.evalMaybeRecord(clean);
        if (probe) { it.i++; this.mem.writeBytes(addr, probe.bytes); return; }
      }
      yield* this.initAggregate(addr, t, it, node, false);
      return;
    }
    it.i++;
    let e = clean;
    while (e.type === 'InitList') e = e.items[0] || { type: 'Num', raw: '0' };
    const v = yield* this.eval(e);
    try { this.mem.write(addr, t, v.v); } catch (err) { throw this.fault(err, node); }
  }

  *evalMaybeRecord(e) {
    if (['Ident', 'Member', 'Index', 'Deref', 'Call', 'CompoundLit'].includes(e.type)) {
      const v = yield* this.eval(e);
      if (v.bytes) return v;
    }
    return null;
  }

  *exec(s) {
    switch (s.type) {
      case 'Decl':
        yield* this.execDecl(s);
        if (!s.typedef && s.decls.length) yield* this.pause(s);
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
      case 'Label':
        this.emit({ type: 'label', name: s.name, line: s.line });
        yield* this.exec(s.stmt);
        return;
      case 'Goto':
        yield* this.pause(s);
        throw new GotoSig(s.label, s);
      case 'If': {
        const c = yield* this.eval(s.cond);
        const val = isTruthy(c.v);
        this.emit({ type: 'cond', kind: 'if', nodeId: s.id, text: this.src_(s.cond), value: val, raw: display(c.t, c.v), line: s.line, reads: this.reads.slice(), hasElse: !!s.alt, elseLine: s.elseLine });
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
        const fr = this.funcs.get(this.frame.func);
        if (v && fr && !isRecord(fr.ret) && fr.ret.k !== 'void') this.tr({ text: `return ${this.src_(s.arg)}`, calc: '', value: display(fr.ret, convert(v.v, fr.ret)), note: convNote(v.t, fr.ret) });
        this.emit({ type: 'return', func: this.frame.func, display: v ? (v.bytes ? '{…}' : display(fr?.ret && !isRecord(fr.ret) && fr.ret.k !== 'void' ? fr.ret : v.t, fr?.ret && !isRecord(fr.ret) && fr.ret.k !== 'void' ? convert(v.v, fr.ret) : v.v)) : null, line: s.line, sources: this.reads.slice(), exprText: this.src_(s.arg) });
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
    try { yield* this.exec(s); } finally { this.closeScope(f, s.line); }
  }

  *execLoop(s) {
    const kind = s.type === 'While' ? 'while' : s.type === 'DoWhile' ? 'do' : 'for';
    const f = this.frame;
    const condText = s.cond ? this.src_(s.cond) : '(всегда истина)';
    if (kind === 'for') f.scopes.push(null);
    this.emit({ type: 'loop-enter', nodeId: s.id, kind, line: s.line, text: condText, head: this.src.slice(s.start, s.body.start).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ').trim() });
    let iter = 0;
    let reason = 'cond';
    try {
      if (kind === 'for' && s.init) {
        if (s.init.type === 'Decl') yield* this.execDecl(s.init);
        else yield* this.eval(s.init.expr);
        this.emit({ type: 'loop-init', nodeId: s.id, text: this.src_(s.init).replace(/;$/, ''), line: s.line });
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
          this.emit({ type: 'loop-update', nodeId: s.id, text: this.src_(s.update), line: s.line });
          yield* this.pause(s, 'loop-update');
        }
      }
    } catch (e) {
      reason = e instanceof ReturnSig || e instanceof ExitSig ? 'return' : e instanceof GotoSig ? 'goto' : 'error';
      this.emit({ type: 'loop-exit', nodeId: s.id, iters: iter, reason, line: s.line });
      if (kind === 'for') this.closeScope(f, s.line);
      throw e;
    }
    this.emit({ type: 'loop-exit', nodeId: s.id, iters: iter, reason, line: s.line });
    if (kind === 'for') this.closeScope(f, s.line);
  }

  *execSwitch(s) {
    const d = yield* this.eval(s.disc);
    const t = promote(isInt(d.t) ? d.t : T.int);
    const val = convert(d.v, t);
    const body = s.body.body;
    let start = -1, matched = null;
    const caseOf = (x) => (x.type === 'Label' ? caseOf(x.stmt) : x);
    for (let i = 0; i < body.length; i++) {
      const x = caseOf(body[i]);
      if (x.type === 'Case') {
        let cv = x.value;
        if (cv == null) cv = Number((yield* this.eval(x.test)).v);
        if (BigInt(cv) === BigInt(val)) { start = i; matched = x; break; }
      }
    }
    if (start < 0) {
      const di = body.findIndex(x => caseOf(x).type === 'Default');
      if (di >= 0) { start = di; matched = caseOf(body[di]); }
    }
    const cases = body.map(caseOf).filter(x => x.type === 'Case' || x.type === 'Default').map(x => ({ line: x.line, label: x.type === 'Default' ? 'default' : this.src_(x.test), hit: x === matched }));
    this.emit({ type: 'switch', nodeId: s.id, text: this.src_(s.disc), display: display(d.t, d.v), caseLine: matched?.line ?? null, isDefault: matched?.type === 'Default', line: s.line, reads: this.reads.slice(), cases });
    yield* this.pause(s, 'cond');
    if (start < 0) return;
    const f = this.frame;
    f.scopes.push(null);
    try {
      for (let i = start; i < body.length; i++) {
        const x = caseOf(body[i]);
        if ((x.type === 'Case' || x.type === 'Default') && i !== start) this.emit({ type: 'fallthrough', line: x.line });
        yield* this.exec(body[i]);
      }
    } catch (e) {
      if (!(e instanceof BreakSig)) throw e;
    } finally {
      this.closeScope(f, s.line);
    }
  }

  // ——— выражения: адреса (lvalue) ———
  *evalLV(e) {
    switch (e.type) {
      case 'Ident': {
        const o = this.lookup(e.name);
        if (o) return { t: o.type, addr: o.addr, prov: o.id, obj: o };
        if (this.funcs.has(e.name)) { const f = this.funcs.get(e.name); return { t: f.ftype, fn: this.funcAddr.get(e.name) }; }
        if (this.builtinAddr.has(e.name)) return { t: { k: 'func', ret: T.int, params: [] }, fn: this.builtinAddr.get(e.name) };
        throw new RuntimeError(`«${e.name}» не объявлена`, e);
      }
      case 'Deref': {
        const p = yield* this.eval(e.arg);
        if (!isPointer(p.t)) throw new RuntimeError('разыменовать можно только указатель', e);
        if (p.t.to.k === 'func') return { t: p.t.to, fn: p.v };
        if (p.t.to.k === 'void') throw new RuntimeError('нельзя разыменовать указатель void *', e, 'Сначала приведите его к нужному типу: *(int *)p.');
        return { t: p.t.to, addr: p.v, prov: p.prov ?? this.objectAt(p.v)?.id };
      }
      case 'Index': {
        let base = yield* this.eval(e.obj);
        let idx = yield* this.eval(e.index);
        if (!isPointer(base.t) && isPointer(idx.t)) [base, idx] = [idx, base];
        if (!isPointer(base.t)) throw new RuntimeError('индексировать можно только массив или указатель', e);
        const et = base.t.to;
        const i = Number(idx.v);
        const addr = base.v + i * et.size;
        const prov = base.prov ?? this.objectAt(base.v)?.id;
        if (this.tracing) {
          const o = this.objectAt(base.v, 1);
          const start = o ? Math.round((base.v - o.addr) / Math.max(1, et.size)) : 0;
          const len = o && et.size ? Math.floor(o.size / et.size) : null;
          let vals = null;
          if (o && len && (isArith(et) || isPointer(et))) {
            vals = [];
            for (let k = 0; k < Math.min(len, 64); k++) {
              const ad = o.addr + k * et.size;
              try { vals.push(this.mem.isInit(ad, et.size) ? display(et, this.mem.read(ad, et)) : '?'); } catch { vals.push('?'); }
            }
          }
          this.tr({ text: this.src_(e), calc: `${this.src_(e.obj)}[${i}]`, value: `адрес 0x${addr.toString(16)}`, note: `${this.src_(e.obj)} + ${i}·${et.size} байт`, kind: 'index',
            vis: { t: 'index', arr: this.src_(e.obj), i, idxText: this.src_(e.index), pos: start + i, len, vals, elem: et.size, type: typeName(et), base: '0x' + base.v.toString(16), addr: '0x' + addr.toString(16) } });
        }
        return { t: et, addr, prov };
      }
      case 'Member': {
        let rt, addr, prov;
        if (e.arrow) {
          const p = yield* this.eval(e.obj);
          if (!isPointer(p.t) || !isRecord(p.t.to)) throw new RuntimeError('-> применяется к указателю на структуру', e);
          if (p.v === 0) throw new RuntimeError(`Segmentation fault: обращение к полю «${e.field}» через NULL-указатель`, e, `Указатель ${this.src_(e.obj)} равен NULL. Проверьте, что ему присвоен адрес структуры.`, 'segfault');
          rt = p.t.to; addr = p.v; prov = p.prov ?? this.objectAt(p.v)?.id;
        } else {
          const lv = yield* this.evalLVorTemp(e.obj);
          rt = lv.t; addr = lv.addr; prov = lv.prov;
        }
        const f = rt.fields?.find(x => x.name === e.field);
        if (!f) throw new RuntimeError(`нет поля «${e.field}»`, e);
        return { t: f.type, addr: addr + f.offset, prov };
      }
      case 'Str': {
        const o = this.stringLiteral(e.bytes);
        return { t: o.type, addr: o.addr, prov: o.id, obj: o };
      }
      case 'CompoundLit': {
        const type = yield* this.resolveType(e.ctype, e);
        const o = this.newObject(`(${typeName(type)}){…}`, type, 'local', this.frame?.id, e);
        o.temp = true;
        this.frame?.objs.push(o);
        yield* this.initObject(o.addr, type, e.init, e);
        return { t: type, addr: o.addr, prov: o.id, obj: o };
      }
      case 'Assign': case 'Cond': case 'Comma': case 'Call': {
        return yield* this.evalLVorTemp(e);
      }
      default:
        throw new RuntimeError('ожидалась переменная (lvalue)', e);
    }
  }

  /** Для выражений-структур, не имеющих адреса (результат функции), создаём временный объект. */
  *evalLVorTemp(e) {
    if (['Ident', 'Deref', 'Index', 'Member', 'Str', 'CompoundLit'].includes(e.type)) return yield* this.evalLV(e);
    const v = yield* this.eval(e);
    if (!v.bytes) throw new RuntimeError('ожидалась структура', e);
    const o = this.newObject('(временная)', v.t, 'local', this.frame?.id, e);
    o.temp = true;
    this.frame?.objs.push(o);
    this.mem.writeBytes(o.addr, v.bytes);
    return { t: v.t, addr: o.addr, prov: o.id };
  }

  stringLiteral(bytes) {
    const key = bytes.join(',');
    if (this.strings.has(key)) return this.strings.get(key);
    const type = arr(T.char, bytes.length + 1);
    const o = this.newObject('"' + decodeBytes(bytes).slice(0, 16) + (bytes.length > 16 ? '…' : '') + '"', type, 'string', 'rodata', null);
    this.mem.rodata.buf.set(Uint8Array.from([...bytes, 0]), o.addr - this.mem.rodata.base);
    this.strings.set(key, o);
    return o;
  }

  // ——— выражения: значения (rvalue) ———
  *eval(e) {
    switch (e.type) {
      case 'Num': return e._lit || (e._lit = numLiteralValue(e));
      case 'Char': return { t: T.int, v: e.value > 127 ? (charToByte(e.value) << 24) >> 24 : e.value };
      case 'EnumConst': return { t: T.int, v: e.value };
      case 'Ident': {
        const o = this.lookup(e.name);
        if (!o) {
          if (this.funcs.has(e.name)) { const f = this.funcs.get(e.name); return { t: ptr(f.ftype), v: this.funcAddr.get(e.name) }; }
          if (this.builtinAddr.has(e.name)) return { t: ptr({ k: 'func', ret: T.int, params: [] }), v: this.builtinAddr.get(e.name) };
          for (const h of this.pp.includes) {
            const k = HEADERS[h.name].consts[e.name];
            if (k) return { t: k.type, v: k.value };
          }
          throw new RuntimeError(`«${e.name}» не объявлена`, e);
        }
        return this.rvalueOf({ t: o.type, addr: o.addr, prov: o.id }, e);
      }
      case 'Str': case 'Index': case 'Member': case 'Deref': case 'CompoundLit': {
        const lv = yield* this.evalLV(e);
        return this.rvalueOf(lv, e);
      }
      case 'Assign': return yield* this.evalAssign(e);
      case 'Update': {
        const lv = yield* this.evalLV(e.arg);
        const old = this.load(lv, e);
        let nv;
        const delta = e.op === '++' ? 1 : -1;
        if (isPointer(lv.t)) nv = old.v + delta * Math.max(1, lv.t.to.size);
        else if (isFloat(lv.t)) nv = old.v + delta;
        else if (typeof old.v === 'bigint') nv = old.v + BigInt(delta);
        else nv = old.v + delta;
        const res = this.store(lv, nv, e, 'inc', { op: e.op, exprText: this.src_(e) });
        this.tr({ text: this.src_(e), calc: `${display(lv.t, old.v)} ${e.op === '++' ? '+' : '−'} 1`, value: display(lv.t, res), note: e.prefix ? 'префиксная форма: значение выражения — новое' : 'постфиксная форма: значение выражения — старое (' + display(lv.t, old.v) + ')',
          vis: { t: 'incdec', name: this.src_(e.arg), op: e.op, prefix: !!e.prefix, old: display(lv.t, old.v), now: display(lv.t, res), ptr: isPointer(lv.t), step: isPointer(lv.t) ? Math.max(1, lv.t.to.size) : 1 } });
        return { t: lv.t, v: e.prefix ? res : old.v, prov: old.prov };
      }
      case 'Binary': {
        const a = yield* this.eval(e.left);
        const b = yield* this.eval(e.right);
        const r = this.binop(e.op, a, b, e);
        if (this.tracing) this.tr({ text: this.src_(e), calc: `${disp(a)} ${e.op} ${disp(b)}`, value: disp(r), note: this.binNote(e.op, a, b, r), vis: this.binVis(e, a, b, r) });
        return r;
      }
      case 'Logical': {
        const a = yield* this.eval(e.left);
        const av = isTruthy(a.v);
        const lvis = (bv, res) => ({ t: 'logic', op: e.op, l: this.src_(e.left), lv: av ? 1 : 0, ld: disp(a), r: this.src_(e.right), rv: bv, res });
        if (e.op === '&&' && !av) { this.emit({ type: 'shortcircuit', op: '&&', line: e.line, text: this.src_(e.right) }); this.tr({ text: this.src_(e), calc: `0 && …`, value: '0', note: 'левая часть ложна — правая не вычисляется', vis: lvis(null, 0) }); return { t: T.int, v: 0 }; }
        if (e.op === '||' && av) { this.emit({ type: 'shortcircuit', op: '||', line: e.line, text: this.src_(e.right) }); this.tr({ text: this.src_(e), calc: `1 || …`, value: '1', note: 'левая часть истинна — правая не вычисляется', vis: lvis(null, 1) }); return { t: T.int, v: 1 }; }
        const b = yield* this.eval(e.right);
        const r = isTruthy(b.v) ? 1 : 0;
        this.tr({ text: this.src_(e), calc: `${av ? 1 : 0} ${e.op} ${isTruthy(b.v) ? 1 : 0}`, value: String(r), note: r ? 'истина' : 'ложь', vis: { ...lvis(isTruthy(b.v) ? 1 : 0, r), rd: disp(b) } });
        return { t: T.int, v: r };
      }
      case 'Unary': {
        const a = yield* this.eval(e.arg);
        if (e.op === '!') { const r = isTruthy(a.v) ? 0 : 1; this.tr({ text: this.src_(e), calc: `!${disp(a)}`, value: String(r), note: 'логическое НЕ' }); return { t: T.int, v: r }; }
        if (!isArith(a.t)) throw new RuntimeError(`унарный ${e.op} неприменим к ${typeName(a.t)}`, e);
        const t = promote(a.t);
        const v = convert(a.v, t);
        let r;
        if (e.op === '+') r = v;
        else if (e.op === '-') r = convert(typeof v === 'bigint' ? -v : -v, t);
        else r = convert(typeof v === 'bigint' ? ~v : ~v, t);
        if (e.op !== '+') this.tr({ text: this.src_(e), calc: `${e.op}${disp(a)}`, value: display(t, r), note: e.op === '~' ? 'побитовое НЕ' : '' });
        return { t, v: r };
      }
      case 'Cast': {
        const a = yield* this.eval(e.arg);
        if (e.ctype.k === 'void') return { t: T.void, v: 0 };
        if (isRecord(e.ctype)) throw new RuntimeError('приведение к структуре недопустимо', e);
        if (isPointer(e.ctype)) {
          const v = isPointer(a.t) ? a.v : Number(convert(a.v, T.long));
          return { t: e.ctype, v, prov: a.prov };
        }
        const r = convert(isPointer(a.t) ? a.v : a.v, e.ctype);
        this.tr({ text: this.src_(e), calc: `(${typeName(e.ctype)}) ${disp(a)}`, value: display(e.ctype, r), note: convNote(a.t, e.ctype) || 'приведение типа',
          vis: { t: 'conv', explicit: true, from: typeName(a.t), to: typeName(e.ctype), before: disp(a), after: display(e.ctype, r), what: this.src_(e.arg), fromFloat: isFloat(a.t), toFloat: isFloat(e.ctype), toChar: e.ctype.size === 1 && isInt(e.ctype) } });
        return { t: e.ctype, v: r };
      }
      case 'SizeofType': this.tr({ text: this.src_(e), calc: `размер типа ${typeName(e.ctype)}`, value: String(e.ctype.size), note: 'байт', vis: { t: 'sizeof', what: typeName(e.ctype), type: typeName(e.ctype), size: e.ctype.size } }); return { t: T.ulong, v: BigInt(e.ctype.size) };
      case 'SizeofExpr': {
        const saveTr = this.tracing; this.tracing = false;
        let t;
        try {
          if (['Ident', 'Index', 'Member', 'Deref', 'Str'].includes(e.arg.type)) {
            const saveE = this.events.length;
            const lv = yield* this.evalLV(e.arg);
            this.events.length = saveE;
            t = lv.t;
          } else t = (yield* this.eval(e.arg)).t;
        } finally { this.tracing = saveTr; }
        this.tr({ text: this.src_(e), calc: `размер ${typeName(t)}`, value: String(t.size), note: 'байт', vis: { t: 'sizeof', what: this.src_(e.arg), type: typeName(t), size: t.size, len: t.k === 'arr' ? t.len : null, elem: t.k === 'arr' ? t.of.size : null } });
        return { t: T.ulong, v: BigInt(t.size) };
      }
      case 'AddrOf': {
        const lv = yield* this.evalLV(e.arg);
        if (lv.fn) return { t: ptr(lv.t), v: lv.fn };
        const r = { t: ptr(lv.t), v: lv.addr, prov: lv.prov };
        if (this.tracing) { const p = this.pathOf(lv.addr, lv.t.size); this.tr({ text: this.src_(e), calc: `адрес ${p?.path ?? this.src_(e.arg)}`, value: '0x' + lv.addr.toString(16), note: '& — «где лежит» объект', vis: { t: 'addr', name: p?.path ?? this.src_(e.arg), addr: '0x' + lv.addr.toString(16), size: lv.t.size, type: typeName(lv.t) } }); }
        return r;
      }
      case 'Cond': {
        const c = yield* this.eval(e.cond);
        const val = isTruthy(c.v);
        this.emit({ type: 'ternary', text: this.src_(e.cond), value: val, line: e.line });
        const r = val ? yield* this.eval(e.a) : yield* this.eval(e.b);
        // тип результата — общий тип ветвей (упрощённо: арифметические приводим)
        this.tr({ text: this.src_(e), calc: `${val ? 'истина' : 'ложь'} → ${val ? this.src_(e.a) : this.src_(e.b)}`, value: disp(r), note: 'тернарная операция',
          vis: { t: 'ternary', cond: this.src_(e.cond), cv: disp(c), yes: this.src_(e.a), no: this.src_(e.b), chosen: val, value: disp(r) } });
        return r;
      }
      case 'Comma': {
        let r;
        for (const x of e.list) r = yield* this.eval(x);
        return r;
      }
      case 'Call': return yield* this.evalCall(e);
      case 'InitList': throw new RuntimeError('список { } можно использовать только при объявлении', e, 'Для массива присваивайте элементы по одному, для структуры — поля по одному.');
    }
    throw new RuntimeError(`не удалось вычислить выражение (${e.type})`, e);
  }

  rvalueOf(lv, node) {
    if (lv.fn !== undefined) return { t: ptr(lv.t), v: lv.fn };
    if (lv.t.k === 'arr') {
      if (this.tracing) { const p = this.pathOf(lv.addr, lv.t.size || 1); if (p) this.reads.push({ objId: p.obj.id, path: p.path, display: `массив, адрес ${display(ptr(lv.t.of), lv.addr)}` }); }
      return { t: ptr(lv.t.of), v: lv.addr, prov: lv.prov };
    }
    if (lv.t.k === 'func') return { t: ptr(lv.t), v: lv.addr };
    const r = this.load(lv, node);
    if (isPointer(r.t)) r.prov = undefined;
    return r;
  }

  *evalAssign(e) {
    const lv = yield* this.evalLV(e.target);
    if (lv.t.k === 'arr') throw new RuntimeError('массиву нельзя присвоить значение целиком', e, 'Для строк используйте strcpy, для массивов — цикл.');
    const rhs = yield* this.eval(e.value);
    let nv;
    if (isRecord(lv.t)) {
      if (e.op !== '=' || !rhs.bytes) throw new RuntimeError('структуре можно присвоить только структуру того же типа', e);
      nv = rhs;
      this.store(lv, nv, e, 'assign', { op: e.op, exprText: this.src_(e.value), fullText: this.src_(e) });
      this.tr({ text: this.src_(e), calc: 'копирование всех полей', value: '{…}', note: `${lv.t.size} байт скопировано` });
      return rhs;
    }
    if (e.op === '=') nv = rhs.v;
    else {
      const cur = this.load(lv, e.target);
      const r = this.binop(e.op.slice(0, -1), cur, rhs, e);
      this.tr({ text: `${this.src_(e.target)} ${e.op.slice(0, -1)} ${this.src_(e.value)}`, calc: `${disp(cur)} ${e.op.slice(0, -1)} ${disp(rhs)}`, value: disp(r), note: this.binNote(e.op.slice(0, -1), cur, rhs, r),
        vis: this.binVis({ op: e.op.slice(0, -1), left: e.target, right: e.value }, cur, rhs, r) || { t: 'compound', target: this.src_(e.target), op: e.op, rhs: this.src_(e.value), cur: disp(cur), rv: disp(rhs), res: disp(r) } });
      nv = r.v;
      rhs.t = r.t;
    }
    if (isPointer(lv.t) && isArith(rhs.t) && e.op === '=' && Number(rhs.v) !== 0)
      this.runtimeWarn(`указателю присвоено число ${disp(rhs)} — это не адрес переменной`, e, 'Указателю присваивают адрес: p = &x; или результат malloc.');
    const res = this.store(lv, nv, e, e.op === '=' ? 'assign' : 'compound', { op: e.op, exprText: this.src_(e.value), fullText: this.src_(e) });
    const cn = convNote(rhs.t, lv.t);
    this.tr({ text: `${this.src_(e.target)} ← ${display(lv.t, res)}`, calc: '', value: display(lv.t, res), note: cn, kind: 'store',
      vis: cn && isArith(rhs.t) && isArith(lv.t) ? { t: 'conv', explicit: false, from: typeName(rhs.t), to: typeName(lv.t), before: disp(rhs), after: display(lv.t, res), what: this.src_(e.value), target: this.src_(e.target), fromFloat: isFloat(rhs.t), toFloat: isFloat(lv.t), toChar: lv.t.size === 1 && isInt(lv.t) } : undefined });
    return { t: lv.t, v: res };
  }

  /** Данные для наглядной картинки бинарной операции (панель «Операция»). */
  binVis(e, a, b, r) {
    if (!this.tracing || !a || !b || !r || a.bytes || b.bytes) return undefined;
    const op = e.op;
    const num = (x) => (typeof x.v === 'bigint' ? Number(x.v) : x.v);
    const isCh = (n, x) => n?.type === 'Char' || (isInt(x.t) && x.t.size === 1 && x.t.k !== '_Bool');
    const cmp = ['<', '>', '<=', '>=', '==', '!='].includes(op);
    if (!isArith(a.t) || !isArith(b.t)) return undefined;
    const chars = [];
    for (const [n, x] of [[e.left, a], [e.right, b]]) if (isCh(n, x)) chars.push({ text: this.src_(n), code: num(x) });
    if (chars.length && (op === '+' || op === '-' || cmp)) return { t: 'ascii', op, chars, a: num(a), b: num(b), res: disp(r), text: this.src_(e), lt: this.src_(e.left), rt: this.src_(e.right) };
    if ((op === '/' || op === '%') && isInt(a.t) && isInt(b.t)) {
      const A = num(a), B = num(b);
      if (B !== 0 && Math.abs(A) <= 1e15) return { t: 'div', op, a: A, b: B, q: Math.trunc(A / B), r: A % B, real: A / B, lt: this.src_(e.left), rt: this.src_(e.right) };
    }
    if (op === '/' && (isFloat(a.t) || isFloat(b.t))) return { t: 'fdiv', a: disp(a), b: disp(b), res: disp(r), lt: this.src_(e.left), rt: this.src_(e.right), aInt: isInt(a.t), bInt: isInt(b.t) };
    if (cmp) return { t: 'cmp', op, a: num(a), b: num(b), ad: disp(a), bd: disp(b), res: num(r), lt: this.src_(e.left), rt: this.src_(e.right) };
    return undefined;
  }

  binNote(op, a, b, r) {
    if (op === '/' && isInt(r.t) && isInt(a.t) && isInt(b.t)) {
      const rem = typeof a.v === 'bigint' ? a.v % BigInt(b.v || 1) : Number(a.v) % Number(b.v || 1);
      return rem != 0 ? 'целочисленное деление: дробная часть отброшена' : 'целочисленное деление';
    }
    if (op === '%') return 'остаток от деления';
    if (['<', '>', '<=', '>=', '==', '!='].includes(op)) return Number(r.v) ? 'истина' : 'ложь';
    if (isArith(a.t) && isArith(b.t) && isFloat(r.t) && (isInt(a.t) || isInt(b.t))) return 'целое превращается в дробное';
    if (isPointer(a.t) && isInt(b.t)) return `сдвиг адреса на ${disp(b)}·${a.t.to.size} байт`;
    if (r.overflow) return `переполнение ${typeName(r.t)}!`;
    if (op === '&') return 'побитовое И';
    if (op === '|') return 'побитовое ИЛИ';
    if (op === '^') return 'исключающее ИЛИ';
    if (op === '<<' || op === '>>') return 'сдвиг битов';
    return '';
  }

  binop(op, a, b, node) {
    if (isRecord(a.t) || isRecord(b.t)) throw new RuntimeError(`операция ${op} неприменима к структурам`, node);
    const pa = isPointer(a.t), pb = isPointer(b.t);
    if (pa || pb) {
      if ((op === '+' || op === '-') && pa && !pb) {
        const n = Number(b.v) * (op === '-' ? -1 : 1);
        const sz = a.t.to.size || 1;
        return { t: a.t, v: a.v + n * sz, prov: a.prov ?? this.objectAt(a.v)?.id };
      }
      if (op === '+' && pb && !pa) {
        const n = Number(a.v);
        return { t: b.t, v: b.v + n * (b.t.to.size || 1), prov: b.prov ?? this.objectAt(b.v)?.id };
      }
      const x = pa ? a.v : Number(a.v ?? 0), y = pb ? b.v : Number(b.v ?? 0);
      if (op === '-' && pa && pb) return { t: T.long, v: BigInt(Math.trunc((x - y) / (a.t.to.size || 1))) };
      const cmp = { '==': x === y, '!=': x !== y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y }[op];
      if (cmp !== undefined) return { t: T.int, v: cmp ? 1 : 0 };
      if (op === '&&' || op === '||') return { t: T.int, v: 0 };
      throw new RuntimeError(`операция ${op} неприменима к адресам`, node);
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
      const res = convert(r, ct);
      const out = { t: ct, v: res };
      if (res !== r && ['+', '-', '*'].includes(op)) {
        this.emitOverflow(ct, r, res, node);
        if (ct.signed) { out.overflow = true; this.runtimeWarn(`переполнение типа ${typeName(ct)}`, node, 'Результат не поместился в 64 бита.'); }
      }
      return out;
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
    const out = { t: ct, v: res };
    if (op === '+' || op === '-' || op === '*') {
      const exact = op === '*' ? x * yy : r;
      if (exact !== res && Number.isFinite(exact)) this.emitOverflow(ct, Number.isSafeInteger(exact) ? BigInt(exact) : BigInt(x) * BigInt(yy), BigInt(res), node);
    }
    if (ct.signed && (op === '+' || op === '-' || op === '*')) {
      const exact = op === '*' ? x * yy : r;
      if (exact !== res) {
        out.overflow = true;
        this.runtimeWarn(`переполнение типа ${typeName(ct)}: результат ${op === '*' ? x + '*' + yy : x + op + yy} не помещается и «перескакивает» в ${res}`, node,
          `Диапазон ${typeName(ct)}: ${ct.size === 4 ? '−2 147 483 648 … 2 147 483 647' : ''}. Используйте тип пошире: long (и %ld в printf).`);
      }
    }
    return out;
  }

  // ——— вызовы ———
  *evalCall(e) {
    let target = null;
    if (e.callee && !this.lookup(e.callee)) {
      if (this.funcs.has(e.callee)) target = { user: this.funcs.get(e.callee), name: e.callee };
      else target = { builtin: e.callee, name: e.callee };
    } else {
      const fv = yield* this.eval(e.calleeNode);
      if (fv.v === 0) throw new RuntimeError('Segmentation fault: вызов функции через NULL-указатель', e, 'Указателю на функцию не присвоено значение.', 'segfault');
      target = this.addrFunc.get(fv.v);
      if (!target) throw new RuntimeError(`Segmentation fault: по адресу 0x${Number(fv.v).toString(16)} нет функции`, e, '', 'segfault');
    }
    if (target.user) {
      const f = target.user;
      // как gcc на x86-64: аргументы вычисляются справа налево
      const args = new Array(e.args.length);
      for (let i = e.args.length - 1; i >= 0; i--) {
        const a = yield* this.eval(e.args[i]);
        const p = f.params[i];
        if (p && !isRecord(p.type)) args[i] = { t: p.type, v: convert(a.v, p.type) };
        else args[i] = isFloat(a.t) && !p ? { t: T.double, v: a.v } : a;
      }
      const argReads = this.reads.slice();
      this.emit({ type: 'call', func: target.name, line: e.line, args: args.map(a => (a.bytes ? '{…}' : display(a.t, a.v))), sources: argReads });
      this.tr({ text: this.src_(e), calc: `${target.name}(${args.map(a => (a.bytes ? '{…}' : display(a.t, a.v))).join(', ')})`, value: '…', note: 'вызов функции: аргументы копируются в параметры', kind: 'call' });
      yield* this.pause(e, 'call');
      const r = yield* this.callUser(f, args, e);
      this.reads = [{ objId: 'fn:' + target.name, path: target.name + '()', display: r ? (r.bytes ? '{…}' : display(r.t, r.v)) : 'void' }];
      if (r && !r.bytes) this.tr({ text: this.src_(e), calc: `${target.name}(…) вернула`, value: display(r.t, r.v), note: '' });
      return r || { t: T.void, v: 0 };
    }
    return yield* this.callBuiltin(target.builtin, e);
  }

  // ——— помощники для библиотеки ———
  cstr(v, node) {
    if (v === 0) throw new RuntimeError('Segmentation fault: строка по адресу NULL', node, 'Передан нулевой указатель вместо строки.', 'segfault');
    try { return this.mem.cstring(v); } catch (err) { throw this.fault(err, node); }
  }
  writeCString(addr, bytes, node, prov, what) {
    const po = prov ? this.objById.get(prov) : this.objectAt(addr);
    if (po && addr + bytes.length + 1 > po.addr + po.size)
      throw new RuntimeError(`${what}: строка из ${bytes.length} символов не помещается в «${po.name}» (${po.addr + po.size - addr} байт с учётом \\0)`, node,
        `Нужен массив минимум из ${bytes.length + 1} элементов (последний — для завершающего \\0). В настоящем C это переполнение буфера — опасная ошибка.`, 'bounds');
    try { this.mem.writeBytes(addr, Uint8Array.from([...bytes, 0])); } catch (err) { throw this.fault(err, node); }
    const p = this.pathOf(addr, 1);
    if (p) this.emit({ type: 'write', objId: p.obj.id, path: p.path, display: JSON.stringify(decodeBytes(bytes)), old: '', line: node.line, via: what, sources: [], snap: this.snapshot(p.obj) });
  }
  touch(addr, node, via) {
    const p = this.pathOf(addr, 1);
    if (p) this.emit({ type: 'write', objId: p.obj.id, path: p.path, display: '…', old: '', line: node.line, via, sources: [], snap: this.snapshot(p.obj) });
  }
  checkRange(addr, n, prov, node, what) {
    if (n <= 0) return;
    this.checkAccess(addr, n, prov, node, true);
    const po = prov ? this.objById.get(prov) : null;
    if (!po) { try { this.mem.locate(addr, n, false); } catch (err) { throw this.fault(err, node, ` (${what})`); } }
  }

  writeOut(text, node, fn, extra = {}) {
    this.output += text;
    this.emit({ type: 'output', fn, text, line: node.line, stream: 'stdout', sources: this.reads.slice(), ...extra });
  }

  *waitInput(node) {
    this.emit({ type: 'input-wait', line: node.line, buffer: this.input.text.slice(this.input.pos) });
    yield* this.pause(node, 'input', { needInput: true });
  }

  /** Источник для scanf/getchar: stdin, файл или строка. */
  sourceOf(kind, handle) {
    if (kind === 'stdin') return this.input;
    return handle;
  }

  *printfCore(fn, args, fmtArgIndex, e) {
    const fmt = args[fmtArgIndex];
    if (!isPointer(fmt.t) || fmt.v === 0) throw new RuntimeError(`${fn}: строка формата — нулевой указатель`, e);
    const fmtBytes = this.cstr(fmt.v, e);
    const vals = args.slice(fmtArgIndex + 1).map(a => (isFloat(a.t) ? { t: T.double, v: a.v } : a));
    const res = formatPrintf(fmtBytes, vals, {
      readString: (addr, max) => { try { return this.mem.cstring(addr, max ?? (1 << 20)); } catch (err) { throw this.fault(err, e, ' (%s получил неверный адрес строки)'); } },
      decimalComma: this.decimalComma,
    });
    if (res.issues.includes('missing')) this.runtimeWarn(`${fn}: аргументов меньше, чем спецификаторов — выведен «мусор»`, e, 'Для каждого % нужно передать значение.');
    const argNodes = e.args.slice(fmtArgIndex + 1);
    const pieces = res.pieces.map(p => ({
      kind: p.kind, src: p.src, desc: p.desc, out: decodeBytes(p.bytes),
      arg: p.argIndex != null && argNodes[p.argIndex] ? { text: this.src_(argNodes[p.argIndex]), display: vals[p.argIndex]?.bytes ? '{…}' : display(vals[p.argIndex]?.t, vals[p.argIndex]?.v) } : null,
    }));
    return { bytes: res.bytes, text: decodeBytes(res.bytes), pieces, fmt: decodeBytes(fmtBytes) };
  }

  *scanfCore(fn, src, fmtBytes, targets, e, argNodes) {
    const fmt = String.fromCharCode(...fmtBytes);
    let res;
    for (;;) {
      try { res = runScanf(fmt, src, { decimalComma: this.decimalComma }); break; }
      catch (err) {
        if (!(err instanceof NeedInput)) throw err;
        yield* this.waitInput(e);
      }
    }
    const startPos = src.pos;
    const consumed = src.text.slice(startPos, res.pos);
    const bufferView = src.text.slice(startPos, Math.max(res.pos, startPos) + 40);
    src.pos = res.pos;
    const written = [];
    let ti = 0;
    for (const it of res.items) {
      if (it.suppressed) continue;
      const tg = targets[ti];
      const node = argNodes[ti];
      ti++;
      if (!tg) break;
      if (!isPointer(tg.t)) {
        const nm = node?.type === 'Ident' ? node.name : this.src_(node);
        throw new RuntimeError(`Segmentation fault: ${fn} получил значение ${display(tg.t, tg.v)} вместо адреса переменной «${nm}»`, node || e,
          `${fn} должен знать, КУДА записать число — ему нужен адрес: &${nm}. Без & значение переменной (${display(tg.t, tg.v)}) было принято за адрес в памяти, и запись туда уничтожила программу.`, 'segfault');
      }
      const tt = tg.t.to;
      const lv = { t: tt, addr: tg.v, prov: tg.prov ?? this.objectAt(tg.v)?.id };
      if (it.conv === 's') {
        const bytes = src === this.input ? encodeUtf8(it.value) : [...it.value].map(c => c.charCodeAt(0) & 0xff);
        this.writeCString(tg.v, bytes, e, lv.prov, fn);
        written.push({ path: this.pathOf(tg.v, 1)?.path ?? '?', display: JSON.stringify(it.value), typeName: 'char[]' });
        continue;
      }
      if (it.conv === 'c') {
        const bytes = [...it.value].map(ch => { const code = ch.charCodeAt(0); return code < 256 ? code : charToByte(code); });
        this.checkRange(tg.v, bytes.length, lv.prov, e, fn);
        this.mem.writeBytes(tg.v, Uint8Array.from(bytes));
        const p = this.pathOf(tg.v, 1);
        if (p) this.emit({ type: 'write', objId: p.obj.id, path: p.path, display: display(T.char, (bytes[0] << 24) >> 24), old: '', line: e.line, via: 'scanf', inputText: it.text, sources: [], cell: this.cellIndexOf(p.obj, tg.v) });
        written.push({ path: p?.path ?? '?', display: display(T.char, (bytes[0] << 24) >> 24), typeName: 'char' });
        continue;
      }
      let v;
      if ('fFeEgGaA'.includes(it.conv)) {
        const isDoubleSpec = it.len === 'l' || it.len === 'L';
        if (tt.k === 'double' && !isDoubleSpec) {
          const dv = new DataView(new ArrayBuffer(8));
          dv.setFloat64(0, this.peek(tg.v, T.double), true);
          dv.setFloat32(0, it.value, true);
          v = dv.getFloat64(0, true);
          this.runtimeWarn(`${fn}("%f") записал float в переменную double — получился мусор ${display(T.double, v)}`, node, 'Для double используйте %lf.');
        } else if (tt.k === 'float' && isDoubleSpec) {
          const dv = new DataView(new ArrayBuffer(8));
          dv.setFloat64(0, it.value, true);
          v = dv.getFloat32(0, true);
          this.runtimeWarn(`${fn}("%lf") записал 8 байт в переменную float — получился мусор`, node, 'Для float используйте %f.');
        } else v = it.value;
      } else {
        v = it.value;
        if (isFloat(tt)) this.runtimeWarn(`${fn}("%${it.conv}") в вещественную переменную`, node, 'Для double используйте %lf, для float — %f.');
      }
      this.reads = [];
      const r = this.store(lv, v, e, 'scanf', { inputText: it.text });
      written.push({ path: this.pathOf(tg.v, tt.size)?.path ?? '?', display: display(tt, r), typeName: typeName(tt) });
    }
    this.emit({
      type: 'input', fn, fmt: decodeBytes(fmtBytes), text: consumed, buffer: bufferView, consumedLen: res.pos - startPos,
      pieces: res.pieces.map(p => ({ ...p, from: p.from - startPos, to: p.to - startPos, skipTo: p.skipTo != null ? p.skipTo - startPos : undefined })),
      targets: written, count: res.count, expected: targets.length, line: e.line, stream: src === this.input ? 'stdin' : fn === 'sscanf' ? 'string' : 'file',
    });
    if (res.count < targets.length && res.count !== -1 && targets.length)
      this.runtimeWarn(`${fn} прочитал ${res.count} из ${targets.length} значений — ввод не совпал с форматом «${fmt}»`, e,
        'Проверьте, что вводите числа в нужном формате (например, целое для %d). Непрочитанные переменные сохранят старые значения.');
    if (res.count === -1) this.emit({ type: 'note', text: `${fn}: ввод закончился (EOF) — вернул -1`, line: e.line });
    return { t: T.int, v: res.count };
  }

  fileOf(v, node, fn) {
    const h = this.handles.get(v);
    if (!h) throw new RuntimeError(v === 0 ? `${fn}: файловый указатель равен NULL` : `${fn}: неверный файловый указатель`, node,
      v === 0 ? 'Файл не открылся: fopen вернул NULL (например, файла с таким именем нет). Проверяйте результат: if (f == NULL) { ... }' : 'Передайте указатель, полученный от fopen.', 'file');
    if (h.file && !h.open) throw new RuntimeError(`${fn}: файл «${h.name}» уже закрыт`, node, 'После fclose файлом пользоваться нельзя.', 'file');
    return h;
  }
  flushFile(h) { this.files.set(h.name, { bytes: h.data }); }
  fileText(h) { return String.fromCharCode(...h.data); }

  *callBuiltin(name, e) {
    const args = new Array(e.args.length);
    for (let i = e.args.length - 1; i >= 0; i--) args[i] = yield* this.eval(e.args[i]);
    const num = (i) => Number(convert(args[i]?.v ?? 0, T.double));
    const int = (i) => Number(convert(args[i]?.v ?? 0, T.long));
    const bi = (fn, argsDisp, result, t) => {
      this.emit({ type: 'builtin', fn, args: argsDisp, result, line: e.line, sources: this.reads.slice() });
      const h = this.headerOf(fn);
      this.tr({ text: this.src_(e), calc: `${fn}(${argsDisp.join(', ')})`, value: result ?? '', note: HEADERS[h]?.funcs[fn]?.desc || '',
        vis: { t: 'fn', fn, args: argsDisp, argTexts: e.args.map(x => this.src_(x)), result: result ?? '', desc: HEADERS[h]?.funcs[fn]?.desc || '', header: h } });
    };
    const retPtr = (v, prov) => ({ t: ptr(T.char), v, prov });

    switch (name) {
      // ——— вывод ———
      case 'printf': {
        const r = yield* this.printfCore('printf', args, 0, e);
        this.writeOut(r.text, e, 'printf', { fmt: r.fmt, pieces: r.pieces });
        return { t: T.int, v: r.bytes.length };
      }
      case 'fprintf': {
        const h = this.fileOf(args[0].v, e, 'fprintf');
        const r = yield* this.printfCore('fprintf', args, 1, e);
        this.putBytes(h, r.bytes, r.text, e, 'fprintf', { fmt: r.fmt, pieces: r.pieces });
        return { t: T.int, v: r.bytes.length };
      }
      case 'sprintf': case 'snprintf': {
        const fi = name === 'sprintf' ? 1 : 2;
        const r = yield* this.printfCore(name, args, fi, e);
        let bytes = r.bytes;
        if (name === 'snprintf') { const n = int(1); bytes = n > 0 ? bytes.slice(0, n - 1) : []; if (n === 0) return { t: T.int, v: r.bytes.length }; }
        this.writeCString(args[0].v, bytes, e, args[0].prov, name);
        this.emit({ type: 'output', fn: name, text: decodeBytes(bytes), line: e.line, stream: 'string', target: this.pathOf(args[0].v, 1)?.path, fmt: r.fmt, pieces: r.pieces, sources: this.reads.slice() });
        return { t: T.int, v: r.bytes.length };
      }
      case 'puts': {
        const bytes = this.cstr(args[0].v, e);
        this.writeOut(decodeBytes(bytes) + '\n', e, 'puts', { pieces: [{ kind: 'spec', src: 'строка', desc: 'текст строки', out: decodeBytes(bytes) }, { kind: 'lit', src: '\\n', out: '\n' }] });
        return { t: T.int, v: 1 };
      }
      case 'putchar': {
        const c = int(0) & 0xff;
        this.writeOut(decodeBytes([c]), e, 'putchar');
        return { t: T.int, v: c };
      }
      case 'fputs': case 'fputc': case 'putc': {
        const h = this.fileOf(args[1].v, e, name);
        const bytes = name === 'fputs' ? this.cstr(args[0].v, e) : [int(0) & 0xff];
        this.putBytes(h, bytes, decodeBytes(bytes), e, name);
        return { t: T.int, v: name === 'fputs' ? 1 : bytes[0] };
      }
      // ——— ввод ———
      case 'scanf': {
        const fmt = this.cstr(args[0].v, e);
        return yield* this.scanfCore('scanf', this.input, fmt, args.slice(1), e, e.args.slice(1));
      }
      case 'sscanf': {
        const str = this.cstr(args[0].v, e);
        const src = { text: String.fromCharCode(...str), pos: 0, eof: true };
        return yield* this.scanfCore('sscanf', src, this.cstr(args[1].v, e), args.slice(2), e, e.args.slice(2));
      }
      case 'fscanf': {
        const h = this.fileOf(args[0].v, e, 'fscanf');
        if (h.std === 'stdin') return yield* this.scanfCore('fscanf', this.input, this.cstr(args[1].v, e), args.slice(2), e, e.args.slice(2));
        const src = { text: this.fileText(h), pos: h.pos, eof: true };
        const r = yield* this.scanfCore('fscanf', src, this.cstr(args[1].v, e), args.slice(2), e, e.args.slice(2));
        h.pos = src.pos;
        if (h.pos >= h.data.length) h.eof = r.v === -1 || h.eof;
        if (r.v === -1) h.eof = true;
        return r;
      }
      case 'getchar': case 'fgetc': case 'getc': {
        if (name !== 'getchar') {
          const h = this.fileOf(args[0].v, e, name);
          if (!h.std) {
            if (h.pos >= h.data.length) { h.eof = true; return { t: T.int, v: -1 }; }
            const c = h.data[h.pos++];
            this.emit({ type: 'input', fn: name, text: String.fromCharCode(c), targets: [], line: e.line, stream: 'file' });
            return { t: T.int, v: c };
          }
        }
        for (;;) {
          if (this.input.pos < this.input.text.length) {
            const ch = this.input.text[this.input.pos++];
            const code = ch.charCodeAt(0);
            this.emit({ type: 'input', fn: name, text: ch, targets: [], line: e.line, stream: 'stdin', pieces: [{ kind: 'spec', src: 'символ', desc: 'один символ', from: 0, to: 1 }], buffer: this.input.text.slice(this.input.pos - 1, this.input.pos + 30), consumedLen: 1 });
            return { t: T.int, v: code < 128 ? code : charToByte(code) };
          }
          if (this.input.eof) return { t: T.int, v: -1 };
          yield* this.waitInput(e);
        }
      }
      case 'gets': case 'fgets': {
        let max = name === 'fgets' ? int(1) : 1 << 20;
        let src = this.input;
        if (name === 'fgets') {
          const h = this.fileOf(args[2].v, e, 'fgets');
          if (!h.std) src = { file: h };
        }
        let line;
        if (src.file) {
          const h = src.file;
          if (h.pos >= h.data.length) { h.eof = true; return retPtr(0); }
          const bytes = [];
          while (h.pos < h.data.length && bytes.length < max - 1) { const c = h.data[h.pos++]; bytes.push(c); if (c === 10) break; }
          this.writeCString(args[0].v, bytes, e, args[0].prov, name);
          return retPtr(args[0].v, args[0].prov);
        }
        for (;;) {
          const nl = this.input.text.indexOf('\n', this.input.pos);
          if (nl >= 0 || this.input.eof) {
            const end = nl >= 0 ? nl + 1 : this.input.text.length;
            if (end === this.input.pos) return retPtr(0);
            line = this.input.text.slice(this.input.pos, end);
            break;
          }
          yield* this.waitInput(e);
        }
        let take = line;
        if (name === 'fgets') take = [...line].slice(0, Math.max(0, max - 1)).join('');
        else take = line.replace(/\n$/, '');
        this.input.pos += (name === 'gets' ? line.length : take.length);
        this.writeCString(args[0].v, encodeUtf8(take), e, args[0].prov, name);
        this.emit({ type: 'input', fn: name, text: take, targets: [{ path: this.pathOf(args[0].v, 1)?.path ?? '?', display: JSON.stringify(take), typeName: 'char[]' }], line: e.line, stream: 'stdin', buffer: line, consumedLen: take.length, pieces: [{ kind: 'spec', src: 'строка', desc: name === 'fgets' ? `до \\n или ${max - 1} симв.` : 'до \\n', from: 0, to: take.length }] });
        return retPtr(args[0].v, args[0].prov);
      }
      // ——— файлы ———
      case 'fopen': {
        const fname = decodeBytes(this.cstr(args[0].v, e));
        const mode = decodeBytes(this.cstr(args[1].v, e));
        const exists = this.files.has(fname);
        if (/^r/.test(mode) && !exists) {
          this.emit({ type: 'file', action: 'open-fail', name: fname, mode, line: e.line });
          return { t: ptr(FILE_T), v: 0 };
        }
        const addr = this.mem.allocStatic(FILE_T.size, 8);
        let data = exists ? [...this.files.get(fname).bytes] : [];
        if (/^w/.test(mode)) data = [];
        const h = { file: true, open: true, name: fname, mode, data, pos: /^a/.test(mode) ? data.length : 0, eof: false, addr };
        this.handles.set(addr, h);
        this.flushFile(h);
        this.emit({ type: 'file', action: 'open', name: fname, mode, handle: addr, text: this.fileText(h), line: e.line });
        return { t: ptr(FILE_T), v: addr };
      }
      case 'fclose': {
        const h = this.fileOf(args[0].v, e, 'fclose');
        if (h.std) return { t: T.int, v: 0 };
        h.open = false;
        this.flushFile(h);
        this.emit({ type: 'file', action: 'close', name: h.name, line: e.line, text: this.fileText(h) });
        return { t: T.int, v: 0 };
      }
      case 'feof': { const h = this.fileOf(args[0].v, e, 'feof'); return { t: T.int, v: h.std ? (this.input.eof && this.input.pos >= this.input.text.length ? 1 : 0) : (h.eof ? 1 : 0) }; }
      case 'fflush': return { t: T.int, v: 0 };
      case 'rewind': { const h = this.fileOf(args[0].v, e, 'rewind'); h.pos = 0; h.eof = false; return { t: T.void, v: 0 }; }
      case 'remove': { const n = decodeBytes(this.cstr(args[0].v, e)); const had = this.files.delete(n); if (had) this.emit({ type: 'file', action: 'remove', name: n, line: e.line }); return { t: T.int, v: had ? 0 : -1 }; }
      // ——— динамическая память ———
      case 'malloc': case 'calloc': {
        const size = name === 'malloc' ? int(0) : int(0) * int(1);
        if (size < 0 || size > (32 << 20)) { this.runtimeWarn(`${name}(${size}): слишком большой размер — вернул NULL`, e); return { t: ptr(T.void), v: 0 }; }
        const obj = this.newObject(`блок${++this.heapSeq}`, arr(T.uchar, Math.max(size, 1)), 'heap', 'heap', e);
        obj.size = size;
        obj.allocLine = e.line;
        if (name === 'calloc') this.mem.fill(obj.addr, size, 0);
        this.emit({ type: 'alloc', fn: name, obj: this.snapshot(obj), size, line: e.line });
        bi(name, name === 'malloc' ? [String(size)] : [String(int(0)), String(int(1))], '0x' + obj.addr.toString(16));
        return { t: ptr(T.void), v: obj.addr, prov: obj.id };
      }
      case 'realloc': {
        const old = args[0].v;
        const size = int(1);
        const oldObj = old ? this.objectAt(old) : null;
        if (old && (!oldObj || oldObj.kind !== 'heap' || oldObj.addr !== old)) throw new RuntimeError('realloc: адрес не был получен от malloc', e, 'Передавайте в realloc только указатель из malloc/calloc/realloc.');
        const obj = this.newObject(`блок${++this.heapSeq}`, arr(T.uchar, Math.max(size, 1)), 'heap', 'heap', e);
        obj.size = size; obj.viewType = oldObj?.viewType; obj.allocLine = e.line;
        if (oldObj) {
          const n = Math.min(size, oldObj.size);
          this.mem.copy(obj.addr, oldObj.addr, n);
          oldObj.freed = true; this.killObject(oldObj);
          this.emit({ type: 'free', objId: oldObj.id, line: e.line, fn: 'realloc' });
        }
        this.emit({ type: 'alloc', fn: 'realloc', obj: this.snapshot(obj), size, line: e.line });
        return { t: ptr(T.void), v: obj.addr, prov: obj.id };
      }
      case 'free': {
        const a = args[0].v;
        if (a === 0) return { t: T.void, v: 0 };
        const obj = this.objects.find(o => o.kind === 'heap' && o.addr === a) || [...this.objById.values()].find(o => o.kind === 'heap' && o.addr === a);
        if (!obj) throw new RuntimeError('free: адрес не был получен от malloc (free(): invalid pointer)', e, 'Освобождать можно только память из malloc/calloc/realloc — и только адрес начала блока.', 'free');
        if (obj.freed) throw new RuntimeError(`free: блок ${obj.name} освобождён повторно (double free)`, e, 'Каждый блок освобождается ровно один раз. После free присвойте указателю NULL.', 'free');
        obj.freed = true;
        this.killObject(obj);
        this.emit({ type: 'free', objId: obj.id, line: e.line, size: obj.size });
        bi('free', ['0x' + a.toString(16)], null);
        return { t: T.void, v: 0 };
      }
      // ——— строки и память ———
      case 'strlen': { const n = this.cstr(args[0].v, e).length; bi('strlen', [JSON.stringify(decodeBytes(this.cstr(args[0].v, e)))], String(n)); return { t: T.ulong, v: BigInt(n) }; }
      case 'strcpy': case 'strncpy': {
        let bytes = this.cstr(args[1].v, e);
        if (name === 'strncpy') {
          const n = int(2);
          this.checkRange(args[0].v, n, args[0].prov, e, 'strncpy');
          const out = new Uint8Array(n);
          out.set(bytes.slice(0, n));
          this.mem.writeBytes(args[0].v, out);
          this.touch(args[0].v, e, 'strncpy');
        } else this.writeCString(args[0].v, bytes, e, args[0].prov, 'strcpy');
        return retPtr(args[0].v, args[0].prov);
      }
      case 'strcat': case 'strncat': {
        const dst = this.cstr(args[0].v, e);
        let add = this.cstr(args[1].v, e);
        if (name === 'strncat') add = add.slice(0, int(2));
        this.writeCString(args[0].v, [...dst, ...add], e, args[0].prov, name);
        return retPtr(args[0].v, args[0].prov);
      }
      case 'strcmp': case 'strncmp': {
        let a = this.cstr(args[0].v, e), b = this.cstr(args[1].v, e);
        if (name === 'strncmp') { a = a.slice(0, int(2)); b = b.slice(0, int(2)); }
        let r = 0;
        for (let i = 0; i <= Math.max(a.length, b.length); i++) { const x = a[i] ?? 0, y = b[i] ?? 0; if (x !== y) { r = x - y; break; } }
        bi(name, [JSON.stringify(decodeBytes(a)), JSON.stringify(decodeBytes(b))], String(r));
        return { t: T.int, v: r };
      }
      case 'strchr': case 'strrchr': {
        const s = this.cstr(args[0].v, e);
        const c = int(1) & 0xff;
        const i = c === 0 ? s.length : name === 'strchr' ? s.indexOf(c) : s.lastIndexOf(c);
        return retPtr(i < 0 ? 0 : args[0].v + i, args[0].prov);
      }
      case 'strstr': {
        const s = decodeLatin(this.cstr(args[0].v, e)), sub = decodeLatin(this.cstr(args[1].v, e));
        const i = s.indexOf(sub);
        return retPtr(i < 0 ? 0 : args[0].v + i, args[0].prov);
      }
      case 'strdup': {
        const bytes = this.cstr(args[0].v, e);
        const obj = this.newObject(`блок${++this.heapSeq}`, arr(T.char, bytes.length + 1), 'heap', 'heap', e);
        obj.size = bytes.length + 1; obj.viewType = T.char;
        this.mem.writeBytes(obj.addr, Uint8Array.from([...bytes, 0]));
        this.emit({ type: 'alloc', fn: 'strdup', obj: this.snapshot(obj), size: obj.size, line: e.line });
        return retPtr(obj.addr, obj.id);
      }
      case 'memset': {
        const n = int(2);
        this.checkRange(args[0].v, n, args[0].prov, e, 'memset');
        this.mem.fill(args[0].v, n, int(1));
        this.touch(args[0].v, e, 'memset');
        return { t: ptr(T.void), v: args[0].v, prov: args[0].prov };
      }
      case 'memcpy': case 'memmove': {
        const n = int(2);
        this.checkRange(args[0].v, n, args[0].prov, e, name);
        this.checkRange(args[1].v, n, args[1].prov, e, name);
        this.mem.copy(args[0].v, args[1].v, n);
        this.touch(args[0].v, e, name);
        return { t: ptr(T.void), v: args[0].v, prov: args[0].prov };
      }
      case 'memcmp': {
        const n = int(2);
        const a = this.mem.readBytes(args[0].v, n), b = this.mem.readBytes(args[1].v, n);
        let r = 0;
        for (let i = 0; i < n; i++) if (a[i] !== b[i]) { r = a[i] - b[i]; break; }
        return { t: T.int, v: r };
      }
      // ——— преобразования ———
      case 'atoi': case 'atol': {
        const s = decodeLatin(this.cstr(args[0].v, e));
        const m = /^\s*([+-]?\d+)/.exec(s);
        const v = m ? BigInt(m[1]) : 0n;
        bi(name, [JSON.stringify(s)], String(v));
        return name === 'atoi' ? { t: T.int, v: convert(v, T.int) } : { t: T.long, v: convert(v, T.long) };
      }
      case 'atof': case 'strtod': {
        const s = decodeLatin(this.cstr(args[0].v, e));
        const m = /^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(s);
        const v = m ? Number(m[1]) : 0;
        if (name === 'strtod' && args[1] && args[1].v) this.mem.write(args[1].v, ptr(T.char), args[0].v + (m ? m[0].length : 0));
        return { t: T.double, v };
      }
      case 'strtol': {
        const s = decodeLatin(this.cstr(args[0].v, e));
        let base = int(2);
        const m = /^(\s*)([+-]?)(0[xX])?([0-9a-zA-Z]*)/.exec(s);
        if (!base) base = m[3] ? 16 : m[4].startsWith('0') && m[4].length > 1 ? 8 : 10;
        let digits = '';
        for (const ch of m[4]) { const d = parseInt(ch, 36); if (Number.isNaN(d) || d >= base) break; digits += ch; }
        const v = digits ? BigInt(m[2] === '-' ? -1 : 1) * [...digits].reduce((acc, ch) => acc * BigInt(base) + BigInt(parseInt(ch, 36)), 0n) : 0n;
        if (args[1] && args[1].v) this.mem.write(args[1].v, ptr(T.char), args[0].v + (digits ? m[1].length + m[2].length + (m[3]?.length || 0) + digits.length : 0));
        return { t: T.long, v: convert(v, T.long) };
      }
      // ——— прочее stdlib ———
      case 'abs': { const r = convert(Math.abs(int(0)), T.int); bi('abs', [String(int(0))], String(r)); return { t: T.int, v: r }; }
      case 'labs': case 'llabs': { const v = convert(args[0].v, T.long); const r = v < 0n ? -v : v; return { t: T.long, v: r }; }
      case 'rand': { const v = this.rng.next(); bi('rand', [], String(v)); return { t: T.int, v }; }
      case 'srand': { this.rng.seed(Number(convert(args[0].v, T.uint))); bi('srand', [display(args[0].t, args[0].v)], null); return { t: T.void, v: 0 }; }
      case 'time': {
        const now = BigInt(Math.floor(Date.now() / 1000));
        if (args[0] && args[0].v) this.mem.write(args[0].v, T.long, now);
        return { t: T.long, v: now };
      }
      case 'clock': return { t: T.long, v: BigInt(this.steps * 3) };
      case 'exit': {
        this.emit({ type: 'note', text: `exit(${int(0)}) — программа завершается немедленно.`, line: e.line });
        throw new ExitSig(int(0));
      }
      case 'system': {
        const s = decodeBytes(this.cstr(args[0].v, e));
        this.emit({ type: 'note', text: `system("${s}") — команда операционной системы. В учебной среде она пропускается.`, line: e.line });
        return { t: T.int, v: 0 };
      }
      case 'setlocale': {
        const s = args[1].v ? decodeBytes(this.cstr(args[1].v, e)) : null;
        if (s !== null) this.decimalComma = s === '' || /ru|Rus/i.test(s);
        this.emit({ type: 'locale', comma: this.decimalComma, value: s, line: e.line });
        const o = this.stringLiteral(encodeUtf8(this.decimalComma ? 'ru_RU.UTF-8' : 'C'));
        return retPtr(o.addr, o.id);
      }
      case 'assert': {
        if (!isTruthy(args[0].v)) throw new RuntimeError(`assert: условие «${this.src_(e.args[0])}» ложно — программа остановлена`, e, 'assert проверяет то, что обязано быть истинным. Найдите, почему условие нарушилось.', 'assert');
        return { t: T.void, v: 0 };
      }
      case 'qsort': {
        const base = args[0].v, n = int(1), size = int(2);
        const cmp = this.addrFunc.get(args[3].v);
        if (!cmp) throw new RuntimeError('qsort: четвёртый аргумент должен быть функцией сравнения', e);
        this.checkRange(base, n * size, args[0].prov, e, 'qsort');
        const items = [];
        for (let i = 0; i < n; i++) items.push(this.mem.readBytes(base + i * size, size));
        const tmpA = this.newObject('(a)', arr(T.uchar, size), 'local', this.frame.id, null);
        const tmpB = this.newObject('(b)', arr(T.uchar, size), 'local', this.frame.id, null);
        this.frame.objs.push(tmpA, tmpB);
        const self = this;
        const compare = function* (x, y) {
          self.mem.writeBytes(tmpA.addr, x);
          self.mem.writeBytes(tmpB.addr, y);
          const pa = { t: ptr(T.void), v: tmpA.addr }, pb = { t: ptr(T.void), v: tmpB.addr };
          let r;
          if (cmp.user) r = yield* self.callUser(cmp.user, [pa, pb], e);
          else throw new RuntimeError('qsort: нужна своя функция сравнения', e);
          return Number(r.v);
        };
        // сортировка слиянием (устойчивая, как у glibc)
        const sort = function* (a) {
          if (a.length < 2) return a;
          const mid = a.length >> 1;
          const l = yield* sort(a.slice(0, mid)), r = yield* sort(a.slice(mid));
          const out = [];
          let i = 0, j = 0;
          while (i < l.length && j < r.length) { if ((yield* compare(l[i], r[j])) <= 0) out.push(l[i++]); else out.push(r[j++]); }
          return out.concat(l.slice(i), r.slice(j));
        };
        const sorted = yield* sort(items);
        sorted.forEach((b, i) => this.mem.writeBytes(base + i * size, b));
        this.touch(base, e, 'qsort');
        return { t: T.void, v: 0 };
      }
    }
    // ——— ctype ———
    const CT = {
      isdigit: (c) => (c >= 48 && c <= 57 ? 2048 : 0), isalpha: (c) => (/[A-Za-z]/.test(String.fromCharCode(c)) ? 1024 : 0),
      isalnum: (c) => (/[A-Za-z0-9]/.test(String.fromCharCode(c)) ? 8 : 0), isspace: (c) => ([32, 9, 10, 11, 12, 13].includes(c) ? 8192 : 0),
      isupper: (c) => (c >= 65 && c <= 90 ? 256 : 0), islower: (c) => (c >= 97 && c <= 122 ? 512 : 0),
      ispunct: (c) => (c > 32 && c < 127 && !/[A-Za-z0-9]/.test(String.fromCharCode(c)) ? 4 : 0),
      isxdigit: (c) => (/[0-9a-fA-F]/.test(String.fromCharCode(c)) ? 4096 : 0),
      toupper: (c) => (c >= 97 && c <= 122 ? c - 32 : c), tolower: (c) => (c >= 65 && c <= 90 ? c + 32 : c),
    };
    if (CT[name]) {
      const c = int(0);
      const r = CT[name](c < 0 ? c & 0xff : c);
      bi(name, [display(T.char, convert(c, T.char))], name.startsWith('to') ? display(T.char, convert(r, T.char)) : (r ? 'не 0 (да)' : '0 (нет)'));
      return { t: T.int, v: r };
    }
    // ——— math ———
    const MATH1 = {
      sqrt: Math.sqrt, cbrt: Math.cbrt, fabs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
      asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2,
      floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
      round: (x) => (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5)),
    };
    const MATH2 = { pow: Math.pow, atan2: Math.atan2, fmod: (a, b) => a % b, hypot: Math.hypot, fmin: Math.min, fmax: Math.max };
    if (MATH1[name] || MATH2[name]) {
      const xs = args.map((_, i) => num(i));
      const r = MATH1[name] ? MATH1[name](xs[0]) : MATH2[name](xs[0], xs[1]);
      if (Number.isNaN(r) && !xs.some(Number.isNaN))
        this.runtimeWarn(`${name}(${xs.join(', ')}) не определено в вещественных числах — результат nan`, e,
          name === 'sqrt' ? 'Корень из отрицательного числа не существует. Проверьте знак подкоренного выражения (например, дискриминанта) перед вызовом sqrt.' : name.startsWith('log') ? 'Логарифм определён только для положительных чисел.' : 'Проверьте область определения функции.');
      bi(name, xs.map(x => display(T.double, x)), display(T.double, r));
      return { t: T.double, v: r };
    }
    throw new RuntimeError(`функция «${name}» не найдена`, e);
  }

  headerOf(fn) { for (const h of this.pp.includes) if (HEADERS[h.name].funcs[fn]) return h.name; return null; }

  putBytes(h, bytes, text, e, fn, extra = {}) {
    if (h.std === 'stdout') { this.writeOut(text, e, fn, extra); return; }
    if (h.std === 'stderr') { this.stderr += text; this.emit({ type: 'output', fn, text, line: e.line, stream: 'stderr', sources: this.reads.slice(), ...extra }); return; }
    if (h.std === 'stdin') throw new RuntimeError(`${fn}: запись в stdin невозможна`, e);
    if (/^r/.test(h.mode) && !h.mode.includes('+')) throw new RuntimeError(`${fn}: файл «${h.name}» открыт только для чтения ("${h.mode}")`, e, 'Для записи откройте файл в режиме "w" или "a".', 'file');
    for (const b of bytes) { if (h.pos < h.data.length) h.data[h.pos] = b; else h.data.push(b); h.pos++; }
    this.flushFile(h);
    this.emit({ type: 'output', fn, text, line: e.line, stream: 'file', target: h.name, fileText: this.fileText(h), sources: this.reads.slice(), ...extra });
  }
}

function findLabel(body, name) {
  for (let i = 0; i < body.length; i++) {
    let s = body[i];
    while (s && s.type === 'Label') { if (s.name === name) return i; s = s.stmt; }
  }
  return -1;
}

function decodeLatin(bytes) { return String.fromCharCode(...bytes); }

function disp(v) {
  if (!v) return '?';
  if (v.bytes) return '{…}';
  return display(v.t, v.v);
}

function convNote(from, to) {
  if (!from || !to || from === to || from.k === to.k) return '';
  if (isFloat(from) && isInt(to)) return `${typeName(from)} → ${typeName(to)}: дробная часть отброшена`;
  if (isInt(from) && isFloat(to)) return `${typeName(from)} → ${typeName(to)}`;
  if (isInt(from) && isInt(to) && to.size < from.size) return `${typeName(from)} → ${typeName(to)}: лишние биты отброшены`;
  return '';
}
