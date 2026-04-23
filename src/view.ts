import { CString, FFIType, type Pointer, ptr, toArrayBuffer } from "bun:ffi";
import { sizeof } from "./layout";
import {
	type Arr,
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
			if (type[TAG_TYPE_KIND] === TagTypeKind.PTR) {
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
						console.error(e);
						throw new Error(`Failed to get field '${key}'`, { cause: e });
					}
				},
				set(val) {
					try {
						writer(view, fieldOffset, val);
					} catch (e) {
						console.log(e);
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

const PRIMITIVE_READERS: {
	[K in FFIType]: (view: DataView, offset: number) => any;
} = {
	[FFIType.u8]: (view, offset) => view.getUint8(offset),
	[FFIType.i8]: (view, offset) => view.getInt8(offset),
	[FFIType.char]: (view, offset) => String.fromCharCode(view.getUint8(offset)),
	[FFIType.bool]: (view, offset) => view.getUint8(offset) !== 0,
	[FFIType.u16]: (view, offset) => view.getUint16(offset, true),
	[FFIType.i16]: (view, offset) => view.getInt16(offset, true),
	[FFIType.u32]: (view, offset) => view.getUint32(offset, true),
	[FFIType.i32]: (view, offset) => view.getInt32(offset, true),
	[FFIType.f32]: (view, offset) => view.getFloat32(offset, true),
	[FFIType.u64]: (view, offset) => view.getBigUint64(offset, true),
	[FFIType.u64_fast]: (view, offset) => view.getBigUint64(offset, true),
	[FFIType.i64]: (view, offset) => view.getBigInt64(offset, true),
	[FFIType.i64_fast]: (view, offset) => view.getBigInt64(offset, true),
	[FFIType.f64]: (view, offset) => view.getFloat64(offset, true),
	[FFIType.ptr]: (view, offset) => {
		const rawPtr = view.getBigUint64(offset, true);
		return rawPtr === 0n ? null : Number(rawPtr);
	},
	[FFIType.function]: (view, offset) => {
		const rawPtr = view.getBigUint64(offset, true);
		return rawPtr === 0n ? null : Number(rawPtr);
	},
	[FFIType.cstring]: (view, offset) => {
		const strPtr = Number(view.getBigUint64(offset, true));
		return strPtr === 0 ? null : new CString(strPtr as Pointer).toString();
	},
	[FFIType.void]: () => {},
	[FFIType.napi_env]: () => {},
	[FFIType.napi_value]: () => {},
	[FFIType.buffer]: () => {},
};

const PRIMITIVE_WRITERS: Record<
	number,
	(view: DataView, offset: number, val: any) => void
> = {
	[FFIType.u8]: (view, offset, val) => view.setUint8(offset, val),
	[FFIType.i8]: (view, offset, val) => view.setInt8(offset, val),
	[FFIType.char]: (view, offset, val) => {
		if (typeof val !== "string")
			throw new Error("'val' must be a non-empty string.");
		view.setUint8(offset, val.charCodeAt(0));
	},
	[FFIType.bool]: (view, offset, val) => view.setUint8(offset, val ? 1 : 0),
	[FFIType.u16]: (view, offset, val) => view.setUint16(offset, val, true),
	[FFIType.i16]: (view, offset, val) => view.setInt16(offset, val, true),
	[FFIType.u32]: (view, offset, val) => view.setUint32(offset, val, true),
	[FFIType.i32]: (view, offset, val) => view.setInt32(offset, val, true),
	[FFIType.f32]: (view, offset, val) => view.setFloat32(offset, val, true),
	[FFIType.u64]: (view, offset, val) => view.setBigUint64(offset, val, true),
	[FFIType.u64_fast]: (view, offset, val) =>
		view.setBigUint64(offset, val, true),
	[FFIType.i64]: (view, offset, val) => view.setBigInt64(offset, val, true),
	[FFIType.i64_fast]: (view, offset, val) =>
		view.setBigInt64(offset, val, true),
	[FFIType.f64]: (view, offset, val) => view.setFloat64(offset, val, true),
	[FFIType.ptr]: (view, offset, val) => {
		if (val === null || val === 0) view.setBigUint64(offset, 0n, true);
		else view.setBigUint64(offset, BigInt(val), true);
	},
	[FFIType.function]: (view, offset, val) =>
		view.setBigUint64(offset, BigInt(val.ptr), true),
	[FFIType.cstring]: (view, offset, val) => {
		const buffer = B(val);
		view.setBigUint64(offset, BigInt(ptr(buffer)), true);
	},
};
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
					throw new Error(`Failed to set field '${i}'`, { cause: e });
				}
			},
			enumerable: true,
		});
	}
	return target as Arr<T>;
}

export function B(str: TemplateStringsArray | string) {
	return Buffer.from(`${str}\0`);
}
