import { FFIType, type Pointer, ptr, toArrayBuffer } from "bun:ffi";
import { PRIMITIVE_READERS, PRIMITIVE_WRITERS } from "./io";
import { POINTER_SIZE, TYPE_LAYOUT } from "./layout";
import {
  DEREF,
  type DeepPartial,
  type FieldType,
  FUNPTR,
  type OnlyOne,
  PTR,
  type Ptr,
  type PtrDef,
  STRUCT,
  type Struct,
  type StructDef,
  type TagTypeShape,
  UNION,
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

  const structSize = def.layout.size;

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

  // bind the properties
  for (const key of Object.keys(def.shape)) {
    const type = def.shape[key];
    const fieldOffset = def.layout.offsets[key];

    if (typeof type === "object") {
      if (type.kind === FUNPTR) {
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
      } else if (type.kind === PTR) {
        const ptrReader = PRIMITIVE_READERS[FFIType.ptr];
        const ptrWriter = PRIMITIVE_WRITERS[FFIType.ptr];
        Object.defineProperty(structObj, key, {
          get() {
            try {
              const rawPtr = ptrReader(view, fieldOffset);
              return createPtr(type, { addr: rawPtr });
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
        switch (type.kind) {
          case STRUCT:
            nestedView = createStruct(
              type,
              safeInit[key],
              structBuffer,
              fieldOffset,
            );
            break;
          case UNION:
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
              if (val.$raw) return structBuffer.set(val.$raw, fieldOffset); // fast: direct memory copy

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

  const unionSize = def.layout.size;

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
  for (const key of Object.keys(def.shape)) {
    const type = def.shape[key];
    const fieldOffset = def.layout.offsets[key];

    if (typeof type === "object") {
      if (type.kind === FUNPTR) {
        const reader = PRIMITIVE_READERS[FFIType.function];
        const writer = PRIMITIVE_WRITERS[FFIType.function];
        Object.defineProperty(unionObj, key, {
          get() {
            return reader(view, fieldOffset, type);
          },
          set(val) {
            writer(view, fieldOffset, val, type);
          },
          enumerable: true,
        });
      } else if (type.kind === PTR) {
        const ptrReader = PRIMITIVE_READERS[FFIType.ptr];
        const ptrWriter = PRIMITIVE_WRITERS[FFIType.ptr];
        Object.defineProperty(unionObj, key, {
          get() {
            try {
              const rawPtr = ptrReader(view, fieldOffset);
              return createPtr(type, rawPtr);
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
        switch (type.kind) {
          case STRUCT:
            nestedView = createStruct(
              type,
              safeInit[key],
              unionBuffer,
              fieldOffset,
            );
            break;
          case UNION:
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
              if (val.$raw) return unionBuffer.set(val.$raw, fieldOffset); // fast: direct memory copy

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

export function createPtr<T extends FieldType>(
  def: PtrDef<T>,
  options?: { addr?: Pointer | null; length?: number },
): Ptr<T> {
  let size: number;
  const pointedDef: FieldType = def.def;

  if (typeof pointedDef !== "object") {
    size = TYPE_LAYOUT[pointedDef].size; // FFIType
  } else if (pointedDef.kind === PTR || pointedDef.kind === FUNPTR) {
    size = POINTER_SIZE; // pointer of function pointer
  } else {
    size = pointedDef.layout.size; // struct or union
  }

  let resolvedAddr: Pointer | null;
  let backingBuffer: Uint8Array | undefined;
  const length = options?.length ?? 1;
  if (options && options.addr !== undefined) {
    resolvedAddr = options.addr;
  } else {
    backingBuffer = new Uint8Array(size * length);
    resolvedAddr = ptr(backingBuffer);
  }
  let res = { addr: resolvedAddr };

  res = new Proxy(res, {
    get(target, prop) {
      if (prop === "addr") return target.addr;
      if (prop === DEREF) prop = "0"; // p[0] <=> *p

      if (typeof prop === "string" && !Number.isNaN(Number(prop))) {
        if (target.addr === null)
          throw new Error("Cannot dereference null Ptr");

        const index = Number(prop);
        const offset = index * size;

        if (index >= length)
          throw new Error(
            `Index out of bounds in pointer (${index} >= ${length})`,
          );

        if (typeof pointedDef === "object") {
          switch (pointedDef.kind) {
            case STRUCT: {
              const buffer = new Uint8Array(
                toArrayBuffer(target.addr, offset, size),
              );
              return createStruct(pointedDef, {}, buffer);
            }
            case UNION: {
              const buffer = new Uint8Array(
                toArrayBuffer(target.addr, offset, size),
              );
              return createUnion(pointedDef, {}, buffer);
            }
            case PTR: {
              const view = new DataView(
                toArrayBuffer(target.addr, offset, size),
              );
              const rawPtr = PRIMITIVE_READERS[FFIType.ptr](view, 0);
              return createPtr(pointedDef, { addr: rawPtr });
            }
            case FUNPTR: {
              const view = new DataView(
                toArrayBuffer(target.addr, offset, size),
              );
              return PRIMITIVE_READERS[FFIType.function](view, 0, pointedDef);
            }
          }
        } else {
          const view = new DataView(toArrayBuffer(target.addr, offset, size));
          return PRIMITIVE_READERS[pointedDef](view, 0);
        }
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      if (prop === "addr") {
        target.addr = value;
        return true;
      }
      if (prop === DEREF) prop = "0";

      if (typeof prop === "string" && !Number.isNaN(Number(prop))) {
        if (target.addr === null)
          throw new Error("Cannot dereference null Ptr");

        const index = Number(prop);
        const offset = index * size;

        if (index >= length)
          throw new Error(
            `Index out of bounds in pointer (${index} >= ${length})`,
          );

        if (typeof pointedDef === "object") {
          switch (pointedDef.kind) {
            case STRUCT:
            case UNION: {
              if (!value || !value.$raw)
                throw new Error(
                  "Cannot assign non-view to struct/union pointer index.",
                );
              const buffer = new Uint8Array(
                toArrayBuffer(target.addr, offset, size),
              );
              buffer.set(value.$raw); // direct memory copy
              return true;
            }
            case PTR: {
              const view = new DataView(
                toArrayBuffer(target.addr, offset, size),
              );
              PRIMITIVE_WRITERS[FFIType.ptr](
                view,
                0,
                value ? value.addr : null,
              );
              return true;
            }
            case FUNPTR: {
              const view = new DataView(
                toArrayBuffer(target.addr, offset, size),
              );
              PRIMITIVE_WRITERS[FFIType.function](view, 0, value, pointedDef);
              return true;
            }
          }
        } else {
          const view = new DataView(toArrayBuffer(target.addr, offset, size));
          PRIMITIVE_WRITERS[pointedDef](view, 0, value);
          return true;
        }
      }
      return Reflect.set(target, prop, value);
    },
  });

  return res as Ptr<T>;
}
