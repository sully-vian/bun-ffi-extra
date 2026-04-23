#include <stddef.h>
#include <stdint.h>

typedef struct {
  int32_t id;
  int32_t (*callback)(int32_t, int32_t);
} CallbackStruct;

int32_t execute_callback(CallbackStruct *s, int32_t a, int32_t b) {
  if (s->callback != NULL) {
    return s->callback(a, b);
  }
  // Return -1 to signal null pointer
  return -1;
}

int32_t c_multiplier(int32_t a, int32_t b) { return a * b; }

void set_c_callback(CallbackStruct *s) { s->callback = c_multiplier; }
