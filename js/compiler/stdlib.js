// Каталог стандартных библиотек = «законы вселенной».
// Каждая библиотека, подключённая через #include, добавляет во вселенную
// новые функции и константы.
import { T, ptr } from './types.js';

const f = (ret, params, desc, extra = {}) => ({ ret, params, desc, ...extra });
const cstr = ptr(T.char);

export const HEADERS = {
  'stdio.h': {
    title: 'Стандартный ввод-вывод',
    law: 'Закон связи: компьютер получает право общаться с внешним миром — читать с клавиатуры (scanf) и писать на экран (printf).',
    color: '#4fd1ff',
    funcs: {
      printf: f(T.int, 'fmt...', 'Выводит текст на экран по строке форматирования.', { variadic: true }),
      scanf: f(T.int, 'fmt...', 'Считывает данные с клавиатуры в переменные по их адресам (&x).', { variadic: true }),
      puts: f(T.int, [cstr], 'Выводит строку и переводит курсор на новую строку.'),
      putchar: f(T.int, [T.int], 'Выводит один символ.'),
      getchar: f(T.int, [], 'Считывает один символ с клавиатуры.'),
    },
    consts: { EOF: { type: T.int, value: -1, desc: 'Признак конца ввода (-1).' }, NULL: { type: ptr(T.void), value: null, desc: 'Нулевой указатель.' } },
  },
  'math.h': {
    title: 'Математика',
    law: 'Закон геометрии: во вселенной появляются корни, степени, тригонометрия и логарифмы.',
    color: '#b18cff',
    funcs: {
      sqrt: f(T.double, [T.double], 'Квадратный корень √x.'),
      cbrt: f(T.double, [T.double], 'Кубический корень.'),
      pow: f(T.double, [T.double, T.double], 'Возведение в степень xʸ.'),
      fabs: f(T.double, [T.double], 'Модуль вещественного числа |x|.'),
      sin: f(T.double, [T.double], 'Синус (аргумент в радианах).'),
      cos: f(T.double, [T.double], 'Косинус (аргумент в радианах).'),
      tan: f(T.double, [T.double], 'Тангенс.'),
      asin: f(T.double, [T.double], 'Арксинус.'),
      acos: f(T.double, [T.double], 'Арккосинус.'),
      atan: f(T.double, [T.double], 'Арктангенс.'),
      atan2: f(T.double, [T.double, T.double], 'Арктангенс y/x с учётом четверти.'),
      exp: f(T.double, [T.double], 'Экспонента eˣ.'),
      log: f(T.double, [T.double], 'Натуральный логарифм ln x.'),
      log10: f(T.double, [T.double], 'Десятичный логарифм.'),
      log2: f(T.double, [T.double], 'Двоичный логарифм.'),
      floor: f(T.double, [T.double], 'Округление вниз.'),
      ceil: f(T.double, [T.double], 'Округление вверх.'),
      round: f(T.double, [T.double], 'Округление до ближайшего целого.'),
      trunc: f(T.double, [T.double], 'Отбрасывание дробной части.'),
      fmod: f(T.double, [T.double, T.double], 'Остаток от деления вещественных чисел.'),
      hypot: f(T.double, [T.double, T.double], 'Гипотенуза √(x²+y²).'),
    },
    consts: {
      M_PI: { type: T.double, value: Math.PI, desc: 'Число π.' },
      M_E: { type: T.double, value: Math.E, desc: 'Число e.' },
    },
  },
  'stdlib.h': {
    title: 'Утилиты',
    law: 'Закон случая и порядка: случайные числа, модуль целого числа, завершение программы.',
    color: '#ffb86b',
    funcs: {
      abs: f(T.int, [T.int], 'Модуль целого числа.'),
      labs: f(T.long, [T.long], 'Модуль длинного целого.'),
      rand: f(T.int, [], 'Псевдослучайное число от 0 до RAND_MAX.'),
      srand: f(T.void, [T.uint], 'Задаёт начальное значение генератора случайных чисел.'),
      exit: f(T.void, [T.int], 'Немедленно завершает программу.'),
      system: f(T.int, [cstr], 'Выполняет команду операционной системы (здесь игнорируется).'),
    },
    consts: { RAND_MAX: { type: T.int, value: 2147483647, desc: 'Максимум rand().' }, NULL: { type: ptr(T.void), value: null, desc: 'Нулевой указатель.' } },
  },
  'locale.h': {
    title: 'Локализация',
    law: 'Закон языка: вселенная учится говорить по-русски (кодировка, запятая в числах).',
    color: '#7ee787',
    funcs: { setlocale: f(cstr, [T.int, cstr], 'Устанавливает национальные настройки (язык, формат чисел).') },
    consts: { LC_ALL: { type: T.int, value: 6, desc: 'Все категории локали.' } },
  },
  'limits.h': {
    title: 'Пределы целых типов',
    law: 'Закон границ: у каждого целого типа есть минимум и максимум.',
    color: '#ff7b9c',
    funcs: {},
    consts: {
      INT_MAX: { type: T.int, value: 2147483647, desc: 'Максимум int.' },
      INT_MIN: { type: T.int, value: -2147483648, desc: 'Минимум int.' },
      UINT_MAX: { type: T.uint, value: 4294967295, desc: 'Максимум unsigned int.' },
      LONG_MAX: { type: T.long, value: 9223372036854775807n, desc: 'Максимум long.' },
      LONG_MIN: { type: T.long, value: -9223372036854775808n, desc: 'Минимум long.' },
      LLONG_MAX: { type: T.llong, value: 9223372036854775807n, desc: 'Максимум long long.' },
      CHAR_MAX: { type: T.int, value: 127, desc: 'Максимум char.' },
      CHAR_MIN: { type: T.int, value: -128, desc: 'Минимум char.' },
      SHRT_MAX: { type: T.int, value: 32767, desc: 'Максимум short.' },
    },
  },
  'float.h': {
    title: 'Пределы вещественных типов',
    law: 'Закон точности: у вещественных чисел конечная точность.',
    color: '#ff7b9c',
    funcs: {},
    consts: {
      DBL_EPSILON: { type: T.double, value: 2.220446049250313e-16, desc: 'Машинный эпсилон double.' },
      FLT_EPSILON: { type: T.double, value: 1.1920928955078125e-7, desc: 'Машинный эпсилон float.' },
      DBL_MAX: { type: T.double, value: Number.MAX_VALUE, desc: 'Максимум double.' },
    },
  },
  'stdbool.h': {
    title: 'Логический тип',
    law: 'Закон истины: появляется тип bool и слова true/false.',
    color: '#7ee787',
    funcs: {},
    consts: { true: { type: T.int, value: 1, desc: 'Истина (1).' }, false: { type: T.int, value: 0, desc: 'Ложь (0).' } },
    types: { bool: T.bool },
  },
  'string.h': {
    title: 'Строки',
    law: 'Закон слов: работа с цепочками символов.',
    color: '#ffd166',
    funcs: { strlen: f(T.ulong, [cstr], 'Длина строки без завершающего \\0.') },
    consts: {},
  },
  'ctype.h': {
    title: 'Классы символов',
    law: 'Закон символов: можно узнать, буква это, цифра или пробел.',
    color: '#ffd166',
    funcs: {
      isdigit: f(T.int, [T.int], 'Цифра ли символ.'),
      isalpha: f(T.int, [T.int], 'Буква ли символ.'),
      isspace: f(T.int, [T.int], 'Пробельный ли символ.'),
      isupper: f(T.int, [T.int], 'Заглавная ли буква.'),
      islower: f(T.int, [T.int], 'Строчная ли буква.'),
      toupper: f(T.int, [T.int], 'Перевод в заглавную.'),
      tolower: f(T.int, [T.int], 'Перевод в строчную.'),
    },
    consts: {},
  },
  'time.h': {
    title: 'Время',
    law: 'Закон времени: вселенная узнаёт текущее время.',
    color: '#8be9fd',
    funcs: { time: f(T.long, [ptr(T.long)], 'Текущее время в секундах с 1970 года.') },
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
