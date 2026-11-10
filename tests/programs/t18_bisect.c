#include <stdio.h>
#include <math.h>
double f(double x) { return 2 * x - 15 * log(x + 4) + 18; }
int main(void) {
    double a = -3, b = 15, h = (b - a) / 64, l, r, c;
    int i;
    for (i = 0; i < 64; i++) {
        l = a + i * h; r = l + h;
        if (f(l) * f(r) > 0) continue;
        while (r - l > 1e-8) {
            c = (l + r) / 2;
            if (f(l) * f(c) <= 0) r = c; else l = c;
        }
        printf("%.8f\n", (l + r) / 2);
    }
    return 0;
}
