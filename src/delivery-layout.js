import { GREENWAY_PLACEMENT, MERIDIAN_PLACEMENT } from "./habitat.js";
import { reservoirS, reservoirY } from "./reservoir-layout.js";

export const DELIVERY_STATIONS = Object.freeze({
  pickup: Object.freeze({
    s: 7.2,
    y: GREENWAY_PLACEMENT.toWorldY(-240),
    range: 3.2,
  }),
  dropoff: Object.freeze({
    s: 67,
    y: GREENWAY_PLACEMENT.toWorldY(-214),
    range: 3.2,
  }),
});

export const SUPPLY_STATIONS = Object.freeze({
  pickup: DELIVERY_STATIONS.dropoff,
  dropoff: Object.freeze({
    s: 18,
    y: MERIDIAN_PLACEMENT.toWorldY(-11),
    range: 3.2,
  }),
});

// Leave the raised bed beside, not across, the northbound entrance path.
export const PLANTING_BED = Object.freeze({ s: 7, y: -90, width: 4, depth: 5 });

export const PLANTING_STATIONS = Object.freeze({
  pickup: DELIVERY_STATIONS.dropoff,
  dropoff: Object.freeze({
    s: reservoirS(PLANTING_BED.s - PLANTING_BED.width / 2),
    y: reservoirY(PLANTING_BED.y),
    range: 3.2,
  }),
});
