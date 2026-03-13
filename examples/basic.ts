import { FFIType } from "bun:ffi";
import { type Struct, write } from "../src";

// struct Point {
//     int x;
//     int y;
// };
const Point = {
	x: FFIType.int,
	y: FFIType.int,
} as const;
type Point = Struct<typeof Point>;

// struct Point p1 = {.x = 1, .y = 2};
const p1: Point = {
	x: 1,
	y: 2,
};
write(Point, p1);
const p2 = p1;

const Line = {
	p1: Point,
	p2: Point,
} as const;
type Line = Struct<typeof Line>;

const l: Line = { p1, p2 };
write(Line, l);

const Entity = {
	point: {
		x: FFIType.int,
		y: FFIType.int,
	},
	alive: FFIType.bool,
} as const;
type Entity = Struct<typeof Entity>;

const e: Entity = {
	point: p1,
	alive: true,
};
write(Entity, e);
