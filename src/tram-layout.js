import { RADIUS, GREENWAY_PLACEMENT, MERIDIAN_PLACEMENT } from "./habitat.js";
import { RESERVOIR_THETA } from "./reservoir-layout.js";

export const TRAM_THETA = 0;
export const TRAM_HEIGHT = 13;
export const TRAM_SPEED = 28;
export const TRAM_END_DWELL = 20;
export const TRAM_DWELL = 8;
export const TRAM_BOARD_WINDOW = 0.5;

export const TRAM_CAR_WIDTH = 2.8;
export const TRAM_CAR_LENGTH = 8;
export const TRAM_CAR_HEIGHT = 2.8;
export const TRAM_GANTRY_ARC = 5.2;
export const TRAM_GANTRY_COLUMN_SIZE = 0.6;
export const TRAM_PLATFORM_ARC = 3.8;
export const TRAM_PLATFORM_WIDTH = 2.4;
export const TRAM_PLATFORM_LENGTH = 8;
export const TRAM_PLATFORM_BASE = 12.65;

const STOP_THETA = 2.7 / RADIUS;

export const TRAM_STOPS = Object.freeze(
  [
    {
      id: "tram-gateway",
      name: "Greenway Gateway",
      theta: STOP_THETA,
      y: GREENWAY_PLACEMENT.toWorldY(-300),
      height: 0,
      range: 3.2,
      yaw: 0,
      hint: "East promenade tram pad near Greenway Gateway.",
      landmarkIds: Object.freeze([]),
    },
    {
      id: "tram-market",
      name: "Market Square",
      theta: STOP_THETA,
      y: GREENWAY_PLACEMENT.toWorldY(-250),
      height: 0,
      range: 3.2,
      yaw: 0,
      hint: "East promenade tram pad beside Market Square.",
      landmarkIds: Object.freeze(["greenway-market"]),
    },
    {
      id: "tram-glasshouse",
      name: "Glasshouse 01",
      theta: STOP_THETA,
      y: GREENWAY_PLACEMENT.toWorldY(-214),
      height: 0,
      range: 3.2,
      yaw: 0,
      hint: "East promenade tram pad at the Glasshouse 01 lane.",
      landmarkIds: Object.freeze(["greenway-glasshouse"]),
    },
    {
      id: "tram-plaza",
      name: "Meridian Plaza",
      theta: STOP_THETA,
      y: MERIDIAN_PLACEMENT.toWorldY(-20),
      height: 0,
      range: 3.2,
      yaw: 0,
      hint: "East promenade tram pad at Meridian Plaza.",
      landmarkIds: Object.freeze(["meridian-plaza"]),
    },
    {
      id: "tram-tower",
      name: "Civic Tower",
      theta: STOP_THETA,
      y: MERIDIAN_PLACEMENT.toWorldY(40),
      height: 0,
      range: 3.2,
      yaw: 0,
      hint: "East promenade tram pad near Civic Tower.",
      landmarkIds: Object.freeze(["civic-lobby", "skyroom"]),
    },
  ].map((stop) => Object.freeze(stop)),
);

export const TRAM_TRACK_MIN_Y = TRAM_STOPS[0].y - 12;
export const TRAM_TRACK_MAX_Y = TRAM_STOPS[TRAM_STOPS.length - 1].y + 12;

export const TRAM_GANTRY_YS = (() => {
  const ys = [];
  for (let y = TRAM_TRACK_MIN_Y; y <= TRAM_TRACK_MAX_Y; y += 36) {
    ys.push(y);
  }
  const finalSupportY = TRAM_TRACK_MAX_Y - 1;
  if (ys[ys.length - 1] !== finalSupportY) {
    ys.push(finalSupportY);
  }
  return Object.freeze(ys);
})();

// Line 02 runs around the hull at constant world y. Authored s values are
// ground-arc metres (s = theta * RADIUS); travel speed is physical car speed
// along the arc at TRAM_HEIGHT, i.e. (RADIUS - TRAM_HEIGHT) * |deltaTheta|.
export const STILLWATER_TRAM_Y = 340;
export const STILLWATER_TRAM_MIN_S = 10;
export const STILLWATER_TRAM_MAX_S = RESERVOIR_THETA * RADIUS - 6;
// Lateral half-width of guideway, gantries, platforms, masts and ground pads.
export const STILLWATER_TRAM_CORRIDOR_HALF_WIDTH = 7;
// Platforms, doors and ground pads are on the south (-y) side of the track.
export const STILLWATER_TRAM_PAD_OFFSET_Y = -2.7;

function stillwaterStop(id, name, dockS, hint, landmarkIds) {
  return Object.freeze({
    id,
    name,
    theta: dockS / RADIUS,
    y: STILLWATER_TRAM_Y + STILLWATER_TRAM_PAD_OFFSET_Y,
    height: 0,
    range: 3.2,
    yaw: 0,
    trackTheta: dockS / RADIUS,
    hint,
    landmarkIds: Object.freeze(landmarkIds),
  });
}

export const STILLWATER_TRAM_STOPS = Object.freeze([
  stillwaterStop(
    "tram-meridian-south",
    "Meridian South",
    16,
    "Line 02 pad south of Meridian, east of the promenade's southern end.",
    [],
  ),
  stillwaterStop(
    "tram-stillwater",
    "Stillwater Reserve",
    RESERVOIR_THETA * RADIUS - 12,
    "Line 02 pad beside the Stillwater entrance path.",
    ["stillwater-shore", "stillwater-pavilion", "stillwater-lookout"],
  ),
]);

export const AXIAL_TRAM_LINE = Object.freeze({
  id: "line-01",
  axis: "y",
  title: "CIVIC TRAM · LINE 01",
  sceneName: "civilian_tram",
  linkId: "link-civilian-tram",
  fixed: TRAM_THETA,
  height: TRAM_HEIGHT,
  stops: TRAM_STOPS,
  directionLabels: Object.freeze({ forward: "Northbound", reverse: "Southbound" }),
});

export const STILLWATER_TRAM_LINE = Object.freeze({
  id: "line-02",
  axis: "theta",
  title: "STILLWATER TRAM · LINE 02",
  sceneName: "stillwater_tram",
  linkId: "link-stillwater-tram",
  fixed: STILLWATER_TRAM_Y,
  height: TRAM_HEIGHT,
  stops: STILLWATER_TRAM_STOPS,
  directionLabels: Object.freeze({ forward: "Eastbound", reverse: "Westbound" }),
});

export const TRAM_LINES = Object.freeze([AXIAL_TRAM_LINE, STILLWATER_TRAM_LINE]);

// Arc position on the continuous eastward route, unwrapped into [-PI/2, 3PI/2).
export function stillwaterRouteS(s) {
  const turn = 2 * Math.PI * RADIUS;
  return ((((s + (Math.PI / 2) * RADIUS) % turn) + turn) % turn) - (Math.PI / 2) * RADIUS;
}

// Shared clearance for scenery generators: guideway, gantries, platforms and pads.
export function inStillwaterTramCorridor(s, y, margin = 0) {
  const routeS = stillwaterRouteS(s);
  return (
    routeS >= STILLWATER_TRAM_MIN_S - margin &&
    routeS <= STILLWATER_TRAM_MAX_S + margin &&
    Math.abs(y - STILLWATER_TRAM_Y) <= STILLWATER_TRAM_CORRIDOR_HALF_WIDTH + margin
  );
}
