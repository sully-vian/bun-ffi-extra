import { cc, FFIType, ptr } from "bun:ffi";
import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createStruct, funPtr, struct } from "..";

const cFileName = "function.c";
const cPath = join(import.meta.dir, cFileName);

const libDef = {
	execute_callback: {
		args: [FFIType.ptr, FFIType.i32, FFIType.i32],
		returns: FFIType.i32,
	},
	set_c_callback: {
		args: [FFIType.ptr],
		returns: FFIType.void,
	},
} as const;

let lib: ReturnType<typeof cc<typeof libDef>>;

const CallbackStruct = struct({
	id: FFIType.i32,
	callback: funPtr({
		// creates "type" for pointer to int32_t *(int32_t, int32_t);
		args: [FFIType.int32_t, FFIType.int32_t],
		returns: FFIType.int32_t,
	}),
});

describe("Structs with function pointers", () => {
	beforeAll(() => {
		lib = cc({ source: Bun.file(cPath), symbols: libDef });
	});

	test("passes a JSCallback to C inside a struct", () => {
		const myStruct = createStruct(CallbackStruct, { id: 1 });

		// Create a JS callback wrapping a TypeScript function
		const jsCb = (a: number, b: number): number => {
			return a + b;
		};

		// Note: we cast/wrap to BigInt since view.ts `writePrimitive`
		// directly calls `setBigUint64` for FFIType.function.
		myStruct.callback = jsCb;

		// C should read the pointer and execute the JS callback natively
		const result = lib.symbols.execute_callback(myStruct.$raw, 10, 20);
		expect(result).toBe(30);
	});

	test("reads a C function pointer from a struct", () => {
		const myStruct = createStruct(CallbackStruct, { id: 2 });

		// Instruct C to attach its own native function pointer to the struct
		lib.symbols.set_c_callback(myStruct.$raw);

		// Read the pointer back in JS. view.ts casts non-zero BigInts to Number
		expect(myStruct.callback).not.toBeNull();

		// Execute the pointer in C just to verify it points to the valid native multiplier
		const result = lib.symbols.execute_callback(myStruct.$raw, 5, 5);
		expect(result).toBe(25);
	});

	test("handles null function pointers", () => {
		const myStruct = createStruct(CallbackStruct, { id: 3 });

		// Set it explicitly to a 0/null state
		myStruct.callback = null;

		const result = lib.symbols.execute_callback(myStruct.$raw, 10, 20);

		// Our C code returns -1 if the callback pointer is NULL
		expect(result).toBe(-1);
	});
});
