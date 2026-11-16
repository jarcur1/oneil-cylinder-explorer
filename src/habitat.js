// Habitat scale and placement constants; metres, Y is the cylinder's longitudinal axis.
import { createYPlacement } from "./district-placement.js";

export const RADIUS = 360;
export const LENGTH = 1800;
export const EYE_HEIGHT = 1.7;
export const GRAVITY = 9.81;
export const GREENWAY_PLACEMENT = createYPlacement(-230, -LENGTH / 4);
export const MERIDIAN_PLACEMENT = createYPlacement(-5, LENGTH / 4);
export const SPAWN = Object.freeze({
  theta: 0,
  y: GREENWAY_PLACEMENT.toWorldY(-310),
});
export const VIEW_DISTANCE = Math.hypot(LENGTH, RADIUS * 2) + 200;

export function gravityAtHeight(height) {
  return (GRAVITY * Math.max(0, RADIUS - height)) / RADIUS;
}
