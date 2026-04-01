import { cc, FFIType } from "bun:ffi";
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createView, sizeof, struct, union } from "..";

const cFileName = "union.c";
const cPath = join(import.meta.dir, cFileName);

const libDef = {
    verify_union_int: { args: [FFIType.ptr], returns: FFIType.i32 },
    verify_union_float: { args: [FFIType.ptr], returns: FFIType.f32 },
    verify_data_union: { args: [FFIType.ptr], returns: FFIType.u64 },
    verify_variant: { args: [FFIType.ptr], returns: FFIType.f64 },
};

let lib: ReturnType<typeof cc<typeof libDef>>;

describe("C Unions", () => {
    beforeAll(() => {
        lib = cc({ source: Bun.file(cPath), symbols: libDef });
    });

    test("shares memory between different types", () => {
        const IntFloat = union({
            i: FFIType.i32,
            f: FFIType.f32,
        });

        const u = createView(IntFloat);

        // Size should be 4 (max of i32 and f32)
        expect(sizeof(IntFloat)).toBe(4);

        // Writing to 'i' should affect 'f'
        u.i = 1065353216; // Bit representation of 1.0f
        expect(u.f).toBe(1.0);

        const result = lib.symbols.verify_union_float(u.$raw);
        expect(result).toBe(1.0);
    });

    test("handles alignment based on largest member", () => {
        const MixedUnion = union({
            a: FFIType.u8,
            b: FFIType.f64, // Requires 8-byte alignment
        });

        // Size should be 8, not 9 or 1
        expect(sizeof(MixedUnion)).toBe(8);

        const u = createView(MixedUnion);
        u.b = 1.234;

        // u.a should now contain the first byte of the double's memory
        expect(u.a).toBeDefined();
    });

    test("works as a nested member in a struct", () => {
        const Data = union({
            ival: FFIType.i32,
            dval: FFIType.f64,
        });

        const Variant = struct({
            type: FFIType.u8,
            data: Data,
        });

        // Layout: type(1) + padding(7) + union(8) = 16 bytes
        expect(sizeof(Variant)).toBe(16);

        const v = createView(Variant);

        // Test Integer path
        v.type = 1;
        v.data.ival = 42;
        expect(lib.symbols.verify_variant(v.$raw)).toBe(42.0);

        // Test Double path (overwriting integer)
        v.type = 2;
        v.data.dval = 3.14;
        expect(lib.symbols.verify_variant(v.$raw)).toBe(3.14);
    });
});
