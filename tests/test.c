#include <stdbool.h>
#include <stdint.h>

/* ----------- */
/* BASIC TESTS */
/* ----------- */

// 1. Simple struct without internal padding
typedef struct {
  int32_t x;
  int32_t y;
} Point;

int32_t verify_point(Point *p) {
  // Should return 30 (10 + 20)
  return p->x + p->y;
}

// 2. Struct with internal padding
typedef struct {
  int8_t a; // 1 byte
  // 3 bytes padding
  int32_t b; // 4 bytes
} Padded;

int32_t verify_padded(Padded *p) {
  // If layout is correct, reading b should give the exact value passed
  return p->b;
}

// 3. Struct with tail padding
typedef struct {
  int32_t a; // 4 bytes
  int8_t b;  // 1 byte
             // 3 bytes tail padding to align to 4 bytes
} TailPadded;

int32_t verify_tail_padded_size(TailPadded *p) {
  // We just return b to verify the offset of a didn't push b too far
  return p->b;
}

// 4. Mixed types with heavy alignment
typedef struct {
  uint8_t a; // 1 byte
  // 7 bytes padding
  double b;   // 8 bytes
  uint16_t c; // 2 bytes
              // 6 bytes tail padding
} Mixed;

double verify_mixed(Mixed *p) {
  // Should return a + b + c
  return (double)p->a + p->b + (double)p->c;
}

/* -------------- */
/* NESTED STRUCTS */
/* -------------- */

typedef struct {
  int8_t id; // 1 byte
  // 3 bytes padding (because Point's max alignment is 4 bytes)
  Point center;   // 8 bytes total
  int16_t weight; // 2 bytes
                  // 2 bytes tail padding (to align the total struct to 4 bytes)
} Node;

// A simple test function to verify nested memory layout
int32_t verify_nested_node(Node *n) {
  // Should return 10 + 100 + 200 + 50 = 360
  return n->id + n->center.x + n->center.y + n->weight;
}

/* ------------------- */
/* ADVANCED TEST CASES */
/* ------------------- */

// 5. Deeply Nested Structs
typedef struct {
  int8_t a; // 1 byte
  // 3 bytes padding
  Point p;  // 8 bytes (align 4)
  int8_t b; // 1 byte
  // 3 bytes tail padding
} Wrapper; // Size: 16, Align: 4

typedef struct {
  int16_t prefix; // 2 bytes
  // 2 bytes padding
  Wrapper w; // 16 bytes (align 4)
  // 4 bytes padding to align the next 64-bit int
  int64_t suffix; // 8 bytes (align 8)
} DeepNested;     // Size: 32, Max Align: 8

int64_t verify_deep_nested(DeepNested *d) {
  // expect      1 + 10   + 10       + 20       + 2      + 1000 = 1043
  return d->prefix + d->w.a + d->w.p.x + d->w.p.y + d->w.b + d->suffix;
}

// 6. 64-bit Integers (BigInt verification)
typedef struct {
  int64_t big1;
  uint64_t big2;
} BigInts;

int64_t verify_bigints(BigInts *b) { return b->big1 + (int64_t)b->big2; }

// 7. Booleans
typedef struct {
  bool flag1; // 1 byte
  bool flag2; // 1 byte
} Bools;

int32_t verify_bools(Bools *b) {
  return (b->flag1 ? 10 : 0) + (b->flag2 ? 20 : 0);
}

// 8. Tightly Packed (No padding expected)
typedef struct {
  int8_t a;
  uint8_t b;
  int8_t c;
} Packed;

int32_t verify_packed(Packed *p) { return p->a + p->b + p->c; }

/* ----------- */
/* READ TESTS  */
/* ----------- */

void modify_point(Point *p) {
  p->x = p->x * 2;
  p->y = p->y * 2;
}

void modify_nested_node(Node *n) {
  n->id = 99;
  n->center.x = 777;
  n->center.y = 888;
  n->weight = 1234;
}

// 9. Strings and Pointers
typedef struct {
  const char *name;
  void *data_ptr;
} PtrStruct;

void fill_ptr_struct(PtrStruct *p) {
  p->name = "Hello from C FFI!";
  // Casting a fake memory address to test pointer reading
  p->data_ptr = (void *)0xDEADBEEF;
}
