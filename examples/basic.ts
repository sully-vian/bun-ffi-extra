import { FFIType } from "bun:ffi";
import { createView } from "../src";

// struct Point {
//     int x;
//     int y;
// };
const Point = {
	x: FFIType.int,
	y: FFIType.int,
} as const;

// struct Point p1 = {.x = 1, .y = 2}; // NOT anymore
const p1 = createView(Point); // create a buffer with js object proxy
p1.x = 1; // writes to the buffer
p1.y = 2;

const p2 = p1;

const Line = {
	p1: Point,
	p2: Point,
} as const;

const l = createView(Line);
l.p1 = p1;
l.p2 = p2;

const Entity = {
	point: {
		x: FFIType.int,
		y: FFIType.int,
	},
	alive: FFIType.bool,
} as const;

const e = createView(Entity);
e.point = p1;
e.alive = true;
