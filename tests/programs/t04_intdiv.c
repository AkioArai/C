#include <stdio.h>
int main(void) {
   int a = 7, b = 2, n = -7;
   double d = a / b, e = (double)a / b;
   printf("%d %d %d %d %f %f\n", a/b, a%b, n/b, n%b, d, e);
   printf("%d\n", 2147483647 + 1 > 0);
   unsigned int u = 0; u--;
   printf("%u %d\n", u, -1 < 1u);
   char ch = 'A' + 2; short s = 32767; s++;
   printf("%c %d %d\n", ch, ch, s);
   long big = 1; int i;
   for (i = 1; i <= 20; i++) big *= i;
   printf("%ld\n", big);
   int ov = 1; for (i = 1; i <= 13; i++) ov *= i;
   printf("%d\n", ov);
   printf("%d %d %d\n", 10 > 5, !(3 > 2), 5 && 0 || 1);
   int k = 5; int r1 = ++k; int r2 = k++;
   printf("%d %d %d\n", r1, r2, k);
   a = 5; a *= b + 2; printf("%d\n", a);
   printf("%d %d\n", 1 << 10, -16 >> 2);
   printf("%lu %lu %lu\n", sizeof(int), sizeof(double), sizeof(char));
   return 0;
}
