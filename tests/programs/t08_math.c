#include <stdio.h>
#include <math.h>
double sq(double x) { return x * x; }
int fib(int n) { if (n < 2) return n; return fib(n-1) + fib(n-2); }
int main(void) {
   double a, b, c, D;
   scanf("%lf %lf %lf", &a, &b, &c);
   D = b*b - 4*a*c;
   if (D > 0) printf("x1=%.4f x2=%.4f\n", (-b+sqrt(D))/(2*a), (-b-sqrt(D))/(2*a));
   else if (D == 0) printf("x=%.4f\n", -b/(2*a));
   else printf("no roots\n");
   printf("%.6f %.6f %.3f %.3f\n", pow(2, 10), sq(1.5), sin(M_PI/6), fabs(-2.5));
   printf("%d\n", fib(15));
   printf("%f %f %f\n", floor(-2.5), ceil(2.1), round(2.5));
   printf("%f\n", sqrt(-1.0));
   int arr[5] = {5, 3, 8}; int s = 0, i;
   for (i = 0; i < 5; i++) s += arr[i];
   printf("%d %d\n", s, arr[4]);
   return 0;
}
