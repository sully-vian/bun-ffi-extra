import { CString, FFIType, type Pointer, ptr } from "bun:ffi";
import { getLayoutInfo } from "./layout";
import type { DeepPartial, Struct, StructDef } from "./types";

export function createView<T extends StructDef>(
	def: T,
	initVals?: DeepPartial<Struct<T>>,
	buffer?: Uint8Array,
	offset: number = 0,
): Struct<T> {
	const safeInit: Record<string, any> = initVals || {};
	const info = getLayoutInfo(def);
	const structSize = info.size;

	// resolve underlying memory
	const rootBuffer = buffer || new Uint8Array(structSize);

	// create a struct memory boundary just for this struct using subarray
	// this allows nested structs to perfectly share the same ArrayBuffer
	// without offset math errors.
	const structBuffer = rootBuffer.subarray(offset, offset + structSize);
	const view = new DataView(
		structBuffer.buffer,
		structBuffer.byteOffset,
		structBuffer.byteLength,
	);

	// setup GC retention
	// C-strings require allocationg separate buffers. We must retain them
	// here so the GC doesn't destroy them while the struct is alive
	const retainedStrings: any[] = [];

	// the proxy object
	const structObj: any = {
		get $ptr() {
			// expose the raw properly-offset Uint8Array to Bun FFI
			return rootBuffer;
		},
		__retained: retainedStrings,
	};

	// bind the properties
	for (const key of Object.keys(def)) {
		const type = def[key];
		const fieldOffset = info.offsets[key];

		if (typeof type === "object") {
			// recursive binding for nested structs
			const nestedView = createView(
				type,
				safeInit[key],
				structBuffer,
				fieldOffset,
			);
			Object.defineProperty(structObj, key, {
				get: () => nestedView,
				set: (val) => {
					// allow easy setting: parent.nested = {x: 10, y:20 }
					if (val) {
						for (const k of Object.keys(val)) {
							nestedView[k] = val[k];
						}
					}
				},
				enumerable: true,
			});
		} else {
			// standard primitive binding
			Object.defineProperty(structObj, key, {
				get: () => readPrimitive(view, type, fieldOffset),
				set: (val) =>
					writePrimitive(view, type, fieldOffset, val, retainedStrings),
				enumerable: true,
			});
		}
	}
	return structObj as Struct<T>;
}

function readPrimitive(view: DataView, type: FFIType, offset: number) {
	switch (type) {
		case FFIType.u8:
			return view.getUint8(offset);
		case FFIType.i8:
			return view.getInt8(offset);
		case FFIType.char:
			return String.fromCharCode(view.getUint8(offset));
		case FFIType.bool:
			return view.getUint8(offset) !== 0;
		case FFIType.u16:
			return view.getUint16(offset, true);
		case FFIType.i16:
			return view.getInt16(offset, true);
		case FFIType.u32:
			return view.getUint32(offset, true);
		case FFIType.i32:
			return view.getInt32(offset, true);
		case FFIType.f32:
			return view.getFloat32(offset, true);
		case FFIType.u64:
		case FFIType.u64_fast:
			return view.getBigUint64(offset, true);
		case FFIType.i64:
		case FFIType.i64_fast:
			return view.getBigInt64(offset, true);
		case FFIType.f64:
			return view.getFloat64(offset, true);
		case FFIType.ptr:
		case FFIType.function: {
			const rawPtr = view.getBigUint64(offset, true);
			return rawPtr === 0n ? null : rawPtr;
		}
		case FFIType.cstring: {
			const strPtr = Number(view.getBigUint64(offset, true));
			return strPtr === 0 ? null : new CString(strPtr as Pointer).toString();
		}
		default:
			throw new Error(`Unsupported read for FFIType: ${type}.`);
	}
}

function writePrimitive(
	view: DataView,
	type: FFIType,
	offset: number,
	val: any,
	retained: any[],
) {
	// """gracefully""" handle undefined assignment by treating as 0/null
	if (val === undefined) val = 0;
	switch (type) {
		case FFIType.u8:
			return view.setUint8(offset, val);
		case FFIType.i8:
			return view.setInt8(offset, val);
		case FFIType.char:
			if (typeof val !== "string")
				throw new Error("'val' must be a non-empty string.");
			return view.setUint8(offset, val.charCodeAt(0));
		case FFIType.bool:
			return view.setUint8(offset, val ? 1 : 0);
		case FFIType.u16:
			return view.setUint16(offset, val, true);
		case FFIType.i16:
			return view.setInt16(offset, val, true);
		case FFIType.u32:
			return view.setUint32(offset, val, true);
		case FFIType.i32:
			return view.setInt32(offset, val, true);
		case FFIType.f32:
			return view.setFloat32(offset, val, true);
		case FFIType.u64:
		case FFIType.u64_fast:
			return view.setBigUint64(offset, val, true);
		case FFIType.i64:
		case FFIType.i64_fast:
			return view.setBigInt64(offset, val, true);
		case FFIType.f64:
			return view.setFloat64(offset, val, true);
		case FFIType.ptr:
			if (val === null || val === 0) return view.setBigUint64(offset, 0n, true);
			else return view.setBigUint64(offset, val, true);
		case FFIType.function:
			return view.setBigUint64(offset, val, true);
		case FFIType.cstring: {
			const buffer = Buffer.from(`${val}\0`, "utf8");
			retained.push(buffer);
			return view.setBigUint64(offset, BigInt(ptr(buffer)), true);
		}

		default:
			throw new Error(`Unsupported write for FFIType: ${type}.`);
	}
}
