// Тренажёр «Угадай вывод»: короткие программы со случайными числами.
// Правильный ответ всегда вычисляет встроенный компилятор (он совпадает с gcc),
// а неправильные варианты — это типичные ошибки рассуждения.

const R = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const wrap = (body, inc = '#include <stdio.h>') => `${inc}\n\nint main(void) {\n${body.split('\n').map(l => '    ' + l).join('\n')}\n    return 0;\n}\n`;
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);
// остаток как в C (знак делимого)
const cmod = (a, b) => a - Math.trunc(a / b) * b;

export const DRILL_CATS = {
  div: 'Деление',
  mod: 'Остаток %',
  cast: 'Типы',
  inc: '++ и --',
  logic: 'Сравнения и логика',
  prec: 'Приоритет',
  char: 'Символы',
  loop: 'Циклы',
  fmt: 'Формат printf',
  ovf: 'Переполнение',
  assign: 'Присваивания',
};

const GEN = [
  // ——— деление ———
  (rnd) => {
    const a = R(7, 40, rnd), b = R(2, 9, rnd);
    if (a % b === 0) return null;
    return { cat: 'div', code: wrap(`int a = ${a}, b = ${b};\nprintf("%d\\n", a / b);`), wrong: [f1(a / b), String(Math.round(a / b) === Math.trunc(a / b) ? Math.trunc(a / b) + 1 : Math.round(a / b)), String(a % b)],
      why: `Оба операнда — int, поэтому деление целочисленное: дробная часть отбрасывается (${a} / ${b} = ${Math.trunc(a / b)}, а не ${f1(a / b)}).` };
  },
  (rnd) => {
    const a = R(5, 30, rnd), b = R(2, 8, rnd);
    if (a % b === 0) return null;
    return { cat: 'div', code: wrap(`int a = ${a}, b = ${b};\ndouble x = a / b;\nprintf("%.1f\\n", x);`), wrong: [f1(a / b), String(Math.trunc(a / b)), f1(Math.round(a / b))],
      why: `Сначала вычисляется a / b — это деление int на int, получается ${Math.trunc(a / b)}. Только потом результат превращается в double: ${f1(Math.trunc(a / b))}.` };
  },
  (rnd) => {
    const a = R(5, 30, rnd), b = R(2, 8, rnd);
    if (a % b === 0) return null;
    return { cat: 'cast', code: wrap(`int a = ${a}, b = ${b};\nprintf("%.2f\\n", (double)a / b);`), wrong: [f2(Math.trunc(a / b)), f2(Math.trunc(a / b) + 1), String(Math.trunc(a / b))],
      why: '(double)a превращает a в дробное число до деления, поэтому деление вещественное и дробная часть сохраняется.' };
  },
  // ——— остаток ———
  (rnd) => {
    const a = R(10, 60, rnd), b = R(3, 9, rnd);
    return { cat: 'mod', code: wrap(`printf("%d\\n", ${a} % ${b});`), wrong: [String(Math.trunc(a / b)), String((a % b) + 1), String(b - (a % b))],
      why: `% — остаток от деления: ${a} = ${b}·${Math.trunc(a / b)} + ${a % b}.` };
  },
  (rnd) => {
    const a = -R(7, 30, rnd), b = R(3, 7, rnd);
    if (cmod(a, b) === 0) return null;
    return { cat: 'mod', code: wrap(`int a = ${a};\nprintf("%d\\n", a % ${b});`), wrong: [String(((a % b) + b) % b), String(-cmod(a, b)), String(Math.trunc(a / b))],
      why: `В C знак остатка совпадает со знаком делимого: ${a} = ${b}·(${Math.trunc(a / b)}) + (${cmod(a, b)}). Математический «положительный» остаток здесь не получается.` };
  },
  (rnd) => {
    const n = R(100, 999, rnd);
    return { cat: 'mod', code: wrap(`int n = ${n};\nprintf("%d %d\\n", n % 10, n / 10 % 10);`), wrong: [`${Math.floor(n / 100)} ${Math.floor(n / 10) % 10}`, `${n % 10} ${Math.floor(n / 10)}`, `${n % 100} ${Math.floor(n / 10) % 10}`],
      why: 'n % 10 — последняя цифра, n / 10 % 10 — предпоследняя (сначала отбрасываем последнюю цифру делением, затем берём остаток).' };
  },
  // ——— ++ и -- ———
  (rnd) => {
    const i = R(2, 9, rnd), k = R(1, 5, rnd);
    return { cat: 'inc', code: wrap(`int i = ${i};\nint j = i++ + ${k};\nprintf("%d %d\\n", i, j);`), wrong: [`${i + 1} ${i + 1 + k}`, `${i} ${i + k}`, `${i} ${i + 1 + k}`],
      why: `i++ — постфиксная форма: в выражение идёт старое значение ${i}, а i увеличивается потом. Поэтому j = ${i} + ${k} = ${i + k}, а i = ${i + 1}.` };
  },
  (rnd) => {
    const i = R(2, 9, rnd), k = R(1, 5, rnd);
    return { cat: 'inc', code: wrap(`int i = ${i};\nint j = ++i * ${k};\nprintf("%d %d\\n", i, j);`), wrong: [`${i + 1} ${i * k}`, `${i} ${i * k}`, `${i} ${(i + 1) * k}`],
      why: `++i — префиксная форма: сначала i становится ${i + 1}, и уже новое значение умножается на ${k}.` };
  },
  (rnd) => {
    const n = R(3, 6, rnd);
    return { cat: 'inc', code: wrap(`int n = ${n}, c = 0;\nwhile (n-- > 0)\n    c++;\nprintf("%d %d\\n", c, n);`), wrong: [`${n} 0`, `${n - 1} 0`, `${n + 1} -1`],
      why: `n-- > 0 сравнивает старое значение, а потом уменьшает n. Тело выполняется ${n} раз; при последней проверке n было 0 и стало -1.` };
  },
  // ——— логика ———
  (rnd) => {
    const a = R(1, 9, rnd), b = R(1, 9, rnd), c = R(1, 9, rnd);
    const res = (a < b && b < c) ? 1 : 0;
    return { cat: 'logic', code: wrap(`int a = ${a}, b = ${b}, c = ${c};\nprintf("%d\\n", a < b && b < c);`), wrong: [String(1 - res), 'true', String(a < b ? 1 : 0) === String(res) ? '-1' : String(a < b ? 1 : 0)],
      why: `Сравнения в C дают число: 1 — истина, 0 — ложь. ${a} < ${b} → ${a < b ? 1 : 0}, ${b} < ${c} → ${b < c ? 1 : 0}; && даёт 1, только если обе части истинны.` };
  },
  (rnd) => {
    const a = R(1, 9, rnd), b = R(10, 20, rnd), c = R(1, 9, rnd);
    return { cat: 'logic', code: wrap(`int a = ${a}, b = ${b}, c = ${c};\nprintf("%d\\n", a < b < c);`), wrong: ['0', `${c}`, 'ошибка компиляции'],
      why: `a < b < c читается как (a < b) < c. Первое сравнение даёт 1, а 1 < ${c} — тоже истина. Так проверять «число между» нельзя — нужно a < b && b < c.` };
  },
  (rnd) => {
    const x = R(0, 1, rnd) ? 0 : R(2, 9, rnd);
    return { cat: 'logic', code: wrap(`int x = ${x};\nprintf("%d %d\\n", !x, !!x);`), wrong: [`${x ? 0 : 1} ${x}`, `${x ? 1 : 0} ${x ? 0 : 1}`, `-${x} ${x}`],
      why: `! превращает любое ненулевое число в 0, а ноль — в 1. Двойное !! даёт «нормальную» истину: 0 или 1.` };
  },
  (rnd) => {
    const x = R(1, 9, rnd), y = R(1, 9, rnd);
    return { cat: 'logic', code: wrap(`int x = ${x}, y = ${y};\nint m = x > y ? x : y;\nprintf("%d\\n", m);`), wrong: [String(Math.min(x, y) === Math.max(x, y) ? x + 1 : Math.min(x, y)), '1', String(x + y)],
      why: 'Тернарная операция «условие ? A : B» возвращает A, если условие истинно, иначе B. Здесь это максимум из двух чисел.' };
  },
  // ——— приоритет ———
  (rnd) => {
    const a = R(1, 9, rnd), b = R(2, 9, rnd), c = R(2, 9, rnd);
    return { cat: 'prec', code: wrap(`printf("%d\\n", ${a} + ${b} * ${c});`), wrong: [String((a + b) * c), String(a + b + c), String(a * b * c)],
      why: `Умножение выполняется раньше сложения: ${b} * ${c} = ${b * c}, затем ${a} + ${b * c}.` };
  },
  (rnd) => {
    const a = R(20, 60, rnd), b = R(2, 5, rnd), c = R(2, 4, rnd);
    return { cat: 'prec', code: wrap(`printf("%d\\n", ${a} / ${b} * ${c});`), wrong: [String(Math.trunc(a / (b * c))), String((a / b) * c % 1 ? f1((a / b) * c) : Math.trunc(a / b) * c + 1), String(Math.trunc(a * c / b) === Math.trunc(a / b) * c ? Math.trunc(a / b) * c - 1 : Math.trunc(a * c / b))],
      why: `/ и * одного приоритета и выполняются слева направо: (${a} / ${b}) * ${c} = ${Math.trunc(a / b)} * ${c}.` };
  },
  (rnd) => {
    const a = R(1, 5, rnd), b = R(1, 5, rnd);
    return { cat: 'prec', code: wrap(`int a = ${a}, b = ${b};\nprintf("%d\\n", a == b || a > b && b > 10);`), wrong: [String(a === b ? 0 : 1), 'true', '2'],
      why: '&& выполняется раньше ||: выражение читается как (a == b) || (a > b && b > 10).' };
  },
  // ——— символы ———
  (rnd) => {
    const k = R(1, 20, rnd);
    const ch = String.fromCharCode(65 + k);
    return { cat: 'char', code: wrap(`char c = 'A' + ${k};\nprintf("%c %d\\n", c, c);`), wrong: [`${String.fromCharCode(65 + k + 1)} ${65 + k + 1}`, `A${k} ${65 + k}`, `${ch} ${k}`],
      why: `Символ — это число (код ASCII). Код 'A' = 65, значит c = ${65 + k}, а это буква '${ch}'.` };
  },
  (rnd) => {
    const d = R(0, 9, rnd);
    return { cat: 'char', code: wrap(`char c = '${d}';\nprintf("%d %d\\n", c, c - '0');`), wrong: [`${d} ${d}`, `${48 + d} ${48 + d}`, `${d} 0`],
      why: `Цифра-символ '${d}' имеет код ${48 + d} (коды цифр начинаются с 48 у '0'). Вычитая '0', получаем само число ${d}.` };
  },
  (rnd) => {
    const c = String.fromCharCode(R(97, 122, rnd));
    return { cat: 'char', code: wrap(`char c = '${c}';\nprintf("%c\\n", c - 32);`), wrong: [c, String(c.charCodeAt(0) - 32), String.fromCharCode(c.charCodeAt(0) - 31)],
      why: 'Строчные и прописные латинские буквы в ASCII отличаются на 32: \'a\' = 97, \'A\' = 65.' };
  },
  // ——— циклы ———
  (rnd) => {
    const a = R(1, 4, rnd), b = R(5, 9, rnd);
    let s = 0; for (let i = a; i < b; i++) s += i;
    return { cat: 'loop', code: wrap(`int s = 0;\nfor (int i = ${a}; i < ${b}; i++)\n    s += i;\nprintf("%d\\n", s);`), wrong: [String(s + b), String(s - a), String(s + b - a)],
      why: `Условие i < ${b} строгое: ${b} в сумму не входит. Складываются ${Array.from({ length: b - a }, (_, j) => a + j).join(' + ')} = ${s}.` };
  },
  (rnd) => {
    const n = R(3, 6, rnd);
    return { cat: 'loop', code: wrap(`int i;\nfor (i = 0; i < ${n}; i++);\nprintf("%d\\n", i);`), wrong: [String(n - 1), '0', String(n + 1)],
      why: `После цикла переменная i равна значению, при котором условие стало ложным: ${n}. (Точка с запятой после for — пустое тело, цикл просто считает.)` };
  },
  (rnd) => {
    const n = R(2, 4, rnd), m = R(2, 4, rnd);
    return { cat: 'loop', code: wrap(`int c = 0;\nfor (int i = 0; i < ${n}; i++)\n    for (int j = 0; j < ${m}; j++)\n        c++;\nprintf("%d\\n", c);`), wrong: [String(n + m), String(n * m + 1), String((n - 1) * (m - 1))],
      why: `Внутренний цикл выполняется ${m} раз на каждом из ${n} шагов внешнего: ${n}·${m} = ${n * m}.` };
  },
  (rnd) => {
    const n = R(5, 9, rnd), k = R(2, 4, rnd);
    let s = 0; for (let i = 1; i <= n; i++) { if (i % k === 0) continue; s += i; }
    return { cat: 'loop', code: wrap(`int s = 0;\nfor (int i = 1; i <= ${n}; i++) {\n    if (i % ${k} == 0) continue;\n    s += i;\n}\nprintf("%d\\n", s);`), wrong: [String((n * (n + 1)) / 2), String(s + k), String(s - 1)],
      why: `continue пропускает остаток тела: числа, кратные ${k}, в сумму не попадают.` };
  },
  (rnd) => {
    const n = R(10, 30, rnd), k = R(3, 7, rnd);
    let i = 1; while (i * k <= n) i++;
    return { cat: 'loop', code: wrap(`int i = 1;\nwhile (i * ${k} <= ${n})\n    i++;\nprintf("%d\\n", i);`), wrong: [String(i - 1), String(Math.floor(n / k)) === String(i) ? String(i + 1) : String(Math.floor(n / k)), String(i + 1)],
      why: `Цикл идёт, пока i·${k} ≤ ${n}, и останавливается на первом i, для которого это уже неверно.` };
  },
  // ——— формат printf ———
  (rnd) => {
    const n = R(1, 999, rnd), w = R(4, 6, rnd);
    const s = String(n);
    return { cat: 'fmt', code: wrap(`printf("[%${w}d]\\n", ${n});`), wrong: [`[${s.padEnd(w)}]`, `[${s.padStart(w, '0')}]`, `[${s}]`],
      why: `%${w}d — ширина поля ${w}: число выравнивается по правому краю, слева добавляются пробелы.` };
  },
  (rnd) => {
    const n = R(1, 999, rnd), w = R(4, 6, rnd);
    const s = String(n);
    return { cat: 'fmt', code: wrap(`printf("[%-${w}d]\\n", ${n});`), wrong: [`[${s.padStart(w)}]`, `[-${s}]`, `[${s}]`],
      why: `Минус в %-${w}d означает выравнивание по левому краю: пробелы добавляются справа.` };
  },
  (rnd) => {
    const n = R(1, 99, rnd), w = R(3, 5, rnd);
    const s = String(n);
    return { cat: 'fmt', code: wrap(`printf("%0${w}d\\n", ${n});`), wrong: [s.padStart(w), s, '0' + s],
      why: `Ноль перед шириной (%0${w}d) заполняет поле нулями вместо пробелов.` };
  },
  (rnd) => {
    const x = R(100, 999, rnd) / 100 + 0.005 * R(0, 1, rnd);
    const v = Math.round(x * 1000) / 1000;
    return { cat: 'fmt', code: wrap(`double x = ${v};\nprintf("%.1f %.0f\\n", x, x);`), wrong: [`${v} ${Math.trunc(v)}`, `${(Math.trunc(v * 10) / 10).toFixed(1)} ${Math.trunc(v)}`, `${v.toFixed(2)} ${v.toFixed(1)}`],
      why: '%.1f оставляет один знак после запятой, %.0f — ни одного; число при этом округляется, а не обрезается.' };
  },
  (rnd) => {
    const n = R(10, 255, rnd);
    return { cat: 'fmt', code: wrap(`printf("%d %o %x\\n", ${n}, ${n}, ${n});`), wrong: [`${n} ${n.toString(8)} ${n.toString(16).toUpperCase()}`, `${n} ${n.toString(2)} ${n.toString(16)}`, `${n} ${n} ${n}`],
      why: '%o выводит число в восьмеричной системе, %x — в шестнадцатеричной строчными буквами (%X — прописными).' };
  },
  // ——— переполнение ———
  (rnd) => {
    const k = R(6, 30, rnd);
    return { cat: 'ovf', code: wrap(`unsigned char u = 250;\nu = u + ${k};\nprintf("%d\\n", u);`), wrong: [String(250 + k), '255', String(250 + k - 255)],
      why: `unsigned char хранит только 0…255. ${250 + k} не помещается, остаётся остаток от деления на 256: ${(250 + k) % 256}.` };
  },
  (rnd) => {
    const k = R(1, 5, rnd);
    return { cat: 'ovf', code: wrap(`unsigned int x = ${k - 1};\nx = x - ${k};\nprintf("%u\\n", x);`), wrong: ['-1', '0', '4294967296'],
      why: 'Беззнаковое число не может быть отрицательным: 0 − 1 «заворачивается» в самое большое значение типа, 2³² − 1 = 4294967295.' };
  },
  // ——— присваивания ———
  (rnd) => {
    const x = R(2, 9, rnd), a = R(1, 5, rnd), b = R(2, 4, rnd);
    return { cat: 'assign', code: wrap(`int x = ${x};\nx *= ${a} + ${b};\nprintf("%d\\n", x);`), wrong: [String(x * a + b), String(x + a + b), String(x * a * b)],
      why: `x *= ${a} + ${b} — это x = x * (${a} + ${b}). Правая часть вычисляется целиком до умножения.` };
  },
  (rnd) => {
    const x = R(2, 9, rnd);
    return { cat: 'assign', code: wrap(`int x = ${x}, y;\ny = x = x + 1;\nprintf("%d %d\\n", x, y);`), wrong: [`${x + 1} ${x}`, `${x} ${x + 1}`, `${x} ${x}`],
      why: 'Присваивание само является выражением со значением: сначала x = x + 1, затем это же значение записывается в y.' };
  },
  (rnd) => {
    const x = R(1, 9, rnd);
    return { cat: 'assign', code: wrap(`int x = ${x};\nif (x = 0)\n    printf("ноль\\n");\nelse\n    printf("%d\\n", x);`), wrong: ['ноль', String(x), 'ошибка компиляции'],
      why: 'В условии стоит присваивание =, а не сравнение ==. x получает 0, выражение равно 0 — ложь, поэтому выполняется else и печатается уже новое x.' };
  },
];

/** Сгенерировать вопрос. rnd — генератор случайных чисел [0,1). cats — разрешённые категории. */
export function makeQuestion(rnd = Math.random, cats = null) {
  for (let tries = 0; tries < 200; tries++) {
    const g = pick(GEN, rnd);
    const q = g(rnd);
    if (!q || (cats && !cats.includes(q.cat))) continue;
    return q;
  }
  return GEN[0](() => 0.5) || GEN[3](() => 0.5);
}

/** Варианты ответа: правильный + отличающиеся неправильные, перемешанные. */
export function choices(q, answer, rnd = Math.random) {
  const ans = answer.replace(/\n$/, '');
  const set = [ans];
  for (const w of q.wrong) if (w !== undefined && !set.includes(String(w))) set.push(String(w));
  let bump = 1;
  // не хватает вариантов — меняем последнее число в ответе на соседнее
  while (set.length < 4 && bump < 50) {
    const v = /-?\d+(?!.*\d)/.test(ans) ? ans.replace(/(-?\d+)(?!.*\d)/, (m) => String(+m + bump)) : ans + ' ';
    if (!set.includes(v)) set.push(v);
    bump = bump > 0 ? -bump : -bump + 1;
  }
  const out = set.slice(0, 4);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export const GENERATOR_COUNT = GEN.length;
export { GEN as _GEN };

// ——— «Найди ошибку»: программа с одной типичной ошибкой ———
// Каждый генератор возвращает строки тела main, номер строки с ошибкой (в теле), исправление и объяснение.
const NAMES = [['n', 'k'], ['a', 'b'], ['x', 'y'], ['m', 'p']];
const BUG = [
  (rnd) => {
    const [v] = pick(NAMES, rnd);
    return { kind: 'Ввод', body: [`int ${v};`, `printf("Введите число: ");`, `scanf("%d", ${v});`, `printf("Квадрат: %d\\n", ${v} * ${v});`], bug: 2, fix: `scanf("%d", &${v});`,
      why: `scanf нужно передать адрес переменной, куда записать число: &${v}. Без & функция получит мусорное значение ${v} вместо адреса и запишет число неизвестно куда.` };
  },
  (rnd) => {
    const [v] = pick(NAMES, rnd), c = R(2, 9, rnd);
    return { kind: 'Условие', body: [`int ${v};`, `scanf("%d", &${v});`, `if (${v} = ${c})`, `    printf("Угадали!\\n");`, `else`, `    printf("Мимо\\n");`], bug: 2, fix: `if (${v} == ${c})`,
      why: `= — это присваивание, а не сравнение. Условие ${v} = ${c} записывает ${c} в ${v} и всегда истинно. Сравнение пишется двумя знаками: ==.` };
  },
  (rnd) => {
    const [v] = pick(NAMES, rnd);
    return { kind: 'Условие', body: [`int ${v};`, `scanf("%d", &${v});`, `if (${v} < 0);`, `    ${v} = -${v};`, `printf("Модуль: %d\\n", ${v});`], bug: 2, fix: `if (${v} < 0)`,
      why: 'Точка с запятой сразу после if — это пустой оператор. Он и становится телом условия, а следующая строка выполняется всегда, при любом знаке числа.' };
  },
  (rnd) => {
    const n = R(4, 8, rnd);
    return { kind: 'Массив', body: [`int a[${n}];`, `for (int i = 0; i <= ${n}; i++)`, `    a[i] = i * i;`, `printf("%d\\n", a[${n} - 1]);`], bug: 1, fix: `for (int i = 0; i < ${n}; i++)`,
      why: `У массива из ${n} элементов индексы от 0 до ${n - 1}. Условие i <= ${n} делает лишний шаг и пишет за границу массива в a[${n}].` };
  },
  (rnd) => {
    const n = R(5, 20, rnd);
    return { kind: 'Переменные', body: [`int s;`, `for (int i = 1; i <= ${n}; i++)`, `    s += i;`, `printf("Сумма: %d\\n", s);`], bug: 0, fix: 'int s = 0;',
      why: 'Переменная s не инициализирована: в ней «мусор» из памяти. Прибавление начинается с непредсказуемого значения, поэтому сумма получается случайной.' };
  },
  (rnd) => {
    const a = R(2, 9, rnd), b = R(2, 9, rnd);
    return { kind: 'Формат', body: [`double avg = (${a} + ${b}) / 2.0;`, `printf("Среднее: %d\\n", avg);`], bug: 1, fix: 'printf("Среднее: %f\\n", avg);',
      why: 'Спецификатор %d ждёт int, а передано число double. Для double в printf используется %f (или %.2f и т. п.), иначе выводится мусор.' };
  },
  (rnd) => {
    const n = R(3, 6, rnd);
    return { kind: 'Типы', body: [`int sum = 0, n = ${n};`, `for (int i = 1; i <= n; i++)`, `    sum += i;`, `double avg = sum / n;`, `printf("%.2f\\n", avg);`], bug: 3, fix: 'double avg = (double)sum / n;',
      why: 'sum и n — целые, поэтому sum / n — целочисленное деление, дробная часть теряется ещё до записи в double. Нужно привести одно из чисел: (double)sum / n.' };
  },
  (rnd) => {
    const d = R(1, 3, rnd);
    return { kind: 'switch', body: [`int d = ${d};`, `switch (d) {`, `    case 1: printf("один\\n");`, `    case 2: printf("два\\n"); break;`, `    default: printf("много\\n");`, `}`], bug: 2, fix: '    case 1: printf("один\\n"); break;',
      why: 'После case 1 нет break, поэтому выполнение «проваливается» в case 2 и печатает лишнюю строку. Каждую ветку switch обычно завершают break.' };
  },
  (rnd) => {
    const n = R(3, 9, rnd);
    return { kind: 'Цикл', body: [`int i = 0;`, `while (i < ${n}) {`, `    printf("%d\\n", i);`, `}`], bug: 2, fix: `    printf("%d\\n", i++);`,
      why: 'Внутри цикла i не меняется, условие i < n всегда истинно — цикл бесконечный. Нужно увеличивать i в теле (i++).' };
  },
  (rnd) => {
    const r = R(2, 9, rnd);
    return { kind: 'Типы', body: [`double r = ${r};`, `double v = 4 / 3 * 3.14159 * r * r * r;`, `printf("Объём: %.2f\\n", v);`], bug: 1, fix: 'double v = 4.0 / 3 * 3.14159 * r * r * r;',
      why: '4 / 3 — деление двух целых, получается 1, а не 1.333. Чтобы деление было дробным, хотя бы одно число должно быть вещественным: 4.0 / 3.' };
  },
  (rnd) => {
    const c = pick(['y', 'n', 'q'], rnd);
    return { kind: 'Символы', body: [`char c;`, `scanf(" %c", &c);`, `if (c == "${c}")`, `    printf("Да\\n");`], bug: 2, fix: `if (c == '${c}')`,
      why: `"${c}" в двойных кавычках — строка (адрес массива символов), а символ пишется в одинарных: '${c}'. Сравнивать char со строкой нельзя.` };
  },
  (rnd) => {
    const n = R(3, 8, rnd);
    return { kind: 'Цикл', body: [`int f = 1;`, `for (int i = 1; i <= ${n}; i++);`, `    f *= i;`, `printf("%d\\n", f);`], bug: 1, fix: `for (int i = 1; i <= ${n}; i++)`,
      why: 'Точка с запятой после for(...) — пустое тело цикла. Цикл «прокручивается» впустую, а строка f *= i выполняется один раз после него (и i там уже не видна).' };
  },
  (rnd) => {
    const [v] = pick(NAMES, rnd);
    return { kind: 'Условие', body: [`int ${v};`, `scanf("%d", &${v});`, `if (0 < ${v} < 10)`, `    printf("Однозначное\\n");`], bug: 2, fix: `if (0 < ${v} && ${v} < 10)`,
      why: `0 < ${v} < 10 вычисляется как (0 < ${v}) < 10: слева получается 0 или 1, а это всегда меньше 10. Двойное неравенство в C пишут через &&.` };
  },
  (rnd) => {
    const n = R(10, 20, rnd);
    return { kind: 'Типы', body: [`int big = ${n}00000;`, `long long sq = big * big;`, `printf("%lld\\n", sq);`], bug: 1, fix: 'long long sq = (long long)big * big;',
      why: `big * big считается в типе int (оба множителя int) и переполняется: ${n}00000² больше предела int ≈ 2.1·10⁹. Запись в long long уже не спасает — нужно умножать в long long: (long long)big * big.` };
  },
];

/** Вопрос «найди ошибку»: полный текст программы, номер строки с ошибкой (с 1) и пояснения. */
export function makeBug(rnd = Math.random) {
  const g = pick(BUG, rnd)(rnd);
  const head = ['#include <stdio.h>', '', 'int main(void) {'];
  const lines = [...head, ...g.body.map(l => '    ' + l), '    return 0;', '}'];
  return { kind: g.kind, code: lines.join('\n') + '\n', line: head.length + g.bug + 1, fix: '    ' + g.fix, why: g.why, lines };
}
export { BUG as _BUG };

/** Детерминированный генератор по строке (для «испытания дня»). */
export function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
