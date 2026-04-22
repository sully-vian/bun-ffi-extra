import { cc, FFIType } from "bun:ffi";
import { beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createStruct, struct } from "../";

const cFileName = "main.c";
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
} as const;

let lib: ReturnType<typeof cc<typeof libDef>>;

beforeAll(async () => {
	lib = cc({
		source: Bun.file(cPath),
		symbols: libDef,
	});
});

test("handles simple structs without padding", () => {
	const Point = struct({ x: FFIType.i32, y: FFIType.i32 });
	const p = createStruct(Point, { x: 10, y: 20 });

	expect(p.$raw.length).toBe(8); // 4 + 4

	// Bun automatically passes TypedArrays as pointers
	const result = lib.symbols.verify_point(p.$raw);
	expect(result).toBe(30);
});

test("handles internal struct padding correctly", () => {
	const Padded = struct({ a: FFIType.i8, b: FFIType.i32 });
	const padded = createStruct(Padded, { a: 5, b: 999 });

	expect(padded.$raw.length).toBe(8); // 1 byte + 3 pad + 4 bytes

	const result = lib.symbols.verify_padded(padded.$raw);
	expect(result).toBe(999);
});

test("handles tail padding correctly", () => {
	const TailPadded = struct({ a: FFIType.i32, b: FFIType.i8 });
	const tailPadded = createStruct(TailPadded, { a: 100, b: 42 });

	// Must pad the end so the array size is a multiple of the max alignment (4)
	expect(tailPadded.$raw.length).toBe(8); // 4 bytes + 1 byte + 3 pad

	const result = lib.symbols.verify_tail_padded_size(tailPadded.$raw);
	expect(result).toBe(42);
});

test("handles mixed types with 8-byte alignment", () => {
	const Mixed = struct({ a: FFIType.u8, b: FFIType.f64, c: FFIType.u16 });
	const mixed = createStruct(Mixed, { a: 10, b: 15.5, c: 5 });

	// maxAlign is 8 (from f64).
	// a: 1 byte + 7 pad = 8
	// b: 8 bytes = 16
	// c: 2 bytes + 6 pad = 24 total size
	expect(mixed.$raw.length).toBe(24);

	const result = lib.symbols.verify_mixed(mixed.$raw);
	expect(result).toBe(30.5); // 10 + 15.5 + 5
});

test("handles nested structs and their padding", () => {
	const Point = struct({ x: FFIType.i32, y: FFIType.i32 });
	const Node = struct({
		id: FFIType.i8,
		center: Point, // Nested!
		weight: FFIType.i16,
	});

	const myNode = createStruct(Node, {
		id: 10,
		center: { x: 100, y: 200 },
		weight: 50,
	});

	// Size calculation verification:
	// id (1) + pad (3) + center (8) + weight (2) + tail pad (2) = 16
	expect(myNode.$raw.length).toBe(16);

	const result = lib.symbols.verify_nested_node(myNode.$raw);
	expect(result).toBe(360);
});

test("handles deeply nested structs with complex alignment", () => {
	const Point = struct({ x: FFIType.i32, y: FFIType.i32 });
	const Wrapper = struct({
		a: FFIType.i8,
		p: Point,
		b: FFIType.i8,
	});
	const DeepNested = struct({
		prefix: FFIType.i16,
		w: Wrapper,
		suffix: FFIType.i64,
	});

	const data = createStruct(DeepNested, {
		prefix: 1,
		w: {
			a: 10,
			p: { x: 10, y: 20 },
			b: 2,
		},
		suffix: 1000n, // 64-bit requires BigInt
	});

	// prefix (2) + pad (2) + Wrapper (16) + pad (4) + suffix (8) = 32
	expect(data.$raw.length).toBe(32);

	const result = lib.symbols.verify_deep_nested(data.$raw);
	expect(result).toBe(1043n);
});

test("handles 64-bit integers (BigInt)", () => {
	const BigInts = struct({ big1: FFIType.i64, big2: FFIType.u64 });

	const data = createStruct(BigInts, {
		big1: -5000000000000n,
		big2: 9000000000000n,
	});

	expect(data.$raw.length).toBe(16);

	const result = lib.symbols.verify_bigints(data.$raw);
	expect(result).toBe(4000000000000n);
});

test("handles booleans properly", () => {
	const Bools = struct({ flag1: FFIType.bool, flag2: FFIType.bool });

	const data = createStruct(Bools);
	data.flag1 = true;
	data.flag2 = false;

	expect(data.$raw.length).toBe(2);

	const result = lib.symbols.verify_bools(data.$raw);
	// flag1 = 10, flag2 = 0
	expect(result).toBe(10);
});

test("handles tightly packed 1-byte types without extra padding", () => {
	const Packed = struct({ a: FFIType.i8, b: FFIType.u8, c: FFIType.i8 });

	const data = createStruct(Packed, { a: 10, b: 200, c: -5 });

	// 3 elements of 1 byte each = exactly 3 bytes
	expect(data.$raw.length).toBe(3);

	const result = lib.symbols.verify_packed(data.$raw);
	expect(result).toBe(205); // 10 + 200 - 5
});

/* ------------------- */
/* READ STRUCT TESTS   */
/* ------------------- */

test("reads a modified simple struct", () => {
	const Point = struct({ x: FFIType.i32, y: FFIType.i32 });
	const p = createStruct(Point, { x: 10, y: 20 });

	// C will double the values
	lib.symbols.modify_point(p.$raw);

	expect(p.x).toBe(20);
	expect(p.y).toBe(40);
});

test("reads modified nested structs", () => {
	const Point = struct({ x: FFIType.i32, y: FFIType.i32 });
	const Node = struct({
		id: FFIType.i8,
		center: Point,
		weight: FFIType.i16,
	});
	const node = createStruct(Node, {
		id: 1,
		center: { x: 10, y: 10 },
		weight: 5,
	});

	// C will mutate everything
	lib.symbols.modify_nested_node(node.$raw);

	expect(node.id).toBe(99);
	expect(node.center.x).toBe(777);
	expect(node.center.y).toBe(888);
	expect(node.weight).toBe(1234);
});

test("reads C-strings and raw pointers", () => {
	const PtrStruct = struct({ name: FFIType.cstring, data_ptr: FFIType.ptr });

	const s = createStruct(PtrStruct);

	// C will inject a string pointer and a fake 0xDEADBEEF pointer
	lib.symbols.fill_ptr_struct(s.$raw);

	expect(s.name).toBe("Hello from C FFI!");
	// 0xDEADBEEF in decimal is 3735928559
	expect(s.data_ptr).toBe(3735928559);
});
