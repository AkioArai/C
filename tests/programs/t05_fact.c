#include <stdio.h>
int main(void) {
   int      n, i;
   long int fact;
   printf("Введите число n: ");   scanf("%d", &n);
   fact = 1;
   for (i=1; i<=n; i++)
      fact *= i;
   printf("Факториал n!=%ld\n", fact);
   return 0;
}
