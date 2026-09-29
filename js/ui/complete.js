// Подсказки при наборе: «sca» → серый хвост «nf(» и список вариантов.
// → (стрелка вправо) — принять, ↑/↓ — выбрать другой вариант, Esc — скрыть.
import { HEADERS } from '../compiler/stdlib.js';

const KW = [
  ['int', 'int ', 'целое число, 4 байта'],
  ['long', 'long ', 'длинное целое, 8 байт'],
  ['char', 'char ', 'символ, 1 байт'],
  ['float', 'float ', 'дробное, 4 байта'],
  ['double', 'double ', 'дробное двойной точности, 8 байт'],
  ['short', 'short ', 'короткое целое, 2 байта'],
  ['unsigned', 'unsigned ', 'без знака: только ≥ 0'],
  ['signed', 'signed ', 'со знаком'],
  ['void', 'void', 'нет значения'],
  ['const', 'const ', 'значение нельзя менять'],
  ['static', 'static ', 'живёт всю программу'],
  ['struct', 'struct ', 'структура: несколько полей вместе'],
  ['typedef', 'typedef ', 'новое имя для типа'],
  ['enum', 'enum ', 'перечисление именованных констант'],
  ['sizeof', 'sizeof(', 'размер в байтах'],
  ['return', 'return ', 'вернуть значение из функции'],
  ['if', 'if (', 'ветвление: если условие истинно'],
  ['else', 'else ', 'иначе'],
  ['for', 'for (', 'цикл со счётчиком'],
  ['while', 'while (', 'цикл с предусловием'],
  ['do', 'do {', 'цикл с постусловием'],
  ['switch', 'switch (', 'выбор по значению'],
  ['case', 'case ', 'метка в switch'],
  ['default', 'default:', 'метка «иначе» в switch'],
  ['break', 'break;', 'выйти из цикла или switch'],
  ['continue', 'continue;', 'перейти к следующей итерации'],
  ['goto', 'goto ', 'переход к метке'],
  ['main', 'main(void) {', 'главная функция программы'],
  ['#include', '#include <', 'подключить библиотеку'],
  ['#define', '#define ', 'символическая константа'],
];

let base = null;
function dictionary() {
  if (base) return base;
  base = KW.map(([w, ins, d]) => ({ w, ins, d, kind: w.startsWith('#') ? 'pp' : 'kw' }));
  for (const [h, info] of Object.entries(HEADERS)) {
    for (const [name, f] of Object.entries(info.funcs || {})) {
      const noArgs = f.params && f.params.length === 0 && !f.variadic;
      base.push({ w: name, ins: name + (noArgs ? '()' : '('), d: f.desc || '', kind: 'fn', h });
    }
    for (const name of Object.keys(info.consts || {})) base.push({ w: name, ins: name, d: `константа из ${h}`, kind: 'const', h });
    for (const name of Object.keys(info.types || {})) base.push({ w: name, ins: name + ' ', d: `тип из ${h}`, kind: 'type', h });
  }
  return base;
}

/** Имена из самого кода: переменные, функции, макросы. */
function localNames(src) {
  const out = new Map();
  const strip = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gm, ' ');
  const decl = /\b(?:int|long|short|char|float|double|unsigned|signed|_Bool|bool|size_t|FILE|struct\s+\w+|[A-Z]\w*)\s*\**\s*([A-Za-z_]\w*)\s*(\(|\[|=|;|,)/g;
  let m;
  while ((m = decl.exec(strip))) {
    if (!out.has(m[1])) out.set(m[1], m[2] === '(' ? 'fn' : 'var');
  }
  const more = /,\s*\**\s*([A-Za-z_]\w*)\s*(?=[=,;\[])/g;
  while ((m = more.exec(strip))) if (!out.has(m[1])) out.set(m[1], 'var');
  const def = /#define\s+([A-Za-z_]\w*)/g;
  while ((m = def.exec(strip))) out.set(m[1], 'macro');
  return [...out].map(([w, k]) => ({ w, ins: w + (k === 'fn' ? '(' : ''), d: k === 'fn' ? 'ваша функция' : k === 'macro' ? 'ваша константа' : 'ваша переменная', kind: 'own' }));
}

export function suggest(src, pos) {
  const before = src.slice(0, pos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const line = before.slice(lineStart);
  // внутри #include <...> — имена заголовков
  const inc = line.match(/^\s*#\s*include\s*<([\w.]*)$/);
  if (inc) {
    const p = inc[1];
    return { prefix: p, items: Object.entries(HEADERS).filter(([h]) => h.startsWith(p) && h !== p).map(([h, i]) => ({ w: h, ins: h + '>', d: i.title, kind: 'hdr' })).slice(0, 6) };
  }
  // в строке или комментарии не подсказываем
  const quotes = (line.replace(/\\./g, '').match(/"/g) || []).length;
  if (quotes % 2 === 1 || /\/\//.test(line)) return null;
  const m = line.match(/#?[A-Za-z_]\w*$/);
  if (!m) return null;
  const prefix = m[0];
  if (prefix.length < 2) return null;
  const after = src.slice(pos, pos + 1);
  if (/\w/.test(after)) return null;
  const seen = new Set();
  const items = [];
  const add = (it) => { if (seen.has(it.w) || it.w === prefix || !it.w.startsWith(prefix)) return; seen.add(it.w); items.push(it); };
  localNames(src.slice(0, lineStart) + src.slice(pos)).forEach(add);
  dictionary().forEach(add);
  // сначала точное начало с учётом частоты: короткие и «свои» выше
  const rank = { own: 0, kw: 1, pp: 1, fn: 2, type: 3, const: 4 };
  items.sort((a, b) => (rank[a.kind] - rank[b.kind]) || (a.w.length - b.w.length));
  return items.length ? { prefix, items: items.slice(0, 6) } : null;
}

const KIND_LABEL = { own: 'ваше', kw: 'слово', pp: 'директива', fn: 'функция', type: 'тип', const: 'конст.', hdr: 'библиотека' };
export const kindLabel = (k) => KIND_LABEL[k] || '';
