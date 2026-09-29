#include <stdio.h>
int main(void) {
   int    a, b=3, c;
   double x, y=3.6;
   a=1+b*(c=2);
   x=a=2*a-(b=2*c+1);
   y=a/b+(double)a/b+a/y;
   printf("a=%d, b=%d, c=%d; x=%f, y=%f\n ", a, b, c, x, y);
   return 0;
}
