import { cc, FFIType, toArrayBuffer, type Pointer } from "bun:ffi";
import { beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createView, sizeof } from "..";

const cFileName = "stolen.c";
const cPath = join(import.meta.dir, cFileName);

const libDef = {
    createTestPerson: {
        args: [],
        returns: FFIType.ptr,
    },
    validatePerson: {
        args: [FFIType.ptr, FFIType.u32, FFIType.f32, FFIType.f64],
        returns: FFIType.bool,
    },
    createHighlightList: {
        args: [],
        returns: FFIType.ptr,
    },
    validateHighlight: {
        args: [
            FFIType.ptr,
            FFIType.u32,
            FFIType.u32,
            FFIType.u32,
            FFIType.u8,
            FFIType.u16,
            FFIType.ptr,
            FFIType.u64,
        ],
        returns: FFIType.bool,
    },
    validateHighlightList: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.bool,
    },
};

let lib: ReturnType<typeof cc<typeof libDef>>;

describe("bun-ffi-extra C interop", () => {
    beforeAll(async () => {
        // Use `cc` just like in main.test.ts
        lib = cc({
            source: Bun.file(cPath),
            symbols: libDef,
        });
    });

    const SimplePerson = {
        age: FFIType.u32,
        height: FFIType.f32,
        weight: FFIType.f64,
    } as const;

    describe("TypeScript → C (pack then validate by C)", () => {
        it("should pack data correctly for C", () => {
            const view = createView(SimplePerson);
            view.age = 30;
            view.height = 175.5;
            view.weight = 70.2;

            expect(view.$raw.length).toBe(sizeof(SimplePerson));

            const isValid = lib.symbols.validatePerson(view.$raw, 30, 175.5, 70.2);
            expect(isValid).toBe(true);
        });
    });

    describe("C → TypeScript (unpack C-created structs)", () => {
        it("should unpack C struct", () => {
            const cPersonPtr = lib.symbols.createTestPerson();
            expect(cPersonPtr).not.toBeNull();

            const size = sizeof(SimplePerson);
            const cBuffer = new Uint8Array(
                toArrayBuffer(cPersonPtr as Pointer, 0, size),
            );
            const unpacked = createView(SimplePerson, undefined, cBuffer);

            expect(unpacked.age).toBe(30);
            expect(unpacked.height).toBeCloseTo(175.5, 1);
            expect(unpacked.weight).toBeCloseTo(70.2, 1);
        });
    });

    describe("Round-trip: TypeScript → C → TypeScript", () => {
        it("should preserve data through pack → C validation → unpack", () => {
            const view = createView(SimplePerson);
            view.age = 33;
            view.height = 182.3;
            view.weight = 78.5;

            const isValid = lib.symbols.validatePerson(view.$raw, 33, 182.3, 78.5);
            expect(isValid).toBe(true);

            const unpacked = createView(SimplePerson, undefined, view.$raw);
            expect(unpacked.age).toBe(33);
            expect(unpacked.height).toBeCloseTo(182.3, 1);
            expect(unpacked.weight).toBeCloseTo(78.5, 1);
        });
    });
});
