import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Scene } from "three";
import { createResidents } from "../src/residents.js";
import { RADIUS } from "../src/habitat.js";
import { CARETAKER } from "../src/maintenance-layout.js";
import { inDistrict } from "../src/district-layout.js";
import { inCity } from "../src/city-layout.js";

test("resident limbs remain continuous across route lap boundaries with articulated gait", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const poses = [];
  scene.traverse((node) => poses.push({ node, previous: node.quaternion.clone() }));

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
      largestFrameChange = Math.max(
        largestFrameChange,
        pose.node.quaternion.angleTo(pose.previous),
      );
      pose.previous.copy(pose.node.quaternion);
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
      // Forearm gait bounds apply while walking; dwell gestures intentionally
      // flex elbows upward and are checked separately below.
      if (r.gaitWeight === 1) {
        w.minLeftForearm = Math.min(w.minLeftForearm, lf);
        w.maxLeftForearm = Math.max(w.maxLeftForearm, lf);
      }
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

test("Mara remains at her relocated interaction point during world updates", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const mara = scene.getObjectByName("caretaker-mara");
  assert.ok(inCity(CARETAKER.s, mara.position.y));
  assert.ok(Math.abs(mara.position.y - CARETAKER.y) < 1e-6);
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
  assert.ok(inDistrict(nia.sampleState.s, nia.sampleState.y));
  assert.ok(Math.abs(nia.root.position.y - nia.sampleState.y) < 1e-9);
  assert.equal(residents.getReaction({ ...initialPose, y: -230 }, "available"), null);

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

test("residents remain anchored inside their districts without offset drift across updates and dwells", () => {
  const scene = new Scene();
  const residents = createResidents(scene);
  const greenwayIds = new Set([
    "resident-promenade",
    "resident-square",
    "resident-glasshouse",
    "resident-orchard",
    "resident-canal",
  ]);
  const meridianIds = new Set([
    "caretaker-mara",
    "resident-plaza",
    "resident-lobby",
    "resident-skywalk",
    "resident-skyroom",
  ]);

  function assertAnchored(stepLabel) {
    for (const r of residents.residents) {
      const { id } = r.cfg;
      assert.ok(
        Math.abs(r.root.position.y - r.sampleState.y) < 1e-9,
        `${id} root.position.y (${r.root.position.y}) drifted from sampleState.y (${r.sampleState.y}) ${stepLabel}`,
      );
      if (greenwayIds.has(id)) {
        assert.ok(
          inDistrict(r.sampleState.s, r.root.position.y),
          `${id} must remain in relocated Greenway ${stepLabel}, got y=${r.root.position.y}`,
        );
      } else if (meridianIds.has(id)) {
        assert.ok(
          inCity(r.sampleState.s, r.root.position.y),
          `${id} must remain in relocated Meridian ${stepLabel}, got y=${r.root.position.y}`,
        );
      }
    }
  }

  assertAnchored("at initialization");
  for (let frame = 0; frame < 30 * 60; frame++) {
    residents.update(1 / 60, frame / 60);
  }
  assertAnchored("after 30s including dwells");
  for (let frame = 30 * 60; frame < 120 * 60; frame++) {
    residents.update(1 / 60, frame / 60);
  }
  assertAnchored("after 120s across lap wraps");
});

function transformSnapshot(root) {
  const values = [];
  root.traverse((node) => {
    values.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray());
  });
  return values;
}

function assertBinocularFit(actor) {
  const optics = actor.binoculars;
  if (!optics.geometry.boundingBox) optics.geometry.computeBoundingBox();
  const box = optics.geometry.boundingBox;
  const centerInOptics = (name) => {
    const mesh = actor.root.getObjectByName(name);
    assert.ok(mesh?.isMesh, `${actor.cfg.id} has its authored ${name} mesh`);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const center = mesh.geometry.boundingBox.getCenter(optics.position.clone());
    return optics.worldToLocal(mesh.localToWorld(center));
  };
  for (const side of ["left", "right"]) {
    const hand = centerInOptics(`hand-${side}`);
    assert.ok(box.distanceToPoint(hand) <= 0.055,
      `${side} hand must contact the optics throughout the scan`);
    assert.ok(side === "left" ? hand.x < -0.035 : hand.x > 0.035,
      `${side} hand must grip its own side of the optics`);
    const eye = centerInOptics(`eye-${side}`);
    const relief = box.min.y - eye.y;
    assert.ok(relief >= 0.01 && relief <= 0.08,
      `${side} eye must sit 1–8 cm behind the real rear face (got ${relief})`);
    assert.ok(eye.x >= box.min.x && eye.x <= box.max.x
      && (side === "left" ? eye.x < 0 : eye.x > 0),
    `${side} eye must align laterally with its optical aperture`);
    assert.ok(eye.z >= box.min.z && eye.z <= box.max.z,
      `${side} eye must align vertically with the optical aperture`);
  }
}

test("city dwell gestures animate existing belongings and eyes without moving planted feet", () => {
  const scene = new Scene();
  const controller = createResidents(scene);
  const city = controller.residents.filter((r) => r.dwells);
  const samples = new Map();
  for (let frame = 0; frame < 32 * 60; frame++) {
    controller.update(1 / 60, frame * 1000);
    for (const r of city) {
      if (r.dwellState !== "dwelling") continue;
      let sample = samples.get(r);
      const feet = [
        ...transformSnapshot(r.leftThigh),
        ...transformSnapshot(r.rightThigh),
        ...r.root.position.toArray(),
        ...r.heading.quaternion.toArray(),
        ...r.body.position.toArray(),
      ];
      if (!sample) {
        sample = {
          feet,
          minHead: Infinity,
          maxHead: -Infinity,
          minElbow: Infinity,
          maxElbow: -Infinity,
          minProp: Infinity,
          maxProp: -Infinity,
        };
        samples.set(r, sample);
      }
      assert.deepEqual(feet, sample.feet, `${r.cfg.id} must keep dwell feet and anchor planted`);
      sample.minHead = Math.min(sample.minHead, r.head.rotation.z);
      sample.maxHead = Math.max(sample.maxHead, r.head.rotation.z);
      sample.minElbow = Math.min(sample.minElbow, r.rightForearm.rotation.x);
      sample.maxElbow = Math.max(sample.maxElbow, r.rightForearm.rotation.x);
      const prop = r.satchel || r.briefcase || r.binoculars;
      if (prop) {
        sample.minProp = Math.min(sample.minProp, prop.rotation.x);
        sample.maxProp = Math.max(sample.maxProp, prop.rotation.x);
      }
      if (r.binoculars) assertBinocularFit(r);
    }
  }
  for (const r of city) {
    const sample = samples.get(r);
    assert.ok(sample, `${r.cfg.id} must reach its existing dwell`);
    assert.ok(sample.maxHead - sample.minHead > 0.1, `${r.cfg.id} looks across its surroundings`);
    if (r.satchel || r.briefcase) {
      assert.ok(sample.maxElbow - sample.minElbow > 0.1, `${r.cfg.id} consults belongings`);
      assert.ok(sample.maxProp - sample.minProp > 0.02, `${r.cfg.id} existing belongings move`);
    } else if (r.binoculars) {
      assert.ok(sample.maxProp - sample.minProp > 0.01, "observer adjusts viewing pitch");
    } else {
      assert.ok(sample.maxElbow - sample.minElbow > 0.015, "tourist relaxes its upper body");
    }
  }
});

test("all city upper-body channels blend continuously through dwells and route wraps", () => {
  const controller = createResidents(new Scene());
  const city = controller.residents.filter((r) => r.dwells);
  const histories = city.map((r) => ({
    r,
    states: new Set([r.dwellState]),
    distance: r.distance,
    wraps: 0,
    previous: null,
    previousState: r.dwellState,
    viewingDwells: 0,
    viewingPhases: new Set(),
  }));
  let peakChange = 0;
  let peakAngularChange = 0;
  const currentRotation = new Quaternion();
  const previousRotation = new Quaternion();
  for (let frame = 0; frame < 125 * 60; frame++) {
    controller.update(1 / 60, frame / 60);
    for (const history of histories) {
      const { r } = history;
      if (r.binoculars && r.dwellState === "dwelling") {
        assertBinocularFit(r);
        if (history.previousState !== "dwelling") history.viewingDwells++;
        history.viewingPhases.add(Math.floor(r.dwellElapsed));
      }
      history.previousState = r.dwellState;
      const pose = [
        ...transformSnapshot(r.torso),
        r.body.position.z,
      ];
      if (history.previous) {
        for (let i = 0; i < pose.length; i++) {
          // Each transform contains position (3), quaternion (4), scale (3).
          if (i % 10 === 3) {
            peakAngularChange = Math.max(peakAngularChange,
              currentRotation.fromArray(pose, i)
                .angleTo(previousRotation.fromArray(history.previous, i)));
            i += 3;
          } else {
            peakChange = Math.max(peakChange, Math.abs(pose[i] - history.previous[i]));
          }
        }
      }
      if (r.distance < history.distance) history.wraps++;
      history.distance = r.distance;
      history.previous = pose;
      history.states.add(r.dwellState);
    }
  }
  assert.ok(peakChange < 0.065, `upper-body frame discontinuity: ${peakChange}`);
  assert.ok(peakAngularChange < 0.1,
    `upper-body angular discontinuity: ${peakAngularChange} radians`);
  for (const { r, states, wraps, viewingDwells, viewingPhases } of histories) {
    assert.ok(wraps > 0, `${r.cfg.id} traverses a route wrap`);
    if (r.binoculars) {
      assert.ok(viewingDwells >= 2, "observer fit survives multiple route-loop dwells");
      for (let phase = 0; phase < r.dwells[0].duration; phase++) {
        assert.ok(viewingPhases.has(phase), `observer fit covers dwell second ${phase}`);
      }
    }
    for (const state of ["walking", "settling", "dwelling", "resuming"]) {
      assert.ok(states.has(state), `${r.cfg.id} traverses ${state}`);
    }
  }
});

test("paused residents freeze every transform regardless of external elapsed time", () => {
  const scene = new Scene();
  const controller = createResidents(scene);
  let sampledDwell = false;
  let sampledResume = false;
  for (let frame = 0; frame < 30 * 60; frame++) {
    controller.update(1 / 60, frame / 60);
    const states = controller.residents.map((r) => [
      r.distance, r.gaitPhase, r.gaitWeight, r.dwellElapsed, r.poseElapsed,
    ]);
    const before = transformSnapshot(scene);
    controller.update(0, 1e15);
    controller.update(-1, -1e15);
    controller.update(Number.NaN, Number.POSITIVE_INFINITY);
    assert.deepEqual(transformSnapshot(scene), before);
    assert.deepEqual(controller.residents.map((r) => [
      r.distance, r.gaitPhase, r.gaitWeight, r.dwellElapsed, r.poseElapsed,
    ]), states);
    sampledDwell ||= controller.residents.some((r) => r.dwellState === "dwelling");
    sampledResume ||= controller.residents.some((r) => r.dwellState === "resuming");
  }
  assert.ok(sampledDwell && sampledResume, "freeze includes active dwell and resume poses");
});
