#include <stdint.h>

typedef struct {
  int32_t x;
  int32_t y;
} Point;

// static global to easily share pointer without needing malloc/free
static Point global_point;

Point *get_global_point() {
  global_point.x = 10;
  global_point.y = 20;
  return &global_point;
}

int32_t verify_point(Point *p) { return p->x + p->y; }

void increment_point(Point *p) {
  p->x++;
  p->y++;
}
