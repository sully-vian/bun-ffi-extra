# bun-ffi-extra

🚧 This package is currently under active development. APIs may change and some features may be incomplete.

The use of Bun FFI's `read` namespace is currently avoided since it is not faster than the built-in `DataView.getFloat64` method despite what the [documentation says](https://bun.com/reference/bun/ffi).

## Development

```bash
bun lint # lint and fix with biomejs

bun test # run tests
```

## TODO

- [ ] Use `import source from "./file.c" with {type: "file"};` to import C source in tests
- [x] Rewrite `Ptr` as `{ [index: number]: T }` for better DX and C arrays ar the same time
- [ ] Rewrite `PRIMITIVE_READERS` and `PRIMITIVE_WRITERS` for better type safety
- [ ] Function Pointers
    - [x] Implement
        - [x] use `JSCallBack.ptr` to write
        - [x] use `CFunction` to read
        - [x] Create a `FunPtr` type with specified return and arg type (mimic C function pointer)
    - [x] Test
    - [ ] Document
- [ ] Make Field type translation correspond to the maps defined in `ffi.d.ts`
- [ ] C unions: [Stack Overflow](https://stackoverflow.com/questions/71476166/create-c-style-union-in-ts-type-system)
    - [x] Implement
    - [x] Test
    - [ ] Document
- [ ] C Structs
    - [x] Implement
    - [x] Test
    - [ ] Document
- [x] Optimizations
    - [x] decide read and write case methods when defining properties, avoid switch statement traversal on every access

