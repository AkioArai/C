#include <stdio.h>
#include <string.h>
typedef struct { double x, y; } Point;
struct Student { char name[20]; int age; double grades[3]; };
enum Color { RED, GREEN = 5, BLUE };
union U { int i; unsigned char b[4]; };
Point mid(Point a, Point b) { Point m = { (a.x + b.x) / 2, (a.y + b.y) / 2 }; return m; }
double avg(const struct Student *s) { double t = 0; int i; for (i = 0; i < 3; i++) t += s->grades[i]; return t / 3; }
int main(void) {
    Point p = {1, 2}, q = {.y = 10, .x = 4};
    Point m = mid(p, q);
    printf("%.1f %.1f\n", m.x, m.y);
    struct Student s = {"Ivan", 19, {4.5, 5, 3.5}};
    struct Student group[2] = { {"Anna", 18, {5, 5, 5}}, {"Oleg", 20, {3, 4, 5}} };
    printf("%s %d %.2f\n", s.name, s.age, avg(&s));
    int i;
    for (i = 0; i < 2; i++) printf("%s:%.1f ", group[i].name, avg(&group[i]));
    printf("\n%d %d %d %lu %lu\n", RED, GREEN, BLUE, sizeof(Point), sizeof(struct Student));
    union U u; u.i = 0x01020304;
    printf("%d %d\n", u.b[0], u.b[3]);
    struct Student *ps = &group[1];
    ps->age++;
    strcpy(ps->name, "Olga");
    printf("%s %d\n", group[1].name, (*ps).age);
    Point arr[3] = {{1,1},{2,2},{3,3}};
    Point t = arr[0]; arr[0] = arr[2]; arr[2] = t;
    printf("%.0f %.0f\n", arr[0].x, arr[2].y);
    return 0;
}
