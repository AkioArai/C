#include <stdio.h>
int main(void) {
    float f;
    double d;
    long double l;
    f = 1.2345678901234567890e-30;
    d = 1.2345678901234567890e-30;
    l = 1.2345678901234567890e-30;
    printf(" f=%.30e\n d=%.30e\n", f, d);
    float a = 0.1f, b = 0.2f;
    printf("%.10f %.20f %d\n", a + b, 0.1 + 0.2, 0.1 + 0.2 == 0.3);
    float s = 0; int i;
    for (i = 0; i < 10; i++) s += 0.1f;
    printf("%.9f %d\n", s, s == 1.0f);
    printf("%e %E %g %G %10.3e|%-12.4g|\n", 12345.678, 0.00012, 0.0001234, 1e20, 3.14159, 2.5);
    printf("%zu %zu %zu\n", sizeof(float), sizeof(double), sizeof f);
    f = 16777216.0f; f = f + 1.0f; printf("%.1f\n", f);
    return 0;
}
