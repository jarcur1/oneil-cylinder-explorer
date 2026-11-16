import { horizontalDistance } from "./cylinder-math.js";
import {
  MAIN_LIFT,
  SKYWALK_LIFT,
  SKYWALK_HEIGHT,
  TOWER,
} from "./city-layout.js";
import { SERVICE_ACCESS, SERVICE_FLOOR } from "./service-layout.js";

export const CITY_LIFT_STOPS = Object.freeze(
  [
    {
      id: "main-lift-up",
      name: "Civic tower lift",
      ...MAIN_LIFT,
      height: 0,
      destination: Object.freeze({
        ...MAIN_LIFT,
        height: TOWER.observationHeight,
        yaw: Math.PI,
      }),
      prompt: "Ride lift to Skyroom · 42 m",
      message: "Civic Tower · Skyroom · 42 m above the living surface",
    },
    {
      id: "main-lift-down",
      name: "Civic tower return lift",
      ...MAIN_LIFT,
      height: TOWER.observationHeight,
      destination: Object.freeze({ ...MAIN_LIFT, height: 0, yaw: Math.PI }),
      prompt: "Ride lift to ground lobby",
      message: "Civic Tower · Ground lobby",
    },
    {
      id: "skywalk-lift-up",
      name: "Skywalk street lift",
      ...SKYWALK_LIFT,
      height: 0,
      destination: Object.freeze({ ...SKYWALK_LIFT, height: SKYWALK_HEIGHT }),
      prompt: "Ride lift to Skywalk · 9 m",
      message: "Meridian Skywalk · Public viewing terrace",
    },
    {
      id: "skywalk-lift-down",
      name: "Skywalk return lift",
      ...SKYWALK_LIFT,
      height: SKYWALK_HEIGHT,
      destination: Object.freeze({ ...SKYWALK_LIFT, height: 0 }),
      prompt: "Ride lift to street level",
      message: "Meridian · Street level",
    },
    {
      id: "service-lift-down",
      name: "Service pavilion lift",
      ...SERVICE_ACCESS,
      destination: Object.freeze({ ...SERVICE_ACCESS, height: SERVICE_FLOOR }),
      prompt: "Descend to service level · 8 m below",
      message: "Meridian Service Level · Water and power · 8 m below",
    },
    {
      id: "service-lift-up",
      name: "Service level return lift",
      ...SERVICE_ACCESS,
      height: SERVICE_FLOOR,
      destination: Object.freeze({ ...SERVICE_ACCESS, yaw: Math.PI }),
      prompt: "Return lift to Meridian surface",
      message: "Meridian · Service pavilion · Living surface",
    },
  ].map((stop) => Object.freeze(stop)),
);

// Return stable descriptors, not new per-frame prompt/destination objects.
export function getCityLift(state) {
  if (!state?.grounded) return null;
  for (const stop of CITY_LIFT_STOPS) {
    if (Math.abs(state.height - stop.height) > 0.35) continue;
    if (
      horizontalDistance(
        state.theta,
        state.y,
        stop.theta,
        stop.y,
        stop.height,
      ) <= 2.8
    )
      return stop;
  }
  return null;
}
