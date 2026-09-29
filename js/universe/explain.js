// Превращает события интерпретатора в понятные объяснения на русском языке.
import { HEADERS } from '../compiler/stdlib.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const code = (s) => `<code>${esc(s)}</code>`;
const val = (s) => `<b class="v">${esc(s)}</b>`;

function srcList(sources, exclude) {
  const seen = new Set();
  const out = [];
  for (const s of sources || []) {
    if (s.name === exclude || seen.has(s.name) || s.id?.startsWith?.('fn:')) continue;
    seen.add(s.name);
    out.push(`${esc(s.name)} = ${val(s.display)}`);
  }
  return out;
}

const TYPE_INFO = {
  int: 'целое число, 4 байта (от −2 147 483 648 до 2 147 483 647)',
  'unsigned int': 'целое без знака, 4 байта (0 … 4 294 967 295)',
  long: 'длинное целое, 8 байт',
  'long long': 'очень длинное целое, 8 байт',
  short: 'короткое целое, 2 байта (−32 768 … 32 767)',
  char: 'символ, 1 байт (код от −128 до 127)',
  float: 'вещественное число одинарной точности, 4 байта (~7 значащих цифр)',
  double: 'вещественное число двойной точности, 8 байт (~15 значащих цифр)',
  bool: 'логическое значение, 1 байт (0 или 1)',
};
export const typeInfo = (t) => TYPE_INFO[t] || (t.includes('[') ? 'массив — ряд ячеек одного типа, идущих подряд в памяти' : t.includes('*') ? 'указатель — хранит адрес другой переменной' : t);

/**
 * Возвращает { icon, html, kind } или null (если событие не требует записи в лог).
 */
export function explain(ev, scene) {
  const at = (id) => {
    const e = scene?.entities.get(id);
    return e ? ` <span class="coord">📍(${Math.round(e.x)}, ${Math.round(e.y)})</span>` : '';
  };
  switch (ev.type) {
    case 'include': {
      const h = HEADERS[ev.header];
      const fns = Object.keys(h.funcs);
      return { icon: '📚', kind: 'law', html: `Подключён закон ${code('<' + ev.header + '>')} — «${esc(h.title)}». ${esc(h.law)}${fns.length ? ` Появились функции: ${fns.slice(0, 8).map(code).join(', ')}${fns.length > 8 ? '…' : ''}.` : ''}` };
    }
    case 'define':
      return { icon: '⭐', kind: 'law', html: `Символическая константа ${code(ev.name)} = ${code(ev.text)} зажглась как неподвижная звезда. Препроцессор заменит каждое ${code(ev.name)} в коде на ${code(ev.text)} ещё до компиляции — изменить её во время работы нельзя.` };
    case 'frame-enter':
      if (ev.frame.func === 'main')
        return { icon: '🚀', kind: 'flow', html: `Запуск функции ${code('main()')} — с неё начинается выполнение любой программы на C. В пространстве открылась область памяти main.` };
      return { icon: '📞', kind: 'flow', html: `Вызов функции ${code(ev.frame.func + '(' + ev.args.map(a => a.name + '=' + a.display).join(', ') + ')')}: создана новая область памяти (кадр стека, глубина ${ev.frame.depth}). У функции свои копии параметров — изменение их не затронет переменные вызывающей стороны.` };
    case 'frame-exit':
      if (ev.func === 'main') return null;
      return { icon: '🏁', kind: 'flow', html: `Функция ${code(ev.func)} завершилась${ev.ret != null ? ' и вернула ' + val(ev.ret) : ''}. Её область памяти освобождена, все её локальные переменные исчезли.` };
    case 'var': {
      const c = ev.cell;
      if (ev.via === 'param')
        return { icon: '📥', kind: 'var', html: `Параметр ${code(c.name)} (${esc(c.typeName)}) получил значение ${val(c.display)} — копию аргумента.${at(c.id)}` };
      const where = `адрес ${code('0x' + c.addr.toString(16))}`;
      if (c.isArray)
        return { icon: '🧱', kind: 'var', html: `Объявлен массив ${code(c.name)}: ${c.len} ячеек типа ${esc(c.elemType)} подряд в памяти (${c.size} байт, ${where}). Индексы: 0 … ${c.len - 1}.${at(c.id)}` };
      const init = c.init
        ? ` и сразу инициализирована: ${ev.init?.exprText && ev.init.exprText !== c.display ? code(ev.init.exprText) + ' → ' : ''}${val(c.display)}.`
        : '. Значение ещё не задано — в ячейке лежит случайный «мусор» (?).';
      return { icon: '🔭', kind: 'var', html: `${ev.via === 'global' ? 'Глобальная' : 'Объявлена'} переменная ${code(c.name)} типа ${code(c.typeName)} — ${esc(typeInfo(c.typeName))}. Компьютер обнаружил её в пространстве (${where}) и навёл на неё луч${init}${at(c.id)}` };
    }
    case 'write': {
      const srcs = srcList(ev.sources, null);
      const wh = srcs.length ? ` (где ${srcs.join(', ')})` : '';
      if (ev.via === 'scanf')
        return { icon: '⌨️', kind: 'io', html: `scanf прочитал с клавиатуры «${esc(ev.inputText ?? ev.display)}» и записал по адресу ${code('&' + ev.name)}: теперь ${code(ev.name)} = ${val(ev.display)}${ev.old !== '?' ? ' (было ' + esc(ev.old) + ')' : ''}.${at(ev.id)}` };
      if (ev.via === 'inc') {
        const d = ev.op === '++' ? 'увеличено на 1' : 'уменьшено на 1';
        return { icon: ev.op === '++' ? '➕' : '➖', kind: 'write', html: `${code(ev.exprText)}: значение ${code(ev.name)} ${d}: ${esc(ev.old)} → ${val(ev.display)}.${at(ev.id)}` };
      }
      if (ev.via === 'compound') {
        const op = ev.op.slice(0, -1);
        return { icon: '✏️', kind: 'write', html: `${code(ev.fullText)} — то же, что ${code(`${ev.name} = ${ev.name} ${op} (${ev.exprText})`)}: ${esc(ev.old)} ${esc(op)} … → ${val(ev.display)}${wh}.${at(ev.id)}` };
      }
      const same = ev.exprText === ev.display;
      return { icon: '✏️', kind: 'write', html: `Присваивание ${code(ev.name + ' = ' + ev.exprText)}: ${same ? '' : 'вычислено ' + code(ev.exprText) + wh + ' → '}в ${code(ev.name)} записано ${val(ev.display)}${ev.old !== '?' ? ' (было ' + esc(ev.old) + ')' : ' (раньше там был мусор)'}.${at(ev.id)}` };
    }
    case 'uninit':
      return { icon: '⚠️', kind: 'warn', html: `Чтение неинициализированной переменной ${code(ev.name)}! В ней оказался случайный «мусор» ${val(ev.display)} — результат программы непредсказуем. Задайте начальное значение.${at(ev.id)}` };
    case 'output': {
      const srcs = srcList(ev.sources);
      return { icon: '🖥', kind: 'io', html: `${esc(ev.fn)} вывел на экран: ${code(ev.text.replace(/\n/g, '⏎'))}${srcs.length ? ` — подставлены значения ${srcs.join(', ')}` : ''}.` };
    }
    case 'input':
      if (ev.fn === 'getchar') return { icon: '⌨️', kind: 'io', html: `getchar прочитал символ ${code(ev.text)}.` };
      return { icon: '📨', kind: 'io', html: `scanf(${code(JSON.stringify(ev.fmt).slice(1, -1))}) обработал ввод «${esc(ev.text)}»: прочитано значений — ${ev.count < 0 ? 'EOF (−1)' : ev.count}${ev.expected ? ' из ' + ev.expected : ''}. scanf возвращает это число.` };
    case 'input-wait':
      return { icon: '⏳', kind: 'io', html: 'Программа остановилась и ждёт ввода с клавиатуры. Введите значение в терминале и нажмите Enter.' };
    case 'cond': {
      const reads = srcList(ev.reads);
      const r = ev.value ? '<b class="ok">истина (1)</b>' : '<b class="bad">ложь (0)</b>';
      const w = reads.length ? ` при ${reads.join(', ')}` : '';
      if (ev.kind === 'if') {
        const branch = ev.value ? 'выполняется ветка if' : ev.hasElse ? `выполняется ветка else (строка ${ev.elseLine})` : 'тело if пропускается';
        return { icon: '🔀', kind: 'flow', html: `Условие ${code('if (' + ev.text + ')')}${w} → ${r}: ${branch}.` };
      }
      if (ev.value) return { icon: '🔁', kind: 'flow', html: `Проверка условия цикла ${code(ev.text)}${w} → ${r}: выполняется итерация №${ev.iter + 1}.` };
      return { icon: '🔚', kind: 'flow', html: `Проверка условия цикла ${code(ev.text)}${w} → ${r}: цикл завершён после ${ev.iter} ${plural(ev.iter, 'итерации', 'итераций', 'итераций')}.` };
    }
    case 'loop-enter': {
      const names = { for: 'со счётчиком for', while: 'с предусловием while', do: 'с постусловием do-while' };
      const extra = ev.kind === 'do' ? ' Тело выполнится хотя бы один раз — условие проверяется в конце.' : ev.kind === 'while' ? ' Условие проверяется перед каждой итерацией.' : ' Порядок: инициализация → (условие → тело → изменение)…';
      return { icon: '🌀', kind: 'flow', html: `Начинается цикл ${names[ev.kind]}: ${code(ev.head)}.${extra}` };
    }
    case 'loop-init':
      return { icon: '🎬', kind: 'flow', html: `Инициализация цикла for (выполняется один раз): ${code(ev.text)}.` };
    case 'loop-update':
      return { icon: '↻', kind: 'flow', html: `Конец итерации — изменение счётчика: ${code(ev.text)}. Дальше снова проверка условия.` };
    case 'loop-exit':
      if (ev.reason === 'break') return { icon: '⛔', kind: 'flow', html: `Цикл прерван оператором break после ${ev.iters} ${plural(ev.iters, 'итерации', 'итераций', 'итераций')}.` };
      if (ev.reason === 'return') return { icon: '↩️', kind: 'flow', html: `Цикл прерван оператором return.` };
      return null;
    case 'switch':
      return { icon: '🎛', kind: 'flow', html: `${code('switch (' + ev.text + ')')}: значение ${val(ev.display)} → ${ev.caseLine ? (ev.isDefault ? `ни одна метка не подошла, переход к ${code('default')} (строка ${ev.caseLine})` : `переход к подходящей метке case (строка ${ev.caseLine})`) : 'ни одна метка не подошла, default нет — switch пропускается'}.` };
    case 'fallthrough':
      return { icon: '⤵️', kind: 'warn', html: `Нет break — выполнение «проваливается» в следующую ветку (строка ${ev.line}).` };
    case 'jump':
      return ev.kind === 'break'
        ? { icon: '⛔', kind: 'flow', html: `${code('break')}: немедленный выход из ближайшего цикла или switch.` }
        : { icon: '⏭', kind: 'flow', html: `${code('continue')}: остаток тела пропускается, переход к следующей итерации.` };
    case 'scope-exit':
      return { icon: '🌫', kind: 'var', html: `Блок { } закончился — ${ev.names.map(code).join(', ')} ${ev.names.length > 1 ? 'растворились' : 'растворилась'}: их область видимости закончилась, память освобождена.` };
    case 'return':
      if (ev.func === 'main')
        return { icon: '↩️', kind: 'flow', html: `${code('return ' + ev.exprText)}: функция main возвращает ${val(ev.display ?? '')} операционной системе${ev.display === '0' ? ' — «программа завершилась успешно»' : ''}.` };
      return { icon: '↩️', kind: 'flow', html: `${code('return ' + ev.exprText)}: функция ${code(ev.func)} возвращает значение ${val(ev.display ?? 'void')} в точку вызова.` };
    case 'call':
      return { icon: '📞', kind: 'flow', html: `Вызов ${code(ev.func + '(' + ev.args.join(', ') + ')')} — аргументы вычислены и копируются в параметры.` };
    case 'builtin':
      if (ev.fn === 'srand') return { icon: '🎲', kind: 'law', html: `srand(${esc(ev.args[0])}): генератор случайных чисел получил «зерно».` };
      return { icon: ev.fn === 'rand' ? '🎲' : '🧮', kind: 'law', html: `${code(ev.fn + '(' + ev.args.join(', ') + ')')} = ${val(ev.result)} — работа закона ${code('<' + (ev.fn === 'rand' || ev.fn === 'abs' ? 'stdlib.h' : 'math.h') + '>')}.` };
    case 'locale':
      return { icon: '🌐', kind: 'law', html: ev.comma ? 'setlocale: вселенная переключилась на русскую локаль — дробная часть чисел теперь отделяется ЗАПЯТОЙ (и при вводе, и при выводе).' : 'setlocale: стандартная локаль C — дробная часть через точку.' };
    case 'runtime-warning':
      return { icon: '⚠️', kind: 'warn', html: `${esc(ev.message)}${ev.hint ? `<div class="hint">💡 ${esc(ev.hint)}</div>` : ''}` };
    case 'shortcircuit':
      return { icon: '⚡', kind: 'flow', html: `Короткое вычисление: результат ${code(ev.op)} уже известен, поэтому правая часть ${code(ev.text)} не вычисляется.` };
    case 'ternary':
      return { icon: '❓', kind: 'flow', html: `Тернарная операция: ${code(ev.text)} → ${ev.value ? 'истина — берётся значение после ?' : 'ложь — берётся значение после :'}.` };
    case 'note':
      return { icon: 'ℹ️', kind: 'flow', html: esc(ev.text) };
    case 'exit':
      return { icon: ev.code === 0 ? '✅' : '🛑', kind: 'flow', html: `Программа завершилась с кодом ${val(ev.code)}.` };
    default:
      return null;
  }
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
