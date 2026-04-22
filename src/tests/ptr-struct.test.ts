import { ptr as bunPtr, cc, FFIType } from "bun:ffi";
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createPtr, createStruct, pointer, sizeof, struct } from "..";

const cFileName = "ptr-struct.c";
const cPath = join(import.meta.dir, cFileName);

const libDef = {
	verify_node: {
		args: [FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32],
		returns: FFIType.bool,
	} as const,
	get_c_node: { returns: FFIType.ptr } as const,
	mutate_node_target: { args: [FFIType.ptr], returns: FFIType.void } as const,
} as const;

let lib: ReturnType<typeof cc<typeof libDef>>;

const Point = struct({ x: FFIType.i32, y: FFIType.i32 });
const Node = struct({
	id: FFIType.u32,
	point_ptr: pointer(Point),
});

describe("Structs with nested Pointers", () => {
	beforeAll(() => {
		lib = cc({ source: Bun.file(cPath), symbols: libDef });
	});

	test("calculates layout correctly with padding for 64-bit pointers", () => {
		// id(4) + pad(4) + ptr(8) = 16
		expect(sizeof(Node)).toBe(16);
	});

	test("packs a struct with a pointer field for C", () => {
		// Create the underlying data
		const myPoint = createStruct(Point, { x: 50, y: 60 });

		// Create the outer node
		const myNode = createStruct(Node, {
			id: 123,
		});

		// Assign the pointer field using a Ptr wrapper around the raw memory address
		myNode.point_ptr = createPtr(Point, bunPtr(myPoint.$raw));

		const isValid = lib.symbols.verify_node(myNode.$raw, 123, 50, 60);
		expect(isValid).toBeTrue();
	});

	test("reads a nested pointer returned from C", () => {
		// Get a Node* from C
		const rawNodePtr = lib.symbols.get_c_node();

		// Map the raw pointer to our JS Node view
		const cNodeView = createPtr(Node, rawNodePtr);
		const n = cNodeView._;

		expect(n.id).toBe(42);
		expect(n.point_ptr).not.toBeNull();
		expect(n.point_ptr.addr).not.toBeNull();

		// Dereference the inner pointer field
		const innerPoint = n.point_ptr._;
		expect(innerPoint.x).toBe(100);
		expect(innerPoint.y).toBe(200);
	});

	test("mutates pointed-to struct via C", () => {
		const myPoint = createStruct(Point, { x: 10, y: 20 });
		const myNode = createStruct(Node, { id: 1 });

		myNode.point_ptr = createPtr(Point, bunPtr(myPoint.$raw));

		// Pass the struct view to C, which will follow the pointer and mutate myPoint
		lib.symbols.mutate_node_target(myNode.$raw);

		// The original JS Point struct should reflect the C mutations
		expect(myPoint.x).toBe(20);
		expect(myPoint.y).toBe(40);

		// The nested pointer dereference should also see it
		expect(myNode.point_ptr._.x).toBe(20);
		expect(myNode.point_ptr._.y).toBe(40);
	});

	test("handles null pointers safely inside structs", () => {
		const myNode = createStruct(Node, { id: 99 });
		myNode.point_ptr = createPtr(Point, null);

		expect(myNode.point_ptr.addr).toBeNull();
		// Attempting to deref a null pointer should throw
		expect(() => myNode.point_ptr._).toThrow();
	});
});
