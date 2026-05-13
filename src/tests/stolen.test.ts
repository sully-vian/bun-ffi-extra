import { cc, FFIType, type Pointer, ptr, toArrayBuffer } from "bun:ffi";
import { beforeAll, describe, expect, it } from "bun:test";
import { B, createPtr, createStruct, sizeof, struct } from "..";
import source from "./stolen.c" with { type: "file" };

const symbols = {
  createTestPerson: {
    returns: FFIType.ptr,
  },
  validatePerson: {
    args: [FFIType.ptr, FFIType.u32, FFIType.f32, FFIType.f64],
    returns: FFIType.bool,
  },
  createHighlightList: {
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
} as const;

let lib: ReturnType<typeof cc<typeof symbols>>;

describe("bun-ffi-extra C interop", () => {
  beforeAll(async () => {
    lib = cc({ source, symbols });
  });

  const SimplePerson = struct({
    age: FFIType.u32,
    height: FFIType.f32,
    weight: FFIType.f64,
  });

  describe("TypeScript → C (pack then validate by C)", () => {
    it("should pack data correctly for C", () => {
      const view = createStruct(SimplePerson, {
        age: 30,
        height: 175.5,
        weight: 70.2,
      });

      expect(view.$raw.length).toBe(sizeof(SimplePerson));

      const isValid = lib.symbols.validatePerson(view.$raw, 30, 175.5, 70.2);
      expect(isValid).toBeTrue();
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
      const unpacked = createStruct(SimplePerson, {}, cBuffer);

      expect(unpacked.age).toBe(30);
      expect(unpacked.height).toBeCloseTo(175.5, 1);
      expect(unpacked.weight).toBeCloseTo(70.2, 1);
    });
  });

  describe("Round-trip: TypeScript → C → TypeScript", () => {
    it("should preserve data through pack → C validation → unpack", () => {
      const view = createStruct(SimplePerson, {
        age: 33,
        height: 182.3,
        weight: 78.5,
      });

      const isValid = lib.symbols.validatePerson(view.$raw, 33, 182.3, 78.5);
      expect(isValid).toBeTrue();

      const unpacked = createStruct(SimplePerson, {}, view.$raw);
      expect(unpacked.age).toBe(33);
      expect(unpacked.height).toBeCloseTo(182.3, 1);
      expect(unpacked.weight).toBeCloseTo(78.5, 1);
    });
  });
});

describe("C interop with pointers and arrays (Highlight)", () => {
  const Highlight = struct({
    start: FFIType.u32,
    end: FFIType.u32,
    style_id: FFIType.u32,
    priority: FFIType.u8,
    hl_ref: FFIType.u16,
    conceal_text_ptr: FFIType.cstring,
    conceal_text_len: FFIType.u64,
  });

  describe("Single struct packing", () => {
    it("should pack a single highlight correctly for C", () => {
      const view = createStruct(Highlight, {
        start: 6,
        end: 11,
        style_id: 1,
        priority: 0,
        hl_ref: 0,
        conceal_text_ptr: "XXX",
        conceal_text_len: BigInt(3),
      });
      const isValid = lib.symbols.validateHighlight(
        view.$raw,
        6,
        11,
        1,
        0,
        0,
        ptr(B`XXX`),
        3,
      );
      expect(isValid).toBeTrue();
    });

    it("should pack highlight with emoji correctly", () => {
      const view = createStruct(Highlight, {
        start: 30,
        end: 35,
        style_id: 3,
        priority: 1,
        hl_ref: 20,
        conceal_text_ptr: "Hello🌍",
        conceal_text_len: BigInt(B`Hello🌍`.length),
      });
      const encodedText = B`Hello🌍`;

      const isValid = lib.symbols.validateHighlight(
        view.$raw,
        30,
        35,
        3,
        1,
        20,
        ptr(encodedText),
        encodedText.length,
      );
      expect(isValid).toBeTrue();
    });

    it("should pack highlight with null text", () => {
      const view = createStruct(Highlight, {
        start: 1,
        end: 5,
        style_id: 1,
        priority: 0,
        hl_ref: 0,
        conceal_text_len: BigInt(0),
      });

      const isValid = lib.symbols.validateHighlight(
        view.$raw,
        1,
        5,
        1,
        0,
        0,
        null,
        0,
      );
      expect(isValid).toBeTrue();
    });

    describe("List packing (TypeScript → C)", () => {
      it("should pack a list of highlights for C to consume", () => {
        const foo = createPtr(Highlight, { length: 3 });
        foo[0] = createStruct(Highlight, {
          start: 6,
          end: 11,
          style_id: 1,
          priority: 0,
          hl_ref: 0,
          conceal_text_ptr: "XXX",
          conceal_text_len: 3n,
        });
        foo[1] = createStruct(Highlight, {
          start: 18,
          end: 24,
          style_id: 2,
          priority: 5,
          hl_ref: 10,
          conceal_text_ptr: "******",
          conceal_text_len: 6n,
        });
        foo[2] = createStruct(Highlight, {
          start: 30,
          end: 35,
          style_id: 3,
          priority: 1,
          hl_ref: 20,
          conceal_text_ptr: "Hello🌍",
          conceal_text_len: BigInt(B`Hello🌍`.length),
        });

        // Validate entire list with C
        const isValid = lib.symbols.validateHighlightList(foo.addr, 3);
        expect(isValid).toBeTrue();
      });

      it("should pack list with mixed null and non-null text", () => {
        const view = createPtr(Highlight, { length: 3 });
        view[0] = createStruct(Highlight, {
          start: 1,
          end: 5,
          style_id: 1,
          priority: 0,
          hl_ref: 0,
          conceal_text_ptr: "",
          conceal_text_len: 0n,
        });
        view[1] = createStruct(Highlight, {
          start: 10,
          end: 15,
          style_id: 2,
          priority: 1,
          hl_ref: 5,
          conceal_text_ptr: "Test",
          conceal_text_len: 4n,
        });
        view[2] = createStruct(Highlight, {
          start: 20,
          end: 25,
          style_id: 3,
          priority: 2,
          hl_ref: 10,
          conceal_text_ptr: "",
          conceal_text_len: 0n,
        });

        const testBuffer = B`Test`;

        const h1Valid = lib.symbols.validateHighlight(
          view[0].$raw,
          1,
          5,
          1,
          0,
          0,
          B``,
          0,
        );
        expect(h1Valid).toBeTrue();

        const h2Valid = lib.symbols.validateHighlight(
          ptr(view[1].$raw),
          10,
          15,
          2,
          1,
          5,
          ptr(testBuffer),
          testBuffer.length - 1, // remove null terminator
        );
        expect(h2Valid).toBeTrue();

        const h3Valid = lib.symbols.validateHighlight(
          ptr(view[2].$raw),
          20,
          25,
          3,
          2,
          10,
          B``,
          0,
        );
        expect(h3Valid).toBeTrue();
      });
    });

    describe("List unpacking (C → TypeScript)", () => {
      it("should unpack a C-created list of highlights", () => {
        const cListPtr = lib.symbols.createHighlightList();
        expect(cListPtr).not.toBeNull();
        const highlights = createPtr(Highlight, {
          addr: cListPtr,
          length: 3,
        });

        // Validate first highlight
        expect(highlights[0].start).toBe(6);
        expect(highlights[0].end).toBe(11);
        expect(highlights[0].style_id).toBe(1);
        expect(highlights[0].priority).toBe(0);
        expect(highlights[0].hl_ref).toBe(0);
        expect(highlights[0].conceal_text_ptr).toBe("XXX"); // Assumes unpacking stringifies automatically

        // Validate second highlight
        expect(highlights[1].start).toBe(18);
        expect(highlights[1].end).toBe(24);
        expect(highlights[1].style_id).toBe(2);
        expect(highlights[1].priority).toBe(5);
        expect(highlights[1].hl_ref).toBe(10);
        expect(highlights[1].conceal_text_ptr).toBe("******");

        // Validate third highlight (with emoji)
        expect(highlights[2].start).toBe(30);
        expect(highlights[2].end).toBe(35);
        expect(highlights[2].style_id).toBe(3);
        expect(highlights[2].priority).toBe(1);
        expect(highlights[2].hl_ref).toBe(20);
        expect(highlights[2].conceal_text_ptr).toBe("Hello🌍");
        expect(Number(highlights[2].conceal_text_len)).toBeGreaterThan(5);
      });
    });
  });
});
