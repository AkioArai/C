// Примеры программ для лаборатории (по методичкам тем 1–3 и сверх того).

export const EXAMPLES = [
  {
    id: 'hello', group: 'Тема 1. Введение', title: 'Hello, world — первая вселенная',
    code: `#include <stdio.h>  /* подключаем закон ввода-вывода */

int main(void)       /* отсюда начинается выполнение */
{
    printf("hello, world\\n");  /* сигнал на экран */
    return 0;        /* программа завершилась успешно */
}
`,
  },
  {
    id: 'sum2', group: 'Тема 1. Введение', title: 'Сумма двух целых чисел (scanf)',
    code: `#include <stdio.h>

int main(void) {
    int a, b;    /* объявление переменных a и b типа int */
    long int c;  /* объявление переменной c типа long int */
    printf("Input a=");  /* строка-приглашение */
    scanf("%d", &a);     /* считывание целого числа по адресу &a */
    printf("Input b=");
    scanf("%d", &b);
    c = a + b;           /* вычисление суммы */
    printf("Result c=%ld\\n", c);
    return 0;
}
`,
  },
  {
    id: 'trace', group: 'Тема 1. Введение', title: 'Проследим за значениями переменных',
    code: `#include <stdio.h>

int main(void) {
    int    a, b = 3, c;   /* b=3, значения a и c не определены */
    double x, y = 3.6;    /* y=3.6, значение x не определено */
    a = 1 + b * (c = 2);          /* c=2, a=1+3*2=7 */
    x = a = 2 * a - (b = 2 * c + 1); /* b=5, a=9, x=9.0 */
    y = a / b + (double)a / b + a / y; /* 1 + 1.8 + 2.5 = 5.3 */
    printf("a=%d, b=%d, c=%d; x=%f, y=%f\\n", a, b, c, x, y);
    return 0;
}
`,
  },
  {
    id: 'format', group: 'Тема 1. Введение', title: 'Форматированный вывод printf',
    stdin: '3.14159\n',
    code: `#include <stdio.h>

int main(void) {
    int a = 12;
    double x;
    printf("Input real x: ");
    scanf("%lf", &x);           /* %lf — чтение double */
    printf("a=%5d=%05d\\n", a, a); /* ширина 5, с нулями */
    printf("x=%f=%.3f=%6.2f=%e\\n", x, x, x, x);
    return 0;
}
`,
  },
  {
    id: 'types', group: 'Тема 1. Введение', title: 'Типы, деление и приведение типов',
    code: `#include <stdio.h>

int main(void) {
    int a = 7, b = 2;
    double d1 = a / b;          /* целочисленное деление: 3 */
    double d2 = (double)a / b;  /* приведение типа: 3.5 */
    int r = a % b;              /* остаток: 1 */
    char ch = 'A' + 2;          /* символ — это число-код */
    printf("a/b = %d, a%%b = %d\\n", a / b, r);
    printf("d1 = %f, d2 = %f\\n", d1, d2);
    printf("ch = %c (код %d)\\n", ch, ch);
    printf("sizeof(int)=%lu, sizeof(double)=%lu\\n", sizeof(int), sizeof(double));
    return 0;
}
`,
  },
  {
    id: 'define', group: 'Тема 1. Введение', title: 'Константы #define: длина окружности',
    stdin: '2.5\n',
    code: `#include <stdio.h>
#define PI 3.14159265
#define INCH 2.54

int main(void) {
    double r, len;
    printf("Радиус (в дюймах): ");
    scanf("%lf", &r);
    len = 2 * PI * r * INCH;   /* PI и INCH — неподвижные звёзды */
    printf("Длина окружности: %.2f см\\n", len);
    return 0;
}
`,
  },
  {
    id: 'max2', group: 'Тема 2. Ветвления', title: 'Сравнение двух чисел (if-else if-else)',
    code: `#include <stdio.h>

int main(void) {
    int a, b;
    printf("Input a=");   scanf("%d", &a);
    printf("Input b=");   scanf("%d", &b);
    if (a > b)
        printf("a>b\\n");
    else if (a < b)
        printf("a<b\\n");
    else
        printf("a=b\\n");
    return 0;
}
`,
  },
  {
    id: 'ternary', group: 'Тема 2. Ветвления', title: 'Тернарная операция: максимум',
    stdin: '17 42\n',
    code: `#include <stdio.h>

int main(void) {
    int a, b, c;
    scanf("%d %d", &a, &b);
    c = (a > b) ? a : b;   /* c = max(a, b) */
    printf("max = %d\\n", c);
    printf("%d\\n", a > 5 && b < 100);  /* логическое выражение = 0 или 1 */
    return 0;
}
`,
  },
  {
    id: 'shtuki', group: 'Тема 2. Ветвления', title: 'switch: «штука / штуки / штук»',
    stdin: '3\n',
    code: `#include <stdio.h>

int main(void) {
    int k;
    char *flex;
    printf("Введите количество деталей: ");
    scanf("%d", &k);
    switch ((k <= 20) ? k : k % 10) {
        case 1:
            flex = "а";
            break;
        case 2:
        case 3:
        case 4:
            flex = "и";
            break;
        default:
            flex = "";
            break;
    }
    printf("Количество деталей: %d штук%s\\n", k, flex);
    return 0;
}
`,
  },
  {
    id: 'locale', group: 'Тема 2. Ветвления', title: 'Русский язык и setlocale',
    code: `#include <stdio.h>
#include <locale.h>

int main(void) {
    setlocale(LC_ALL, "");
    printf("Вывод русских букв.\\nРазделитель целой и дробной ");
    printf("части числа – запятая: %f\\n", 3.141592);
    return 0;
}
`,
  },
  {
    id: 'sum-while', group: 'Тема 3. Циклы', title: 'Сумма 1..20 — цикл while',
    code: `#include <stdio.h>

int main(void) {
    int i, sum;   /* i – текущее число, sum – сумма */
    sum = 0;
    i = 1;        /* установка начальных значений */
    while (i <= 20) {   /* проверка условия */
        sum += i;       /* sum = sum + i */
        i++;            /* переход к следующему числу */
    }
    printf("Сумма чисел от 1 до 20 равна %d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 'sum-do', group: 'Тема 3. Циклы', title: 'Сумма 1..20 — цикл do-while',
    code: `#include <stdio.h>

int main(void) {
    int i, sum;
    sum = 0;
    i = 1;
    do {
        sum += i;
        i++;
    } while (i <= 20);   /* условие проверяется в конце */
    printf("Сумма чисел от 1 до 20 равна %d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 'sum-for', group: 'Тема 3. Циклы', title: 'Сумма 1..20 — цикл for',
    code: `#include <stdio.h>

int main(void) {
    int i, sum;
    sum = 0;
    for (i = 1; i <= 20; i++)   /* инициализация; условие; изменение */
        sum += i;
    printf("Сумма чисел от 1 до 20 равна %d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 'fact', group: 'Тема 3. Циклы', title: 'Факториал n!',
    stdin: '10\n',
    code: `#include <stdio.h>

int main(void) {
    int n, i;         /* n – число, i – счётчик */
    long int fact;    /* значение факториала */
    printf("Введите число n: ");
    scanf("%d", &n);
    fact = 1;
    for (i = 1; i <= n; i++)
        fact *= i;    /* fact = fact * i */
    printf("Факториал %d! = %ld\\n", n, fact);
    return 0;
}
`,
  },
  {
    id: 'gcd', group: 'Тема 3. Циклы', title: 'НОД — алгоритм Евклида',
    stdin: '84 36\n',
    code: `#include <stdio.h>

int main(void) {
    long int a, b;
    printf("Введите два числа, не равные нулю: ");
    scanf("%ld %ld", &a, &b);
    do {
        if (a > b)  a %= b;
        else        b %= a;
    } while (a != 0 && b != 0);
    printf("НОД = %ld\\n", a + b);
    return 0;
}
`,
  },
  {
    id: 'incdec', group: 'Тема 3. Циклы', title: 'Префиксный и постфиксный инкремент',
    code: `#include <stdio.h>

int main(void) {
    int a = 5, b;
    b = ++a;   /* сначала a=a+1, потом b=a: a=6, b=6 */
    printf("b = ++a: a=%d, b=%d\\n", a, b);
    a = 5;
    b = a++;   /* сначала b=a, потом a=a+1: a=6, b=5 */
    printf("b = a++: a=%d, b=%d\\n", a, b);
    a *= b + 2;  /* a = a * (b + 2) */
    printf("a *= b + 2: a=%d\\n", a);
    return 0;
}
`,
  },
  {
    id: 'forjump', group: 'Тема 3. Циклы', title: 'Счётчик for можно менять внутри',
    code: `#include <stdio.h>

int main(void) {
    int i, k = 0;
    for (i = 1; i <= 10; i += 2) {
        i += 3;   /* такое действие допускается */
        printf("k=%d i=%d\\n", ++k, i);
    }             /* две итерации: «k=1 i=4» и «k=2 i=9» */
    printf("Result: i=%d\\n", i);
    return 0;
}
`,
  },
  {
    id: 'prime', group: 'Тема 3. Циклы', title: 'Простое ли число? (break)',
    stdin: '97\n',
    code: `#include <stdio.h>

int main(void) {
    int n, d, isPrime = 1;
    printf("n = ");
    scanf("%d", &n);
    if (n < 2) isPrime = 0;
    for (d = 2; d * d <= n; d++) {
        if (n % d == 0) {
            isPrime = 0;
            break;       /* делитель найден — дальше искать незачем */
        }
    }
    if (isPrime) printf("%d — простое\\n", n);
    else printf("%d — составное\\n", n);
    return 0;
}
`,
  },
  {
    id: 'quad', group: 'Математика', title: 'Квадратное уравнение (math.h)',
    stdin: '1 -3 2\n',
    code: `#include <stdio.h>
#include <math.h>

int main(void) {
    double a, b, c, D;
    printf("Коэффициенты a b c: ");
    scanf("%lf %lf %lf", &a, &b, &c);
    D = b * b - 4 * a * c;          /* дискриминант */
    if (D > 0) {
        double x1 = (-b + sqrt(D)) / (2 * a);
        double x2 = (-b - sqrt(D)) / (2 * a);
        printf("x1 = %.3f, x2 = %.3f\\n", x1, x2);
    } else if (D == 0) {
        printf("x = %.3f\\n", -b / (2 * a));
    } else {
        printf("Действительных корней нет\\n");
    }
    return 0;
}
`,
  },
  {
    id: 'fib', group: 'Математика', title: 'Функция и рекурсия: Фибоначчи',
    code: `#include <stdio.h>

int fib(int n) {
    if (n < 2)
        return n;            /* базовый случай */
    return fib(n - 1) + fib(n - 2);
}

int main(void) {
    int n = 5;
    printf("fib(%d) = %d\\n", n, fib(n));
    return 0;
}
`,
  },
  {
    id: 'series', group: 'Математика', title: 'Ряд Лейбница: приближаем π',
    code: `#include <stdio.h>
#include <math.h>

int main(void) {
    double sum = 0, term;
    int k = 0;
    do {
        term = (k % 2 == 0 ? 1.0 : -1.0) / (2 * k + 1);
        sum += term;
        k++;
    } while (fabs(term) > 1e-3);
    printf("pi ~ %.6f (членов ряда: %d)\\n", 4 * sum, k);
    printf("M_PI = %.6f\\n", M_PI);
    return 0;
}
`,
  },
  {
    id: 'array', group: 'Математика', title: 'Массив: среднее и максимум',
    code: `#include <stdio.h>

int main(void) {
    int a[6] = {4, 8, 15, 16, 23, 42};
    int i, max = a[0];
    double avg = 0;
    for (i = 0; i < 6; i++) {
        avg += a[i];
        if (a[i] > max) max = a[i];
    }
    avg /= 6;
    printf("Среднее = %.2f, максимум = %d\\n", avg, max);
    return 0;
}
`,
  },
  {
    id: 'bug-uninit', group: 'Типичные ошибки', title: 'Ошибка: забыли инициализировать сумму',
    code: `#include <stdio.h>

int main(void) {
    int i, sum;          /* sum не инициализирована — там мусор! */
    for (i = 1; i <= 5; i++)
        sum += i;
    printf("sum = %d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 'bug-amp', group: 'Типичные ошибки', title: 'Ошибка: scanf без &',
    stdin: '5\n',
    code: `#include <stdio.h>

int main(void) {
    int x = 0;
    printf("x = ");
    scanf("%d", x);      /* забыли & — scanf не знает, КУДА писать */
    printf("x*2 = %d\\n", x * 2);
    return 0;
}
`,
  },
  {
    id: 'bug-eq', group: 'Типичные ошибки', title: 'Ошибка: = вместо ==',
    stdin: '3\n',
    code: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    if (n = 5)           /* присваивание, а не сравнение! */
        printf("n равно пяти\\n");
    printf("n = %d\\n", n);
    return 0;
}
`,
  },
  {
    id: 'bug-semi', group: 'Типичные ошибки', title: 'Ошибка: ; после for',
    code: `#include <stdio.h>

int main(void) {
    int i;
    for (i = 0; i < 5; i++);   /* точка с запятой — пустое тело цикла! */
    {
        printf("i = %d\\n", i);
    }
    return 0;
}
`,
  },
  {
    id: 'bug-overflow', group: 'Типичные ошибки', title: 'Переполнение int',
    code: `#include <stdio.h>

int main(void) {
    int f = 1, i;
    for (i = 1; i <= 15; i++) {
        f *= i;              /* после 12! значение не помещается в int */
        printf("%d! = %d\\n", i, f);
    }
    return 0;
}
`,
  },
  {
    id: 'bug-inf', group: 'Типичные ошибки', title: 'Зацикливание (бесконечный цикл)',
    code: `#include <stdio.h>

int main(void) {
    int i = 1, sum = 0;
    while (i <= 10) {
        sum += i;            /* i не меняется — условие всегда истинно */
    }
    printf("%d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 'bubble', group: 'Математика', title: 'Сортировка пузырьком',
    code: `#include <stdio.h>

int main(void) {
    int a[6] = {5, 2, 9, 1, 7, 3};
    int n = 6;
    for (int i = 0; i < n - 1; i++)          /* проход по массиву */
        for (int j = 0; j < n - 1 - i; j++)  /* сравниваем соседей */
            if (a[j] > a[j + 1]) {
                int t = a[j];                /* обмен через t */
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
    for (int i = 0; i < n; i++)
        printf("%d ", a[i]);
    printf("\\n");
    return 0;
}
`,
  },
  {
    id: 'ptr-swap', group: 'Указатели и память', title: 'Указатели: обмен через swap',
    code: `#include <stdio.h>

void swap(int *a, int *b) {   /* a и b хранят АДРЕСА переменных */
    int t = *a;               /* *a — значение по адресу a */
    *a = *b;
    *b = t;
}

int main(void) {
    int x = 3, y = 7;
    int *p = &x;              /* p указывает на x */
    printf("x = %d, *p = %d\\n", x, *p);
    swap(&x, &y);             /* передаём адреса */
    printf("x = %d, y = %d\\n", x, y);
    return 0;
}
`,
  },
  {
    id: 'ptr-array', group: 'Указатели и память', title: 'Массив и арифметика указателей',
    code: `#include <stdio.h>

int main(void) {
    int a[5] = {10, 20, 30, 40, 50};
    int *p = a;               /* имя массива = адрес первого элемента */
    int sum = 0;
    for (int i = 0; i < 5; i++) {
        sum += *(p + i);      /* то же, что a[i] */
    }
    p += 2;                   /* сдвиг на 2 элемента (8 байт) */
    printf("sum = %d, *p = %d, p[1] = %d\\n", sum, *p, p[1]);
    return 0;
}
`,
  },
  {
    id: 'matrix', group: 'Указатели и память', title: 'Двумерный массив: матрица',
    code: `#include <stdio.h>
#define N 3

int main(void) {
    int m[N][N] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
    int t[N][N];
    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++)
            t[j][i] = m[i][j];        /* транспонирование */
    for (int i = 0; i < N; i++) {
        for (int j = 0; j < N; j++)
            printf("%3d", t[i][j]);
        printf("\\n");
    }
    return 0;
}
`,
  },
  {
    id: 'strings', group: 'Указатели и память', title: 'Строки: массив символов и \\0',
    stdin: 'Anna\n',
    code: `#include <stdio.h>
#include <string.h>

int main(void) {
    char name[16];
    char greet[32] = "Hi, ";
    printf("Имя: ");
    scanf("%15s", name);          /* имя массива — уже адрес, & не нужен */
    strcat(greet, name);          /* дописываем в конец */
    printf("%s! Длина: %lu\\n", greet, strlen(greet));
    for (int i = 0; name[i] != '\\0'; i++)
        printf("%c-", name[i]);
    printf("\\n");
    return 0;
}
`,
  },
  {
    id: 'malloc', group: 'Указатели и память', title: 'Динамический массив: malloc и free',
    stdin: '5\n',
    code: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int n;
    printf("Сколько чисел? ");
    scanf("%d", &n);
    int *a = malloc(n * sizeof(int));   /* блок в куче */
    if (a == NULL) return 1;
    for (int i = 0; i < n; i++)
        a[i] = i * i;
    for (int i = 0; i < n; i++)
        printf("%d ", a[i]);
    printf("\\n");
    free(a);                            /* вернуть память */
    return 0;
}
`,
  },
  {
    id: 'struct', group: 'Структуры и файлы', title: 'Структура: точки на плоскости',
    code: `#include <stdio.h>
#include <math.h>

typedef struct {
    double x, y;
} Point;

double dist(Point a, Point b) {
    return sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

int main(void) {
    Point p = {0, 0};
    Point q = {.x = 3, .y = 4};
    Point *ptr = &q;
    ptr->x += 1;                       /* то же, что (*ptr).x += 1 */
    printf("dist = %.3f\\n", dist(p, q));
    return 0;
}
`,
  },
  {
    id: 'students', group: 'Структуры и файлы', title: 'Массив структур: средний балл',
    code: `#include <stdio.h>

struct Student {
    char name[12];
    int marks[3];
};

double avg(const struct Student *s) {
    int sum = 0;
    for (int i = 0; i < 3; i++) sum += s->marks[i];
    return sum / 3.0;
}

int main(void) {
    struct Student g[3] = {
        {"Anna", {5, 4, 5}},
        {"Oleg", {3, 4, 4}},
        {"Ivan", {5, 5, 5}},
    };
    for (int i = 0; i < 3; i++)
        printf("%-6s %.2f\\n", g[i].name, avg(&g[i]));
    return 0;
}
`,
  },
  {
    id: 'list', group: 'Структуры и файлы', title: 'Связный список',
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *next;          /* указатель на следующий узел */
} Node;

Node *push(Node *head, int v) {
    Node *n = malloc(sizeof(Node));
    n->value = v;
    n->next = head;
    return n;
}

int main(void) {
    Node *head = NULL;
    for (int i = 1; i <= 3; i++)
        head = push(head, i * 10);
    for (Node *p = head; p != NULL; p = p->next)
        printf("%d -> ", p->value);
    printf("NULL\\n");
    while (head != NULL) {       /* освобождаем узлы */
        Node *t = head->next;
        free(head);
        head = t;
    }
    return 0;
}
`,
  },
  {
    id: 'file', group: 'Структуры и файлы', title: 'Файлы: запись и чтение',
    code: `#include <stdio.h>

int main(void) {
    FILE *f = fopen("squares.txt", "w");
    if (f == NULL) return 1;
    for (int i = 1; i <= 4; i++)
        fprintf(f, "%d %d\\n", i, i * i);
    fclose(f);

    f = fopen("squares.txt", "r");
    int a, b, sum = 0;
    while (fscanf(f, "%d %d", &a, &b) == 2)
        sum += b;
    fclose(f);
    printf("Сумма квадратов: %d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 'enum-macro', group: 'Структуры и файлы', title: 'enum, макросы, static',
    code: `#include <stdio.h>
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define SQR(x) ((x) * (x))

enum Day { MON = 1, TUE, WED, THU, FRI, SAT, SUN };

int counter(void) {
    static int calls = 0;       /* сохраняется между вызовами */
    return ++calls;
}

int main(void) {
    enum Day d = FRI;
    printf("FRI = %d, выходной: %s\\n", d, d >= SAT ? "да" : "нет");
    printf("MAX = %d, SQR(1+2) = %d\\n", MAX(3, 8), SQR(1 + 2));
    counter(); counter();
    printf("вызовов: %d\\n", counter());
    return 0;
}
`,
  },
  {
    id: 'nested-table', group: 'Тема 4. Вложенные циклы, переходы', title: 'Вложенный цикл: таблица умножения',
    code: `#include <stdio.h>

int main(void) {
    int i, j;
    for (i = 1; i <= 4; i++) {        /* внешний цикл: строки */
        for (j = 1; j <= 4; j++)      /* внутренний: выполняется целиком на каждой итерации внешнего */
            printf("%3d", i * j);
        printf("\\n");
    }
    return 0;
}
`,
  },
  {
    id: 'cattle', group: 'Тема 4. Вложенные циклы, переходы', title: 'Перебор: задача о покупке скота',
    code: `#include <stdio.h>

int main(void) {
    int b, k, t;
    for (b = 0; b <= 10; b++)           /* быки: 10 руб. */
        for (k = 0; k <= 20; k++) {     /* коровы: 5 руб. */
            t = 100 - (b + k);          /* телята вычисляются, а не перебираются */
            if (20*b + 10*k + t == 200)
                printf("быков %d, коров %d, телят %d\\n", b, k, t);
        }
    return 0;
}
`,
  },
  {
    id: 'break-continue', group: 'Тема 4. Вложенные циклы, переходы', title: 'break и continue',
    code: `#include <stdio.h>

int main(void) {
    int i;
    for (i = 1; i < 10; i++) {
        if (i == 3) continue;   /* пропустить остаток тела */
        if (i == 6) break;      /* выйти из цикла */
        printf("%d ", i);
    }
    printf("\\nПоследнее значение i=%d\\n", i);
    return 0;
}
`,
  },
  {
    id: 'goto-exit', group: 'Тема 4. Вложенные циклы, переходы', title: 'goto: выход из вложенных циклов',
    code: `#include <stdio.h>

int main(void) {
    int i, j;
    for (i = 1; i <= 9; i++)
        for (j = 1; j <= 9; j++)
            if (i * j == 42)
                goto found;         /* сразу из обоих циклов */
    printf("не нашли\\n");
    return 0;
found:
    printf("%d * %d = 42\\n", i, j);
    return 0;
}
`,
  },
  {
    id: 'overflow', group: 'Тема 4. Вложенные циклы, переходы', title: 'Переполнение и limits.h',
    code: `#include <stdio.h>
#include <limits.h>

int main(void) {
    unsigned int a = UINT_MAX - 5;
    int b = INT_MAX;
    a += 10;                           /* счёт по кругу: 0, 1, 2, ... */
    printf("a = %u\\n", a);
    if (b <= INT_MAX - 1) b = b + 1;   /* проверка обратной операцией */
    else printf("b + 1 не помещается в int\\n");
    b = b + 1;                         /* а здесь переполнение */
    printf("b = %d\\n", b);
    return 0;
}
`,
  },
];
