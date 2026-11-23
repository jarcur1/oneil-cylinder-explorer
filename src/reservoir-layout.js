import { RADIUS } from "./habitat.js";
import { wrappedDeltaTheta } from "./cylinder-math.js";

export const RESERVOIR_NAME = "Stillwater Reserve";
export const RESERVOIR_THETA = Math.PI;
export const RESERVOIR_Y = 450;
export const reservoirS = (s) => RESERVOIR_THETA * RADIUS + s;
export const reservoirY = (y) => RESERVOIR_Y + y;

// Authored coordinates are arc metres around the opposite wall, not world X.
export const RESERVOIR_LAYOUT = Object.freeze({
  bounds: Object.freeze({ minS: -155, maxS: 155, minY: -140, maxY: 140 }),
  basin: Object.freeze({ s: 15, y: 0, width: 90, depth: 104, water: 0.4 }),
  bank: Object.freeze({ width: 6, top: 0.6 }),
  pavilion: Object.freeze({ s: -72, y: -82, width: 24, depth: 18, floor: 0.05, ceiling: 5.8 }),
  lookout: Object.freeze({ s: -100, y: -88, width: 16, depth: 12, top: 0.6 }),
  // These paths and their margins are shared by landscaping and collision.
  paths: Object.freeze([
    Object.freeze({ s: 0, y: -95, width: 6, depth: 50 }),
    Object.freeze({ s: -36, y: -100, width: 78, depth: 6 }),
    Object.freeze({ s: -72, y: -92, width: 6, depth: 16 }),
    Object.freeze({ s: 0, y: -70, width: 206, depth: 6 }),
    Object.freeze({ s: -100, y: 19, width: 6, depth: 178 }),
    Object.freeze({ s: 100, y: 19, width: 6, depth: 178 }),
    Object.freeze({ s: 0, y: 108, width: 206, depth: 6 }),
    Object.freeze({ s: -100, y: -79, width: 6, depth: 18 }),
    Object.freeze({ s: 15, y: -65, width: 6, depth: 10 }),
  ]),
});

export const RESERVOIR_BOUNDS = Object.freeze({
  minS: reservoirS(RESERVOIR_LAYOUT.bounds.minS),
  maxS: reservoirS(RESERVOIR_LAYOUT.bounds.maxS),
  minY: reservoirY(RESERVOIR_LAYOUT.bounds.minY),
  maxY: reservoirY(RESERVOIR_LAYOUT.bounds.maxY),
});

export function inReservoir(s, y, margin = 0) {
  const localS = wrappedDeltaTheta(s / RADIUS, RESERVOIR_THETA) * RADIUS;
  const localY = y - RESERVOIR_Y;
  const b = RESERVOIR_LAYOUT.bounds;
  return localS >= b.minS - margin && localS <= b.maxS + margin &&
    localY >= b.minY - margin && localY <= b.maxY + margin;
}

export const RESERVOIR_ARRIVAL = Object.freeze({
  theta: RESERVOIR_THETA,
  y: reservoirY(-120),
  height: 0,
  yaw: 0,
});

export const RESERVOIR_TARGETS = Object.freeze([
  Object.freeze({
    id: "stillwater-shore", name: "Stillwater shoreline", kind: "public", layer: "surface",
    theta: reservoirS(15) / RADIUS, y: reservoirY(-56), height: 0.6, range: 3,
    hint: "Take Line 02 from Meridian South or use Visit Stillwater Reserve in the intro or pause menu. Follow the entrance path north, turn east along the shore path, and climb the three shallow steps to the bank. The balancing basin is shallow; no swimming.",
  }),
  Object.freeze({
    id: "stillwater-pavilion", name: "Water-management pavilion", kind: "public", layer: "surface",
    theta: reservoirS(-72) / RADIUS, y: reservoirY(-85), height: 0.05, range: 3,
    hint: "From the reserve entrance, take the west path and enter the pavilion through its open south doorway. Its displays describe the water system, and the survey drone console on the east side lets you press E to launch an aerial view.",
  }),
  Object.freeze({
    id: "stillwater-lookout", name: "Meridian-facing lookout", kind: "public", layer: "surface",
    theta: reservoirS(-100) / RADIUS, y: reservoirY(-88), height: 0.6, range: 3,
    hint: "Follow the west woodland path to the stepped lookout. Read the guide, then face north and look high to the left for the Civic Tower's brass crown and the ring in Meridian Plaza.",
  }),
]);
