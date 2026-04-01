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

