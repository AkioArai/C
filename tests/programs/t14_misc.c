#include <stdio.h>
int counter(void) { static int c = 0; return ++c; }
int g = 5;
int arr2[2][3] = {1, 2, 3, 4, 5, 6};
long fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
int main(void) {
    counter(); counter();
    printf("%d %d\n", counter(), g);
    int i = 0;
loop:
    if (i < 3) { printf("%d ", i); i++; goto loop; }
    printf("\n%d %d %ld\n", arr2[1][0], arr2[0][2], fact(15));
    unsigned char c = 250; c += 10;
    short sh = -1; unsigned int u = sh;
    printf("%d %u %x %o\n", c, u, 255, 8);
    int bits = 0x1F & 0x0F | 0x30;
    printf("%d %d %d\n", bits, 1 << 4, -17 >> 2);
    double d = 10; int k = 3;
    printf("%.3f %d %.2e %g\n", d / k, (int)(d / k), d * 12345, 0.00001234);
    for (int j = 0, s = 0; j < 5; j++, s += j) if (j == 4) printf("s=%d\n", s);
    int vals[] = {3, 1, 4, 1, 5, 9, 2, 6};
    int n = sizeof(vals) / sizeof(vals[0]), max = vals[0];
    for (int j = 1; j < n; j++) if (vals[j] > max) max = vals[j];
    printf("n=%d max=%d\n", n, max);
    int x = 5;
    int *px = &x;
    printf("%d %d\n", *px * 2, (*px)++ + x);
    return 0;
}
