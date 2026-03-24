# bun-ffi-extra

🚧 This package is currently under active development. APIs may change and some features may be incomplete.

## Development

```bash
bun lint # lint and fix with biomejs

bun test # run tests

bun run build # create dist package
```

## TODO

- [ ] C arrays
    - [ ] Implement
    - [ ] Test
    - [ ] Document
- [ ] C Structs
    - [x] Implement
    - [x] Test
    - [ ] Document
- [ ] Optimizations
    - [ ] decide read and write case methods when defining properties, avoid switch statement traversal on every access
