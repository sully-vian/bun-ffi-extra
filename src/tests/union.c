#include <stdint.h>

typedef union {
  int32_t i;
  float f;
} IntFloatUnion;

int32_t verify_union_int(IntFloatUnion *u) { return u->i; }

float verify_union_float(IntFloatUnion *u) { return u->f; }

typedef union {
  uint8_t bytes[8];
  uint8_t value;
} DataUnion;

uint64_t verify_data_union(DataUnion *u) { return u->value; }

typedef struct {
  uint8_t type;
  union {
    int32_t ival;
    double dval;
  } data;
} Variant;

double verify_variant(Variant *v) {
  if (v->type == 1)
    return (double)v->data.ival;
  if (v->type == 2)
    return v->data.dval;
  return 0.0;
}
