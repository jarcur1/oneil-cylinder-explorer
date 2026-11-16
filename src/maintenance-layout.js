import { SKYWALK_HEIGHT } from "./city-layout.js";
import { MERIDIAN_PLACEMENT } from "./habitat.js";

export const CARETAKER = Object.freeze({
  name: "Mara Voss",
  role: "Civic caretaker",
  s: -8,
  y: MERIDIAN_PLACEMENT.toWorldY(-5),
  height: 0,
  range: 2.8,
  heading: Math.PI,
});

// North skywalk branch: leave the west side clear for pedestrians and players.
export const VENTILATION_UNIT = Object.freeze({
  s: 49,
  y: MERIDIAN_PLACEMENT.toWorldY(77.5),
  height: SKYWALK_HEIGHT,
  range: 2.8,
  width: 1.3,
  depth: 2.2,
  casingHeight: 1.6,
});
