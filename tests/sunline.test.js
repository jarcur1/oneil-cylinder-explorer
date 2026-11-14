import test from "node:test";
import assert from "node:assert/strict";
import { createSunlineState } from "../src/sunline-state.js";
import {
  ENDCAP_HUBS,
  SUNLINE_PANEL,
  AXIAL_HEIGHT,
  SPINE_THETA,
  SUNLINE_TRACK_MIN_Y,
  SUNLINE_TRACK_MAX_Y,
  getAxialHub,
} from "../src/sunline-layout.js";
import { getSunlineTransfer } from "../src/sunline-transit.js";

const controlA = ENDCAP_HUBS[0].control;
const controlB = ENDCAP_HUBS[1].control;
const at = (target, traversalMode, overrides = {}) => ({
  theta: target.theta, y: target.y, height: target.height,
  grounded: true, traversalMode, ...overrides,
});

test("scheduled maintenance isolates at one end, replaces on rail, and restores at the other", () => {
  const job = createSunlineState();
  const consoleA = at(controlA, "secured");
  const module = at(SUNLINE_PANEL, "trolley");
  const consoleB = at(controlB, "secured");
  assert.equal(job.getView(consoleA).progress, "0 / 3");
  assert.equal(job.interact(consoleA).changed, true);
  assert.equal(job.getPhase(), "isolated");
  assert.equal(job.getView(module).progress, "1 / 3");
  assert.equal(job.interact(module).changed, true);
  assert.equal(job.getPhase(), "replaced");
  assert.equal(job.getView(consoleB).progress, "2 / 3");
  assert.equal(job.interact(consoleB).changed, true);
  assert.equal(job.getPhase(), "complete");
  assert.equal(job.getView(consoleB).progress, "3 / 3");
  assert.equal(job.getView(consoleB).target, null);
});

test("inspection cannot bypass isolation, and repeated actions never reset or double-complete", () => {
  const job = createSunlineState();
  const console = at(controlB, "secured");
  const module = at(SUNLINE_PANEL, "trolley");
  assert.equal(job.interact(module).changed, false);
  assert.equal(job.getPhase(), "available");
  assert.equal(job.interact(console).changed, true);
  assert.equal(job.interact(console).changed, false);
  assert.equal(job.getPhase(), "isolated");
  assert.equal(job.interact(module).changed, true);
  assert.equal(job.interact(module).changed, false);
  assert.equal(job.getPhase(), "replaced");
  assert.equal(job.interact(at(controlA, "secured")).changed, true);
  assert.equal(job.interact(console).changed, false);
  assert.equal(job.interact(module).changed, false);
  assert.equal(job.getPhase(), "complete");
});

test("interaction prompts and mutations reject the wrong support mode, floor, or airborne pose", () => {
  for (const [target, mode, phase, wrongModes] of [
    [controlA, "secured", "available", ["walk", "trolley"]],
    [SUNLINE_PANEL, "trolley", "isolated", ["walk", "secured"]],
  ]) {
    const invalid = [
      ...wrongModes.map((traversalMode) => ({ traversalMode })),
      { grounded: false }, { height: 0 },
      { height: target.height + 0.36 }, { height: target.height - 0.36 },
    ];
    for (const override of invalid) {
      const job = createSunlineState(phase);
      const player = at(target, mode, override);
      assert.equal(job.getView(player).prompt, null);
      assert.equal(job.interact(player), null);
      assert.equal(job.getPhase(), phase);
    }
    for (const deltaHeight of [-0.35, 0.35]) {
      const job = createSunlineState(phase);
      assert.equal(job.interact(at(target, mode, { height: target.height + deltaHeight })).changed, true);
    }
  }
});

test("console and rail-panel range boundaries are physical metres at the axial floor", () => {
  for (const [target, mode, phase] of [
    [controlA, "secured", "available"], [SUNLINE_PANEL, "trolley", "isolated"],
  ]) {
    const job = createSunlineState(phase);
    const outside = at(target, mode, { y: target.y + target.range + 0.01 });
    assert.equal(job.getView(outside).prompt, null);
    assert.equal(job.interact(outside), null);
    assert.equal(job.getPhase(), phase);
    const inside = at(target, mode, { y: target.y + target.range - 0.01 });
    assert.equal(job.interact(inside).changed, true);
  }
});

test("PI-seam wrapping permits nearby servicing but rejects the opposite side", () => {
  const consoleJob = createSunlineState();
  assert.equal(consoleJob.interact(at(controlA, "secured", { theta: -Math.PI + 0.3 })).changed, true);
  const moduleJob = createSunlineState("isolated");
  const opposite = at(SUNLINE_PANEL, "trolley", { theta: 0 });
  assert.equal(moduleJob.interact(opposite), null);
  // At r10, 0.2 radians is 2m, not the 36m surface arc.
  const nearby = at(SUNLINE_PANEL, "trolley", { theta: -Math.PI + 0.2 });
  assert.ok(Math.abs(moduleJob.getView(nearby).distance - 2) < 1e-10);
  assert.equal(moduleJob.interact(nearby).changed, true);
});

test("navigation includes the axial radial transfer and selects the nearer endcap", () => {
  const job = createSunlineState();
  assert.ok(Math.abs(job.getView(at(controlA, "walk", { height: 0 })).distance - AXIAL_HEIGHT) < 1e-10);
  assert.ok(job.getView(at(controlA, "secured")).distance < 1e-10);
  assert.equal(job.getView({ theta: SPINE_THETA, y: -400, height: AXIAL_HEIGHT }).target.y, controlA.y);
  assert.equal(job.getView({ theta: SPINE_THETA, y: 400, height: AXIAL_HEIGHT }).target.y, controlB.y);
  assert.equal(job.getView({ theta: SPINE_THETA, y: -850, height: AXIAL_HEIGHT }).target.y, controlA.y);
  assert.equal(job.getView({ theta: SPINE_THETA, y: 850, height: AXIAL_HEIGHT }).target.y, controlB.y);
});

test("restored isolated and replaced jobs resume only the unfinished steps", () => {
  const isolated = createSunlineState("isolated");
  const console = at(controlA, "secured");
  assert.equal(isolated.interact(console).changed, false);
  assert.equal(isolated.getPhase(), "isolated");
  assert.equal(isolated.interact(at(SUNLINE_PANEL, "trolley")).changed, true);
  const replaced = createSunlineState("replaced");
  assert.equal(replaced.interact(at(SUNLINE_PANEL, "trolley")).changed, false);
  assert.equal(replaced.interact(console).changed, true);
  assert.equal(replaced.getPhase(), "complete");
});

test("relocated endcaps and SL-02 operate beyond old bounds and reject old coordinates", () => {
  assert.ok(controlA.y < -450, "Endcap A relocated beyond old -450m bound");
  assert.ok(controlB.y > 450, "Endcap B relocated beyond old +450m bound");
  assert.ok(SUNLINE_PANEL.y < -450, "SL-02 sits beyond old -450m bound");
  assert.ok(
    SUNLINE_PANEL.y >= SUNLINE_TRACK_MIN_Y && SUNLINE_PANEL.y <= SUNLINE_TRACK_MAX_Y,
    "SL-02 remains reachable inside trolley track bounds",
  );

  // Old endcap Y coordinates must no longer resolve hubs, transfers, or console interactions
  const job = createSunlineState("available");
  for (const oldY of [-424, -422, -414, -410, 410, 414, 422, 424]) {
    assert.equal(getAxialHub({ theta: SPINE_THETA, y: oldY, height: AXIAL_HEIGHT }), null);
    assert.equal(getSunlineTransfer({ theta: SPINE_THETA, y: oldY, height: 0, grounded: true, traversalMode: "walk" }), null);
    assert.equal(getSunlineTransfer({ theta: SPINE_THETA, y: oldY, height: AXIAL_HEIGHT, grounded: true, traversalMode: "secured" }), null);
    assert.equal(getSunlineTransfer({ theta: SPINE_THETA, y: oldY, height: AXIAL_HEIGHT, grounded: true, traversalMode: "trolley" }), null);
    assert.equal(job.interact({ theta: controlA.theta, y: oldY, height: AXIAL_HEIGHT, grounded: true, traversalMode: "secured" }), null);
  }

  // Both remote endcaps support full rim <-> landing <-> dock <-> trolley transfers
  for (const hub of ENDCAP_HUBS) {
    assert.equal(getAxialHub(hub.landing)?.id, hub.id);
    const up = getSunlineTransfer({ ...hub.rim, grounded: true, traversalMode: "walk" });
    assert.equal(up.destination.y, hub.landing.y);
    assert.equal(up.destination.constraint.mode, "secured");
    const board = getSunlineTransfer({ ...hub.dock, grounded: true, traversalMode: "secured" });
    assert.equal(board.destination.y, hub.trolley.y);
    assert.equal(board.destination.constraint.mode, "trolley");
    const disembark = getSunlineTransfer({ ...hub.trolley, grounded: true, traversalMode: "trolley" });
    assert.equal(disembark.destination.y, hub.dock.y);
    const down = getSunlineTransfer({ ...hub.landing, grounded: true, traversalMode: "secured" });
    assert.equal(down.destination.y, hub.rim.y);
    assert.equal(down.destination.height, 0);
  }
});

test("transfer eligibility preserves inclusive 0.35m floor bounds at axial height and rejects outside or invalid poses", () => {
  const hub = ENDCAP_HUBS[0];
  for (const [stop, mode, dest, wrongModes] of [
    [hub.rim, "walk", hub.landing, ["secured", "trolley"]],
    [hub.landing, "secured", hub.rim, ["walk", "trolley"]],
    [hub.trolley, "trolley", hub.dock, ["walk", "secured"]],
  ]) {
    for (const deltaHeight of [-0.35, 0.35]) {
      const transfer = getSunlineTransfer(at(stop, mode, { height: stop.height + deltaHeight }));
      assert.equal(transfer?.destination.y, dest.y);
    }
    for (const override of [
      ...wrongModes.map((traversalMode) => ({ traversalMode })),
      { grounded: false },
      { height: stop.height - 0.36 },
      { height: stop.height + 0.36 },
    ]) {
      assert.equal(getSunlineTransfer(at(stop, mode, override)), null);
    }
  }
});
