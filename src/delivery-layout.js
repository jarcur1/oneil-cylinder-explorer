import { GREENWAY_PLACEMENT } from "./habitat.js";

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
