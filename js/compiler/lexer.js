// Лексический анализатор и простой препроцессор (#include, #define).
import { CompileError } from './diagnostics.js';

export const KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double',
  'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int', 'long', 'register',
  'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef',
  'union', 'unsigned', 'void', 'volatile', 'while', '_Bool', 'inline', 'restrict',
]);

const OPS = [
  '<<=', '>>=', '...',
  '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '^=', '|=',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '~', '&', '|', '^',
  '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}',
];

const ESC = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, "'": 39, '"': 34, a: 7, b: 8, f: 12, v: 11, '?': 63 };

const SMART = {
  '“': '"', '”': '"', '«': '"', '»': '"', '‘': "'", '’': "'", '—': '-', '–': '-',
  '−': '-', '×': '*', '÷': '/', '≤': '<=', '≥': '>=', '≠': '!=',
};

/**
 * Разбивает исходный текст на лексемы. Директивы препроцессора
 * возвращаются отдельными лексемами типа 'directive'.
 */
export function tokenize(src, opts = {}) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  let lineStart = true; // только пробелы с начала строки

  const peek = (o = 0) => src[i + o];
  const adv = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; lineStart = true; } else col++;
      i++;
    }
  };
  const err = (msg, hint, len = 1) => { throw new CompileError(msg, { line, col, len }, hint); };

  function readEscape() {
    // вызывается, когда src[i] === '\\'
    adv();
    const c = peek();
    if (c === undefined) err('незавершённая escape-последовательность');
    if (c === 'x') {
      adv();
      let h = '';
      while (/[0-9a-fA-F]/.test(peek() || '')) { h += peek(); adv(); }
      return parseInt(h || '0', 16) & 0xff;
    }
    if (/[0-7]/.test(c)) {
      let o = '';
      while (o.length < 3 && /[0-7]/.test(peek() || '')) { o += peek(); adv(); }
      return parseInt(o, 8) & 0xff;
    }
    adv();
    if (c in ESC) return ESC[c];
    return c.charCodeAt(0);
  }

  while (i < src.length) {
    const c = peek();
    if (c === '\n') { adv(); continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; col++; continue; }
    if (c === '/' && peek(1) === '*') {
      const sl = line, sc = col;
      adv(2);
      while (i < src.length && !(peek() === '*' && peek(1) === '/')) adv();
      if (i >= src.length)
        throw new CompileError('незакрытый комментарий /* ...', { line: sl, col: sc, len: 2 },
          'Каждый комментарий, начатый с /*, нужно закрыть символами */');
      adv(2);
      continue;
    }
    if (c === '/' && peek(1) === '/') {
      while (i < src.length && peek() !== '\n') adv();
      continue;
    }
    const tl = line, tc = col, start = i;

    if (c === '#' && opts.macro) {
      const two = peek(1) === '#';
      adv(two ? 2 : 1);
      toks.push({ type: 'op', value: two ? '##' : '#', line: tl, col: tc, start, end: i });
      continue;
    }
    if (c === '#' && lineStart) {
      // директива препроцессора — до конца строки (с учётом \ переноса)
      let text = '';
      adv();
      while (i < src.length && peek() !== '\n') {
        if (peek() === '\\' && peek(1) === '\n') { adv(2); text += ' '; continue; }
        if (peek() === '/' && peek(1) === '*') {
          adv(2);
          while (i < src.length && !(peek() === '*' && peek(1) === '/')) adv();
          adv(2);
          text += ' ';
          continue;
        }
        if (peek() === '/' && peek(1) === '/') { while (i < src.length && peek() !== '\n') adv(); break; }
        text += peek();
        adv();
      }
      toks.push({ type: 'directive', value: text.trim(), line: tl, col: tc, start, end: i });
      continue;
    }
    lineStart = false;

    if (/[A-Za-z_]/.test(c)) {
      let s = '';
      while (/[A-Za-z0-9_]/.test(peek() || '')) { s += peek(); adv(); }
      if (/[А-Яа-яЁё]/.test(peek() || ''))
        err(`недопустимый символ '${peek()}' в имени '${s}…'`,
          'Имена (идентификаторы) в C состоят только из латинских букв, цифр и знака _. Русские буквы можно писать только внутри строк "..." и комментариев.');
      toks.push({ type: KEYWORDS.has(s) ? 'kw' : 'id', value: s, line: tl, col: tc, start, end: i });
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(peek(1) || ''))) {
      let s = '';
      let isFloat = false;
      if (c === '0' && /[xX]/.test(peek(1) || '')) {
        s = '0x'; adv(2);
        while (/[0-9a-fA-F]/.test(peek() || '')) { s += peek(); adv(); }
      } else {
        while (/[0-9]/.test(peek() || '')) { s += peek(); adv(); }
        if (peek() === '.') { isFloat = true; s += '.'; adv(); while (/[0-9]/.test(peek() || '')) { s += peek(); adv(); } }
        if (/[eE]/.test(peek() || '') && /[0-9+-]/.test(peek(1) || '')) {
          isFloat = true; s += 'e'; adv();
          if (/[+-]/.test(peek())) { s += peek(); adv(); }
          while (/[0-9]/.test(peek() || '')) { s += peek(); adv(); }
        }
      }
      let suffix = '';
      while (/[uUlLfF]/.test(peek() || '')) { suffix += peek().toLowerCase(); adv(); }
      if (/[A-Za-z_]/.test(peek() || ''))
        err(`неверный суффикс «${peek()}» у числа ${s}`,
          'Имя переменной не может начинаться с цифры. Если это умножение, поставьте знак *: например 2*x, а не 2x.');
      toks.push({ type: 'num', value: s, suffix, isFloat: isFloat || (suffix.includes('f') && !s.startsWith('0x')), line: tl, col: tc, start, end: i });
      continue;
    }

    if (c === "'") {
      adv();
      if (peek() === "'") err('пустая символьная константа \'\'', "Между одинарными кавычками должен быть ровно один символ, например 'a' или '\\n'.");
      let code;
      if (peek() === '\\') code = readEscape();
      else {
        const cp = src.codePointAt(i);
        if (cp > 127) {
          // кириллица и т.п. в символьной константе: в UTF-8 это несколько байт
          code = cp;
        } else code = cp;
        adv(cp > 0xffff ? 2 : 1);
      }
      if (peek() !== "'") {
        if (peek() === '\n' || peek() === undefined) err('не хватает закрывающей кавычки \'', "Символьная константа записывается так: 'a'.");
        err('в одинарных кавычках должен быть один символ', "Одинарные кавычки — для одного символа ('a'), двойные — для строки (\"abc\").");
      }
      adv();
      toks.push({ type: 'char', value: code, line: tl, col: tc, start, end: i });
      continue;
    }

    if (c === '"') {
      adv();
      const bytes = [];
      while (peek() !== '"') {
        if (peek() === undefined || peek() === '\n')
          throw new CompileError('незакрытая строка — не хватает закрывающей кавычки "', { line: tl, col: tc, len: 1 },
            'Строка должна начинаться и заканчиваться двойной кавычкой " на одной строке. Для переноса строки внутри текста используйте \\n.');
        if (peek() === '\\') { bytes.push(readEscape()); continue; }
        const cp = src.codePointAt(i);
        adv(cp > 0xffff ? 2 : 1);
        // кодируем в UTF-8 как настоящий компилятор
        const enc = new TextEncoder().encode(String.fromCodePoint(cp));
        for (const b of enc) bytes.push(b);
      }
      adv();
      toks.push({ type: 'str', value: bytes, line: tl, col: tc, start, end: i });
      continue;
    }

    let matched = null;
    for (const op of OPS) if (src.startsWith(op, i)) { matched = op; break; }
    if (matched) {
      adv(matched.length);
      toks.push({ type: 'op', value: matched, line: tl, col: tc, start, end: i });
      continue;
    }

    if (SMART[c]) {
      err(`недопустимый символ '${c}'`,
        `Похоже, код скопирован из Word или PDF. Замените '${c}' на обычный символ '${SMART[c]}'.`);
    }
    if (/[А-Яа-яЁё]/.test(c))
      err(`недопустимый символ '${c}' вне строки`,
        'Русский текст можно писать только внутри строк "..." или в комментариях /* ... */. Возможно, клавиатура переключена на русскую раскладку.');
    err(`недопустимый символ '${c}'`, 'Удалите этот символ — он не используется в языке C.');
  }
  toks.push({ type: 'eof', value: '', line, col, start: i, end: i });
  return toks;
}

/** Препроцессор: #include, #define (в том числе с параметрами), #undef, #ifdef/#ifndef/#if/#elif/#else/#endif. */
export function preprocess(tokens, knownHeaders) {
  const out = [];
  const includes = [];
  const defines = new Map();
  const directives = [];
  const cond = []; // стек условной компиляции: { active, taken, parentActive }
  const active = () => cond.every(c => c.active);

  const macroTokens = (body, tk) => {
    try {
      return tokenize(body, { macro: true }).filter(t => t.type !== 'eof');
    } catch (e) {
      if (e.diag) { e.diag.line = tk.line; e.diag.col = tk.col; }
      throw e;
    }
  };

  // ——— подстановка макросов ———
  const srcText = (toks) => toks.map(t => t.type === 'str' ? JSON.stringify(String.fromCharCode(...t.value)) : t.type === 'char' ? `'${String.fromCharCode(t.value)}'` : t.value).join(' ');

  function expandList(list, hide, depth, site) {
    const res = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.type === 'id' && defines.has(t.value) && !hide.has(t.value) && depth < 64) {
        const m = defines.get(t.value);
        if (m.params) {
          // вызов макроса-функции: собрать аргументы
          if (!(list[i + 1] && list[i + 1].type === 'op' && list[i + 1].value === '(')) { res.push(t); continue; }
          let j = i + 2, level = 0;
          const args = [[]];
          for (; j < list.length; j++) {
            const a = list[j];
            if (a.type === 'op' && a.value === '(') level++;
            if (a.type === 'op' && a.value === ')') { if (level === 0) break; level--; }
            if (a.type === 'op' && a.value === ',' && level === 0) { args.push([]); continue; }
            args[args.length - 1].push(a);
          }
          if (j >= list.length)
            throw new CompileError(`незакрытый вызов макроса ${m.name}(`, { line: site.line, col: site.col, len: m.name.length }, 'Проверьте закрывающую скобку у вызова макроса.');
          if (args.length === 1 && args[0].length === 0 && m.params.length === 0) args.length = 0;
          if (args.length !== m.params.length && !(m.variadic && args.length >= m.params.length))
            throw new CompileError(`макрос ${m.name} ожидает ${m.params.length} аргумент(ов), передано ${args.length}`, { line: site.line, col: site.col, len: m.name.length }, `Определение: #define ${m.name}(${m.params.join(', ')}) ${m.text}`);
          const argMap = new Map(m.params.map((p, k) => [p, args[k] || []]));
          if (m.variadic) argMap.set('__VA_ARGS__', args.slice(m.params.length).flatMap((a, k) => (k ? [{ type: 'op', value: ',' }, ...a] : a)));
          // подстановка параметров с учётом # и ##
          const body = [];
          const b = m.tokens;
          for (let k = 0; k < b.length; k++) {
            const bt = b[k];
            if (bt.type === 'op' && bt.value === '#' && b[k + 1] && argMap.has(b[k + 1].value)) {
              const txt = srcText(argMap.get(b[k + 1].value));
              body.push({ type: 'str', value: [...new TextEncoder().encode(txt)] });
              k++;
              continue;
            }
            if (bt.type === 'id' && argMap.has(bt.value)) {
              const pasteNext = b[k + 1] && b[k + 1].value === '##';
              const pastePrev = body.length && body[body.length - 1].paste;
              const raw = argMap.get(bt.value);
              body.push(...(pasteNext || pastePrev ? raw : expandList(raw, hide, depth + 1, site)).map(x => ({ ...x })));
              continue;
            }
            if (bt.type === 'op' && bt.value === '##') {
              const prev = body.pop();
              const next = b[k + 1];
              k++;
              if (!prev || !next) continue;
              const nextToks = next.type === 'id' && argMap.has(next.value) ? argMap.get(next.value) : [next];
              const joined = String(prev.value) + String(nextToks[0]?.value ?? '');
              const re = tokenize(joined).filter(x => x.type !== 'eof');
              body.push(...re, ...nextToks.slice(1));
              continue;
            }
            body.push({ ...bt });
          }
          const h2 = new Set(hide); h2.add(m.name);
          res.push(...expandList(body, h2, depth + 1, site));
          i = j;
          continue;
        }
        const h2 = new Set(hide); h2.add(t.value);
        res.push(...expandList(m.tokens.map(x => ({ ...x })), h2, depth + 1, site));
        continue;
      }
      res.push(t);
    }
    return res;
  }

  // ——— вычисление #if ———
  function evalIf(text, tk) {
    const expr = text.replace(/defined\s*\(\s*([A-Za-z_]\w*)\s*\)|defined\s+([A-Za-z_]\w*)/g, (_, a, b) => (defines.has(a || b) ? '1' : '0'));
    let toks = expandList(tokenize(expr).filter(t => t.type !== 'eof'), new Set(), 0, tk);
    toks = toks.map(t => (t.type === 'id' ? { type: 'num', value: '0' } : t));
    const js = toks.map(t => (t.type === 'num' ? String(parseInt(t.value)) : t.type === 'char' ? String(t.value) : t.value)).join(' ');
    if (!/^[\d\s+\-*/%()<>=!&|^~?:]*$/.test(js)) throw new CompileError('непонятное условие в #if', { line: tk.line, col: tk.col, len: 3 });
    try { return !!Function(`"use strict"; return (${js || 0});`)(); }
    catch { throw new CompileError('ошибка в выражении #if', { line: tk.line, col: tk.col, len: 3 }); }
  }

  for (let idx = 0; idx < tokens.length; idx++) {
    const tk = tokens[idx];
    if (tk.type !== 'directive') {
      if (!active()) continue;
      if (tk.type === 'id' && defines.has(tk.value)) {
        // соберём хвост, если это вызов макроса-функции
        const m = defines.get(tk.value);
        let chunk = [tk];
        if (m.params) {
          let j = idx + 1;
          if (tokens[j] && tokens[j].type === 'op' && tokens[j].value === '(') {
            let level = 0;
            for (; j < tokens.length; j++) {
              const a = tokens[j];
              if (a.type === 'directive' || a.type === 'eof') break;
              chunk.push(a);
              if (a.type === 'op' && a.value === '(') level++;
              if (a.type === 'op' && a.value === ')') { level--; if (level === 0) break; }
            }
            idx = j;
          }
        }
        const exp = expandList(chunk, new Set(), 0, tk);
        // повторная подстановка: результат может заканчиваться именем макроса-функции
        for (const t of exp) out.push({ ...t, line: tk.line, col: tk.col, start: tk.start, end: tokens[idx].end ?? tk.end, fromMacro: tk.value });
        continue;
      }
      if (tk.type === 'id' && tk.value === '__LINE__') { out.push({ ...tk, type: 'num', value: String(tk.line), suffix: '', isFloat: false }); continue; }
      out.push(tk);
      continue;
    }
    const text = tk.value;
    const pos = { line: tk.line, col: tk.col, len: text.length + 1 };
    let m;
    // условная компиляция обрабатывается всегда
    if ((m = /^(ifdef|ifndef)\s+([A-Za-z_]\w*)/.exec(text))) {
      const val = defines.has(m[2]) === (m[1] === 'ifdef');
      cond.push({ active: val, taken: val });
      continue;
    }
    if ((m = /^if\s+(.*)$/.exec(text))) {
      const val = active() ? evalIf(m[1], tk) : false;
      cond.push({ active: val, taken: val });
      continue;
    }
    if ((m = /^elif\s+(.*)$/.exec(text))) {
      const c = cond[cond.length - 1];
      if (!c) throw new CompileError('#elif без #if', pos);
      if (c.taken) c.active = false;
      else { cond.pop(); const v = active() ? evalIf(m[1], tk) : false; cond.push({ active: v, taken: v }); }
      continue;
    }
    if (/^else\b/.test(text)) {
      const c = cond[cond.length - 1];
      if (!c) throw new CompileError('#else без #if', pos, 'Каждый #else должен относиться к #if, #ifdef или #ifndef.');
      c.active = !c.taken;
      c.taken = true;
      continue;
    }
    if (/^endif\b/.test(text)) {
      if (!cond.length) throw new CompileError('#endif без #if', pos);
      cond.pop();
      continue;
    }
    if (!active()) continue;

    if ((m = /^include\s*([<"])\s*([^>"]+?)\s*[>"]\s*$/.exec(text))) {
      const name = m[2];
      if (!knownHeaders[name]) {
        const hint = name === 'conio.h'
          ? 'conio.h существует только в Windows-компиляторах (getch, clrscr) и не входит в стандарт C. Уберите эту строку.'
          : name === 'iostream'
            ? 'iostream — это библиотека C++, а не C. В языке C используйте #include <stdio.h> и функции printf/scanf.'
            : `Известные библиотеки: ${Object.keys(knownHeaders).map(h => '<' + h + '>').join(', ')}. Проверьте название на опечатки.`;
        throw new CompileError(`${name}: нет такого файла или каталога`, pos, hint);
      }
      if (!includes.some(x => x.name === name)) includes.push({ name, line: tk.line, col: tk.col });
      directives.push({ kind: 'include', name, line: tk.line });
      continue;
    }
    if (/^include\b/.test(text))
      throw new CompileError('#include ожидает <имя_файла> или "имя_файла"', pos, 'Пример правильной записи: #include <stdio.h>');
    if ((m = /^define\s+([A-Za-z_]\w*)(\(([^)]*)\))?\s*(.*)$/.exec(text))) {
      const name = m[1];
      const body = (m[4] || '').trim();
      let params = null, variadic = false;
      if (m[2] !== undefined && text.slice(7 + name.length).trimStart().startsWith('(') && /^define\s+[A-Za-z_]\w*\(/.test(text)) {
        params = m[3].split(',').map(x => x.trim()).filter(Boolean);
        if (params[params.length - 1] === '...') { params.pop(); variadic = true; }
        for (const p of params) if (!/^[A-Za-z_]\w*$/.test(p)) throw new CompileError(`неверный параметр макроса «${p}»`, pos);
      } else if (m[2] !== undefined) {
        // #define X (1+2) — пробел перед скобкой: это обычный макрос
        const rest = text.replace(/^define\s+[A-Za-z_]\w*/, '').trim();
        defines.set(name, { name, text: rest, tokens: macroTokens(rest, tk), line: tk.line });
        directives.push({ kind: 'define', name, text: rest, line: tk.line });
        continue;
      }
      defines.set(name, { name, text: body, tokens: macroTokens(body, tk), line: tk.line, params, variadic });
      directives.push({ kind: 'define', name, text: body, params, line: tk.line });
      continue;
    }
    if ((m = /^undef\s+([A-Za-z_]\w*)/.exec(text))) { defines.delete(m[1]); continue; }
    if ((m = /^error\s*(.*)$/.exec(text))) throw new CompileError(`#error ${m[1]}`, pos);
    if (/^(pragma|line|warning)\b/.test(text) || text === '') continue;
    throw new CompileError(`неизвестная директива препроцессора #${text.split(/\s/)[0]}`, pos,
      'Поддерживаются #include, #define, #undef, #ifdef, #ifndef, #if, #elif, #else, #endif.');
  }
  if (cond.length) throw new CompileError('не хватает #endif', { line: tokens[tokens.length - 1].line, col: 1, len: 1 }, 'Каждый #if/#ifdef/#ifndef закрывается директивой #endif.');
  return { tokens: out, includes, defines, directives };
}
