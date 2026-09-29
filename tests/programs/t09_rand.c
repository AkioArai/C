#include <stdio.h>
#include <stdlib.h>
int main(void) {
   int i;
   for (i = 0; i < 3; i++) printf("%d\n", rand());
   srand(42);
   for (i = 0; i < 3; i++) printf("%d\n", rand() % 100);
   printf("%d\n", abs(-17));
   return 0;
}
