#include <stdio.h>
#include <math.h>
int main(void) {
    double x, y, z = 0.0;
    x = (1.0 + 1.0e30) + -1.0e30;
    y = 1.0 + (1.0e30 + -1.0e30);
    printf(" x=%e\n y=%e\n", x, y);
    printf("%f %f %f\n", 1.0 / z, -1.0 / z, z / z);
    printf("%f\n", sqrt(-1.0));
    printf("%d %d %d\n", isnan(z / z), isinf(1.0 / z), z / z == z / z);
    printf("%.6f %.6f %.6f %.6f %.6f %.6f\n", sinh(1.0), cosh(1.0), tanh(1.0), log10(1000.0), exp(1.0), atan(1.0) * 4);
    printf("%.6f %.6f %.6f %.6f\n", asin(0.5), acos(0.5), fabs(-2.5), pow(2.0, 0.5));
    printf("%.4f %.4f %.4f %.4f\n", floor(-2.5), ceil(2.1), fmod(7.5, 2.0), round(2.5));
    double b, q, S, eps = 1e-6;
    b = q = (double)1 / 3;
    S = 0.0;
    while (b > eps) { S += b; b = b * q; }
    printf("S=%.20lf\n", S);
    double f, cor = 0, fcor, Scor, S2 = 0; S = 0; int i;
    for (i = 1; i <= 100000; i++) {
        f = 1.0 / i / 3.0;
        S2 += f;
        fcor = f - cor; Scor = S + fcor; cor = (Scor - S) - fcor; S = Scor;
    }
    printf("%18.12f%18.12f%12.4e\n", S2, S, S2 - S);
    return 0;
}
