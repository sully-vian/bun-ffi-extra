import { FFIType, type Pointer, toArrayBuffer } from "bun:ffi";
import { PRIMITIVE_READERS, PRIMITIVE_WRITERS } from "./io";
import { sizeof } from "./layout";
import {
	DEREF,
	type DeepPartial,
	IS_STRUCT,
	LAYOUT,
	type OnlyOne,
	type Ptr,
	type Struct,
	type StructDef,
	TAG_TYPE_KIND,
	type TagType,
	TagTypeKind,
	type TagTypeShape,
	type Union,
	type UnionDef,
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

	// the proxy object
	const structObj: any = {
		get $raw() {
			// expose the raw properly-offset Uint8Array to Bun FFI
			return rootBuffer;
		},
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
			if (type[TAG_TYPE_KIND] === TagTypeKind.FUNPTR) {
				const reader = PRIMITIVE_READERS[FFIType.function];
				const writer = PRIMITIVE_WRITERS[FFIType.function];
				Object.defineProperty(structObj, key, {
					get() {
						return reader(view, fieldOffset, type);
					},
					set(val) {
						writer(view, fieldOffset, val, type);
					},
					enumerable: true,
				});
			} else if (type[TAG_TYPE_KIND] === TagTypeKind.PTR) {
				const ptrReader = PRIMITIVE_READERS[FFIType.ptr];
				const ptrWriter = PRIMITIVE_WRITERS[FFIType.ptr];
				Object.defineProperty(structObj, key, {
					get() {
						try {
							const rawPtr = ptrReader(view, fieldOffset);
							return createPtr(type.def, rawPtr as Pointer | null);
						} catch (e) {
							throw new Error(`Failed to get field '${key}'`, { cause: e });
						}
					},
					set(val) {
						try {
							const addr = val ? val.addr : null;
							ptrWriter(view, fieldOffset, addr);
						} catch (e) {
							throw new Error(`Failed to set field '${key}'`, { cause: e });
						}
					},
					enumerable: true,
				});
			} else {
				// recursive binding for nested structs
				let nestedView: Struct<any>;
				switch (type[TAG_TYPE_KIND]) {
					case TagTypeKind.STRUCT:
						nestedView = createStruct(
							type,
							safeInit[key],
							structBuffer,
							fieldOffset,
						);
						break;
					case TagTypeKind.UNION:
						nestedView = createUnion(
							type,
							safeInit[key],
							structBuffer,
							fieldOffset,
						);
						break;
				}
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
			}
		} else {
			// standard primitive binding
			const reader = PRIMITIVE_READERS[type];
			const writer = PRIMITIVE_WRITERS[type];
			Object.defineProperty(structObj, key, {
				get() {
					try {
						return reader(view, fieldOffset);
					} catch (e) {
						throw new Error(`Failed to get field '${key}'`, { cause: e });
					}
				},
				set(val) {
					try {
						writer(view, fieldOffset, val);
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

	// the proxy object
	const unionObj: any = {
		get $raw() {
			// expose the raw properly-offset Uint8Array to Bun FFI
			return rootBuffer;
		},
	};

	// bind the properties
	for (const key of Object.keys(def)) {
		const type = def[key];
		const fieldOffset = def[LAYOUT].offsets[key];

		if (typeof type === "object") {
			// recursive binding for nested structs
			let nestedView: Struct<any>;
			switch (type[TAG_TYPE_KIND]) {
				case TagTypeKind.STRUCT:
					nestedView = createStruct(
						type,
						safeInit[key],
						unionBuffer,
						fieldOffset,
					);
					break;
				case TagTypeKind.UNION:
					nestedView = createUnion(
						type,
						safeInit[key],
						unionBuffer,
						fieldOffset,
					);
					break;
			}
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
			const reader = PRIMITIVE_READERS[type];
			const writer = PRIMITIVE_WRITERS[type];
			Object.defineProperty(unionObj, key, {
				get() {
					try {
						return reader(view, fieldOffset);
					} catch (e) {
						throw new Error(`Failed to get field '${key}'`, { cause: e });
					}
				},
				set(val) {
					try {
						writer(view, fieldOffset, val);
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

export function createPtr<T extends TagType>(
	def: T,
	addr: Pointer | null,
): Ptr<T> {
	const size = sizeof(def);
	const res = { addr };

	Object.defineProperty(res, DEREF, {
		get() {
			if (addr === null) {
				throw new Error("Cannot dereference null Ptr");
			}
			const buffer = new Uint8Array(toArrayBuffer(addr, 0, size));
			switch (def[TAG_TYPE_KIND]) {
				case TagTypeKind.STRUCT:
					return createStruct(def as StructDef<T>, undefined, buffer);
				case TagTypeKind.UNION:
					return createUnion(def as UnionDef<T>, undefined, buffer);
			}
		},
		set(value) {
			if (addr === null) {
				throw new Error("Cannot dereference null ptr");
			}
			const buffer = new Uint8Array(toArrayBuffer(addr, 0, size));
			if (value[IS_STRUCT]) {
				// fast path: if assigning a struct, do direct memory copy
				buffer.set(value.$raw);
				return;
			}
			throw new Error("TODO");
		},
		enumerable: true,
	});
	return res as Ptr<T>;
}
