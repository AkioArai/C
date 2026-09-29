#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int val; struct Node *next; } Node;
Node *push(Node *head, int v) { Node *n = malloc(sizeof(Node)); n->val = v; n->next = head; return n; }
int main(void) {
    FILE *f = fopen("data.txt", "w");
    if (f == NULL) return 1;
    for (int i = 1; i <= 5; i++) fprintf(f, "%d %d\n", i, i * i);
    fclose(f);
    f = fopen("data.txt", "r");
    int a, b, s = 0;
    while (fscanf(f, "%d %d", &a, &b) == 2) s += b;
    fclose(f);
    printf("sum of squares = %d\n", s);
    FILE *g = fopen("nope.txt", "r");
    printf("%s\n", g == NULL ? "no file" : "file");
    Node *head = NULL;
    for (int i = 0; i < 4; i++) head = push(head, i * 10);
    for (Node *p = head; p != NULL; p = p->next) printf("%d -> ", p->val);
    printf("NULL\n");
    while (head) { Node *t = head->next; free(head); head = t; }
    fprintf(stderr, "only stderr\n");
    return 0;
}
