import { RADIUS, LENGTH } from "./habitat.js";

// The passage is behind the light when viewed from the main promenade.
export const SPINE_THETA = Math.PI;
export const AXIAL_HEIGHT = RADIUS - 10;
const SPINE_RADIUS = RADIUS - AXIAL_HEIGHT;
export const SPINE_ROOF_HEIGHT = AXIAL_HEIGHT + 4.5;
export const axialArc = (metres) => metres * RADIUS / SPINE_RADIUS;
export const axialAngle = (metres) => metres / SPINE_RADIUS;
export const SUNLINE_MODULE_COUNT = 9;
export const SUNLINE_MODULE_LENGTH = (LENGTH - 8) / SUNLINE_MODULE_COUNT;
export const SERVICE_MODULE_INDEX = 1;
export const SERVICE_MODULE_Y =
  -(LENGTH - 8) / 2 + SUNLINE_MODULE_LENGTH * (SERVICE_MODULE_INDEX + 0.5);
export const SUNLINE_TRACK_MIN_Y = -LENGTH / 2 + 40;
export const SUNLINE_TRACK_MAX_Y = LENGTH / 2 - 40;
export const SUNLINE_CORRIDOR_MIN_Y = -LENGTH / 2 + 38;
export const SUNLINE_CORRIDOR_MAX_Y = LENGTH / 2 - 38;
export const SUNLINE_PHASES = Object.freeze([
  "available", "isolated", "replaced", "complete",
]);

function hub(id, label, side) {
  const halfLength = LENGTH / 2;
  const edgeA = side * (halfLength - 20);
  const edgeB = side * (halfLength - 38);
  const minY = Math.min(edgeA, edgeB);
  const maxY = Math.max(edgeA, edgeB);
  const centerY = side * (halfLength - 29);
  const outerWallY = side * (halfLength - 19.6);
  const gateY = side * (halfLength - 37.6);
  const constraint = Object.freeze({
    mode: "secured", height: AXIAL_HEIGHT, speed: 3, theta: SPINE_THETA,
    minDTheta: -0.5, maxDTheta: 0.5,
    minY: minY + 1, maxY: maxY - 1,
  });
  const rim = Object.freeze({
    theta: SPINE_THETA - 0.25, y: side * (halfLength - 26), height: 0,
    yaw: side < 0 ? Math.PI : 0,
  });
  const landing = Object.freeze({
    theta: SPINE_THETA - 0.25, y: side * (halfLength - 26), height: AXIAL_HEIGHT,
    yaw: side < 0 ? 0 : Math.PI, constraint,
  });
  const dock = Object.freeze({
    theta: SPINE_THETA, y: side * (halfLength - 36), height: AXIAL_HEIGHT,
    yaw: side < 0 ? Math.PI : 0, constraint,
  });
  const trolleyConstraint = Object.freeze({
    mode: "trolley", height: AXIAL_HEIGHT, theta: SPINE_THETA,
    minY: SUNLINE_TRACK_MIN_Y, maxY: SUNLINE_TRACK_MAX_Y, speed: 18, direction: -side,
  });
  const trolley = Object.freeze({
    theta: SPINE_THETA, y: side * (halfLength - 40), height: AXIAL_HEIGHT,
    yaw: side < 0 ? 0 : Math.PI, constraint: trolleyConstraint,
  });
  const control = Object.freeze({
    theta: SPINE_THETA + 0.3, y: side * (halfLength - 28), height: AXIAL_HEIGHT,
    range: 2.2, name: `${label} isolation console`,
  });
  return Object.freeze({
    id,
    label,
    side,
    minY,
    maxY,
    centerY,
    outerWallY,
    gateY,
    rim,
    landing,
    dock,
    trolley,
    control,
    constraint,
  });
}

export const ENDCAP_HUBS = Object.freeze([
  hub("endcap-a-hub", "Endcap A", -1),
  hub("endcap-b-hub", "Endcap B", 1),
]);
export const ENDCAP_ARRIVAL = ENDCAP_HUBS[0].rim;
export const SUNLINE_PANEL = Object.freeze({
  theta: SPINE_THETA, y: SERVICE_MODULE_Y, height: AXIAL_HEIGHT,
  range: 2.5, name: "Sunline module SL-02",
});

export function getAxialHub(state) {
  if (Math.abs(state.height - AXIAL_HEIGHT) > 0.5) return null;
  const angle = Math.atan2(Math.sin(state.theta - SPINE_THETA), Math.cos(state.theta - SPINE_THETA));
  if (Math.abs(angle) > 0.6) return null;
  for (const h of ENDCAP_HUBS)
    if (state.y >= h.minY && state.y <= h.maxY) return h;
  return null;
}

export const SUNLINE_STOPS = [
  ...ENDCAP_HUBS.map((h) => ({
    id: h.id, name: `${h.label} maintenance hub`,
    theta: SPINE_THETA, y: h.control.y, height: AXIAL_HEIGHT,
    color: 0x8ed8e8, radius: 7,
    minHeight: AXIAL_HEIGHT - 0.4, maxHeight: AXIAL_HEIGHT + 0.4,
    hint: `Take ${h.label}'s far-side rim lift toward the axis. Endcap A is also available from the pause menu.`,
  })),
  {
    id: "sunline-module-02", name: "Sunline service spine",
    theta: SPINE_THETA, y: SERVICE_MODULE_Y, height: AXIAL_HEIGHT,
    color: 0xf3d390, radius: 7,
    minHeight: AXIAL_HEIGHT - 0.4, maxHeight: AXIAL_HEIGHT + 0.4,
    hint: "In either endcap hub, board the maintenance trolley. W drives and S reverses; stop at SL-02.",
  },
];
