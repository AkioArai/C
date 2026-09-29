// Движок автодополнения: слова, шаблоны с полями, спецификаторы формата, escape-последовательности,
// поля структур, имена заголовков и подсказка параметров функции.
import { HEADERS } from '../compiler/stdlib.js';
import { typeName } from '../compiler/types.js';
import { parseFormat, describeSpec } from '../compiler/format.js';
import { store } from '../store.js';

// ——— ключевые слова ———
const KW = [
  ['int', 'int ', 'целое число, 4 байта'], ['long', 'long ', 'длинное целое, 8 байт'], ['char', 'char ', 'символ, 1 байт'],
  ['float', 'float ', 'дробное, 4 байта'], ['double', 'double ', 'дробное двойной точности, 8 байт'], ['short', 'short ', 'короткое целое, 2 байта'],
  ['unsigned', 'unsigned ', 'без знака: только ≥ 0'], ['signed', 'signed ', 'со знаком'], ['void', 'void', 'нет значения'],
  ['const', 'const ', 'значение нельзя менять'], ['static', 'static ', 'живёт всю программу'], ['struct', 'struct ', 'структура: несколько полей вместе'],
  ['typedef', 'typedef ', 'новое имя для типа'], ['enum', 'enum ', 'перечисление именованных констант'], ['union', 'union ', 'объединение: поля на одном месте'],
  ['sizeof', 'sizeof($1)', 'размер в байтах'], ['return', 'return ', 'вернуть значение из функции'], ['else', 'else ', 'иначе'],
  ['case', 'case $1:', 'метка в switch'], ['default', 'default:', 'метка «иначе» в switch'], ['break', 'break;', 'выйти из цикла или switch'],
  ['continue', 'continue;', 'перейти к следующей итерации'], ['goto', 'goto ', 'переход к метке'], ['extern', 'extern ', 'объявлено в другом месте'],
  ['NULL', 'NULL', 'нулевой указатель'], ['true', 'true', 'истина (stdbool.h)'], ['false', 'false', 'ложь (stdbool.h)'],
];

// ——— шаблоны: $1, ${1:текст} — поля, $0 — где окажется курсор в конце; \t — отступ ———
const SNIPPETS = [
  ['main', 'int main(void) {\n\t$0\n\treturn 0;\n}', 'главная функция программы'],
  ['for', 'for (int ${1:i} = 0; ${2:i < n}; ${3:i++}) {\n\t$0\n}', 'цикл со счётчиком'],
  ['fori', 'for (int i = 0; i < ${1:n}; i++) {\n\t$0\n}', 'цикл i от 0 до n−1'],
  ['forr', 'for (int i = ${1:n} - 1; i >= 0; i--) {\n\t$0\n}', 'цикл в обратную сторону'],
  ['while', 'while (${1:условие}) {\n\t$0\n}', 'цикл с предусловием'],
  ['do', 'do {\n\t$0\n} while (${1:условие});', 'цикл с постусловием'],
  ['if', 'if (${1:условие}) {\n\t$0\n}', 'ветвление'],
  ['ife', 'if (${1:условие}) {\n\t$2\n} else {\n\t$0\n}', 'if с веткой else'],
  ['elif', 'else if (${1:условие}) {\n\t$0\n}', 'ещё одна проверка'],
  ['switch', 'switch (${1:x}) {\ncase ${2:1}:\n\t$3\n\tbreak;\ndefault:\n\t$0\n}', 'выбор по значению'],
  ['printf', 'printf("${1:%d}\\n", ${2:x});$0', 'вывод с форматом и переводом строки'],
  ['pf', 'printf("${1:%d}\\n", ${2:x});$0', 'printf — коротко'],
  ['scanf', 'scanf("${1:%d}", &${2:x});$0', 'ввод по адресу переменной'],
  ['sf', 'scanf("${1:%d}", &${2:x});$0', 'scanf — коротко'],
  ['inc', '#include <${1:stdio.h}>$0', 'подключить библиотеку'],
  ['incs', '#include <stdio.h>\n#include <stdlib.h>\n#include <math.h>\n$0', 'три частые библиотеки'],
  ['def', '#define ${1:N} ${2:10}$0', 'символическая константа'],
  ['struct', 'struct ${1:Point} {\n\t${2:int x;}\n};$0', 'объявление структуры'],
  ['typedef', 'typedef struct {\n\t${2:int x;}\n} ${1:Point};$0', 'структура с новым именем типа'],
  ['func', '${1:int} ${2:f}(${3:int x}) {\n\t$0\n\treturn ${4:0};\n}', 'новая функция'],
  ['malloc', '${1:int} *${2:a} = malloc(${3:n} * sizeof(${4:int}));$0', 'динамический массив'],
  ['arr', '${1:int} ${2:a}[${3:10}];$0', 'массив'],
  ['fopen', 'FILE *${1:f} = fopen("${2:data.txt}", "${3:r}");\nif (${1:f} == NULL) return 1;$0', 'открыть файл с проверкой'],
  ['ret', 'return ${1:0};$0', 'вернуть значение'],
];

const FORMATS = [
  ['%d', 'int — целое число'], ['%lf', 'double (в scanf обязательно %lf)'], ['%f', 'float/double — дробное, 6 знаков'], ['%.2f', 'дробное с 2 знаками после точки'],
  ['%c', 'char — один символ'], ['%s', 'строка до \\0'], ['%ld', 'long'], ['%lld', 'long long'], ['%u', 'unsigned int'], ['%lu', 'unsigned long, size_t'],
  ['%i', 'int (в scanf понимает 0x и 0)'], ['%e', 'экспоненциальная запись'], ['%g', 'короткая запись дробного'], ['%x', 'шестнадцатеричное'], ['%o', 'восьмеричное'],
  ['%p', 'адрес (указатель)'], ['%5d', 'целое шириной 5 (выравнивание вправо)'], ['%-5d', 'целое шириной 5, влево'], ['%05d', 'целое шириной 5 с нулями'], ['%%', 'сам знак %'],
];
const ESCAPES = [['\\n', 'перевод строки'], ['\\t', 'табуляция'], ['\\\\', 'обратная косая черта'], ['\\"', 'кавычка'], ["\\'", 'апостроф'], ['\\0', 'нулевой символ — конец строки']];

// ——— частота использования: чем чаще выбирали, тем выше ———
let usage = store.get('ac.usage', {});
export function recordUse(label) { usage[label] = (usage[label] || 0) + 1; store.set('ac.usage', usage); }

let dict = null;
function dictionary() {
  if (dict) return dict;
  dict = KW.map(([w, ins, d]) => ({ label: w, insert: ins, desc: d, kind: 'kw' }));
  for (const [h, info] of Object.entries(HEADERS)) {
    for (const [name, f] of Object.entries(info.funcs || {})) {
      const noArgs = f.params && f.params.length === 0 && !f.variadic;
      dict.push({ label: name, insert: name + (noArgs ? '()' : '($1)'), desc: f.desc || '', kind: 'fn', detail: sigText(name, f), header: h });
    }
    for (const [name, c] of Object.entries(info.consts || {})) dict.push({ label: name, insert: name, desc: c.desc || `константа из ${h}`, kind: 'const', header: h });
    for (const name of Object.keys(info.types || {})) dict.push({ label: name, insert: name + ' ', desc: `тип из ${h}`, kind: 'type', header: h });
  }
  return dict;
}
function sigText(name, f) {
  const ps = (f.params || []).map((p) => (p ? typeName(p) : '?'));
  if (f.variadic) ps.push('...');
  return `${f.ret ? typeName(f.ret) : 'int'} ${name}(${ps.join(', ') || 'void'})`;
}

const stripCode = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gm, (m) => ' '.repeat(m.length));

/** Имена из самого кода: переменные (с типом), функции, макросы, метки enum. */
export function localNames(src) {
  const out = new Map();
  const s = stripCode(src);
  let m;
  const decl = /\b((?:const\s+|unsigned\s+|signed\s+|long\s+|short\s+)*(?:int|long|short|char|float|double|_Bool|bool|size_t|FILE|struct\s+\w+|[A-Z]\w*))\s*(\**)\s*([A-Za-z_]\w*)\s*(\(|\[|=|;|,|\))/g;
  while ((m = decl.exec(s))) {
    const name = m[3];
    if (out.has(name) || KW.some(k => k[0] === name)) continue;
    const isFn = m[4] === '(';
    out.set(name, { label: name, insert: name + (isFn ? '($1)' : ''), kind: isFn ? 'ufn' : 'var', detail: `${m[1]}${m[2] ? ' ' + m[2] : ''}${m[4] === '[' ? '[]' : ''}`, desc: isFn ? 'ваша функция' : 'ваша переменная' });
  }
  const more = /,\s*(\**)\s*([A-Za-z_]\w*)\s*(?=[=,;\[])/g;
  while ((m = more.exec(s))) if (!out.has(m[2])) out.set(m[2], { label: m[2], insert: m[2], kind: 'var', detail: '', desc: 'ваша переменная' });
  const def = /#define\s+([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)/g;
  while ((m = def.exec(src))) out.set(m[1], { label: m[1], insert: m[1] + (m[2] ? '($1)' : ''), kind: 'macro', detail: (m[3] || '').trim().slice(0, 30), desc: 'ваш макрос #define' });
  const en = /enum\s*\w*\s*\{([^}]*)\}/g;
  while ((m = en.exec(s))) for (const part of m[1].split(',')) { const n = part.trim().split(/\s|=/)[0]; if (n) out.set(n, { label: n, insert: n, kind: 'const', detail: 'enum', desc: 'значение перечисления' }); }
  return [...out.values()];
}

/** Поля структуры для var. и var-> */
function membersOf(src, varName) {
  const s = stripCode(src);
  const re = new RegExp(`\\b(struct\\s+\\w+|[A-Za-z_]\\w*)\\s*\\**\\s*\\b${varName}\\b\\s*[\\[;=,)]`);
  const m = s.match(re);
  if (!m) return [];
  const t = m[1].replace(/\s+/g, ' ');
  let body = null;
  const tag = t.startsWith('struct ') ? t.slice(7) : null;
  if (tag) body = s.match(new RegExp(`struct\\s+${tag}\\s*\\{([^}]*)\\}`))?.[1];
  else body = s.match(new RegExp(`typedef\\s+struct\\s*\\w*\\s*\\{([^}]*)\\}\\s*${t}\\s*;`))?.[1];
  if (!body) return [];
  const fields = [];
  for (const d of body.split(';')) {
    const mm = d.trim().match(/^(.*?[\w*\s])\s*([A-Za-z_]\w*(?:\s*\[[^\]]*\])?(?:\s*,\s*\**\s*[A-Za-z_]\w*(?:\s*\[[^\]]*\])?)*)$/);
    if (!mm) continue;
    for (const nm of mm[2].split(',')) { const n = nm.trim().replace(/^\*+/, ''); const base = n.replace(/\s*\[.*$/, ''); if (base) fields.push({ label: base, insert: base, kind: 'field', detail: mm[1].trim() + (n.includes('[') ? '[]' : ''), desc: `поле структуры ${tag || t}` }); }
  }
  return fields;
}

/** Нечёткое совпадение: все буквы запроса по порядку. Возвращает очки и позиции букв. */
function fuzzy(q, label) {
  if (!q) return { score: 1, hits: [] };
  const L = label.toLowerCase(), Q = q.toLowerCase();
  if (L.startsWith(Q)) return { score: 1000 - label.length, hits: [...Array(q.length).keys()] };
  const hits = [];
  let j = 0, score = 400, prev = -2;
  for (let i = 0; i < L.length && j < Q.length; i++) {
    if (L[i] === Q[j]) { hits.push(i); score += i === prev + 1 ? 12 : (i === 0 || '_'.includes(L[i - 1]) ? 8 : -3); prev = i; j++; }
  }
  return j === Q.length ? { score: score - label.length, hits } : null;
}

/** Контекст строки: мы внутри строкового литерала? */
function inString(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '/' && line[i + 1] === '/') return 'comment';
  }
  return q;
}

/**
 * Подсказки для позиции курсора.
 * opts: { fuzzy, snippets, formats, minChars, force }
 * Возвращает { from, to, prefix, items: [{label, insert, kind, desc, detail, hits}] } или null.
 */
export function complete(src, pos, opts = {}) {
  const before = src.slice(0, pos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const line = before.slice(lineStart);
  const after = src.slice(pos, pos + 1);
  // #include <…>
  const inc = line.match(/^\s*#\s*include\s*<([\w./]*)$/);
  if (inc) {
    const p = inc[1];
    const items = Object.entries(HEADERS).map(([h, i]) => ({ label: h, insert: h + (src[pos] === '>' ? '' : '>'), kind: 'hdr', desc: i.title + '. ' + (i.law || ''), f: fuzzy(p, h) })).filter(x => x.f && x.label !== p);
    return pack(items, pos - p.length, pos, p);
  }
  const str = inString(line);
  if (str === 'comment') return null;
  if (str === '"' && opts.formats !== false) {
    // спецификатор после %
    const fm = line.match(/%([-+ #0]*\d*(?:\.\d*)?[a-z]*)$/i);
    if (fm && !/%%$/.test(line)) {
      const p = '%' + fm[1];
      const scanfCtx = /\b(?:scanf|fscanf|sscanf)\s*\(/.test(line);
      let list = FORMATS.map(([f, d], k) => ({ label: f, insert: f, kind: 'fmt', desc: d, order: scanfCtx && f === '%lf' ? -1 : k }));
      list = list.filter(x => x.label.startsWith(p) && x.label !== p);
      if (!list.length) return null;
      list.sort((a, b) => a.order - b.order);
      return { from: pos - p.length, to: pos, prefix: p, items: list.slice(0, 12).map(x => ({ ...x, hits: [...Array(p.length).keys()] })) };
    }
    const es = line.match(/\\([a-z0-9]?)$/i);
    if (es) {
      const p = '\\' + es[1];
      const list = ESCAPES.filter(([e]) => e.startsWith(p) && e !== p).map(([e, d]) => ({ label: e, insert: e, kind: 'esc', desc: d, hits: [...Array(p.length).keys()] }));
      return list.length ? { from: pos - p.length, to: pos, prefix: p, items: list } : null;
    }
    return null;
  }
  if (str) return null;
  if (/\w/.test(after)) return null;
  // поля структуры
  const mem = line.match(/([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*(\.|->)\s*([A-Za-z_]\w*)?$/);
  if (mem) {
    const p = mem[3] || '';
    const items = membersOf(src, mem[1]).map(x => ({ ...x, f: fuzzy(p, x.label) })).filter(x => x.f);
    return items.length ? pack(items, pos - p.length, pos, p) : null;
  }
  const m = line.match(/#?[A-Za-z_]\w*$/);
  const prefix = m ? m[0] : '';
  if (!opts.force && prefix.length < (opts.minChars || 1)) return null;
  if (/^\d/.test(prefix)) return null;
  // после типа в объявлении («int x|») подсказывать нечего
  if (!opts.force && /\b(?:int|long|short|char|float|double|void|unsigned|struct\s+\w+)\s+\**[A-Za-z_]\w*$/.test(line) && !/\breturn\s+\w*$/.test(line)) return null;
  const seen = new Set();
  const items = [];
  const add = (it) => {
    if (seen.has(it.label) || (it.label === prefix && it.insert === prefix)) return;
    const f = opts.fuzzy === false ? (it.label.startsWith(prefix) ? { score: 1000 - it.label.length, hits: [...Array(prefix.length).keys()] } : null) : fuzzy(prefix, it.label);
    if (!f) return;
    seen.add(it.label);
    items.push({ ...it, f });
  };
  if (prefix.startsWith('#')) {
    for (const [w, ins, d] of [['#include', '#include <$1>', 'подключить библиотеку'], ['#define', '#define ${1:N} ${2:10}', 'символическая константа'], ['#ifdef', '#ifdef ${1:X}\n$0\n#endif', 'условная компиляция'], ['#ifndef', '#ifndef ${1:X}\n$0\n#endif', 'если не определено'], ['#undef', '#undef $1', 'отменить макрос']]) add({ label: w, insert: ins, kind: 'pp', desc: d });
    return pack(items, pos - prefix.length, pos, prefix);
  }
  const lineHead = line.slice(0, line.length - prefix.length).trim();
  if (opts.snippets !== false && (lineHead === '' || /[;{}]$/.test(lineHead))) for (const [w, body, d] of SNIPPETS) add({ label: w, insert: body, kind: 'snip', desc: d, detail: 'шаблон' });
  localNames(src.slice(0, lineStart) + src.slice(pos)).forEach(add);
  dictionary().forEach(add);
  return items.length ? pack(items, pos - prefix.length, pos, prefix) : null;
}

const KIND_RANK = { var: 0, field: 0, macro: 1, ufn: 1, snip: 2, kw: 2, fn: 3, const: 4, type: 5, pp: 1, hdr: 0 };
function pack(items, from, to, prefix) {
  if (!items.length) return null;
  for (const it of items) it.score = (it.f?.score ?? 0) + (usage[it.label] || 0) * 25 - (KIND_RANK[it.kind] ?? 3) * 6;
  items.sort((a, b) => b.score - a.score);
  return { from, to, prefix, items: items.slice(0, 40).map(it => ({ ...it, hits: it.f?.hits || [] })) };
}

// ——— подсказка параметров: printf(|…) ———
export function signatureAt(src, pos) {
  const before = src.slice(Math.max(0, pos - 2000), pos);
  let depth = 0, q = null, args = 0, i;
  for (i = before.length - 1; i >= 0; i--) {
    const c = before[i];
    if (q) { if (c === q && before[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === ')' || c === ']') depth++;
    else if (c === '(' || c === '[') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) args++;
    else if ((c === ';' || c === '{' || c === '}') && depth === 0) return null;
  }
  if (i < 0 || before[i] !== '(') return null;
  const nm = before.slice(0, i).match(/([A-Za-z_]\w*)\s*$/);
  if (!nm) return null;
  const name = nm[1];
  if (['if', 'while', 'for', 'switch', 'sizeof', 'return'].includes(name)) return null;
  let sig = null;
  for (const [h, info] of Object.entries(HEADERS)) {
    const f = info.funcs?.[name];
    if (f) {
      const names = PARAM_NAMES[name] || [];
      const ps = (f.params || []).map((p, k) => `${p ? typeName(p) : '?'}${names[k] ? ' ' + names[k] : ''}`);
      if (f.variadic) ps.push('...');
      sig = { name, ret: f.ret ? typeName(f.ret) : 'int', params: ps, desc: f.desc, header: h, variadic: f.variadic };
      break;
    }
  }
  if (!sig) {
    const def = stripCode(src).match(new RegExp(`([A-Za-z_][\\w\\s\\*]*?)\\s+\\**${name}\\s*\\(([^)]*)\\)\\s*\\{`));
    if (!def) return null;
    sig = { name, ret: def[1].trim(), params: def[2].split(',').map(x => x.trim()).filter(x => x && x !== 'void'), desc: 'ваша функция' };
  }
  sig.active = args;
  // printf/scanf: какому спецификатору соответствует текущий аргумент
  const argsText = src.slice(pos - (before.length - i) + 1, pos);
  const fmt = argsText.match(/^\s*"((?:\\.|[^"\\])*)"/);
  const fmtIdx = ['printf', 'scanf'].includes(name) ? 0 : ['fprintf', 'fscanf', 'sprintf', 'sscanf'].includes(name) ? 1 : ['snprintf'].includes(name) ? 2 : -1;
  if (fmtIdx >= 0 && fmt && args > fmtIdx) {
    const isScanf = name.includes('scanf');
    const specs = parseFormat(fmt[1], isScanf).filter(p => p.spec && p.conv !== '%' && !p.suppress);
    const sp = specs[args - fmtIdx - 1];
    sig.spec = sp ? { text: sp.text, desc: describeSpec(sp, isScanf), n: args - fmtIdx, total: specs.length, needAddr: isScanf && sp.conv !== 's' && sp.conv !== '[' } : { extra: true, n: args - fmtIdx, total: specs.length };
  }
  return sig;
}
const PARAM_NAMES = {
  printf: ['format'], scanf: ['format'], fprintf: ['f', 'format'], fscanf: ['f', 'format'], sprintf: ['buf', 'format'], sscanf: ['str', 'format'],
  snprintf: ['buf', 'n', 'format'], pow: ['x', 'y'], sqrt: ['x'], fabs: ['x'], abs: ['n'], malloc: ['size'], calloc: ['n', 'size'], realloc: ['p', 'size'],
  free: ['p'], strlen: ['s'], strcpy: ['dst', 'src'], strcat: ['dst', 'src'], strcmp: ['a', 'b'], strncpy: ['dst', 'src', 'n'], fopen: ['path', 'mode'],
  fclose: ['f'], fgets: ['buf', 'n', 'f'], fputs: ['s', 'f'], putchar: ['c'], puts: ['s'], atoi: ['s'], rand: [], srand: ['seed'], exp: ['x'], log: ['x'],
  sin: ['x'], cos: ['x'], tan: ['x'], floor: ['x'], ceil: ['x'], round: ['x'], toupper: ['c'], tolower: ['c'], isdigit: ['c'], isalpha: ['c'],
};

const KIND_ICON = { kw: 'k', fn: 'ƒ', ufn: 'ƒ', var: 'x', field: '·', macro: '#', const: 'c', type: 't', snip: '⌘', pp: '#', hdr: 'h', fmt: '%', esc: '\\' };
const KIND_LABEL = { kw: 'слово', fn: 'функция', ufn: 'ваша функция', var: 'переменная', field: 'поле', macro: 'макрос', const: 'константа', type: 'тип', snip: 'шаблон', pp: 'директива', hdr: 'библиотека', fmt: 'формат', esc: 'символ' };
export const kindIcon = (k) => KIND_ICON[k] || '?';
export const kindLabel = (k) => KIND_LABEL[k] || '';

/** Разобрать текст шаблона: убрать ${n:…}, вернуть текст и позиции полей (по порядку номеров, $0 — в конце). */
export function expandSnippet(body, indent, tab = '    ') {
  let out = '';
  const stops = [];
  const re = /\$\{(\d+):([^}]*)\}|\$(\d+)/g;
  let last = 0, m;
  const text = body.replace(/\n/g, '\n' + indent).replace(/\t/g, tab);
  while ((m = re.exec(text))) {
    out += text.slice(last, m.index);
    const n = +(m[1] ?? m[3]);
    const ph = m[2] ?? '';
    stops.push({ n, start: out.length, end: out.length + ph.length });
    out += ph;
    last = re.lastIndex;
  }
  out += text.slice(last);
  stops.sort((a, b) => (a.n === 0 ? 1e9 : a.n) - (b.n === 0 ? 1e9 : b.n));
  // одинаковые номера: берём первое вхождение
  const uniq = [];
  for (const s of stops) if (!uniq.some(u => u.n === s.n)) uniq.push(s);
  return { text: out, stops: uniq };
}
