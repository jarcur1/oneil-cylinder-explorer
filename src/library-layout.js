import { RADIUS, MERIDIAN_PLACEMENT } from "./habitat.js";

// Authored local Meridian coordinates; geometry and resident paths translate once.
export const LIBRARY_LAYOUT = Object.freeze({
  bounds: Object.freeze({ minS: -47, maxS: -23, minY: -35, maxY: -5 }),
  floor: 0.05,
  ceiling: 4.8,
  upperBase: 5.2,
  wallThickness: 0.4,
  door: Object.freeze({ s: -23, y: -20, width: 4, top: 3.8 }),
  tables: Object.freeze([
    Object.freeze({ s: -38, y: -14, width: 4.8, depth: 2, top: 0.78 }),
    Object.freeze({ s: -38, y: -26, width: 4.8, depth: 2, top: 0.78 }),
  ]),
  reader: Object.freeze({
    s: -38,
    y: -15.4,
    heading: 0,
    seatTop: 0.4,
    seatWidth: 0.65,
    seatDepth: 0.7,
  }),
  book: Object.freeze({ s: -38, y: -14.9, height: 0.8, width: 0.5, depth: 0.36 }),
});

// A public destination, not another saved discovery or job.
export const LIBRARY_TARGET = Object.freeze({
  id: "meridian-library",
  name: "Library reading room",
  theta: -27 / RADIUS,
  y: MERIDIAN_PLACEMENT.toWorldY(LIBRARY_LAYOUT.door.y),
  height: LIBRARY_LAYOUT.floor,
  range: 2,
  kind: "public",
  layer: "surface",
  hint: "Enter the library's east portico through the central doorway. The ground-floor reading room is public; upper archives remain closed.",
});
