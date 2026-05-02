import type { FFIFunction, FFIType, JSCallback, Pointer } from "bun:ffi";
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

	[FFIType.ptr]: number;
	[FFIType.cstring]: string;
	[FFIType.function]: JSCallback;
	[FFIType.buffer]: never;
	[FFIType.napi_env]: never;
	[FFIType.napi_value]: never;
	[FFIType.void]: never;
};

/** @internal
 * When initializing a struct in C, any members not explicitly initilized are
 * implicitely set to zero. This type allows for recursive partial definitions
 * of complex structures.
 * @example
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
 * @example
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
 * Extracts the TypeScript implementation type from a {@link StructDef} or {@link UnionDef}.
 * @example
 * ```ts
 * const User = struct({
 *    id: FFIType.int,
 *    name: FFIType.cstring
 * });
 * type User = Infer<typeof User>;
 * let user: User = createView(User);
 * ```
 */
export type Infer<T> =
	T extends StructDef<infer Shape>
		? Struct<Shape>
		: T extends UnionDef<infer Shape>
			? Union<Shape>
			: never;

export type FieldType = FFIType | TagType | PtrDef<any> | FunPtrDef;

export type TagTypeShape = { [key: string]: FieldType };

export type TagType = StructDef<TagTypeShape> | UnionDef<TagTypeShape>;

export enum TagTypeKind { // for runtime checks
	STRUCT,
	UNION,
	PTR,
	FUNPTR,
}

/* ------------------ */
/* C TYPE DEFINITIONS */
/* ------------------ */

/**
 * This type represents the definition of a struct "type".
 * A struct "type" can be defined as such:
 * @example
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

/**
 * This type represents the definition of a union "type".
 * A union "type" can be defined as such:
 * @example
 * ```ts
 * const IntFloat = union({
 *     i: FFIType.int,
 *     f: FFIType.f32,
 * });
 * ```
 * which is close to
 * ```c
 * union {
 *     int i;
 *     float f;
 * };
 * ```
 */
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

export type PtrDef<T extends TagType> = {
	readonly [TAG_TYPE_KIND]: TagTypeKind.PTR;
	readonly def: T;
};

export function pointer<T extends TagType>(def: T): PtrDef<T> {
	return {
		[TAG_TYPE_KIND]: TagTypeKind.PTR,
		def,
	};
}

export type FunPtrDef = FFIFunction & {
	readonly [TAG_TYPE_KIND]: TagTypeKind.FUNPTR;
};

export function funPtr(def: FFIFunction): FunPtrDef {
	return { ...def, [TAG_TYPE_KIND]: TagTypeKind.FUNPTR };
}

/* ----------------------- */
/* C INSTANCES DEFINITIONS */
/* ----------------------- */

type ViewFields<T extends TagTypeShape> = {
	-readonly [K in keyof T]: T[K] extends StructDef<infer Shape>
		? Struct<Shape>
		: T[K] extends UnionDef<infer Shape>
			? Union<Shape>
			: T[K] extends PtrDef<infer Pointed>
				? Ptr<Pointed>
				: T[K] extends FunPtrDef
					? ((...args: any[]) => any) | null
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

export type Ptr<T extends TagType> = {
	readonly addr: Pointer | null;
	[DEREF]: Infer<T>;
};

export const IS_STRUCT = Symbol("IS_STRUCT");
export const IS_VIEW = Symbol("IS_VIEW");
export const TAG_TYPE_KIND = Symbol("TAG_TYPE_KIND");
export const LAYOUT = Symbol("LAYOUT");
