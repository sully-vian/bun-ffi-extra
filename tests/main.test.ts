import { cc, FFIType } from "bun:ffi";
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createView } from "../src";

const cFileName = "test.c";
const cPath = join(import.meta.dir, cFileName);

const libDef = {
	verify_point: { args: [FFIType.ptr], returns: FFIType.i32 },
	verify_padded: { args: [FFIType.ptr], returns: FFIType.i32 },
	verify_tail_padded_size: { args: [FFIType.ptr], returns: FFIType.i32 },
	verify_mixed: { args: [FFIType.ptr], returns: FFIType.f64 },
	verify_nested_node: { args: [FFIType.ptr], returns: FFIType.i32 },
	verify_deep_nested: { args: [FFIType.ptr], returns: FFIType.i64 },
	verify_bigints: { args: [FFIType.ptr], returns: FFIType.i64 },
	verify_bools: { args: [FFIType.ptr], returns: FFIType.i32 },
	verify_packed: { args: [FFIType.ptr], returns: FFIType.i32 },
	modify_point: { args: [FFIType.ptr], returns: FFIType.void },
	modify_nested_node: { args: [FFIType.ptr], returns: FFIType.void },
	fill_ptr_struct: { args: [FFIType.ptr], returns: FFIType.void },
};

let lib: ReturnType<typeof cc<typeof libDef>>;

describe(`Arch: ${process.arch}`, () => {
	beforeAll(async () => {
		lib = cc({
			source: Bun.file(cPath),
			symbols: libDef,
		});
	});

	test("handles simple structs without padding", () => {
		const Point = { x: FFIType.i32, y: FFIType.i32 } as const;
		const p = createView(Point);
		p.x = 10;
		p.y = 20;

		expect(p.$ptr.length).toBe(8); // 4 + 4

		// Bun automatically passes TypedArrays as pointers
		const result = lib.symbols.verify_point(p.$ptr);
		expect(result).toBe(30);
	});

	test("handles internal struct padding correctly", () => {
		const Padded = { a: FFIType.i8, b: FFIType.i32 } as const;
		const padded = createView(Padded);
		padded.a = 5;
		padded.b = 999;

		expect(padded.$ptr.length).toBe(8); // 1 byte + 3 pad + 4 bytes

		const result = lib.symbols.verify_padded(padded.$ptr);
		expect(result).toBe(999);
	});

	test("handles tail padding correctly", () => {
		const TailPadded = { a: FFIType.i32, b: FFIType.i8 } as const;
		const tailPadded = createView(TailPadded);
		tailPadded.a = 100;
		tailPadded.b = 42;

		// Must pad the end so the array size is a multiple of the max alignment (4)
		expect(tailPadded.$ptr.length).toBe(8); // 4 bytes + 1 byte + 3 pad

		const result = lib.symbols.verify_tail_padded_size(tailPadded.$ptr);
		expect(result).toBe(42);
	});

	test("handles mixed types with 8-byte alignment", () => {
		const Mixed = { a: FFIType.u8, b: FFIType.f64, c: FFIType.u16 } as const;
		const mixed = createView(Mixed);
		mixed.a = 10;
		mixed.b = 15.5;
		mixed.c = 5;

		// maxAlign is 8 (from f64).
		// a: 1 byte + 7 pad = 8
		// b: 8 bytes = 16
		// c: 2 bytes + 6 pad = 24 total size
		expect(mixed.$ptr.length).toBe(24);

		const result = lib.symbols.verify_mixed(mixed.$ptr);
		expect(result).toBe(30.5); // 10 + 15.5 + 5
	});

	test("handles nested structs and their padding", () => {
		const Point = { x: FFIType.i32, y: FFIType.i32 } as const;
		const Node = {
			id: FFIType.i8,
			center: Point, // Nested!
			weight: FFIType.i16,
		} as const;

		const myNode = createView(Node);
		myNode.id = 10;
		myNode.center = { x: 100, y: 200 };
		myNode.weight = 50;

		// Size calculation verification:
		// id (1) + pad (3) + center (8) + weight (2) + tail pad (2) = 16
		expect(myNode.$ptr.length).toBe(16);

		const result = lib.symbols.verify_nested_node(myNode.$ptr);
		expect(result).toBe(360);
	});

	test("handles deeply nested structs with complex alignment", () => {
		const Point = { x: FFIType.i32, y: FFIType.i32 } as const;
		const Wrapper = {
			a: FFIType.i8,
			p: Point,
			b: FFIType.i8,
		};
		const DeepNested = {
			prefix: FFIType.i16,
			w: Wrapper,
			suffix: FFIType.i64,
		} as const;

		const data = createView(DeepNested);
		data.prefix = 1;
		data.w = {
			a: 10,
			p: { x: 10, y: 20 },
			b: 2,
		};
		data.suffix = 1000n; // 64-bit types require BigInt

		// prefix (2) + pad (2) + Wrapper (16) + pad (4) + suffix (8) = 32
		expect(data.$ptr.length).toBe(32);

		const result = lib.symbols.verify_deep_nested(data.$ptr);
		expect(result).toBe(1043n);
	});

	test("handles 64-bit integers (BigInt)", () => {
		const BigInts = { big1: FFIType.i64, big2: FFIType.u64 } as const;

		const data = createView(BigInts);

		data.big1 = -5000000000000n;
		data.big2 = 9000000000000n;

		expect(data.$ptr.length).toBe(16);

		const result = lib.symbols.verify_bigints(data.$ptr);
		expect(result).toBe(4000000000000n);
	});

	test("handles booleans properly", () => {
		const Bools = { flag1: FFIType.bool, flag2: FFIType.bool } as const;

		const data = createView(Bools);
		data.flag1 = true;
		data.flag2 = false;

		expect(data.$ptr.length).toBe(2);

		const result = lib.symbols.verify_bools(data.$ptr);
		// flag1 = 10, flag2 = 0
		expect(result).toBe(10);
	});

	test("handles tightly packed 1-byte types without extra padding", () => {
		const Packed = { a: FFIType.i8, b: FFIType.u8, c: FFIType.i8 } as const;

		const data = createView(Packed);
		data.a = 10;
		data.b = 200;
		data.c = -5;

		// 3 elements of 1 byte each = exactly 3 bytes
		expect(data.$ptr.length).toBe(3);

		const result = lib.symbols.verify_packed(data.$ptr);
		expect(result).toBe(205); // 10 + 200 - 5
	});

	/* ------------------- */
	/* READ STRUCT TESTS   */
	/* ------------------- */

	test("reads a modified simple struct", () => {
		const Point = { x: FFIType.i32, y: FFIType.i32 } as const;
		const p = createView(Point);
		p.x = 10;
		p.y = 20;

		// C will double the values
		lib.symbols.modify_point(p.$ptr);

		expect(p.x).toBe(20);
		expect(p.y).toBe(40);
	});

	test("reads modified nested structs", () => {
		const Point = { x: FFIType.i32, y: FFIType.i32 } as const;
		const Node = {
			id: FFIType.i8,
			center: Point,
			weight: FFIType.i16,
		} as const;
		const node = createView(Node);
		node.id = 1;
		node.center = { x: 10, y: 10 };
		node.weight = 5;

		// C will mutate everything
		lib.symbols.modify_nested_node(node.$ptr);

		expect(node.id).toBe(99);
		expect(node.center.x).toBe(777);
		expect(node.center.y).toBe(888);
		expect(node.weight).toBe(1234);
	});

	test("reads C-strings and raw pointers", () => {
		const PtrStruct = { name: FFIType.cstring, data_ptr: FFIType.ptr } as const;

		const s = createView(PtrStruct);

		// C will inject a string pointer and a fake 0xDEADBEEF pointer
		lib.symbols.fill_ptr_struct(s.$ptr);

		expect(s.name).toBe("Hello from C FFI!");
		// 0xDEADBEEF in decimal is 3735928559
		expect(s.data_ptr).toBe(3735928559n);
	});
});
