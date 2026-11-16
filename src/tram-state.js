import { horizontalDistance } from "./cylinder-math.js";
import {
  TRAM_THETA,
  TRAM_HEIGHT,
  TRAM_SPEED,
  TRAM_END_DWELL,
  TRAM_DWELL,
  TRAM_BOARD_WINDOW,
  TRAM_STOPS,
} from "./tram-layout.js";

const FLOOR_TOLERANCE = 0.35;

const STOP_BY_ID = new Map(TRAM_STOPS.map((stop) => [stop.id, stop]));

const SEGMENTS = (() => {
  const segments = [];
  const count = TRAM_STOPS.length;
  let cumDwell = 0;
  let cumDist = 0;

  function pushLeg(fromStop, toStop, isEndpoint, direction) {
    const dwellDuration = isEndpoint ? TRAM_END_DWELL : TRAM_DWELL;
    const legDistance = Math.abs(toStop.y - fromStop.y);
    const dwellStart = cumDwell + cumDist / TRAM_SPEED;
    cumDwell += dwellDuration;
    const dwellEnd = cumDwell + cumDist / TRAM_SPEED;
    cumDist += legDistance;
    const travelEnd = cumDwell + cumDist / TRAM_SPEED;
    const minY = Math.min(fromStop.y, toStop.y);
    const maxY = Math.max(fromStop.y, toStop.y);

    segments.push(
      Object.freeze({
        phase: "dwell",
        start: dwellStart,
        end: dwellEnd,
        nextLegEnd: travelEnd,
        y: fromStop.y,
        startY: fromStop.y,
        endY: fromStop.y,
        minY: fromStop.y,
        maxY: fromStop.y,
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
        y: fromStop.y,
        startY: fromStop.y,
        endY: toStop.y,
        minY,
        maxY,
        stationId: null,
        nextStationId: toStop.id,
        direction,
      }),
    );
  }

  for (let i = 0; i < count - 1; i++) {
    pushLeg(TRAM_STOPS[i], TRAM_STOPS[i + 1], i === 0, 1);
  }
  for (let i = count - 1; i > 0; i--) {
    pushLeg(TRAM_STOPS[i], TRAM_STOPS[i - 1], i === count - 1, -1);
  }

  return Object.freeze(segments);
})();

const TOTAL_PERIOD = SEGMENTS[SEGMENTS.length - 1].end;

const BOARD_DESCRIPTORS = new Map(
  TRAM_STOPS.map((stop) => [
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
  TRAM_STOPS.map((stop) => [
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
  TRAM_STOPS.map((stop) => [
    stop.id,
    Object.freeze({
      kind: "inspect",
      stationId: stop.id,
      prompt: `Inspect tram stop · ${stop.name}`,
      message: `${stop.name} · Elevated civilian shuttle serves Greenway Gateway, Market Square, Glasshouse 01, Meridian Plaza, and Civic Tower.`,
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
  const rawY = seg.startY + seg.direction * TRAM_SPEED * (t - seg.start);
  if (rawY < seg.minY) return seg.minY;
  if (rawY > seg.maxY) return seg.maxY;
  return rawY;
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

function findEligibleGroundStop(playerState) {
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
  for (let i = 0; i < TRAM_STOPS.length; i++) {
    const stop = TRAM_STOPS[i];
    if (isAtGroundStop(playerState, stop)) {
      return stop;
    }
  }
  return null;
}

export function createTramState() {
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
    target.theta = TRAM_THETA;
    target.y = sampleSegmentY(seg, clock);
    target.height = TRAM_HEIGHT;
    target.speed = seg.phase === "dwell" ? 0 : TRAM_SPEED;
    return target;
  }

  function getState(out = {}) {
    const target = out && typeof out === "object" ? out : {};
    const seg = findSegment(clock);
    const isDwell = seg.phase === "dwell";
    target.theta = TRAM_THETA;
    target.y = sampleSegmentY(seg, clock);
    target.height = TRAM_HEIGHT;
    target.speed = isDwell ? 0 : TRAM_SPEED;
    target.phase = seg.phase;
    target.stationId = seg.stationId;
    target.nextStationId = seg.nextStationId;
    target.direction = seg.direction;
    target.departureIn = isDwell ? seg.end - clock : 0;
    target.arrivalIn = isDwell ? seg.nextLegEnd - clock : seg.end - clock;
    return target;
  }

  function getInteraction(playerState) {
    if (!playerState?.grounded) return null;
    const seg = findSegment(clock);
    const departureIn = seg.phase === "dwell" ? seg.end - clock : 0;

    if (playerState.traversalMode === "tram") {
      if (
        seg.phase === "dwell" &&
        seg.stationId !== null &&
        departureIn >= TRAM_BOARD_WINDOW
      ) {
        return EXIT_DESCRIPTORS.get(seg.stationId) ?? null;
      }
      return null;
    }

    const stop = findEligibleGroundStop(playerState);
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
      return playerState.traversalMode === "tram";
    }

    return false;
  }

  return {
    update,
    getPose,
    getState,
    getInteraction,
    canCommitTransfer,
  };
}
