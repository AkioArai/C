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
export function tokenize(src) {
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

/** Препроцессор: обрабатывает #include и #define, подставляет макросы. */
export function preprocess(tokens, knownHeaders) {
  const out = [];
  const includes = [];
  const defines = new Map();
  const directives = [];

  for (const tk of tokens) {
    if (tk.type !== 'directive') {
      if (tk.type === 'id' && defines.has(tk.value)) {
        const seen = new Set();
        const expand = (t, depth) => {
          if (t.type === 'id' && defines.has(t.value) && !seen.has(t.value) && depth < 32) {
            seen.add(t.value);
            for (const r of defines.get(t.value).tokens) expand(r, depth + 1);
            seen.delete(t.value);
          } else {
            out.push({ ...t, line: tk.line, col: tk.col, start: tk.start, end: tk.end, fromMacro: tk.value });
          }
        };
        expand(tk, 0);
        continue;
      }
      out.push(tk);
      continue;
    }
    const text = tk.value;
    const pos = { line: tk.line, col: tk.col, len: text.length + 1 };
    let m;
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
      throw new CompileError('#include ожидает <имя_файла> или "имя_файла"', pos,
        'Пример правильной записи: #include <stdio.h>');
    if ((m = /^define\s+([A-Za-z_]\w*)(\(?)(.*)$/.exec(text))) {
      const name = m[1];
      if (m[2] === '(')
        throw new CompileError(`макрос-функция ${name}(...) пока не поддерживается`, pos,
          'Используйте обычную функцию вместо макроса с параметрами.');
      const body = m[3].trim();
      let btoks;
      try {
        btoks = tokenize(body).filter(t => t.type !== 'eof');
      } catch (e) {
        if (e.diag) { e.diag.line = tk.line; e.diag.col = tk.col; }
        throw e;
      }
      defines.set(name, { name, text: body, tokens: btoks, line: tk.line });
      directives.push({ kind: 'define', name, text: body, line: tk.line });
      continue;
    }
    if ((m = /^undef\s+([A-Za-z_]\w*)/.exec(text))) { defines.delete(m[1]); continue; }
    if (/^pragma\b/.test(text) || text === '') continue;
    throw new CompileError(`неизвестная директива препроцессора #${text.split(/\s/)[0]}`, pos,
      'Поддерживаются директивы #include и #define.');
  }
  return { tokens: out, includes, defines, directives };
}
