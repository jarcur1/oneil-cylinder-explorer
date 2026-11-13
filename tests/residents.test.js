import test from "node:test";
import assert from "node:assert/strict";
import { Scene } from "three";
import { createResidents } from "../src/residents.js";
import { RADIUS } from "../src/habitat.js";

test("resident limbs remain continuous across route lap boundaries with articulated gait", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const poses = [];
  scene.traverse((node) => poses.push({ node, previous: node.rotation.x }));

  const walkers = residents.residents
    .filter((r) => !r.isStatic)
    .map((r) => ({
      r,
      prevDist: r.distance,
      wrapped: false,
      minLeftThigh: Infinity,
      maxLeftThigh: -Infinity,
      minRightThigh: Infinity,
      maxRightThigh: -Infinity,
      minLeftShin: Infinity,
      maxLeftShin: -Infinity,
      minRightShin: Infinity,
      maxRightShin: -Infinity,
      minLeftArm: Infinity,
      maxLeftArm: -Infinity,
      minRightArm: Infinity,
      maxRightArm: -Infinity,
      minLeftForearm: Infinity,
      maxLeftForearm: -Infinity,
      maxBodyBob: 0,
      minTorsoTwist: Infinity,
      maxTorsoTwist: -Infinity,
      sawCounterPhase: false,
      sawOppositeLegs: false,
    }));
  const staticResidents = residents.residents.filter((r) => r.isStatic);

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
    for (const w of walkers) {
      const { r } = w;
      if (r.distance < w.prevDist) w.wrapped = true;
      w.prevDist = r.distance;

      const lt = r.leftThigh.rotation.x;
      const rt = r.rightThigh.rotation.x;
      const ls = r.leftShin.rotation.x;
      const rs = r.rightShin.rotation.x;
      const la = r.leftArm.rotation.x;
      const ra = r.rightArm.rotation.x;
      const lf = r.leftForearm.rotation.x;

      w.minLeftThigh = Math.min(w.minLeftThigh, lt);
      w.maxLeftThigh = Math.max(w.maxLeftThigh, lt);
      w.minRightThigh = Math.min(w.minRightThigh, rt);
      w.maxRightThigh = Math.max(w.maxRightThigh, rt);
      w.minLeftShin = Math.min(w.minLeftShin, ls);
      w.maxLeftShin = Math.max(w.maxLeftShin, ls);
      w.minRightShin = Math.min(w.minRightShin, rs);
      w.maxRightShin = Math.max(w.maxRightShin, rs);
      w.minLeftArm = Math.min(w.minLeftArm, la);
      w.maxLeftArm = Math.max(w.maxLeftArm, la);
      w.minRightArm = Math.min(w.minRightArm, ra);
      w.maxRightArm = Math.max(w.maxRightArm, ra);
      w.minLeftForearm = Math.min(w.minLeftForearm, lf);
      w.maxLeftForearm = Math.max(w.maxLeftForearm, lf);
      w.maxBodyBob = Math.max(w.maxBodyBob, r.body.position.z);
      w.minTorsoTwist = Math.min(w.minTorsoTwist, r.torso.rotation.z);
      w.maxTorsoTwist = Math.max(w.maxTorsoTwist, r.torso.rotation.z);

      if (lt > 0.25 && rt < -0.25) w.sawOppositeLegs = true;
      if (lt > 0.25 && la < -0.18 && ra > 0.18) w.sawCounterPhase = true;
    }
    for (const s of staticResidents) {
      assert.equal(s.leftThigh.rotation.x, 0);
      assert.equal(s.rightThigh.rotation.x, 0);
      assert.equal(s.leftShin.rotation.x, 0);
      assert.equal(s.leftForearm.rotation.x, -0.18);
    }
  }

  assert.ok(
    largestFrameChange < 0.1,
    `Visible limb snap: ${largestFrameChange.toFixed(3)} radians in one 60 Hz frame`,
  );
  assert.ok(walkers.length > 0);
  for (const w of walkers) {
    const id = w.r.cfg.id;
    assert.ok(w.wrapped, `${id} must cross a route lap wrap boundary`);
    assert.ok(w.maxLeftThigh > 0.35 && w.minLeftThigh < -0.35, `${id} left thigh full swing`);
    assert.ok(w.maxRightThigh > 0.35 && w.minRightThigh < -0.35, `${id} right thigh full swing`);
    assert.ok(w.sawOppositeLegs, `${id} thighs swing in opposition`);
    assert.ok(w.maxLeftShin <= 1e-9 && w.minLeftShin < -0.55, `${id} left shin bends backward only`);
    assert.ok(w.maxRightShin <= 1e-9 && w.minRightShin < -0.55, `${id} right shin bends backward only`);
    assert.ok(w.maxLeftArm > 0.25 && w.minLeftArm < -0.25, `${id} left arm swings`);
    assert.ok(w.maxRightArm > 0.25 && w.minRightArm < -0.25, `${id} right arm swings`);
    assert.ok(w.sawCounterPhase, `${id} arms swing counter-phase to legs`);
    assert.ok(w.maxLeftForearm <= -0.18 + 1e-9 && w.minLeftForearm < -0.28, `${id} forearm flexes from -0.18`);
    assert.ok(w.maxBodyBob > 0.025, `${id} body bobs vertically during stride`);
    assert.ok(w.maxTorsoTwist > 0.03 && w.minTorsoTwist < -0.03, `${id} torso counter-rotates`);
  }
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
  let peakWalkingSwing = 0;
  let peakResumedSwing = 0;
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
      const swingMag = Math.abs(actor.leftThigh.rotation.x);
      if (sawPause) {
        peakResumedSwing = Math.max(peakResumedSwing, swingMag);
        if (peakResumedSwing > 0.25) {
          sawResume = true;
          break;
        }
      } else {
        peakWalkingSwing = Math.max(peakWalkingSwing, swingMag);
      }
      stoppedFrames = 0;
    }
    previous.copy(actor.root.position);
    previousLegAngle = actor.leftThigh.rotation.x;
  }
  assert.ok(peakWalkingSwing > 0.25, "Visitor must have nonzero gait before pausing");
  assert.ok(sawPause, "Visitor must actually stop at the viewpoint");
  assert.ok(
    largestRestingChange < 1e-4,
    "Legs must settle rather than walking in place",
  );
  assert.ok(sawResume, "Visitor must resume walking with active gait after resting");
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
