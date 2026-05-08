import { FFIType } from "bun:ffi";
import {
  FUNPTR,
  LAYOUT,
  type MapFFIType,
  PTR,
  STRUCT,
  TAG_TYPE_KIND,
  type TagType,
  type TagTypeKind,
  type TagTypeShape,
  UNION,
} from "./types";

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
  [FFIType.u64_fast]: { size: 8, align: 8 },
  [FFIType.i64]: { size: 8, align: 8 },
  [FFIType.i64_fast]: { size: 8, align: 8 },
  [FFIType.f64]: { size: 8, align: 8 },

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

export function getLayoutInfo(
  def: TagTypeShape,
  kind: TagTypeKind,
): LayoutInfo {
  let currentOffset = 0;
  let maxAlign = 1;
  let maxSize = 0;
  const offsets: Record<string, number> = {};

  for (const key of Object.keys(def)) {
    const type = def[key];
    if (type === undefined) throw new Error(`Invalid struct definition.`);

    let fieldSize = 0;
    let fieldAlign = 1;

    if (typeof type === "object") {
      if (type[TAG_TYPE_KIND] === PTR || type[TAG_TYPE_KIND] === FUNPTR) {
        fieldSize = POINTER_SIZE;
        fieldAlign = POINTER_SIZE;
      } else {
        fieldSize = type[LAYOUT].size;
        fieldAlign = type[LAYOUT].align;
      }
    } else {
      const layout = TYPE_LAYOUT[type];
      if (!layout || layout.size === 0) {
        throw new Error(`Unsupported field type: ${type}`);
      }
      fieldSize = layout.size;
      fieldAlign = layout.align;
    }

    maxAlign = Math.max(maxAlign, fieldAlign);

    switch (kind) {
      case STRUCT: {
        const padding =
          (fieldAlign - (currentOffset % fieldAlign)) % fieldAlign;
        currentOffset += padding;
        offsets[key] = currentOffset;
        currentOffset += fieldSize;
        break;
      }
      case UNION: {
        offsets[key] = 0;
        maxSize = Math.max(maxSize, fieldSize);
        break;
      }
    }
  }

  let totalSize: number;
  switch (kind) {
    case STRUCT: {
      totalSize = Math.ceil(currentOffset / maxAlign) * maxAlign;
      break;
    }
    case UNION: {
      totalSize = Math.ceil(maxSize / maxAlign) * maxAlign;
      break;
    }
    case PTR:
    case FUNPTR: {
      totalSize = POINTER_SIZE;
      break;
    }
  }

  return { size: totalSize, align: maxAlign, offsets };
}

export function sizeof(def: TagType): number {
  return def[LAYOUT].size;
}
