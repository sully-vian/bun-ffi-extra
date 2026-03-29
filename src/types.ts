import type { FFIType, JSCallback, Pointer } from "bun:ffi";

export type MapFFIType = {
	[FFIType.u8]: number;
	[FFIType.i8]: number;
	[FFIType.char]: string;
	[FFIType.bool]: boolean;

	[FFIType.u16]: number;
	[FFIType.i16]: number;

	[FFIType.u32]: number;
	[FFIType.i32]: number;
	[FFIType.f32]: number;

	[FFIType.u64]: bigint;
	[FFIType.u64_fast]: bigint;
	[FFIType.i64]: bigint;
	[FFIType.i64_fast]: bigint;
	[FFIType.f64]: number;

	[FFIType.ptr]: bigint;
	[FFIType.cstring]: string;
	[FFIType.function]: JSCallback | Pointer | null;
	[FFIType.buffer]: never;
	[FFIType.napi_env]: never;
	[FFIType.napi_value]: never;
	[FFIType.void]: never;
};

/** @internal */
export type DeepPartial<T> = T extends object
	? { [K in keyof T]?: DeepPartial<T[K]> }
	: T;

type FieldType = FFIType | StructDef;

/**
 * This type represents the definition of a struct "type".
 * A struct "type" can be defined as such:
 * ```ts
 * const Point = {
 *     x: FFIType.int,
 *     y: FFIType.int,
 * } as const;
 * ```
 * which is close to
 * ```c
 * typedef struct {
 *     int x;
 *     int y;
 * } Point;
 * ```
 */
export type StructDef = {
	[key: string]: FieldType;
};

type InternalStruct<T extends StructDef> = {
	-readonly [K in keyof T]: T[K] extends StructDef
		? InternalStruct<T[K]>
		: T[K] extends keyof MapFFIType
			? MapFFIType[T[K]]
			: never;
};

export type Struct<T extends StructDef> = InternalStruct<T> & {
	readonly $raw: Uint8Array;
	readonly [IS_STRUCT]: true;
};

export type Ptr<T extends StructDef> = {
	readonly addr: Pointer;
	readonly _: Struct<T>;
};
export const NULL = 0 as Pointer;

export type Arr<T extends StructDef> = {
	[index: number]: Struct<T> | InternalStruct<T>;
	readonly $raw: Uint8Array;
	readonly $length: number;
	readonly [IS_ARR]: true;
};

export const IS_STRUCT = Symbol("IS_STRUCT");
export const IS_ARR = Symbol("IS_ARR");
