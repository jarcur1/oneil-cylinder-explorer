import { RADIUS, GREENWAY_PLACEMENT, MERIDIAN_PLACEMENT } from "./habitat.js";

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
