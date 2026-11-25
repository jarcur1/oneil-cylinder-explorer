import { Vector3 } from "three";
import { LENGTH, RADIUS } from "./habitat.js";
import { horizontalDistance } from "./cylinder-math.js";
import { MAIN_LIFT } from "./city-layout.js";
import { surfacePos, surfaceUp } from "./surface.js";
import {
  RESERVOIR_LAYOUT,
  STILLWATER_LENS,
  reservoirS,
  reservoirY,
} from "./reservoir-layout.js";

const FLOOR_TOLERANCE = 0.35;
const MERIDIAN_CROWN_HEIGHT = 65;
const SUNLINE_AXIS_Y = LENGTH / 2 - 55;
const BASIN_TARGET_HEIGHT = 1;

const EYEPOINT_THETA = reservoirS(STILLWATER_LENS.eyepoint.s) / RADIUS;
const EYEPOINT_Y = reservoirY(STILLWATER_LENS.eyepoint.y);
const EYEPOINT_POSITION = surfacePos(
  EYEPOINT_THETA,
  EYEPOINT_Y,
  STILLWATER_LENS.eyepoint.height,
);

const BASIN_THETA = reservoirS(RESERVOIR_LAYOUT.basin.s) / RADIUS;
const BASIN_Y = reservoirY(RESERVOIR_LAYOUT.basin.y);

/**
 * Frozen optic view descriptors for the Stillwater Lens, ordered meridian, sunline, basin.
 */
export const OPTIC_VIEWS = Object.freeze([
  Object.freeze({
    id: "meridian",
    label: "Meridian Civic Tower",
    caption:
      "Across the 720 m cylinder, the Civic Tower's brass Meridian Gate rises to 80 m above the 42 m Skyroom beside the plaza ring and transit roof.",
  }),
  Object.freeze({
    id: "sunline",
    label: "Axial Sunline",
    caption:
      "The Sunline reaches Endcap B at the glowing ring. The nine-section luminaire and its parallel maintenance corridor run along the cylinder axis.",
  }),
  Object.freeze({
    id: "basin",
    label: "Stillwater Basin",
    caption:
      "Below the observation deck, the 90 × 104 m balancing basin holds 0.4 m of shallow water within its 0.6 m stone banks and reserve woodland.",
  }),
]);

// Precomputed targets and up vectors keep aimOptics allocation-free.
// Meridian uses Meridian's local inward normal so the opposite-wall tower stands upright;
// Sunline uses world +Y because the cylinder axis has no radial theta normal.
const OPTIC_AIMS = Object.freeze([
  Object.freeze({
    target: surfacePos(MAIN_LIFT.theta, MAIN_LIFT.y, MERIDIAN_CROWN_HEIGHT),
    up: surfaceUp(MAIN_LIFT.theta),
    fov: 13,
  }),
  Object.freeze({
    target: new Vector3(0, SUNLINE_AXIS_Y, 0),
    up: new Vector3(0, 1, 0),
    fov: 30,
    roll: -0.32,
  }),
  Object.freeze({
    target: surfacePos(BASIN_THETA, BASIN_Y, BASIN_TARGET_HEIGHT),
    up: surfaceUp(BASIN_THETA),
    fov: 37,
  }),
]);

/**
 * Return whether the player is grounded on foot within range and floor tolerance of the Stillwater Lens station.
 */
export function canUseOptics(state) {
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
  if (Math.abs(state.height - STILLWATER_LENS.station.height) > FLOOR_TOLERANCE) {
    return false;
  }
  return (
    horizontalDistance(
      state.theta,
      state.y,
      STILLWATER_LENS.station.theta,
      STILLWATER_LENS.station.y,
      STILLWATER_LENS.station.height,
    ) <= STILLWATER_LENS.station.range
  );
}

/**
 * Aim a PerspectiveCamera from the Stillwater Lens eyepoint at the selected optic view.
 * Intended to be called on view selection or resize rather than per frame.
 */
export function aimOptics(camera, index) {
  const aim = OPTIC_AIMS[index];
  camera.position.copy(EYEPOINT_POSITION);
  camera.up.copy(aim.up);
  camera.lookAt(aim.target);
  if (aim.roll) camera.rotateZ(aim.roll);
  camera.fov = aim.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return OPTIC_VIEWS[index];
}
