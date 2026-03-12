import { CString, FFIType, type Pointer, ptr, toArrayBuffer } from "bun:ffi";
import { TYPE_LAYOUT } from "./layout";
import type { MapFFIType, Struct, StructDef } from "./types";

export * from "./layout";
export * from "./types";
export * from "./view";

const layoutCache = new WeakMap<
    StructDef,
    { size: number; align: number; offsets: Record<string, number> }
>();

const defaultValue: { [K in keyof MapFFIType]: MapFFIType[K] } = {
    [FFIType.u8]: Number(),
    [FFIType.i8]: Number(),
    [FFIType.char]: String(),
    [FFIType.bool]: Boolean(),

    [FFIType.u16]: Number(),
    [FFIType.i16]: Number(),

    [FFIType.u32]: Number(),
    [FFIType.i32]: Number(),
    [FFIType.f32]: Number(),

    [FFIType.u64]: BigInt(Number()),
    [FFIType.i64]: BigInt(Number()),
    [FFIType.f64]: Number(),
    [FFIType.u64_fast]: BigInt(Number()),
    [FFIType.i64_fast]: BigInt(Number()),

    [FFIType.ptr]: BigInt(Number()),
    [FFIType.cstring]: String(),
    [FFIType.function]: null,
    [FFIType.buffer]: undefined as never,
    [FFIType.napi_env]: undefined as never,
    [FFIType.napi_value]: undefined as never,
    [FFIType.void]: undefined as never,
};

/** @private */
function getLayoutInfo(def: StructDef): {
    size: number;
    align: number;
    offsets: Record<string, number>;
} {
    let result = layoutCache.get(def);
    if (result !== undefined) {
        return result;
    }

    let currentOffset = 0;
    let maxAlign = 1;
    const offsets: Record<string, number> = {};

    for (const key of Object.keys(def)) {
        const type = def[key];
        if (type === undefined) {
            throw new Error(`Not supposed to happen.`);
        }

        let fieldSize = 0;
        let fieldAlign = 1;
        if (typeof type === "object") {
            const nestedInfo = getLayoutInfo(type);
            fieldSize = nestedInfo.size;
            fieldAlign = nestedInfo.align;
        } else {
            const layout = TYPE_LAYOUT[type];
            if (layout.size === 0) {
                throw new Error(`Unsupported field type: ${type}`);
            }
            fieldSize = layout.size;
            fieldAlign = layout.align;
        }

        maxAlign = Math.max(maxAlign, fieldAlign);
        const padding = (fieldAlign - (currentOffset % fieldAlign)) % fieldAlign;
        currentOffset += padding;
        offsets[key] = currentOffset;
        currentOffset += fieldSize;
    }

    const totalSize = Math.ceil(currentOffset / maxAlign) * maxAlign;

    result = { size: totalSize, align: maxAlign, offsets };
    layoutCache.set(def, result);
    return result;
}

/** @private */
function writeStructData<T extends StructDef>(
    view: DataView,
    def: T,
    obj: Record<string, any>, // Loosened because function is internal
    baseOffset: number,
    offsets: Record<string, number>,
    retainedBuffers: Buffer[],
): Buffer[] {
    for (const key of Object.keys(def)) {
        const type = def[key];
        const val = obj[key];
        const offset = offsets[key];

        if (val === undefined || offset === undefined || type === undefined) {
            continue;
        }
        const totalOffset = baseOffset + offset;

        if (typeof type === "object") {
            const nestedInfo = getLayoutInfo(type);
            writeStructData(
                view,
                type,
                val,
                totalOffset,
                nestedInfo.offsets,
                retainedBuffers,
            );
        } else {
            switch (type) {
                case FFIType.u8:
                    view.setUint8(totalOffset, val);
                    break;
                case FFIType.i8:
                    view.setInt8(totalOffset, val);
                    break;
                case FFIType.char: {
                    const charCode = val.length > 0 ? val.charCode(0) : 0;
                    view.setUint8(totalOffset, charCode);
                    break;
                }
                case FFIType.bool:
                    view.setUint8(totalOffset, val ? 1 : 0);
                    break;
                case FFIType.u16:
                    view.setUint16(totalOffset, val, true);
                    break;
                case FFIType.i16:
                    view.setInt16(totalOffset, val, true);
                    break;
                case FFIType.u32:
                    view.setUint32(totalOffset, val, true);
                    break;
                case FFIType.i32:
                    view.setInt32(totalOffset, val, true);
                    break;
                case FFIType.f32:
                    view.setFloat32(totalOffset, val, true);
                    break;
                case FFIType.f64:
                    view.setFloat64(totalOffset, val, true);
                    break;
                case FFIType.u64:
                case FFIType.u64_fast:
                    view.setBigUint64(totalOffset, val, true);
                    break;
                case FFIType.i64:
                case FFIType.i64_fast:
                    view.setBigInt64(totalOffset, val, true);
                    break;
                case FFIType.ptr: {
                    if (val === null || val === 0) {
                        view.setBigUint64(totalOffset, 0n, true);
                    } else {
                        view.setBigUint64(totalOffset, BigInt(val), true);
                    }
                    break;
                }
                case FFIType.cstring: {
                    const buffer = Buffer.from(`${val}\0`, "utf8");
                    retainedBuffers.push(buffer);
                    view.setBigUint64(totalOffset, BigInt(ptr(buffer)), true);
                    break;
                }
                case FFIType.function: {
                    let ptrVal = 0n;
                    if (val !== null && val !== undefined) {
                        if (typeof val === "object" && "ptr" in val) {
                            ptrVal = BigInt(val.ptr);
                        } else {
                            ptrVal = BigInt(val);
                        }
                    }
                    view.setBigUint64(totalOffset, ptrVal, true);
                    break;
                }
                default:
                    throw new Error(`${type} is not supported for writing.`);
            }
        }
    }
    return retainedBuffers;
}

/** @private */
function readStructData<T extends StructDef>(
    view: DataView,
    def: T,
    baseOffset: number,
    offsets: Record<string, number>,
): Struct<T> {
    const obj: any = {};

    for (const key of Object.keys(def)) {
        const type = def[key];
        const offset = offsets[key];

        if (offset === undefined || type === undefined) {
            continue;
        }
        const totalOffset = baseOffset + offset;

        if (typeof type === "object") {
            const nestedInfo = getLayoutInfo(type);
            obj[key] = readStructData(view, type, totalOffset, nestedInfo.offsets);
        } else {
            switch (type) {
                case FFIType.u8:
                    obj[key] = view.getUint8(totalOffset);
                    break;
                case FFIType.i8:
                    obj[key] = view.getInt8(totalOffset);
                    break;
                case FFIType.char:
                    obj[key] = String.fromCharCode(view.getUint8(totalOffset));
                    break;
                case FFIType.bool:
                    obj[key] = view.getUint8(totalOffset) !== 0;
                    break;
                case FFIType.u16:
                    obj[key] = view.getUint16(totalOffset, true);
                    break;
                case FFIType.i16:
                    obj[key] = view.getInt16(totalOffset, true);
                    break;
                case FFIType.u32:
                    obj[key] = view.getUint32(totalOffset, true);
                    break;
                case FFIType.i32:
                    obj[key] = view.getInt32(totalOffset, true);
                    break;
                case FFIType.f32:
                    obj[key] = view.getFloat32(totalOffset, true);
                    break;
                case FFIType.f64:
                    obj[key] = view.getFloat64(totalOffset, true);
                    break;
                case FFIType.u64:
                case FFIType.u64_fast:
                    obj[key] = view.getBigUint64(totalOffset, true);
                    break;
                case FFIType.i64:
                case FFIType.i64_fast:
                    obj[key] = view.getBigInt64(totalOffset, true);
                    break;
                case FFIType.ptr: {
                    const rawPtr = view.getBigUint64(totalOffset, true);
                    obj[key] = rawPtr === 0n ? null : rawPtr;
                    break;
                }
                case FFIType.cstring: {
                    const strPtr = view.getBigUint64(totalOffset, true);
                    if (strPtr === 0n) {
                        obj[key] = null;
                    } else {
                        obj[key] = new CString(Number(strPtr) as Pointer).toString();
                    }
                    break;
                }
                case FFIType.function: {
                    const funcPtr = view.getBigUint64(totalOffset, true);
                    obj[key] = funcPtr === 0n ? null : funcPtr;
                    break;
                }
                default:
                    throw new Error(`${type} is not supported for reading.`);
            }
        }
    }
    return obj;
}

// Helper type to allow partial nested types
type DeepPartial<T> = T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;

/** returns a "nulled" struct */
export function init<T extends StructDef>(
    def: T,
    initVals?: DeepPartial<Struct<T>>,
): Struct<T> {
    const safeInit: Record<string, any> = initVals || {};
    const obj: Record<string, any> = {};

    for (const key of Object.keys(def)) {
        const type = def[key];

        if (type === undefined) {
            throw new Error(`Invalid struct definition: '${key}'.`);
        } else if (typeof type === "object") {
            obj[key] = init(type, safeInit[key]);
        } else {
            if (safeInit[key] !== undefined) {
                obj[key] = safeInit[key];
            } else {
                obj[key] = defaultValue[type];
            }
        }
    }
    return obj as Struct<T>;
}

/** Serializes `obj` in a binary buffer based on the memory layout defined by `def` */
export function write<T extends StructDef>(def: T, obj: Struct<T>): Uint8Array {
    const info = getLayoutInfo(def);
    const buffer = new Uint8Array(info.size);
    const view = new DataView(buffer.buffer);
    const retainedBuffers: Buffer[] = [];
    writeStructData(view, def, obj, 0, info.offsets, retainedBuffers);

    // pass the buffers along to avoid GC cleanup
    if (retainedBuffers.length > 0) {
        (buffer as any).__retainedStrings = retainedBuffers;
    }

    return buffer;
}

export function read<T extends StructDef>(
    def: T,
    source: Pointer | Uint8Array,
) {
    const info = getLayoutInfo(def);
    let view: DataView;

    if (source instanceof Uint8Array) {
        view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    } else {
        if (source === null) throw new Error("Null pointer dereference");
        const buffer = toArrayBuffer(source, 0, info.size);
        view = new DataView(buffer);
    }
    return readStructData(view, def, 0, info.offsets);
}

/* -------- */
/* EXAMPLES */
/* -------- */
