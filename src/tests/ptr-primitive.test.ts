import { cc, FFIType } from "bun:ffi";
import { beforeAll, describe, expect, test } from "bun:test";
import { createPtr, createStruct, pointer, struct } from "..";
import source from "./ptr-primitive.c" with { type: "file" };

const symbols = {
  double_int: { args: [FFIType.ptr], returns: FFIType.i32 },
  get_global_float: { returns: FFIType.ptr },
  increment_global_float: { returns: FFIType.void },
  sum_int_pointers: { args: [FFIType.ptr], returns: FFIType.i32 },
} as const;

let lib: ReturnType<typeof cc<typeof symbols>>;

const IntPointers = struct({
  a: pointer(FFIType.i32),
  b: pointer(FFIType.i32),
});

describe("Primitive Pointers", () => {
  beforeAll(() => {
    lib = cc({ source, symbols });
  });

  test("allocates primitive memory and mutates via pointer passed to C", () => {
    // Calling createPtr with a primitive creates a 1-length backing buffer
    const intPtr = createPtr(FFIType.i32);

    expect(intPtr.length).toBe(1);

    intPtr._ = 21; // Type checking should now recognize this as a `number`
    expect(intPtr._).toBe(21);

    const result = lib.symbols.double_int(intPtr.$);
    expect(result).toBe(42);
    expect(intPtr._).toBe(42);
  });

  test("reads primitive pointer returned from C global memory", () => {
    const rawPtr = lib.symbols.get_global_float();
    const floatPtr = createPtr(FFIType.f32, { addr: rawPtr });

    expect(floatPtr.$).toBe(rawPtr);
    expect(floatPtr.length).toBe(1);
    expect(floatPtr._).toBeCloseTo(3.14, 2);

    // Verify mutations from C
    lib.symbols.increment_global_float();
    expect(floatPtr._).toBeCloseTo(4.14, 2);

    for (let i = 2; i < 100; i++) {
      lib.symbols.increment_global_float();
      expect(floatPtr._).toBeCloseTo(3.14 + i, 2);
    }

    // Verify mutations from JS
    floatPtr._ = 2.71;
    expect(floatPtr._).toBeCloseTo(2.71, 2);

    floatPtr._++;
    expect(floatPtr._).toBeCloseTo(3.71, 2);
  });

  test("handles structs containing primitive pointers", () => {
    const val1 = createPtr(FFIType.i32);
    val1._ = 100;

    const val2 = createPtr(FFIType.i32);
    val2._ = 200;

    const myStruct = createStruct(IntPointers);
    myStruct.a = val1;
    myStruct.b = val2;

    const result = lib.symbols.sum_int_pointers(myStruct.$raw);
    expect(result).toBe(300);
  });

  test("properly implements array-like access for primitive pointers", () => {
    const ptrArray = createPtr(FFIType.u8, { length: 3 });

    expect(ptrArray.length).toBe(3);

    ptrArray[0] = 10;
    ptrArray[1] = 20;
    ptrArray[2] = 30;

    expect(ptrArray._).toBe(10); // _ acts as [0]
    expect(ptrArray[1]).toBe(20);
    expect(ptrArray[2]).toBe(30);

    expect(() => {
      ptrArray[3] = 40;
    }).toThrow(/Index out of bounds/);
  });
});
