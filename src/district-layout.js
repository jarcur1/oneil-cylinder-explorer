import { RADIUS } from "./habitat.js";

export const DISTRICT_NAME = "Greenway Commons";
export const DISTRICT_BOUNDS = Object.freeze({
  minS: -90,
  maxS: 145,
  minY: -292,
  maxY: -110,
});

// Hand-built geometry owns this rectangle; background scenery stays outside it.
export function inDistrict(s, y, margin = 0) {
  const b = DISTRICT_BOUNDS;
  return (
    s >= b.minS - margin &&
    s <= b.maxS + margin &&
    y >= b.minY - margin &&
    y <= b.maxY + margin
  );
}

export const DISTRICT_STOPS = [
  {
    id: "greenway-market",
    name: "Market square",
    theta: 0,
    y: -230,
    color: 0xd5f58e,
    radius: 11,
    minHeight: 0,
    hint: "Follow the promenade to the square. The glasshouse is along the east lane.",
  },
  {
    id: "greenway-glasshouse",
    name: "Glasshouse 01",
    theta: 64 / RADIUS,
    y: -214,
    color: 0x79ddd2,
    radius: 6,
    minHeight: 0,
    hint: "Take the east lane at the square. Enter the glasshouse through its open central doorway.",
  },
  {
    id: "greenway-overlook",
    name: "Orchard overlook",
    theta: -58 / RADIUS,
    y: -145,
    color: 0xffc477,
    radius: 5,
    minHeight: 2,
    hint: "Follow the promenade north to the ORCHARD sign. Take the west lane and climb the overlook steps.",
  },
];
