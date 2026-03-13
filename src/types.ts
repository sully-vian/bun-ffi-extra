import type { FFIType, JSCallback, Pointer } from "bun:ffi";

export type Ptr<_> = Pointer | null;

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

export type StructDef = {
	[key: string]: FFIType | StructDef;
};

export type Struct<T extends StructDef> = {
	-readonly [K in keyof T]: T[K] extends FFIType
		? MapFFIType[T[K]]
		: T[K] extends StructDef
			? Struct<T[K]>
			: never;
};

export type StructView<T extends StructDef> = Struct<T> & {
	readonly $ptr: Uint8Array;
};
