// Семантический анализ: проверка имён, типов, форматов printf/scanf и типичных ошибок новичков.
import { makeDiag, suggest } from './diagnostics.js';
import { HEADERS, FUNC_HEADER, CONST_HEADER } from './stdlib.js';
import { T, ptr, isInt, isFloat, isArith, isPtr, isPointer, isRecord, commonType, promote, typeName } from './types.js';
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
  const big = /^0x/i.test(raw) ? BigInt(raw) : /^0[0-7]+$/.test(raw) ? BigInt('0o' + raw.slice(1)) : BigInt(raw);
  return { t, v: t.size === 8 ? big : Number(big) };
}

class Scope {
  constructor(parent, kind = 'block') { this.parent = parent; this.vars = new Map(); this.kind = kind; }
  lookup(name) { for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name); return null; }
  allNames() { const r = []; for (let s = this; s; s = s.parent) r.push(...s.vars.keys()); return r; }
}

const FMT_ARG = { printf: 0, scanf: 0, fprintf: 1, fscanf: 1, sprintf: 1, sscanf: 1, snprintf: 2 };
const decay = (t) => (t && t.k === 'arr' ? ptr(t.of) : t && t.k === 'func' ? ptr(t) : t);

export function analyze(prog, pp, src) {
  const diags = [];
  const included = new Set(pp.includes.map(i => i.name));
  const add = (sev, msg, node, hint = '', code = '') => {
    const len = node && node.end != null && node.start != null ? Math.max(1, Math.min(node.end - node.start, 60)) : (node?.len ?? 1);
    const d = makeDiag(sev, msg, { line: node?.line, col: node?.col, len }, hint, code);
    if (!diags.some(x => x.line === d.line && x.col === d.col && x.message === d.message)) diags.push(d);
  };
  const srcOf = (e) => (e && e.start != null ? src.slice(e.start, e.end) : '');

  const funcs = new Map();
  for (const f of prog.funcs) {
    const prev = funcs.get(f.name);
    if (prev && prev.type === 'FuncDef' && f.type === 'FuncDef')
      add('error', `повторное определение функции «${f.name}»`, f, `Функция ${f.name} уже определена в строке ${prev.line}. У каждой функции должно быть одно тело.`);
    if (!prev || f.type === 'FuncDef') funcs.set(f.name, f);
    if (FUNC_HEADER[f.name] && f.type === 'FuncDef' && included.has(FUNC_HEADER[f.name]))
      add('error', `конфликт: функция «${f.name}» уже есть в <${FUNC_HEADER[f.name]}>`, f, 'Дайте своей функции другое имя.');
  }
  const main = funcs.get('main');
  if (!main || main.type !== 'FuncDef')
    add('error', 'в программе нет функции main', { line: 1, col: 1, start: 0, end: 1 },
      'Выполнение любой программы на C начинается с функции main. Добавьте:\nint main(void) {\n    ...\n    return 0;\n}');

  const global = new Scope(null, 'global');
  let inSizeof = 0;

  function declare(scope, d, kind = 'var') {
    if (scope.vars.has(d.name)) {
      const p = scope.vars.get(d.name);
      if (!(p.isExtern || d.isExtern || (scope.kind === 'global' && (!p.hasInit || !d.init))))
        add('error', `повторное объявление «${d.name}»`, { line: d.line, col: d.col, len: d.name.length },
          `Переменная ${d.name} уже объявлена в строке ${p.line} в этой же области видимости. Уберите тип перед именем, если хотели просто присвоить значение.`);
      return p;
    }
    const outer = scope.parent && scope.parent.lookup(d.name);
    if (outer && kind === 'var' && scope.kind === 'block' && outer.kind !== 'global')
      add('note', `переменная «${d.name}» перекрывает внешнюю переменную из строки ${outer.line}`, { line: d.line, col: d.col, len: d.name.length },
        'Внутри этого блока имя будет обозначать новую переменную, а внешняя станет невидимой.');
    const sym = {
      name: d.name, type: d.type, line: d.line, col: d.col, kind: scope.kind === 'global' ? 'global' : kind,
      used: false, assigned: kind === 'param' || !!d.init || scope.kind === 'global' || !!d.isStatic || isRecord(d.type) || d.type.k === 'arr',
      isConst: d.isConst, isExtern: d.isExtern, hasInit: !!d.init,
    };
    scope.vars.set(d.name, sym);
    return sym;
  }

  function fieldOf(t, name) { return t && isRecord(t) && t.fields ? t.fields.find(f => f.name === name) : null; }

  // ——— вывод типа выражения ———
  function typeOf(e, scope) {
    if (!e) return null;
    switch (e.type) {
      case 'Num': return numLiteralType(e);
      case 'Char': case 'EnumConst': return T.int;
      case 'Str': return { k: 'arr', of: T.char, len: e.bytes.length + 1, size: e.bytes.length + 1, align: 1 };
      case 'Ident': {
        const s = scope.lookup(e.name);
        if (s) return s.type;
        const f = funcs.get(e.name);
        if (f) return f.ftype;
        if (CONST_HEADER[e.name]) return HEADERS[CONST_HEADER[e.name]].consts[e.name].type;
        return null;
      }
      case 'Binary': {
        const a = decay(typeOf(e.left, scope)), b = decay(typeOf(e.right, scope));
        if (['<', '>', '<=', '>=', '==', '!='].includes(e.op)) return T.int;
        if (!a || !b) return null;
        if (e.op === '<<' || e.op === '>>') return isInt(a) ? promote(a) : null;
        if (isPointer(a) && isInt(b)) return a;
        if (isPointer(b) && isInt(a) && e.op === '+') return b;
        if (isPointer(a) && isPointer(b) && e.op === '-') return T.long;
        if (isArith(a) && isArith(b)) return commonType(a, b);
        return null;
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
      case 'CompoundLit': return e.ctype;
      case 'SizeofType': case 'SizeofExpr': return T.ulong;
      case 'AddrOf': { const t = typeOf(e.arg, scope); return t ? ptr(t) : null; }
      case 'Deref': { const t = decay(typeOf(e.arg, scope)); return t && t.k === 'ptr' ? t.to : null; }
      case 'Index': {
        const a = decay(typeOf(e.obj, scope)), b = decay(typeOf(e.index, scope));
        if (a && a.k === 'ptr') return a.to;
        if (b && b.k === 'ptr') return b.to;
        return null;
      }
      case 'Member': {
        let t = typeOf(e.obj, scope);
        if (e.arrow) t = decay(t)?.to;
        const f = fieldOf(t, e.field);
        return f ? f.type : null;
      }
      case 'Cond': {
        const a = decay(typeOf(e.a, scope)), b = decay(typeOf(e.b, scope));
        return a && b && isArith(a) && isArith(b) ? commonType(a, b) : a || b;
      }
      case 'Comma': return typeOf(e.list[e.list.length - 1], scope);
      case 'Call': {
        const ft = calleeType(e, scope);
        return ft ? ft.ret : null;
      }
      default: return null;
    }
  }

  function calleeType(e, scope) {
    if (e.callee) {
      const s = scope.lookup(e.callee);
      if (s) { const t = decay(s.type); return t?.k === 'ptr' && t.to.k === 'func' ? t.to : null; }
      const f = funcs.get(e.callee);
      if (f) return f.ftype;
      const h = FUNC_HEADER[e.callee];
      if (h) { const d = HEADERS[h].funcs[e.callee]; return { k: 'func', ret: d.ret, params: d.params.map(p => ({ type: p })), variadic: d.variadic }; }
      return null;
    }
    let t = decay(typeOf(e.calleeNode, scope));
    if (t?.k === 'ptr') t = t.to;
    return t?.k === 'func' ? t : null;
  }

  const isConstExpr = (e) => e && (e.type === 'Num' || e.type === 'Char' || e.type === 'EnumConst' || (e.type === 'Unary' && isConstExpr(e.arg)));

  function markAssigned(target, scope) {
    let t = target;
    while (t && (t.type === 'Index' || t.type === 'Member')) t = t.obj;
    if (t && t.type === 'Ident') {
      const s = scope.lookup(t.name);
      if (s) {
        s.assigned = true;
        if (s.isConst && target.type === 'Ident') add('error', `присваивание константе «${s.name}»`, target, `Переменная ${s.name} объявлена как const — её значение нельзя изменить после инициализации.`);
      }
    }
  }

  // ——— проверка форматов ———
  function checkFormatCall(e, scope) {
    const name = e.callee;
    const isScanf = /scanf$/.test(name);
    const fi = FMT_ARG[name];
    if (e.args.length <= fi) return;
    const fmtNode = e.args[fi];
    if (fmtNode.type !== 'Str') {
      if (!isPtr(typeOf(fmtNode, scope)))
        add('error', `аргумент формата ${name} должен быть строкой в кавычках`, fmtNode,
          isScanf ? 'Правильно: scanf("%d", &x);' : 'Правильно: printf("%d\\n", x); — сначала строка формата, затем значения.');
      return;
    }
    const fmt = String.fromCharCode(...fmtNode.bytes);
    const parts = parseFormat(fmt, isScanf);
    const specs = [];
    for (const p of parts) {
      if (p.bad) add('warning', `неизвестный спецификатор «${p.text}» в строке формата`, fmtNode,
        'Основные спецификаторы: %d (int), %ld (long), %f (float/double в printf), %lf (double в scanf), %c (символ), %s (строка), %% (знак процента).');
      if (!p.spec || p.conv === '%') continue;
      if (!isScanf && p.width === '*') specs.push({ star: true, p });
      if (!isScanf && p.prec === '*') specs.push({ star: true, p });
      if (isScanf && p.suppress) continue;
      specs.push({ p });
    }
    const args = e.args.slice(fi + 1);
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
      const at0 = typeOf(a, scope);
      if (!at0) continue;
      const at = decay(at0);
      if (star) { if (!isInt(at)) add('warning', '«*» в формате ожидает аргумент int', a); continue; }
      if (isScanf) {
        if (!isPointer(at)) {
          const nm = a.type === 'Ident' ? a.name : srcOf(a);
          add('warning', `scanf ожидает АДРЕС переменной, а передано значение «${srcOf(a)}»`, a,
            `Добавьте & перед именем: ${name}(..."${p.text}", &${nm}); Без & программа запишет данные по случайному адресу и, скорее всего, аварийно завершится.`, 'scanf-noaddr');
          continue;
        }
        if (a.type === 'AddrOf') markAssigned(a.arg, scope);
        else if (a.type === 'Ident') markAssigned(a, scope);
        const target = at.to;
        const c = p.conv;
        let want = null, fix = null;
        if ('diuoxX'.includes(c)) {
          want = p.len === 'l' ? ['long', 'unsigned long'] : p.len === 'll' ? ['long long', 'unsigned long long'] : p.len === 'h' ? ['short', 'unsigned short'] : p.len === 'hh' ? ['char', 'signed char', 'unsigned char'] : ['int', 'unsigned int'];
          fix = target.k === 'long' || target.k === 'unsigned long' ? '%ld' : target.k === 'long long' ? '%lld' : target.k === 'short' ? '%hd' : target.k === 'double' ? '%lf' : target.k === 'float' ? '%f' : isInt(target) && target.size === 1 ? '%c' : '%d';
        } else if ('fFeEgGaA'.includes(c)) {
          want = p.len === 'l' ? ['double'] : p.len === 'L' ? ['long double'] : ['float'];
          fix = target.k === 'double' ? '%lf' : target.k === 'float' ? '%f' : isInt(target) ? '%d' : null;
        } else if (c === 'c' || c === 's' || c === '[') {
          want = ['char', 'signed char', 'unsigned char'];
          fix = isInt(target) && target.size > 1 ? '%d' : null;
          if (c === 's' && a.type === 'AddrOf' && typeOf(a.arg, scope)?.k === 'arr')
            add('note', `для строки в scanf знак & не нужен`, a, `Имя массива уже является адресом: scanf("%s", ${srcOf(a.arg)});`);
        }
        if (want && target.k !== 'void' && !want.includes(target.k)) {
          const extra = target.k === 'double' && c === 'f' && !p.len
            ? ' Для переменной double в scanf нужен %lf (буква l — «long float»). С %f в неё попадёт мусор!' : '';
          add('warning', `формат «${p.text}» ожидает ${want[0]} *, а передан ${typeName(at)}`, a,
            (fix ? `Используйте ${fix} для типа ${typeName(target)}.` : '') + extra, 'scanf-type');
        }
      } else {
        const exp = printfExpect(p);
        if (!exp) continue;
        const tn = typeName(at);
        if (exp.cat === 'int') {
          if (isFloat(at))
            add('warning', `формат «${p.text}» ожидает целое число, а передано вещественное (${tn})`, a,
              `Для вещественных чисел используйте %f (или %.2f для двух знаков после точки). Либо приведите к целому: (int)${srcOf(a)}. Сейчас на экран попадёт мусор!`, 'printf-type');
          else if (isInt(at)) {
            const big = at.size === 8;
            const wantBig = exp.len === 'l' || exp.len === 'll' || exp.len === 'z' || exp.len === 'j';
            if (big && !wantBig && p.conv !== 'c')
              add('warning', `формат «${p.text}» ожидает int, а аргумент имеет тип ${tn}`, a,
                `Для типа ${tn} используйте %l${p.conv}${tn === 'size_t' ? ' (или %zu)' : ''}. Иначе большие значения выведутся неверно (обрежутся до 32 бит).`, 'printf-type');
            else if (!big && wantBig)
              add('warning', `формат «${p.text}» ожидает ${exp.len === 'll' ? 'long long' : 'long'}, а аргумент имеет тип ${tn}`, a, `Для int используйте %${p.conv}.`, 'printf-type');
          } else if (isPointer(at))
            add('warning', `формат «${p.text}» ожидает число, а передан адрес/строка (${tn})`, a,
              at.to.size === 1 ? 'Для вывода строки используйте %s.' : 'Возможно, лишний & — в printf он не нужен: printf("%d", x);', 'printf-type');
        } else if (exp.cat === 'float') {
          if (isInt(at))
            add('warning', `формат «${p.text}» ожидает double, а передано целое (${tn})`, a,
              `Для целых используйте %d${at.size === 8 ? ' (или %ld для long)' : ''}. Или приведите к double: (double)${srcOf(a)}. Сейчас на экран попадёт мусор!`, 'printf-type');
          else if (isPointer(at))
            add('warning', `формат «${p.text}» ожидает число, а передан адрес (${tn})`, a, 'В printf знак & перед переменной не нужен.', 'printf-type');
        } else if (exp.cat === 'str') {
          if (!isPointer(at))
            add('warning', `формат «%s» ожидает строку (char *), а передан ${tn}`, a,
              isInt(at) && a.type === 'Char' ? "Для одного символа используйте %c. Символ в одинарных кавычках 'a' — не строка." : 'Для чисел используйте %d или %f.', 'printf-type');
        } else if (exp.cat === 'ptr' && !isPointer(at) && p.conv === 'p') {
          add('warning', 'формат «%p» ожидает указатель', a, 'Передайте адрес: printf("%p", (void*)&x);');
        }
      }
    }
    if (isScanf) {
      for (const p of parts) if (p.lit && p.lit.trim().length)
        add('note', `в формате ${name} есть текст «${p.lit.trim()}»`, fmtNode, 'scanf будет ожидать, что пользователь введёт этот текст буквально. Обычно в scanf пишут только спецификаторы: scanf("%d", &x); А подсказку для пользователя выводят через printf.');
      if (/\n/.test(fmt) && name === 'scanf') add('warning', 'символ \\n в строке формата scanf', fmtNode,
        'В scanf "\\n" означает «пропустить все пробелы и переводы строк» — программа будет ждать лишнего ввода. Уберите \\n из scanf (он нужен в printf).');
    }
  }

  // ——— обход ———
  function walkExpr(e, scope, ctx = {}) {
    if (!e) return;
    switch (e.type) {
      case 'Num': case 'Char': case 'Str': case 'SizeofType': case 'EnumConst': return;
      case 'Ident': {
        const s = scope.lookup(e.name);
        if (s) {
          s.used = true;
          if (!s.assigned && !ctx.lvalue && !inSizeof && s.kind === 'var' && !s.warnedUninit) {
            s.warnedUninit = true;
            add('warning', `переменная «${e.name}» используется без инициализации`, e,
              `В момент объявления в переменной лежит случайный «мусор» из памяти. Задайте начальное значение: ${typeName(s.type)} ${e.name} = 0; или считайте его через scanf до использования.`, 'uninit');
          }
          return;
        }
        if (funcs.has(e.name)) return; // имя функции как указатель
        if (CONST_HEADER[e.name]) {
          if (!included.has(CONST_HEADER[e.name]) && !(CONST_HEADER[e.name] === 'stdio.h' && e.name === 'NULL' && ['stdlib.h', 'string.h', 'stddef.h'].some(h => included.has(h))))
            add('error', `«${e.name}» не объявлен`, e, `Константа ${e.name} определена в библиотеке <${CONST_HEADER[e.name]}>. Добавьте в начало программы: #include <${CONST_HEADER[e.name]}>`);
          return;
        }
        if (FUNC_HEADER[e.name]) {
          if (!included.has(FUNC_HEADER[e.name])) add('error', `«${e.name}» не объявлена`, e, `Функция ${e.name} живёт в <${FUNC_HEADER[e.name]}>.`);
          return;
        }
        const cand = suggest(e.name, [...scope.allNames(), ...funcs.keys(), ...Object.keys(CONST_HEADER)]);
        const kwCand = suggest(e.name, [...KEYWORDS]);
        let hint = `Каждую переменную нужно объявить до использования, например: int ${e.name};`;
        if (cand) hint = `Возможно, вы имели в виду «${cand}»? (регистр букв важен: a и A — разные имена).`;
        else if (kwCand) hint = `Возможно, это опечатка в ключевом слове «${kwCand}».`;
        if (e.name === 'pi' || e.name === 'PI') hint = 'Число π: объявите константу #define PI 3.14159265358979 или подключите <math.h> и используйте M_PI.';
        if (e.name === 'true' || e.name === 'false') hint = 'true/false появляются после #include <stdbool.h>. В чистом C истина — 1, ложь — 0.';
        if (e.name === 'endl' || e.name === 'cout' || e.name === 'cin') hint = 'Это C++. В C используйте printf("...\\n") и scanf.';
        add('error', `«${e.name}» не объявлена (первое использование в этой функции)`, e, hint, 'undeclared');
        scope.vars.set(e.name, { name: e.name, type: T.int, line: e.line, kind: 'var', used: true, assigned: true });
        return;
      }
      case 'Binary': {
        walkExpr(e.left, scope); walkExpr(e.right, scope);
        const a = decay(typeOf(e.left, scope)), b = decay(typeOf(e.right, scope));
        if (e.op === '%' && (isFloat(a) || isFloat(b)))
          add('error', 'операция % неприменима к вещественным числам', e, 'Остаток от деления % работает только с целыми. Для double используйте fmod(x, y) из <math.h>.');
        if ((e.op === '/' || e.op === '%') && e.right.type === 'Num' && Number(e.right.raw) === 0)
          add('warning', 'деление на ноль', e.right, 'Деление на 0 не определено: программа аварийно завершится (для целых) или получит inf (для double).');
        if (['<', '>', '<=', '>='].includes(e.op) && e.left.type === 'Binary' && ['<', '>', '<=', '>='].includes(e.left.op) && !e.left.paren)
          add('warning', `сравнение вида «a ${e.left.op} b ${e.op} c» работает не так, как в математике`, e,
            `В C сначала вычисляется (a ${e.left.op} b) → 0 или 1, и уже это число сравнивается с c. Правильно: a ${e.left.op} b && b ${e.op} c`);
        if ((e.op === '&' || e.op === '|') && e.left.type === 'Binary' && ['<', '>', '<=', '>=', '==', '!='].includes(e.left.op))
          add('note', `«${e.op}» — побитовая операция`, e, `Для логического «${e.op === '&' ? 'И' : 'ИЛИ'}» используйте ${e.op}${e.op}.`);
        if (e.op === '^' && isInt(a) && e.right.type === 'Num' && e.left.type !== 'Binary')
          add('note', '«^» — это побитовое исключающее ИЛИ, а не степень', e, 'Для возведения в степень используйте pow(x, y) из <math.h> или умножение x*x.');
        if (['==', '!='].includes(e.op) && a && b && isPointer(a) && isPointer(b) && (e.left.type === 'Str' || e.right.type === 'Str'))
          add('warning', 'строки сравниваются через == (сравниваются адреса, а не текст)', e, 'Для сравнения текста строк используйте strcmp(a, b) == 0 из <string.h>.');
        if (a && b && !isArith(a) && !isPointer(a) || b && !isArith(b) && !isPointer(b)) {
          if ((a && isRecord(a)) || (b && isRecord(b))) add('error', `операция ${e.op} неприменима к структурам`, e, 'Сравнивайте и складывайте поля по отдельности: p.x == q.x.');
        }
        return;
      }
      case 'Logical': walkExpr(e.left, scope); walkExpr(e.right, scope); return;
      case 'Assign': {
        if (e.op !== '=') walkExpr(e.target, scope);
        else walkExpr(e.target, scope, { lvalue: true });
        walkExpr(e.value, scope);
        markAssigned(e.target, scope);
        const tt = typeOf(e.target, scope);
        if (tt?.k === 'arr') add('error', 'массиву нельзя присвоить значение целиком', e,
          isInt(tt.of) && tt.of.size === 1 ? 'Для строк используйте strcpy(куда, откуда) из <string.h>.' : 'Присваивайте элементы по одному в цикле: a[i] = b[i];');
        checkIntDiv(e.value, tt, scope);
        checkNarrow(e.value, tt, scope, e);
        return;
      }
      case 'Update': walkExpr(e.arg, scope); markAssigned(e.arg, scope);
        if (!['Ident', 'Index', 'Deref', 'Member'].includes(e.arg.type))
          add('error', `операция ${e.op} применима только к переменной`, e, 'Инкремент/декремент изменяет переменную: i++ или --n. Выражения вроде (a+b)++ недопустимы.');
        return;
      case 'Unary': walkExpr(e.arg, scope); return;
      case 'Cast': walkExpr(e.arg, scope); return;
      case 'CompoundLit': walkExpr(e.init, scope); return;
      case 'SizeofExpr': inSizeof++; try { walkExpr(e.arg, scope, { lvalue: true }); } finally { inSizeof--; } return;
      case 'AddrOf': walkExpr(e.arg, scope, { lvalue: true });
        if (!['Ident', 'Index', 'Deref', 'Member', 'CompoundLit'].includes(e.arg.type)) add('error', 'операция & применима только к переменной', e, 'Адрес есть только у переменной: &x.');
        return;
      case 'Deref': {
        walkExpr(e.arg, scope);
        const t = decay(typeOf(e.arg, scope));
        if (t && !isPointer(t)) add('error', `операция * (разыменование) применима только к указателю, а «${srcOf(e.arg)}» имеет тип ${typeName(t)}`, e, 'Звёздочка перед именем означает «значение по адресу». Она нужна только для указателей.');
        return;
      }
      case 'Index': {
        walkExpr(e.obj, scope, { lvalue: true }); walkExpr(e.index, scope);
        const a = decay(typeOf(e.obj, scope)), b = decay(typeOf(e.index, scope));
        if (a && !isPointer(a) && !(b && isPointer(b))) add('error', 'индексировать [ ] можно только массив или указатель', e, 'Квадратные скобки применяются к массивам: a[i].');
        if (b && isFloat(b)) add('error', 'индекс массива должен быть целым числом', e.index, 'Приведите индекс к int: a[(int)x].');
        const at = typeOf(e.obj, scope);
        const iv = e.index.type === 'Num' ? Number(e.index.raw) : null;
        if (at?.k === 'arr' && at.len != null && iv != null && (iv >= at.len || iv < 0))
          add('warning', `индекс ${iv} выходит за границы массива (0…${at.len - 1})`, e.index, `В массиве из ${at.len} элементов последний имеет индекс ${at.len - 1}.`);
        return;
      }
      case 'Member': {
        walkExpr(e.obj, scope, { lvalue: true });
        const t0 = typeOf(e.obj, scope);
        if (!t0) return;
        const t = decay(t0);
        if (e.arrow && !(isPointer(t) && isRecord(t.to))) {
          if (isRecord(t0)) add('error', `«${srcOf(e.obj)}» — структура, а не указатель: используйте точку`, e, `Правильно: ${srcOf(e.obj)}.${e.field}. Стрелка -> нужна для указателя на структуру.`);
          else add('error', `операция -> применима только к указателю на структуру`, e);
          return;
        }
        if (!e.arrow && !isRecord(t0)) {
          if (isPointer(t) && isRecord(t.to)) add('error', `«${srcOf(e.obj)}» — указатель на структуру: используйте ->`, e, `Правильно: ${srcOf(e.obj)}->${e.field} (то же, что (*${srcOf(e.obj)}).${e.field}).`);
          else add('error', `операция . применима только к структурам, а «${srcOf(e.obj)}» имеет тип ${typeName(t0)}`, e);
          return;
        }
        const rt = e.arrow ? t.to : t0;
        if (!fieldOf(rt, e.field)) {
          const c = suggest(e.field, (rt.fields || []).map(f => f.name));
          add('error', `в ${typeName(rt)} нет поля «${e.field}»`, e.fieldTok ? { line: e.fieldTok.line, col: e.fieldTok.col, len: e.field.length } : e,
            c ? `Возможно, имелось в виду «${c}»?` : `Поля: ${(rt.fields || []).map(f => f.name).join(', ')}.`);
        }
        return;
      }
      case 'Cond': walkExpr(e.cond, scope); walkExpr(e.a, scope); walkExpr(e.b, scope); return;
      case 'Comma': for (const x of e.list) walkExpr(x, scope); return;
      case 'InitList': for (const x of e.items) walkExpr(x, scope); return;
      case 'Call': return walkCall(e, scope);
    }
  }

  function walkCall(e, scope) {
    const name = e.callee;
    if (!name) {
      walkExpr(e.calleeNode, scope);
      const ft = calleeType(e, scope);
      if (!ft) add('error', 'вызывать можно только функцию или указатель на функцию', e.calleeNode);
      for (const a of e.args) walkExpr(a, scope);
      return;
    }
    const local = scope.lookup(name);
    const f = funcs.get(name);
    const h = FUNC_HEADER[name];
    if (local) {
      local.used = true;
      const t = decay(local.type);
      if (!(t?.k === 'ptr' && t.to.k === 'func'))
        add('error', `«${name}» — переменная, а не функция`, e, 'Нельзя вызвать переменную со скобками. Возможно, имя переменной совпало с именем функции.');
      else checkArgs(e, t.to, name, scope);
    } else if (f) {
      if (!f.unspecified) checkArgs(e, f.ftype, name, scope);
      if (f.line > e.line && !prog.funcs.some(x => x.name === name && x.type === 'FuncDecl' && x.line < e.line) && f.type === 'FuncDef')
        add('warning', `функция «${name}» вызвана до своего объявления`, e,
          `Опишите функцию выше main или добавьте прототип в начале: ${typeName(f.ret)} ${f.name}(${f.params.map(p => typeName(p.type)).join(', ') || 'void'});`);
    } else if (h) {
      if (!included.has(h)) {
        add('error', `неявное объявление функции «${name}»`, e.calleeNode || e,
          `Функция ${name} находится в библиотеке <${h}>. Подключите её первой строкой: #include <${h}>`, 'implicit-decl');
      } else {
        const def = HEADERS[h].funcs[name];
        const need = def.params.length;
        if ((!def.variadic && e.args.length !== need) || (def.variadic && e.args.length < need))
          add('error', `функция «${name}» ожидает ${def.variadic ? 'не меньше ' : ''}${need} аргумент(ов), а передано ${e.args.length}`, e, def.desc);
        if (name === 'abs' && e.args[0] && isFloat(typeOf(e.args[0], scope)))
          add('warning', 'abs() применяется к вещественному числу — дробная часть потеряется', e, 'Для double используйте fabs() из <math.h>.');
        if (name === 'gets') add('warning', 'функция gets опасна и удалена из стандарта C11', e, 'Используйте fgets(s, sizeof s, stdin) — она не выходит за границы массива.');
        if (name === 'free' && e.args[0]?.type === 'AddrOf') add('warning', 'free получает адрес не из malloc', e, 'Освобождать нужно только память, выделенную malloc/calloc/realloc.');
      }
    } else {
      const cand = suggest(name, [...funcs.keys(), ...Object.keys(FUNC_HEADER)]);
      add('error', `функция «${name}» не объявлена`, e.calleeNode || e,
        cand ? `Возможно, вы имели в виду «${cand}»?` : 'Такой функции нет ни в подключённых библиотеках, ни в вашей программе.', 'undeclared-fn');
    }
    if (name in FMT_ARG) {
      const fi = FMT_ARG[name];
      e.args.forEach((a, i) => {
        if (i > fi && /scanf$/.test(name) && a.type === 'AddrOf') walkExpr(a.arg, scope, { lvalue: true });
        else if (i > fi && /scanf$/.test(name) && a.type === 'Ident') walkExpr(a, scope, { lvalue: true });
        else walkExpr(a, scope);
      });
      if (h && included.has(h)) checkFormatCall(e, scope);
    } else {
      for (const a of e.args) {
        const lv = ['fgets', 'gets', 'strcpy', 'strncpy', 'memset', 'memcpy', 'sprintf', 'strcat'].includes(name) && a === e.args[0];
        walkExpr(a, scope, lv ? { lvalue: true } : {});
        if (lv) markAssigned(a, scope);
      }
    }
  }

  function checkArgs(e, ft, name, scope) {
    if (ft.unspecified) return;
    const need = ft.params.length;
    if ((!ft.variadic && e.args.length !== need) || (ft.variadic && e.args.length < need))
      add('error', `функция «${name}» ожидает ${need} аргумент(ов), а передано ${e.args.length}`, e,
        `Объявление: ${typeName(ft.ret)} ${name}(${ft.params.map(p => typeName(p.type) + (p.name ? ' ' + p.name : '')).join(', ') || 'void'})`);
    ft.params.forEach((p, i) => {
      const a = e.args[i];
      if (!a) return;
      const at = decay(typeOf(a, scope));
      if (!at || !p.type) return;
      if (isRecord(p.type) && !(isRecord(at) && at === p.type)) add('error', `аргумент ${i + 1} функции «${name}» должен иметь тип ${typeName(p.type)}`, a);
      else if (isPointer(p.type) && isArith(at) && !(a.type === 'Num' && Number(a.raw) === 0))
        add('warning', `аргумент ${i + 1} функции «${name}» должен быть адресом (${typeName(p.type)}), а передано ${typeName(at)}`, a,
          `Возможно, пропущен &: ${name}(…, &${srcOf(a)}, …)`);
      else if (isArith(p.type) && isPointer(at))
        add('warning', `аргумент ${i + 1} функции «${name}» должен быть числом, а передан адрес (${typeName(at)})`, a, 'Возможно, лишний & или нужно разыменовать указатель: *p.');
    });
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
      `Оба операнда «${srcOf(d)}» целые, поэтому деление целочисленное (например, 7/2 = 3), даже если результат записывается в ${typeName(targetType)}. Для точного результата: (double)${srcOf(d.left)} / ${srcOf(d.right)} или используйте 2.0 вместо 2.`, 'int-div');
  }

  function checkNarrow(v, targetType, scope, node) {
    if (!v || !isInt(targetType)) return;
    const vt = typeOf(v, scope);
    if (vt && isFloat(vt) && v.type !== 'Cast')
      add('note', `вещественное значение записывается в целую переменную (${typeName(targetType)})`, node,
        'Дробная часть будет отброшена (не округлена!): 3.99 → 3. Если это задумано — напишите явно (int)(...).');
  }

  function walkCond(c, scope, kw) {
    if (c && c.type === 'Assign' && c.op === '=' && !c.paren)
      add('warning', `присваивание «=» в условии ${kw}`, c,
        `Один знак = — это присваивание, а не сравнение! Условие ${srcOf(c)} изменит переменную. Для сравнения используйте ==.`, 'assign-cond');
    walkExpr(c, scope);
  }

  function walkDecl(s, scope) {
    for (const d of s.decls) {
      if (d.type.k === 'arr' && d.type.lenExpr) walkExpr(d.type.lenExpr, scope);
      // имя видно уже внутри собственного инициализатора (int *p = malloc(sizeof *p))
      const selfRef = d.init && d.init.type === 'Ident' && d.init.name === d.name;
      const sym = declare(scope, selfRef ? { ...d, init: null } : d);
      if (d.init && d.init.type !== 'InitList') {
        walkExpr(d.init, scope);
        checkIntDiv(d.init, d.type, scope);
        checkNarrow(d.init, d.type, scope, d.init);
        if (d.init.type === 'Ident' && d.init.name === d.name)
          add('warning', `«${d.name}» инициализируется самой собой`, d.init, 'Значение не определено.');
        if (d.type.k === 'arr' && d.init.type !== 'Str')
          add('error', `массив «${d.name}» инициализируется списком в фигурных скобках`, d.init, `Правильно: int ${d.name}[3] = {1, 2, 3};`);
        const it = typeOf(d.init, scope);
        if (isPointer(d.type) && it && isArith(it) && !(d.init.type === 'Num' && Number(d.init.raw) === 0))
          add('warning', `указатель «${d.name}» инициализируется числом`, d.init, `Указателю присваивают адрес: ${d.name} = &x; или NULL.`);
      } else if (d.init) {
        walkExpr(d.init, scope);
        if (!(d.type.k === 'arr' || isRecord(d.type)) && d.init.items.length > 1)
          add('error', 'фигурные скобки { } для инициализации допустимы только у массивов и структур', d.init, `Правильно: ${typeName(d.type)} ${d.name} = 5;`);
      }
      if (selfRef) sym.assigned = true;
    }
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
      case 'Decl': walkDecl(s, scope); return;
      case 'ExprStmt': {
        const e = s.expr;
        if (e.type === 'Binary' && ['==', '!=', '<', '>', '<=', '>='].includes(e.op))
          add('warning', 'результат сравнения не используется', e,
            e.op === '==' ? `Возможно, вы хотели присвоить значение: ${srcOf(e.left)} = ${srcOf(e.right)};` : 'Сравнение само по себе ничего не делает — его используют в if/while.');
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
        const collect = (list) => {
          for (const x of list) {
            if (x.type === 'Case') {
              if (x.value == null) add('error', 'значение case должно быть константой', x.test, 'После case пишут число, символ или константу enum: case 1: или case \'a\':');
              else if (seen.has(x.value)) add('error', `повторяющееся значение case ${srcOf(x.test)}`, x, `Такая метка уже есть в строке ${seen.get(x.value)}.`);
              else seen.set(x.value, x.line);
            }
            if (x.type === 'Label' && x.stmt) collect([x.stmt]);
          }
        };
        collect(s.body.body);
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
      case 'Label':
        ctx.labels.add(s.name);
        walkStmt(s.stmt, scope, ctx);
        return;
      case 'Goto':
        ctx.gotos.push(s);
        return;
      case 'Return':
        if (s.arg) walkExpr(s.arg, scope);
        if (ctx.fn.ret.k === 'void' && s.arg) add('warning', `функция «${ctx.fn.name}» объявлена как void, но возвращает значение`, s, 'У void-функции return пишется без значения: return;');
        if (ctx.fn.ret.k !== 'void' && !s.arg) add('warning', `функция «${ctx.fn.name}» должна вернуть значение`, s, `Напишите return с значением типа ${typeName(ctx.fn.ret)}.`);
        if (s.arg && ctx.fn.ret.k === 'ptr') {
          let a = s.arg;
          if (a.type === 'AddrOf' && a.arg.type === 'Ident') {
            const sym = scope.lookup(a.arg.name);
            if (sym && sym.kind !== 'global' && !sym.isStaticLocal) add('warning', `функция возвращает адрес локальной переменной «${a.arg.name}»`, s, 'После выхода из функции её переменные исчезают, и адрес указывает на мусор. Используйте malloc или static.');
          }
        }
        return;
      case 'Empty': return;
    }
  }

  function checkLoopVar(s, scope) {
    const names = new Set();
    let complex = false;
    const collect = (e) => {
      if (!e) return;
      if (e.type === 'Ident') names.add(e.name);
      if (e.type === 'Call' || e.type === 'Assign' || e.type === 'Update' || e.type === 'Deref' || e.type === 'Member' || e.type === 'Index') complex = true;
      for (const k of ['left', 'right', 'arg', 'cond', 'a', 'b']) if (e[k]) collect(e[k]);
    };
    collect(s.cond);
    if (complex || names.size === 0) return;
    let changed = false;
    const visit = (n) => {
      if (!n || typeof n !== 'object' || changed) return;
      if (n.type === 'Assign' || n.type === 'Update') {
        let t = n.type === 'Assign' ? n.target : n.arg;
        while (t && (t.type === 'Index' || t.type === 'Member')) t = t.obj;
        if (!t || t.type !== 'Ident' || names.has(t.name)) changed = true;
      }
      if (n.type === 'Call' || n.type === 'AddrOf' || n.type === 'Break' || n.type === 'Return' || n.type === 'Goto') changed = true;
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
        if (['Break', 'Return', 'Continue', 'Goto'].includes(y.type)) ended = true;
      }
      if (hasCode && !ended && j < body.length)
        add('note', `после ветки case в строке ${x.line} нет break — выполнение «провалится» в следующую ветку`, body[j],
          'Если это не задумано, добавьте break; в конце ветки. Сквозное выполнение switch — частая ошибка.', 'fallthrough');
    }
  }

  function reportUnused(scope) {
    for (const s of scope.vars.values()) {
      if (!s.used && s.kind === 'var' && s.line)
        add('warning', `переменная «${s.name}» объявлена, но не используется`, { line: s.line, col: s.col, len: s.name.length },
          'Удалите её или используйте. Это не ошибка, но загромождает программу.', 'unused');
    }
  }

  // глобальные переменные и функции в порядке появления
  for (const item of prog.items || [...prog.globals, ...prog.funcs]) {
    if (item.type === 'Decl') {
      for (const d of item.decls) {
        if (d.init && d.init.type !== 'InitList' && !['Num', 'Char', 'Str', 'EnumConst', 'Unary', 'Binary', 'Cast', 'AddrOf', 'SizeofType', 'Ident'].includes(d.init.type))
          add('error', `глобальная переменная «${d.name}» должна инициализироваться константой`, d.init, 'Вне функций можно использовать только константы, например: int n = 10;');
      }
      walkDecl(item, global);
      continue;
    }
    if (item.type !== 'FuncDef') continue;
    const f = item;
    const fscope = new Scope(global, 'func');
    for (const p of f.params) if (p.name) declare(fscope, { name: p.name, type: p.type, line: p.line, col: p.col, isConst: p.isConst }, 'param');
    const body = new Scope(fscope);
    const ctx = { fn: f, labels: new Set(), gotos: [] };
    for (const s of f.body.body) walkStmt(s, body, ctx);
    for (const g of ctx.gotos) if (!ctx.labels.has(g.label)) add('error', `метка «${g.label}» не найдена`, g, 'Метка объявляется так: имя: оператор; — внутри той же функции.');
    reportUnused(body);
    if (f.name === 'main' && f.ret.k !== 'int' && f.ret.k !== 'void')
      add('warning', 'main должна возвращать int', f, 'Правильно: int main(void) { ... return 0; }');
    if (f.name === 'main' && f.ret.k === 'void')
      add('warning', 'по стандарту main возвращает int, а не void', f, 'Пишите int main(void) и return 0; в конце.');
    const last = f.body.body[f.body.body.length - 1];
    if (f.ret.k !== 'void' && f.name !== 'main' && !(last && ['Return', 'While', 'For', 'If', 'Switch', 'DoWhile', 'Goto'].includes(last.type)) && !(last?.type === 'ExprStmt' && last.expr.type === 'Call' && ['exit', 'abort'].includes(last.expr.callee)))
      add('warning', `в функции «${f.name}» нет return в конце`, { line: f.body.endLine, col: 1, len: 1 },
        `Функция объявлена как ${typeName(f.ret)} и должна вернуть значение: return ...;`);
  }
  for (const s of global.vars.values()) s.used = true;

  for (const inc of pp.includes) {
    const h = HEADERS[inc.name];
    const used = Object.keys(h.funcs).some(fn => new RegExp('\\b' + fn + '\\s*\\(').test(src)) ||
      Object.keys(h.consts).some(c => new RegExp('\\b' + c + '\\b').test(src)) || Object.keys(h.types || {}).some(t => new RegExp('\\b' + t + '\\b').test(src));
    if (!used) add('note', `библиотека <${inc.name}> подключена, но не используется`, { line: inc.line, col: inc.col, len: 9 + inc.name.length }, 'Лишние #include не мешают, но их можно убрать.');
  }

  return diags;
}
