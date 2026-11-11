import { RADIUS } from "./habitat.js";
import {
  MAIN_LIFT,
  SKYWALK_LIFT,
  SKYWALK_HEIGHT,
  TOWER,
} from "./city-layout.js";
import { SERVICE_ACCESS, SERVICE_FLOOR } from "./service-layout.js";

const LIFT_STOPS = [
  {
    ...MAIN_LIFT,
    height: 0,
    destination: {
      ...MAIN_LIFT,
      height: TOWER.observationHeight,
      yaw: Math.PI,
    },
    prompt: "Ride lift to Skyroom · 42 m",
    message: "Civic Tower · Skyroom · 42 m above the living surface",
  },
  {
    ...MAIN_LIFT,
    height: TOWER.observationHeight,
    destination: { ...MAIN_LIFT, height: 0, yaw: Math.PI },
    prompt: "Ride lift to ground lobby",
    message: "Civic Tower · Ground lobby",
  },
  {
    ...SKYWALK_LIFT,
    height: 0,
    destination: { ...SKYWALK_LIFT, height: SKYWALK_HEIGHT },
    prompt: "Ride lift to Skywalk · 9 m",
    message: "Meridian Skywalk · Public viewing terrace",
  },
  {
    ...SKYWALK_LIFT,
    height: SKYWALK_HEIGHT,
    destination: { ...SKYWALK_LIFT, height: 0 },
    prompt: "Ride lift to street level",
    message: "Meridian · Street level",
  },
  {
    ...SERVICE_ACCESS,
    destination: { ...SERVICE_ACCESS, height: SERVICE_FLOOR },
    prompt: "Descend to service level · 8 m below",
    message: "Meridian Service Level · Water and power · 8 m below",
  },
  {
    ...SERVICE_ACCESS,
    height: SERVICE_FLOOR,
    destination: { ...SERVICE_ACCESS, yaw: Math.PI },
    prompt: "Return lift to Meridian surface",
    message: "Meridian · Service pavilion · Living surface",
  },
];

// Return stable descriptors, not new per-frame prompt/destination objects.
export function getCityLift(state) {
  if (!state.grounded) return null;
  for (const stop of LIFT_STOPS) {
    if (Math.abs(state.height - stop.height) > 0.35) continue;
    const angle = Math.atan2(
      Math.sin(state.theta - stop.theta),
      Math.cos(state.theta - stop.theta),
    );
    if (Math.hypot(angle * (RADIUS - stop.height), state.y - stop.y) <= 2.8)
      return stop;
  }
  return null;
}
