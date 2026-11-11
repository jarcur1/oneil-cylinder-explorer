import test from "node:test";
import assert from "node:assert/strict";
import { Scene } from "three";
import { createMaintenanceState } from "../src/maintenance-state.js";
import { createMaintenance } from "../src/maintenance.js";
import { CARETAKER, VENTILATION_UNIT } from "../src/maintenance-layout.js";
import { RADIUS } from "../src/habitat.js";

const MARA_PLAYER = Object.freeze({
  theta: CARETAKER.s / RADIUS,
  y: CARETAKER.y,
  height: CARETAKER.height,
  grounded: true,
});

const UNIT_PLAYER = Object.freeze({
  theta: VENTILATION_UNIT.s / RADIUS,
  y: VENTILATION_UNIT.y,
  height: VENTILATION_UNIT.height,
  grounded: true,
});

test("maintenance state: full four-phase progression", () => {
  const state = createMaintenanceState("available");

  // Phase 1: available -> talk to Mara -> assigned
  assert.equal(state.getPhase(), "available");
  const talkMara1 = state.interact(MARA_PLAYER);
  assert.ok(talkMara1);
  assert.equal(talkMara1.changed, true);
  assert.equal(state.getPhase(), "assigned");
  assert.equal(state.getView().fanRunning, false);

  // Phase 2: assigned -> restart ventilation unit -> repaired
  const restartUnit = state.interact(UNIT_PLAYER);
  assert.ok(restartUnit);
  assert.equal(restartUnit.changed, true);
  assert.equal(state.getPhase(), "repaired");
  assert.equal(state.getView().fanRunning, true);

  // Phase 3: repaired -> report to Mara -> complete
  const reportMara = state.interact(MARA_PLAYER);
  assert.ok(reportMara);
  assert.equal(reportMara.changed, true);
  assert.equal(state.getPhase(), "complete");
  assert.equal(state.getView().fanRunning, true);
});

test("maintenance state: repeat conversations remain useful and never reset or double-complete", () => {
  // Assigned phase: repeat talking to Mara gives useful reminder without resetting
  const assignedState = createMaintenanceState("assigned");
  const repeatMaraAssigned = assignedState.interact(MARA_PLAYER);
  assert.ok(repeatMaraAssigned);
  assert.equal(repeatMaraAssigned.changed, false);
  assert.equal(assignedState.getPhase(), "assigned");

  // Repaired phase: interacting with unit again reports normal operation without completing job
  const repairedState = createMaintenanceState("repaired");
  const repeatUnitRepaired = repairedState.interact(UNIT_PLAYER);
  assert.ok(repeatUnitRepaired);
  assert.equal(repeatUnitRepaired.changed, false);
  assert.equal(repairedState.getPhase(), "repaired");

  // Complete phase: talking to Mara again thanks player without resetting
  const completeState = createMaintenanceState("complete");
  const repeatMaraComplete = completeState.interact(MARA_PLAYER);
  assert.ok(repeatMaraComplete);
  assert.equal(repeatMaraComplete.changed, false);
  assert.equal(completeState.getPhase(), "complete");

  // Complete phase: interacting with unit reports nominal operation
  const repeatUnitComplete = completeState.interact(UNIT_PLAYER);
  assert.ok(repeatUnitComplete);
  assert.equal(repeatUnitComplete.changed, false);
  assert.equal(completeState.getPhase(), "complete");
});

test("maintenance state: inspecting unit before assignment does not repair it", () => {
  const state = createMaintenanceState("available");
  const inspect = state.interact(UNIT_PLAYER);
  assert.ok(inspect);
  assert.equal(inspect.changed, false);
  assert.equal(state.getPhase(), "available");
  assert.equal(state.getView().fanRunning, false);
});

test("maintenance state: remote, airborne, and wrong-floor safeguards", () => {
  const state = createMaintenanceState("available");

  // Remote player (> 2.8m)
  const remotePlayer = {
    theta: CARETAKER.s / RADIUS,
    y: CARETAKER.y + 10.0, // 10m away
    height: CARETAKER.height,
    grounded: true,
  };
  assert.equal(state.interact(remotePlayer), null);

  // Airborne player (grounded === false)
  const airbornePlayer = {
    ...MARA_PLAYER,
    grounded: false,
  };
  assert.equal(state.interact(airbornePlayer), null);

  // Wrong floor at Mara (feet > 0.4m from ground 0)
  const wrongFloorMara = {
    ...MARA_PLAYER,
    height: 0.8, // 0.8m > 0.4m
  };
  assert.equal(state.interact(wrongFloorMara), null);

  // Wrong floor at Skywalk unit (standing on ground under Skywalk)
  const underSkywalkPlayer = {
    theta: VENTILATION_UNIT.s / RADIUS,
    y: VENTILATION_UNIT.y,
    height: 0, // at ground instead of 9m
    grounded: true,
  };
  assert.equal(state.interact(underSkywalkPlayer), null);

  // Wrong floor at Skywalk unit (feet > 0.4m from 9m floor)
  const jumpAtUnit = {
    ...UNIT_PLAYER,
    height: 9.6, // 0.6m > 0.4m
  };
  assert.equal(state.interact(jumpAtUnit), null);

  // Null / undefined player state
  assert.equal(state.interact(null), null);
  assert.equal(state.interact(undefined), null);
});

test("unit service uses wrapped physical range at Skywalk height", () => {
  const state = createMaintenanceState("assigned");
  const unitTheta = VENTILATION_UNIT.s / RADIUS;
  const radius = RADIUS - VENTILATION_UNIT.height;
  const far = {
    ...UNIT_PLAYER,
    theta: unitTheta + 2.85 / radius + Math.PI * 2,
  };
  const near = {
    ...UNIT_PLAYER,
    theta: unitTheta + 2.75 / radius + Math.PI * 2,
  };
  assert.equal(state.interact(far), null);
  assert.equal(state.getPhase(), "assigned");
  assert.equal(state.interact(near).changed, true);
  assert.equal(state.getPhase(), "repaired");
});

test("fan starts and the indicator turns green only after service", () => {
  const scene = new Scene();
  const maintenance = createMaintenance(scene);
  const rotor = scene.getObjectByName("rotor");
  const indicator = scene.getObjectByName("indicator");
  const initialPose = rotor.quaternion.clone();
  assert.ok(indicator.material.color.r > indicator.material.color.g);
  maintenance.update(0.1);
  assert.ok(rotor.quaternion.equals(initialPose));
  maintenance.interact(MARA_PLAYER);
  maintenance.update(0.1);
  assert.ok(rotor.quaternion.equals(initialPose));
  maintenance.interact(UNIT_PLAYER);
  assert.ok(indicator.material.color.g > indicator.material.color.r);
  maintenance.update(0.1);
  assert.ok(rotor.quaternion.angleTo(initialPose) > 0.1);
});

test("restoring repair and completion preserves a running green unit", () => {
  const repairedScene = new Scene();
  const repaired = createMaintenance(repairedScene, "repaired");
  const rotor = repairedScene.getObjectByName("rotor");
  const indicator = repairedScene.getObjectByName("indicator");
  const before = rotor.quaternion.clone();
  repaired.update(0.1);
  assert.ok(rotor.quaternion.angleTo(before) > 0.1);
  assert.ok(indicator.material.color.g > indicator.material.color.r);
  repaired.interact(MARA_PLAYER);
  assert.equal(repaired.getPhase(), "complete");
  const completedScene = new Scene();
  const completed = createMaintenance(completedScene, repaired.getPhase());
  const restoredRotor = completedScene.getObjectByName("rotor");
  const restoredPose = restoredRotor.quaternion.clone();
  completed.update(0.1);
  assert.ok(restoredRotor.quaternion.angleTo(restoredPose) > 0.1);
  const restoredIndicator = completedScene.getObjectByName("indicator");
  assert.ok(
    restoredIndicator.material.color.g > restoredIndicator.material.color.r,
  );
});
