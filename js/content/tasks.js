// Практикум: задачи по темам 1–4 трёх уровней сложности (с уклоном в математику).
// Ожидаемый вывод для тестов вычисляется эталонным решением (solution);
// tests/tasks.mjs сверяет эталонные решения с настоящим gcc.

export const LEVELS = {
  easy: { name: 'Лёгкая', icon: '' },
  hard: { name: 'Сложная', icon: '' },
  extreme: { name: 'Экстрим', icon: '' },
};

export const TASK_TOPICS = {
  1: 'Тема 1. Ввод-вывод, типы, арифметика',
  2: 'Тема 2. Ветвления',
  3: 'Тема 3. Циклы',
  4: 'Тема 4. Вложенные циклы, переходы, переполнение',
};

const TAIL_NOTE = 'Проверяются последние числа/слова вывода, поэтому приглашения к вводу («Введите n:») писать можно.';
const EXACT_NOTE = 'Вывод проверяется <b>точно, символ в символ</b> — не выводите ничего лишнего (без приглашений к вводу).';

export const TASKS = [
  // ——————————— ТЕМА 1 ———————————
  {
    id: 't1-sumprod', topic: 1, level: 'easy', title: 'Сумма и произведение',
    text: '<p>Даны два целых числа <i>a</i> и <i>b</i>. Выведите их сумму, а на следующей строке — произведение.</p>',
    input: 'Два целых числа через пробел (|a|, |b| ≤ 10 000).', output: 'Две строки: a + b и a · b.',
    tests: ['3 4', '-5 7', '0 123', '1000 2000', '-12 -12'],
    hints: ['Считайте оба числа одним вызовом: scanf("%d %d", &a, &b);', 'Выражение можно сразу подставить в printf: printf("%d\\n", a + b);'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n%d\\n", a + b, a * b);
    return 0;
}
`,
  },
  {
    id: 't1-circle', topic: 1, level: 'easy', title: 'Окружность: длина и площадь',
    text: '<p>Дан радиус окружности <i>r</i> (вещественное число). Выведите длину окружности <i>L = 2πr</i> и площадь круга <i>S = πr²</i> с точностью <b>3 знака</b> после точки, через пробел.</p><p>Используйте <code>#define PI 3.14159265358979</code> или константу <code>M_PI</code> из <code>&lt;math.h&gt;</code>.</p>',
    input: 'Вещественное число r > 0.', output: 'Два числа: L и S в формате %.3f.',
    tests: ['1', '2.5', '0.1', '10'],
    hints: ['Для double в scanf нужен %lf.', 'r² — это просто r * r.', 'Формат с тремя знаками: %.3f'],
    solution: `#include <stdio.h>
#define PI 3.14159265358979

int main(void) {
    double r;
    scanf("%lf", &r);
    printf("%.3f %.3f\\n", 2 * PI * r, PI * r * r);
    return 0;
}
`,
  },
  {
    id: 't1-lastdigit', topic: 1, level: 'easy', title: 'Последняя цифра',
    text: '<p>Дано неотрицательное целое число <i>n</i>. Выведите его последнюю цифру.</p>',
    input: 'Целое число 0 ≤ n ≤ 2·10⁹.', output: 'Одна цифра.',
    tests: ['123', '7', '1000', '98765', '2000000009'],
    hints: ['Последняя цифра — это остаток от деления на 10.'],
    solution: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    printf("%d\\n", n % 10);
    return 0;
}
`,
  },
  {
    id: 't1-digitsum', topic: 1, level: 'hard', title: 'Сумма цифр трёхзначного числа',
    text: '<p>Дано трёхзначное число. Найдите сумму его цифр <b>без циклов</b> — только с помощью операций <code>/</code> и <code>%</code>.</p>',
    input: 'Целое число от 100 до 999.', output: 'Сумма цифр.',
    tests: ['123', '999', '100', '507', '481'],
    hints: ['Сотни: n / 100. Единицы: n % 10.', 'Десятки: (n / 10) % 10.'],
    solution: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    printf("%d\\n", n / 100 + (n / 10) % 10 + n % 10);
    return 0;
}
`,
  },
  {
    id: 't1-time', topic: 1, level: 'hard', title: 'Часы, минуты, секунды',
    text: '<p>С начала суток прошло <i>s</i> секунд. Выведите текущее время в формате <code>H:MM:SS</code> — часы без ведущего нуля, минуты и секунды двумя цифрами.</p><p>Например, 3723 секунды — это <code>1:02:03</code>.</p>',
    input: 'Целое число 0 ≤ s < 86400.', output: 'Время в формате H:MM:SS.',
    tests: ['3723', '0', '86399', '59', '3600', '45296'],
    hints: ['Часы: s / 3600. Минуты: s % 3600 / 60. Секунды: s % 60.', 'Ведущий ноль даёт модификатор %02d.'],
    solution: `#include <stdio.h>

int main(void) {
    int s;
    scanf("%d", &s);
    printf("%d:%02d:%02d\\n", s / 3600, s % 3600 / 60, s % 60);
    return 0;
}
`,
  },
  {
    id: 't1-avg', topic: 1, level: 'hard', title: 'Среднее арифметическое',
    text: '<p>Даны три целых числа. Выведите их среднее арифметическое с точностью 2 знака после точки.</p><p>Осторожно: сумма целых, делённая на целое 3, даёт <b>целочисленное</b> деление!</p>',
    input: 'Три целых числа.', output: 'Среднее в формате %.2f.',
    tests: ['1 2 2', '-3 0 4', '10 10 10', '7 8 10', '-1 -1 -2'],
    hints: ['Приведите сумму к double: (double)(a + b + c) / 3 — или делите на 3.0.'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b, c;
    scanf("%d %d %d", &a, &b, &c);
    printf("%.2f\\n", (a + b + c) / 3.0);
    return 0;
}
`,
  },
  {
    id: 't1-reverse', topic: 1, level: 'extreme', title: 'Число наоборот',
    text: '<p>Дано четырёхзначное число. Выведите число, записанное теми же цифрами в обратном порядке. Ведущие нули у результата не выводятся: для 1200 ответ 21. Циклы не используйте.</p>',
    input: 'Целое число от 1000 до 9999.', output: 'Перевёрнутое число.',
    tests: ['1234', '1200', '9001', '1000', '4444', '5071'],
    hints: ['Выделите 4 цифры через / и %.', 'Результат = d1·1000 + d2·100 + d3·10 + d4, где d1 — последняя цифра исходного числа. Печать через %d сама уберёт ведущие нули.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, a, b, c, d;
    scanf("%d", &n);
    a = n / 1000;
    b = n / 100 % 10;
    c = n / 10 % 10;
    d = n % 10;
    printf("%d\\n", d * 1000 + c * 100 + b * 10 + a);
    return 0;
}
`,
  },
  {
    id: 't1-dist', topic: 1, level: 'extreme', title: 'Расстояние и середина отрезка',
    text: '<p>Даны координаты двух точек на плоскости: (x₁, y₁) и (x₂, y₂). Выведите в первой строке расстояние между ними с точностью 4 знака, во второй — координаты середины отрезка с точностью 2 знака.</p><p>d = √((x₂−x₁)² + (y₂−y₁)²). Понадобится <code>sqrt</code> из <code>&lt;math.h&gt;</code>.</p>',
    input: 'Четыре вещественных числа: x1 y1 x2 y2.', output: 'd (%.4f), затем xm ym (%.2f).',
    tests: ['0 0 3 4', '1 1 1 1', '-2.5 3 4 -1.5', '0.1 0.2 0.3 0.4'],
    hints: ['#include <math.h> — закон геометрии.', 'Разности удобно сохранить: dx = x2 - x1, dy = y2 - y1.'],
    solution: `#include <stdio.h>
#include <math.h>

int main(void) {
    double x1, y1, x2, y2, dx, dy;
    scanf("%lf %lf %lf %lf", &x1, &y1, &x2, &y2);
    dx = x2 - x1;
    dy = y2 - y1;
    printf("%.4f\\n%.2f %.2f\\n", sqrt(dx * dx + dy * dy), (x1 + x2) / 2, (y1 + y2) / 2);
    return 0;
}
`,
  },
  {
    id: 't1-table', topic: 1, level: 'extreme', title: 'Столбик с выравниванием (упр. 1.3)', check: 'exact',
    text: '<p>Выведите вещественные числа α = 123.45, β = 9.876 и γ = 45.6 в столбик так, чтобы знаки <code>=</code> и десятичные точки находились <b>точно друг под другом</b>:</p><pre>alpha = 123.45\n beta =   9.876\ngamma =  45.6</pre><p>Числа храните в переменных double и выводите через спецификаторы с шириной и точностью, а не текстом.</p>',
    input: 'Нет.', output: 'Три строки, как в примере.',
    tests: [''],
    hints: ['Точка стоит в одной колонке, если у целой части одинаковая ширина: «123», «  9», « 45».', 'Ширина %N.Pf считается вместе с точкой и дробной частью: для 9.876 это %7.3f.'],
    solution: `#include <stdio.h>

int main(void) {
    double alpha = 123.45, beta = 9.876, gamma = 45.6;
    printf("alpha = %6.2f\\n", alpha);
    printf(" beta = %7.3f\\n", beta);
    printf("gamma = %5.1f\\n", gamma);
    return 0;
}
`,
  },

  // ——————————— ТЕМА 2 ———————————
  {
    id: 't2-max', topic: 2, level: 'easy', title: 'Большее из двух (упр. 2.1)',
    text: '<p>Даны два целых числа. Выведите большее из них. Если числа равны, выведите слово <code>EQUAL</code>.</p>',
    input: 'Два целых числа.', output: 'Большее число или EQUAL.',
    tests: ['3 7', '9 -2', '5 5', '-4 -8', '0 0'],
    hints: ['Используйте конструкцию if — else if — else.'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    if (a > b)
        printf("%d\\n", a);
    else if (b > a)
        printf("%d\\n", b);
    else
        printf("EQUAL\\n");
    return 0;
}
`,
  },
  {
    id: 't2-evenpos', topic: 2, level: 'easy', title: 'Положительное и чётное (упр. 2.2)',
    text: '<p>Дано целое число. Если оно положительное <b>и</b> чётное — выведите <code>YES</code>, иначе <code>NO</code>.</p>',
    input: 'Целое число.', output: 'YES или NO.',
    tests: ['4', '7', '-6', '0', '1000'],
    hints: ['Чётность: n % 2 == 0.', 'Два условия одновременно — операция &&.'],
    solution: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    if (n > 0 && n % 2 == 0)
        printf("YES\\n");
    else
        printf("NO\\n");
    return 0;
}
`,
  },
  {
    id: 't2-sign', topic: 2, level: 'easy', title: 'Знак числа',
    text: '<p>Функция sign(x) равна −1 для отрицательных x, 0 для нуля и 1 для положительных. Дано вещественное x — выведите sign(x).</p>',
    input: 'Вещественное число x.', output: '-1, 0 или 1.',
    tests: ['-3.5', '0', '0.001', '100', '-0.0001'],
    hints: ['Три варианта — удобна цепочка else-if.', 'Можно одной строкой: (x > 0) - (x < 0). Почему это работает?'],
    solution: `#include <stdio.h>

int main(void) {
    double x;
    scanf("%lf", &x);
    if (x < 0) printf("-1\\n");
    else if (x > 0) printf("1\\n");
    else printf("0\\n");
    return 0;
}
`,
  },
  {
    id: 't2-divides', topic: 2, level: 'hard', title: 'Делится ли нацело (упр. 2.3)',
    text: '<p>Даны два ненулевых целых числа a и b. Если a делится на b нацело — выведите частное a / b. Иначе, если b делится на a — выведите b / a. Иначе выведите их сумму.</p>',
    input: 'Два ненулевых целых числа.', output: 'Одно целое число.',
    tests: ['12 4', '4 12', '7 5', '-9 3', '6 6', '5 -25'],
    hints: ['«Делится нацело» — значит остаток равен нулю: a % b == 0.'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d %d", &a, &b);
    if (a % b == 0)
        printf("%d\\n", a / b);
    else if (b % a == 0)
        printf("%d\\n", b / a);
    else
        printf("%d\\n", a + b);
    return 0;
}
`,
  },
  {
    id: 't2-triangle', topic: 2, level: 'hard', title: 'Существует ли треугольник',
    text: '<p>Даны три натуральных числа — длины отрезков. Можно ли составить из них невырожденный треугольник? Выведите <code>YES</code> или <code>NO</code>.</p><p>Неравенство треугольника: каждая сторона меньше суммы двух других.</p>',
    input: 'Три натуральных числа.', output: 'YES или NO.',
    tests: ['3 4 5', '1 2 3', '10 1 1', '7 7 7', '2 3 4', '5 1 5'],
    hints: ['Нужно проверить три неравенства сразу: a < b + c && b < a + c && c < a + b.'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b, c;
    scanf("%d %d %d", &a, &b, &c);
    if (a < b + c && b < a + c && c < a + b)
        printf("YES\\n");
    else
        printf("NO\\n");
    return 0;
}
`,
  },
  {
    id: 't2-leap', topic: 2, level: 'hard', title: 'Високосный год',
    text: '<p>Год високосный, если он делится на 4, но не делится на 100, <b>или</b> делится на 400. Дан год — выведите <code>YES</code>, если он високосный, иначе <code>NO</code>.</p>',
    input: 'Натуральное число — год.', output: 'YES или NO.',
    tests: ['2000', '1900', '2024', '2023', '2100', '1600'],
    hints: ['Запишите условие одним логическим выражением: (y % 4 == 0 && y % 100 != 0) || y % 400 == 0.'],
    solution: `#include <stdio.h>

int main(void) {
    int y;
    scanf("%d", &y);
    printf((y % 4 == 0 && y % 100 != 0) || y % 400 == 0 ? "YES\\n" : "NO\\n");
    return 0;
}
`,
  },
  {
    id: 't2-quadrant', topic: 2, level: 'hard', title: 'Координатная четверть',
    text: '<p>Даны целые координаты точки (x, y). Выведите номер координатной четверти (1–4). Если точка лежит на оси, выведите 0.</p>',
    input: 'Два целых числа x y.', output: 'Число 0–4.',
    tests: ['3 5', '-3 5', '-3 -5', '3 -5', '0 7', '4 0', '0 0'],
    hints: ['Сначала проверьте особый случай: x == 0 || y == 0.', 'Вложенные if: сначала знак x, внутри — знак y.'],
    solution: `#include <stdio.h>

int main(void) {
    int x, y, q;
    scanf("%d %d", &x, &y);
    if (x == 0 || y == 0)
        q = 0;
    else if (x > 0)
        q = (y > 0) ? 1 : 4;
    else
        q = (y > 0) ? 2 : 3;
    printf("%d\\n", q);
    return 0;
}
`,
  },
  {
    id: 't2-calc', topic: 2, level: 'hard', title: 'Калькулятор на switch',
    text: '<p>На вход подаётся выражение вида <code>a op b</code>, где a и b — целые числа, а op — один из символов <code>+ - * / %</code>. Выведите результат (деление целочисленное). Если делитель равен нулю или операция неизвестна, выведите <code>ERROR</code>.</p>',
    input: 'Например: 7 * 6', output: 'Целое число или ERROR.',
    tests: ['7 * 6', '10 / 3', '10 % 3', '5 - 9', '8 / 0', '2 ^ 3', '-7 + 7'],
    hints: ['Считать символ операции: scanf("%d %c %d", &a, &op, &b);', 'Проверку деления на ноль удобно сделать внутри case \'/\' и case \'%\'.'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b;
    char op;
    scanf("%d %c %d", &a, &op, &b);
    switch (op) {
        case '+': printf("%d\\n", a + b); break;
        case '-': printf("%d\\n", a - b); break;
        case '*': printf("%d\\n", a * b); break;
        case '/':
        case '%':
            if (b == 0) printf("ERROR\\n");
            else printf("%d\\n", op == '/' ? a / b : a % b);
            break;
        default: printf("ERROR\\n"); break;
    }
    return 0;
}
`,
  },
  {
    id: 't2-quad', topic: 2, level: 'extreme', title: 'Квадратное уравнение — все случаи',
    text: '<p>Решите уравнение <i>ax² + bx + c = 0</i> с вещественными коэффициентами. Разберите <b>все</b> случаи:</p><ul><li>a = 0, b = 0: если c = 0 — любое x подходит, выведите <code>INF</code>; иначе <code>NO ROOTS</code>;</li><li>a = 0, b ≠ 0: линейное уравнение, один корень;</li><li>D &lt; 0: <code>NO ROOTS</code>;</li><li>D = 0: один корень;</li><li>D &gt; 0: два корня <b>в порядке возрастания</b>.</li></ul><p>Корни выводите с точностью 3 знака через пробел.</p>',
    input: 'Три вещественных числа a b c.', output: 'Корни (%.3f), либо NO ROOTS, либо INF.',
    tests: ['1 -3 2', '1 2 1', '1 0 1', '0 2 -4', '0 0 0', '0 0 5', '2 -7 3', '-1 0 4'],
    hints: ['Не забудьте #include <math.h> для sqrt.', 'При a < 0 формула (−b − √D)/(2a) даёт БОЛЬШИЙ корень. Сравните корни и выведите по возрастанию.', 'Выход −0.000 и 0.000 считаются одинаковыми.'],
    solution: `#include <stdio.h>
#include <math.h>

int main(void) {
    double a, b, c, D, x1, x2, t;
    scanf("%lf %lf %lf", &a, &b, &c);
    if (a == 0) {
        if (b == 0) {
            if (c == 0) printf("INF\\n");
            else printf("NO ROOTS\\n");
        } else {
            printf("%.3f\\n", -c / b);
        }
    } else {
        D = b * b - 4 * a * c;
        if (D < 0) {
            printf("NO ROOTS\\n");
        } else if (D == 0) {
            printf("%.3f\\n", -b / (2 * a));
        } else {
            x1 = (-b - sqrt(D)) / (2 * a);
            x2 = (-b + sqrt(D)) / (2 * a);
            if (x1 > x2) { t = x1; x1 = x2; x2 = t; }
            printf("%.3f %.3f\\n", x1, x2);
        }
    }
    return 0;
}
`,
  },
  {
    id: 't2-shtuki', topic: 2, level: 'extreme', title: 'Штука, штуки, штук — для любого n',
    text: '<p>Пример из методички работает неправильно для чисел 111–114, 211–214 и т. д. Напишите правильную версию. Дано n ≥ 0 — выведите <code>n штук</code> с верным окончанием: <code>1 штука</code>, <code>3 штуки</code>, <code>11 штук</code>, <code>21 штука</code>, <code>112 штук</code>.</p>',
    input: 'Целое число 0 ≤ n ≤ 10⁹.', output: 'Число и слово: штука / штуки / штук.',
    tests: ['1', '3', '5', '11', '14', '21', '22', '111', '112', '1001', '0', '25'],
    hints: ['Сначала посмотрите на две последние цифры: если n % 100 от 11 до 14 — всегда «штук».', 'Иначе решает последняя цифра n % 10: 1 → «штука», 2–4 → «штуки», остальные → «штук».'],
    solution: `#include <stdio.h>

int main(void) {
    int n, d1, d2;
    scanf("%d", &n);
    d2 = n % 100;
    d1 = n % 10;
    if (d2 >= 11 && d2 <= 14)
        printf("%d штук\\n", n);
    else if (d1 == 1)
        printf("%d штука\\n", n);
    else if (d1 >= 2 && d1 <= 4)
        printf("%d штуки\\n", n);
    else
        printf("%d штук\\n", n);
    return 0;
}
`,
  },
  {
    id: 't2-tritype', topic: 2, level: 'extreme', title: 'Вид треугольника',
    text: '<p>Даны три натуральных числа — стороны. Определите вид треугольника и выведите одно слово:</p><ul><li><code>NONE</code> — треугольник не существует;</li><li><code>EQUILATERAL</code> — равносторонний;</li><li><code>ISOSCELES</code> — равнобедренный (но не равносторонний);</li><li><code>RIGHT</code> — прямоугольный (a² + b² = c² для наибольшей стороны c);</li><li><code>SCALENE</code> — разносторонний, не прямоугольный.</li></ul>',
    input: 'Три натуральных числа (≤ 10 000).', output: 'Одно слово.',
    tests: ['3 4 5', '5 5 5', '5 5 8', '1 2 3', '4 5 6', '13 5 12', '6 10 8'],
    hints: ['Сначала найдите наибольшую сторону (переставьте переменные, чтобы c была максимальной).', 'Порядок проверок важен: NONE → EQUILATERAL → ISOSCELES → RIGHT → SCALENE.'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b, c, t;
    scanf("%d %d %d", &a, &b, &c);
    if (a > c) { t = a; a = c; c = t; }
    if (b > c) { t = b; b = c; c = t; }
    if (a + b <= c)
        printf("NONE\\n");
    else if (a == b && b == c)
        printf("EQUILATERAL\\n");
    else if (a == b || b == c || a == c)
        printf("ISOSCELES\\n");
    else if (a * a + b * b == c * c)
        printf("RIGHT\\n");
    else
        printf("SCALENE\\n");
    return 0;
}
`,
  },

  // ——————————— ТЕМА 3 ———————————
  {
    id: 't3-sumn', topic: 3, level: 'easy', title: 'Сумма от 1 до n',
    text: '<p>Дано натуральное n. Найдите сумму 1 + 2 + … + n с помощью цикла.</p><p>Внимание: при n = 100 000 сумма больше максимального int!</p>',
    input: 'Натуральное число n ≤ 100 000.', output: 'Сумма.',
    tests: ['1', '10', '20', '1000', '100000'],
    hints: ['Сумма должна иметь тип long (и выводиться через %ld).', 'Не забудьте sum = 0 перед циклом.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, i;
    long sum = 0;
    scanf("%d", &n);
    for (i = 1; i <= n; i++)
        sum += i;
    printf("%ld\\n", sum);
    return 0;
}
`,
  },
  {
    id: 't3-fact', topic: 3, level: 'easy', title: 'Факториал',
    text: '<p>Дано целое 0 ≤ n ≤ 20. Выведите n! = 1 · 2 · … · n (по определению 0! = 1).</p>',
    input: 'Целое число 0 ≤ n ≤ 20.', output: 'n!',
    tests: ['0', '1', '5', '10', '13', '20'],
    hints: ['13! уже не помещается в int — используйте long и %ld.', 'Начальное значение произведения — 1, а не 0.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, i;
    long f = 1;
    scanf("%d", &n);
    for (i = 2; i <= n; i++)
        f *= i;
    printf("%ld\\n", f);
    return 0;
}
`,
  },
  {
    id: 't3-power', topic: 3, level: 'easy', title: 'Степень числа (упр. 3.3)',
    text: '<p>Даны натуральные n и k. Вычислите n<sup>k</sup> с помощью цикла (без функции pow).</p>',
    input: 'n и k; гарантируется, что nᵏ < 9·10¹⁸.', output: 'nᵏ.',
    tests: ['2 10', '3 13', '7 1', '2 62', '10 18', '5 3'],
    hints: ['Умножайте результат на n ровно k раз.', 'Тип результата — long.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, k, i;
    long p = 1;
    scanf("%d %d", &n, &k);
    for (i = 0; i < k; i++)
        p *= n;
    printf("%ld\\n", p);
    return 0;
}
`,
  },
  {
    id: 't3-sum0', topic: 3, level: 'easy', title: 'Сумма до нуля (упр. 3.2)',
    text: '<p>Вводятся целые числа, пока не встретится 0. Выведите сумму введённых чисел.</p>',
    input: 'Последовательность целых чисел, заканчивающаяся нулём.', output: 'Сумма.',
    tests: ['1 2 3 0', '0', '5 -5 10 0', '100\n200\n300\n0', '-1 -2 -3 0'],
    hints: ['Удобен цикл do-while: сначала прочитать, потом проверить.'],
    solution: `#include <stdio.h>

int main(void) {
    int x, sum = 0;
    do {
        scanf("%d", &x);
        sum += x;
    } while (x != 0);
    printf("%d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 't3-table', topic: 3, level: 'easy', title: 'Таблица умножения', check: 'exact',
    text: '<p>Дано n (1 ≤ n ≤ 9). Выведите таблицу умножения n × n: в строке i стоят произведения i·1, i·2, …, i·n, каждое в поле шириной 4 символа (<code>%4d</code>).</p><p>Пример для n = 3:</p><pre>   1   2   3\n   2   4   6\n   3   6   9</pre>',
    input: 'Целое n.', output: 'n строк таблицы.',
    tests: ['3', '1', '9', '5'],
    hints: ['Два вложенных цикла: внешний по строкам i, внутренний по столбцам j.', 'После каждой строки — printf("\\n").'],
    solution: `#include <stdio.h>

int main(void) {
    int n, i, j;
    scanf("%d", &n);
    for (i = 1; i <= n; i++) {
        for (j = 1; j <= n; j++)
            printf("%4d", i * j);
        printf("\\n");
    }
    return 0;
}
`,
  },
  {
    id: 't3-prime', topic: 3, level: 'hard', title: 'Простое число (упр. 3.1)',
    text: '<p>Дано натуральное n. Определите, является ли оно простым (делится только на 1 и на себя). Выведите <code>YES</code> или <code>NO</code>. Число 1 простым не считается.</p>',
    input: 'Натуральное число n ≤ 2·10⁹.', output: 'YES или NO.',
    tests: ['1', '2', '17', '221', '7919', '1000003', '1000000'],
    hints: ['Делители достаточно искать от 2 до √n: условие цикла d * d <= n.', 'Нашли делитель — можно сразу выйти из цикла через break.', 'Для больших n произведение d * d может переполнить int — используйте long.'],
    solution: `#include <stdio.h>

int main(void) {
    long n, d;
    int prime = 1;
    scanf("%ld", &n);
    if (n < 2) prime = 0;
    for (d = 2; d * d <= n; d++) {
        if (n % d == 0) {
            prime = 0;
            break;
        }
    }
    printf(prime ? "YES\\n" : "NO\\n");
    return 0;
}
`,
  },
  {
    id: 't3-gcdlcm', topic: 3, level: 'hard', title: 'НОД и НОК',
    text: '<p>Даны два натуральных числа. Найдите их наибольший общий делитель (алгоритм Евклида) и наименьшее общее кратное. Выведите через пробел.</p><p>НОК(a, b) = a · b / НОД(a, b).</p>',
    input: 'Два натуральных числа ≤ 10⁹.', output: 'НОД и НОК.',
    tests: ['84 36', '7 13', '12 12', '1 1000000000', '1000000000 999999999', '48 180'],
    hints: ['Евклид: пока b ≠ 0: r = a % b; a = b; b = r.', 'НОК может быть больше int — считайте в long. Сначала поделите, потом умножайте: a / НОД * b.'],
    solution: `#include <stdio.h>

int main(void) {
    long a, b, x, y, r;
    scanf("%ld %ld", &a, &b);
    x = a;
    y = b;
    while (y != 0) {
        r = x % y;
        x = y;
        y = r;
    }
    printf("%ld %ld\\n", x, a / x * b);
    return 0;
}
`,
  },
  {
    id: 't3-fib', topic: 3, level: 'hard', title: 'Числа Фибоначчи',
    text: '<p>Последовательность Фибоначчи: F₁ = F₂ = 1, Fₙ = Fₙ₋₁ + Fₙ₋₂. Дано n — выведите Fₙ.</p>',
    input: 'Натуральное n ≤ 90.', output: 'Fₙ.',
    tests: ['1', '2', '10', '47', '50', '90'],
    hints: ['Храните два последних числа: a и b. На каждом шаге: c = a + b; a = b; b = c.', 'F₄₇ уже больше int — используйте long long (%lld).'],
    solution: `#include <stdio.h>

int main(void) {
    int n, i;
    long long a = 1, b = 1, c;
    scanf("%d", &n);
    for (i = 3; i <= n; i++) {
        c = a + b;
        a = b;
        b = c;
    }
    printf("%lld\\n", b);
    return 0;
}
`,
  },
  {
    id: 't3-digits', topic: 3, level: 'hard', title: 'Цифры числа',
    text: '<p>Дано целое число (возможно, отрицательное). Выведите количество его цифр и их сумму через пробел. У числа 0 одна цифра.</p>',
    input: 'Целое число, |n| ≤ 2·10⁹.', output: 'Количество цифр и сумма цифр.',
    tests: ['12345', '0', '-908', '7', '2000000000', '-1'],
    hints: ['Сначала возьмите модуль числа.', 'Цикл do-while удобен: он обработает и n = 0.'],
    solution: `#include <stdio.h>

int main(void) {
    long n;
    int count = 0, sum = 0;
    scanf("%ld", &n);
    if (n < 0) n = -n;
    do {
        sum += n % 10;
        count++;
        n /= 10;
    } while (n > 0);
    printf("%d %d\\n", count, sum);
    return 0;
}
`,
  },
  {
    id: 't3-divisors', topic: 3, level: 'hard', title: 'Количество делителей',
    text: '<p>Дано натуральное n. Сколько у него натуральных делителей (включая 1 и n)?</p>',
    input: 'Натуральное n ≤ 10⁹.', output: 'Число делителей.',
    tests: ['1', '12', '13', '36', '1000000', '735134400'],
    hints: ['Делители идут парами: d и n/d. Перебирайте d до √n и добавляйте по 2.', 'Если d * d == n — это один делитель, а не два.'],
    solution: `#include <stdio.h>

int main(void) {
    long n, d;
    int cnt = 0;
    scanf("%ld", &n);
    for (d = 1; d * d <= n; d++) {
        if (n % d == 0) {
            if (d * d == n) cnt += 1;
            else cnt += 2;
        }
    }
    printf("%d\\n", cnt);
    return 0;
}
`,
  },
  {
    id: 't3-harmonic', topic: 3, level: 'hard', title: 'Гармонический ряд',
    text: '<p>Вычислите сумму Hₙ = 1 + 1/2 + 1/3 + … + 1/n. Выведите с точностью 6 знаков.</p>',
    input: 'Натуральное n ≤ 100 000.', output: 'Hₙ в формате %.6f.',
    tests: ['1', '2', '10', '1000', '100000'],
    hints: ['1/i для целого i даёт 0! Пишите 1.0 / i.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, i;
    double h = 0;
    scanf("%d", &n);
    for (i = 1; i <= n; i++)
        h += 1.0 / i;
    printf("%.6f\\n", h);
    return 0;
}
`,
  },
  {
    id: 't3-palindrome', topic: 3, level: 'hard', title: 'Число-палиндром',
    text: '<p>Дано неотрицательное целое n. Читается ли оно одинаково слева направо и справа налево? Выведите <code>YES</code> или <code>NO</code>.</p>',
    input: 'Целое 0 ≤ n ≤ 2·10⁹.', output: 'YES или NO.',
    tests: ['12321', '123', '7', '1221', '10', '0', '2000000002'],
    hints: ['Постройте перевёрнутое число в цикле: rev = rev * 10 + n % 10; n /= 10.', 'Сравните перевёрнутое с исходным (сохраните исходное заранее!). Перевёрнутое может не поместиться в int.'],
    solution: `#include <stdio.h>

int main(void) {
    long n, m, rev = 0;
    scanf("%ld", &n);
    m = n;
    while (m > 0) {
        rev = rev * 10 + m % 10;
        m /= 10;
    }
    printf(rev == n ? "YES\\n" : "NO\\n");
    return 0;
}
`,
  },
  {
    id: 't3-perfect', topic: 3, level: 'extreme', title: 'Совершенные числа',
    text: '<p>Число называется <b>совершенным</b>, если оно равно сумме своих делителей, меньших его самого: 6 = 1 + 2 + 3. Выведите все совершенные числа от 2 до n через пробел в порядке возрастания. Если таких нет — выведите <code>NONE</code>.</p>',
    input: 'Натуральное n ≤ 1000.', output: 'Совершенные числа или NONE.',
    tests: ['5', '6', '30', '500', '1000'],
    hints: ['Внешний цикл по числам m, внутренний — по возможным делителям d < m.', 'Ускорение: собирайте пары делителей до √m.', 'Чтобы вывести NONE, заведите счётчик найденных чисел.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, m, d, s, found = 0;
    scanf("%d", &n);
    for (m = 2; m <= n; m++) {
        s = 1;
        for (d = 2; d * d <= m; d++) {
            if (m % d == 0) {
                s += d;
                if (d * d != m) s += m / d;
            }
        }
        if (s == m) {
            if (found) printf(" ");
            printf("%d", m);
            found++;
        }
    }
    if (!found) printf("NONE");
    printf("\\n");
    return 0;
}
`,
  },
  {
    id: 't3-collatz', topic: 3, level: 'extreme', title: 'Гипотеза Коллатца',
    text: '<p>Возьмём число x. Если оно чётное — делим пополам, если нечётное — заменяем на 3x + 1. Гипотеза гласит: из любого числа мы придём к 1. Число шагов до 1 назовём длиной пути (для 1 длина 0, для 6: 6→3→10→5→16→8→4→2→1 — 8 шагов).</p><p>Среди чисел от 1 до n найдите то, у которого путь самый длинный. Выведите это число и длину пути. Если таких несколько — наименьшее.</p>',
    input: 'Натуральное n ≤ 1000.', output: 'Число и длина пути.',
    tests: ['1', '6', '10', '100', '1000'],
    hints: ['Для каждого m от 1 до n посчитайте длину пути отдельным циклом while (x != 1).', 'Промежуточные значения могут быть большими — используйте long для x.', 'Обновляйте максимум только при строгом «больше» — тогда останется наименьшее число.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, m, steps, best = 1, bestSteps = 0;
    long x;
    scanf("%d", &n);
    for (m = 1; m <= n; m++) {
        x = m;
        steps = 0;
        while (x != 1) {
            if (x % 2 == 0) x /= 2;
            else x = 3 * x + 1;
            steps++;
        }
        if (steps > bestSteps) {
            bestSteps = steps;
            best = m;
        }
    }
    printf("%d %d\\n", best, bestSteps);
    return 0;
}
`,
  },
  {
    id: 't3-pi', topic: 3, level: 'extreme', title: 'Число π по ряду Лейбница',
    text: '<p>π/4 = 1 − 1/3 + 1/5 − 1/7 + … Суммируйте члены ряда, пока модуль очередного члена <b>не меньше</b> ε (члены, меньшие ε, не добавляются). Выведите полученное приближение π (с точностью 6 знаков) и количество сложенных членов.</p>',
    input: 'Вещественное 0 < ε ≤ 1.', output: 'Приближение π (%.6f) и число членов.',
    tests: ['1', '0.1', '0.01', '0.001', '0.0001'],
    hints: ['k-й член (k = 0, 1, 2, …) равен ±1/(2k+1); знак чередуется.', 'Цикл while (1.0 / (2 * k + 1) >= eps) { … }', 'Удобно хранить знак в переменной sign = 1, и на каждом шаге sign = -sign.'],
    solution: `#include <stdio.h>

int main(void) {
    double eps, sum = 0, sign = 1;
    int k = 0;
    scanf("%lf", &eps);
    while (1.0 / (2 * k + 1) >= eps) {
        sum += sign / (2 * k + 1);
        sign = -sign;
        k++;
    }
    printf("%.6f %d\\n", 4 * sum, k);
    return 0;
}
`,
  },
  {
    id: 't3-newton', topic: 3, level: 'extreme', title: 'Корень методом Ньютона',
    text: '<p>Вычислите √x без функции sqrt с помощью итераций Герона (метода Ньютона): начните с y = x (или y = 1, если x &lt; 1) и повторяйте y = (y + x / y) / 2, пока два соседних значения отличаются больше чем на 10⁻¹². Выведите результат с точностью 6 знаков и количество выполненных итераций.</p><p>Для x = 0 выведите <code>0.000000 0</code>.</p>',
    input: 'Вещественное число 0 ≤ x ≤ 10⁹.', output: '√x (%.6f) и число итераций.',
    tests: ['0', '1', '2', '0.25', '144', '1000000000'],
    hints: ['Модуль разности — fabs из <math.h>, или (d < 0 ? -d : d).', 'Цикл do-while: вычислить новое значение, сравнить со старым.'],
    solution: `#include <stdio.h>
#include <math.h>

int main(void) {
    double x, y, prev;
    int it = 0;
    scanf("%lf", &x);
    if (x == 0) {
        printf("0.000000 0\\n");
        return 0;
    }
    y = (x < 1) ? 1 : x;
    do {
        prev = y;
        y = (y + x / y) / 2;
        it++;
    } while (fabs(y - prev) > 1e-12);
    printf("%.6f %d\\n", y, it);
    return 0;
}
`,
  },
  {
    id: 't3-armstrong', topic: 3, level: 'extreme', title: 'Числа Армстронга',
    text: '<p>Натуральное число из k цифр называется числом Армстронга, если оно равно сумме своих цифр, возведённых в степень k. Например, 153 = 1³ + 5³ + 3³. Выведите все такие числа на отрезке [a, b] через пробел, либо <code>NONE</code>.</p>',
    input: 'Два натуральных числа 1 ≤ a ≤ b ≤ 10 000.', output: 'Числа Армстронга или NONE.',
    tests: ['1 9', '10 99', '100 500', '1 10000', '1000 1633'],
    hints: ['Сначала посчитайте k — количество цифр числа.', 'Возведение цифры в степень — вложенный цикл (pow с double может дать ошибку округления).'],
    solution: `#include <stdio.h>

int main(void) {
    int a, b, m, t, k, d, s, p, i, found = 0;
    scanf("%d %d", &a, &b);
    for (m = a; m <= b; m++) {
        k = 0;
        t = m;
        while (t > 0) { k++; t /= 10; }
        s = 0;
        t = m;
        while (t > 0) {
            d = t % 10;
            p = 1;
            for (i = 0; i < k; i++) p *= d;
            s += p;
            t /= 10;
        }
        if (s == m) {
            if (found) printf(" ");
            printf("%d", m);
            found = 1;
        }
    }
    if (!found) printf("NONE");
    printf("\\n");
    return 0;
}
`,
  },
  // ——————————————————— ТЕМА 4 ———————————————————
  {
    id: 't4-primes', topic: 4, level: 'easy', title: 'Все простые числа до n (упр. 4.1)',
    text: '<p>Выведите через пробел все простые числа от 1 до n. Простое число — натуральное число больше 1, которое делится только на 1 и на само себя.</p>',
    input: 'Натуральное число 1 ≤ n ≤ 1000.', output: 'Простые числа через пробел (пустая строка, если их нет).',
    tests: ['10', '2', '30', '100', '1000'],
    hints: ['Внешний цикл перебирает числа m от 2 до n, внутренний — делители d от 2, пока d * d <= m.', 'Как только нашёлся делитель, внутренний цикл можно прервать через break.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, m, d, prime;
    scanf("%d", &n);
    for (m = 2; m <= n; m++) {
        prime = 1;
        for (d = 2; d * d <= m; d++)
            if (m % d == 0) { prime = 0; break; }
        if (prime) printf("%d ", m);
    }
    printf("\\n");
    return 0;
}
`,
  },
  {
    id: 't4-triangle', topic: 4, level: 'easy', title: 'Числовой треугольник (упр. 4.2)', check: 'exact',
    text: '<p>По числу n выведите n строк: в строке с номером i число i повторяется i раз через пробел.</p><pre>1\n2 2\n3 3 3\n4 4 4 4</pre>',
    input: 'Натуральное число 1 ≤ n ≤ 20.', output: 'n строк треугольника.',
    tests: ['1', '4', '9', '12'],
    hints: ['Внутренний цикл выполняется i раз, где i — счётчик внешнего.', 'После внутреннего цикла выведите \\n.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, i, j;
    scanf("%d", &n);
    for (i = 1; i <= n; i++) {
        for (j = 1; j <= i; j++)
            printf("%d ", i);
        printf("\\n");
    }
    return 0;
}
`,
  },
  {
    id: 't4-chess', topic: 4, level: 'easy', title: 'Шахматная доска', check: 'exact',
    text: '<p>Выведите доску n × n из символов <code>#</code> и <code>.</code>: в левом верхнем углу стоит <code>#</code>, соседние по горизонтали и вертикали клетки различаются.</p><pre>#.#\n.#.\n#.#</pre>',
    input: 'Натуральное число 1 ≤ n ≤ 20.', output: 'n строк по n символов без пробелов.',
    tests: ['1', '3', '4', '8'],
    hints: ['Клетка (i, j) чёрная, если (i + j) чётно.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, i, j;
    scanf("%d", &n);
    for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++)
            putchar((i + j) % 2 == 0 ? '#' : '.');
        putchar('\\n');
    }
    return 0;
}
`,
  },
  {
    id: 't4-safe', topic: 4, level: 'hard', title: 'Сумма и произведение без переполнения (упр. 4.3)',
    text: '<p>Даны два числа типа int (в том числе отрицательные). Выведите в первой строке их сумму, во второй — произведение. Если результат не помещается в int, вместо него выведите <code>overflow</code>.</p><p>Проверку нужно сделать <b>до</b> вычисления, например через обратную операцию: сумма переполнится, если <code>b &gt; 0 &amp;&amp; a &gt; INT_MAX - b</code>.</p>',
    input: 'Два целых числа из диапазона int.', output: 'Сумма (или overflow) и произведение (или overflow) — по одному на строке.',
    tests: ['2 3', '2000000000 200000000', '-2000000000 -200000000', '46341 46341', '-46341 46341', '-2147483648 -1', '0 -2147483648', '65536 -32768'],
    hints: ['Константы INT_MAX и INT_MIN — в <limits.h>.', 'Для произведения удобно сравнить с границами частное: при a > 0 и b > 0 переполнение, если a > INT_MAX / b.', 'Можно проверить и так: посчитать (long)a * b и сравнить с INT_MAX и INT_MIN — long вмещает любое произведение двух int.'],
    solution: `#include <stdio.h>
#include <limits.h>

int main(void) {
    int a, b;
    long p;
    scanf("%d %d", &a, &b);
    if ((b > 0 && a > INT_MAX - b) || (b < 0 && a < INT_MIN - b))
        printf("overflow\\n");
    else
        printf("%d\\n", a + b);
    p = (long)a * b;
    if (p > INT_MAX || p < INT_MIN)
        printf("overflow\\n");
    else
        printf("%ld\\n", p);
    return 0;
}
`,
  },
  {
    id: 't4-cattle', topic: 4, level: 'hard', title: 'Задача о покупке скота',
    text: '<p>Бык стоит 10 рублей, корова — 5 рублей, телёнок — 0,5 рубля. На n рублей нужно купить ровно n голов скота. Выведите все варианты в порядке возрастания числа быков, затем коров — по одному на строке в виде <code>b k t</code>. Последней строкой выведите количество вариантов.</p><p>Постарайтесь обойтись двумя вложенными циклами, а не тремя.</p>',
    input: 'Натуральное число 1 ≤ n ≤ 1000.', output: 'Строки «b k t» и число вариантов.',
    tests: ['100', '10', '19', '200', '1000'],
    hints: ['Умножьте уравнение стоимости на 2: 20b + 10k + t = 2n.', 'Зная b и k, число телят считается сразу: t = n − b − k. Проверьте, что t ≥ 0 и стоимость сходится.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, b, k, t, cnt = 0;
    scanf("%d", &n);
    for (b = 0; 10 * b <= n; b++)
        for (k = 0; 10 * b + 5 * k <= n; k++) {
            t = n - b - k;
            if (t >= 0 && 20 * b + 10 * k + t == 2 * n) {
                printf("%d %d %d\\n", b, k, t);
                cnt++;
            }
        }
    printf("%d\\n", cnt);
    return 0;
}
`,
  },
  {
    id: 't4-pythag', topic: 4, level: 'hard', title: 'Пифагоровы тройки',
    text: '<p>Найдите все тройки натуральных чисел a &lt; b &lt; c ≤ n, для которых a² + b² = c². Выведите их по одной на строке в порядке возрастания a, затем b, а последней строкой — их количество.</p>',
    input: 'Натуральное число 1 ≤ n ≤ 100.', output: 'Тройки «a b c» и их количество.',
    tests: ['5', '4', '20', '50', '100'],
    hints: ['Достаточно перебрать a и b, а c проверить: c = (int)sqrt(a*a + b*b), затем c * c == a*a + b*b.', 'Без sqrt: третий цикл по c от b + 1 можно прервать через break, как только c * c станет больше a² + b².'],
    solution: `#include <stdio.h>

int main(void) {
    int n, a, b, c, cnt = 0;
    scanf("%d", &n);
    for (a = 1; a <= n; a++)
        for (b = a + 1; b <= n; b++)
            for (c = b + 1; c <= n; c++) {
                if (c * c > a * a + b * b) break;
                if (c * c == a * a + b * b) {
                    printf("%d %d %d\\n", a, b, c);
                    cnt++;
                }
            }
    printf("%d\\n", cnt);
    return 0;
}
`,
  },
  {
    id: 't4-coins', topic: 4, level: 'hard', title: 'Размен монетами',
    text: '<p>Сколькими способами можно набрать сумму n рублей монетами по 1, 2, 5 и 10 рублей? Способы, отличающиеся только порядком монет, считаются одинаковыми.</p>',
    input: 'Целое число 0 ≤ n ≤ 1000.', output: 'Количество способов.',
    tests: ['0', '4', '10', '27', '100', '1000'],
    hints: ['Переберите количество десяток и пятёрок вложенными циклами. Рубли добирают остаток, так что их отдельно перебирать не нужно.', 'Если после десяток и пятёрок осталось r рублей, двоек можно взять 0, 1, …, r/2 — это r/2 + 1 способ. Третий цикл не нужен.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, a, b;
    long cnt = 0;
    scanf("%d", &n);
    for (a = 0; 10 * a <= n; a++)
        for (b = 0; 10 * a + 5 * b <= n; b++)
            cnt += (n - 10 * a - 5 * b) / 2 + 1;   /* двоек от 0 до остаток/2, рубли добирают */
    printf("%ld\\n", cnt);
    return 0;
}
`,
  },
  {
    id: 't4-fact', topic: 4, level: 'extreme', title: 'Факториал с контролем переполнения',
    text: '<p>Вычислите k! в типе long. Если на каком-то шаге произведение не помещается в long, выведите <code>overflow at i</code>, где i — множитель, на котором произошло бы переполнение. Проверку делайте до умножения, через LONG_MAX из &lt;limits.h&gt;.</p>',
    input: 'Целое число 0 ≤ k ≤ 100.', output: 'k! или overflow at i.',
    tests: ['0', '5', '15', '20', '21', '100'],
    hints: ['Умножение f * i переполнится, если f > LONG_MAX / i.', 'После вывода overflow цикл можно прервать через break.'],
    solution: `#include <stdio.h>
#include <limits.h>

int main(void) {
    int k, i, ok = 1;
    long f = 1;
    scanf("%d", &k);
    for (i = 2; i <= k; i++) {
        if (f > LONG_MAX / i) {
            printf("overflow at %d\\n", i);
            ok = 0;
            break;
        }
        f *= i;
    }
    if (ok) printf("%ld\\n", f);
    return 0;
}
`,
  },
  {
    id: 't4-taxicab', topic: 4, level: 'extreme', title: 'Числа такси',
    text: '<p>Число 1729 можно двумя разными способами представить в виде суммы кубов двух натуральных чисел: 1729 = 1³ + 12³ = 9³ + 10³. Выведите через пробел в порядке возрастания все числа, не превосходящие n, у которых есть хотя бы два разных таких представления (a ≤ b). Если таких чисел нет, выведите <code>NONE</code>.</p><p>Прямой перебор всех пар для каждого числа слишком медленный — придумайте, как сократить число проверок.</p>',
    input: 'Натуральное число 1 ≤ n ≤ 5000.', output: 'Числа через пробел или NONE.',
    tests: ['1000', '1729', '4103', '5000'],
    hints: ['Метод двух указателей: a начинается с 1, b — с наибольшего числа, для которого b³ < m. Если a³ + b³ < m, увеличиваем a, если больше — уменьшаем b.', 'Цикл двух указателей заканчивается, когда a > b.'],
    solution: `#include <stdio.h>

int main(void) {
    int n, m, a, b, s, ways, found = 0;
    scanf("%d", &n);
    for (m = 2; m <= n; m++) {
        b = 1;
        while ((b + 1) * (b + 1) * (b + 1) < m) b++;
        a = 1;
        ways = 0;
        while (a <= b) {
            s = a * a * a + b * b * b;
            if (s == m) { ways++; a++; b--; }
            else if (s < m) a++;
            else b--;
        }
        if (ways >= 2) {
            if (found) printf(" ");
            printf("%d", m);
            found = 1;
        }
    }
    if (!found) printf("NONE");
    printf("\\n");
    return 0;
}
`,
  },
];

export const STARTER = `#include <stdio.h>

int main(void) {

    return 0;
}
`;

// ——— проверка ответа ———
const normNum = (s) => s.replace(/(\d),(\d)/g, '$1.$2');
const tokens = (s) => normNum(s).split(/\s+/).filter(Boolean);
const isNum = (t) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t);

export function compareOutput(got, expected, mode = 'tail') {
  if (mode === 'exact') {
    const clean = (s) => s.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
    return clean(got) === clean(expected);
  }
  const e = tokens(expected), g = tokens(got);
  if (e.length === 0) return g.length === 0;
  if (g.length < e.length) return false;
  const tail = g.slice(g.length - e.length);
  return e.every((t, i) => {
    const u = tail[i];
    if (isNum(t) && isNum(u)) {
      // одинаковая запись (число знаков после точки) и равные значения; -0.000 == 0.000
      const dt = (t.split('.')[1] || '').length, du = (u.split('.')[1] || '').length;
      return dt === du && t.includes('.') === u.includes('.') && Math.abs(Number(t) - Number(u)) < 1e-9;
    }
    return t.toLowerCase() === u.toLowerCase();
  });
}

export const CHECK_NOTES = { tail: TAIL_NOTE, exact: EXACT_NOTE };
