// Наглядные мини-картинки операций для панели «Операция».
// Каждая картинка отвечает на вопрос «что здесь на самом деле произошло и почему».
import { esc } from '../universe/explain.js';

const c = (t) => `<code>${esc(t)}</code>`;
const b = (t) => `<b class="v">${esc(t)}</b>`;
const fmtN = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(6)));
const chr = (code) => (code === 32 ? '␠' : code === 10 ? '\\n' : code === 0 ? '\\0' : code === 9 ? '\\t' : code > 32 && code < 127 ? String.fromCharCode(code) : '·');
const card = (title, body, note = '', cls = '') => `<div class="vis ${cls}"><div class="vis-t">${title}</div>${body}${note ? `<div class="vis-n">${note}</div>` : ''}</div>`;

// ——— деление и остаток ———
function div(v) {
  const { a, b: d, q, r, op } = v;
  const small = a >= 0 && d > 0 && a <= 40 && q <= 12;
  let pic = '';
  if (small) {
    // точки группами по d: q полных групп + остаток
    const groups = [];
    for (let g = 0; g < q; g++) groups.push(`<span class="dg" style="--i:${g}">${'<i></i>'.repeat(d)}<small>${g + 1}</small></span>`);
    const rest = r > 0 ? `<span class="dg rest" style="--i:${q}">${'<i></i>'.repeat(r)}<small>остаток</small></span>` : '';
    pic = `<div class="dots">${groups.join('')}${rest}</div>`;
  } else if (a >= 0 && d > 0) {
    const segs = Math.min(q, 24);
    const w = (x) => (x / Math.max(1, a)) * 100;
    pic = `<div class="dbar">${Array.from({ length: segs }, (_, g) => `<span style="width:${w(d)}%;--i:${g}"></span>`).join('')}${q > segs ? `<em style="width:${w(d * (q - segs))}%">ещё ${q - segs}</em>` : ''}${r ? `<span class="rest" style="width:${Math.max(w(r), 1.5)}%;--i:${segs}"></span>` : ''}</div>`;
  }
  const eq = `<div class="vis-eq">${c(v.lt)} ${op} ${c(v.rt)} &nbsp;→&nbsp; ${esc(a)} = ${esc(d)} · ${b(q)} + ${op === '%' ? b(r) : esc(r)}</div>`;
  const title = op === '/' ? 'Целочисленное деление: сколько раз помещается' : 'Остаток от деления: что не поместилось';
  let note = op === '/'
    ? `Оба числа целые, поэтому результат тоже целый: ${b(q)}. Дробная часть отбрасывается, без округления (точно было бы ${esc(fmtN(v.real))}).`
    : `Остаток ${b(r)} — то, что осталось после ${esc(Math.abs(q))} полных ${Math.abs(q) === 1 ? 'группы' : 'групп'} по ${esc(Math.abs(d))}.`;
  if (a < 0 || d < 0) note += ' Для отрицательных чисел частное округляется к нулю, а остаток имеет знак делимого.';
  if (op === '/') note += ' Нужен дробный результат — сделайте одно из чисел вещественным: ' + c(`(double)${v.lt} / ${v.rt}`) + '.';
  return card(title, pic + eq, note, 'v-div');
}

function fdiv(v) {
  return card('Вещественное деление', `<div class="vis-eq">${c(v.lt)} / ${c(v.rt)} &nbsp;→&nbsp; ${esc(v.a)} / ${esc(v.b)} = ${b(v.res)}</div>`,
    v.aInt || v.bInt ? 'Одно из чисел целое, но другое вещественное — целое сначала превращается в double, и деление идёт с дробной частью.' : 'Оба числа вещественные: дробная часть сохраняется.', 'v-fdiv');
}

// ——— символы как числа (ASCII) ———
function ascii(v) {
  const rows = v.chars.map(ch => {
    const code = ch.code;
    const around = [];
    for (let k = code - 2; k <= code + 2; k++) if (k >= 0 && k < 256) around.push(`<span class="as ${k === code ? 'on' : ''}"><b>${esc(chr(k))}</b><small>${k}</small></span>`);
    return `<div class="as-row">${c(ch.text)} <span class="arr">=</span> код ${b(code)} <span class="as-strip">${around.join('')}</span></div>`;
  }).join('');
  const math = `<div class="vis-eq">${c(v.lt)} ${esc(v.op)} ${c(v.rt)} &nbsp;→&nbsp; ${esc(v.a)} ${esc(v.op)} ${esc(v.b)} = ${b(v.res)}</div>`;
  let note = 'Для компьютера символ — это просто небольшое число, его код в таблице ASCII. Поэтому символы можно складывать, вычитать и сравнивать как числа.';
  if (v.op === '-' && v.chars.some(ch => ch.text === "'0'")) note += ` Приём ${c("c - '0'")}: цифры '0'…'9' идут в таблице подряд (коды 48…57), поэтому разность даёт само значение цифры.`;
  if (v.chars.some(ch => ch.code >= 65 && ch.code <= 90) && v.chars.some(ch => ch.code >= 97 && ch.code <= 122)) note += ' Заглавные и строчные буквы отличаются на 32.';
  return card('Символ = число (таблица ASCII)', rows + math, note, 'v-ascii');
}

// ——— приведение типов ———
function conv(v) {
  let pic = `<div class="cv"><span class="cv-box"><small>${esc(v.from)}</small><b>${esc(v.before)}</b></span><span class="cv-arr">${v.explicit ? `(${esc(v.to)})` : 'в ' + esc(v.to)}<i></i></span><span class="cv-box to"><small>${esc(v.to)}</small><b>${esc(v.after)}</b></span></div>`;
  let note;
  if (v.fromFloat && !v.toFloat) {
    const m = String(v.before).match(/^(-?\d+)(\.\d+)?/);
    if (m && m[2]) pic += `<div class="cut">${esc(m[1])}<s>${esc(m[2])}</s><span>дробная часть отброшена</span></div>`;
    note = `Вещественное число превращается в целое <b>отбрасыванием</b> дробной части — не округлением: 3.99 станет 3, а −2.7 станет −2.`;
  } else if (!v.fromFloat && v.toFloat) note = 'Целое число становится вещественным: значение то же, просто у него появляется дробная часть (пока нулевая).';
  else if (v.toChar) note = 'В char помещается только 1 байт (−128…127): лишние старшие биты отбрасываются, а число можно показать как символ таблицы ASCII.';
  else note = 'Значение переносится в тип с другим размером или знаком. Если оно не помещается, лишние старшие биты отбрасываются.';
  const title = v.explicit ? `Явное приведение типа: ${c(`(${v.to})`)}` : `Неявное преобразование при записи${v.target ? ' в ' + c(v.target) : ''}`;
  return card(title, pic, note, 'v-conv');
}

// ——— сравнение на числовой прямой ———
const REL = { '<': 'меньше', '>': 'больше', '<=': 'меньше или равно', '>=': 'больше или равно', '==': 'равно', '!=': 'не равно' };
function cmp(v) {
  if (v.op === '==' || v.op === '!=') {
    const eq = v.a === v.b;
    const pic = `<div class="eqv"><span class="cv-box"><small>${esc(v.lt)}</small><b>${esc(v.ad)}</b></span><span class="eq-sym ${eq ? 'yes' : 'no'}">${eq ? '=' : '≠'}</span><span class="cv-box"><small>${esc(v.rt)}</small><b>${esc(v.bd)}</b></span><span class="arr">→</span><b class="${v.res ? 'yes' : 'no'}">${v.res ? 'истина (1)' : 'ложь (0)'}</b></div>`;
    return card(`Проверка на ${v.op === '==' ? 'равенство' : 'неравенство'} ${c(v.op)}`, pic,
      `${c('==')} — <b>два</b> знака: сравнить и получить 1 или 0; значения не меняются. Один знак ${c('=')} — совсем другое: записать значение в переменную. Частая ошибка — ${c('if (x = 5)')} вместо ${c('if (x == 5)')}.` + (v.op === '!=' ? ` ${c('!=')} — «не равно»: истина, когда значения различаются.` : ''), 'v-eq');
  }
  const lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b);
  const span = hi - lo || 1;
  const pos = (x) => (lo === hi ? 50 : 12 + ((x - lo) / span) * 76);
  const same = v.a === v.b;
  const pic = `<div class="nl"><div class="nl-line"></div>
    <span class="nl-p a" style="left:${pos(v.a)}%"><i></i><b>${esc(v.ad)}</b><small>${esc(v.lt)}</small></span>
    ${same ? '' : `<span class="nl-p bb" style="left:${pos(v.b)}%"><i></i><b>${esc(v.bd)}</b><small>${esc(v.rt)}</small></span>`}</div>`;
  const verdict = `<div class="vis-eq">${c(v.lt)} ${esc(v.op)} ${c(v.rt)} &nbsp;→&nbsp; ${esc(v.ad)} ${esc(REL[v.op])} ${esc(v.bd)}? <b class="${v.res ? 'yes' : 'no'}">${v.res ? 'да (1)' : 'нет (0)'}</b></div>`;
  const note = v.op === '==' || v.op === '!=' ? 'Сравнение даёт число: 1 — истина, 0 — ложь. Не путайте == (сравнить) и = (записать).' : 'Сравнение даёт число: 1 — истина, 0 — ложь. На прямой меньшее число левее.';
  return card('Сравнение', pic + verdict, note, 'v-cmp');
}

// ——— логические И / ИЛИ ———
function logic(v) {
  const box = (text, val, disp, skipped) => `<span class="lg ${skipped ? 'skip' : val ? 'yes' : 'no'}">${c(text)}<small>${skipped ? 'не вычислялось' : `${disp !== undefined ? esc(disp) + ' → ' : ''}${val ? 'истина' : 'ложь'}`}</small></span>`;
  const skipped = v.rv === null;
  const pic = `<div class="lgs">${box(v.l, v.lv, v.ld)}<span class="lg-op">${v.op === '&&' ? 'И' : 'ИЛИ'}<small>${esc(v.op)}</small></span>${box(v.r, v.rv, v.rd, skipped)}<span class="arr">=</span><b class="${v.res ? 'yes' : 'no'}">${v.res ? 'истина' : 'ложь'}</b></div>`;
  const tt = (op) => {
    const f = op === '&&' ? (x, y) => x && y : (x, y) => x || y;
    const cell = (x, y) => `<td class="${x === v.lv && (skipped || y === v.rv) ? 'on' : ''}">${f(x, y) ? 1 : 0}</td>`;
    return `<table class="truth"><tr><th></th><th>0</th><th>1</th></tr><tr><th>0</th>${cell(0, 0)}${cell(0, 1)}</tr><tr><th>1</th>${cell(1, 0)}${cell(1, 1)}</tr></table>`;
  };
  const note = skipped
    ? (v.op === '&&' ? 'Левая часть ложна — для И этого достаточно: результат точно ложь. Правая часть <b>даже не вычисляется</b> (короткое вычисление).' : 'Левая часть истинна — для ИЛИ этого достаточно: результат точно истина. Правая часть <b>даже не вычисляется</b>.')
    : (v.op === '&&' ? 'И (&&) истинно, только когда истинны обе части.' : 'ИЛИ (||) истинно, когда истинна хотя бы одна часть.');
  return card('Логическая операция', `<div class="lg-wrap">${pic}${tt(v.op)}</div>`, note, 'v-logic');
}

// ——— ++ / -- ———
function incdec(v) {
  const sign = v.op === '++' ? '+' : '−';
  const s1 = `<span class="st" style="--i:0"><small>${v.prefix ? '1. сначала' : '1. выражение даёт'}</small><span>${v.prefix ? `${c(v.name)} = ${esc(v.old)} ${sign} ${esc(v.step)} = ${b(v.now)}` : `старое значение ${b(v.old)}`}</span></span>`;
  const s2 = `<span class="st" style="--i:1"><small>${v.prefix ? '2. выражение даёт' : '2. затем'}</small><span>${v.prefix ? `новое значение ${b(v.now)}` : `${c(v.name)} = ${esc(v.old)} ${sign} ${esc(v.step)} = ${b(v.now)}`}</span></span>`;
  const note = (v.prefix ? `Префиксная форма ${c(v.op + v.name)}: сначала изменить, потом использовать.` : `Постфиксная форма ${c(v.name + v.op)}: сначала использовать старое значение, потом изменить.`)
    + ' Если выражение стоит отдельной строкой (как в for), разницы нет.' + (v.ptr ? ` Для указателя шаг — размер элемента: ${esc(v.step)} байт.` : '');
  return card(`${c(v.prefix ? v.op + v.name : v.name + v.op)} — ${v.op === '++' ? 'увеличение' : 'уменьшение'} на 1`, `<div class="steps">${s1}<span class="arr">→</span>${s2}</div>`, note, 'v-inc');
}

// ——— тернарная операция ———
function ternary(v) {
  const br = (label, text, on) => `<span class="tb ${on ? 'on' : 'off'}"><small>${label}</small>${c(text)}</span>`;
  const pic = `<div class="tern"><span class="tc">${c(v.cond)}<small>${esc(v.cv)} → ${v.chosen ? 'истина' : 'ложь'}</small></span><span class="tfork"><i class="${v.chosen ? 'up' : 'down'}"></i></span><span class="tbs">${br('если истина  ?', v.yes, v.chosen)}${br('если ложь  :', v.no, !v.chosen)}</span><span class="arr">=</span>${b(v.value)}</div>`;
  return card('Тернарная операция: выбор из двух', pic, `Условие ${v.chosen ? 'истинно — берётся значение после знака ?' : 'ложно — берётся значение после знака :'}. Вторая ветка не вычисляется.`, 'v-tern');
}

// ——— функция библиотеки как «машина» ———
function fn(v) {
  const ins = v.args.map((a, i) => `<span class="fa">${v.argTexts[i] && v.argTexts[i] !== a ? `<small>${esc(v.argTexts[i])}</small>` : ''}<b>${esc(a)}</b></span>`).join('');
  const pic = `<div class="fm">${ins ? `<span class="fins">${ins}</span><span class="arr">→</span>` : ''}<span class="fbox">${esc(v.fn)}<small>${esc(v.header || '')}</small></span>${v.result !== '' ? `<span class="arr">→</span><b class="fout">${esc(v.result)}</b>` : ''}</div>`;
  return card('Функция библиотеки', pic, esc(v.desc), 'v-fn');
}

// ——— индекс массива ———
function index(v) {
  const len = v.len ?? Math.max(v.pos + 1, 4);
  const from = Math.max(0, Math.min(v.pos - 5, len - 10)), to = Math.min(len, from + 10);
  const cells = [];
  if (from > 0) cells.push('<span class="ix more">…</span>');
  const val = (k) => { const x = v.vals?.[k]; if (x == null) return ''; const t = String(x).replace(/^'\\0'$/, '\\0'); return `<b class="${x === '?' ? 'junk' : ''}">${esc(t.length > 6 ? t.slice(0, 5) + '…' : t)}</b>`; };
  for (let k = from; k < to; k++) cells.push(`<span class="ix ${k === v.pos ? 'on' : ''}">${val(k)}<small>${k}</small></span>`);
  if (to < len) cells.push('<span class="ix more">…</span>');
  const out = v.len != null && (v.pos < 0 || v.pos >= v.len);
  if (out) cells.push(`<span class="ix bad"><small>${v.pos}</small></span>`);
  const note = `Адрес элемента = начало массива + индекс × размер элемента: ${esc(v.base)} + ${esc(v.i)} · ${esc(v.elem)} = ${b(v.addr)}. Нумерация с нуля, поэтому последний элемент — ${c(`${v.arr}[${(v.len ?? 1) - 1}]`)}.`;
  return card(`Индекс ${c(`${v.arr}[${v.idxText}]`)} → элемент №${esc(v.pos)}`, `<div class="ixs">${cells.join('')}</div>`, out ? `<b class="bad">Выход за границы массива!</b> В массиве ${esc(v.len)} элементов, допустимые индексы 0…${esc(v.len - 1)}.` : note, 'v-index');
}

const COMP = {
  '+=': 'прибавить к тому, что уже лежит в переменной', '-=': 'вычесть из текущего значения', '*=': 'умножить текущее значение',
  '/=': 'разделить текущее значение (для целых — нацело)', '%=': 'оставить остаток от деления', '<<=': 'сдвинуть биты влево (умножить на 2ⁿ)',
  '>>=': 'сдвинуть биты вправо (разделить на 2ⁿ)', '&=': 'побитовое И с текущим значением', '|=': 'побитовое ИЛИ с текущим значением', '^=': 'побитовое исключающее ИЛИ',
};
function compound(v) {
  const op = v.op.slice(0, -1);
  const up = v.d > 0, same = v.d === 0;
  const pic = `<div class="cmpd"><span class="cv-box"><small>было</small><b>${esc(v.cur)}</b></span>
    <span class="cd-op"><code>${esc(v.op)} ${esc(v.rv)}</code><i class="${same ? '' : up ? 'up' : 'down'}"></i></span>
    <span class="cv-box to"><small>стало</small><b>${esc(v.res)}</b></span>${!same && Number.isFinite(v.d) && (op === '+' || op === '-') ? `<span class="cd-d ${up ? 'up' : 'down'}">${up ? '+' : '−'}${esc(Math.abs(v.d))}</span>` : ''}</div>
    <div class="vis-eq">${c(`${v.target} ${v.op} ${v.rhs}`)} &nbsp;⇔&nbsp; ${c(`${v.target} = ${v.target} ${op} ${v.rhs}`)}</div>`;
  return card(`Составное присваивание ${c(v.op)}`, pic,
    `${c(v.op)} — ${esc(COMP[v.op] || 'операция с текущим значением')}. Сначала берётся старое значение ${c(v.target)} (${esc(v.cur)}), затем ${esc(v.cur)} ${esc(op)} ${esc(v.rv)} = ${b(v.res)}, и результат записывается обратно в ${c(v.target)}.`, 'v-comp');
}

function assign(v) {
  const junk = v.old === '?';
  const pic = `<div class="asg"><span class="cv-box to"><small>${esc(v.target)} · ${esc(v.type)}</small><b>${esc(v.val)}</b>${v.old !== v.val ? `<s class="${junk ? 'junk' : ''}">${junk ? 'мусор' : esc(v.old)}</s>` : ''}</span>
    <span class="asg-arr">←</span>${v.simple ? '' : `<span class="cv-box"><small>${esc(v.rhs)}</small><b>${esc(v.val)}</b></span>`}</div>`;
  return card(`Присваивание ${c('=')}`, pic,
    `Один знак ${c('=')} — не «равно», а «<b>записать</b>»: сначала вычисляется правая часть${v.simple ? '' : ` (${c(v.rhs)} = ${esc(v.val)})`}, потом результат кладётся в ячейку ${c(v.target)}. ${junk ? 'Раньше там был мусор — теперь значение определено.' : v.old === v.val ? 'Значение не изменилось.' : `Старое значение ${esc(v.old)} стирается.`}`, 'v-asg');
}

function bits(v) {
  const row = (label, bs, cls = '') => `<div class="bt-row ${cls}"><span class="bt-l">${label}</span><span class="bt-bits">${[...bs].map((x, i) => `${i && i % 4 === 0 ? '<i class="gap"></i>' : ''}<span class="bt ${x === '1' ? 'one' : ''}">${x}</span>`).join('')}</span></div>`;
  const NAMES = { '&': 'побитовое И: 1, только где обе единицы', '|': 'побитовое ИЛИ: 1, где есть хоть одна единица', '^': 'исключающее ИЛИ: 1, где биты различаются', '<<': `сдвиг влево на ${v.b}: все биты уезжают влево, справа нули — это умножение на 2${sup(v.b)}`, '>>': `сдвиг вправо на ${v.b}: биты уезжают вправо — деление на 2${sup(v.b)} нацело`, '~': 'побитовое НЕ: каждый бит меняется на противоположный' };
  const rows = v.op === '~' ? row(`${esc(v.lt)} = ${esc(v.a)}`, v.ab) + row(`~ = ${esc(v.r)}`, v.rb, 'res')
    : v.op === '<<' || v.op === '>>' ? row(`${esc(v.lt)} = ${esc(v.a)}`, v.ab) + row(`${esc(v.op)} ${esc(v.b)} = ${esc(v.r)}`, v.rb, 'res')
    : row(`${esc(v.lt)} = ${esc(v.a)}`, v.ab) + row(`${esc(v.op)} ${esc(v.rt)} = ${esc(v.b)}`, v.bb) + row(`= ${esc(v.r)}`, v.rb, 'res');
  return card(`Побитовая операция ${c(v.op)} — ${v.width} бит`, `<div class="bts">${rows}</div>`, esc(NAMES[v.op] || ''), 'v-bits');
}
const sup = (n) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);

function notV(v) {
  const t = v.v !== '0' && v.v !== '0.0';
  return card(`Логическое НЕ ${c('!')}`, `<div class="lgs"><span class="lg ${t ? 'yes' : 'no'}">${c(v.text)}<small>${esc(v.v)} → ${t ? 'истина' : 'ложь'}</small></span><span class="lg-op">НЕ<small>!</small></span><span class="arr">=</span><b class="${v.r ? 'yes' : 'no'}">${v.r ? 'истина (1)' : 'ложь (0)'}</b></div>`,
    `${c('!')} переворачивает истинность: любое ненулевое значение — истина, и ${c('!')} даёт 0; ноль — ложь, и ${c('!')} даёт 1. Часто пишут ${c('if (!found)')} вместо ${c('if (found == 0)')}.`, 'v-not');
}
function neg(v) {
  return card('Унарный минус', `<div class="vis-eq">${c('-' + v.text)} &nbsp;→&nbsp; −(${esc(v.v)}) = ${b(v.r)}</div>`, 'Меняет знак числа. Сама переменная при этом не меняется — получается новое значение.', 'v-neg');
}

function sizeofV(v) {
  const n = Math.min(v.size, 32);
  const bytes = Array.from({ length: n }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  const extra = v.len != null ? ` Массив: ${esc(v.len)} элементов × ${esc(v.elem)} байт = ${esc(v.size)}. Число элементов — ${c(`sizeof ${v.what} / sizeof ${v.what}[0]`)}.` : '';
  return card(`${c(`sizeof`)} — размер в байтах`, `<div class="bytes">${bytes}${v.size > 32 ? '<em>…</em>' : ''}</div><div class="vis-eq">${c(v.what)} (${esc(v.type)}) занимает ${b(v.size)} ${v.size === 1 ? 'байт' : v.size < 5 ? 'байта' : 'байт'}</div>`, 'Размер известен ещё при компиляции — sizeof ничего не вычисляет во время работы программы.' + extra, 'v-size');
}

function addr(v) {
  return card(`Адрес ${c('&' + v.name)}`, `<div class="ad"><span class="ad-box">${c(v.name)}<small>${esc(v.type)} · ${esc(v.size)} Б</small></span><span class="arr">лежит по адресу</span>${b(v.addr)}</div>`,
    'Адрес — номер первого байта переменной в памяти. scanf нужен именно адрес: он говорит функции, куда записать прочитанное значение.', 'v-addr');
}

const RENDER = { div, fdiv, ascii, conv, cmp, logic, incdec, ternary, fn, index, compound, assign, bits, not: notV, neg, sizeof: sizeofV, addr };
const PRIORITY = ['div', 'ascii', 'conv', 'bits', 'index', 'incdec', 'logic', 'not', 'ternary', 'fn', 'fdiv', 'compound', 'cmp', 'assign', 'neg', 'sizeof', 'addr'];

/** До max наглядных картинок для шага (самые содержательные, без повторов типа). */
export function visuals(trace, max = 2, skip = new Set()) {
  const list = (trace || []).map(t => t.vis).filter(v => v && RENDER[v.t] && !skip.has(v.t));
  const seen = new Set();
  const picked = [];
  for (const kind of PRIORITY) {
    const v = [...list].reverse().find(x => x.t === kind);
    if (v && !seen.has(kind)) { picked.push(v); seen.add(kind); }
    if (picked.length >= max) break;
  }
  return picked.map(v => { try { return RENDER[v.t](v); } catch { return ''; } }).join('');
}
