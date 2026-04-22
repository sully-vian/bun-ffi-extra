#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

typedef struct {
  int32_t x;
  int32_t y;
} Point;

typedef struct {
  uint32_t id;
  // This will force padding on 64-bit systems since pointers are 8 bytes
  // layout: id (4) + padding (4) + point_ptr (8) = 16 bytes
  Point *point_ptr; 
} Node;

// Test 1: Verify JS-packed struct containing a pointer
bool verify_node(Node *n, uint32_t expected_id, int32_t expected_x, int32_t expected_y) {
  if (n->id != expected_id) return false;
  if (n->point_ptr == NULL) return false;
  
  if (n->point_ptr->x != expected_x) return false;
  if (n->point_ptr->y != expected_y) return false;
  
  return true;
}

// Test 2: Return a C-created node with an inner pointer to JS
static Point c_point = { .x = 100, .y = 200 };
static Node c_node = { .id = 42, .point_ptr = &c_point };

Node *get_c_node() {
  return &c_node;
}

// Test 3: Mutate a pointer's target that was passed from JS
void mutate_node_target(Node *n) {
  if (n->point_ptr != NULL) {
    n->point_ptr->x += 10;
    n->point_ptr->y += 20;
  }
}
