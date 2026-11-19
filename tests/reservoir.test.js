import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { RADIUS, EYE_HEIGHT, GRAVITY, gravityAtHeight } from "../src/habitat.js";
import { createPlayer } from "../src/player.js";
import { surfacePos, surfaceUp, addSurfacePatch } from "../src/surface.js";
import { Group, MeshBasicMaterial } from "three";
import { LANDMARKS } from "../src/landmarks.js";
import { RESERVOIR_ARRIVAL, inReservoir, reservoirS, reservoirY } from "../src/reservoir-layout.js";
import { RESERVOIR_TARGETS } from "../src/reservoir-layout.js";
import { createNavigation } from "../src/navigation.js";

test("opposite-wall membership wraps across the PI seam without moving the district", () => {
  const circumference = 2 * Math.PI * RADIUS;
  for (const s of [-154, 0, 154]) {
    for (const turn of [-1, 0, 1]) assert.equal(inReservoir(reservoirS(s) + turn * circumference, reservoirY(0)), true);
  }
  assert.equal(inReservoir(reservoirS(156), reservoirY(0)), false);
  assert.equal(inReservoir(reservoirS(156), reservoirY(0), 2), true);
  assert.equal(inReservoir(reservoirS(0), reservoirY(141)), false);
  const ids = LANDMARKS.map((landmark) => landmark.id);
  assert.deepEqual(ids, ["greenway-market", "greenway-glasshouse", "greenway-overlook", "meridian-plaza", "civic-lobby", "skyroom", "meridian-water-plant", "meridian-power-room", "endcap-a-hub", "endcap-b-hub", "sunline-module-02"]);
});

test("opposite curved surface uses world positions and inward normals on both sides of the seam", () => {
  const group = new Group();
  const material = new MeshBasicMaterial();
  const patch = addSurfacePatch(group, material, reservoirS(0), reservoirY(0), 40, 8, 0.4);
  const positions = patch.geometry.getAttribute("position");
  const normals = patch.geometry.getAttribute("normal");
  for (const index of [0, Math.floor(positions.count / 2), positions.count - 1]) {
    const position = new Vector3().fromBufferAttribute(positions, index);
    const normal = new Vector3().fromBufferAttribute(normals, index);
    const theta = Math.atan2(position.x, -position.z);
    assert.ok(position.z > 350);
    assert.ok(Math.abs(Math.hypot(position.x, position.z) - (RADIUS - 0.4)) < 0.0001);
    assert.ok(normal.distanceTo(surfaceUp(theta)) < 0.00001);
  }
  assert.ok(surfacePos(Math.PI, reservoirY(0)).distanceTo(new Vector3(0, reservoirY(0), RADIUS)) < 1e-9);
  patch.geometry.dispose();
  material.dispose();
});

test("real walking controller crosses PI with inward camera up and surface gravity", () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { pointerLockElement: null });
  const camera = new PerspectiveCamera();
  const deck = { theta: 0, y: 0, width: 2 * Math.PI * RADIUS, depth: 1400, base: -0.6, height: 0.6 };
  const player = createPlayer(camera, new EventTarget(), { obstacles: [deck], groundHeight: -8 });
  const key = (code, down) => { const event = new Event(down ? "keydown" : "keyup"); Object.assign(event, { code, key: "" }); window.dispatchEvent(event); };
  try {
    player.setEnabled(true);
    player.teleport({ ...RESERVOIR_ARRIVAL, theta: Math.PI - 1 / RADIUS });
    player.update(0.05);
    const before = { ...player.getState({}) };
    assert.ok(camera.up.distanceTo(surfaceUp(before.theta)) < 1e-6);
    assert.ok(camera.position.distanceTo(surfacePos(before.theta, before.y, EYE_HEIGHT)) < 1e-6);
    assert.equal(before.gravity, GRAVITY);
    const forward = camera.getWorldDirection(new Vector3());
    assert.ok(forward.y > 0.99);
    key("KeyD", true);
    for (let i = 0; i < 12; i++) player.update(0.05);
    key("KeyD", false);
    const after = player.getState({});
    const delta = Math.atan2(Math.sin(after.theta - before.theta), Math.cos(after.theta - before.theta));
    assert.ok(delta * RADIUS > 3);
    assert.ok(Math.abs(after.y - before.y) < 1e-6);
    assert.ok(inReservoir(after.theta * RADIUS, after.y));
    assert.ok(camera.up.distanceTo(surfaceUp(after.theta)) < 1e-6);
    assert.equal(after.height, 0);
    assert.equal(after.gravity, gravityAtHeight(after.height));
  } finally {
    player.dispose();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test("reserve waypoint arrival honors authored range and floor", () => {
  assert.deepEqual(RESERVOIR_TARGETS.map(({ id, name }) => [id, name]), [
    ["stillwater-shore", "Stillwater shoreline"],
    ["stillwater-pavilion", "Water-management pavilion"],
    ["stillwater-lookout", "Meridian-facing lookout"],
  ]);
  const nav = createNavigation();
  for (const target of RESERVOIR_TARGETS) {
    nav.select({ kind: "destination", id: target.id });
    const pose = { theta: target.theta, y: target.y, height: target.height };
    assert.equal(nav.getWaypoint({ ...pose, y: pose.y + 2.99 }, {}).arrived, true, target.id);
    assert.equal(nav.getWaypoint({ ...pose, y: pose.y + 3.01 }, {}).arrived, false, target.id);
    const wrongFloor = target.id === "stillwater-pavilion" ? 6.15 : 0;
    assert.equal(nav.getWaypoint({ ...pose, height: wrongFloor }, {}).arrived, false, target.id);
  }
});
