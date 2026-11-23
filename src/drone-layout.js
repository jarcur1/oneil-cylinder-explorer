import { RADIUS } from "./habitat.js";
import { horizontalDistance } from "./cylinder-math.js";
import { RESERVOIR_LAYOUT, reservoirS, reservoirY } from "./reservoir-layout.js";

const FLOOR_TOLERANCE = 0.35;

export const DRONE_CONSOLE = Object.freeze({
  theta: reservoirS(-68) / RADIUS,
  y: reservoirY(-85),
  height: RESERVOIR_LAYOUT.pavilion.floor,
  range: 2.4,
});

export const DRONE_LAUNCH = Object.freeze({
  theta: reservoirS(-45) / RADIUS,
  y: reservoirY(-66),
  height: 16,
  yaw: Math.PI / 2,
  pitch: -0.22,
});

export function canLaunchDrone(state) {
  if (!state?.grounded || state.traversalMode !== "walk") {
    return false;
  }
  if (
    !Number.isFinite(state.theta) ||
    !Number.isFinite(state.y) ||
    !Number.isFinite(state.height)
  ) {
    return false;
  }
  if (Math.abs(state.height - DRONE_CONSOLE.height) > FLOOR_TOLERANCE) {
    return false;
  }
  return (
    horizontalDistance(
      state.theta,
      state.y,
      DRONE_CONSOLE.theta,
      DRONE_CONSOLE.y,
      DRONE_CONSOLE.height,
    ) <= DRONE_CONSOLE.range
  );
}
