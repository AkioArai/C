// Превращает события интерпретатора в понятные объяснения на русском языке.
import { HEADERS } from '../compiler/stdlib.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const code = (s) => `<code>${esc(s)}</code>`;
const val = (s) => `<b class="v">${esc(s)}</b>`;

function srcList(sources, exclude) {
  const seen = new Set();
  const out = [];
  for (const s of sources || []) {
    if (s.path === exclude || seen.has(s.path) || String(s.objId).startsWith('fn:')) continue;
    seen.add(s.path);
    out.push(`${esc(s.path)} = ${val(s.display)}`);
  }
  return out;
}

const TYPE_INFO = {
  int: 'целое число, 4 байта (от −2 147 483 648 до 2 147 483 647)',
  'unsigned int': 'целое без знака, 4 байта (0 … 4 294 967 295)',
  long: 'длинное целое, 8 байт',
  'long long': 'очень длинное целое, 8 байт',
  short: 'короткое целое, 2 байта (−32 768 … 32 767)',
  char: 'символ, 1 байт (хранится код символа)',
  float: 'дробное число одинарной точности, 4 байта (~7 значащих цифр)',
  double: 'дробное число двойной точности, 8 байт (~15 значащих цифр)',
  bool: 'логическое значение, 1 байт (0 или 1)',
  _Bool: 'логическое значение, 1 байт (0 или 1)',
  size_t: 'беззнаковое целое для размеров, 8 байт',
};
export const typeInfo = (t) => TYPE_INFO[t] || (t.includes('[') ? 'массив — ряд ячеек одного типа, идущих подряд в памяти' : t.includes('(*)') ? 'указатель на функцию' : t.includes('*') ? 'указатель — хранит адрес другого объекта' : t.startsWith('struct') ? 'структура — несколько полей под одним именем' : t.startsWith('union') ? 'объединение — поля делят одну и ту же память' : t.startsWith('enum') ? 'перечисление — целое число с именованными значениями' : t);

/**
 * Возвращает { html, kind } или null (если событие не требует записи в лог).
 * kind: var | write | io | flow | warn | law — для цвета и фильтров.
 */
export function explain(ev) {
  switch (ev.type) {
    case 'include': {
      const h = HEADERS[ev.header];
      const fns = Object.keys(h.funcs);
      return { kind: 'law', html: `Подключена библиотека ${code('<' + ev.header + '>')} — «${esc(h.title)}». ${esc(h.law)}${fns.length ? ` Становятся доступны: ${fns.slice(0, 8).map(code).join(', ')}${fns.length > 8 ? '…' : ''}.` : ''}` };
    }
    case 'define':
      return { kind: 'law', html: ev.params
        ? `Макрос ${code(ev.name + '(' + ev.params.join(', ') + ')')} → ${code(ev.text)}. Препроцессор заменит каждый вызов на этот текст, подставив аргументы, — ещё до компиляции.`
        : `Константа ${code(ev.name)} = ${code(ev.text || '(пусто)')}. Препроцессор заменит каждое ${code(ev.name)} в коде на ${code(ev.text)} ещё до компиляции.` };
    case 'frame-enter':
      if (ev.frame.func === 'main')
        return { kind: 'flow', html: `Запуск функции ${code('main()')} — с неё начинается выполнение любой программы на C. В памяти (стеке) создан её кадр — место для локальных переменных.` };
      return { kind: 'flow', html: `Вызов ${code(ev.frame.func + '(' + ev.args.map(a => a.name + '=' + a.display).join(', ') + ')')}: в стеке создан новый кадр (глубина ${ev.frame.depth}). Параметры получили КОПИИ аргументов — их изменение не затронет переменные вызывающей функции.` };
    case 'frame-exit':
      if (ev.func === 'main') return null;
      return { kind: 'flow', html: `Функция ${code(ev.func)} завершилась${ev.ret != null ? ' и вернула ' + val(ev.ret) : ''}. Её кадр стека удалён вместе со всеми локальными переменными.` };
    case 'var': {
      const o = ev.obj;
      if (ev.via === 'param') return { kind: 'var', html: `Параметр ${code(o.name)} (${esc(o.typeName)}) = ${val(o.cells[0]?.display ?? '{…}')} — копия переданного аргумента.` };
      if (ev.via === 'static-again') return null;
      const where = `адрес ${code('0x' + o.addr.toString(16))}`;
      const scope = ev.via === 'global' ? 'Глобальная переменная' : ev.via === 'static' ? 'Статическая переменная (живёт всю программу, инициализируется один раз)' : 'Объявлена переменная';
      if (o.shape === 'array') return { kind: 'var', html: `${scope} ${code(o.name)}: массив ${esc(o.typeName)} — ${o.size} байт подряд в памяти (${where}).${ev.init ? ' Сразу заполнен начальными значениями.' : ' Значения элементов пока не заданы (мусор).'}` };
      if (o.shape === 'record') return { kind: 'var', html: `${scope} ${code(o.name)} типа ${code(o.typeName)}: ${o.cells.length} ${o.cells.length === 1 ? 'поле' : 'полей'}, ${o.size} байт (${where}).` };
      const c = o.cells[0];
      const init = c?.init ? ` и сразу получила значение ${ev.init?.exprText && ev.init.exprText !== c.display ? code(ev.init.exprText) + ' → ' : ''}${val(c.display)}` : ' — значение не задано, в ячейке лежит случайный «мусор»';
      return { kind: 'var', html: `${scope} ${code(o.name)} типа ${code(o.typeName)} (${esc(typeInfo(o.typeName))}), ${where}${init}.` };
    }
    case 'write': {
      const srcs = srcList(ev.sources, ev.path);
      const wh = srcs.length ? ` (где ${srcs.join(', ')})` : '';
      const d = ev.display ?? '…';
      if (['scanf', 'fscanf', 'sscanf'].includes(ev.via))
        return { kind: 'io', html: `${esc(ev.via)} прочитал «${esc(ev.inputText ?? d)}» и записал по адресу ${code('&' + ev.path)}: теперь ${code(ev.path)} = ${val(d)}${ev.old !== '?' && ev.old ? ' (было ' + esc(ev.old) + ')' : ''}.` };
      if (ev.via === 'inc') return { kind: 'write', html: `${code(ev.exprText)}: ${code(ev.path)} ${ev.op === '++' ? 'увеличено на 1' : 'уменьшено на 1'}: ${esc(ev.old)} → ${val(d)}.` };
      if (ev.via === 'compound') {
        const op = ev.op.slice(0, -1);
        return { kind: 'write', html: `${code(ev.fullText)} — то же, что ${code(`${ev.path} = ${ev.path} ${op} (${ev.exprText})`)}: ${esc(ev.old)} ${esc(op)} … → ${val(d)}${wh}.` };
      }
      if (ev.via === 'assign') {
        const same = ev.exprText === d;
        return { kind: 'write', html: `${code(ev.path + ' = ' + ev.exprText)}: ${same ? '' : 'вычислено ' + code(ev.exprText) + wh + ' → '}в ${code(ev.path)} записано ${val(d)}${ev.old !== '?' && ev.old ? ' (было ' + esc(ev.old) + ')' : ' (раньше там был мусор)'}.` };
      }
      return { kind: 'write', html: `${esc(ev.via)} изменил ${code(ev.path)}: ${val(d)}.` };
    }
    case 'uninit':
      return { kind: 'warn', html: `Чтение ${code(ev.path)}, которой не задали значение! В ней оказался случайный «мусор» ${val(ev.display)} — результат программы непредсказуем.` };
    case 'output':
      if (ev.stream === 'file') return { kind: 'io', html: `${esc(ev.fn)} записал в файл ${code(ev.target)}: ${code(ev.text.replace(/\n/g, '↵'))}.` };
      if (ev.stream === 'string') return { kind: 'io', html: `${esc(ev.fn)} записал текст ${code(ev.text)} в массив ${code(ev.target || '?')}.` };
      if (ev.stream === 'stderr') return { kind: 'io', html: `Вывод в поток ошибок stderr: ${code(ev.text.replace(/\n/g, '↵'))}.` };
      return { kind: 'io', html: `${esc(ev.fn)} вывел на экран ${code(ev.text.replace(/\n/g, '↵'))}${srcList(ev.sources).length ? ' — подставлены ' + srcList(ev.sources).join(', ') : ''}.` };
    case 'input':
      if (!ev.pieces) return { kind: 'io', html: `${esc(ev.fn)} прочитал символ ${code(ev.text)}.` };
      if (ev.fn === 'getchar' || ev.fn === 'fgetc' || ev.fn === 'getc') return { kind: 'io', html: `${esc(ev.fn)} взял из буфера ввода символ ${code(ev.text === '\n' ? '\\n' : ev.text)}.` };
      if (ev.fn === 'fgets' || ev.fn === 'gets') return { kind: 'io', html: `${esc(ev.fn)} прочитал строку ${code(ev.text.replace(/\n/g, '↵'))}.` };
      return { kind: 'io', html: `${esc(ev.fn)} разобрал ввод «${esc((ev.text || '').replace(/\n/g, '↵'))}»: прочитано значений — ${ev.count < 0 ? 'EOF (−1)' : ev.count}${ev.expected ? ' из ' + ev.expected : ''}. Это число ${esc(ev.fn)} и возвращает.` };
    case 'input-wait':
      return { kind: 'io', html: 'Программа остановилась и ждёт ввода с клавиатуры. Введите значение в терминале и нажмите Enter.' };
    case 'cond': {
      const reads = srcList(ev.reads);
      const r = ev.value ? '<b class="ok">истина</b>' : '<b class="bad">ложь</b>';
      const w = reads.length ? ` при ${reads.join(', ')}` : '';
      if (ev.kind === 'if') {
        const branch = ev.value ? 'выполняется ветка if' : ev.hasElse ? `выполняется ветка else (строка ${ev.elseLine})` : 'тело if пропускается';
        return { kind: 'flow', html: `Условие ${code('if (' + ev.text + ')')}${w} → ${r}: ${branch}.` };
      }
      if (ev.value) return { kind: 'flow', html: `Условие цикла ${code(ev.text)}${w} → ${r}: итерация №${ev.iter + 1}.` };
      return { kind: 'flow', html: `Условие цикла ${code(ev.text)}${w} → ${r}: цикл завершён после ${ev.iter} ${plural(ev.iter, 'итерации', 'итераций', 'итераций')}.` };
    }
    case 'loop-enter': {
      const names = { for: 'со счётчиком for', while: 'с предусловием while', do: 'с постусловием do-while' };
      const extra = ev.kind === 'do' ? ' Тело выполнится хотя бы один раз — условие проверяется в конце.' : ev.kind === 'while' ? ' Условие проверяется перед каждой итерацией.' : ' Порядок: инициализация → (условие → тело → изменение)…';
      return { kind: 'flow', html: `Начинается цикл ${names[ev.kind]}: ${code(ev.head)}.${extra}` };
    }
    case 'loop-init': return { kind: 'flow', html: `Инициализация цикла for (выполняется один раз): ${code(ev.text)}.` };
    case 'loop-update': return { kind: 'flow', html: `Конец итерации — изменение: ${code(ev.text)}. Дальше снова проверка условия.` };
    case 'loop-exit':
      if (ev.reason === 'break') return { kind: 'flow', html: `Цикл прерван оператором break после ${ev.iters} ${plural(ev.iters, 'итерации', 'итераций', 'итераций')}.` };
      if (ev.reason === 'return') return { kind: 'flow', html: 'Цикл прерван оператором return.' };
      if (ev.reason === 'goto') return { kind: 'flow', html: 'Выход из цикла по goto.' };
      return null;
    case 'switch':
      return { kind: 'flow', html: `${code('switch (' + ev.text + ')')}: значение ${val(ev.display)} → ${ev.caseLine ? (ev.isDefault ? `ни одна метка не подошла, переход к ${code('default')} (строка ${ev.caseLine})` : `переход к метке case в строке ${ev.caseLine}`) : 'ни одна метка не подошла, default нет — switch пропускается'}.` };
    case 'fallthrough': return { kind: 'warn', html: `Нет break — выполнение «проваливается» в следующую ветку (строка ${ev.line}).` };
    case 'jump':
      if (ev.kind === 'goto') return { kind: 'flow', html: `${code('goto ' + ev.label)}: переход к метке ${code(ev.label + ':')} (строка ${ev.line}).` };
      return ev.kind === 'break'
        ? { kind: 'flow', html: `${code('break')}: немедленный выход из ближайшего цикла или switch.` }
        : { kind: 'flow', html: `${code('continue')}: остаток тела пропускается, переход к следующей итерации.` };
    case 'label': return null;
    case 'scope-exit':
      return { kind: 'var', html: `Блок { } закончился — ${ev.names.map(code).join(', ')} ${ev.names.length > 1 ? 'исчезли' : 'исчезла'}: их область видимости закончилась.` };
    case 'return':
      if (ev.func === 'main') return { kind: 'flow', html: `${code('return ' + ev.exprText)}: main возвращает ${val(ev.display ?? '')} операционной системе${ev.display === '0' ? ' — «программа завершилась успешно»' : ''}.` };
      return { kind: 'flow', html: `${code('return ' + (ev.exprText || ''))}: функция ${code(ev.func)} возвращает ${val(ev.display ?? 'void')} в точку вызова.` };
    case 'call': return { kind: 'flow', html: `Вызов ${code(ev.func + '(' + ev.args.join(', ') + ')')}: аргументы вычислены и будут скопированы в параметры.` };
    case 'builtin':
      if (ev.fn === 'srand') return { kind: 'law', html: `srand(${esc(ev.args[0])}): генератор случайных чисел получил «зерно».` };
      if (ev.fn === 'free') return null;
      return { kind: 'law', html: `${code(ev.fn + '(' + ev.args.join(', ') + ')')}${ev.result != null ? ' = ' + val(ev.result) : ''}.` };
    case 'alloc':
      return { kind: 'var', html: `${code(ev.fn)} выделил в куче блок ${code(ev.obj.name)} из ${ev.size} байт по адресу ${code('0x' + ev.obj.addr.toString(16))}. ${ev.fn === 'calloc' ? 'calloc заполнил его нулями.' : 'Содержимое — мусор, пока его не заполнят.'} Блок живёт, пока не вызван free.` };
    case 'free': return { kind: 'var', html: `free освободил блок${ev.size != null ? ` (${ev.size} байт)` : ''}. Эту память больше нельзя использовать.` };
    case 'heap-view': return null;
    case 'leak': return { kind: 'warn', html: `Утечка памяти: ${ev.blocks} ${plural(ev.blocks, 'блок', 'блока', 'блоков')} (${ev.bytes} байт) выделено malloc, но не освобождено free.` };
    case 'file':
      if (ev.action === 'open') return { kind: 'io', html: `fopen открыл файл ${code(ev.name)} в режиме ${code(ev.mode)} (${esc({ r: 'чтение', w: 'запись с нуля', a: 'дописывание в конец' }[ev.mode[0]] || ev.mode)}).` };
      if (ev.action === 'open-fail') return { kind: 'warn', html: `fopen не смог открыть ${code(ev.name)} для чтения — такого файла нет. fopen вернул NULL.` };
      if (ev.action === 'close') return { kind: 'io', html: `fclose закрыл файл ${code(ev.name)}.` };
      return { kind: 'io', html: `${esc(ev.action)} ${code(ev.name)}.` };
    case 'locale':
      return { kind: 'law', html: ev.comma ? 'setlocale: включена русская локаль — дробная часть чисел отделяется ЗАПЯТОЙ (и при вводе, и при выводе).' : 'setlocale: стандартная локаль C — дробная часть через точку.' };
    case 'runtime-warning':
      return { kind: 'warn', html: `${esc(ev.message)}${ev.hint ? `<div class="hint">${esc(ev.hint)}</div>` : ''}` };
    case 'shortcircuit':
      return { kind: 'flow', html: `Короткое вычисление: результат ${code(ev.op)} уже известен, поэтому ${code(ev.text)} не вычисляется.` };
    case 'ternary':
      return { kind: 'flow', html: `Тернарная операция: ${code(ev.text)} → ${ev.value ? 'истина — берётся значение после ?' : 'ложь — берётся значение после :'}.` };
    case 'note': return { kind: 'flow', html: esc(ev.text) };
    case 'exit': return { kind: 'flow', html: `Программа завершилась с кодом ${val(ev.code)}.` };
    default: return null;
  }
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
