import test from "node:test";
import assert from "node:assert/strict";
import { Scene } from "three";
import { createResidents } from "../src/residents.js";
import { RADIUS } from "../src/habitat.js";

test("resident limbs remain continuous across route lap boundaries", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const poses = [];
  scene.traverse((node) => poses.push({ node, previous: node.rotation.x }));

  let largestFrameChange = 0;
  const dt = 1 / 60;
  // Long enough for every walking route to cross its first lap boundary.
  for (let frame = 0; frame < 120 * 60; frame++) {
    residents.update(dt, frame * dt);
    for (const pose of poses) {
      const angle = pose.node.rotation.x;
      largestFrameChange = Math.max(
        largestFrameChange,
        Math.abs(angle - pose.previous),
      );
      pose.previous = angle;
    }
  }

  assert.ok(
    largestFrameChange < 0.1,
    `Visible limb snap: ${largestFrameChange.toFixed(3)} radians in one 60 Hz frame`,
  );
});

test("viewpoint residents stand on their raised floors", () => {
  const scene = new Scene();
  createResidents(scene);
  const radiusOf = (id) => {
    const root = scene.getObjectByName(id);
    return Math.hypot(root.position.x, root.position.z);
  };
  const groundRadius = radiusOf("resident-plaza");
  assert.ok(Math.abs(groundRadius - radiusOf("resident-skywalk") - 9) < 1e-6);
  assert.ok(Math.abs(groundRadius - radiusOf("resident-skyroom") - 42) < 1e-6);
});

test("a viewpoint visitor pauses, settles, and resumes walking", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const actor = residents.residents.find(
    (r) => r.cfg.id === "resident-skywalk",
  );
  const previous = actor.root.position.clone();
  let stoppedFrames = 0;
  let sawPause = false;
  let sawResume = false;
  let previousLegAngle = actor.leftThigh.rotation.x;
  let largestRestingChange = 0;
  for (let frame = 0; frame < 60 * 60; frame++) {
    residents.update(1 / 60, frame / 60);
    const moved = actor.root.position.distanceTo(previous) > 1e-7;
    if (!moved) {
      stoppedFrames++;
      if (stoppedFrames > 60) {
        sawPause = true;
        largestRestingChange = Math.max(
          largestRestingChange,
          Math.abs(actor.leftThigh.rotation.x - previousLegAngle),
        );
      }
    } else {
      if (sawPause) {
        sawResume = true;
        break;
      }
      stoppedFrames = 0;
    }
    previous.copy(actor.root.position);
    previousLegAngle = actor.leftThigh.rotation.x;
  }
  assert.ok(sawPause, "Visitor must actually stop at the viewpoint");
  assert.ok(
    largestRestingChange < 1e-4,
    "Legs must settle rather than walking in place",
  );
  assert.ok(sawResume, "Visitor must continue the route after resting");
});

test("Mara remains at her interaction point during world updates", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const mara = scene.getObjectByName("caretaker-mara");
  const origin = mara.position.clone();
  for (let frame = 0; frame < 120; frame++) {
    residents.update(1 / 60, frame / 60);
    assert.ok(mara.position.distanceTo(origin) < 1e-8);
  }
});

test("open conversation anchor tracks Nia Sen as she continues walking", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const nia = residents.residents.find((r) => r.cfg.id === "resident-square");
  assert.ok(nia);

  const initialPose = {
    theta: nia.sampleState.s / RADIUS,
    y: nia.sampleState.y,
    height: nia.height,
    grounded: true,
    traversalMode: "walk",
  };
  const view = residents.getReaction(initialPose, "available");
  assert.ok(view);
  const openAnchor = view.target;
  const startPosition = nia.root.position.clone();

  for (let frame = 0; frame < 300; frame++) {
    residents.update(1 / 60, frame / 60);
  }

  assert.ok(
    nia.root.position.distanceTo(startPosition) > 3.1,
    "Nia Sen must physically advance along her route while a conversation is open",
  );

  const radius = RADIUS - openAnchor.height;
  const anchorDistance = Math.hypot(
    radius * Math.sin(openAnchor.s / RADIUS) - nia.root.position.x,
    openAnchor.y - nia.root.position.y,
    -radius * Math.cos(openAnchor.s / RADIUS) - nia.root.position.z,
  );
  assert.ok(
    anchorDistance < 0.1,
    "Already-open conversation anchor must stay aligned with Nia's live world position",
  );

  assert.equal(residents.getReaction(initialPose, "isolated"), null);
});

test("Nia Sen reaction enforces grounded walk mode, floor height, and 3m wrapped distance", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const nia = residents.residents.find((r) => r.cfg.id === "resident-square");
  const baseTheta = nia.sampleState.s / RADIUS;
  const valid = {
    theta: baseTheta,
    y: nia.sampleState.y,
    height: nia.height,
    grounded: true,
    traversalMode: "walk",
  };

  assert.equal(residents.getReaction(null, "complete"), null);
  assert.equal(residents.getReaction(undefined, "complete"), null);
  assert.equal(
    residents.getReaction({ ...valid, grounded: false }, "complete"),
    null,
  );
  for (const traversalMode of ["secured", "trolley", undefined]) {
    assert.equal(
      residents.getReaction({ ...valid, traversalMode }, "complete"),
      null,
    );
  }

  for (const h of [0.4, -0.4]) {
    assert.ok(residents.getReaction({ ...valid, height: h }, "available"));
  }
  for (const h of [0.41, -0.41]) {
    assert.equal(
      residents.getReaction({ ...valid, height: h }, "available"),
      null,
    );
  }

  assert.ok(
    residents.getReaction({ ...valid, y: nia.sampleState.y + 3 }, "isolated"),
  );
  assert.equal(
    residents.getReaction({ ...valid, y: nia.sampleState.y + 3.01 }, "isolated"),
    null,
  );

  assert.ok(
    residents.getReaction(
      { ...valid, theta: baseTheta + Math.PI * 2 + 2.99 / RADIUS },
      "replaced",
    ),
  );
  assert.equal(
    residents.getReaction(
      { ...valid, theta: baseTheta + Math.PI * 2 + 3.01 / RADIUS },
      "replaced",
    ),
    null,
  );
  assert.equal(
    residents.getReaction(
      { ...valid, theta: baseTheta + Math.PI },
      "replaced",
    ),
    null,
  );
});
