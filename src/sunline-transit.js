import { horizontalDistance } from "./cylinder-math.js";
import { ENDCAP_HUBS } from "./sunline-layout.js";

export const SUNLINE_TRANSFERS = Object.freeze(
  ENDCAP_HUBS.flatMap((hub) => [
    {
      id: `${hub.id}-rim-lift`,
      name: `${hub.label} radial lift`,
      ...hub.rim,
      mode: "walk",
      destination: hub.landing,
      prompt: `Take radial lift to ${hub.label} maintenance hub`,
      message: `${hub.label} · Near-axis service hub · Magnetic boots secured`,
    },
    {
      id: `${hub.id}-return-lift`,
      name: `${hub.label} return lift`,
      ...hub.landing,
      mode: "secured",
      destination: Object.freeze({ ...hub.rim, yaw: hub.side < 0 ? 0 : Math.PI }),
      prompt: `Return radial lift to ${hub.label} rim`,
      message: `${hub.label} · Living-surface rim · 1 g`,
    },
    {
      id: `${hub.id}-board-trolley`,
      name: `${hub.label} trolley dock`,
      ...hub.dock,
      mode: "secured",
      destination: hub.trolley,
      prompt: "Board maintenance trolley · W drive / S reverse",
      message: "Trolley secured to rail · W/S drive/reverse · Look freely · E at docks or SL-02",
    },
    {
      id: `${hub.id}-disembark-trolley`,
      name: `${hub.label} trolley disembark`,
      ...hub.trolley,
      mode: "trolley",
      destination: hub.dock,
      prompt: `Disembark at ${hub.label} hub`,
      message: `${hub.label} · Trolley docked · Magnetic boots secured`,
    },
  ]).map((stop) => Object.freeze(stop)),
);

export function getSunlineTransfer(state) {
  if (!state?.grounded) return null;
  for (const stop of SUNLINE_TRANSFERS) {
    if (
      state.traversalMode !== stop.mode ||
      !(state.height >= stop.height - 0.35 && state.height <= stop.height + 0.35)
    )
      continue;
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
