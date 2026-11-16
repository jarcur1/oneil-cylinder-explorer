import { RADIUS, LENGTH } from "./habitat.js";
import {
  horizontalDistance,
  spatialDistance,
} from "./cylinder-math.js";
import { LANDMARKS } from "./landmarks.js";
import { TOWER, SKYWALK_HEIGHT } from "./city-layout.js";
import { CITY_LIFT_STOPS } from "./city-transit.js";
import { AXIAL_HEIGHT, ENDCAP_HUBS, getAxialHub } from "./sunline-layout.js";
import { SUNLINE_TRANSFERS } from "./sunline-transit.js";
import { TRAM_THETA, TRAM_HEIGHT, TRAM_STOPS } from "./tram-layout.js";

const TWO_PI = Math.PI * 2;
const SEAM_MIN = -Math.PI / 2;
const FLOOR_TOLERANCE = 0.5;
const ELEVATED_FLOOR_BAND = 1.5;
const DEFAULT_ACCESS_RANGE = 2.8;
const VALID_JOB_IDS = new Set(["delivery", "maintenance", "sunline"]);

export const MAP_LAYERS = Object.freeze([
  Object.freeze({ id: "surface", label: "Surface & elevated" }),
  Object.freeze({ id: "service", label: "Underground service" }),
  Object.freeze({ id: "axial", label: "Axial maintenance" }),
]);

export function getNavigationLayer(height) {
  if (!Number.isFinite(height)) {
    throw new RangeError(`Invalid navigation height: ${height}`);
  }
  if (height < -1) return "service";
  if (height >= AXIAL_HEIGHT - 1) return "axial";
  return "surface";
}

export function projectMapPoint(theta, y, out = {}) {
  if (!Number.isFinite(theta) || !Number.isFinite(y)) {
    throw new RangeError(`Invalid map coordinates: theta=${theta}, y=${y}`);
  }
  const target = out && typeof out === "object" ? out : {};
  let wrapped = ((((theta - SEAM_MIN) % TWO_PI) + TWO_PI) % TWO_PI) + SEAM_MIN;
  if (wrapped >= SEAM_MIN + TWO_PI) wrapped -= TWO_PI;
  target.x = (wrapped - SEAM_MIN) / TWO_PI;
  target.y = (LENGTH / 2 - y) / LENGTH;
  return target;
}

function makeConnectionPose(pose) {
  return Object.freeze({
    theta: pose.theta,
    y: pose.y,
    height: pose.height,
    layer: getNavigationLayer(pose.height),
  });
}

function sunlineStopKind(stop) {
  if (stop.mode === "walk") return "rim";
  if (stop.destination?.constraint?.mode === "trolley") return "dock";
  return "lift";
}

const TARGET_RANGE_BY_ID = new Map();

const landmarkTargets = LANDMARKS.map((stop) => {
  if (!Number.isFinite(stop.height)) {
    throw new Error(`Landmark "${stop.id}" is missing explicit finite height`);
  }
  TARGET_RANGE_BY_ID.set(stop.id, stop.radius);
  return Object.freeze({
    id: stop.id,
    name: stop.name,
    theta: stop.theta,
    y: stop.y,
    height: stop.height,
    kind: "landmark",
    layer: getNavigationLayer(stop.height),
    landmarkId: stop.id,
    hint: stop.hint,
  });
});

const cityAccessTargets = CITY_LIFT_STOPS.map((stop) => {
  TARGET_RANGE_BY_ID.set(stop.id, DEFAULT_ACCESS_RANGE);
  return Object.freeze({
    id: stop.id,
    name: stop.name,
    theta: stop.theta,
    y: stop.y,
    height: stop.height,
    kind: "lift",
    layer: getNavigationLayer(stop.height),
    hint: stop.prompt,
  });
});

const sunlineAccessTargets = SUNLINE_TRANSFERS.filter(
  (stop) => stop.mode !== "trolley",
).map((stop) => {
  TARGET_RANGE_BY_ID.set(stop.id, DEFAULT_ACCESS_RANGE);
  return Object.freeze({
    id: stop.id,
    name: stop.name,
    theta: stop.theta,
    y: stop.y,
    height: stop.height,
    kind: sunlineStopKind(stop),
    layer: getNavigationLayer(stop.height),
    hint: stop.prompt,
  });
});

const tramAccessTargets = TRAM_STOPS.map((stop) => {
  TARGET_RANGE_BY_ID.set(stop.id, stop.range ?? 3.2);
  return Object.freeze({
    id: stop.id,
    name: stop.name,
    theta: stop.theta,
    y: stop.y,
    height: stop.height,
    kind: "tram",
    layer: getNavigationLayer(stop.height),
    hint: stop.hint,
  });
});

export const NAV_TARGETS = Object.freeze([
  ...landmarkTargets,
  ...cityAccessTargets,
  ...sunlineAccessTargets,
  ...tramAccessTargets,
]);

const TARGET_BY_ID = new Map(NAV_TARGETS.map((target) => [target.id, target]));
function toGuidanceDescriptor(stop, kind) {
  return Object.freeze({
    theta: stop.theta,
    y: stop.y,
    height: stop.height,
    layer: getNavigationLayer(stop.height),
    name: stop.name,
    kind,
  });
}

const CITY_LIFT_BY_ID = new Map(CITY_LIFT_STOPS.map((stop) => [stop.id, stop]));
const MAIN_LIFT_UP = toGuidanceDescriptor(CITY_LIFT_BY_ID.get("main-lift-up"), "lift");
const MAIN_LIFT_DOWN = toGuidanceDescriptor(CITY_LIFT_BY_ID.get("main-lift-down"), "lift");
const SKYWALK_LIFT_UP = toGuidanceDescriptor(CITY_LIFT_BY_ID.get("skywalk-lift-up"), "lift");
const SKYWALK_LIFT_DOWN = toGuidanceDescriptor(CITY_LIFT_BY_ID.get("skywalk-lift-down"), "lift");
const SERVICE_LIFT_DOWN = toGuidanceDescriptor(CITY_LIFT_BY_ID.get("service-lift-down"), "lift");
const SERVICE_LIFT_UP = toGuidanceDescriptor(CITY_LIFT_BY_ID.get("service-lift-up"), "lift");

const RIM_LIFT_STOPS = SUNLINE_TRANSFERS.filter((stop) => stop.mode === "walk");
const RIM_LIFT_GUIDANCE = RIM_LIFT_STOPS.map((stop) =>
  toGuidanceDescriptor(stop, "rim"),
);
const RETURN_LIFT_BY_HUB = new Map();
const TROLLEY_DOCK_BY_HUB = new Map();
const TROLLEY_DISEMBARK_BY_HUB = new Map();

for (const stop of SUNLINE_TRANSFERS) {
  if (stop.mode === "secured" && stop.destination.height === 0) {
    const hub = getAxialHub(stop);
    if (hub) RETURN_LIFT_BY_HUB.set(hub.id, toGuidanceDescriptor(stop, "lift"));
  } else if (
    stop.mode === "secured" &&
    stop.destination?.constraint?.mode === "trolley"
  ) {
    const hub = getAxialHub(stop);
    if (hub) TROLLEY_DOCK_BY_HUB.set(hub.id, toGuidanceDescriptor(stop, "dock"));
  } else if (stop.mode === "trolley") {
    const hub = getAxialHub(stop.destination);
    if (hub) TROLLEY_DISEMBARK_BY_HUB.set(hub.id, toGuidanceDescriptor(stop, "dock"));
  }
}

const TROLLEY_DISEMBARK_GUIDANCE = [...TROLLEY_DISEMBARK_BY_HUB.values()];

const trolleyEndpoints = SUNLINE_TRANSFERS.filter(
  (stop) => stop.mode === "trolley",
).sort((a, b) => a.y - b.y);

const TRAM_DISEMBARK_GUIDANCE = Object.freeze(
  TRAM_STOPS.map((stop) =>
    Object.freeze({
      theta: TRAM_THETA,
      y: stop.y,
      height: TRAM_HEIGHT,
      layer: getNavigationLayer(TRAM_HEIGHT),
      name: `Disembark at ${stop.name}`,
      kind: "tram",
    }),
  ),
);

const TRAM_DISEMBARK_BY_TARGET_ID = new Map();
TRAM_STOPS.forEach((stop, index) => {
  const guidance = TRAM_DISEMBARK_GUIDANCE[index];
  TRAM_DISEMBARK_BY_TARGET_ID.set(stop.id, guidance);
  if (Array.isArray(stop.landmarkIds)) {
    for (const landmarkId of stop.landmarkIds) {
      TRAM_DISEMBARK_BY_TARGET_ID.set(landmarkId, guidance);
    }
  }
});

const sortedTramStops = [...TRAM_STOPS].sort((a, b) => a.y - b.y);

export const NAV_CONNECTIONS = Object.freeze([
  ...CITY_LIFT_STOPS.filter((stop) => stop.height === 0).map((stop) =>
    Object.freeze({
      id: `link-${stop.id}`,
      type: "lift",
      label: stop.name,
      from: makeConnectionPose(stop),
      to: makeConnectionPose(stop.destination),
    }),
  ),
  ...RIM_LIFT_STOPS.map((sourceStop) =>
    Object.freeze({
      id: `link-${sourceStop.id}`,
      type: "lift",
      label: sourceStop.name,
      from: makeConnectionPose(sourceStop),
      to: makeConnectionPose(sourceStop.destination),
    }),
  ),
  ...(trolleyEndpoints.length >= 2
    ? [
        Object.freeze({
          id: "link-sunline-trolley",
          type: "trolley",
          label: "Sunline maintenance trolley (Endcap A ↔ Endcap B)",
          from: makeConnectionPose(trolleyEndpoints[0]),
          to: makeConnectionPose(trolleyEndpoints[trolleyEndpoints.length - 1]),
        }),
      ]
    : []),
  ...(sortedTramStops.length >= 2
    ? [
        Object.freeze({
          id: "link-civilian-tram",
          type: "tram",
          label: `Civilian tramway (${sortedTramStops[0].name} ↔ ${sortedTramStops[sortedTramStops.length - 1].name})`,
          from: makeConnectionPose({
            theta: TRAM_THETA,
            y: sortedTramStops[0].y,
            height: TRAM_HEIGHT,
          }),
          to: makeConnectionPose({
            theta: TRAM_THETA,
            y: sortedTramStops[sortedTramStops.length - 1].y,
            height: TRAM_HEIGHT,
          }),
        }),
      ]
    : []),
]);

function pickNearestStop(playerState, target, stops) {
  let best = stops[0];
  let bestDist = Infinity;
  let bestTargetDist = Infinity;
  for (const stop of stops) {
    const d = spatialDistance(
      playerState.theta,
      playerState.y,
      playerState.height,
      stop.theta,
      stop.y,
      stop.height,
    );
    const td = spatialDistance(
      target.theta,
      target.y,
      target.height,
      stop.theta,
      stop.y,
      stop.height,
    );
    if (d < bestDist - 1e-6 || (Math.abs(d - bestDist) <= 1e-6 && td < bestTargetDist)) {
      best = stop;
      bestDist = d;
      bestTargetDist = td;
    }
  }
  return best;
}

function nearestHub(playerState) {
  let best = ENDCAP_HUBS[0];
  let bestDist = Infinity;
  for (const hub of ENDCAP_HUBS) {
    const d = spatialDistance(
      playerState.theta,
      playerState.y,
      playerState.height,
      hub.landing.theta,
      hub.landing.y,
      hub.landing.height,
    );
    if (d < bestDist) {
      best = hub;
      bestDist = d;
    }
  }
  return best;
}

function getSurfaceApproachTarget(target) {
  if (target.layer === "service") return SERVICE_LIFT_DOWN;
  if (target.layer === "axial") {
    return pickNearestStop(target, target, RIM_LIFT_GUIDANCE);
  }
  if (Math.abs(target.height - TOWER.observationHeight) <= ELEVATED_FLOOR_BAND) {
    return MAIN_LIFT_UP;
  }
  if (Math.abs(target.height - SKYWALK_HEIGHT) <= ELEVATED_FLOOR_BAND) {
    return SKYWALK_LIFT_UP;
  }
  return target;
}

function pickTramDisembark(playerState, target) {
  const accessTarget = getSurfaceApproachTarget(target);
  const associated =
    (target.id && TRAM_DISEMBARK_BY_TARGET_ID.get(target.id)) ||
    (accessTarget.id && TRAM_DISEMBARK_BY_TARGET_ID.get(accessTarget.id));
  if (associated) return associated;

  let best = TRAM_DISEMBARK_GUIDANCE[0];
  let bestTargetDist = Infinity;
  let bestPlayerDist = Infinity;
  for (const stop of TRAM_DISEMBARK_GUIDANCE) {
    const td = spatialDistance(
      accessTarget.theta,
      accessTarget.y,
      accessTarget.height,
      stop.theta,
      stop.y,
      stop.height,
    );
    const pd = spatialDistance(
      playerState.theta,
      playerState.y,
      playerState.height,
      stop.theta,
      stop.y,
      stop.height,
    );
    if (
      td < bestTargetDist - 1e-6 ||
      (Math.abs(td - bestTargetDist) <= 1e-6 && pd < bestPlayerDist)
    ) {
      best = stop;
      bestTargetDist = td;
      bestPlayerDist = pd;
    }
  }
  return best;
}

function resolveGuidance(playerState, target) {
  if (playerState.traversalMode === "tram") {
    return pickTramDisembark(playerState, target);
  }
  const playerLayer = getNavigationLayer(playerState.height);
  const targetLayer = target.layer;
  if (playerLayer === "service") {
    if (targetLayer === "service") return target;
    return SERVICE_LIFT_UP;
  }

  if (playerLayer === "axial") {
    if (playerState.traversalMode === "trolley") {
      if (targetLayer === "axial") {
        const targetHub = getAxialHub(target);
        if (!targetHub) return target;
        return TROLLEY_DISEMBARK_BY_HUB.get(targetHub.id);
      }
      return pickNearestStop(playerState, target, TROLLEY_DISEMBARK_GUIDANCE);
    }

    const playerHub = getAxialHub(playerState) ?? nearestHub(playerState);
    if (targetLayer === "axial") {
      const targetHub = getAxialHub(target);
      if (targetHub && targetHub.id === playerHub.id) return target;
      if (playerState.traversalMode === "secured" || getAxialHub(playerState)) {
        return TROLLEY_DOCK_BY_HUB.get(playerHub.id);
      }
      return target;
    }
    return RETURN_LIFT_BY_HUB.get(playerHub.id);
  }

  const onSkyroom =
    Math.abs(playerState.height - TOWER.observationHeight) <= ELEVATED_FLOOR_BAND;
  const targetOnSkyroom =
    Math.abs(target.height - TOWER.observationHeight) <= ELEVATED_FLOOR_BAND;
  if (onSkyroom) {
    if (targetOnSkyroom) return target;
    return MAIN_LIFT_DOWN;
  }

  const onSkywalk =
    Math.abs(playerState.height - SKYWALK_HEIGHT) <= ELEVATED_FLOOR_BAND;
  const targetOnSkywalk =
    Math.abs(target.height - SKYWALK_HEIGHT) <= ELEVATED_FLOOR_BAND;
  if (onSkywalk) {
    if (targetOnSkywalk) return target;
    return SKYWALK_LIFT_DOWN;
  }

  if (targetLayer === "service") {
    return SERVICE_LIFT_DOWN;
  }
  if (targetLayer === "axial") {
    return pickNearestStop(playerState, target, RIM_LIFT_GUIDANCE);
  }
  if (targetOnSkyroom) {
    return MAIN_LIFT_UP;
  }
  if (targetOnSkywalk) {
    return SKYWALK_LIFT_UP;
  }
  return target;
}

function resolveJobTarget(jobId, jobViews, scratch) {
  const view = jobViews?.[jobId];
  const raw = view?.target;
  if (!raw || typeof raw !== "object") return null;

  const theta = Number.isFinite(raw.theta)
    ? raw.theta
    : Number.isFinite(raw.s)
      ? raw.s / RADIUS
      : NaN;
  const y = raw.y;
  const height = raw.height === undefined ? 0 : raw.height;
  if (!Number.isFinite(theta) || !Number.isFinite(y) || !Number.isFinite(height)) {
    return null;
  }

  let name;
  if (typeof raw.name === "string" && raw.name) {
    name = raw.name;
  } else if (jobId === "delivery") {
    name =
      view.phase === "carrying"
        ? "Glasshouse 01 dropoff"
        : "Heritage seed crate";
  } else if (jobId === "maintenance") {
    name =
      view.phase === "assigned" ? "Skywalk ventilation unit" : "Mara Voss";
  } else {
    name = view.title || jobId;
  }

  scratch.id = jobId;
  scratch.name = name;
  scratch.theta = theta;
  scratch.y = y;
  scratch.height = height;
  scratch.layer = getNavigationLayer(height);
  scratch.kind = "job";
  scratch.range = Number.isFinite(raw.range)
    ? raw.range
    : jobId === "delivery"
      ? 3.2
      : 2.8;
  return scratch;
}

export function createNavigation() {
  let selection = null;
  const jobTargetScratch = {
    id: "",
    name: "",
    theta: 0,
    y: 0,
    height: 0,
    layer: "surface",
    kind: "job",
    range: 2.8,
  };
  const destTargetScratch = {
    id: "",
    name: "",
    theta: 0,
    y: 0,
    height: 0,
    layer: "surface",
    kind: "landmark",
    range: 2.8,
  };

  function select(nextSelection) {
    if (nextSelection === null || nextSelection === undefined) {
      selection = null;
      return null;
    }
    if (typeof nextSelection !== "object") return null;
    if (
      nextSelection.kind === "destination" &&
      typeof nextSelection.id === "string" &&
      TARGET_BY_ID.has(nextSelection.id)
    ) {
      selection = Object.freeze({ kind: "destination", id: nextSelection.id });
      return selection;
    }
    if (
      nextSelection.kind === "job" &&
      typeof nextSelection.id === "string" &&
      VALID_JOB_IDS.has(nextSelection.id)
    ) {
      selection = Object.freeze({ kind: "job", id: nextSelection.id });
      return selection;
    }
    return null;
  }

  function getSelection() {
    return selection;
  }

  function getWaypoint(playerState, jobViews, out = {}) {
    if (!selection) return null;
    if (
      !playerState ||
      !Number.isFinite(playerState.theta) ||
      !Number.isFinite(playerState.y) ||
      !Number.isFinite(playerState.height)
    ) {
      return null;
    }

    let target;
    if (selection.kind === "destination") {
      const dest = TARGET_BY_ID.get(selection.id);
      if (!dest) return null;
      destTargetScratch.id = dest.id;
      destTargetScratch.name = dest.name;
      destTargetScratch.theta = dest.theta;
      destTargetScratch.y = dest.y;
      destTargetScratch.height = dest.height;
      destTargetScratch.layer = dest.layer;
      destTargetScratch.kind = dest.kind;
      destTargetScratch.range = TARGET_RANGE_BY_ID.get(dest.id) ?? DEFAULT_ACCESS_RANGE;
      target = destTargetScratch;
    } else {
      target = resolveJobTarget(selection.id, jobViews, jobTargetScratch);
      if (!target) return null;
    }

    const guidance = resolveGuidance(playerState, target);
    const finalDistance = spatialDistance(
      playerState.theta,
      playerState.y,
      playerState.height,
      target.theta,
      target.y,
      target.height,
    );
    const distance = spatialDistance(
      playerState.theta,
      playerState.y,
      playerState.height,
      guidance.theta,
      guidance.y,
      guidance.height,
    );
    const arrived =
      Math.abs(playerState.height - target.height) <= FLOOR_TOLERANCE &&
      horizontalDistance(
        playerState.theta,
        playerState.y,
        target.theta,
        target.y,
        target.height,
      ) <= target.range;

    const result = out && typeof out === "object" ? out : {};
    const targetOut =
      result.target && typeof result.target === "object"
        ? result.target
        : (result.target = {});
    targetOut.theta = target.theta;
    targetOut.y = target.y;
    targetOut.height = target.height;
    targetOut.layer = target.layer;
    targetOut.name = target.name;

    const guidanceOut =
      result.guidance && typeof result.guidance === "object"
        ? result.guidance
        : (result.guidance = {});
    guidanceOut.theta = guidance.theta;
    guidanceOut.y = guidance.y;
    guidanceOut.height = guidance.height;
    guidanceOut.layer = guidance.layer;
    guidanceOut.name = guidance.name;
    guidanceOut.kind = guidance.kind;

    result.id = target.id;
    result.name = target.name;
    result.distance = distance;
    result.finalDistance = finalDistance;
    result.layer = target.layer;
    result.arrived = arrived;
    return result;
  }

  return {
    select,
    getSelection,
    getWaypoint,
  };
}
