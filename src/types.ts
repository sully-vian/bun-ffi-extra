import type { FFIType, JSCallback, Pointer } from "bun:ffi";
import { getLayoutInfo, type LayoutInfo } from "./layout";

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

/** @internal
 * When initializing a struct in C, any members not explicitly initilized are
 * implicitely set to zero. This type allows for recursive partial definitions
 * of complex structures.
 * ```ts
 * const Point = struct({
 *     x: FFIType.int,
 *     y: FFIType.int,
 *     meta: { id: FFIType.u64 },
 * });
 * const p = createStruct(Point, { x: 10 }
 * ```
 */
export type DeepPartial<T> = T extends object
	? { [K in keyof T]?: DeepPartial<T[K]> }
	: T;

/** @internal
 * When initializing a union in C, the initializer must have only one element
 * ```ts
 * const IntFloat = union({
 *     i: FFIType.int,
 *     f: FFIType.f32,
 * });
 * const u = createUnion(IntFloat, { f: 1.2 });
 * ```
 */
export type OnlyOne<T> = {
	[K in keyof T]: {
		[P in K]: T[P];
	} & {
		[P in Exclude<keyof T, K>]?: never;
	};
}[keyof T];

/**
 * This type represents the definition of a struct "type".
 * A struct "type" can be defined as such:
 * ```ts
 * const Point = struct({
 *     x: FFIType.int,
 *     y: FFIType.int,
 * });
 * ```
 * which is close to
 * ```c
 * typedef struct {
 *     int x;
 *     int y;
 * } Point;
 * ```
 */
export type FieldType = FFIType | TagType;

export type TagTypeShape = { [key: string]: FieldType };

export type TagType = StructDef<TagTypeShape> | UnionDef<TagTypeShape>;

export enum TagTypeKind { // for runtime checks
	STRUCT,
	UNION,
}

/* ------------------ */
/* C TYPE DEFINITIONS */
/* ------------------ */

export type StructDef<T extends TagTypeShape> = T & {
	readonly [TAG_TYPE_KIND]: TagTypeKind.STRUCT;
	readonly [LAYOUT]: LayoutInfo;
};
export function struct<T extends TagTypeShape>(def: T): StructDef<T> {
	return {
		...def,
		[LAYOUT]: getLayoutInfo(def, TagTypeKind.STRUCT),
		[TAG_TYPE_KIND]: TagTypeKind.STRUCT,
	};
}

export type UnionDef<T extends TagTypeShape> = T & {
	readonly [TAG_TYPE_KIND]: TagTypeKind.UNION;
	readonly [LAYOUT]: LayoutInfo;
};
export function union<T extends TagTypeShape>(def: T): UnionDef<T> {
	return {
		...def,
		[LAYOUT]: getLayoutInfo(def, TagTypeKind.UNION),
		[TAG_TYPE_KIND]: TagTypeKind.UNION,
	};
}

/* ----------------------- */
/* C INSTANCES DEFINITIONS */
/* ----------------------- */

type ViewFields<T extends TagTypeShape> = {
	-readonly [K in keyof T]: T[K] extends StructDef<infer Shape>
		? Struct<Shape>
		: T[K] extends UnionDef<infer Shape>
			? Union<Shape>
			: T[K] extends keyof MapFFIType
				? MapFFIType[T[K]]
				: never;
};

type MemoryView = {
	readonly $raw: Uint8Array;
	readonly [IS_VIEW]: true;
};

export type Struct<T extends TagTypeShape> = ViewFields<T> & MemoryView;

export type Union<T extends TagTypeShape> = ViewFields<T> & MemoryView;

export const DEREF = "_"; // for non-verbose access

/*export type Ptr<T extends TagType> = {
    readonly addr: Pointer;
    readonly [DEREF]: Struct<T>;
};*/
export const NULL = 0 as Pointer;

export type Arr<T extends TagTypeShape> = {
	[index: number]: Struct<T> | ViewFields<T>;
	readonly $raw: Uint8Array;
	readonly $length: number;
	readonly [IS_ARR]: true;
};

export const IS_STRUCT = Symbol("IS_STRUCT");
export const IS_ARR = Symbol("IS_ARR");
export const IS_VIEW = Symbol("IS_VIEW");
export const TAG_TYPE_KIND = Symbol("TAG_TYPE_KIND");
export const LAYOUT = Symbol("LAYOUT");
