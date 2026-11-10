#include <stdio.h>
#include <math.h>
#include <stdlib.h>
#define N 71
int main(void) {
    double y[N], min, sum = 0; int i, k = 0;
    for (i = 0; i < N; i++) y[i] = 4 * sin(3 * (-7 + 0.2 * i));
    min = y[0];
    for (i = 0; i < N; i += 2) if (y[i] < min) min = y[i];
    for (i = 0; i < N; i++) if (y[i] < 0) { sum += y[i]; k++; }
    printf("%.6f\n%.6f\n", min, sum / k);
    int m[8] = {5, -3, 12, 7, 0, 9, -1, 4}, *p, *end = m + 8, s = 0, mx;
    for (p = m; p < end; p++) s += *p;
    mx = *m;
    for (p = m + 1; p != end; ++p) if (*p > mx) mx = *p;
    printf("%d %d %ld %d %d\n", s, mx, (long)(end - m), *(m + 2), p[-1]);
    int t[3][4], j;
    for (i = 0; i < 3; i++) for (j = 0; j < 4; j++) t[i][j] = i * 4 + j;
    printf("%d %d %zu %zu\n", t[2][3], *(*(t + 1) + 2), sizeof m / sizeof m[0], sizeof t);
    double *q = y; q += 3; printf("%.4f %d\n", *q, (int)(q - y));
    srand(1); int lo = -5, hi = 5; int v = lo + rand() % (hi - lo + 1); printf("%d\n", v >= lo && v <= hi);
    return 0;
}
