import { DISTRICT_STOPS } from "./district-layout.js";
import { CITY_STOPS } from "./city-layout.js";
import { SERVICE_STOPS } from "./service-layout.js";
import { SUNLINE_STOPS } from "./sunline-layout.js";

export const LANDMARKS = Object.freeze([
  ...DISTRICT_STOPS,
  ...CITY_STOPS,
  ...SERVICE_STOPS,
  ...SUNLINE_STOPS,
]);
