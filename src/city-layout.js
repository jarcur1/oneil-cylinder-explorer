import { RADIUS, MERIDIAN_PLACEMENT } from "./habitat.js";

export const CITY_NAME = "Meridian Civic District";
export const CITY_BOUNDS = Object.freeze({
  minS: -100,
  maxS: 120,
  minY: MERIDIAN_PLACEMENT.toWorldY(-80),
  maxY: MERIDIAN_PLACEMENT.toWorldY(135),
});
export const CITY_ARRIVAL = Object.freeze({
  theta: 0,
  y: MERIDIAN_PLACEMENT.toWorldY(-78),
  height: 0,
});
export const TOWER = Object.freeze({
  observationHeight: 42,
});
export const MAIN_LIFT = Object.freeze({
  theta: 48 / RADIUS,
  y: MERIDIAN_PLACEMENT.toWorldY(35),
});
export const SKYWALK_LIFT = Object.freeze({
  theta: 18 / RADIUS,
  y: MERIDIAN_PLACEMENT.toWorldY(65),
});
export const SKYWALK_HEIGHT = 9;

export function inCity(s, y, margin = 0) {
  const b = CITY_BOUNDS;
  return (
    s >= b.minS - margin &&
    s <= b.maxS + margin &&
    y >= b.minY - margin &&
    y <= b.maxY + margin
  );
}

export const CITY_STOPS = [
  {
    id: "meridian-plaza",
    name: "Meridian plaza",
    theta: 0,
    y: MERIDIAN_PLACEMENT.toWorldY(-5),
    height: 0,
    color: 0xe6bc76,
    radius: 12,
    minHeight: 0,
    maxHeight: 2,
    hint: "Continue north along the promenade into Meridian's central plaza.",
  },
  {
    id: "civic-lobby",
    name: "Civic tower lobby",
    theta: 48 / RADIUS,
    y: MERIDIAN_PLACEMENT.toWorldY(29),
    height: 0,
    color: 0x9ad8e8,
    radius: 5,
    minHeight: 0,
    maxHeight: 2,
    hint: "Take the east street from the plaza, then enter the tower's south doorway.",
  },
  {
    id: "skyroom",
    name: "Skyroom · 42 m",
    theta: 48 / RADIUS,
    y: MERIDIAN_PLACEMENT.toWorldY(35),
    height: TOWER.observationHeight,
    color: 0xf3d390,
    radius: 7,
    minHeight: 41.8,
    maxHeight: 44,
    hint: "Inside the civic tower lobby, press E at the lift to visit the Skyroom.",
  },
];
