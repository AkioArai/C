#include <stdio.h>
#include <stdlib.h>
void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; }
int sum(int *a, int n) { int s = 0; for (int i = 0; i < n; i++) s += *(a + i); return s; }
int cmp(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }
int apply(int (*f)(int), int x) { return f(x); }
int sq(int x) { return x * x; }
int main(void) {
    int x = 3, y = 7;
    swap(&x, &y);
    printf("%d %d\n", x, y);
    int a[5] = {5, 1, 4, 2, 3};
    int *p = a;
    p += 2;
    printf("%d %d %ld\n", *p, p[1], p - a);
    qsort(a, 5, sizeof(int), cmp);
    for (int i = 0; i < 5; i++) printf("%d ", a[i]);
    printf("| %d\n", sum(a, 5));
    int **pp = &p; **pp = 100;
    printf("%d %d\n", a[2], apply(sq, 9));
    int m[3][4];
    for (int i = 0; i < 3; i++) for (int j = 0; j < 4; j++) m[i][j] = i * 10 + j;
    int (*row)[4] = m + 1;
    printf("%d %d %lu %lu\n", m[2][3], row[0][2], sizeof m, sizeof m[0]);
    int *dyn = malloc(4 * sizeof *dyn);
    for (int i = 0; i < 4; i++) dyn[i] = i * i;
    dyn = realloc(dyn, 6 * sizeof(int));
    dyn[4] = 16; dyn[5] = 25;
    for (int i = 0; i < 6; i++) printf("%d,", dyn[i]);
    free(dyn);
    int *z = calloc(3, sizeof(int));
    printf(" %d%d%d\n", z[0], z[1], z[2]);
    free(z);
    char *names[] = {"one", "two", "three"};
    printf("%s %c %lu\n", names[2], *names[1], sizeof names / sizeof names[0]);
    return 0;
}
