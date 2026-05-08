import { cc, FFIType, ptr } from "bun:ffi";
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createPtr, createStruct, struct } from "..";

const cFileName = "ptr.c";
const cPath = join(import.meta.dir, cFileName);

const libDef = {
  get_global_point: { returns: FFIType.pointer },
  verify_point: { args: [FFIType.ptr], returns: FFIType.i32 },
  increment_point: { args: [FFIType.ptr], returns: FFIType.void },
} as const;

let lib: ReturnType<typeof cc<typeof libDef>>;

const Point = struct({ x: FFIType.i32, y: FFIType.i32 });

describe("C Pointers", () => {
  beforeAll(() => {
    lib = cc({ source: Bun.file(cPath), symbols: libDef });
  });

  test("reads a struct pointer returned from C", () => {
    const rawPtr = lib.symbols.get_global_point();
    const p = createPtr(Point, { addr: rawPtr });

    // Dereference `_` to access the struct
    expect(p._.x).toBe(10);
    expect(p._.y).toBe(20);
  });

  test("mutates C memory directly from JS via pointer", () => {
    const rawPtr = lib.symbols.get_global_point();
    const p = createPtr(Point, { addr: rawPtr });

    // Mutate properties directly
    p._.x = 100;
    p._.y = 200;

    // Verify that C sees the new values
    const result = lib.symbols.verify_point(rawPtr);
    expect(result).toBe(300);
  });

  test("assigns a whole partial object to a C pointer", () => {
    const rawPtr = lib.symbols.get_global_point();
    const p = createPtr(Point, { addr: rawPtr });

    // Use the custom setter mapped to `_`
    p._ = createStruct(Point, { x: 42, y: 42 });

    const result = lib.symbols.verify_point(rawPtr);
    expect(result).toBe(84);
  });

  test("creates a pointer from a JS struct and passes it to C", () => {
    const myPoint = createStruct(Point, { x: 5, y: 5 });
    const p = createPtr(Point, { addr: ptr(myPoint.$raw) });

    // Pass the extracted memory address (`addr`) to C
    lib.symbols.increment_point(p.addr);

    // Ensure the original JS struct view sees the mutations performed by C
    expect(myPoint.x).toBe(6);
    expect(myPoint.y).toBe(6);

    // Ensure the pointer view sees it too
    expect(p._.x).toBe(6);
  });

  test("throws an error when dereferencing a null pointer", () => {
    const nullPtr = createPtr(Point, { addr: null });

    expect(nullPtr.addr).toBeNull();
    expect(() => nullPtr._).toThrow(); // deref of null pointer
  });
});
