#include <stdio.h>
int main(void) {
   int a = 12;
   double x;
   scanf("%lf", &x);
   printf("a=%5d=%05d|%-5d|\n", a, a, a);
   printf("x=%f=%.3f=%6.2f=%e\n", x, x, x, x);
   printf("%g %g %g %g %G\n", x, 0.0001, 123456789.0, 1e-5, 1e20);
   printf("%10.4f|%-10.4f|%+d|% d|%x|%X|%o|%#x|%c|%%\n", 1.234, 1.234, 5, 5, 255, 255, 8, 255, 'Q');
   printf("%.2f %.2f %.2f %.0f %.0f %.0f\n", 0.125, 0.375, 2.675, 0.5, 1.5, 2.5);
   printf("%e %.2e %g %g\n", 0.0, 12345.678, 100000.0, 1000000.0);
   printf("%s|%10s|%-6s|%.2s\n", "abc", "right", "left", "cut");
   return 0;
}
