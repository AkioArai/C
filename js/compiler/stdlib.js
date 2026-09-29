// Каталог стандартных библиотек. Каждая библиотека, подключённая через #include,
// добавляет в программу функции, константы и типы.
import { T, ptr, record, completeRecord } from './types.js';

const f = (ret, params, desc, extra = {}) => ({ ret, params, desc, ...extra });
const v = (ret, params, desc) => f(ret, params, desc, { variadic: true });
const cstr = ptr(T.char);
const vptr = ptr(T.void);
const size_t = Object.freeze({ ...T.ulong, typedefName: 'size_t' });

/** FILE — непрозрачная структура стандартной библиотеки. */
export const FILE_T = completeRecord(record('struct', '_IO_FILE'), [{ name: '_opaque', type: { k: 'arr', of: T.char, len: 216, size: 216, align: 8 } }]);
FILE_T.typedefName = 'FILE';
const fileP = ptr(FILE_T);

/** Адреса стандартных потоков (как у glibc). */
export const STD_STREAMS = { stdin: 0x7f3a2c61aa80, stdout: 0x7f3a2c61b760, stderr: 0x7f3a2c61b680 };

export const HEADERS = {
  'stdio.h': {
    title: 'Стандартный ввод-вывод',
    law: 'Связь с внешним миром: чтение с клавиатуры (scanf), вывод на экран (printf), работа с файлами.',
    funcs: {
      printf: v(T.int, [cstr], 'Выводит текст на экран по строке форматирования.'),
      scanf: v(T.int, [cstr], 'Считывает данные с клавиатуры в переменные по их адресам (&x).'),
      puts: f(T.int, [cstr], 'Выводит строку и переводит курсор на новую строку.'),
      putchar: f(T.int, [T.int], 'Выводит один символ.'),
      getchar: f(T.int, [], 'Считывает один символ с клавиатуры.'),
      gets: f(cstr, [cstr], 'Считывает строку (опасно: нет проверки длины).'),
      fgets: f(cstr, [cstr, T.int, fileP], 'Считывает строку не длиннее n−1 символов.'),
      sprintf: v(T.int, [cstr, cstr], 'Форматирует текст в строку-массив.'),
      snprintf: v(T.int, [cstr, size_t, cstr], 'Форматирует текст в массив не длиннее n байт.'),
      sscanf: v(T.int, [cstr, cstr], 'Считывает данные из строки.'),
      fprintf: v(T.int, [fileP, cstr], 'Форматированный вывод в файл (или stdout/stderr).'),
      fscanf: v(T.int, [fileP, cstr], 'Форматированное чтение из файла.'),
      fopen: f(fileP, [cstr, cstr], 'Открывает файл; при ошибке возвращает NULL.'),
      fclose: f(T.int, [fileP], 'Закрывает файл.'),
      fputs: f(T.int, [cstr, fileP], 'Записывает строку в файл.'),
      fputc: f(T.int, [T.int, fileP], 'Записывает символ в файл.'),
      putc: f(T.int, [T.int, fileP], 'Записывает символ в файл.'),
      fgetc: f(T.int, [fileP], 'Читает символ из файла.'),
      getc: f(T.int, [fileP], 'Читает символ из файла.'),
      feof: f(T.int, [fileP], 'Проверяет, достигнут ли конец файла.'),
      fflush: f(T.int, [fileP], 'Сбрасывает буфер вывода.'),
      rewind: f(T.void, [fileP], 'Возвращает позицию чтения в начало файла.'),
      remove: f(T.int, [cstr], 'Удаляет файл.'),
    },
    consts: {
      EOF: { type: T.int, value: -1, desc: 'Признак конца ввода (-1).' },
      NULL: { type: vptr, value: 0, desc: 'Нулевой указатель.' },
      stdin: { type: fileP, value: STD_STREAMS.stdin, desc: 'Стандартный ввод (клавиатура).' },
      stdout: { type: fileP, value: STD_STREAMS.stdout, desc: 'Стандартный вывод (экран).' },
      stderr: { type: fileP, value: STD_STREAMS.stderr, desc: 'Поток ошибок.' },
    },
    types: { size_t, FILE: FILE_T },
  },
  'math.h': {
    title: 'Математика',
    law: 'Корни, степени, тригонометрия и логарифмы.',
    funcs: Object.fromEntries([
      ['sqrt', 'Квадратный корень √x.'], ['cbrt', 'Кубический корень.'], ['fabs', 'Модуль |x|.'],
      ['sin', 'Синус (радианы).'], ['cos', 'Косинус (радианы).'], ['tan', 'Тангенс.'], ['asin', 'Арксинус.'], ['acos', 'Арккосинус.'], ['atan', 'Арктангенс.'],
      ['exp', 'Экспонента eˣ.'], ['log', 'Натуральный логарифм.'], ['log10', 'Десятичный логарифм.'], ['log2', 'Двоичный логарифм.'],
      ['floor', 'Округление вниз.'], ['ceil', 'Округление вверх.'], ['round', 'Округление к ближайшему.'], ['trunc', 'Отбрасывание дробной части.'],
      ['sinh', 'Гиперболический синус.'], ['cosh', 'Гиперболический косинус.'], ['tanh', 'Гиперболический тангенс.'],
    ].map(([n, d]) => [n, f(T.double, [T.double], d)]).concat([
      ['pow', f(T.double, [T.double, T.double], 'Степень xʸ.')],
      ['atan2', f(T.double, [T.double, T.double], 'Арктангенс y/x с учётом четверти.')],
      ['fmod', f(T.double, [T.double, T.double], 'Остаток от деления вещественных чисел.')],
      ['hypot', f(T.double, [T.double, T.double], 'Гипотенуза √(x²+y²).')],
      ['fmin', f(T.double, [T.double, T.double], 'Минимум.')],
      ['fmax', f(T.double, [T.double, T.double], 'Максимум.')],
    ])),
    consts: {
      M_PI: { type: T.double, value: Math.PI, desc: 'Число π.' },
      M_E: { type: T.double, value: Math.E, desc: 'Число e.' },
      M_SQRT2: { type: T.double, value: Math.SQRT2, desc: '√2.' },
      INFINITY: { type: T.float, value: Infinity, desc: 'Бесконечность.' },
      NAN: { type: T.float, value: NaN, desc: 'Не число.' },
    },
  },
  'stdlib.h': {
    title: 'Утилиты',
    law: 'Динамическая память (malloc/free), случайные числа, преобразование строк в числа.',
    funcs: {
      malloc: f(vptr, [size_t], 'Выделяет блок памяти в куче (содержимое — мусор).'),
      calloc: f(vptr, [size_t, size_t], 'Выделяет блок памяти в куче и заполняет нулями.'),
      realloc: f(vptr, [vptr, size_t], 'Меняет размер блока памяти.'),
      free: f(T.void, [vptr], 'Освобождает блок памяти, выделенный malloc.'),
      abs: f(T.int, [T.int], 'Модуль целого числа.'),
      labs: f(T.long, [T.long], 'Модуль длинного целого.'),
      llabs: f(T.llong, [T.llong], 'Модуль long long.'),
      atoi: f(T.int, [cstr], 'Строка → int.'),
      atol: f(T.long, [cstr], 'Строка → long.'),
      atof: f(T.double, [cstr], 'Строка → double.'),
      strtol: f(T.long, [cstr, ptr(cstr), T.int], 'Строка → long в заданной системе счисления.'),
      strtod: f(T.double, [cstr, ptr(cstr)], 'Строка → double.'),
      rand: f(T.int, [], 'Псевдослучайное число от 0 до RAND_MAX.'),
      srand: f(T.void, [T.uint], 'Задаёт начальное значение генератора случайных чисел.'),
      qsort: f(T.void, [vptr, size_t, size_t, vptr], 'Сортирует массив с помощью функции сравнения.'),
      exit: f(T.void, [T.int], 'Немедленно завершает программу.'),
      system: f(T.int, [cstr], 'Выполняет команду ОС (здесь игнорируется).'),
    },
    consts: {
      RAND_MAX: { type: T.int, value: 2147483647, desc: 'Максимум rand().' },
      NULL: { type: vptr, value: 0, desc: 'Нулевой указатель.' },
      EXIT_SUCCESS: { type: T.int, value: 0, desc: 'Код успешного завершения.' },
      EXIT_FAILURE: { type: T.int, value: 1, desc: 'Код ошибки.' },
    },
    types: { size_t },
  },
  'string.h': {
    title: 'Строки и память',
    law: 'Работа со строками (цепочками символов с \\0 в конце) и блоками памяти.',
    funcs: {
      strlen: f(size_t, [cstr], 'Длина строки без завершающего \\0.'),
      strcpy: f(cstr, [cstr, cstr], 'Копирует строку.'),
      strncpy: f(cstr, [cstr, cstr, size_t], 'Копирует не более n символов.'),
      strcat: f(cstr, [cstr, cstr], 'Дописывает строку в конец другой.'),
      strncat: f(cstr, [cstr, cstr, size_t], 'Дописывает не более n символов.'),
      strcmp: f(T.int, [cstr, cstr], 'Сравнивает строки: <0, 0 или >0.'),
      strncmp: f(T.int, [cstr, cstr, size_t], 'Сравнивает первые n символов.'),
      strchr: f(cstr, [cstr, T.int], 'Ищет символ в строке.'),
      strrchr: f(cstr, [cstr, T.int], 'Ищет символ с конца строки.'),
      strstr: f(cstr, [cstr, cstr], 'Ищет подстроку.'),
      strdup: f(cstr, [cstr], 'Копия строки в куче (нужно освободить free).'),
      memset: f(vptr, [vptr, T.int, size_t], 'Заполняет блок памяти байтом.'),
      memcpy: f(vptr, [vptr, vptr, size_t], 'Копирует n байт.'),
      memmove: f(vptr, [vptr, vptr, size_t], 'Копирует n байт (области могут перекрываться).'),
      memcmp: f(T.int, [vptr, vptr, size_t], 'Сравнивает n байт.'),
    },
    consts: { NULL: { type: vptr, value: 0, desc: 'Нулевой указатель.' } },
    types: { size_t },
  },
  'ctype.h': {
    title: 'Классы символов',
    law: 'Проверка символов: буква, цифра, пробел; смена регистра.',
    funcs: Object.fromEntries([
      ['isdigit', 'Цифра ли символ.'], ['isalpha', 'Буква ли символ.'], ['isalnum', 'Буква или цифра.'], ['isspace', 'Пробельный ли символ.'],
      ['isupper', 'Заглавная ли буква.'], ['islower', 'Строчная ли буква.'], ['ispunct', 'Знак препинания.'], ['isxdigit', 'Шестнадцатеричная цифра.'],
      ['toupper', 'Перевод в заглавную.'], ['tolower', 'Перевод в строчную.'],
    ].map(([n, d]) => [n, f(T.int, [T.int], d)])),
    consts: {},
  },
  'locale.h': {
    title: 'Локализация',
    law: 'Национальные настройки: язык, запятая в дробных числах.',
    funcs: { setlocale: f(cstr, [T.int, cstr], 'Устанавливает национальные настройки.') },
    consts: { LC_ALL: { type: T.int, value: 6, desc: 'Все категории локали.' }, LC_NUMERIC: { type: T.int, value: 1, desc: 'Формат чисел.' } },
  },
  'limits.h': {
    title: 'Пределы целых типов',
    law: 'Минимумы и максимумы целых типов.',
    funcs: {},
    consts: {
      INT_MAX: { type: T.int, value: 2147483647, desc: 'Максимум int.' },
      INT_MIN: { type: T.int, value: -2147483648, desc: 'Минимум int.' },
      UINT_MAX: { type: T.uint, value: 4294967295, desc: 'Максимум unsigned int.' },
      LONG_MAX: { type: T.long, value: 9223372036854775807n, desc: 'Максимум long.' },
      LONG_MIN: { type: T.long, value: -9223372036854775808n, desc: 'Минимум long.' },
      LLONG_MAX: { type: T.llong, value: 9223372036854775807n, desc: 'Максимум long long.' },
      LLONG_MIN: { type: T.llong, value: -9223372036854775808n, desc: 'Минимум long long.' },
      CHAR_MAX: { type: T.int, value: 127, desc: 'Максимум char.' },
      CHAR_MIN: { type: T.int, value: -128, desc: 'Минимум char.' },
      CHAR_BIT: { type: T.int, value: 8, desc: 'Бит в байте.' },
      SHRT_MAX: { type: T.int, value: 32767, desc: 'Максимум short.' },
      SHRT_MIN: { type: T.int, value: -32768, desc: 'Минимум short.' },
    },
  },
  'float.h': {
    title: 'Пределы вещественных типов',
    law: 'Точность и диапазон float/double.',
    funcs: {},
    consts: {
      DBL_EPSILON: { type: T.double, value: 2.220446049250313e-16, desc: 'Машинный эпсилон double.' },
      FLT_EPSILON: { type: T.double, value: 1.1920928955078125e-7, desc: 'Машинный эпсилон float.' },
      DBL_MAX: { type: T.double, value: Number.MAX_VALUE, desc: 'Максимум double.' },
      DBL_MIN: { type: T.double, value: 2.2250738585072014e-308, desc: 'Минимальный нормализованный double.' },
      FLT_MAX: { type: T.double, value: 3.4028234663852886e38, desc: 'Максимум float.' },
    },
  },
  'stdbool.h': {
    title: 'Логический тип',
    law: 'Тип bool и значения true / false.',
    funcs: {},
    consts: { true: { type: T.int, value: 1, desc: 'Истина (1).' }, false: { type: T.int, value: 0, desc: 'Ложь (0).' } },
    types: { bool: Object.freeze({ ...T.bool, typedefName: 'bool' }) },
  },
  'stdint.h': {
    title: 'Целые фиксированного размера',
    law: 'Типы int8_t … uint64_t с точно заданным числом бит.',
    funcs: {},
    consts: {
      INT32_MAX: { type: T.int, value: 2147483647, desc: 'Максимум int32_t.' },
      INT64_MAX: { type: T.long, value: 9223372036854775807n, desc: 'Максимум int64_t.' },
    },
    types: Object.fromEntries([
      ['int8_t', T.schar], ['uint8_t', T.uchar], ['int16_t', T.short], ['uint16_t', T.ushort],
      ['int32_t', T.int], ['uint32_t', T.uint], ['int64_t', T.long], ['uint64_t', T.ulong], ['size_t', T.ulong],
    ].map(([n, t]) => [n, Object.freeze({ ...t, typedefName: n })])),
  },
  'stddef.h': {
    title: 'Базовые определения',
    law: 'size_t, ptrdiff_t, NULL.',
    funcs: {},
    consts: { NULL: { type: vptr, value: 0, desc: 'Нулевой указатель.' } },
    types: { size_t, ptrdiff_t: Object.freeze({ ...T.long, typedefName: 'ptrdiff_t' }) },
  },
  'time.h': {
    title: 'Время',
    law: 'Текущее время и измерение длительности.',
    funcs: {
      time: f(T.long, [ptr(T.long)], 'Текущее время в секундах с 1970 года.'),
      clock: f(T.long, [], 'Процессорное время программы.'),
    },
    consts: { CLOCKS_PER_SEC: { type: T.long, value: 1000000n, desc: 'Тактов clock() в секунду.' } },
    types: { time_t: Object.freeze({ ...T.long, typedefName: 'time_t' }), clock_t: Object.freeze({ ...T.long, typedefName: 'clock_t' }) },
  },
  'assert.h': {
    title: 'Проверки',
    law: 'assert(условие) — аварийная остановка, если условие ложно.',
    funcs: { assert: f(T.void, [T.int], 'Останавливает программу, если условие ложно.') },
    consts: {},
  },
};

/** Функция → заголовок, в котором она объявлена. */
export const FUNC_HEADER = {};
for (const [h, def] of Object.entries(HEADERS))
  for (const fn of Object.keys(def.funcs)) if (!FUNC_HEADER[fn]) FUNC_HEADER[fn] = h;

export const CONST_HEADER = {};
for (const [h, def] of Object.entries(HEADERS))
  for (const c of Object.keys(def.consts)) if (!CONST_HEADER[c]) CONST_HEADER[c] = h;

export const TYPE_HEADER = {};
for (const [h, def] of Object.entries(HEADERS))
  for (const t of Object.keys(def.types || {})) if (!TYPE_HEADER[t]) TYPE_HEADER[t] = h;
