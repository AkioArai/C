#include <stdio.h>
int main(void) {
    int m[4] = {1, 2, 3, 4}, s = 0;
    int *p, *end;
    end = m + 4;
    p = m;
    p += 2;
    printf("%d\n", *p);
    for (p = m; p < end; p += 2)
        s += *p;
    printf("%d\n", s);
    return 0;
}
