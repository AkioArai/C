// Быстрые исправления: по сообщению компилятора предлагает готовую правку кода.
// fixFor(source, diag) → { title, edits: [{ line, col, del, ins }] } или null.
// line и col считаются с единицы; del — сколько символов убрать, ins — что вставить.
// Правка с line: 0 означает «вставить новую строку в начало файла».

const TYPES = ['int', 'char', 'float', 'double', 'long', 'short', 'unsigned', 'void', 'signed'];

/** Спецификаторы строки формата на этой строке кода: [{ col, len, text }]. */
function specsOf(src) {
  const q = src.indexOf('"');
  if (q < 0) return null;
  let end = q + 1;
  while (end < src.length && src[end] !== '"') end += src[end] === '\\' ? 2 : 1;
  const out = [];
  const re = /%(?:[-+ #0]*)(?:\d+|\*)?(?:\.(?:\d+|\*))?(?:hh|h|ll|l|L|z)?[a-zA-Z%]/g;
  const body = src.slice(q + 1, end);
  let m;
  while ((m = re.exec(body))) if (m[0] !== '%%') out.push({ col: q + 2 + m.index, len: m[0].length, text: m[0] });
  return { specs: out, end };
}

/** Номер аргумента (с нуля), в который попадает столбец col: считаем запятые после строки формата. */
function argIndex(src, strEnd, col) {
  let depth = 0, n = -1;
  for (let i = strEnd + 1; i < Math.min(src.length, col - 1); i++) {
    const ch = src[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) n++;
  }
  return n;
}

export function fixFor(source, d) {
  if (!d || !d.line) return null;
  const lines = source.split('\n');
  const src = lines[d.line - 1] ?? '';
  const msg = d.message, hint = d.hint || '';
  const one = (title, col, del, ins, line = d.line) => ({ title, edits: [{ line, col, del, ins }] });

  // ——— не хватает символа ———
  if (/^ожидалась ';'/.test(msg)) return one('вставить «;»', d.col, 0, ';');
  if (/^ожидалась '\)' перед/.test(msg)) {
    const before = (msg.match(/перед «(.*)»/) || [])[1] || '';
    // перед именем или числом скобка обычно ни при чём — пропущена запятая между аргументами
    if (/^[\w"'&*(-]/.test(before) && !/^(return|if|else|for|while|do|int|double|float|char)$/.test(before)) {
      const at = d.col - 1, prev = src.slice(0, at).trimEnd().length;
      return one('вставить запятую', prev + 1, 0, ',');
    }
    const prev = src.slice(0, d.col - 1).trimEnd().length;
    return one('вставить «)»', prev + 1, 0, ')');
  }
  if (/^ожидалась '\}' в конце файла/.test(msg)) {
    let last = lines.length;
    while (last > 1 && !lines[last - 1].trim()) last--;
    return one('добавить «}» в конец', lines[last - 1].length + 1, 0, '\n}', last);
  }
  if (/^незакрытая строка/.test(msg)) {
    const m = src.match(/(\s*\)*\s*;?\s*)$/);
    const at = src.length - (m ? m[1].length : 0);
    return one('закрыть кавычку', at + 1, 0, '"');
  }
  if (/в одинарных кавычках должен быть один символ/.test(msg)) {
    const a = src.indexOf("'"), b = a < 0 ? -1 : src.indexOf("'", a + 1);
    if (a >= 0 && b > a) return { title: 'заменить кавычки на двойные', edits: [{ line: d.line, col: b + 1, del: 1, ins: '"' }, { line: d.line, col: a + 1, del: 1, ins: '"' }] };
  }

  // ——— scanf, условия, пустое тело ———
  if (d.code === 'scanf-noaddr') return one('добавить «&»', d.col, 0, '&');
  if (d.code === 'assign-cond') {
    const seg = src.slice(d.col - 1);
    const m = seg.match(/[^=!<>+\-*/%&|^]=(?!=)/);
    if (m) return one('заменить «=» на «==»', d.col + m.index + 1, 1, '==');
  }
  if (d.code === 'empty-body' && src[d.col - 1] === ';') return one('убрать лишнюю «;»', d.col, 1, '');

  // ——— библиотеки ———
  if (d.code === 'implicit-decl') {
    const h = (hint.match(/#include <([\w.]+)>/) || [])[1];
    if (h) {
      let after = 0;
      lines.forEach((l, i) => { if (/^\s*#\s*include/.test(l)) after = i + 1; });
      return after
        ? one(`подключить <${h}>`, lines[after - 1].length + 1, 0, `\n#include <${h}>`, after)
        : one(`подключить <${h}>`, 1, 0, `#include <${h}>\n\n`, 1);
    }
  }
  if (/подключена, но не используется/.test(msg)) return { title: 'убрать строку', edits: [{ line: d.line, col: 1, del: src.length + 1, ins: '' }] };

  // ——— спецификаторы формата ———
  if (d.code === 'printf-type' || d.code === 'scanf-type') {
    const want = (hint.match(/спользуйте (%[a-zA-Z]+)/) || [])[1];
    const bad = (msg.match(/формат «(%[^»]+)»/) || [])[1];
    const f = specsOf(src);
    if (want && bad && f) {
      const k = argIndex(src, f.end, d.col);
      const cands = f.specs.filter(s => s.text === bad);
      const sp = (f.specs[k] && f.specs[k].text === bad) ? f.specs[k] : cands.length === 1 ? cands[0] : null;
      if (sp) {
        // сохраняем ширину и точность: %5d → %5f; при переходе к целому точность убираем
        const flags = sp.text.slice(1).replace(/(?:hh|h|ll|l|L|z)?[a-zA-Z]$/, '');
        const keep = /d|i|c|u/.test(want) ? flags.replace(/\..*$/, '') : flags;
        return one(`заменить ${bad} на %${keep}${want.slice(1)}`, sp.col, sp.len, '%' + keep + want.slice(1));
      }
    }
  }

  // ——— имена ———
  const sug = (hint.match(/имели в виду «([^»]+)»/) || [])[1];
  if (sug && (d.code === 'undeclared-fn' || d.code === 'undeclared')) return one(`заменить на «${sug}»`, d.col, d.len, sug);
  if (d.code === 'undeclared' && /^«(\w+)» не объявлена/.test(msg) && !/C\+\+/.test(hint)) {
    const name = msg.match(/^«(\w+)»/)[1];
    const indent = (src.match(/^\s*/) || [''])[0];
    return one(`объявить: int ${name};`, 1, 0, `${indent}int ${name};\n`);
  }
  const ty = (msg.match(/^неизвестный тип «(\w+)»/) || [])[1];
  if (ty && TYPES.includes(ty.toLowerCase())) return one(`заменить на «${ty.toLowerCase()}»`, d.col, d.len, ty.toLowerCase());
  if (/main возвращает int, а не void/.test(msg)) {
    const i = src.indexOf('void');
    if (i >= 0) return one('заменить void на int', i + 1, 4, 'int');
  }

  // ——— вещественные числа ———
  if (d.code === 'float-eq') {
    const seg = src.slice(d.col - 1, d.col - 1 + d.len);
    const m = seg.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
    if (m && !/[()]/.test(m[1] + m[3])) {
      const edits = [{ line: d.line, col: d.col, del: d.len, ins: `fabs(${m[1].trim()} - ${m[3].trim()}) ${m[2] === '==' ? '<' : '>='} 1e-9` }];
      if (!/^\s*#\s*include\s*<math\.h>/m.test(source)) {
        let after = 0;
        lines.forEach((l, i) => { if (/^\s*#\s*include/.test(l)) after = i + 1; });
        if (after) edits.push({ line: after, col: lines[after - 1].length + 1, del: 0, ins: '\n#include <math.h>' });
      }
      return { title: 'сравнить через fabs(…) < eps', edits };
    }
  }
  if (d.code === 'int-div') {
    const seg = src.slice(d.col - 1, d.col - 1 + d.len);
    const m = seg.match(/^(\d+)(\s*\/)/);
    if (m) return one(`сделать деление вещественным: ${m[1]}.0`, d.col + m[1].length, 0, '.0');
    return one('привести к double', d.col, 0, '(double)');
  }
  return null;
}

/** Применить правку к тексту программы. */
export function applyFix(source, fix) {
  const lines = source.split('\n');
  // правки одной строки применяем справа налево, чтобы столбцы не съезжали
  const edits = [...fix.edits].sort((a, b) => b.line - a.line || b.col - a.col);
  for (const e of edits) {
    const i = e.line - 1;
    if (i < 0 || i >= lines.length) continue;
    const s = lines[i], at = Math.max(0, Math.min(s.length, e.col - 1));
    if (e.del > s.length - at) {
      // удаление захватывает перевод строки — строка убирается целиком
      lines.splice(i, 1, ...(s.slice(0, at) + e.ins).split('\n').filter((x, k, a) => !(a.length === 1 && x === '')));
    } else lines.splice(i, 1, ...(s.slice(0, at) + e.ins + s.slice(at + e.del)).split('\n'));
  }
  return lines.join('\n');
}

/**
 * «Исправить всё»: по очереди применяет исправления ошибок, пока они есть.
 * compile — функция компиляции (передаётся снаружи, чтобы модуль не зависел от index.js).
 * Возвращает { source, applied: [названия] }.
 */
export function fixAll(source, compile, onlyErrors = true, limit = 25) {
  const applied = [];
  let prevKey = '';
  for (let i = 0; i < limit; i++) {
    const c = compile(source);
    const ds = c.diagnostics.filter(d => (onlyErrors ? d.severity === 'error' : d.severity !== 'note') || FIX_WARN.has(d.code));
    let done = false;
    for (const d of ds) {
      const f = fixFor(source, d);
      if (!f) continue;
      const next = applyFix(source, f);
      const key = d.line + ':' + d.col + ':' + d.message;
      if (next === source || key === prevKey) continue;
      prevKey = key;
      source = next;
      applied.push(`строка ${d.line}: ${f.title}`);
      done = true;
      break;
    }
    if (!done) break;
  }
  return { source, applied };
}
// предупреждения, которые почти наверняка ошибка новичка — их «Исправить всё» тоже чинит
const FIX_WARN = new Set(['scanf-noaddr', 'assign-cond', 'empty-body', 'printf-type', 'scanf-type']);
