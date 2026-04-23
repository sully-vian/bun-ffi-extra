import { CString, FFIType, type Pointer, ptr } from "bun:ffi";

export const PRIMITIVE_READERS: {
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

export const PRIMITIVE_WRITERS: {
	[K in FFIType]: (view: DataView, offset: number, val: any) => void;
} = {
	[FFIType.u8]: (view, offset, val) => view.setUint8(offset, val),
	[FFIType.i8]: (view, offset, val) => view.setInt8(offset, val),
	[FFIType.char]: (view, offset, val) =>
		view.setUint8(offset, val.charCodeAt(0)),
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
	[FFIType.void]: () => {
		throw new Error("not implemented yet");
	},
	[FFIType.napi_env]: () => {
		throw new Error("not implemented yet");
	},
	[FFIType.napi_value]: () => {
		throw new Error("not implemented yet");
	},
	[FFIType.buffer]: () => {
		throw new Error("not implemented yet");
	},
};

export function B(str: TemplateStringsArray | string) {
	return Buffer.from(`${str}\0`);
}
