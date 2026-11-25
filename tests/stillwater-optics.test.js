import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera } from "three";
import { MAIN_LIFT } from "../src/city-layout.js";
import { surfacePos } from "../src/surface.js";
import { STILLWATER_LENS } from "../src/reservoir-layout.js";
import { aimOptics, canUseOptics } from "../src/stillwater-optics.js";

test("scope access is on foot, on the raised deck, and wraps the cylinder seam", () => {
  const { theta, y, height, range } = STILLWATER_LENS.station;
  const walking = { theta, y, height, grounded: true, traversalMode: "walk" };
  assert.ok(canUseOptics({ ...walking, theta: theta - 2 * Math.PI, y: y + range - 0.02 }));
  assert.ok(!canUseOptics({ ...walking, y: y + range + 0.02 }));
  assert.ok(!canUseOptics({ ...walking, height: 0 }));
  assert.ok(!canUseOptics({ ...walking, grounded: false }));
  assert.ok(!canUseOptics({ ...walking, traversalMode: "tram" }));
});

test("the opposite-wall tower fits and stays upright through the scope", () => {
  const camera = new PerspectiveCamera(60, 1, 0.08, 2000);
  aimOptics(camera, 0);
  const base = surfacePos(MAIN_LIFT.theta, MAIN_LIFT.y, 0).project(camera);
  const crown = surfacePos(MAIN_LIFT.theta, MAIN_LIFT.y, 80).project(camera);
  assert.ok(base.y > -0.9 && base.y < crown.y);
  assert.ok(Math.abs(crown.x) < 0.7 && crown.y < 0.9);
  assert.ok(crown.z > -1 && crown.z < 1);
});
