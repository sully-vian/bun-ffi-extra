import { FFIType } from "bun:ffi";
import type { MapFFIType, StructDef } from "./types";

export const POINTER_SIZE = (() => {
    switch (process.arch) {
        case "arm64":
        case "loong64":
        case "ppc64":
        case "riscv64":
        case "s390x":
        case "x64":
            return 8;
        case "arm":
        case "ia32":
        case "mips":
        case "mipsel":
            throw new Error(
                `[bun-ffi-extra] Unsupported architecture: ${process.arch}. This library requires a 64-bit environment.`,
            );
    }
})();

export const TYPE_LAYOUT: {
    [K in keyof MapFFIType]: { size: number; align: number };
} = {
    // 1-byte types
    [FFIType.u8]: { size: 1, align: 1 },
    [FFIType.i8]: { size: 1, align: 1 },
    [FFIType.char]: { size: 1, align: 1 },
    [FFIType.bool]: { size: 1, align: 1 },

    // 2-byte types
    [FFIType.u16]: { size: 2, align: 2 },
    [FFIType.i16]: { size: 2, align: 2 },

    // 4-byte types
    [FFIType.u32]: { size: 4, align: 4 },
    [FFIType.i32]: { size: 4, align: 4 },
    [FFIType.f32]: { size: 4, align: 4 },

    // 8-bytes types
    [FFIType.u64]: { size: 8, align: 8 },
    [FFIType.i64]: { size: 8, align: 8 },
    [FFIType.f64]: { size: 8, align: 8 },
    [FFIType.u64_fast]: { size: 8, align: 8 },
    [FFIType.i64_fast]: { size: 8, align: 8 },

    // pointer types
    [FFIType.ptr]: { size: POINTER_SIZE, align: POINTER_SIZE },
    [FFIType.cstring]: { size: POINTER_SIZE, align: POINTER_SIZE },
    [FFIType.function]: { size: POINTER_SIZE, align: POINTER_SIZE },
    [FFIType.buffer]: { size: POINTER_SIZE, align: POINTER_SIZE },
    [FFIType.napi_env]: { size: POINTER_SIZE, align: POINTER_SIZE },
    [FFIType.napi_value]: { size: POINTER_SIZE, align: POINTER_SIZE },

    [FFIType.void]: { size: 0, align: 0 },
};

export type LayoutInfo = {
    size: number;
    align: number;
    offsets: Record<string, number>;
};
const layoutCache = new WeakMap<StructDef, LayoutInfo>();

export function getLayoutInfo(def: StructDef): LayoutInfo {
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
            throw new Error(`Invalid struct definition.`);
        }

        let fieldSize = 0;
        let fieldAlign = 1;
        if (typeof type === "object") {
            const nestedInfo = getLayoutInfo(type as StructDef);
            fieldSize = nestedInfo.size;
            fieldAlign = nestedInfo.align;
        } else {
            const layout = TYPE_LAYOUT[type as number];
            if (!layout || layout.size === 0) {
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

export function sizeof<T extends StructDef>(def: T): number {
    return getLayoutInfo(def).size;
}
