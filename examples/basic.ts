import { FFIType } from "bun:ffi";
import {
	B,
	createStruct,
	createUnion,
	type Infer,
	struct,
	union,
} from "../src";

// struct Point {
//     int x;
//     int y;
// };
const Point = struct({
	x: FFIType.int,
	y: FFIType.int,
});
type Point = Infer<typeof Point>;

// struct Point p1 = {.x = 1, .y = 2}; // NOT anymore
const p1: Point = createStruct(Point); // create a buffer with js object proxy
p1.x = 1; // writes to the buffer
p1.y = 2;

const p2 = p1;

const Line = struct({
	p1: Point,
	p2: Point,
});

const l = createStruct(Line);
l.p1 = p1;
l.p2 = p2;

const Entity = struct({
	point: struct({
		x: FFIType.int,
		y: FFIType.int,
	}),
	alive: FFIType.bool,
});

const e = createStruct(Entity);
e.point = p1;
e.alive = true;

const IntFloat = union({
	i: FFIType.i32,
	f: FFIType.f32,
});
type IntFloat = Infer<typeof IntFloat>;

const u: IntFloat = createUnion(IntFloat);

u.i = 1;
u.f = 420.69; // overwrites u.i

const b = B`Helloéé, World`;
console.log(b);
console.log(b.toString());
const b1 = B("Helloéé, World");
console.log(b1);
console.log(b1.toString());
