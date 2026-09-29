// Синтаксический анализатор: лексемы -> абстрактное синтаксическое дерево (AST).
import { CompileError, makeDiag } from './diagnostics.js';
import { T, ptr, arr, typeFromSpecifiers } from './types.js';

const TYPE_KW = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool']);
const QUAL_KW = new Set(['const', 'volatile', 'static', 'register', 'auto', 'extern', 'inline', 'restrict']);

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

export class Parser {
  constructor(tokens, opts = {}) {
    this.toks = tokens;
    this.i = 0;
    this.nodeId = 0;
    this.warnings = [];
    this.typeNames = opts.typeNames || new Set();
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

  isTypeStart(o = 0) {
    const t = this.peek(o);
    if (t.type === 'kw') return TYPE_KW.has(t.value) || QUAL_KW.has(t.value) || t.value === 'struct' || t.value === 'enum' || t.value === 'typedef';
    return t.type === 'id' && this.typeNames.has(t.value);
  }

  // ——— типы ———
  parseSpecifiers() {
    const specs = [];
    const quals = [];
    const startTok = this.peek();
    for (;;) {
      const t = this.peek();
      if (t.type === 'kw' && TYPE_KW.has(t.value)) { specs.push(t.value); this.next(); continue; }
      if (t.type === 'kw' && QUAL_KW.has(t.value)) { quals.push(t.value); this.next(); continue; }
      if (t.type === 'id' && this.typeNames.has(t.value) && specs.length === 0) { specs.push(t.value); this.next(); continue; }
      if (t.type === 'kw' && (t.value === 'struct' || t.value === 'enum' || t.value === 'union' || t.value === 'typedef'))
        this.error(`«${t.value}» пока не поддерживается в этой вселенной`, t, 'Структуры, перечисления и typedef появятся в следующих темах курса.');
      break;
    }
    if (specs.length === 0) return null;
    if (specs.includes('bool')) return { type: T.bool, quals, startTok };
    const c = specs.filter(s => s === 'long').length;
    if (c > 2) this.error('слишком много «long»', startTok, 'Максимум — long long.');
    if (specs.includes('signed') && specs.includes('unsigned'))
      this.error('signed и unsigned одновременно', startTok, 'Выберите что-то одно: signed (со знаком) или unsigned (без знака).');
    const bases = specs.filter(s => ['void', 'char', 'int', 'float', 'double', '_Bool'].includes(s));
    if (bases.length > 1 && !(bases.length === 2 && bases.includes('int') && !bases.includes('char')))
      this.error(`несовместимые спецификаторы типа: ${specs.join(' ')}`, startTok, 'У переменной может быть только один базовый тип, например int или double.');
    return { type: typeFromSpecifiers(specs), quals, startTok, specs };
  }

  parseDeclarator(base) {
    let t = base;
    while (this.accept('*')) { t = ptr(t); while (this.peek().type === 'kw' && QUAL_KW.has(this.peek().value)) this.next(); }
    const nameTok = this.peek();
    if (nameTok.type !== 'id') {
      if (nameTok.type === 'kw')
        this.error(`«${nameTok.value}» — зарезервированное слово, его нельзя использовать как имя`, nameTok,
          'Ключевые слова языка (int, for, if, while, …) нельзя использовать в качестве имён переменных. Выберите другое имя.');
      if (nameTok.type === 'num')
        this.error(`имя не может начинаться с цифры`, nameTok, 'Идентификатор начинается с буквы или _, например x1, а не 1x.');
      this.error(`ожидалось имя переменной, а встретилось «${tokText(nameTok)}»`, nameTok);
    }
    this.next();
    const dims = [];
    while (this.is('[')) {
      const lb = this.next();
      if (this.is(']')) { this.next(); dims.push(null); continue; }
      const size = this.parseAssign();
      this.expect(']');
      dims.push({ expr: size, tok: lb });
    }
    return { name: nameTok.value, nameTok, type: t, dims };
  }

  // ——— верхний уровень ———
  parseProgram() {
    const funcs = [];
    const globals = [];
    while (this.peek().type !== 'eof') {
      const startTok = this.peek();
      let spec = this.parseSpecifiers();
      if (!spec) {
        if (startTok.type === 'id' && this.is('(', 1)) {
          // старый стиль: main() без типа — неявный int
          this.warnings.push(makeDiag('warning', `у функции «${startTok.value}» не указан тип возвращаемого значения — считается int`,
            { line: startTok.line, col: startTok.col, len: startTok.value.length },
            'По современному стандарту нужно писать тип явно: int main(void)'));
          spec = { type: T.int, quals: [], startTok };
        } else if (startTok.type === 'op' && startTok.value === '}') {
          this.error("лишняя закрывающая скобка '}'", startTok, 'Похоже, одна из функций закрыта раньше времени или скобок } больше, чем {.');
        } else if (startTok.type === 'id') {
          this.error(`неизвестный тип «${startTok.value}»`, startTok,
            startTok.value === 'bool' ? 'Тип bool появляется после #include <stdbool.h>.' : 'Операторы можно писать только внутри функции (например, внутри main). Вне функций допускаются только объявления.');
        } else {
          this.error(`ожидалось объявление, а встретилось «${tokText(startTok)}»`, startTok,
            'Операторы можно писать только внутри функции, например внутри int main(void) { ... }.');
        }
      }
      const d = this.parseDeclarator(spec.type);
      if (this.is('(')) {
        funcs.push(this.parseFunction(spec, d, startTok));
      } else {
        globals.push(this.parseDeclRest(spec, d, startTok, true));
      }
    }
    return { funcs, globals };
  }

  parseFunction(spec, d, startTok) {
    this.expect('(');
    const params = [];
    let unspecified = false;
    if (this.is(')')) unspecified = true;
    else if (this.is('void') && this.is(')', 1)) this.next();
    else {
      for (;;) {
        const ps = this.parseSpecifiers();
        if (!ps) this.error(`ожидался тип параметра, а встретилось «${tokText(this.peek())}»`, this.peek(),
          'Каждый параметр функции записывается с типом: int f(int a, double b).');
        let pd;
        if (this.peek().type === 'id' || this.is('*')) pd = this.parseDeclarator(ps.type);
        else pd = { name: null, type: ps.type, dims: [] };
        let pt = pd.type;
        if (pd.dims.length) pt = ptr(pd.type); // массив-параметр = указатель
        params.push({ name: pd.name, type: pt, line: (pd.nameTok || ps.startTok).line, col: (pd.nameTok || ps.startTok).col });
        if (!this.accept(',')) break;
      }
    }
    this.expect(')');
    if (this.accept(';')) {
      return this.node('FuncDecl', startTok, { name: d.name, ret: d.type, params, unspecified, proto: true });
    }
    if (!this.is('{')) {
      this.error(`ожидалась '{' перед «${tokText(this.peek())}»`, this.peek(),
        'Тело функции начинается с открывающей фигурной скобки {. Если это объявление (прототип), поставьте ; в конце.');
    }
    const body = this.parseCompound();
    return this.node('FuncDef', startTok, { name: d.name, nameLine: d.nameTok.line, ret: d.type, params, unspecified, body });
  }

  parseDeclRest(spec, first, startTok, global = false) {
    const decls = [];
    let d = first;
    for (;;) {
      let type = d.type;
      if (type === T.void && d.dims.length === 0)
        this.error(`переменная «${d.name}» не может иметь тип void`, d.nameTok, 'void означает «нет значения». Для чисел используйте int или double.');
      let init = null;
      if (this.accept('=')) {
        if (this.is('{')) init = this.parseInitList();
        else init = this.parseAssign();
      }
      decls.push({
        name: d.name, type, dims: d.dims, init,
        line: d.nameTok.line, col: d.nameTok.col, isConst: spec.quals.includes('const'),
        isStatic: spec.quals.includes('static'),
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
          `Переменные в одном объявлении разделяются запятыми: int a, b; — а объявление заканчивается точкой с запятой.`);
      }
    }
    this.expect(';');
    return this.node('Decl', startTok, { decls, global });
  }

  parseInitList() {
    const st = this.expect('{');
    const items = [];
    if (!this.is('}')) {
      for (;;) {
        items.push(this.is('{') ? this.parseInitList() : this.parseAssign());
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

  parseStatement(inBlock = false) {
    const t = this.peek();
    if (this.isTypeStart()) {
      if (!inBlock) {
        // объявление там, где ожидался оператор (например, после if без {})
        this.warnings.push(makeDiag('warning', 'объявление переменной в качестве единственного оператора ветки/цикла', t,
          'Лучше заключите тело в фигурные скобки { }.'));
      }
      const spec = this.parseSpecifiers();
      const d = this.parseDeclarator(spec.type);
      if (this.is('(')) this.error('объявлять функции внутри других функций нельзя', this.peek(), 'Опишите функцию отдельно, до или после main.');
      return this.parseDeclRest(spec, d, t);
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
          const test = this.parseCond();
          this.expect(':', 'После значения case ставится двоеточие: case 1:');
          return this.node('Case', t, { test });
        }
        case 'default':
          this.next();
          this.expect(':', 'Правильно: default:');
          return this.node('Default', t, {});
        case 'break': this.next(); this.expect(';'); return this.node('Break', t, {});
        case 'continue': this.next(); this.expect(';'); return this.node('Continue', t, {});
        case 'return': {
          this.next();
          let arg = null;
          if (!this.is(';')) arg = this.parseExpr();
          this.expect(';');
          return this.node('Return', t, { arg });
        }
        case 'else':
          this.error("«else» без соответствующего «if»", t,
            'Перед else должен стоять if. Частая причина: лишняя точка с запятой после if (...); или тело if из нескольких строк без фигурных скобок { }.');
        case 'goto':
          this.error('goto не поддерживается', t, 'Используйте циклы и break/continue — это хороший стиль.');
      }
    }
    if (t.type === 'id' && this.peek(1).type === 'id' && !this.typeNames.has(t.value)) {
      const known = ['integer', 'real', 'string', 'Int', 'Double', 'Float', 'Char', 'bool', 'boolean'];
      if (known.includes(t.value) || /^[a-z]+$/i.test(t.value))
        this.error(`неизвестный тип «${t.value}»`, t,
          t.value === 'bool' ? 'Тип bool появляется после #include <stdbool.h>.'
            : t.value === 'string' ? 'В C нет типа string. Строка — это массив символов: char s[100];'
              : 'Базовые типы C: char, int, float, double (с модификаторами short, long, unsigned). Регистр важен: int, а не Int.');
    }
    const expr = this.parseExpr();
    this.expect(';');
    return this.node('ExprStmt', t, { expr });
  }

  parseCond(kw) {
    return this.parseTernary();
  }

  parseParenCond(kw) {
    const kwTok = this.prev;
    if (!this.is('(')) {
      this.error(`после «${kw}» ожидалась '('`, this.peek(),
        `Условие записывается в круглых скобках: ${kw} (x > 0) ...`);
    }
    this.next();
    if (this.is(')')) this.error(`пустое условие в «${kw}»`, this.peek(), 'Внутри скобок должно быть выражение-условие, например (a > b).');
    const cond = this.parseExpr();
    this.expect(')', `Условие ${kw} должно закрываться скобкой ')'.`);
    return cond;
  }

  checkEmptyBody(kw, headTok) {
    if (this.is(';')) {
      const s = this.peek();
      if (s.line === this.prev.line)
        this.warnings.push(makeDiag('warning', `пустое тело «${kw}» — точка с запятой сразу после условия`,
          { line: s.line, col: s.col, len: 1 },
          kw === 'if'
            ? `Точка с запятой завершает if: следующая строка выполнится ВСЕГДА. Уберите ';' после if (...).`
            : `Точка с запятой становится телом цикла, а блок ниже выполнится только один раз (или цикл станет бесконечным). Уберите ';'.`,
          'empty-body'));
    }
  }

  parseIf() {
    const t = this.next();
    const cond = this.parseParenCond('if');
    this.checkEmptyBody('if', t);
    const cons = this.parseStatement();
    let alt = null, elseLine = null;
    if (this.is('else')) { elseLine = this.peek().line; this.next(); alt = this.parseStatement(); }
    return this.node('If', t, { cond, cons, alt, elseLine });
  }

  parseWhile() {
    const t = this.next();
    const cond = this.parseParenCond('while');
    this.checkEmptyBody('while', t);
    const body = this.parseStatement();
    return this.node('While', t, { cond, body });
  }

  parseDo() {
    const t = this.next();
    const body = this.parseStatement();
    if (!this.is('while')) this.error("ожидалось «while» после тела do", this.peek(), 'Цикл с постусловием: do { ... } while (условие);');
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
        const spec = this.parseSpecifiers();
        const d = this.parseDeclarator(spec.type);
        init = this.parseDeclRest(spec, d, st);
      } catch (e) {
        if (e.diag && /ожидал/.test(e.diag.message))
          e.diag.hint = 'В заголовке for три части разделяются ТОЧКОЙ С ЗАПЯТОЙ: for (int i = 0; i < n; i++). Запятые там не подходят.';
        throw e;
      }
    } else {
      if (!this.is(';')) init = this.node('ExprStmt', this.peek(), { expr: this.parseExpr() });
      const forHint = 'В заголовке for три части разделяются ТОЧКОЙ С ЗАПЯТОЙ: for (i = 0; i < n; i++).';
      this.expect(';', forHint);
    }
    let cond = null;
    if (!this.is(';')) cond = this.parseExpr();
    this.expect(';', 'В заголовке for три части разделяются точкой с запятой: for (i = 0; i < n; i++).');
    let update = null;
    if (!this.is(')')) update = this.parseExpr();
    this.expect(')');
    this.checkEmptyBody('for', t);
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
      if (!['Ident', 'Index', 'Deref'].includes(left.type)) {
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
        const spec = this.parseSpecifiers();
        let ty = spec.type;
        while (this.accept('*')) ty = ptr(ty);
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
      const spec = this.parseSpecifiers();
      let ty = spec.type;
      while (this.accept('*')) ty = ptr(ty);
      this.expect(')', 'Приведение типа записывается так: (double) x');
      const arg = this.parseCastOrUnary();
      return this.node('Cast', t, { ctype: ty, arg });
    }
    return this.parseUnary();
  }

  parsePostfix() {
    const st = this.peek();
    let e = this.parsePrimary();
    for (;;) {
      if (this.is('(')) {
        if (e.type !== 'Ident') this.error('вызывать можно только функцию по имени', this.peek());
        this.next();
        const args = [];
        if (!this.is(')')) {
          for (;;) {
            args.push(this.parseAssign());
            if (!this.accept(',')) break;
          }
        }
        this.expect(')', `Список аргументов функции ${e.name} должен закрываться скобкой ')'.`);
        e = this.node('Call', st, { callee: e.name, args, calleeNode: e });
        continue;
      }
      if (this.is('[')) {
        this.next();
        const index = this.parseExpr();
        this.expect(']');
        e = this.node('Index', st, { obj: e, index });
        continue;
      }
      if (this.is('++') || this.is('--')) {
        const op = this.next().value;
        e = this.node('Update', st, { op, prefix: false, arg: e });
        continue;
      }
      if (this.is('.') || this.is('->'))
        this.error('операции . и -> (структуры) пока не поддерживаются', this.peek(), 'Структуры будут в следующих темах.');
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
    if (t.type === 'id') { this.next(); return this.node('Ident', t, { name: t.value }); }
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
    if (t.type === 'op' && t.value === '=' )
      this.error("неожиданный знак '='", t, 'Для сравнения используйте ==, для присваивания слева должна быть переменная.');
    if (t.type === 'op' && [')', ']', '}', ';'].includes(t.value))
      this.error(`ожидалось выражение перед «${t.value}»`, t, 'Здесь не хватает значения: переменной, числа или выражения.');
    this.error(`неожиданный символ «${t.value}»`, t);
  }
}

export function parse(tokens, opts) {
  const p = new Parser(tokens, opts);
  const prog = p.parseProgram();
  return { ...prog, warnings: p.warnings, nodeCount: p.nodeId };
}
