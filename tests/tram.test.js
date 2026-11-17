import test from "node:test";
import assert from "node:assert/strict";
import { RADIUS } from "../src/habitat.js";
import { TRAM_STOPS } from "../src/tram-layout.js";
import { createTramState } from "../src/tram-state.js";

function atStop(stop, overrides = {}) {
  return {
    theta: stop.theta,
    y: stop.y,
    height: stop.height,
    grounded: true,
    traversalMode: "walk",
    ...overrides,
  };
}

function aboard(overrides = {}) {
  return {
    theta: 0,
    y: 0,
    height: 13,
    grounded: true,
    traversalMode: "tram",
    ...overrides,
  };
}

test("initial state, read-API non-advancement, update(0)/pause invariance, and reusable scratch output", () => {
  const tram = createTramState();
  const poseScratch = { theta: NaN, y: NaN, height: NaN, speed: NaN };
  const stateScratch = {};

  const p0 = tram.getPose(poseScratch);
  assert.equal(p0, poseScratch);
  assert.deepEqual(p0, { theta: 0, y: -520, height: 13, speed: 0 });
  assert.equal("yaw" in p0, false);
  assert.equal("pitch" in p0, false);

  const s0 = tram.getState(stateScratch);
  assert.equal(s0, stateScratch);
  assert.equal(s0.theta, 0);
  assert.equal(s0.y, -520);
  assert.equal(s0.height, 13);
  assert.equal(s0.speed, 0);
  assert.equal(s0.phase, "dwell");
  assert.equal(s0.stationId, "tram-gateway");
  assert.equal(s0.nextStationId, "tram-market");
  assert.equal(s0.direction, 1);
  assert.equal(s0.departureIn, 20);
  assert.ok(Math.abs(s0.arrivalIn - (20 + 50 / 28)) < 1e-12);

  // Repeated reads and update(0) must never advance clock or pose
  tram.getPose(poseScratch);
  tram.getState(stateScratch);
  tram.getInteraction(atStop(TRAM_STOPS[0]));
  tram.update(0);
  tram.update(0);
  const sAfterZero = tram.getState({});
  assert.deepEqual(sAfterZero, s0);

  // Mid-leg pause / update(0) also leaves pose and timetable frozen
  tram.update(20 + 25 / 28);
  const midBefore = tram.getState({});
  assert.equal(midBefore.y, -495);
  assert.equal(midBefore.speed, 28);
  assert.equal(midBefore.phase, "moving");
  tram.update(0);
  poseScratch.theta = NaN;
  poseScratch.y = NaN;
  poseScratch.height = NaN;
  poseScratch.speed = NaN;
  const poseAfterZero = tram.getPose(poseScratch);
  assert.deepEqual(poseAfterZero, { theta: 0, y: -495, height: 13, speed: 28 });
  assert.deepEqual(tram.getState({}), midBefore);

  assert.throws(() => tram.update(-0.1), RangeError);
  assert.throws(() => tram.update(Number.NaN), RangeError);
  assert.throws(() => tram.update(Number.POSITIVE_INFINITY), RangeError);
});

test("complete roundtrip timetable tracks exact leg arrivals, endpoint reversals, and wraparound", () => {
  const tram = createTramState();
  const state = {};

  // Leg 0->1: dwell 20s at -520, travel 50/28s to -470
  tram.update(20);
  tram.getState(state);
  assert.equal(state.phase, "moving");
  assert.equal(state.stationId, null);
  assert.equal(state.nextStationId, "tram-market");
  assert.equal(state.direction, 1);
  assert.equal(state.y, -520);
  assert.equal(state.speed, 28);
  assert.equal(state.departureIn, 0);
  assert.ok(Math.abs(state.arrivalIn - 50 / 28) < 1e-12);

  // Midpoint between Gateway (-520) and Market (-470)
  tram.update(25 / 28);
  tram.getState(state);
  assert.equal(state.y, -495);
  assert.equal(state.phase, "moving");
  assert.ok(Math.abs(state.arrivalIn - 25 / 28) < 1e-12);

  // Arrive at Market (-470); step 1e-6 past nominal arrival to avoid 1-ULP boundary sensitivity on summed d/28 floats
  tram.update(25 / 28 + 1e-6);
  tram.getState(state);
  assert.equal(state.phase, "dwell");
  assert.equal(state.stationId, "tram-market");
  assert.equal(state.nextStationId, "tram-glasshouse");
  assert.equal(state.direction, 1);
  assert.equal(state.y, -470);
  assert.equal(state.speed, 0);
  assert.ok(Math.abs(state.departureIn - (8 - 1e-6)) < 1e-9);
  assert.ok(Math.abs(state.arrivalIn - (8 - 1e-6 + 36 / 28)) < 1e-9);

  // Advance to Glasshouse arrival: + 8 + 36/28
  tram.update(8 + 36 / 28);
  tram.getState(state);
  assert.equal(state.phase, "dwell");
  assert.equal(state.stationId, "tram-glasshouse");
  assert.equal(state.nextStationId, "tram-plaza");
  assert.equal(state.direction, 1);
  assert.equal(state.y, -434);
  assert.ok(Math.abs(state.departureIn - (8 - 1e-6)) < 1e-9);
  assert.ok(Math.abs(state.arrivalIn - (8 - 1e-6 + 869 / 28)) < 1e-9);

  // Advance to Meridian Plaza arrival: + 8 + 869/28
  tram.update(8 + 869 / 28);
  tram.getState(state);
  assert.equal(state.phase, "dwell");
  assert.equal(state.stationId, "tram-plaza");
  assert.equal(state.nextStationId, "tram-tower");
  assert.equal(state.direction, 1);
  assert.equal(state.y, 435);
  assert.ok(Math.abs(state.departureIn - (8 - 1e-6)) < 1e-9);
  assert.ok(Math.abs(state.arrivalIn - (8 - 1e-6 + 60 / 28)) < 1e-9);

  // Advance to Civic Tower arrival (north endpoint, nominal t = 80.25 + 1e-6)
  tram.update(8 + 60 / 28);
  tram.getState(state);
  assert.equal(state.phase, "dwell");
  assert.equal(state.stationId, "tram-tower");
  assert.equal(state.nextStationId, "tram-plaza");
  assert.equal(state.direction, -1);
  assert.equal(state.y, 495);
  assert.equal(state.speed, 0);
  assert.ok(Math.abs(state.departureIn - (20 - 1e-6)) < 1e-9);
  assert.ok(Math.abs(state.arrivalIn - (20 - 1e-6 + 60 / 28)) < 1e-9);

  // Halfway through endpoint dwell (t = 90.25 + 1e-6)
  tram.update(10);
  tram.getState(state);
  assert.equal(state.phase, "dwell");
  assert.equal(state.stationId, "tram-tower");
  assert.equal(state.direction, -1);
  assert.equal(state.y, 495);
  assert.ok(Math.abs(state.departureIn - (10 - 1e-6)) < 1e-9);
  assert.ok(Math.abs(state.arrivalIn - (10 - 1e-6 + 60 / 28)) < 1e-9);

  // Southbound departure and leg back to Plaza (10 + 30/28 = halfway to 435)
  tram.update(10 + 30 / 28);
  tram.getState(state);
  assert.equal(state.phase, "moving");
  assert.equal(state.stationId, null);
  assert.equal(state.nextStationId, "tram-plaza");
  assert.equal(state.direction, -1);
  assert.ok(Math.abs(state.y - 465) < 1e-4);
  assert.equal(state.speed, 28);
  assert.equal(state.departureIn, 0);
  assert.ok(Math.abs(state.arrivalIn - (30 / 28 - 1e-6)) < 1e-9);

  // Finish full roundtrip back to exact t = 0
  const elapsedSoFar = 100.25 + 30 / 28 + 1e-6;
  tram.update(160.5 - elapsedSoFar);
  tram.getState(state);
  assert.equal(state.phase, "dwell");
  assert.equal(state.stationId, "tram-gateway");
  assert.equal(state.nextStationId, "tram-market");
  assert.equal(state.direction, 1);
  assert.ok(Math.abs(state.y - -520) < 1e-9);
  assert.equal(state.speed, 0);
  assert.ok(Math.abs(state.departureIn - 20) < 1e-9);
  assert.ok(Math.abs(state.arrivalIn - (20 + 50 / 28)) < 1e-9);

  // Exact dyadic endpoint arrival t = 80.25 in a single call
  const tramExactEnd = createTramState();
  tramExactEnd.update(80.25);
  tramExactEnd.getState(state);
  assert.equal(state.phase, "dwell");
  assert.equal(state.stationId, "tram-tower");
  assert.equal(state.nextStationId, "tram-plaza");
  assert.equal(state.direction, -1);
  assert.equal(state.departureIn, 20);
  assert.ok(Math.abs(state.arrivalIn - (20 + 60 / 28)) < 1e-12);
});

test("fractional crossing and full residual dt across multiple legs, endpoint reversal, and multi-period jumps", () => {
  // Single update crossing Gateway dwell, 0->1, Market dwell, 1->2, Glasshouse dwell, and into 2->3
  // At t = 40: elapsed dwells = 20 + 8 + 8 = 36s; travel = 4s => 4 * 28 = 112m north of -520 => y = -408
  const tramA = createTramState();
  tramA.update(40);
  const stateA = tramA.getState({});
  assert.equal(stateA.phase, "moving");
  assert.equal(stateA.stationId, null);
  assert.equal(stateA.nextStationId, "tram-plaza");
  assert.equal(stateA.direction, 1);
  assert.ok(Math.abs(stateA.y - -408) < 1e-12);
  const expectedArrivalAt40 = 36 + (50 + 36 + 869) / 28 - 40;
  assert.ok(Math.abs(stateA.arrivalIn - expectedArrivalAt40) < 1e-12);

  // Single update crossing north endpoint reversal at t = 80.25 and 20s dwell at Civic Tower (ends at 100.25)
  // At t = 101.25: 1s into southbound leg from 495 => y = 495 - 28 = 467
  const tramB = createTramState();
  tramB.update(101.25);
  const stateB = tramB.getState({});
  assert.equal(stateB.phase, "moving");
  assert.equal(stateB.stationId, null);
  assert.equal(stateB.nextStationId, "tram-plaza");
  assert.equal(stateB.direction, -1);
  assert.equal(stateB.y, 467);
  assert.equal(stateB.speed, 28);
  assert.ok(Math.abs(stateB.arrivalIn - (60 / 28 - 1)) < 1e-12);

  // Multi-period update: 2 full roundtrips (321s) + 20.5s (0.5s into first northbound leg)
  const tramC = createTramState();
  tramC.update(160.5 * 2 + 20.5);
  const stateC = tramC.getState({});
  assert.equal(stateC.phase, "moving");
  assert.equal(stateC.direction, 1);
  assert.equal(stateC.nextStationId, "tram-market");
  assert.ok(Math.abs(stateC.y - (-520 + 28 * 0.5)) < 1e-12);
  assert.ok(Math.abs(stateC.arrivalIn - (50 / 28 - 0.5)) < 1e-12);
});

test("interaction eligibility enforces grounded walk, floor bounds, physical range, mode, and stable descriptors", () => {
  const tram = createTramState();
  const gateway = TRAM_STOPS[0];
  const market = TRAM_STOPS[1];

  // Docked at gateway: stable board descriptor
  const boardA = tram.getInteraction(atStop(gateway));
  const boardB = tram.getInteraction(atStop(gateway));
  assert.ok(boardA);
  assert.equal(boardA, boardB);
  assert.equal(boardA.kind, "board");
  assert.equal(boardA.stationId, "tram-gateway");
  assert.ok(boardA.prompt.length > 0);
  assert.ok(boardA.message.length > 0);

  // Inclusive floor bounds [-0.35, +0.35]
  assert.equal(tram.getInteraction(atStop(gateway, { height: 0.35 })), boardA);
  assert.equal(tram.getInteraction(atStop(gateway, { height: -0.35 })), boardA);
  assert.equal(tram.getInteraction(atStop(gateway, { height: 0.351 })), null);
  assert.equal(tram.getInteraction(atStop(gateway, { height: -0.351 })), null);

  // Near the 3.2m physical edge, use representably inside/outside coordinates.
  assert.equal(
    tram.getInteraction(atStop(gateway, { y: gateway.y + 3.2 - 1e-6 })),
    boardA,
  );
  assert.equal(
    tram.getInteraction(atStop(gateway, { y: gateway.y + 3.201 })),
    null,
  );
  assert.equal(
    tram.getInteraction(
      atStop(gateway, { theta: gateway.theta - (3.2 - 1e-6) / RADIUS - Math.PI * 2 }),
    ),
    boardA,
  );
  assert.equal(
    tram.getInteraction(atStop(gateway, { theta: gateway.theta + 3.21 / RADIUS })),
    null,
  );

  // Wrong traversal mode and airborne rejected
  assert.equal(
    tram.getInteraction(atStop(gateway, { traversalMode: "secured" })),
    null,
  );
  assert.equal(
    tram.getInteraction(atStop(gateway, { traversalMode: "trolley" })),
    null,
  );
  assert.equal(
    tram.getInteraction(atStop(gateway, { grounded: false })),
    null,
  );

  // At another station while tram is docked at gateway -> inspect descriptor (stable)
  const inspectMarketA = tram.getInteraction(atStop(market));
  const inspectMarketB = tram.getInteraction(atStop(market));
  assert.ok(inspectMarketA);
  assert.equal(inspectMarketA, inspectMarketB);
  assert.equal(inspectMarketA.kind, "inspect");
  assert.equal(inspectMarketA.stationId, "tram-market");

  // Aboard tram while docked -> stable exit descriptor
  const exitA = tram.getInteraction(aboard());
  const exitB = tram.getInteraction(aboard());
  assert.ok(exitA);
  assert.equal(exitA, exitB);
  assert.equal(exitA.kind, "exit");
  assert.equal(exitA.stationId, "tram-gateway");

  // Airborne while claiming tram mode -> null
  assert.equal(tram.getInteraction(aboard({ grounded: false })), null);

  // Mid-ride moving -> aboard gets null (no E mid-ride), ground pad gets inspect
  tram.update(20.5);
  assert.equal(tram.getInteraction(aboard()), null);
  const inspectGateway = tram.getInteraction(atStop(gateway));
  assert.ok(inspectGateway);
  assert.equal(inspectGateway.kind, "inspect");
  assert.equal(inspectGateway.stationId, "tram-gateway");
});

test("last-window boarding/exit boundary (0.5s) and midpoint canCommitTransfer departure races", () => {
  const tram = createTramState();
  const gateway = TRAM_STOPS[0];
  const market = TRAM_STOPS[1];

  // Exactly 0.5s before departure (t = 19.5): still eligible to start board and exit
  tram.update(19.5);
  assert.equal(tram.getState({}).departureIn, 0.5);
  assert.equal(tram.getInteraction(atStop(gateway))?.kind, "board");
  assert.equal(tram.getInteraction(aboard())?.kind, "exit");

  // Fade midpoint (+0.16s -> t = 19.66, remaining dwell = 0.34s > 0):
  // getInteraction no longer allows starting a new transfer, but canCommitTransfer succeeds!
  tram.update(0.16);
  assert.equal(tram.getInteraction(atStop(gateway))?.kind, "inspect");
  assert.equal(tram.getInteraction(aboard()), null);
  assert.equal(
    tram.canCommitTransfer("board", "tram-gateway", atStop(gateway)),
    true,
  );
  assert.equal(tram.canCommitTransfer("exit", "tram-gateway", aboard()), true);

  // Commit guards still verify station match, range, floor, grounded, mode, and valid kind
  assert.equal(
    tram.canCommitTransfer("board", "tram-market", atStop(market)),
    false,
  );
  assert.equal(
    tram.canCommitTransfer("exit", "tram-market", aboard()),
    false,
  );
  assert.equal(
    tram.canCommitTransfer(
      "board",
      "tram-gateway",
      atStop(gateway, { y: gateway.y + 3.5 }),
    ),
    false,
  );
  assert.equal(
    tram.canCommitTransfer(
      "board",
      "tram-gateway",
      atStop(gateway, { height: 0.4 }),
    ),
    false,
  );
  assert.equal(
    tram.canCommitTransfer(
      "board",
      "tram-gateway",
      atStop(gateway, { grounded: false }),
    ),
    false,
  );
  assert.equal(
    tram.canCommitTransfer(
      "board",
      "tram-gateway",
      atStop(gateway, { traversalMode: "secured" }),
    ),
    false,
  );
  assert.equal(
    tram.canCommitTransfer("exit", "tram-gateway", atStop(gateway)),
    false,
  );
  assert.equal(
    tram.canCommitTransfer("exit", "tram-gateway", aboard({ grounded: false })),
    false,
  );
  assert.equal(
    tram.canCommitTransfer("inspect", "tram-gateway", atStop(gateway)),
    false,
  );

  // Departure race: advance past departure (t = 20.0 -> moving)
  tram.update(0.34);
  assert.equal(tram.getState({}).phase, "moving");
  assert.equal(
    tram.canCommitTransfer("board", "tram-gateway", atStop(gateway)),
    false,
  );
  assert.equal(tram.canCommitTransfer("exit", "tram-gateway", aboard()), false);
});

test("station forecasts choose the next visit and its outbound terminal in both directions", () => {
  const tram = createTramState();
  const status = {};
  assert.equal(tram.getStopStatus("tram-gateway", status), status);
  assert.equal(status.docked, true);
  assert.equal(status.arrivalIn, 0);
  assert.equal(status.departureIn, 20);
  assert.equal(status.boardingOpen, true);
  assert.equal(status.destinationStationId, "tram-tower");
  assert.ok(Math.abs(tram.getStopStatus("tram-market", {}).arrivalIn - (20 + 50 / 28)) < 1e-10);
  tram.update(40);
  const expectations = [
    ["tram-gateway", 120.5, 1, "tram-tower"],
    ["tram-market", 110 + 5 / 7, -1, "tram-gateway"],
    ["tram-glasshouse", 101 + 3 / 7, -1, "tram-gateway"],
    ["tram-plaza", 30 + 3 / 28, 1, "tram-tower"],
    ["tram-tower", 40.25, -1, "tram-gateway"],
  ];
  for (const [id, arrival, direction, terminal] of expectations) {
    const forecast = tram.getStopStatus(id, status);
    assert.equal(forecast.stationId, id);
    assert.equal(forecast.docked, false);
    assert.equal(forecast.boardingOpen, false);
    assert.equal(forecast.departureIn, 0);
    assert.ok(Math.abs(forecast.arrivalIn - arrival) < 1e-10, id);
    assert.equal(forecast.direction, direction, id);
    assert.equal(forecast.destinationStationId, terminal, id);
  }
  tram.update(40.25);
  tram.getStopStatus("tram-tower", status);
  assert.equal(status.docked, true);
  assert.equal(status.arrivalIn, 0);
  assert.equal(status.departureIn, 20);
  assert.equal(status.direction, -1);
  assert.equal(status.destinationStationId, "tram-gateway");
  assert.equal(tram.getState({}).destinationStationId, "tram-gateway");
});

test("forecast reads do not advance service and preserve closing, commit, wrap and scratch contracts", () => {
  const tram = createTramState();
  const snapshot = tram.getState({});
  const scratch = { untouched: "keep" };
  assert.equal(tram.getStopStatus("missing", scratch), null);
  assert.deepEqual(scratch, { untouched: "keep" });
  for (const stop of TRAM_STOPS) tram.getStopStatus(stop.id, scratch);
  scratch.arrivalIn = -100;
  assert.equal(tram.getStopStatus("tram-gateway", scratch).arrivalIn, 0);
  assert.deepEqual(tram.getState({}), snapshot);
  tram.update(19.5);
  assert.equal(tram.getStopStatus("tram-gateway", scratch).boardingOpen, true);
  tram.update(0.16);
  assert.equal(tram.getStopStatus("tram-gateway", scratch).boardingOpen, false);
  assert.equal(scratch.arrivalIn, 0);
  assert.equal(scratch.docked, true);
  assert.equal(tram.canCommitTransfer("board", "tram-gateway", atStop(TRAM_STOPS[0])), true);
  tram.update(0.34);
  assert.equal(tram.getStopStatus("tram-gateway", scratch).docked, false);
  assert.ok(Math.abs(scratch.arrivalIn - 140.5) < 1e-10);
  tram.update(140.49);
  assert.ok(Math.abs(tram.getStopStatus("tram-gateway", scratch).arrivalIn - 0.01) < 1e-10);
  tram.update(0.01);
  assert.equal(tram.getStopStatus("tram-gateway", scratch).docked, true);
  assert.ok(Math.abs(scratch.departureIn - 20) < 1e-10);
  const later = createTramState();
  later.update(2 * 160.5 + 40);
  const atForty = createTramState();
  atForty.update(40);
  for (const stop of TRAM_STOPS) {
    assert.deepEqual(later.getStopStatus(stop.id, {}), atForty.getStopStatus(stop.id, {}));
  }
});
