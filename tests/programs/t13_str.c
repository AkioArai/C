#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdlib.h>
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define SQR(x) ((x) * (x))
#define N 10
#ifndef DEBUG
#define LOG(msg) printf("[log] %s\n", msg)
#endif
int count(const char *s, char c) { int n = 0; while (*s) { if (*s == c) n++; s++; } return n; }
void reverse(char *s) { int i = 0, j = strlen(s) - 1; while (i < j) { char t = s[i]; s[i++] = s[j]; s[j--] = t; } }
int main(void) {
    char s[50] = "Hello";
    strcat(s, ", world");
    printf("%s %lu %d\n", s, strlen(s), count(s, 'l'));
    reverse(s);
    printf("%s\n", s);
    char buf[64];
    sprintf(buf, "%d-%05.2f-%s", 42, 3.14159, "ok");
    printf("[%s] %d\n", buf, strcmp("abc", "abd") < 0);
    int a, b; char w[10];
    sscanf("12 34 word", "%d %d %s", &a, &b, w);
    printf("%d %s %d\n", a + b, w, MAX(a, SQR(b - 30)));
    for (int i = 0; s[i]; i++) s[i] = toupper(s[i]);
    printf("%s %d %d\n", s, atoi("  -77x"), N * 2);
    char *pos = strchr(s, 'W');
    printf("%s %d\n", pos, (int)(pos - s));
    LOG("done");
    char line[20];
    fgets(line, sizeof line, stdin);
    { int k = 0; while (line[k] && line[k] != '\n') k++; line[k] = 0; }
    printf("<%s>\n", line);
    return 0;
}
