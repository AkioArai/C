// Семантический анализ: проверка имён, типов, форматов printf/scanf и типичных ошибок новичков.
import { makeDiag, suggest } from './diagnostics.js';
import { HEADERS, FUNC_HEADER, CONST_HEADER } from './stdlib.js';
import { T, ptr, arr, isInt, isFloat, isArith, isPtr, commonType, promote, typeName } from './types.js';
import { parseFormat, printfExpect } from './format.js';
import { KEYWORDS } from './lexer.js';

export function numLiteralType(n) {
  const suf = n.suffix || '';
  if (n.isFloat && !n.raw.startsWith('0x')) {
    if (suf.includes('f')) return T.float;
    if (suf.includes('l')) return T.ldouble;
    return T.double;
  }
  const raw = n.raw;
  let big;
  if (/^0x/i.test(raw)) big = BigInt(raw);
  else if (/^0[0-7]+$/.test(raw)) big = BigInt('0o' + raw.slice(1));
  else big = BigInt(raw);
  const u = suf.includes('u');
  const l = (suf.match(/l/g) || []).length;
  const isDec = !/^0/.test(raw) || raw === '0';
  const cands = [];
  if (l === 0) cands.push(...(u ? [T.uint, T.ulong] : isDec ? [T.int, T.long] : [T.int, T.uint, T.long, T.ulong]));
  else if (l === 1) cands.push(...(u ? [T.ulong] : isDec ? [T.long] : [T.long, T.ulong]));
  else cands.push(...(u ? [T.ullong] : [T.llong, T.ullong]));
  for (const t of cands) {
    const bits = BigInt(t.size * 8);
    const max = t.signed ? 2n ** (bits - 1n) - 1n : 2n ** bits - 1n;
    if (big <= max) return t;
  }
  return T.ullong;
}

export function numLiteralValue(n) {
  const t = numLiteralType(n);
  if (isFloat(t)) {
    const v = Number(n.raw);
    return { t, v: t === T.float ? Math.fround(v) : v };
  }
  const raw = n.raw;
  let big = /^0x/i.test(raw) ? BigInt(raw) : /^0[0-7]+$/.test(raw) ? BigInt('0o' + raw.slice(1)) : BigInt(raw);
  return { t, v: t.size === 8 ? big : Number(big) };
}

class Scope {
  constructor(parent, kind = 'block') { this.parent = parent; this.vars = new Map(); this.kind = kind; }
  lookup(name) { for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name); return null; }
  allNames() { const r = []; for (let s = this; s; s = s.parent) r.push(...s.vars.keys()); return r; }
}

export function analyze(prog, pp, src) {
  const diags = [];
  const included = new Set(pp.includes.map(i => i.name));
  const add = (sev, msg, node, hint = '', code = '') => {
    const len = node && node.end != null && node.start != null ? Math.max(1, Math.min(node.end - node.start, 60)) : 1;
    const d = makeDiag(sev, msg, { line: node?.line, col: node?.col, len }, hint, code);
    if (!diags.some(x => x.line === d.line && x.col === d.col && x.message === d.message)) diags.push(d);
  };

  const funcs = new Map();
  for (const f of prog.funcs) {
    const prev = funcs.get(f.name);
    if (prev && prev.type === 'FuncDef' && f.type === 'FuncDef')
      add('error', `повторное определение функции «${f.name}»`, f, `Функция ${f.name} уже определена в строке ${prev.line}. У каждой функции должно быть одно тело.`);
    if (!prev || f.type === 'FuncDef') funcs.set(f.name, f);
    if (FUNC_HEADER[f.name] && f.type === 'FuncDef')
      add('warning', `функция «${f.name}» совпадает по имени со стандартной функцией из <${FUNC_HEADER[f.name]}>`, f, 'Лучше дать своей функции другое имя.');
  }
  const main = funcs.get('main');
  if (!main || main.type !== 'FuncDef')
    add('error', 'в программе нет функции main', { line: 1, col: 1, start: 0, end: 1 },
      'Выполнение любой программы на C начинается с функции main. Добавьте:\nint main(void) {\n    ...\n    return 0;\n}');

  const hasType = (name) => {
    const h = CONST_HEADER[name];
    return h && included.has(h);
  };

  const global = new Scope(null, 'global');
  const allVars = [];

  function declare(scope, d, node, kind = 'var') {
    if (scope.vars.has(d.name)) {
      const p = scope.vars.get(d.name);
      add('error', `повторное объявление «${d.name}»`, { line: d.line, col: d.col, start: 0, end: d.name.length },
        `Переменная ${d.name} уже объявлена в строке ${p.line} в этой же области видимости. Уберите тип перед именем, если хотели просто присвоить значение.`);
      return p;
    }
    if (funcs.has(d.name) && kind !== 'param')
      add('warning', `переменная «${d.name}» скрывает функцию с таким же именем`, { line: d.line, col: d.col, start: 0, end: d.name.length });
    const outer = scope.parent && scope.parent.lookup(d.name);
    if (outer && outer.kind !== 'global-fn' && kind === 'var' && scope.kind !== 'func')
      add('note', `переменная «${d.name}» перекрывает внешнюю переменную из строки ${outer.line}`, { line: d.line, col: d.col, start: 0, end: d.name.length },
        'Внутри этого блока имя будет обозначать новую переменную, а внешняя станет невидимой.');
    const sym = {
      name: d.name, type: d.type, line: d.line, col: d.col, kind,
      used: false, assigned: kind === 'param' || !!d.init || !!d.global || !!d.isStatic, isConst: d.isConst,
    };
    scope.vars.set(d.name, sym);
    allVars.push(sym);
    return sym;
  }

  // ——— вывод типа выражения ———
  function typeOf(e, scope) {
    if (!e) return T.int;
    switch (e.type) {
      case 'Num': return numLiteralType(e);
      case 'Char': return T.int;
      case 'Str': return ptr(T.char);
      case 'Ident': {
        const s = scope.lookup(e.name);
        if (s) return s.type;
        if (CONST_HEADER[e.name]) return HEADERS[CONST_HEADER[e.name]].consts[e.name].type;
        return T.int;
      }
      case 'Binary': {
        const a = typeOf(e.left, scope), b = typeOf(e.right, scope);
        if (['<', '>', '<=', '>=', '==', '!='].includes(e.op)) return T.int;
        if (e.op === '<<' || e.op === '>>') return promote(a);
        if (isPtr(a) && isInt(b)) return a.k === 'arr' ? ptr(a.of) : a;
        if (isPtr(b) && isInt(a)) return b.k === 'arr' ? ptr(b.of) : b;
        if (isPtr(a) && isPtr(b)) return T.long;
        if (isArith(a) && isArith(b)) return commonType(a, b);
        return T.int;
      }
      case 'Logical': return T.int;
      case 'Assign': return typeOf(e.target, scope);
      case 'Update': return typeOf(e.arg, scope);
      case 'Unary': {
        if (e.op === '!') return T.int;
        const t = typeOf(e.arg, scope);
        return isArith(t) ? promote(t) : t;
      }
      case 'Cast': return e.ctype;
      case 'SizeofType': case 'SizeofExpr': return T.ulong;
      case 'AddrOf': { const t = typeOf(e.arg, scope); return ptr(t); }
      case 'Deref': { const t = typeOf(e.arg, scope); return t.k === 'ptr' ? t.to : t.k === 'arr' ? t.of : T.int; }
      case 'Index': { const t = typeOf(e.obj, scope); return t.k === 'ptr' ? t.to : t.k === 'arr' ? t.of : T.int; }
      case 'Cond': {
        const a = typeOf(e.a, scope), b = typeOf(e.b, scope);
        return isArith(a) && isArith(b) ? commonType(a, b) : a;
      }
      case 'Comma': return typeOf(e.list[e.list.length - 1], scope);
      case 'Call': {
        const f = funcs.get(e.callee);
        if (f) return f.ret;
        const h = FUNC_HEADER[e.callee];
        if (h) return HEADERS[h].funcs[e.callee].ret;
        return T.int;
      }
      default: return T.int;
    }
  }

  function isConstExpr(e) {
    return e && (e.type === 'Num' || e.type === 'Char' || (e.type === 'Unary' && isConstExpr(e.arg)));
  }

  function markAssigned(target, scope) {
    let t = target;
    while (t && (t.type === 'Index')) t = t.obj;
    if (t && t.type === 'Ident') {
      const s = scope.lookup(t.name);
      if (s) {
        s.assigned = true;
        if (s.isConst) add('error', `присваивание константе «${s.name}»`, target, `Переменная ${s.name} объявлена как const — её значение нельзя изменить после инициализации.`);
      }
    }
  }

  // ——— проверка форматов ———
  function checkFormatCall(e, scope, isScanf) {
    const name = e.callee;
    if (e.args.length === 0) { add('error', `слишком мало аргументов в вызове ${name}`, e, `${name} требует хотя бы строку формата: ${name}("...")`); return; }
    const fmtNode = e.args[0];
    if (fmtNode.type !== 'Str') {
      if (!isPtr(typeOf(fmtNode, scope)))
        add('error', `первый аргумент ${name} должен быть строкой формата в кавычках`, fmtNode,
          isScanf ? 'Правильно: scanf("%d", &x);' : `Правильно: printf("%d\\n", x); — сначала строка формата, затем значения.`);
      return; // формат вычисляется (например, cond ? "YES\n" : "NO\n") — проверить нельзя
    }
    const fmt = String.fromCharCode(...fmtNode.bytes);
    const parts = parseFormat(fmt);
    const specs = [];
    for (const p of parts) {
      if (p.bad) add('warning', `неизвестный спецификатор «${p.text}» в строке формата`, fmtNode,
        'Основные спецификаторы: %d (int), %ld (long), %f (float/double в printf), %lf (double в scanf), %c (символ), %s (строка), %% (знак процента).');
      if (!p.spec || p.conv === '%') continue;
      if (!isScanf && p.width === '*') specs.push({ star: true, p });
      if (!isScanf && p.prec === '*') specs.push({ star: true, p });
      if (isScanf && (p.width === '*')) continue; // %*d — без присваивания
      specs.push({ p });
    }
    const args = e.args.slice(1);
    if (specs.length > args.length)
      add('warning', `спецификаторов в строке формата (${specs.length}) больше, чем аргументов (${args.length})`, e,
        isScanf ? 'Для каждого % нужна своя переменная с &: scanf("%d %d", &a, &b);'
          : 'Для каждого % в строке нужно передать значение после запятой. Недостающие значения будут «мусором» из памяти.');
    else if (specs.length < args.length)
      add('warning', `аргументов (${args.length}) больше, чем спецификаторов в строке формата (${specs.length})`, args[specs.length],
        'Лишние аргументы будут проигнорированы. Возможно, вы забыли %d или %f в строке.');

    const n = Math.min(specs.length, args.length);
    for (let i = 0; i < n; i++) {
      const { p, star } = specs[i];
      const a = args[i];
      const at = typeOf(a, scope);
      if (star) { if (!isInt(at)) add('warning', '«*» в формате ожидает аргумент int', a); continue; }
      if (isScanf) {
        const isAddr = at.k === 'ptr' || at.k === 'arr';
        if (!isAddr) {
          const nm = a.type === 'Ident' ? a.name : 'x';
          add('warning', `scanf ожидает АДРЕС переменной, а передано значение «${src.slice(a.start, a.end)}»`, a,
            `Добавьте & перед именем: scanf("${p.text}", &${nm}); Без & программа запишет данные по случайному адресу и, скорее всего, аварийно завершится.`, 'scanf-noaddr');
          continue;
        }
        if (a.type === 'AddrOf' && a.arg.type === 'Ident') { markAssigned(a.arg, scope); }
        else if (a.type === 'AddrOf') markAssigned(a.arg, scope);
        else if (a.type === 'Ident') markAssigned(a, scope);
        const target = at.k === 'ptr' ? at.to : at.of;
        const c = p.conv;
        let want = null, fix = null;
        if ('diuoxX'.includes(c)) {
          want = p.len === 'l' ? [T.long, T.ulong] : p.len === 'll' ? [T.llong, T.ullong] : p.len === 'h' ? [T.short, T.ushort] : p.len === 'hh' ? [T.char, T.schar, T.uchar] : [T.int, T.uint];
          fix = target.k === 'long' || target.k === 'unsigned long' ? '%ld' : target.k === 'long long' ? '%lld' : target.k === 'short' ? '%hd' : target === T.double ? '%lf' : target === T.float ? '%f' : target.size === 1 ? '%c' : '%d';
        } else if ('fFeEgG'.includes(c)) {
          want = p.len === 'l' ? [T.double] : p.len === 'L' ? [T.ldouble] : [T.float];
          fix = target === T.double ? '%lf' : target === T.float ? '%f' : isInt(target) ? '%d' : null;
        } else if (c === 'c' || c === 's') {
          want = [T.char, T.schar, T.uchar];
          fix = isInt(target) && target.size > 1 ? '%d' : null;
        }
        if (want && !want.some(w => w.k === target.k)) {
          const extra = target === T.double && c === 'f' && !p.len
            ? ' Для переменной double в scanf нужен %lf (буква l — «long float»). С %f в неё попадёт мусор!' : '';
          add('warning', `формат «${p.text}» ожидает ${typeName(want[0])} *, а передан ${typeName(at)}`, a,
            (fix ? `Используйте ${fix} для типа ${typeName(target)}.` : '') + extra, 'scanf-type');
        }
      } else {
        const exp = printfExpect(p);
        if (!exp) continue;
        const tn = typeName(at);
        if (exp.cat === 'int') {
          if (isFloat(at))
            add('warning', `формат «${p.text}» ожидает целое число, а передано вещественное (${tn})`, a,
              `Для вещественных чисел используйте %f (или %.2f для двух знаков после точки). Либо приведите к целому: (int)${src.slice(a.start, a.end)}. Сейчас на экран попадёт мусор!`, 'printf-type');
          else if (isInt(at)) {
            const big = at.size === 8;
            const wantBig = exp.len === 'l' || exp.len === 'll' || exp.len === 'z';
            if (big && !wantBig && p.conv !== 'c')
              add('warning', `формат «${p.text}» ожидает int, а аргумент имеет тип ${tn}`, a,
                `Для типа ${tn} используйте %l${p.conv}. Иначе большие значения выведутся неверно (обрежутся до 32 бит).`, 'printf-type');
            else if (!big && wantBig)
              add('warning', `формат «${p.text}» ожидает ${exp.len === 'll' ? 'long long' : 'long'}, а аргумент имеет тип ${tn}`, a, `Для int используйте %${p.conv}.`, 'printf-type');
          } else if (isPtr(at) && p.conv !== 'c')
            add('warning', `формат «${p.text}» ожидает число, а передан адрес/строка (${tn})`, a,
              at.k === 'arr' || (at.to && at.to.size === 1) ? 'Для вывода строки используйте %s.' : 'Возможно, лишний & — в printf он не нужен: printf("%d", x);', 'printf-type');
        } else if (exp.cat === 'float') {
          if (isInt(at))
            add('warning', `формат «${p.text}» ожидает double, а передано целое (${tn})`, a,
              `Для целых используйте %d${at.size === 8 ? ' (или %ld для long)' : ''}. Или приведите к double: (double)${src.slice(a.start, a.end)}. Сейчас на экран попадёт мусор!`, 'printf-type');
          else if (isPtr(at))
            add('warning', `формат «${p.text}» ожидает число, а передан адрес (${tn})`, a, 'В printf знак & перед переменной не нужен.', 'printf-type');
        } else if (exp.cat === 'str') {
          if (!isPtr(at))
            add('warning', `формат «%s» ожидает строку (char *), а передан ${tn}`, a,
              isInt(at) && a.type === 'Char' ? "Для одного символа используйте %c. Символ в одинарных кавычках 'a' — не строка." : 'Для чисел используйте %d или %f.', 'printf-type');
        }
      }
    }
    if (isScanf) {
      for (const p of parts) if (p.lit && /[^\s]/.test(p.lit) && /\\n|\n/.test(p.lit) === false && p.lit.trim().length)
        add('note', `в формате scanf есть текст «${p.lit.trim()}»`, fmtNode, 'scanf будет ожидать, что пользователь введёт этот текст буквально. Обычно в scanf пишут только спецификаторы: scanf("%d", &x); А подсказку для пользователя выводят через printf.');
      if (/\n/.test(fmt)) add('warning', 'символ \\n в строке формата scanf', fmtNode,
        'В scanf "\\n" означает «пропустить все пробелы и переводы строк» — программа будет ждать лишнего ввода. Уберите \\n из scanf (он нужен в printf).');
    }
  }

  // ——— обход ———
  function walkExpr(e, scope, ctx = {}) {
    if (!e) return;
    switch (e.type) {
      case 'Num': case 'Char': case 'Str': case 'SizeofType': return;
      case 'Ident': {
        const s = scope.lookup(e.name);
        if (s) {
          s.used = true;
          if (!s.assigned && !ctx.lvalue && s.kind === 'var' && s.type.k !== 'arr' && !s.warnedUninit) {
            s.warnedUninit = true;
            add('warning', `переменная «${e.name}» используется без инициализации`, e,
              `В момент объявления в переменной лежит случайный «мусор» из памяти. Задайте начальное значение: ${typeName(s.type)} ${e.name} = 0; или считайте его через scanf до использования.`, 'uninit');
          }
          return;
        }
        if (CONST_HEADER[e.name]) {
          if (!hasType(e.name))
            add('error', `«${e.name}» не объявлен`, e, `Константа ${e.name} определена в библиотеке <${CONST_HEADER[e.name]}>. Добавьте в начало программы: #include <${CONST_HEADER[e.name]}>`);
          return;
        }
        if (funcs.has(e.name) || FUNC_HEADER[e.name]) {
          add('warning', `функция «${e.name}» использована без вызова`, e, `Чтобы вызвать функцию, нужны скобки: ${e.name}(...)`);
          return;
        }
        const cand = suggest(e.name, [...scope.allNames(), ...Object.keys(CONST_HEADER)]);
        const kwCand = suggest(e.name, [...KEYWORDS]);
        let hint = `Каждую переменную нужно объявить до использования, например: int ${e.name};`;
        if (cand) hint = `Возможно, вы имели в виду «${cand}»? (регистр букв важен: a и A — разные имена).`;
        else if (kwCand) hint = `Возможно, это опечатка в ключевом слове «${kwCand}».`;
        if (e.name === 'pi' || e.name === 'PI') hint = 'Число π: объявите константу #define PI 3.14159265358979 или подключите <math.h> и используйте M_PI.';
        if (e.name === 'true' || e.name === 'false') hint = 'true/false появляются после #include <stdbool.h>. В чистом C истина — 1, ложь — 0.';
        if (e.name === 'endl' || e.name === 'cout' || e.name === 'cin') hint = 'Это C++. В C используйте printf("...\\n") и scanf.';
        add('error', `«${e.name}» не объявлена (первое использование в этой функции)`, e, hint, 'undeclared');
        const fake = { name: e.name, type: T.int, line: e.line, kind: 'var', used: true, assigned: true };
        scope.vars.set(e.name, fake);
        return;
      }
      case 'Binary': {
        walkExpr(e.left, scope); walkExpr(e.right, scope);
        const a = typeOf(e.left, scope), b = typeOf(e.right, scope);
        if (e.op === '%' && (isFloat(a) || isFloat(b)))
          add('error', 'операция % неприменима к вещественным числам', e, 'Остаток от деления % работает только с целыми. Для double используйте fmod(x, y) из <math.h>.');
        if ((e.op === '/' || e.op === '%') && isConstExpr(e.right) && e.right.type === 'Num' && Number(e.right.raw) === 0)
          add('warning', 'деление на ноль', e.right, 'Деление на 0 не определено: программа аварийно завершится (для целых) или получит inf (для double).');
        if (['<', '>', '<=', '>='].includes(e.op) && e.left.type === 'Binary' && ['<', '>', '<=', '>='].includes(e.left.op) && !e.left.paren)
          add('warning', `сравнение вида «a ${e.left.op} b ${e.op} c» работает не так, как в математике`, e,
            `В C сначала вычисляется (a ${e.left.op} b) → 0 или 1, и уже это число сравнивается с c. Правильно: a ${e.left.op} b && b ${e.op} c`);
        if ((e.op === '&' || e.op === '|') && (e.left.type === 'Binary' && ['<', '>', '<=', '>=', '==', '!='].includes(e.left.op)))
          add('note', `«${e.op}» — побитовая операция`, e, `Для логического «${e.op === '&' ? 'И' : 'ИЛИ'}» используйте ${e.op}${e.op}.`);
        if (e.op === '^' && e.left.type !== 'Binary')
          if (isInt(a) && e.right.type === 'Num') add('note', '«^» — это побитовое исключающее ИЛИ, а не степень', e, 'Для возведения в степень используйте pow(x, y) из <math.h> или умножение x*x.');
        return;
      }
      case 'Logical': walkExpr(e.left, scope); walkExpr(e.right, scope); return;
      case 'Assign': {
        if (e.op !== '=') walkExpr(e.target, scope);
        else walkExpr(e.target, scope, { lvalue: true });
        walkExpr(e.value, scope);
        markAssigned(e.target, scope);
        const tt = typeOf(e.target, scope);
        checkIntDiv(e.value, tt, scope);
        checkNarrow(e.value, tt, scope, e);
        return;
      }
      case 'Update': walkExpr(e.arg, scope); markAssigned(e.arg, scope);
        if (!['Ident', 'Index', 'Deref'].includes(e.arg.type))
          add('error', `операция ${e.op} применима только к переменной`, e, 'Инкремент/декремент изменяет переменную: i++ или --n. Выражения вроде (a+b)++ недопустимы.');
        return;
      case 'Unary': walkExpr(e.arg, scope); return;
      case 'Cast': walkExpr(e.arg, scope); return;
      case 'SizeofExpr': walkExpr(e.arg, scope, { lvalue: true }); return;
      case 'AddrOf': walkExpr(e.arg, scope, { lvalue: true });
        if (!['Ident', 'Index', 'Deref'].includes(e.arg.type)) add('error', 'операция & применима только к переменной', e, 'Адрес есть только у переменной: &x.');
        return;
      case 'Deref': walkExpr(e.arg, scope); return;
      case 'Index': walkExpr(e.obj, scope, { lvalue: true }); walkExpr(e.index, scope);
        if (!isPtr(typeOf(e.obj, scope))) add('error', 'индексировать [ ] можно только массив', e, 'Квадратные скобки применяются к массивам: a[i].');
        return;
      case 'Cond': walkExpr(e.cond, scope); walkExpr(e.a, scope); walkExpr(e.b, scope); return;
      case 'Comma': for (const x of e.list) walkExpr(x, scope); return;
      case 'Call': {
        const f = funcs.get(e.callee);
        const h = FUNC_HEADER[e.callee];
        const local = scope.lookup(e.callee);
        if (local && local.kind !== 'global-fn') {
          add('error', `«${e.callee}» — переменная, а не функция`, e, 'Нельзя вызвать переменную со скобками. Возможно, имя переменной совпало с именем функции.');
        } else if (f) {
          if (!f.unspecified) {
            const need = f.params.length;
            if (e.args.length !== need)
              add('error', `функция «${e.callee}» ожидает ${need} аргумент(ов), а передано ${e.args.length}`, e,
                `Объявление: ${typeName(f.ret)} ${f.name}(${f.params.map(p => typeName(p.type) + (p.name ? ' ' + p.name : '')).join(', ') || 'void'})`);
          }
          const def = prog.funcs.find(x => x.name === e.callee);
          if (def && def.line > e.line && def === f && !prog.funcs.some(x => x.name === e.callee && x.type === 'FuncDecl' && x.line < e.line))
            add('warning', `функция «${e.callee}» вызвана до своего объявления`, e,
              `Опишите функцию выше main или добавьте прототип в начале: ${typeName(f.ret)} ${f.name}(${f.params.map(p => typeName(p.type)).join(', ') || 'void'});`);
        } else if (h) {
          if (!included.has(h)) {
            add('error', `неявное объявление функции «${e.callee}»`, e.calleeNode || e,
              `Функция ${e.callee} живёт в библиотеке <${h}>. Во вселенной пока нет этого закона — подключите его первой строкой: #include <${h}>`, 'implicit-decl');
          } else {
            const def = HEADERS[h].funcs[e.callee];
            if (!def.variadic && Array.isArray(def.params) && e.args.length !== def.params.length)
              add('error', `функция «${e.callee}» ожидает ${def.params.length} аргумент(ов), а передано ${e.args.length}`, e, def.desc);
            if ((e.callee === 'abs') && e.args[0] && isFloat(typeOf(e.args[0], scope)))
              add('warning', 'abs() применяется к вещественному числу — дробная часть потеряется', e, 'Для double используйте fabs() из <math.h>.');
          }
        } else {
          const cand = suggest(e.callee, [...funcs.keys(), ...Object.keys(FUNC_HEADER)]);
          add('error', `функция «${e.callee}» не объявлена`, e.calleeNode || e,
            cand ? `Возможно, вы имели в виду «${cand}»?` : 'Такой функции нет ни в подключённых библиотеках, ни в вашей программе.', 'undeclared-fn');
        }
        if (e.callee === 'printf' || e.callee === 'scanf') {
          for (const a of e.args.slice(1)) {
            if (e.callee === 'scanf' && a.type === 'AddrOf') walkExpr(a.arg, scope, { lvalue: true });
            else walkExpr(a, scope);
          }
          if (included.has('stdio.h')) checkFormatCall(e, scope, e.callee === 'scanf');
        } else for (const a of e.args) walkExpr(a, scope);
        return;
      }
      case 'InitList': for (const x of e.items) walkExpr(x, scope); return;
    }
  }

  function checkIntDiv(v, targetType, scope) {
    if (!v || !isFloat(targetType)) return;
    const find = (e) => {
      if (!e) return null;
      if (e.type === 'Binary' && e.op === '/' && isInt(typeOf(e.left, scope)) && isInt(typeOf(e.right, scope))) return e;
      if (e.type === 'Binary' && ['+', '-', '*'].includes(e.op)) return find(e.left) || find(e.right);
      return null;
    };
    const d = find(v);
    if (d) add('note', 'целочисленное деление: дробная часть будет отброшена', d,
      `Оба операнда «${src.slice(d.start, d.end)}» целые, поэтому деление целочисленное (например, 7/2 = 3), даже если результат записывается в ${typeName(targetType)}. Для точного результата: (double)${src.slice(d.left.start, d.left.end)} / ${src.slice(d.right.start, d.right.end)} или используйте 2.0 вместо 2.`, 'int-div');
  }

  function checkNarrow(v, targetType, scope, node) {
    if (!v || !isInt(targetType)) return;
    const vt = typeOf(v, scope);
    if (isFloat(vt) && v.type !== 'Cast')
      add('note', `вещественное значение записывается в целую переменную (${typeName(targetType)})`, node,
        'Дробная часть будет отброшена (не округлена!): 3.99 → 3. Если это задумано — напишите явно (int)(...).');
  }

  function walkCond(c, scope, kw) {
    if (c && c.type === 'Assign' && c.op === '=' && !c.paren)
      add('warning', `присваивание «=» в условии ${kw}`, c,
        `Один знак = — это присваивание, а не сравнение! Условие ${src.slice(c.start, c.end)} изменит переменную. Для сравнения используйте ==.`, 'assign-cond');
    walkExpr(c, scope);
  }

  function walkStmt(s, scope, ctx) {
    if (!s) return;
    switch (s.type) {
      case 'Block': {
        const inner = new Scope(scope);
        for (const x of s.body) walkStmt(x, inner, ctx);
        reportUnused(inner);
        return;
      }
      case 'Decl':
        for (const d of s.decls) {
          let type = d.type;
          if (d.dims.length) {
            for (let k = d.dims.length - 1; k >= 0; k--) {
              const dim = d.dims[k];
              let len = null;
              if (dim) {
                walkExpr(dim.expr, scope);
                if (dim.expr.type === 'Num') len = Number(dim.expr.raw);
                if (len !== null && len <= 0) add('error', `размер массива «${d.name}» должен быть положительным`, dim.expr);
              } else if (d.init && d.init.type === 'InitList') len = d.init.items.length;
              else if (d.init && d.init.type === 'Str') len = d.init.bytes.length + 1;
              else add('error', `не указан размер массива «${d.name}»`, { line: d.line, col: d.col, start: 0, end: d.name.length }, 'Укажите размер: int a[10];');
              type = arr(type, len);
            }
          }
          if (d.init && d.init.type !== 'InitList') {
            walkExpr(d.init, scope);
            checkIntDiv(d.init, type, scope);
            checkNarrow(d.init, type, scope, d.init);
            if (d.init.type === 'Ident' && d.init.name === d.name)
              add('warning', `«${d.name}» инициализируется самой собой`, d.init, 'Значение не определено.');
          } else if (d.init) walkExpr(d.init, scope);
          if (d.init && d.init.type === 'InitList' && !d.dims.length)
            add('error', `фигурные скобки { } для инициализации допустимы только у массивов`, d.init, `Правильно: int ${d.name} = 5;`);
          declare(scope, { ...d, type, global: s.global }, s);
        }
        return;
      case 'ExprStmt': {
        const e = s.expr;
        if (e.type === 'Binary' && ['==', '!=', '<', '>', '<=', '>='].includes(e.op))
          add('warning', 'результат сравнения не используется', e,
            e.op === '==' ? `Возможно, вы хотели присвоить значение: ${src.slice(e.left.start, e.left.end)} = ${src.slice(e.right.start, e.right.end)};` : 'Сравнение само по себе ничего не делает — его используют в if/while.');
        else if (['Binary', 'Ident', 'Num'].includes(e.type))
          add('warning', 'выражение ничего не делает', e, 'Результат вычисления нигде не сохраняется. Возможно, пропущено присваивание: x = ...;');
        walkExpr(e, scope);
        return;
      }
      case 'If':
        walkCond(s.cond, scope, 'if');
        walkStmt(s.cons, new Scope(scope), ctx);
        if (s.alt) walkStmt(s.alt, new Scope(scope), ctx);
        return;
      case 'While':
        walkCond(s.cond, scope, 'while');
        checkLoopVar(s, scope);
        walkStmt(s.body, new Scope(scope), { ...ctx, loop: true });
        return;
      case 'DoWhile':
        walkStmt(s.body, new Scope(scope), { ...ctx, loop: true });
        walkCond(s.cond, scope, 'while');
        return;
      case 'For': {
        const fs = new Scope(scope);
        if (s.init) walkStmt(s.init, fs, ctx);
        if (s.cond) walkCond(s.cond, fs, 'for');
        walkStmt(s.body, new Scope(fs), { ...ctx, loop: true });
        if (s.update) walkExpr(s.update, fs);
        reportUnused(fs);
        return;
      }
      case 'Switch': {
        walkExpr(s.disc, scope);
        if (isFloat(typeOf(s.disc, scope))) add('error', 'выражение switch должно быть целым', s.disc, 'switch работает только с целыми числами и символами.');
        const seen = new Map();
        for (const x of s.body.body) if (x.type === 'Case') {
          const v = src.slice(x.test.start, x.test.end).trim();
          if (seen.has(v)) add('error', `повторяющееся значение case ${v}`, x, `Такая метка уже есть в строке ${seen.get(v)}.`);
          seen.set(v, x.line);
          if (!['Num', 'Char', 'Unary'].includes(x.test.type)) add('error', 'значение case должно быть константой', x.test, 'После case пишут число или символ: case 1: или case \'a\':');
        }
        walkStmt(s.body, new Scope(scope), { ...ctx, sw: true });
        checkFallthrough(s.body);
        return;
      }
      case 'Case': case 'Default':
        if (!ctx.sw) add('error', `метка «${s.type === 'Case' ? 'case' : 'default'}» вне оператора switch`, s);
        return;
      case 'Break':
        if (!ctx.loop && !ctx.sw) add('error', '«break» вне цикла или switch', s, 'break можно использовать только внутри for, while, do-while или switch.');
        return;
      case 'Continue':
        if (!ctx.loop) add('error', '«continue» вне цикла', s, 'continue можно использовать только внутри цикла.');
        return;
      case 'Return':
        if (s.arg) walkExpr(s.arg, scope);
        if (ctx.fn.ret === T.void && s.arg) add('warning', `функция «${ctx.fn.name}» объявлена как void, но возвращает значение`, s, 'У void-функции return пишется без значения: return;');
        if (ctx.fn.ret !== T.void && !s.arg) add('warning', `функция «${ctx.fn.name}» должна вернуть значение`, s, `Напишите return с значением типа ${typeName(ctx.fn.ret)}.`);
        return;
      case 'Empty': return;
    }
  }

  function checkLoopVar(s, scope) {
    const names = new Set();
    const collect = (e) => {
      if (!e) return;
      if (e.type === 'Ident') names.add(e.name);
      for (const k of ['left', 'right', 'arg', 'cond', 'a', 'b']) if (e[k]) collect(e[k]);
      if (e.type === 'Call') return names.add('*call');
      if (e.type === 'Assign' || e.type === 'Update') names.add('*mut');
    };
    collect(s.cond);
    if (names.has('*call') || names.has('*mut') || names.size === 0) return;
    let changed = false;
    const visit = (n) => {
      if (!n || typeof n !== 'object' || changed) return;
      if (n.type === 'Assign' || n.type === 'Update') {
        let t = n.type === 'Assign' ? n.target : n.arg;
        while (t && t.type === 'Index') t = t.obj;
        if (t && t.type === 'Ident' && names.has(t.name)) changed = true;
      }
      if (n.type === 'Call' && n.callee === 'scanf') changed = true;
      if (n.type === 'Break' || n.type === 'Return') changed = true;
      if (n.type === 'Call' && funcs.has(n.callee)) changed = true;
      for (const v of Object.values(n)) {
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object' && v.type) visit(v);
      }
    };
    visit(s.body);
    if (!changed)
      add('warning', 'возможен бесконечный цикл', s.cond,
        `Переменные из условия (${[...names].join(', ')}) не изменяются в теле цикла. По правилу итеративных циклов переменная из условия обязательно должна меняться внутри цикла, иначе произойдёт зацикливание.`, 'infinite');
  }

  function checkFallthrough(block) {
    const body = block.body;
    for (let i = 0; i < body.length; i++) {
      const x = body[i];
      if (x.type !== 'Case' && x.type !== 'Default') continue;
      let j = i + 1, hasCode = false, ended = false;
      for (; j < body.length; j++) {
        const y = body[j];
        if (y.type === 'Case' || y.type === 'Default') break;
        hasCode = true;
        if (y.type === 'Break' || y.type === 'Return' || y.type === 'Continue') { ended = true; }
      }
      if (hasCode && !ended && j < body.length)
        add('note', `после ветки case в строке ${x.line} нет break — выполнение «провалится» в следующую ветку`, body[j],
          'Если это не задумано, добавьте break; в конце ветки. Сквозное выполнение switch — частая ошибка.', 'fallthrough');
    }
  }

  function reportUnused(scope) {
    for (const s of scope.vars.values()) {
      if (!s.used && s.kind === 'var' && s.line)
        add('warning', `переменная «${s.name}» объявлена, но не используется`, { line: s.line, col: s.col, start: 0, end: s.name.length },
          'Удалите её или используйте. Это не ошибка, но загромождает программу.', 'unused');
    }
  }

  // глобальные переменные
  for (const g of prog.globals) {
    for (const d of g.decls) {
      if (d.init && d.init.type !== 'InitList' && !isConstExpr(d.init) && d.init.type !== 'Str' && d.init.type !== 'Binary' && d.init.type !== 'Cast')
        add('error', `глобальная переменная «${d.name}» должна инициализироваться константой`, d.init, 'Вне функций можно использовать только константы, например: int n = 10;');
    }
    walkStmt(g, global, {});
  }
  for (const s of global.vars.values()) s.used = true;

  for (const f of prog.funcs) {
    if (f.type !== 'FuncDef') continue;
    const fscope = new Scope(global, 'func');
    for (const p of f.params) if (p.name) declare(fscope, { name: p.name, type: p.type, line: p.line, col: p.col }, f, 'param');
    const body = new Scope(fscope);
    for (const s of f.body.body) walkStmt(s, body, { fn: f });
    reportUnused(body);
    if (f.name === 'main' && f.ret !== T.int && f.ret !== T.void)
      add('warning', 'main должна возвращать int', f, 'Правильно: int main(void) { ... return 0; }');
    if (f.name === 'main' && f.ret === T.void)
      add('warning', 'по стандарту main возвращает int, а не void', f, 'Пишите int main(void) и return 0; в конце.');
    const last = f.body.body[f.body.body.length - 1];
    if (f.ret !== T.void && f.name !== 'main' && !(last && (last.type === 'Return' || last.type === 'While' || last.type === 'For' || last.type === 'If')))
      add('warning', `в функции «${f.name}» нет return в конце`, { line: f.body.endLine, col: 1, start: 0, end: 1 },
        `Функция объявлена как ${typeName(f.ret)} и должна вернуть значение: return ...;`);
  }

  for (const inc of pp.includes) {
    const h = HEADERS[inc.name];
    const used = Object.keys(h.funcs).some(fn => src.includes(fn + '(') || src.includes(fn + ' (')) ||
      Object.keys(h.consts).some(c => new RegExp('\\b' + c + '\\b').test(src)) || (h.types && Object.keys(h.types).some(t => src.includes(t)));
    if (!used) add('note', `библиотека <${inc.name}> подключена, но не используется`, { line: inc.line, col: inc.col, start: 0, end: 9 + inc.name.length }, 'Лишние #include не мешают, но их можно убрать.');
  }

  return diags;
}
