// Синтаксический анализатор: лексемы -> абстрактное синтаксическое дерево (AST).
// Поддерживает полный синтаксис объявлений C: указатели, массивы, функции,
// указатели на функции, struct/union/enum, typedef.
import { CompileError, makeDiag } from './diagnostics.js';
import { T, ptr, arr, func, record, completeRecord, typeFromSpecifiers, isInt, isFloat } from './types.js';

const TYPE_KW = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool']);
const QUAL_KW = new Set(['const', 'volatile', 'restrict', 'inline']);
const STORAGE_KW = new Set(['static', 'extern', 'register', 'auto', 'typedef']);

const BIN_PREC = {
  '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8, '==': 9, '!=': 9,
  '<': 10, '>': 10, '<=': 10, '>=': 10, '<<': 11, '>>': 11,
  '+': 12, '-': 12, '*': 13, '/': 13, '%': 13,
};
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

const tokText = (t) => {
  if (!t) return '';
  if (t.type === 'eof') return 'конец файла';
  if (t.type === 'str') return 'строка';
  if (t.type === 'char') return 'символ';
  return t.value;
};

/** Вычисление константного выражения на этапе разбора (размеры массивов, case, enum). */
export function constEval(e) {
  if (!e) return null;
  switch (e.type) {
    case 'Num': {
      if (e.isFloat) return Number(e.raw);
      const r = e.raw;
      return /^0x/i.test(r) ? parseInt(r, 16) : /^0[0-7]+$/.test(r) ? parseInt(r, 8) : Number(r);
    }
    case 'Char': return e.value;
    case 'EnumConst': return e.value;
    case 'SizeofType': return e.ctype.size;
    case 'Cast': { const v = constEval(e.arg); return v == null ? null : isInt(e.ctype) ? Math.trunc(v) : v; }
    case 'Unary': {
      const v = constEval(e.arg);
      if (v == null) return null;
      return { '-': -v, '+': v, '!': v ? 0 : 1, '~': ~v }[e.op];
    }
    case 'Binary': case 'Logical': {
      const a = constEval(e.left), b = constEval(e.right);
      if (a == null || b == null) return null;
      switch (e.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b === 0 ? null : (Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b);
        case '%': return b === 0 ? null : a % b;
        case '<<': return a << b; case '>>': return a >> b;
        case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
        case '<': return +(a < b); case '>': return +(a > b); case '<=': return +(a <= b); case '>=': return +(a >= b);
        case '==': return +(a === b); case '!=': return +(a !== b);
        case '&&': return +(a && b); case '||': return +(a || b);
      }
      return null;
    }
    case 'Cond': { const c = constEval(e.cond); return c == null ? null : constEval(c ? e.a : e.b); }
    default: return null;
  }
}

export class Parser {
  constructor(tokens, opts = {}) {
    this.toks = tokens;
    this.i = 0;
    this.nodeId = 0;
    this.warnings = [];
    this.typedefs = new Map(Object.entries(opts.typedefs || {}));
    this.tags = new Map();
    this.enumConsts = new Map();
    this.lines = opts.lines || [];
  }

  // ——— утилиты ———
  peek(o = 0) { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  get prev() { return this.toks[this.i - 1] || this.toks[0]; }
  next() { return this.toks[this.i++]; }
  is(v, o = 0) { const t = this.peek(o); return (t.type === 'op' || t.type === 'kw') && t.value === v; }
  accept(v) { if (this.is(v)) { this.next(); return true; } return false; }

  afterPrev() {
    const p = this.prev;
    return { line: p.line, col: p.col + (p.end - p.start), len: 1 };
  }

  error(msg, tok = this.peek(), hint = '') {
    throw new CompileError(msg, { line: tok.line, col: tok.col, len: Math.max(1, (tok.end ?? 0) - (tok.start ?? 0)) }, hint);
  }

  expect(v, hint) {
    if (this.is(v)) return this.next();
    const t = this.peek();
    if (v === ';') {
      const pos = this.afterPrev();
      throw new CompileError(`ожидалась ';' перед «${tokText(t)}»`, pos,
        hint || `Каждый оператор в C заканчивается точкой с запятой. Похоже, её не хватает в конце строки ${pos.line}.`);
    }
    if (v === ')' || v === ']') {
      const pos = this.afterPrev();
      throw new CompileError(`ожидалась '${v}' перед «${tokText(t)}»`, pos,
        hint || `Проверьте, что каждой открывающей скобке соответствует закрывающая '${v}'.`);
    }
    if (v === '}' && t.type === 'eof')
      this.error("ожидалась '}' в конце файла", t, hint || 'Не хватает закрывающей фигурной скобки }. Посчитайте: сколько { открыто, столько же } должно быть закрыто.');
    this.error(`ожидалась '${v}', а встретилось «${tokText(t)}»`, t, hint);
  }

  node(type, startTok, props) {
    return {
      type, id: ++this.nodeId,
      line: startTok.line, col: startTok.col,
      start: startTok.start, end: this.prev.end,
      ...props,
    };
  }

  isTypeName(tok) { return tok.type === 'id' && this.typedefs.has(tok.value); }

  isTypeStart(o = 0) {
    const t = this.peek(o);
    if (t.type === 'kw') return TYPE_KW.has(t.value) || QUAL_KW.has(t.value) || STORAGE_KW.has(t.value) || t.value === 'struct' || t.value === 'enum' || t.value === 'union';
    return this.isTypeName(t);
  }

  // ——— спецификаторы типа ———
  parseSpecifiers() {
    const specs = [];
    const startTok = this.peek();
    let storage = null, isConst = false, named = null;
    for (;;) {
      const t = this.peek();
      if (t.type === 'kw' && TYPE_KW.has(t.value)) { if (named) this.error(`лишний спецификатор «${t.value}»`, t); specs.push(t.value); this.next(); continue; }
      if (t.type === 'kw' && QUAL_KW.has(t.value)) { if (t.value === 'const') isConst = true; this.next(); continue; }
      if (t.type === 'kw' && STORAGE_KW.has(t.value)) { storage = t.value; this.next(); continue; }
      if (t.type === 'kw' && (t.value === 'struct' || t.value === 'union')) { named = this.parseRecord(); continue; }
      if (t.type === 'kw' && t.value === 'enum') { named = this.parseEnum(); continue; }
      if (this.isTypeName(t) && specs.length === 0 && !named) {
        // имя typedef — только если дальше не идёт «:» (метка) и оно не используется как переменная
        named = this.typedefs.get(t.value); this.next(); continue;
      }
      break;
    }
    if (specs.length === 0 && !named) {
      if (storage || isConst) return { type: T.int, storage, isConst, startTok, implicit: true };
      return null;
    }
    if (named && specs.length) this.error(`несовместимые спецификаторы типа`, startTok);
    if (named) return { type: named, storage, isConst, startTok };
    const c = specs.filter(s => s === 'long').length;
    if (c > 2) this.error('слишком много «long»', startTok, 'Максимум — long long.');
    if (specs.includes('signed') && specs.includes('unsigned'))
      this.error('signed и unsigned одновременно', startTok, 'Выберите что-то одно: signed (со знаком) или unsigned (без знака).');
    const bases = specs.filter(s => ['void', 'char', 'int', 'float', 'double', '_Bool'].includes(s));
    if (bases.length > 1 && !(bases.length === 2 && bases.includes('int') && !bases.includes('char')))
      this.error(`несовместимые спецификаторы типа: ${specs.join(' ')}`, startTok, 'У переменной может быть только один базовый тип, например int или double.');
    return { type: typeFromSpecifiers(specs), storage, isConst, startTok, specs };
  }

  parseRecord() {
    const kw = this.next();
    const kind = kw.value;
    let tag = null;
    if (this.peek().type === 'id') tag = this.next().value;
    const key = kind + ' ' + (tag ?? '#' + (++this.nodeId));
    let t = this.tags.get(key);
    if (!t) { t = record(kind, tag); this.tags.set(key, t); }
    if (this.accept('{')) {
      if (t.complete) this.error(`повторное определение ${kind} ${tag}`, kw);
      const fields = [];
      while (!this.accept('}')) {
        if (this.peek().type === 'eof') this.expect('}');
        const spec = this.parseSpecifiers();
        if (!spec) this.error(`ожидался тип поля, а встретилось «${tokText(this.peek())}»`, this.peek(), `Поля ${kind} описываются как переменные: int x; double y;`);
        if (this.accept(';')) {
          // анонимная вложенная структура/объединение
          if (spec.type.k === 'struct' || spec.type.k === 'union') for (const f of spec.type.fields || []) fields.push({ ...f });
          continue;
        }
        for (;;) {
          const d = this.parseDeclarator(spec.type);
          if (this.is(':')) this.error('битовые поля пока не поддерживаются', this.peek());
          if (d.type.k === 'arr' && d.type.len == null) this.error(`у поля-массива «${d.name}» должен быть указан размер`, d.nameTok);
          if ((d.type.k === 'struct' || d.type.k === 'union') && !d.type.complete) this.error(`поле «${d.name}» имеет неполный тип ${typeNameShort(d.type)}`, d.nameTok, 'Внутри структуры можно хранить указатель на саму себя: struct Node *next;');
          if (fields.some(f => f.name === d.name)) this.error(`повторяющееся поле «${d.name}»`, d.nameTok);
          fields.push({ name: d.name, type: d.type, line: d.nameTok.line });
          if (!this.accept(',')) break;
        }
        this.expect(';', `После описания поля ставится точка с запятой: ${kind} ${tag || ''} { int x; int y; };`);
      }
      if (!fields.length) this.error(`${kind} без полей`, kw);
      completeRecord(t, fields);
      t.line = kw.line;
    } else if (!tag) this.error(`ожидалось имя или тело ${kind}`, this.peek());
    return t;
  }

  parseEnum() {
    const kw = this.next();
    let tag = null;
    if (this.peek().type === 'id') tag = this.next().value;
    const t = Object.freeze({ ...T.int, typedefName: tag ? `enum ${tag}` : 'enum' });
    if (this.accept('{')) {
      let val = 0;
      while (!this.accept('}')) {
        const nt = this.peek();
        if (nt.type !== 'id') this.error(`ожидалось имя константы перечисления`, nt);
        this.next();
        if (this.accept('=')) {
          const e = this.parseTernary();
          const v = constEval(e);
          if (v == null) this.error('значение константы enum должно быть целой константой', nt);
          val = v;
        }
        this.enumConsts.set(nt.value, { value: val, type: t, line: nt.line });
        val++;
        if (!this.accept(',')) { this.expect('}'); break; }
      }
    }
    return t;
  }

  // ——— деклараторы ———
  /** Сырой разбор декларатора: указатели, имя (или вложенный декларатор), суффиксы [] и (). */
  parseDeclRaw(abstract) {
    let ptrs = 0;
    while (this.accept('*')) { ptrs++; while (this.peek().type === 'kw' && QUAL_KW.has(this.peek().value)) this.next(); }
    let inner = null, nameTok = null;
    if (this.is('(') && (this.is('*', 1) || this.is('(', 1) || this.is('[', 1) || (!abstract && this.peek(1).type === 'id' && !this.isTypeName(this.peek(1))))) {
      this.next();
      inner = this.parseDeclRaw(abstract);
      this.expect(')');
    } else if (this.peek().type === 'id' && !(abstract && this.isTypeName(this.peek()))) {
      nameTok = this.next();
    } else if (!abstract) {
      const t = this.peek();
      if (t.type === 'kw')
        this.error(`«${t.value}» — зарезервированное слово, его нельзя использовать как имя`, t,
          'Ключевые слова языка (int, for, if, while, …) нельзя использовать в качестве имён переменных. Выберите другое имя.');
      if (t.type === 'num') this.error('имя не может начинаться с цифры', t, 'Идентификатор начинается с буквы или _, например x1, а не 1x.');
      this.error(`ожидалось имя переменной, а встретилось «${tokText(t)}»`, t);
    }
    const suffixes = [];
    for (;;) {
      if (this.is('[')) {
        const lb = this.next();
        if (this.accept(']')) { suffixes.push({ kind: 'arr', len: null, tok: lb }); continue; }
        while (this.peek().type === 'kw' && (QUAL_KW.has(this.peek().value) || this.peek().value === 'static')) this.next();
        const e = this.parseAssign();
        this.expect(']');
        const v = constEval(e);
        if (v != null && !(v > 0)) this.error(`размер массива должен быть положительным (а не ${v})`, lb);
        suffixes.push({ kind: 'arr', len: v != null ? Math.trunc(v) : null, expr: v != null ? null : e, tok: lb });
        continue;
      }
      if (this.is('(')) {
        const lp = this.next();
        suffixes.push({ kind: 'func', ...this.parseParams(), tok: lp });
        continue;
      }
      break;
    }
    return { ptrs, inner, nameTok, suffixes };
  }

  buildDecl(d, base) {
    let t = base;
    for (let k = 0; k < d.ptrs; k++) t = ptr(t);
    for (let k = d.suffixes.length - 1; k >= 0; k--) {
      const s = d.suffixes[k];
      if (s.kind === 'arr') {
        if (t.k === 'func') this.error('массив функций недопустим', s.tok);
        t = arr(t, s.len, s.expr);
      } else {
        if (t.k === 'arr') this.error('функция не может возвращать массив', s.tok, 'Верните указатель или используйте структуру.');
        if (t.k === 'func') this.error('функция не может возвращать функцию', s.tok);
        t = func(t, s.params, s.variadic, s.unspecified);
      }
    }
    if (d.inner) return this.buildDecl(d.inner, t);
    return { type: t, nameTok: d.nameTok, name: d.nameTok?.value ?? null, params: d.suffixes[0]?.kind === 'func' && !d.inner ? d.suffixes[0].params : null, funcSuffix: d.suffixes[0]?.kind === 'func' ? d.suffixes[0] : null };
  }

  parseDeclarator(base, abstract = false) {
    return this.buildDecl(this.parseDeclRaw(abstract), base);
  }

  parseParams() {
    const params = [];
    let variadic = false, unspecified = false;
    if (this.is(')')) { this.next(); return { params, variadic, unspecified: true }; }
    if (this.is('void') && this.is(')', 1)) { this.next(); this.next(); return { params, variadic, unspecified }; }
    for (;;) {
      if (this.accept('...')) { variadic = true; break; }
      const ps = this.parseSpecifiers();
      if (!ps) this.error(`ожидался тип параметра, а встретилось «${tokText(this.peek())}»`, this.peek(),
        'Каждый параметр функции записывается с типом: int f(int a, double b).');
      const pd = this.parseDeclarator(ps.type, true);
      let pt = pd.type;
      if (pt.k === 'arr') pt = ptr(pt.of); // массив-параметр = указатель
      if (pt.k === 'func') pt = ptr(pt);
      const at = pd.nameTok || ps.startTok;
      params.push({ name: pd.name, type: pt, line: at.line, col: at.col, isConst: ps.isConst && pt.k !== 'ptr' });
      if (!this.accept(',')) break;
    }
    this.expect(')');
    return { params, variadic, unspecified };
  }

  /** Имя типа для приведения и sizeof: спецификаторы + абстрактный декларатор. */
  parseTypeName() {
    const spec = this.parseSpecifiers();
    if (!spec) this.error('ожидался тип', this.peek());
    return this.parseDeclarator(spec.type, true).type;
  }

  // ——— верхний уровень ———
  parseProgram() {
    const funcs = [];
    const globals = [];
    const items = [];
    while (this.peek().type !== 'eof') {
      if (this.accept(';')) continue;
      const startTok = this.peek();
      let spec = this.parseSpecifiers();
      if (!spec) {
        if (startTok.type === 'id' && this.is('(', 1)) {
          this.warnings.push(makeDiag('warning', `у функции «${startTok.value}» не указан тип возвращаемого значения — считается int`,
            { line: startTok.line, col: startTok.col, len: startTok.value.length },
            'По современному стандарту нужно писать тип явно: int main(void)'));
          spec = { type: T.int, startTok };
        } else if (startTok.type === 'op' && startTok.value === '}') {
          this.error("лишняя закрывающая скобка '}'", startTok, 'Похоже, одна из функций закрыта раньше времени или скобок } больше, чем {.');
        } else if (startTok.type === 'id') {
          this.error(`неизвестный тип «${startTok.value}»`, startTok,
            startTok.value === 'bool' ? 'Тип bool появляется после #include <stdbool.h>.'
              : startTok.value === 'size_t' ? 'size_t объявлен в <stdio.h>, <stdlib.h> и <string.h>.'
                : 'Операторы можно писать только внутри функции (например, внутри main). Вне функций допускаются только объявления.');
        } else {
          this.error(`ожидалось объявление, а встретилось «${tokText(startTok)}»`, startTok,
            'Операторы можно писать только внутри функции, например внутри int main(void) { ... }.');
        }
      }
      if (this.accept(';')) continue; // struct S { ... }; или enum { ... };
      const d = this.parseDeclarator(spec.type);
      if (d.type.k === 'func' && this.is('{')) {
        const f = this.parseFunction(spec, d, startTok);
        funcs.push(f); items.push(f);
        continue;
      }
      const decl = this.parseDeclRest(spec, d, startTok, true);
      for (const x of decl.protos || []) { funcs.push(x); items.push(x); }
      if (decl.decls.length) { globals.push(decl); items.push(decl); }
    }
    return { funcs, globals, items };
  }

  parseFunction(spec, d, startTok) {
    const params = (d.params || []).map((p, i) => ({ ...p }));
    for (const p of params) if (!p.name && !d.type.unspecified) this.error('у параметра в определении функции должно быть имя', { line: p.line, col: p.col, start: 0, end: 1 });
    const body = this.parseCompound();
    return this.node('FuncDef', startTok, {
      name: d.name, nameLine: d.nameTok.line, ret: d.type.ret, ftype: d.type, params,
      unspecified: d.type.unspecified, variadic: d.type.variadic, body, isStatic: spec.storage === 'static',
    });
  }

  parseDeclRest(spec, first, startTok, global = false) {
    const decls = [];
    const protos = [];
    let d = first;
    for (;;) {
      let type = d.type;
      if (spec.storage === 'typedef') {
        let named = type;
        if (type.k === 'struct' || type.k === 'union') { if (!type.typedefName) type.typedefName = d.name; }
        else named = Object.freeze({ ...type, typedefName: d.name });
        this.typedefs.set(d.name, named);
        if (!this.accept(',')) break;
        d = this.parseDeclarator(spec.type);
        continue;
      }
      if (type.k === 'func') {
        protos.push({ type: 'FuncDecl', id: ++this.nodeId, line: d.nameTok.line, col: d.nameTok.col, name: d.name, ret: type.ret, ftype: type, params: d.params || [], unspecified: type.unspecified, variadic: type.variadic, proto: true });
        if (!this.accept(',')) break;
        d = this.parseDeclarator(spec.type);
        continue;
      }
      if (type.k === 'void')
        this.error(`переменная «${d.name}» не может иметь тип void`, d.nameTok, 'void означает «нет значения». Для чисел используйте int или double.');
      let init = null;
      if (this.accept('=')) {
        if (this.is('{')) init = this.parseInitList();
        else init = this.parseAssign();
      }
      // int a[] = {...} / char s[] = "..." — размер из инициализатора
      if (type.k === 'arr' && type.len == null && !type.lenExpr) {
        if (init?.type === 'InitList') type = arr(type.of, countInit(init, type));
        else if (init?.type === 'Str' && isInt(type.of) && type.of.size === 1) type = arr(type.of, init.bytes.length + 1);
        else if (spec.storage !== 'extern') this.error(`не указан размер массива «${d.name}»`, d.nameTok, `Укажите размер: ${spec.type.k} ${d.name}[10]; — или задайте начальные значения: {1, 2, 3}.`);
      }
      if ((type.k === 'struct' || type.k === 'union') && !type.complete && spec.storage !== 'extern')
        this.error(`«${d.name}» имеет неполный тип ${typeNameShort(type)}`, d.nameTok, 'Структура должна быть описана (с полями) до объявления переменной этого типа.');
      if (global && type.k === 'arr' && type.lenExpr)
        this.error(`размер глобального массива «${d.name}» должен быть константой`, d.nameTok, 'Используйте число или #define: #define N 100');
      decls.push({
        name: d.name, type, init,
        line: d.nameTok.line, col: d.nameTok.col, isConst: spec.isConst && type.k !== 'ptr',
        isStatic: spec.storage === 'static', isExtern: spec.storage === 'extern',
      });
      if (!this.accept(',')) break;
      d = this.parseDeclarator(spec.type);
    }
    if (!this.is(';')) {
      const t = this.peek();
      if (t.line > this.prev.line) this.expect(';');
      if (t.type === 'id') {
        const pos = this.afterPrev();
        throw new CompileError(`ожидалась ',' или ';' перед «${t.value}»`, pos,
          'Переменные в одном объявлении разделяются запятыми: int a, b; — а объявление заканчивается точкой с запятой.');
      }
    }
    this.expect(';');
    const node = this.node('Decl', startTok, { decls, global, typedef: spec.storage === 'typedef' });
    node.protos = protos;
    return node;
  }

  parseInitList() {
    const st = this.expect('{');
    const items = [];
    if (!this.is('}')) {
      for (;;) {
        const desig = [];
        for (;;) {
          if (this.is('.') && this.peek(1).type === 'id') { this.next(); desig.push({ field: this.next().value }); continue; }
          if (this.is('[')) { this.next(); const e = this.parseTernary(); this.expect(']'); desig.push({ index: constEval(e), expr: e }); continue; }
          break;
        }
        if (desig.length) this.expect('=', 'Назначенный инициализатор: .поле = значение или [индекс] = значение');
        const value = this.is('{') ? this.parseInitList() : this.parseAssign();
        items.push(desig.length ? { ...value, desig } : value);
        if (!this.accept(',')) break;
        if (this.is('}')) break;
      }
    }
    this.expect('}');
    return this.node('InitList', st, { items });
  }

  // ——— операторы ———
  indentOf(line) {
    const l = this.lines[line - 1] || '';
    return l.length - l.trimStart().length;
  }

  parseCompound() {
    const st = this.expect('{');
    const body = [];
    while (!this.is('}')) {
      if (this.peek().type === 'eof') {
        const sus = (this.suspects || [])[0];
        throw new CompileError("ожидалась '}' в конце файла", { line: this.peek().line, col: this.peek().col, len: 1 },
          sus ? `Скорее всего, не закрыт блок, открытый в строке ${sus.open}: скобка } в строке ${sus.close} по отступу относится к внешнему блоку. Добавьте } перед строкой ${sus.close}.`
            : `Блок, открытый в строке ${st.line} символом {, не закрыт. Добавьте } в нужном месте.`);
      }
      body.push(this.parseStatement(true));
    }
    const close = this.next();
    if (this.lines.length && close.col - 1 < this.indentOf(st.line) && close.line !== st.line) {
      (this.suspects ||= []).push({ open: st.line, close: close.line });
    }
    return this.node('Block', st, { body, endLine: this.prev.line });
  }

  parseLocalDecl(t) {
    const spec = this.parseSpecifiers();
    if (this.accept(';')) return this.node('Empty', t, {});
    const d = this.parseDeclarator(spec.type);
    if (d.type.k === 'func' && this.is('{')) this.error('определять функции внутри других функций нельзя', this.peek(), 'Опишите функцию отдельно, до или после main.');
    return this.parseDeclRest(spec, d, t);
  }

  parseStatement(inBlock = false) {
    const t = this.peek();
    if (t.type === 'id' && this.is(':', 1)) {
      this.next(); this.next();
      const stmt = this.is('}') ? this.node('Empty', t, {}) : this.parseStatement(inBlock);
      return this.node('Label', t, { name: t.value, stmt });
    }
    if (this.isTypeStart() && !(t.type === 'id' && (this.is('=', 1) || this.is('(', 1) || this.is('[', 1) || this.is('.', 1) || this.is('->', 1)))) {
      if (!inBlock) {
        this.warnings.push(makeDiag('warning', 'объявление переменной в качестве единственного оператора ветки/цикла', t,
          'Лучше заключите тело в фигурные скобки { }.'));
      }
      return this.parseLocalDecl(t);
    }
    if (t.type === 'op' && t.value === '{') return this.parseCompound();
    if (t.type === 'op' && t.value === ';') { this.next(); return this.node('Empty', t, {}); }
    if (t.type === 'kw') {
      switch (t.value) {
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'do': return this.parseDo();
        case 'for': return this.parseFor();
        case 'switch': return this.parseSwitch();
        case 'case': {
          this.next();
          const test = this.parseTernary();
          if (this.accept('...')) this.error('диапазоны case a ... b не входят в стандарт C', this.prev);
          this.expect(':', 'После значения case ставится двоеточие: case 1:');
          return this.node('Case', t, { test, value: constEval(test) });
        }
        case 'default':
          this.next();
          this.expect(':', 'Правильно: default:');
          return this.node('Default', t, {});
        case 'break': this.next(); this.expect(';'); return this.node('Break', t, {});
        case 'continue': this.next(); this.expect(';'); return this.node('Continue', t, {});
        case 'goto': {
          this.next();
          const lt = this.peek();
          if (lt.type !== 'id') this.error('после goto ожидается имя метки', lt);
          this.next();
          this.expect(';');
          return this.node('Goto', t, { label: lt.value });
        }
        case 'return': {
          this.next();
          let arg = null;
          if (!this.is(';')) arg = this.parseExpr();
          this.expect(';');
          return this.node('Return', t, { arg });
        }
        case 'else':
          this.error('«else» без соответствующего «if»', t,
            'Перед else должен стоять if. Частая причина: лишняя точка с запятой после if (...); или тело if из нескольких строк без фигурных скобок { }.');
      }
    }
    if (t.type === 'id' && this.peek(1).type === 'id' && !this.typedefs.has(t.value)) {
      const known = ['integer', 'real', 'string', 'Int', 'Double', 'Float', 'Char', 'bool', 'boolean', 'size_t', 'FILE', 'uint8_t', 'int32_t', 'int64_t'];
      if (known.includes(t.value) || /^[a-z]+$/i.test(t.value))
        this.error(`неизвестный тип «${t.value}»`, t,
          t.value === 'bool' ? 'Тип bool появляется после #include <stdbool.h>.'
            : t.value === 'string' ? 'В C нет типа string. Строка — это массив символов: char s[100];'
              : t.value === 'size_t' || t.value === 'FILE' ? `${t.value} объявлен в <stdio.h>.`
                : /int\d+_t/.test(t.value) ? 'Типы фиксированного размера объявлены в <stdint.h>.'
                  : 'Базовые типы C: char, int, float, double (с модификаторами short, long, unsigned). Регистр важен: int, а не Int.');
    }
    const expr = this.parseExpr();
    this.expect(';');
    return this.node('ExprStmt', t, { expr });
  }

  parseParenCond(kw) {
    if (!this.is('(')) this.error(`после «${kw}» ожидалась '('`, this.peek(), `Условие записывается в круглых скобках: ${kw} (x > 0) ...`);
    this.next();
    if (this.is(')')) this.error(`пустое условие в «${kw}»`, this.peek(), 'Внутри скобок должно быть выражение-условие, например (a > b).');
    const cond = this.parseExpr();
    this.expect(')', `Условие ${kw} должно закрываться скобкой ')'.`);
    return cond;
  }

  checkEmptyBody(kw) {
    if (this.is(';')) {
      const s = this.peek();
      if (s.line === this.prev.line)
        this.warnings.push(makeDiag('warning', `пустое тело «${kw}» — точка с запятой сразу после условия`,
          { line: s.line, col: s.col, len: 1 },
          kw === 'if'
            ? 'Точка с запятой завершает if: следующая строка выполнится ВСЕГДА. Уберите \';\' после if (...).'
            : 'Точка с запятой становится телом цикла, а блок ниже выполнится только один раз (или цикл станет бесконечным). Уберите \';\'.',
          'empty-body'));
    }
  }

  parseIf() {
    const t = this.next();
    const cond = this.parseParenCond('if');
    this.checkEmptyBody('if');
    const cons = this.parseStatement();
    let alt = null, elseLine = null;
    if (this.is('else')) { elseLine = this.peek().line; this.next(); alt = this.parseStatement(); }
    return this.node('If', t, { cond, cons, alt, elseLine });
  }

  parseWhile() {
    const t = this.next();
    const cond = this.parseParenCond('while');
    this.checkEmptyBody('while');
    const body = this.parseStatement();
    return this.node('While', t, { cond, body });
  }

  parseDo() {
    const t = this.next();
    const body = this.parseStatement();
    if (!this.is('while')) this.error('ожидалось «while» после тела do', this.peek(), 'Цикл с постусловием: do { ... } while (условие);');
    const wt = this.next();
    const cond = this.parseParenCond('while');
    this.expect(';', 'После do { ... } while (условие) обязательно ставится точка с запятой.');
    return this.node('DoWhile', t, { body, cond, whileLine: wt.line });
  }

  parseFor() {
    const t = this.next();
    this.expect('(', 'Заголовок цикла: for (начало; условие; шаг)');
    let init = null;
    if (this.isTypeStart()) {
      const st = this.peek();
      try {
        init = this.parseLocalDecl(st);
      } catch (e) {
        if (e.diag && /ожидал/.test(e.diag.message))
          e.diag.hint = 'В заголовке for три части разделяются ТОЧКОЙ С ЗАПЯТОЙ: for (int i = 0; i < n; i++). Запятые там не подходят.';
        throw e;
      }
    } else {
      if (!this.is(';')) init = this.node('ExprStmt', this.peek(), { expr: this.parseExpr() });
      this.expect(';', 'В заголовке for три части разделяются ТОЧКОЙ С ЗАПЯТОЙ: for (i = 0; i < n; i++).');
    }
    let cond = null;
    if (!this.is(';')) cond = this.parseExpr();
    this.expect(';', 'В заголовке for три части разделяются точкой с запятой: for (i = 0; i < n; i++).');
    let update = null;
    if (!this.is(')')) update = this.parseExpr();
    this.expect(')');
    this.checkEmptyBody('for');
    const body = this.parseStatement();
    return this.node('For', t, { init, cond, update, body });
  }

  parseSwitch() {
    const t = this.next();
    const disc = this.parseParenCond('switch');
    if (!this.is('{')) this.error("ожидалась '{' после switch (...)", this.peek(), 'Тело switch записывается в фигурных скобках с метками case.');
    const body = this.parseCompound();
    return this.node('Switch', t, { disc, body });
  }

  // ——— выражения ———
  parseExpr() {
    const st = this.peek();
    let e = this.parseAssign();
    if (this.is(',')) {
      const list = [e];
      while (this.accept(',')) list.push(this.parseAssign());
      e = this.node('Comma', st, { list });
    }
    return e;
  }

  parseAssign() {
    const st = this.peek();
    const left = this.parseTernary();
    const t = this.peek();
    if (t.type === 'op' && ASSIGN_OPS.has(t.value)) {
      this.next();
      const right = this.parseAssign();
      if (!['Ident', 'Index', 'Deref', 'Member'].includes(left.type)) {
        throw new CompileError('слева от знака присваивания должна стоять переменная', { line: left.line, col: left.col, len: Math.max(1, left.end - left.start) },
          t.value === '=' ? 'Присваивание работает справа налево: переменная = выражение. Например: c = a + b; (а не a + b = c). Если нужно сравнение, используйте ==.' : 'Составное присваивание применимо только к переменной: x += 3;');
      }
      return this.node('Assign', st, { op: t.value, target: left, value: right, opLine: t.line, opCol: t.col });
    }
    return left;
  }

  parseTernary() {
    const st = this.peek();
    const cond = this.parseBinary(4);
    if (this.is('?')) {
      this.next();
      const a = this.parseExpr();
      this.expect(':', 'Тернарная операция: условие ? значение_если_да : значение_если_нет');
      const b = this.parseTernary();
      return this.node('Cond', st, { cond, a, b });
    }
    return cond;
  }

  parseBinary(minPrec) {
    const st = this.peek();
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const p = t.type === 'op' ? BIN_PREC[t.value] : undefined;
      if (p === undefined || p < minPrec) break;
      this.next();
      const right = this.parseBinary(p + 1);
      const type = t.value === '&&' || t.value === '||' ? 'Logical' : 'Binary';
      left = this.node(type, st, { op: t.value, left, right, opLine: t.line, opCol: t.col });
    }
    return left;
  }

  isCastStart() { return this.is('(') && this.isTypeStart(1) && !(this.peek(1).type === 'id' && this.is('(', 2) === false && this.is(')', 2) === false && !this.is('*', 2) && !this.is('[', 2)); }

  parseUnary() {
    const t = this.peek();
    if (t.type === 'op') {
      if (t.value === '++' || t.value === '--') {
        this.next();
        const arg = this.parseUnary();
        return this.node('Update', t, { op: t.value, prefix: true, arg });
      }
      if (['+', '-', '!', '~'].includes(t.value)) {
        this.next();
        const arg = this.parseCastOrUnary();
        return this.node('Unary', t, { op: t.value, arg });
      }
      if (t.value === '&') { this.next(); const arg = this.parseCastOrUnary(); return this.node('AddrOf', t, { arg }); }
      if (t.value === '*') { this.next(); const arg = this.parseCastOrUnary(); return this.node('Deref', t, { arg }); }
      if (t.value === '(' && this.isTypeStart(1)) return this.parseCastOrUnary();
    }
    if (t.type === 'kw' && t.value === 'sizeof') {
      this.next();
      if (this.is('(') && this.isTypeStart(1)) {
        this.next();
        const ty = this.parseTypeName();
        this.expect(')');
        return this.node('SizeofType', t, { ctype: ty });
      }
      const arg = this.parseUnary();
      return this.node('SizeofExpr', t, { arg });
    }
    return this.parsePostfix();
  }

  parseCastOrUnary() {
    const t = this.peek();
    if (this.is('(') && this.isTypeStart(1)) {
      this.next();
      const ty = this.parseTypeName();
      this.expect(')', 'Приведение типа записывается так: (double) x');
      if (this.is('{')) {
        const init = this.parseInitList();
        let ct = ty;
        if (ct.k === 'arr' && ct.len == null) ct = arr(ct.of, countInit(init, ct));
        return this.parsePostfixTail(this.node('CompoundLit', t, { ctype: ct, init }), t);
      }
      const arg = this.parseCastOrUnary();
      return this.node('Cast', t, { ctype: ty, arg });
    }
    return this.parseUnary();
  }

  parsePostfix() {
    const st = this.peek();
    return this.parsePostfixTail(this.parsePrimary(), st);
  }

  parsePostfixTail(e, st) {
    for (;;) {
      if (this.is('(')) {
        this.next();
        const args = [];
        if (!this.is(')')) {
          for (;;) {
            args.push(this.parseAssign());
            if (!this.accept(',')) break;
          }
        }
        this.expect(')', `Список аргументов функции должен закрываться скобкой ')'.`);
        e = this.node('Call', st, { callee: e.type === 'Ident' ? e.name : null, calleeNode: e, args });
        continue;
      }
      if (this.is('[')) {
        this.next();
        const index = this.parseExpr();
        this.expect(']');
        e = this.node('Index', st, { obj: e, index });
        continue;
      }
      if (this.is('.') || this.is('->')) {
        const op = this.next().value;
        const ft = this.peek();
        if (ft.type !== 'id') this.error(`после «${op}» ожидалось имя поля`, ft);
        this.next();
        e = this.node('Member', st, { obj: e, field: ft.value, arrow: op === '->', fieldTok: ft });
        continue;
      }
      if (this.is('++') || this.is('--')) {
        const op = this.next().value;
        e = this.node('Update', st, { op, prefix: false, arg: e });
        continue;
      }
      break;
    }
    return e;
  }

  parsePrimary() {
    const t = this.peek();
    if (t.type === 'num') {
      this.next();
      return this.node('Num', t, { raw: t.value, suffix: t.suffix, isFloat: t.isFloat });
    }
    if (t.type === 'char') { this.next(); return this.node('Char', t, { value: t.value }); }
    if (t.type === 'str') {
      this.next();
      const bytes = [...t.value];
      while (this.peek().type === 'str') bytes.push(...this.next().value); // склейка "a" "b"
      return this.node('Str', t, { bytes });
    }
    if (t.type === 'id') {
      this.next();
      if (this.enumConsts.has(t.value)) return this.node('EnumConst', t, { name: t.value, value: this.enumConsts.get(t.value).value });
      return this.node('Ident', t, { name: t.value });
    }
    if (t.type === 'op' && t.value === '(') {
      this.next();
      if (this.is(')')) this.error('пустые скобки в выражении', this.peek());
      const e = this.parseExpr();
      this.expect(')');
      e.paren = true;
      return e;
    }
    if (t.type === 'eof') this.error('неожиданный конец файла — выражение не закончено', t, 'Похоже, код оборван. Проверьте скобки и точки с запятой.');
    if (t.type === 'kw') {
      if (TYPE_KW.has(t.value))
        this.error(`неожиданное «${t.value}» в выражении`, t, 'Объявление переменной должно быть отдельным оператором: int x; — а не внутри выражения.');
      this.error(`«${t.value}» не может стоять внутри выражения`, t);
    }
    if (t.type === 'op' && t.value === '=')
      this.error("неожиданный знак '='", t, 'Для сравнения используйте ==, для присваивания слева должна быть переменная.');
    if (t.type === 'op' && [')', ']', '}', ';'].includes(t.value))
      this.error(`ожидалось выражение перед «${t.value}»`, t, 'Здесь не хватает значения: переменной, числа или выражения.');
    this.error(`неожиданный символ «${t.value}»`, t);
  }
}

function typeNameShort(t) { return `${t.k} ${t.tag || ''}`.trim(); }

/** Число элементов верхнего уровня, которое задаёт список инициализации для массива неизвестной длины. */
function countInit(init, t) {
  const elem = t.of;
  const per = elem.k === 'arr' || elem.k === 'struct' || elem.k === 'union' ? scalarCount(elem) : 1;
  let n = 0, pos = 0;
  for (const it of init.items) {
    if (it.desig?.[0]?.index != null) pos = it.desig[0].index;
    if (it.type === 'InitList' || per === 1) { pos += 1; }
    else pos += 1 / per; // скобки опущены: элементы идут подряд
    n = Math.max(n, pos);
  }
  return Math.ceil(n - 1e-9);
}
function scalarCount(t) {
  if (t.k === 'arr') return (t.len ?? 0) * scalarCount(t.of);
  if (t.k === 'struct') return t.fields.reduce((s, f) => s + scalarCount(f.type), 0);
  if (t.k === 'union') return 1;
  return 1;
}

export function parse(tokens, opts) {
  const p = new Parser(tokens, opts);
  const prog = p.parseProgram();
  return { ...prog, warnings: p.warnings, nodeCount: p.nodeId, typedefs: p.typedefs, tags: p.tags, enumConsts: p.enumConsts };
}
