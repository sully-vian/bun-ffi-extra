import { sizeof } from "./layout";
import type { StructDef, StructView } from "./types";

export function createView<T extends StructDef>(
    def: T,
    buffer?: Uint8Array,
): StructView<T> {
    const size = sizeof(def);
    const buf = buffer || new Uint8Array(size);

    const structObj: any = {
        get $ptr() {
            return buf;
        },
    };
    return structObj as StructView<T>;
}
