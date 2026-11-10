#include <stdio.h>
#include <string.h>
#include <float.h>
int main(void) {
    float f = 155.625f;
    unsigned int u;
    int i;
    memcpy(&u, &f, sizeof u);
    for (i = 31; i >= 0; i--) {
        printf("%u", (u >> i) & 1);
        if (i == 31 || i == 23) printf(" ");
    }
    printf("\n%08X\n", u);
    printf("%e %e %d %d\n", FLT_EPSILON, DBL_EPSILON, FLT_DIG, DBL_DIG);
    printf("%e %e\n", FLT_MAX, DBL_MIN);
    double big = 1e308; big = big * 10; printf("%f\n", big);
    float x = 0.1f; double y = 0.1; printf("%.20f\n%.20f\n%d\n", x, y, x == y);
    printf("%.2f %.0f %.0f %5.1f|%-8.3f|%+.2f\n", 2.675, 0.5, 1.5, 3.14159, 2.5, 1.0);
    return 0;
}
