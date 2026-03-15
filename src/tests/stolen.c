// stolen from
// https://github.com/anomalyco/bun-ffi-structs/blob/main/src/tests/test.zig
#include <stdbool.h>
#include <string.h>

#define MAX(x, y) ((x) > (y) ? (x) : (y))
#define ABS(x) (MAX((x), -(x)))

typedef char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef unsigned long u64;
typedef float f32;
typedef double f64;

typedef struct {
  u32 age;
  f32 height;
  f64 weight;
} SimplePerson;

SimplePerson test_person;

void *createTestPerson() {
  test_person = (SimplePerson){.age = 30, .height = 175.5, .weight = 70.2};
  return (void *)&test_person;
}

bool validatePerson(void *ptr, u32 expected_age, f32 expected_height,
                    f64 expected_weight) {

  const SimplePerson person = *(SimplePerson *)ptr;

  if (person.age != expected_age)
    return false;

  const bool height_match = ABS(person.height - expected_height) < 0.01;
  if (!height_match)
    return false;

  const bool weight_match = ABS(person.weight - expected_weight) < 0.01;
  if (!weight_match)
    return false;

  return true;
}

typedef struct {
  u32 start;
  u32 end;
  u32 style_id;
  u8 priority;
  u16 hl_ref;
  u8 *conceal_text_ptr;
  u64 conceal_text_len;
} Highlight;

const u8 test_string_1[] = "XXX";
const u8 test_string_2[] = "******";
const u8 test_string_3[] = "Hello🌍";

Highlight test_highlights[3];

Highlight **createHighlightList() {
  test_highlights[0] = (Highlight){
      .start = 6,
      .end = 11,
      .style_id = 1,
      .priority = 0,
      .hl_ref = 0,
      .conceal_text_ptr = (u8 *)test_string_1,
      .conceal_text_len = strlen(test_string_1),
  };

  test_highlights[1] = (Highlight){
      .start = 18,
      .end = 24,
      .style_id = 2,
      .priority = 5,
      .hl_ref = 10,
      .conceal_text_ptr = (u8 *)test_string_2,
      .conceal_text_len = strlen(test_string_2),
  };

  test_highlights[2] = (Highlight){
      .start = 30,
      .end = 35,
      .style_id = 3,
      .priority = 1,
      .hl_ref = 20,
      .conceal_text_ptr = (u8 *)test_string_3,
      .conceal_text_len = strlen(test_string_3),
  };

  return (void *)&test_highlights;
}

bool validateHighlight(void *ptr, u32 expected_start, u32 expected_end,
                       u32 expected_style_id, u8 expected_priority,
                       u8 expected_hl_ref, const u8 *expected_text_ptr,
                       size_t expected_text_len) {
  const Highlight highlight = *(Highlight *)ptr;

  if (highlight.start != expected_start)
    return false;
  if (highlight.end != expected_end)
    return false;
  if (highlight.style_id != expected_style_id)
    return false;
  if (highlight.priority != expected_priority)
    return false;
  if (highlight.hl_ref != expected_hl_ref)
    return false;

  // Check pointer and length
  if (expected_text_ptr == NULL) {
    if (highlight.conceal_text_ptr != NULL)
      return false;
    if (highlight.conceal_text_len != 0)
      return false;
  } else {
    if (highlight.conceal_text_ptr == NULL)
      return false;
    if (highlight.conceal_text_len != expected_text_len)
      return false;

    // Compare actual text content
    const u8 *actual_text = highlight.conceal_text_ptr;
    const u8 *expected_text = expected_text_ptr;
    if (memcmp(actual_text, expected_text, highlight.conceal_text_len) != 0)
      return false;
  }

  return true;
}

bool validateHighlightList(void *ptr, size_t count) {
  const Highlight *highlights = (Highlight *)ptr;

  if (count < 3)
    return false;

  // Validate first highlight
  const Highlight h1 = highlights[0];
  if (h1.start != 6 || h1.end != 11 || h1.style_id != 1)
    return false;
  if (h1.priority != 0 || h1.hl_ref != 0)
    return false;
  if (h1.conceal_text_ptr == NULL || h1.conceal_text_len != 3)
    return false;
  const u8 *text1 = h1.conceal_text_ptr;
  if (memcmp(text1, "XXX", h1.conceal_text_len))
    return false;

  // Validate second highlight
  const Highlight h2 = highlights[1];
  if (h2.start != 18 || h2.end != 24 || h2.style_id != 2)
    return false;
  if (h2.priority != 5 || h2.hl_ref != 10)
    return false;
  if (h2.conceal_text_ptr == NULL || h2.conceal_text_len != 6)
    return false;
  const u8 *text2 = h2.conceal_text_ptr;
  if (memcmp(text2, "******", h2.conceal_text_len) != 0)
    return false;

  // Validate third highlight
  const Highlight h3 = highlights[2];
  if (h3.start != 30 || h3.end != 35 || h3.style_id != 3)
    return false;
  if (h3.priority != 1 || h3.hl_ref != 20)
    return false;
  if (h3.conceal_text_ptr == NULL)
    return false;
  const u8 *text3 = h3.conceal_text_ptr;
  if (memcmp(text3, "Hello🌍", h3.conceal_text_len) != 0)
    return false;

  return true;
}
