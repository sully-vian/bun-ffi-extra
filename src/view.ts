import { CString, FFIType, type Pointer, ptr } from "bun:ffi";
import { sizeof } from "./layout";
import {
	type Arr,
	type DeepPartial,
	IS_STRUCT,
	LAYOUT,
	type OnlyOne,
	type Struct,
	type StructDef,
	TAG_TYPE_KIND,
	type TagType,
	type Union,
	type UnionDef,
    type TagTypeShape,
} from "./types";

export function createStruct<T extends TagTypeShape>(
	def: StructDef<T>,
	initVals?: DeepPartial<Struct<T>>,
	buffer?: Uint8Array,
	offset: number = 0,
): Struct<T> {
	const safeInit: Record<string, any> = initVals || {};

	const structSize = def[LAYOUT].size;

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
	const retainedStrings: Buffer[] = [];

	// the proxy object
	const structObj: any = {
		get $raw() {
			// expose the raw properly-offset Uint8Array to Bun FFI
			return rootBuffer;
		},
		__retained: retainedStrings,
	};

	Object.defineProperty(structObj, IS_STRUCT, {
		value: true,
		enumerable: false,
		writable: false,
	});

	// bind the properties
	for (const key of Object.keys(def)) {
		const type = def[key];
		const fieldOffset = def[LAYOUT].offsets[key];

		if (typeof type === "object") {
			// recursive binding for nested structs
			try {
				const nestedView = createStruct(
					{ ...type, [TAG_TYPE_KIND]: def[TAG_TYPE_KIND] },
					safeInit[key],
					structBuffer,
					fieldOffset,
				);
				Object.defineProperty(structObj, key, {
					get: () => nestedView,
					set(val) {
						try {
							// allow easy setting: parent.nested = { x: 10, y: 20 };
							if (!val) return;
							if (val[IS_STRUCT])
								return structBuffer.set(val.$raw, fieldOffset); // fast: direct memory copy

							for (const k of Object.keys(val)) {
								(nestedView as any)[k] = val[k];
							}
						} catch (e) {
							throw new Error(`Failed to set field '${key}'`, { cause: e });
						}
					},
					enumerable: true,
				});
			} catch (e) {
				console.log(`failed on '${key}'`);
				throw e;
			}
		} else {
			// standard primitive binding
			Object.defineProperty(structObj, key, {
				get() {
					try {
						return readPrimitive(view, type, fieldOffset);
					} catch (e) {
						throw new Error(`Failed to get field '${key}'`, { cause: e });
					}
				},
				set(val) {
					try {
						writePrimitive(view, type, fieldOffset, val, retainedStrings);
					} catch (e) {
						throw new Error(`Failed to set field '${key}'`, { cause: e });
					}
				},
				enumerable: true,
			});
			if (safeInit[key] !== undefined) structObj[key] = safeInit[key];
		}
	}
	return structObj as Struct<T>;
}

export function createUnion<T extends TagTypeShape>(
	def: UnionDef<T>,
	initVals?: OnlyOne<Union<T>>,
	buffer?: Uint8Array,
	offset: number = 0,
): Union<T> {
	const safeInit: Record<string, any> = initVals || {};

	const unionSize = def[LAYOUT].size;

	// resolve underlying memory
	const rootBuffer = buffer || new Uint8Array(unionSize);

	const unionBuffer = rootBuffer.subarray(offset, offset + unionSize);
	const view = new DataView(
		unionBuffer.buffer,
		unionBuffer.byteOffset,
		unionBuffer.byteLength,
	);

	// setup GC retention
	// C-strings require allocationg separate buffers. We must retain them
	// here so the GC doesn't destroy them while the struct is alive
	const retainedStrings: Buffer[] = [];

	// the proxy object
	const unionObj: any = {
		get $raw() {
			// expose the raw properly-offset Uint8Array to Bun FFI
			return rootBuffer;
		},
		__retained: retainedStrings,
	};

	// bind the properties
	for (const key of Object.keys(def)) {
		const type = def[key];
		const fieldOffset = def[LAYOUT].offsets[key];

		if (typeof type === "object") {
			// recursive binding for nested structs
			const nestedView = createStruct(
				{ ...type, [TAG_TYPE_KIND]: def[TAG_TYPE_KIND] },
				safeInit[key],
				unionBuffer,
				fieldOffset,
			);
			Object.defineProperty(unionObj, key, {
				get: () => nestedView,
				set(val) {
					try {
						// allow easy setting: parent.nested = { x: 10, y: 20 };
						if (!val) return;
						if (val[IS_STRUCT]) return unionBuffer.set(val.$raw, fieldOffset); // fast: direct memory copy

						for (const k of Object.keys(val)) {
							(nestedView as any)[k] = val[k];
						}
					} catch (e) {
						throw new Error(`Failed to set field '${key}'`, { cause: e });
					}
				},
				enumerable: true,
			});
		} else {
			// standard primitive binding
			Object.defineProperty(unionObj, key, {
				get() {
					try {
						return readPrimitive(view, type, fieldOffset);
					} catch (e) {
						throw new Error(`Failed to get field '${key}'`, { cause: e });
					}
				},
				set(val) {
					try {
						writePrimitive(view, type, fieldOffset, val, retainedStrings);
					} catch (e) {
						throw new Error(`Failed to set field '${key}'`, { cause: e });
					}
				},
				enumerable: true,
			});
			if (safeInit[key] !== undefined) unionObj[key] = safeInit[key];
		}
	}
	return unionObj as Struct<T>;
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
	retained: Buffer[],
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

/*export function createPtr<T extends TagType>(def: T, obj: Struct<T>): Ptr<T> {
    const addr = ptr(obj.$raw);

    const res = { addr };
    const size = sizeof(def);

    Object.defineProperty(res, DEREF, {
        get() {
            const buffer = new Uint8Array(toArrayBuffer(res.addr, 0, size));
            return createView(def, undefined, buffer);
        },
        enumerable: true,
    });
    return res as Ptr<T>;
}*/

export function createArr<T extends TagTypeShape>(
	def: StructDef<T>,
	arrSize: number,
	buffer?: Uint8Array,
	offset: number = 0,
): Arr<T> {
	const elementSize = sizeof(def);
	const totalSize = elementSize * arrSize;

	const rootBuffer = buffer || new Uint8Array(totalSize);
	const arrBuffer = rootBuffer.subarray(offset, totalSize + offset);

	const target: Partial<Arr<T>> = { $raw: arrBuffer, $length: arrSize };

	const viewCache = new Array(arrSize);

	// pre-bind all array indices
	for (let i = 0; i < arrSize; i++) {
		Object.defineProperty(target, i, {
			get(): Struct<T> {
				try {
					if (!viewCache[i]) {
						const elementOffset = i * elementSize;
						viewCache[i] = createStruct(
							def,
							undefined,
							arrBuffer,
							elementOffset,
						);
					}
					return viewCache[i];
				} catch (e) {
					throw new Error(`Failed to get field '${i}'`, { cause: e });
				}
			},
			set(value) {
				try {
					if (!value) return;

					const elementOffset = i * elementSize;
					if (value[IS_STRUCT]) return arrBuffer.set(value.$raw, elementOffset);

					const view = target[i];
					for (const k of Object.keys(value)) {
						(view as any)[k] = value[k];
					}
				} catch (e) {
					throw new Error(`Failed to get field '${i}'`, { cause: e });
				}
			},
			enumerable: true,
		});
	}
	return target as Arr<T>;
}
