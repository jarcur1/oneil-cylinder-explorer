import { horizontalDistance } from "./cylinder-math.js";
import { RADIUS } from "./habitat.js";
import {
  AXIAL_TRAM_LINE,
  TRAM_HEIGHT,
  TRAM_SPEED,
  TRAM_END_DWELL,
  TRAM_DWELL,
  TRAM_BOARD_WINDOW,
} from "./tram-layout.js";

const FLOOR_TOLERANCE = 0.35;

const LINE_CACHE = new WeakMap();

function compileLine(line) {
  const stops = line.stops;
  const axial = line.axis === "y";
  const stopPosition = axial ? (stop) => stop.y : (stop) => stop.trackTheta;
  const distanceScale = axial ? 1 : RADIUS - TRAM_HEIGHT;
  const STOP_BY_ID = new Map(stops.map((stop) => [stop.id, stop]));

  const SEGMENTS = (() => {
  const segments = [];
  const count = stops.length;
  let cumDwell = 0;
  let cumDist = 0;

  function pushLeg(fromStop, toStop, isEndpoint, direction) {
    const dwellDuration = isEndpoint ? TRAM_END_DWELL : TRAM_DWELL;
    const legDistance = Math.abs(stopPosition(toStop) - stopPosition(fromStop)) * distanceScale;
    const dwellStart = cumDwell + cumDist / TRAM_SPEED;
    cumDwell += dwellDuration;
    const dwellEnd = cumDwell + cumDist / TRAM_SPEED;
    cumDist += legDistance;
    const travelEnd = cumDwell + cumDist / TRAM_SPEED;
    const from = stopPosition(fromStop);
    const to = stopPosition(toStop);
    const minY = Math.min(from, to);
    const maxY = Math.max(from, to);

    segments.push(
      Object.freeze({
        phase: "dwell",
        start: dwellStart,
        end: dwellEnd,
        nextLegEnd: travelEnd,
        y: from,
        startY: from,
        endY: from,
        minY: from,
        maxY: from,
        stationId: fromStop.id,
        nextStationId: toStop.id,
        direction,
      }),
    );

    segments.push(
      Object.freeze({
        phase: "moving",
        start: dwellEnd,
        end: travelEnd,
        nextLegEnd: travelEnd,
        y: from,
        startY: from,
        endY: to,
        minY,
        maxY,
        stationId: null,
        nextStationId: toStop.id,
        direction,
      }),
    );
  }

  for (let i = 0; i < count - 1; i++) {
    pushLeg(stops[i], stops[i + 1], i === 0, 1);
  }
  for (let i = count - 1; i > 0; i--) {
    pushLeg(stops[i], stops[i - 1], i === count - 1, -1);
  }

  return Object.freeze(segments);
})();

const TOTAL_PERIOD = SEGMENTS[SEGMENTS.length - 1].end;

const BOARD_DESCRIPTORS = new Map(
  stops.map((stop) => [
    stop.id,
    Object.freeze({
      kind: "board",
      stationId: stop.id,
      prompt: `Board tram at ${stop.name}`,
      message: `Boarded civilian tram at ${stop.name} · Look freely · Press E while docked to exit`,
    }),
  ]),
);

const EXIT_DESCRIPTORS = new Map(
  stops.map((stop) => [
    stop.id,
    Object.freeze({
      kind: "exit",
      stationId: stop.id,
      prompt: `Exit tram at ${stop.name}`,
      message: `${stop.name} · Tram platform · Living surface`,
    }),
  ]),
);

const INSPECT_DESCRIPTORS = new Map(
  stops.map((stop) => [
    stop.id,
    Object.freeze({
      kind: "inspect",
      stationId: stop.id,
      prompt: `Inspect tram stop · ${stop.name}`,
      message: axial
        ? `${stop.name} · Elevated civilian shuttle serves Greenway Gateway, Market Square, Glasshouse 01, Meridian Plaza, and Civic Tower.`
        : `${stop.name} · Elevated civilian shuttle serves ${stops.map((entry) => entry.name).join(" and ")}.`,
    }),
  ]),
);

function findSegment(t) {
  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i];
    if (t >= seg.start && t < seg.end) {
      return seg;
    }
  }
  throw new RangeError(`Tram clock is outside its timetable: ${t}`);
}

function sampleSegmentY(seg, t) {
  if (seg.phase === "dwell") return seg.y;
  const rawY = seg.startY + seg.direction * (axial ? TRAM_SPEED : TRAM_SPEED / distanceScale) * (t - seg.start);
  if (rawY < seg.minY) return seg.minY;
  if (rawY > seg.maxY) return seg.maxY;
  return rawY;
}

  return { STOP_BY_ID, SEGMENTS, TOTAL_PERIOD, BOARD_DESCRIPTORS, EXIT_DESCRIPTORS,
    INSPECT_DESCRIPTORS, findSegment, sampleSegmentY };
}

function isAtGroundStop(playerState, stop) {
  if (!playerState?.grounded || playerState.traversalMode !== "walk") {
    return false;
  }
  if (
    !Number.isFinite(playerState.theta) ||
    !Number.isFinite(playerState.y) ||
    !Number.isFinite(playerState.height)
  ) {
    return false;
  }
  if (
    playerState.height < stop.height - FLOOR_TOLERANCE ||
    playerState.height > stop.height + FLOOR_TOLERANCE
  ) {
    return false;
  }
  return (
    horizontalDistance(
      playerState.theta,
      playerState.y,
      stop.theta,
      stop.y,
      stop.height,
    ) <= stop.range
  );
}

function findEligibleGroundStop(playerState, stops) {
  if (!playerState?.grounded || playerState.traversalMode !== "walk") {
    return null;
  }
  if (
    !Number.isFinite(playerState.theta) ||
    !Number.isFinite(playerState.y) ||
    !Number.isFinite(playerState.height)
  ) {
    return null;
  }
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (isAtGroundStop(playerState, stop)) {
      return stop;
    }
  }
  return null;
}

export function createTramState(line = AXIAL_TRAM_LINE) {
  let compiled = LINE_CACHE.get(line);
  if (!compiled) {
    compiled = compileLine(line);
    LINE_CACHE.set(line, compiled);
  }
  const { STOP_BY_ID, SEGMENTS, TOTAL_PERIOD, BOARD_DESCRIPTORS, EXIT_DESCRIPTORS,
    INSPECT_DESCRIPTORS, findSegment, sampleSegmentY } = compiled;
  const stops = line.stops;
  let clock = 0;

  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new RangeError(`Invalid tram update delta: ${dt}`);
    }
    if (dt === 0) return;
    clock = (clock + dt) % TOTAL_PERIOD;
  }

  function getPose(out = {}) {
    const target = out && typeof out === "object" ? out : {};
    const seg = findSegment(clock);
    target.theta = line.axis === "y" ? line.fixed : sampleSegmentY(seg, clock);
    target.y = line.axis === "y" ? sampleSegmentY(seg, clock) : line.fixed;
    target.height = TRAM_HEIGHT;
    target.speed = seg.phase === "dwell" ? 0 : TRAM_SPEED;
    return target;
  }

  function getState(out = {}) {
    const target = out && typeof out === "object" ? out : {};
    const seg = findSegment(clock);
    const isDwell = seg.phase === "dwell";
    target.theta = line.axis === "y" ? line.fixed : sampleSegmentY(seg, clock);
    target.y = line.axis === "y" ? sampleSegmentY(seg, clock) : line.fixed;
    target.height = TRAM_HEIGHT;
    target.speed = isDwell ? 0 : TRAM_SPEED;
    target.phase = seg.phase;
    target.stationId = seg.stationId;
    target.nextStationId = seg.nextStationId;
    target.direction = seg.direction;
    target.destinationStationId = stops[seg.direction > 0 ? stops.length - 1 : 0].id;
    target.departureIn = isDwell ? seg.end - clock : 0;
    target.arrivalIn = isDwell ? seg.nextLegEnd - clock : seg.end - clock;
    return target;
  }

  function getStopStatus(stopId, out = {}) {
    if (!STOP_BY_ID.has(stopId)) return null;
    const current = findSegment(clock);
    const docked = current.phase === "dwell" && current.stationId === stopId;
    let visit = docked ? current : null;
    let arrivalIn = docked ? 0 : Infinity;
    if (!docked) {
      for (const segment of SEGMENTS) {
        if (segment.phase !== "dwell" || segment.stationId !== stopId) continue;
        let wait = segment.start - clock;
        if (wait < 0) wait += TOTAL_PERIOD;
        if (wait < arrivalIn) {
          arrivalIn = wait;
          visit = segment;
        }
      }
    }
    if (!visit) throw new Error(`Tram station has no scheduled visit: ${stopId}`);
    const target = out && typeof out === "object" ? out : {};
    target.stationId = stopId;
    target.docked = docked;
    target.arrivalIn = arrivalIn;
    target.departureIn = docked ? current.end - clock : 0;
    target.boardingOpen = docked && target.departureIn >= TRAM_BOARD_WINDOW;
    target.direction = visit.direction;
    target.destinationStationId =
      stops[visit.direction > 0 ? stops.length - 1 : 0].id;
    return target;
  }

  function getInteraction(playerState) {
    if (!playerState?.grounded) return null;
    const seg = findSegment(clock);
    const departureIn = seg.phase === "dwell" ? seg.end - clock : 0;

    if (playerState.traversalMode === "tram") {
      if (playerState.rideLineId != null && playerState.rideLineId !== line.id) return null;
      if (
        seg.phase === "dwell" &&
        seg.stationId !== null &&
        departureIn >= TRAM_BOARD_WINDOW
      ) {
        return EXIT_DESCRIPTORS.get(seg.stationId) ?? null;
      }
      return null;
    }

    const stop = findEligibleGroundStop(playerState, stops);
    if (!stop) return null;

    if (
      seg.phase === "dwell" &&
      seg.stationId === stop.id &&
      departureIn >= TRAM_BOARD_WINDOW
    ) {
      return BOARD_DESCRIPTORS.get(stop.id) ?? null;
    }
    return INSPECT_DESCRIPTORS.get(stop.id) ?? null;
  }

  function canCommitTransfer(kind, stationId, playerState) {
    if (typeof stationId !== "string" || !playerState?.grounded) {
      return false;
    }
    const seg = findSegment(clock);
    if (seg.phase !== "dwell" || seg.stationId !== stationId) {
      return false;
    }
    const remainingDwell = seg.end - clock;
    if (!(remainingDwell > 0)) {
      return false;
    }

    if (kind === "board") {
      const stop = STOP_BY_ID.get(stationId);
      if (!stop) return false;
      return isAtGroundStop(playerState, stop);
    }

    if (kind === "exit") {
      return playerState.traversalMode === "tram" &&
        (playerState.rideLineId == null || playerState.rideLineId === line.id);
    }

    return false;
  }

  return {
    update,
    getPose,
    getState,
    getStopStatus,
    getInteraction,
    canCommitTransfer,
  };
}
