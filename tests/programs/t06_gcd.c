#include <stdio.h>
int main(void) {
   long int a, b;
   printf("Введите два числа, не равные нулю: ");
   scanf("%ld %ld", &a, &b);
   do {
      if (a>b)  a %= b;
      else      b %= a;
   } while (a!=0 && b!=0);
   printf("НОД =%ld\n", a+b);
   return 0;
}
