#include <stddef.h>
#include <stdint.h>

int32_t double_int(int32_t *val) {
  if (val == NULL)
    return -1;
  *val = *val * 2;
  return *val;
}

static float global_float = 3.14f;

float *get_global_float() { return &global_float; }

void increment_global_float() { global_float += 1.0f; }

typedef struct {
  int32_t *a;
  int32_t *b;
} IntPointers;

int32_t sum_int_pointers(IntPointers *ptrs) {
  if (ptrs == NULL || ptrs->a == NULL || ptrs->b == NULL)
    return 0;
  return *(ptrs->a) + *(ptrs->b);
}
