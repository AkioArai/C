#include <stdio.h>
int main(void) {
   int x, sum = 0;
   do { scanf("%d", &x); sum += x; } while (x != 0);
   printf("%d\n", sum);
   int n = 0, v;
   while (scanf("%d", &v) == 1) n += v;
   printf("%d\n", n);
   return 0;
}
