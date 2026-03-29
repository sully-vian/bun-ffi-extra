# bun-ffi-extra

🚧 This package is currently under active development. APIs may change and some features may be incomplete.

## Development

```bash
bun lint # lint and fix with biomejs

bun test # run tests

bun run build # create dist package
```

## TODO

- [ ] C unions: [Stack Overflow](https://stackoverflow.com/questions/71476166/create-c-style-union-in-ts-type-system)
    - [ ] Implement
    - [ ] Test
    - [ ] Document
- [ ] C arrays
    - [x] Implement
    - [x] Test
    - [x] Maybe [statically bind the indexes](#static-index-properties)
    - [ ] Document
- [ ] C Structs
    - [x] Implement
    - [x] Test
    - [ ] Document
- [ ] Optimizations
    - [ ] decide read and write case methods when defining properties, avoid switch statement traversal on every access

## Ideas

### Static index properties

Issue: on every index access, the same `get` function is called. a different one could be set for every index since we know how long the array is.

```ts
export function createArr<T extends StructDef>(
	def: T,
	arrSize: number,
	buffer?: Uint8Array,
	offset: number = 0,
): Arr<T> {
	const elementSize = sizeof(def);
	const totalSize = elementSize * arrSize;

	const rootBuffer = buffer || new Uint8Array(totalSize);
	const arrBuffer = rootBuffer.subarray(offset, totalSize + offset);

	// Create the base object with static properties
	const arrObj: any = {
		$raw: arrBuffer,
		$length: arrSize,
	};

	arrObj[Symbol.iterator] = function* () {
		for (let i = 0; i < arrSize; i++) yield arrObj[i];
	};

	// Pre-bind all the valid array indices using defineProperty
	for (let i = 0; i < arrSize; i++) {
		Object.defineProperty(arrObj, i, {
			get: () => {
				const elementOffset = i * elementSize;
				return createView(def, undefined, arrBuffer, elementOffset);
			},
			set: (value) => {
				if (!value) return;
				const elementOffset = i * elementSize;
				const view = createView(def, undefined, arrBuffer, elementOffset);
				for (const k of Object.keys(value)) {
					(view as any)[k] = value[k];
				}
			},
			enumerable: true,
		});
	}

	return arrObj as Arr<T>;
}
```
