#include <stdio.h>
int main(void) {
   int k;
   scanf("%d", &k);
   switch ( (k<=20) ? k : k%10 ) {
      case 1: printf("one\n"); break;
      case 2: case 3: case 4: printf("few\n"); break;
      default: printf("many\n"); break;
   }
   int i;
   for (i = 0; i < 10; i++) {
      if (i % 2) continue;
      if (i > 6) break;
      printf("%d ", i);
   }
   printf("\n");
   int j=0; while (1) { j++; if (j*j > 50) break; }
   printf("%d\n", j);
   int x = 3; int c = (x > 2) ? x * 10 : -1; printf("%d\n", c);
   return 0;
}
