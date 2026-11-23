import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { RADIUS, LENGTH } from "../src/habitat.js";
import { DRONE_LAUNCH } from "../src/drone-layout.js";
import { wrappedDeltaTheta } from "../src/cylinder-math.js";
import { createSurveyDrone } from "../src/survey-drone.js";

function expectedSurfacePos(theta, y, height) {
  const r = RADIUS - height;
  return new Vector3(r * Math.sin(theta), y, -r * Math.cos(theta));
}

function expectedInwardUp(theta) {
  return new Vector3(-Math.sin(theta), 0, Math.cos(theta));
}

function expectedLookDir(theta, yaw, pitch) {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  return new Vector3(
    cosP * sinY * cosT - sinP * sinT,
    cosP * cosY,
    cosP * sinY * sinT + sinP * cosT,
  );
}

function stepFrames(drone, count, dt = 0.05) {
  for (let i = 0; i < count; i++) drone.update(dt);
}

function setupDrone(obstacles = []) {
  const camera = new PerspectiveCamera(75, 16 / 9, 0.08, 2500);
  const drone = createSurveyDrone(camera, obstacles);
  const scratch = {};
  return {
    camera,
    drone,
    state: () => drone.getState(scratch),
  };
}

// Realign yaw/pitch to (0, 0) via look() without assuming DRONE_LAUNCH orientation.
function zeroOrientation(drone, state) {
  const s0 = { ...state() };
  drone.look(100, 0);
  const sYaw = state();
  const yawPerPx = wrappedDeltaTheta(sYaw.yaw, s0.yaw) / 100;
  drone.look(-sYaw.yaw / yawPerPx, 0);

  const s1 = { ...state() };
  const testDy = s1.pitch > 0 ? 100 : -100;
  drone.look(0, testDy);
  const sPitch = state();
  const pitchPerPx = (sPitch.pitch - s1.pitch) / testDy;
  drone.look(0, -sPitch.pitch / pitchPerPx);

  const sFinal = state();
  assert.ok(Math.abs(sFinal.yaw) < 1e-6);
  assert.ok(Math.abs(sFinal.pitch) < 1e-6);
}

test("flight lifecycle: start resets to DRONE_LAUNCH, clearInput clears keys, getState reuses out, non-positive/non-finite dt ignored", () => {
  const { camera, drone, state } = setupDrone([]);
  const out = {};
  const returned = drone.getState(out);
  assert.equal(returned, out);
  assert.deepEqual(Object.keys(out).sort(), ["height", "pitch", "theta", "y", "yaw"]);
  assert.equal(out.theta, DRONE_LAUNCH.theta);
  assert.equal(out.y, DRONE_LAUNCH.y);
  assert.equal(out.height, DRONE_LAUNCH.height);
  assert.equal(out.yaw, DRONE_LAUNCH.yaw);
  assert.equal(out.pitch, DRONE_LAUNCH.pitch);
  assert.equal(drone.key("KeyW", true), true);
  assert.equal(drone.key("KeyW", false), true);
  assert.equal(drone.key("KeyE", true), false);

  // Camera position uses absolute hull height (no EYE_HEIGHT) and inward radial up
  assert.ok(
    camera.position.distanceTo(
      expectedSurfacePos(out.theta, out.y, out.height),
    ) < 1e-9,
  );
  assert.ok(camera.up.distanceTo(expectedInwardUp(out.theta)) < 1e-9);

  // Non-positive and non-finite dt must not move or corrupt state
  drone.key("KeyW", true);
  drone.key("Space", true);
  drone.key("ArrowRight", true);
  for (const badDt of [0, -0.05, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined]) {
    drone.update(badDt);
    const s = state();
    assert.equal(s.theta, DRONE_LAUNCH.theta);
    assert.equal(s.y, DRONE_LAUNCH.y);
    assert.equal(s.height, DRONE_LAUNCH.height);
    assert.equal(s.yaw, DRONE_LAUNCH.yaw);
    assert.equal(s.pitch, DRONE_LAUNCH.pitch);
  }

  // Advance flight, then clearInput halts motion
  stepFrames(drone, 10);
  const moved = { ...state() };
  assert.ok(moved.height > DRONE_LAUNCH.height);
  drone.clearInput();
  stepFrames(drone, 10);
  assert.deepEqual(state(), moved);

  // Hold keys again and call start(): must reset to launch and clear held keys
  drone.key("KeyW", true);
  drone.key("Space", true);
  drone.key("ArrowLeft", true);
  drone.start();
  assert.equal(state().theta, DRONE_LAUNCH.theta);
  assert.equal(state().y, DRONE_LAUNCH.y);
  assert.equal(state().height, DRONE_LAUNCH.height);
  assert.equal(state().yaw, DRONE_LAUNCH.yaw);
  assert.equal(state().pitch, DRONE_LAUNCH.pitch);

  stepFrames(drone, 5);
  assert.equal(state().y, DRONE_LAUNCH.y);
  assert.equal(state().height, DRONE_LAUNCH.height);
  assert.ok(
    camera.position.distanceTo(
      expectedSurfacePos(DRONE_LAUNCH.theta, DRONE_LAUNCH.y, DRONE_LAUNCH.height),
    ) < 1e-9,
  );
});

test("controls: WASD tangent along yaw, Q/Space vertical only, Shift boost, arrow and mouse look", () => {
  const { camera, drone, state } = setupDrone([]);
  zeroOrientation(drone, state);

  // At yaw=0: W -> +y, S -> -y, D -> +theta, A -> -theta, height unchanged
  const h0 = state().height;
  drone.key("KeyW", true);
  stepFrames(drone, 4);
  drone.key("KeyW", false);
  assert.ok(state().y > DRONE_LAUNCH.y + 1);
  assert.equal(state().height, h0);
  assert.ok(Math.abs(wrappedDeltaTheta(state().theta, DRONE_LAUNCH.theta)) < 1e-9);

  const yAfterW = state().y;
  drone.key("KeyS", true);
  stepFrames(drone, 4);
  drone.key("KeyS", false);
  assert.ok(Math.abs(state().y - DRONE_LAUNCH.y) < 1e-6);
  assert.ok(yAfterW > state().y);

  drone.key("KeyD", true);
  stepFrames(drone, 4);
  drone.key("KeyD", false);
  assert.ok(wrappedDeltaTheta(state().theta, DRONE_LAUNCH.theta) > 0);
  assert.ok(Math.abs(state().y - DRONE_LAUNCH.y) < 1e-6);

  drone.key("KeyA", true);
  stepFrames(drone, 4);
  drone.key("KeyA", false);
  assert.ok(Math.abs(wrappedDeltaTheta(state().theta, DRONE_LAUNCH.theta)) < 1e-6);

  // Rotate yaw to +PI/2 (facing +theta): W moves +theta, D moves -y
  drone.start();
  zeroOrientation(drone, state);
  drone.key("ArrowRight", true);
  while (state().yaw < Math.PI / 2 - 0.02) drone.update(0.01);
  drone.key("ArrowRight", false);
  const yawRight = state().yaw;
  const beforeRight = { ...state() };
  drone.key("KeyW", true);
  stepFrames(drone, 4);
  drone.key("KeyW", false);
  const dArcW = wrappedDeltaTheta(state().theta, beforeRight.theta) * (RADIUS - state().height);
  const dYW = state().y - beforeRight.y;
  assert.ok(dArcW > 1 && Math.abs(dYW) < 0.2 * dArcW, `W follows yaw=${yawRight}`);

  // Space ascends, KeyQ descends; unrelated keys (KeyE, KeyC, ControlLeft) do nothing
  drone.start();
  zeroOrientation(drone, state);
  for (const ignored of ["KeyE", "KeyC", "ControlLeft"]) {
    drone.key(ignored, true);
    stepFrames(drone, 5);
    drone.key(ignored, false);
    assert.equal(state().height, DRONE_LAUNCH.height, `${ignored} must not change height`);
  }

  drone.key("Space", true);
  stepFrames(drone, 4);
  drone.key("Space", false);
  const hAscended = state().height;
  assert.ok(hAscended > DRONE_LAUNCH.height + 1);

  drone.key("KeyQ", true);
  stepFrames(drone, 4);
  drone.key("KeyQ", false);
  assert.ok(Math.abs(state().height - DRONE_LAUNCH.height) < 1e-6);

  // ShiftLeft and ShiftRight fly faster than cruise
  drone.start();
  zeroOrientation(drone, state);
  drone.key("KeyW", true);
  stepFrames(drone, 4);
  const cruiseDelta = Math.abs(state().y - DRONE_LAUNCH.y);
  drone.key("KeyW", false);

  for (const shiftCode of ["ShiftLeft", "ShiftRight"]) {
    drone.start();
    zeroOrientation(drone, state);
    drone.key("KeyW", true);
    drone.key(shiftCode, true);
    stepFrames(drone, 4);
    const boostDelta = Math.abs(state().y - DRONE_LAUNCH.y);
    drone.key("KeyW", false);
    drone.key(shiftCode, false);
    assert.ok(boostDelta > cruiseDelta * 1.8, `${shiftCode} moves faster than cruise`);
  }

  // ArrowUp/ArrowDown and look(dx, dy) clamp pitch and update real camera
  drone.start();
  zeroOrientation(drone, state);
  drone.key("ArrowUp", true);
  stepFrames(drone, 40);
  drone.key("ArrowUp", false);
  assert.equal(state().pitch, 1.55);

  drone.look(0, 5000);
  assert.equal(state().pitch, -1.55);

  drone.look(NaN, Infinity);
  assert.equal(state().pitch, -1.55);

  drone.start();
  drone.look(250, -120);
  const sLook = state();
  const dir = camera.getWorldDirection(new Vector3());
  assert.ok(dir.distanceTo(expectedLookDir(sLook.theta, sLook.yaw, sLook.pitch)) < 1e-6);
});

test("camera orientation tracks inward radial up and hull-absolute height across the cylinder", () => {
  const { camera, drone, state } = setupDrone([]);
  zeroOrientation(drone, state);

  // Move circumferentially and vertically; camera up must remain inward radial
  drone.key("KeyD", true);
  drone.key("Space", true);
  for (let i = 0; i < 40; i++) {
    drone.update(0.05);
    const s = state();
    assert.ok(
      camera.position.distanceTo(expectedSurfacePos(s.theta, s.y, s.height)) < 1e-6,
    );
    assert.ok(camera.up.distanceTo(expectedInwardUp(s.theta)) < 1e-6);
    const dir = camera.getWorldDirection(new Vector3());
    assert.ok(dir.distanceTo(expectedLookDir(s.theta, s.yaw, s.pitch)) < 1e-6);
  }
});

test("seam wrapping, radial/axial bounds, and angular speed at current physical radius", () => {
  const { drone, state } = setupDrone([]);
  zeroOrientation(drone, state);

  // Ascend to radial ceiling (325)
  drone.key("Space", true);
  drone.key("ShiftLeft", true);
  stepFrames(drone, 200);
  assert.equal(state().height, 325);
  drone.key("Space", false);

  // Measure angular rate at high altitude (r = RADIUS - 325 = 35m) vs lower altitude
  const tBeforeHigh = state().theta;
  drone.key("KeyD", true);
  drone.update(0.05);
  const dThetaHigh = wrappedDeltaTheta(state().theta, tBeforeHigh);
  drone.key("KeyD", false);

  // Cross the PI seam in both directions at r = 35m (2*PI*35 ~ 220m, quick at boost)
  drone.key("KeyD", true);
  let sawPositive = false;
  let sawNegative = false;
  let crossed = false;
  for (let i = 0; i < 160; i++) {
    const prev = state().theta;
    drone.update(0.05);
    const cur = state().theta;
    if (cur > 0) sawPositive = true;
    if (cur < 0) sawNegative = true;
    if (prev > 2.5 && cur < -2.5) crossed = true;
    assert.ok(cur >= -Math.PI && cur < Math.PI);
  }
  assert.ok(sawPositive && sawNegative && crossed, "crossed +PI -> -PI seam cleanly");
  drone.key("KeyD", false);

  drone.key("KeyA", true);
  let crossedBack = false;
  for (let i = 0; i < 160; i++) {
    const prev = state().theta;
    drone.update(0.05);
    const cur = state().theta;
    if (prev < -2.5 && cur > 2.5) crossedBack = true;
    assert.ok(cur >= -Math.PI && cur < Math.PI);
  }
  assert.ok(crossedBack, "crossed -PI -> +PI seam cleanly");
  drone.key("KeyA", false);

  // Descend to radial floor (1.25) and compare angular rate (r = RADIUS - 1.25 = 358.75m)
  drone.key("KeyQ", true);
  stepFrames(drone, 200);
  assert.equal(state().height, 1.25);
  drone.key("KeyQ", false);

  const tBeforeLow = state().theta;
  drone.key("KeyD", true);
  drone.update(0.05);
  const dThetaLow = wrappedDeltaTheta(state().theta, tBeforeLow);
  drone.key("KeyD", false);

  const expectedRatio = (RADIUS - 1.25) / (RADIUS - 325);
  assert.ok(
    Math.abs(dThetaHigh / dThetaLow - expectedRatio) < 1e-5,
    `angular rate scales with physical radius: got ${dThetaHigh / dThetaLow}, expected ${expectedRatio}`,
  );

  // Axial bounds +/- (LENGTH / 2 - 4)
  const axialLimit = LENGTH / 2 - 4;
  drone.key("KeyW", true);
  stepFrames(drone, 800);
  assert.equal(state().y, axialLimit);
  drone.key("KeyW", false);

  drone.key("KeyS", true);
  stepFrames(drone, 1200);
  assert.equal(state().y, -axialLimit);
  drone.key("KeyS", false);
});

test("normalized 3D diagonal movement preserves total physical speed", () => {
  function measurePhysicalSpeed(keysToHold) {
    const { drone, state } = setupDrone([]);
    zeroOrientation(drone, state);
    const start = { ...state() };
    for (const k of keysToHold) drone.key(k, true);
    const dt = 0.05;
    const frames = 6;
    stepFrames(drone, frames, dt);
    const end = state();
    const midRadius = RADIUS - (start.height + end.height) * 0.5;
    const dArc = wrappedDeltaTheta(end.theta, start.theta) * midRadius;
    const dy = end.y - start.y;
    const dh = end.height - start.height;
    return Math.hypot(dArc, dy, dh) / (frames * dt);
  }

  const cruise1D = measurePhysicalSpeed(["KeyW"]);
  const cruise2D = measurePhysicalSpeed(["KeyW", "KeyD"]);
  const cruise3D = measurePhysicalSpeed(["KeyW", "KeyD", "Space"]);
  // This estimates arc length using the mean radius over an entire climb.
  // Leave room for that approximation while still detecting diagonal speed gain.
  assert.ok(Math.abs(cruise2D - cruise1D) < 1e-4, `2D diag ${cruise2D} vs 1D ${cruise1D}`);
  assert.ok(Math.abs(cruise3D - cruise1D) < 0.02, `3D diag ${cruise3D} vs 1D ${cruise1D}`);

  const boost1D = measurePhysicalSpeed(["KeyW", "ShiftLeft"]);
  const boost3D = measurePhysicalSpeed(["KeyW", "KeyA", "Space", "ShiftLeft"]);
  assert.ok(boost1D > cruise1D * 1.5);
  assert.ok(Math.abs(boost3D - boost1D) < 0.02, `boost 3D diag ${boost3D} vs 1D ${boost1D}`);
});

test("collision blocking, per-axis sliding, normalized base/top, name preservation, and global deck height eligibility", () => {
  const dirSign = DRONE_LAUNCH.y > 0 ? -1 : 1;
  const forwardKey = dirSign > 0 ? "KeyW" : "KeyS";
  const wallY = DRONE_LAUNCH.y + dirSign * 6;

  // 1. Axial wall: diagonal motion (forward + D) blocks Y and slides along theta
  const axialWall = {
    name: "ignore_me_wall",
    theta: DRONE_LAUNCH.theta,
    y: wallY,
    width: 30,
    depth: 2,
    base: DRONE_LAUNCH.height - 5,
    height: 10,
  };
  {
    const { drone, state } = setupDrone([axialWall]);
    zeroOrientation(drone, state);
    drone.key(forwardKey, true);
    drone.key("KeyD", true);
    stepFrames(drone, 25);
    const s = state();
    const gap = Math.abs(s.y - wallY);
    assert.ok(gap >= 1.0 && gap < 2.0, `blocked outside wall depth/2 + radius: gap=${gap}`);
    assert.ok(wrappedDeltaTheta(s.theta, DRONE_LAUNCH.theta) * RADIUS > 5, "slid along theta");
  }

  // 2. Diagonal forward + Space slides up wall and clears top
  {
    const { drone, state } = setupDrone([axialWall]);
    zeroOrientation(drone, state);
    drone.key(forwardKey, true);
    drone.key("Space", true);
    stepFrames(drone, 40);
    const s = state();
    assert.ok(s.height > axialWall.base + axialWall.height, "climbed above wall");
    assert.ok(dirSign > 0 ? s.y > wallY + 1 : s.y < wallY - 1, "cleared over top of wall");
  }

  // 3. Thin elevated roof: blocks upward/downward boost without tunneling and slides smoothly beneath/above
  const roofBase = Math.min(300, DRONE_LAUNCH.height + 4);
  const thinRoof = {
    theta: DRONE_LAUNCH.theta,
    y: DRONE_LAUNCH.y + dirSign * 30,
    width: 30,
    depth: 80,
    base: roofBase,
    height: 0.05,
  };
  {
    const { drone, state } = setupDrone([thinRoof]);
    zeroOrientation(drone, state);
    drone.key(forwardKey, true);
    drone.key("Space", true);
    drone.key("ShiftLeft", true);
    for (let i = 0; i < 10; i++) {
      drone.update(0.1);
      assert.ok(state().height < roofBase, `cannot tunnel upward through thin roof: h=${state().height}`);
    }
    assert.ok(Math.abs(state().y - DRONE_LAUNCH.y) > 30, "slid beneath thin roof");

    // Clear the far side of the roof, ascend above it, then fly back and descend onto it
    drone.key("Space", false);
    stepFrames(drone, 20, 0.05);
    drone.key(forwardKey, false);
    drone.key("Space", true);
    stepFrames(drone, 8, 0.05);
    assert.ok(state().height > roofBase + 1);
    drone.key("Space", false);

    const backKey = dirSign > 0 ? "KeyS" : "KeyW";
    drone.key(backKey, true);
    stepFrames(drone, 20, 0.05);
    drone.key(backKey, false);
    drone.key("KeyQ", true);
    for (let i = 0; i < 10; i++) {
      drone.update(0.1);
      assert.ok(state().height > roofBase + thinRoof.height, "cannot tunnel downward through thin roof");
    }
  }

  // 4. Negative height obstacle normalized base/top + obstacle name not filtered
  const invertedObs = {
    name: "global_deck",
    theta: DRONE_LAUNCH.theta,
    y: DRONE_LAUNCH.y + dirSign * 5,
    width: 12,
    depth: 2,
    base: DRONE_LAUNCH.height + 4,
    height: -8, // spans [DRONE_LAUNCH.height - 4, DRONE_LAUNCH.height + 4]
  };
  {
    const { drone, state } = setupDrone([invertedObs]);
    zeroOrientation(drone, state);
    drone.key(forwardKey, true);
    stepFrames(drone, 20);
    const gap = Math.abs(state().y - invertedObs.y);
    assert.ok(gap >= 1.0 && gap < 2.0, "normalized negative-height obstacle blocks regardless of name");
  }

  // 5. Global deck avoided strictly by height eligibility at minimum height 1.25
  const globalDeck = {
    theta: 0,
    y: 0,
    width: Math.PI * 2 * RADIUS,
    depth: LENGTH,
    base: -0.6,
    height: 0.6,
  };
  {
    const { drone, state } = setupDrone([globalDeck]);
    zeroOrientation(drone, state);
    drone.key("KeyQ", true);
    drone.key("ShiftLeft", true);
    stepFrames(drone, 120);
    assert.equal(state().height, 1.25);
    drone.key("KeyQ", false);

    const beforeFly = { ...state() };
    drone.key(forwardKey, true);
    drone.key("KeyD", true);
    stepFrames(drone, 10);
    assert.ok(Math.abs(state().y - beforeFly.y) > 5);
    assert.ok(wrappedDeltaTheta(state().theta, beforeFly.theta) * RADIUS > 5);
  }

  // 6. High-altitude physical clearance & PI-seam obstacle blocking
  const highHeight = 300;
  const highWallY = DRONE_LAUNCH.y + dirSign * 15;
  const highObstacle = {
    theta: Math.PI,
    y: highWallY,
    width: 10, // hull arc width -> at h=300 (r=60), physical half-width is 5 * 60 / 360 = 5/6 m
    depth: 10,
    base: highHeight - 5,
    height: 10,
  };
  {
    const { drone, state } = setupDrone([highObstacle]);
    zeroOrientation(drone, state);
    drone.key("Space", true);
    drone.key("ShiftLeft", true);
    while (state().height < highHeight) drone.update(0.05);
    drone.key("Space", false);
    drone.key("KeyQ", true);
    while (state().height > highHeight) drone.update(0.05);
    drone.key("KeyQ", false);
    assert.ok(state().height >= 295 && state().height <= 305);

    // Ensure angular clearance from Math.PI before moving axially to highWallY
    if (Math.abs(wrappedDeltaTheta(state().theta, Math.PI)) < 0.3) {
      drone.key("KeyD", true);
      stepFrames(drone, 10);
      drone.key("KeyD", false);
    }
    drone.key(forwardKey, true);
    while (dirSign > 0 ? state().y < highWallY : state().y > highWallY) {
      drone.update(0.05);
    }
    drone.key(forwardKey, false);

    // Fly circumferentially toward PI seam wall (450m > 2*PI*60m circumference)
    drone.key("KeyD", true);
    stepFrames(drone, 180);
    const r = RADIUS - state().height;
    const dPhysArc = Math.abs(wrappedDeltaTheta(state().theta, Math.PI)) * r;
    const expectedMinPhys = 5 * (r / RADIUS) + 0.5;
    assert.ok(
      dPhysArc >= expectedMinPhys,
      `physical clearance respected at high altitude: dPhysArc=${dPhysArc}, expected>=${expectedMinPhys}`,
    );
  }
});
