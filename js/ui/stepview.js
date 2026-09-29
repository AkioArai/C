// Панель «Операция»: наглядный разбор текущего шага в виде мини-таблиц.
// printf — полоса формата (%d → «целое», \n → «новая строка»), scanf — как читается буфер,
// выражения — пошаговое вычисление, условия — вердикт, объявления — ячейка памяти.
import { esc, explain, typeInfo } from '../universe/explain.js';

const glyph = (s) => esc(s).replace(/ /g, '<span class="g-sp">·</span>').replace(/\t/g, '<span class="g-sp">⇥</span>');

/** Отрисовать литерал формата: пробелы и \n видны. */
function litHtml(src) {
  let h = '';
  const parts = String(src).split('\n');
  parts.forEach((p, i) => {
    if (p) h += `<span class="tk tk-lit">${glyph(p)}</span>`;
    if (i < parts.length - 1) h += '<span class="tk tk-nl" title="\\n — переход на новую строку">↵<small>\\n новая строка</small></span>';
  });
  return h;
}

function outHtml(text) {
  return esc(text).replace(/ /g, '<span class="g-sp">·</span>').replace(/\n/g, '<span class="g-nl">↵</span>');
}

function printfBlock(ev) {
  if (!ev.pieces) return '';
  let fmt = '', args = '';
  let specN = 0;
  for (const p of ev.pieces) {
    if (p.kind === 'lit') { fmt += litHtml(p.src.replace(/\\n/g, '\n')); continue; }
    specN++;
    fmt += `<span class="tk tk-spec" data-n="${specN}"><b>${esc(p.src)}</b><small>${esc(p.desc || '')}</small></span>`;
    if (p.arg) args += `<div class="arg"><span class="arg-n">${esc(p.src)}</span><code>${esc(p.arg.text)}</code><span class="arr">→</span><b class="v">${esc(p.arg.display)}</b><span class="arr">→</span><span class="out">«${outHtml(p.out)}»</span></div>`;
    else if (p.src !== '%%') args += `<div class="arg warn"><span class="arg-n">${esc(p.src)}</span>нет аргумента — на экран попадёт мусор</div>`;
  }
  const where = ev.stream === 'file' ? `в файл ${esc(ev.target)}` : ev.stream === 'string' ? `в массив ${esc(ev.target || '')}` : ev.stream === 'stderr' ? 'в поток ошибок' : 'на экран';
  return `<div class="op-block">
    <div class="op-t">${esc(ev.fn)} — вывод ${where}</div>
    <div class="op-row"><span class="op-l">формат</span><div class="tks">${fmt || '<span class="muted">—</span>'}</div></div>
    ${args ? `<div class="op-row"><span class="op-l">подстановка</span><div class="args">${args}</div></div>` : ''}
    <div class="op-row"><span class="op-l">результат</span><div class="result">${outHtml(ev.text)}</div></div>
  </div>`;
}

function scanfBlock(ev) {
  if (!ev.pieces || ev.fn === 'getchar' || ev.fn === 'fgetc' || ev.fn === 'getc') {
    if (ev.fn === 'getchar' || ev.fn === 'fgetc' || ev.fn === 'getc')
      return `<div class="op-block"><div class="op-t">${esc(ev.fn)} — один символ из буфера</div><div class="op-row"><span class="op-l">взят символ</span><div class="buf"><span class="bc used c1">${ev.text === '\n' ? '↵' : ev.text === ' ' ? '·' : esc(ev.text)}</span></div></div><div class="note">${ev.text === '\n' ? 'Это символ перевода строки \\n — он остаётся в буфере после ввода числа и нажатия Enter.' : 'getchar возвращает код символа (int).'}</div></div>`;
    return '';
  }
  const buf = [...(ev.buffer || '')];
  const colorAt = new Array(buf.length).fill(0);
  const skipAt = new Array(buf.length).fill(false);
  let fmt = '';
  let n = 0;
  for (const p of ev.pieces) {
    if (p.kind === 'spec') {
      n++;
      fmt += `<span class="tk tk-spec c${((n - 1) % 4) + 1}"><b>${esc(p.src)}</b><small>${esc(p.desc || '')}</small></span>`;
      for (let i = p.from; i < p.to && i < buf.length; i++) if (i >= 0) colorAt[i] = ((n - 1) % 4) + 1;
      if (p.skipTo != null) for (let i = p.skipTo; i < p.from && i < buf.length; i++) if (i >= 0) skipAt[i] = true;
    } else if (p.kind === 'ws') {
      fmt += '<span class="tk tk-lit" title="пробел в формате: пропустить все пробелы и переводы строк">␣<small>пропуск пробелов</small></span>';
      for (let i = p.from; i < p.to && i < buf.length; i++) if (i >= 0) skipAt[i] = true;
    } else fmt += `<span class="tk tk-lit">${glyph(p.src)}</span>`;
  }
  const used = ev.consumedLen ?? 0;
  const cells = buf.slice(0, 60).map((ch, i) => {
    const g = ch === '\n' ? '↵' : ch === ' ' ? '·' : ch === '\t' ? '⇥' : esc(ch);
    const cls = colorAt[i] ? `used c${colorAt[i]}` : skipAt[i] ? 'skip' : i < used ? 'skip' : 'rest';
    return `<span class="bc ${cls}">${g}</span>`;
  }).join('');
  const targets = (ev.targets || []).map((t, i) => `<div class="arg"><span class="arg-n c${(i % 4) + 1}">${i + 1}</span><code>&amp;${esc(t.path)}</code><span class="arr">←</span><b class="v">${esc(t.display)}</b><span class="muted">${esc(t.typeName || '')}</span></div>`).join('');
  const src = ev.stream === 'file' ? 'файл' : ev.stream === 'string' ? 'строка' : 'буфер клавиатуры';
  return `<div class="op-block">
    <div class="op-t">${esc(ev.fn)} — чтение (${src})</div>
    <div class="op-row"><span class="op-l">формат</span><div class="tks">${fmt}</div></div>
    <div class="op-row"><span class="op-l">${src}</span><div class="buf">${cells || '<span class="muted">пусто (EOF)</span>'}</div></div>
    ${targets ? `<div class="op-row"><span class="op-l">запись</span><div class="args">${targets}</div></div>` : ''}
    <div class="note">Цветом отмечено, какие символы забрал каждый спецификатор; серые — пропущенные пробелы и ↵; остальное осталось в буфере для следующего чтения. ${esc(ev.fn)} вернул <b>${ev.count}</b>.</div>
  </div>`;
}

function traceBlock(trace, title = 'Вычисление') {
  const rows = (trace || []).filter(t => t.kind !== 'index' || trace.length < 4).slice(-7);
  if (!rows.length) return '';
  return `<div class="op-block">
    <div class="op-t">${esc(title)}</div>
    <table class="calc">${rows.map(t => `<tr${t.kind === 'store' ? ' class="store"' : ''}>
      <td class="c-expr"><code>${esc(t.text)}</code></td>
      <td class="c-sub">${t.calc ? esc(t.calc) : ''}</td>
      <td class="c-eq">${t.value !== '' ? '= <b class="v">' + esc(t.value) + '</b>' : ''}</td>
      <td class="c-note">${esc(t.note || '')}</td></tr>`).join('')}</table>
  </div>`;
}

function condBlock(ev) {
  const verdict = ev.value ? 'истина' : 'ложь';
  let what;
  if (ev.kind === 'if') what = ev.value ? 'выполняется ветка if' : ev.hasElse ? `выполняется else (строка ${ev.elseLine})` : 'тело if пропускается';
  else what = ev.value ? `итерация №${ev.iter + 1}` : 'выход из цикла';
  return `<div class="verdict ${ev.value ? 'yes' : 'no'}"><code>${esc(ev.text)}</code><span class="arr">→</span><b>${verdict}</b><span class="arr">→</span>${esc(what)}</div>`;
}

function switchBlock(ev) {
  const cases = (ev.cases || []).map(c => `<span class="tk ${c.hit ? 'tk-spec' : 'tk-lit'}" data-line="${c.line}"><b>${c.label === 'default' ? 'default' : 'case ' + esc(c.label)}</b><small>${c.hit ? 'совпало → сюда' : 'строка ' + c.line}</small></span>`).join('');
  return `<div class="op-block"><div class="op-t">switch — выбор ветки</div>
    <div class="op-row"><span class="op-l">значение</span><div><code>${esc(ev.text)}</code> <span class="arr">=</span> <b class="v">${esc(ev.display)}</b></div></div>
    <div class="op-row"><span class="op-l">метки</span><div class="tks">${cases}</div></div>
    <div class="note">${ev.caseLine ? (ev.isDefault ? 'Ни одна метка case не совпала — выполнение идёт с default.' : 'Выполнение начинается с совпавшей метки и идёт вниз до break.') : 'Ни одна метка не совпала, default нет — весь switch пропускается.'}</div></div>`;
}

function varBlock(ev) {
  const o = ev.obj;
  const bytes = Math.min(o.size, 16);
  const cells = Array.from({ length: bytes }, () => `<span class="byte ${o.cells.every(c => c.init) ? 'set' : 'junk'}"></span>`).join('');
  const val = o.shape === 'scalar' ? (o.cells[0]?.init ? `<b class="v">${esc(o.cells[0].display)}</b>` : '<b class="bad">? мусор</b>') : `<span class="muted">${o.cells.length} ячеек</span>`;
  return `<div class="op-block">
    <div class="op-t">${ev.via === 'param' ? 'параметр' : ev.via === 'global' ? 'глобальная переменная' : 'новая переменная'}</div>
    <div class="memcard"><code class="mc-name">${esc(o.name)}</code><span class="mc-type">${esc(o.typeName)}</span><span class="mc-val">${val}</span>
    <span class="mc-bytes" title="${o.size} байт">${cells}${o.size > 16 ? '…' : ''}<small>${o.size} Б</small></span><span class="mc-addr">0x${o.addr.toString(16)}</span></div>
    <div class="note">${esc(typeInfo(o.typeName))}</div>
  </div>`;
}

function callBlock(ev) {
  return `<div class="op-block"><div class="op-t">вызов функции ${esc(ev.frame.func)}</div>
    <div class="args">${ev.args.map(a => `<div class="arg"><code>${esc(a.name)}</code><span class="arr">←</span><b class="v">${esc(a.display)}</b><span class="muted">копия аргумента</span></div>`).join('') || '<span class="muted">без параметров</span>'}</div>
    <div class="note">В стеке создан новый кадр. После return он исчезнет, а результат вернётся в строку ${ev.callLine}.</div></div>`;
}

const PRIORITY = { output: 9, input: 9, cond: 7, switch: 7, 'frame-enter': 6, alloc: 6, free: 6, file: 6, var: 5, return: 5, write: 4 };

/** HTML панели для шага. */
export function renderStep(step, { stepNo, srcLines }) {
  const evs = step.events || [];
  const line = step.line;
  const codeLine = line ? (srcLines[line - 1] || '').trim() : '';
  const head = `<div class="op-head"><span class="op-step">шаг ${stepNo}</span>${line ? `<span class="op-line" data-line="${line}">строка ${line}</span><code class="op-code">${esc(codeLine)}</code>` : ''}<span class="op-tg"></span></div>`;
  const blocks = [];
  const sorted = [...evs].sort((a, b) => (PRIORITY[b.type] || 0) - (PRIORITY[a.type] || 0));
  const used = new Set();
  for (const ev of sorted) {
    if (blocks.length >= 2) break;
    if (ev.type === 'output' && ev.pieces && !used.has('out')) { blocks.push(printfBlock(ev)); used.add('out'); }
    else if (ev.type === 'input' && !used.has('in')) { const b = scanfBlock(ev); if (b) { blocks.push(b); used.add('in'); } }
    else if (ev.type === 'switch' && !used.has('cond')) { blocks.push(switchBlock(ev)); used.add('cond'); }
    else if ((ev.type === 'cond') && !used.has('cond')) { blocks.push(condBlock(ev)); used.add('cond'); if (step.trace?.length) { blocks.push(traceBlock(step.trace, 'Как вычислено условие')); used.add('trace'); } }
    else if (ev.type === 'frame-enter' && ev.frame.func !== 'main' && !used.has('call')) { blocks.push(callBlock(ev)); used.add('call'); }
    else if (ev.type === 'var' && ev.via !== 'static-again' && !used.has('var') && !step.trace?.length) { blocks.push(varBlock(ev)); used.add('var'); }
  }
  if (!used.has('trace') && step.trace?.length && blocks.length < 2) blocks.push(traceBlock(step.trace));
  const texts = evs.map(explain).filter(Boolean);
  const textHtml = texts.slice(0, 3).map(x => `<div class="op-x k-${x.kind}"><span class="kind-dot"></span><span>${x.html}</span></div>`).join('') + (texts.length > 3 ? `<div class="op-more">ещё ${texts.length - 3} — во вкладке «Логи»</div>` : '');
  return head + (blocks.length ? `<div class="op-blocks">${blocks.join('')}</div>` : '') + `<div class="op-texts">${textHtml}</div>`;
}

export function renderMessage(title, html, kind = 'flow', line = 0, srcLines = []) {
  const codeLine = line ? (srcLines[line - 1] || '').trim() : '';
  return `<div class="op-head"><span class="op-step">${esc(title)}</span>${line ? `<span class="op-line" data-line="${line}">строка ${line}</span><code class="op-code">${esc(codeLine)}</code>` : ''}<span class="op-tg"></span></div>
    <div class="op-texts"><div class="op-x k-${kind}"><span class="kind-dot"></span><span>${html}</span></div></div>`;
}
