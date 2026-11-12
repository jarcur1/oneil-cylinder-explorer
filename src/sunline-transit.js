import { RADIUS } from "./habitat.js";
import { ENDCAP_HUBS } from "./sunline-layout.js";

const TRANSFERS = Object.freeze(ENDCAP_HUBS.flatMap((hub) => [
  {
    ...hub.rim, mode: "walk",
    destination: hub.landing,
    prompt: `Take radial lift to ${hub.label} maintenance hub`,
    message: `${hub.label} · Near-axis service hub · Magnetic boots secured`,
  },
  {
    ...hub.landing, mode: "secured",
    destination: Object.freeze({ ...hub.rim, yaw: hub.side < 0 ? 0 : Math.PI }),
    prompt: `Return radial lift to ${hub.label} rim`,
    message: `${hub.label} · Living-surface rim · 1 g`,
  },
  {
    ...hub.dock, mode: "secured",
    destination: hub.trolley,
    prompt: "Board maintenance trolley · W drive / S reverse",
    message: "Trolley secured to rail · W/S drive/reverse · Look freely · E at docks or SL-02",
  },
  {
    ...hub.trolley, mode: "trolley",
    destination: hub.dock,
    prompt: `Disembark at ${hub.label} hub`,
    message: `${hub.label} · Trolley docked · Magnetic boots secured`,
  },
]).map((stop) => Object.freeze(stop)));

export function getSunlineTransfer(state) {
  if (!state.grounded) return null;
  for (const stop of TRANSFERS) {
    if (state.traversalMode !== stop.mode || Math.abs(state.height - stop.height) > 0.35)
      continue;
    const angle = Math.atan2(
      Math.sin(state.theta - stop.theta),
      Math.cos(state.theta - stop.theta),
    );
    if (Math.hypot(angle * (RADIUS - stop.height), state.y - stop.y) <= 2.8)
      return stop;
  }
  return null;
}
