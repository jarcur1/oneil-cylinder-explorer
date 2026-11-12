import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera } from "three";
import { createPlayer } from "../src/player.js";
import { RADIUS, EYE_HEIGHT, GRAVITY, gravityAtHeight } from "../src/habitat.js";
import {
  SPINE_THETA,
  AXIAL_HEIGHT,
  SPINE_ROOF_HEIGHT,
  ENDCAP_HUBS,
} from "../src/sunline-layout.js";

function scenario(obstacles, run, options = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), {
    pointerLockElement: null,
  });
  const player = createPlayer(new PerspectiveCamera(), new EventTarget(), {
    obstacles,
    ...options,
  });
  const state = {};
  const key = (code, down) => {
    const event = new Event(down ? "keydown" : "keyup", { cancelable: true });
    Object.assign(event, { code, key: "" });
    window.dispatchEvent(event);
  };
  const frames = (count) => {
    for (let i = 0; i < count; i++) player.update(0.05);
  };
  player.setEnabled(true);
  try {
    run({ player, key, frames, state: () => player.getState(state) });
  } finally {
    player.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

const deck = {
  theta: 0,
  y: -300,
  width: 20,
  depth: 20,
  base: 8.65,
  height: 0.35,
};

test("street pedestrians can pass beneath an elevated floor", () => {
  scenario([deck], ({ player, key, frames, state }) => {
    player.teleport({ theta: 0, y: -313, height: 0 });
    key("KeyW", true);
    frames(80);
    assert.ok(
      state().y > -289,
      "the bridge underside must not be a ground-level wall",
    );
    assert.equal(state().height, 0);
  });
});

test("fast falls land on thin elevated decks instead of skipping through", () => {
  scenario([deck], ({ player, frames, state }) => {
    player.teleport({ theta: 0, y: -300, height: 42 });
    frames(120);
    assert.equal(state().height, 9);
    assert.equal(state().grounded, true);
  });
});

test("jumping beneath a ceiling cannot push the head through it", () => {
  const ceiling = { ...deck, base: 3, height: 0.3 };
  scenario([ceiling], ({ player, key, frames, state }) => {
    player.teleport({ theta: 0, y: -300, height: 0 });
    key("Space", true);
    frames(1);
    key("Space", false);
    let highest = state().height;
    for (let frame = 0; frame < 40; frame++) {
      frames(1);
      highest = Math.max(highest, state().height);
    }
    assert.ok(highest > 0.5, "a real jump must occur");
    assert.ok(highest + EYE_HEIGHT + 0.15 <= ceiling.base + 1e-9);
    assert.equal(state().height, 0);
    assert.equal(state().grounded, true);
  });
});

test("raised rails block walking on a deck without corrupting physical speed", () => {
  const rail = {
    theta: 4 / RADIUS,
    y: -300,
    width: 0.2,
    depth: 20,
    base: 9,
    height: 1.1,
  };
  scenario([deck, rail], ({ player, key, frames, state }) => {
    player.teleport({ theta: 0, y: -300, height: 9 });
    key("KeyD", true);
    frames(2);
    assert.ok(
      Math.abs(state().speed - 7) < 0.01,
      "walking cadence must remain 7 m/s upstairs",
    );
    frames(30);
    assert.ok(state().theta * RADIUS > 3);
    const physicalClearance =
      ((4 - 0.1 - state().theta * RADIUS) * (RADIUS - state().height)) / RADIUS;
    assert.ok(Math.abs(physicalClearance - 0.45) < 1e-6);
    assert.equal(state().height, 9);
    assert.equal(state().grounded, true);
  });
});

test("a gap narrower than the physical capsule is impassable upstairs", () => {
  const floor = { ...deck, base: 41.6, height: 0.4 };
  const walls = [-0.6, 0.6].map((s) => ({
    theta: s / RADIUS,
    y: -300,
    width: 0.2,
    depth: 10,
    base: 42,
    height: 4,
  }));
  scenario([floor, ...walls], ({ player, key, frames, state }) => {
    player.teleport({ theta: 0, y: -307, height: 42 });
    key("KeyW", true);
    let furthestY = -307;
    for (let frame = 0; frame < 40; frame++) {
      frames(1);
      const pose = state();
      furthestY = Math.max(furthestY, pose.y);
      const insideDepth = pose.y > -305 && pose.y < -295;
      const outerBoundary = 0.7 + (0.45 * RADIUS) / (RADIUS - pose.height);
      assert.ok(
        !(insideDepth && Math.abs(pose.theta * RADIUS) < outerBoundary - 1e-5),
        "a capsule may go around these walls, but cannot enter their narrow corridor",
      );
    }
    assert.ok(furthestY > -306.5);
    assert.equal(state().height, 42);
  });
});

test("existing low ground-based steps remain walkable", () => {
  const step = { theta: 0, y: -300, width: 4, depth: 8, height: 0.18 };
  scenario([step], ({ player, key, frames, state }) => {
    player.teleport({ theta: 0, y: -306, height: 0 });
    key("KeyW", true);
    frames(12);
    assert.ok(state().y > -304);
    assert.equal(state().height, 0.18);
    assert.equal(state().grounded, true);
  });
});

test("gravityAtHeight computes linear radial gravity scaled from axis to underground", () => {
  assert.equal(gravityAtHeight(0), GRAVITY);
  assert.equal(gravityAtHeight(RADIUS), 0);
  assert.equal(gravityAtHeight(RADIUS + 50), 0);
  assert.equal(gravityAtHeight(-8), (GRAVITY * 188) / RADIUS);
  assert.equal(gravityAtHeight(42), (GRAVITY * 138) / RADIUS);
});

test("underground support floor bounds teleport, catches fast falls, and supports walking", () => {
  const surfaceSlab = {
    theta: 0,
    y: -300,
    width: 40,
    depth: 40,
    base: -0.6,
    height: 0.6,
  };
  scenario(
    [surfaceSlab],
    ({ player, key, frames, state }) => {
      // 1. Lower support bounds teleport minimum
      player.teleport({ theta: 0, y: -300, height: -12 });
      assert.equal(
        state().height,
        -8,
        "teleport below groundHeight is clamped to groundHeight",
      );
      assert.equal(
        state().grounded,
        true,
        "player is grounded at the outermost support floor",
      );

      // 2. Walking at underground support floor
      key("KeyW", true);
      frames(20);
      key("KeyW", false);
      assert.ok(
        state().y > -300,
        "player moves forward along the underground floor",
      );
      assert.equal(
        state().height,
        -8,
        "player remains supported at height -8 while walking",
      );
      assert.equal(state().grounded, true);

      // 3. Falling from mid-height underground lands firmly on -8 without skipping
      player.teleport({ theta: 0, y: -300, height: -2 });
      assert.equal(state().grounded, false);
      frames(60);
      assert.equal(
        state().height,
        -8,
        "falling player lands on underground groundHeight floor",
      );
      assert.equal(state().grounded, true);

      // 4. Living surface slab at maxH=0 supports walking at height 0 even when groundHeight=-8
      player.teleport({ theta: 0, y: -300, height: 0 });
      assert.equal(state().height, 0);
      assert.equal(state().grounded, true);
      key("KeyW", true);
      frames(20);
      key("KeyW", false);
      assert.equal(
        state().height,
        0,
        "surface slab prevents falling into underground when groundHeight=-8",
      );
      assert.equal(state().grounded, true);
    },
    { groundHeight: -8 },
  );
});

test("jumping beneath an underground ceiling arrests vertical velocity and prevents head penetration", () => {
  const ceiling = {
    theta: 0,
    y: -300,
    width: 20,
    depth: 20,
    base: -5.0,
    height: 0.5,
  };
  scenario(
    [ceiling],
    ({ player, key, frames, state }) => {
      player.teleport({ theta: 0, y: -300, height: -8 });
      assert.equal(state().height, -8);
      assert.equal(state().grounded, true);

      key("Space", true);
      frames(1);
      key("Space", false);

      let highest = state().height;
      for (let frame = 0; frame < 40; frame++) {
        frames(1);
        highest = Math.max(highest, state().height);
      }

      assert.ok(highest > -7.5, "player jumped off the underground floor");
      assert.ok(
        highest + EYE_HEIGHT + 0.15 <= ceiling.base + 1e-9,
        "player head must not penetrate underground ceiling",
      );
      assert.equal(state().height, -8);
      assert.equal(state().grounded, true);
    },
    { groundHeight: -8 },
  );
});

test("underground steps are climbable while taller obstacles act as impassable walls", () => {
  const step = {
    theta: 0,
    y: -300,
    width: 4,
    depth: 6,
    base: -8,
    height: 0.2,
  };
  const wall = {
    theta: 0,
    y: -290,
    width: 4,
    depth: 2,
    base: -8,
    height: 3.0,
  };
  scenario(
    [step, wall],
    ({ player, key, frames, state }) => {
      player.teleport({ theta: 0, y: -305, height: -8 });
      key("KeyW", true);

      // Walk onto step
      frames(15);
      assert.ok(state().y > -302, "player walked onto the underground step");
      assert.equal(
        state().height,
        -7.8,
        "player climbed onto the underground step",
      );
      assert.equal(state().grounded, true);

      // Continue walking toward the wall at y = -290
      frames(40);
      assert.ok(
        state().y < -291.4,
        "underground wall stops forward progress",
      );
      assert.ok(state().y > -293, "player reached the underground wall");
    },
    { groundHeight: -8 },
  );
});

test("equal launches jump lower underground and higher toward the spin axis", () => {
  function jumpAt(height, obstacles, options) {
    let result;
    scenario(
      obstacles,
      ({ player, key, frames, state }) => {
        player.teleport({ theta: 0, y: -300, height });
        const gravity = state().gravity;
        key("Space", true);
        frames(1);
        key("Space", false);
        let peak = state().height;
        let airFrames = 1;
        for (let frame = 0; frame < 50; frame++) {
          frames(1);
          peak = Math.max(peak, state().height);
          if (!state().grounded) airFrames++;
        }
        assert.equal(state().height, height, "each jump returns to its own floor");
        assert.equal(state().grounded, true);
        result = { gravity, rise: peak - height, airFrames };
      },
      options,
    );
    return result;
  }

  const underground = jumpAt(-8, [], { groundHeight: -8 });
  const surface = jumpAt(0, []);
  const skyroom = jumpAt(42, [{ ...deck, base: 41.6, height: 0.4 }]);
  assert.ok(Math.abs(underground.gravity - 10.246) < 0.01);
  assert.ok(Math.abs(surface.gravity - 9.81) < 0.01);
  assert.ok(Math.abs(skyroom.gravity - 7.521) < 0.01);
  assert.ok(underground.rise > 1, "a real unimpeded jump occurs below ground");
  assert.ok(underground.rise < surface.rise, "outward depth reduces jump height");
  assert.ok(surface.rise < skyroom.rise, "inward altitude increases jump height");
  assert.ok(underground.airFrames <= surface.airFrames);
  assert.ok(surface.airFrames < skyroom.airFrames);
});

test("secured mode clamps relative angle across PI seam and bounds Y to hub limits", () => {
  const hub = ENDCAP_HUBS[0];
  scenario([], ({ player, key, frames, state }) => {
    player.teleport(hub.landing);
    assert.equal(state().traversalMode, "secured");
    assert.equal(state().railDirection, 0);
    assert.equal(state().height, AXIAL_HEIGHT);
    assert.equal(state().grounded, true);

    // Walking across the PI seam: start near Math.PI on the positive side
    player.teleport({
      theta: Math.PI - 0.1,
      y: -424,
      height: AXIAL_HEIGHT,
      yaw: Math.PI / 2, // Facing +theta direction
      constraint: hub.constraint,
    });

    key("KeyW", true);
    frames(10); // 10 * 0.05s * 3m/s = 1.5m at radius 10 = 0.15rad -> crosses Math.PI
    assert.ok(
      state().theta < 0,
      "theta seamlessly wrapped across PI seam to negative angle",
    );
    assert.equal(state().traversalMode, "secured");

    // Continue walking until hitting maxDTheta clamp (0.5 rad from Math.PI)
    frames(50);
    const expectedMaxTheta = Math.PI + 0.5 - 2 * Math.PI; // -2.64159...
    assert.ok(
      Math.abs(state().theta - expectedMaxTheta) < 0.001,
      `clamped at max relative angle: got ${state().theta}, expected ${expectedMaxTheta}`,
    );

    // Reverse direction and walk past Math.PI all the way to minDTheta (-0.5 rad from Math.PI)
    key("KeyW", false);
    key("KeyS", true);
    frames(100);
    const expectedMinTheta = Math.PI - 0.5; // 2.64159...
    assert.ok(
      Math.abs(state().theta - expectedMinTheta) < 0.001,
      `clamped at min relative angle: got ${state().theta}, expected ${expectedMinTheta}`,
    );
    key("KeyS", false);

    // Face +Y and walk forward toward maxY limit (-413)
    player.teleport({
      theta: SPINE_THETA,
      y: -424,
      height: AXIAL_HEIGHT,
      yaw: 0,
      constraint: hub.constraint,
    });
    key("KeyW", true);
    frames(100);
    assert.ok(
      Math.abs(state().y - hub.constraint.maxY) < 0.001,
      `clamped at maxY: got ${state().y}, expected ${hub.constraint.maxY}`,
    );
    key("KeyW", false);

    // Face -Y and walk forward toward minY limit (-429)
    player.teleport({
      theta: SPINE_THETA,
      y: -424,
      height: AXIAL_HEIGHT,
      yaw: Math.PI,
      constraint: hub.constraint,
    });
    key("KeyW", true);
    frames(100);
    assert.ok(
      Math.abs(state().y - hub.constraint.minY) < 0.001,
      `clamped at minY: got ${state().y}, expected ${hub.constraint.minY}`,
    );
  });
});

test("secured mode preserves obstacle collision and ignores jump and sprint", () => {
  const hub = ENDCAP_HUBS[0];
  const hubWall = {
    theta: SPINE_THETA,
    y: -420,
    width: 3,
    depth: 2,
    base: AXIAL_HEIGHT - 0.5,
    height: 3,
  };
  scenario([hubWall], ({ player, key, frames, state }) => {
    player.teleport({
      theta: SPINE_THETA,
      y: -425,
      height: AXIAL_HEIGHT,
      yaw: 0,
      constraint: hub.constraint,
    });

    // Walk forward into wall at y = -420 (half-depth 1.0, player radius 0.45)
    key("KeyW", true);
    frames(60);
    assert.ok(
      state().y < -421.4,
      `obstacle blocked progress: got y=${state().y}`,
    );
    assert.ok(state().y > -422.5, "player reached obstacle wall");

    // Jump should be ignored in secured mode: height must remain pinned
    key("Space", true);
    frames(30);
    assert.equal(
      state().height,
      AXIAL_HEIGHT,
      "height remains pinned on jump attempt",
    );
    assert.equal(state().grounded, true);
    key("Space", false);

    // Sprint should be ignored in secured mode: physical speed remains activeConstraint.speed (3.0)
    key("KeyW", false);
    player.teleport({
      theta: SPINE_THETA,
      y: -426,
      height: AXIAL_HEIGHT,
      yaw: 0,
      constraint: hub.constraint,
    });
    key("KeyW", true);
    key("ShiftLeft", true);
    frames(2);
    assert.ok(
      Math.abs(state().speed - 3.0) < 0.01,
      `speed must be 3.0 (sprint ignored in secured mode), got ${state().speed}`,
    );
  });
});

test("trolley mode drives rail-authoritatively with independent look, ignoring strafe, jump, sprint, and obstacles", () => {
  const hubA = ENDCAP_HUBS[0];
  const railObstacle = {
    theta: SPINE_THETA,
    y: -300,
    width: 4,
    depth: 4,
    base: AXIAL_HEIGHT - 1,
    height: 4,
  };
  scenario([railObstacle], ({ player, key, frames, state }) => {
    player.teleport(hubA.trolley);
    assert.equal(state().traversalMode, "trolley");
    assert.equal(state().railDirection, 1);
    assert.equal(state().height, AXIAL_HEIGHT);
    assert.equal(state().grounded, true);

    // Independent look: rotate camera with arrow keys
    key("ArrowLeft", true);
    frames(10);
    key("ArrowLeft", false);

    // Drive forward with W: movement is strictly along +Y (direction: 1), unaffected by yaw
    key("KeyW", true);
    frames(20);
    assert.ok(state().y > -410 + 15, "trolley drove forward along +Y");
    assert.ok(
      Math.abs(Math.sin(state().theta - SPINE_THETA)) < 1e-6,
      "theta stays fixed on rail",
    );
    assert.ok(
      Math.abs(state().speed - 18) < 0.01,
      "trolley moves at rail speed 18",
    );

    // Strafe (A/D) must be ignored
    key("KeyW", false);
    const yStationary = state().y;
    key("KeyA", true);
    key("KeyD", true);
    frames(20);
    key("KeyA", false);
    key("KeyD", false);
    assert.equal(state().y, yStationary, "strafe input ignored on trolley");
    assert.ok(Math.abs(Math.sin(state().theta - SPINE_THETA)) < 1e-6);

    // Jump and sprint must be ignored while driving
    key("KeyW", true);
    key("Space", true);
    key("ShiftLeft", true);
    frames(2);
    assert.equal(state().height, AXIAL_HEIGHT, "jump ignored on trolley");
    assert.equal(state().grounded, true);
    assert.ok(
      Math.abs(state().speed - 18) < 0.01,
      "sprint ignored on trolley",
    );
    key("KeyW", false);
    key("Space", false);
    key("ShiftLeft", false);

    // Rail-authoritative traversal passes through ordinary obstacle collisions without stopping
    player.teleport({
      theta: SPINE_THETA,
      y: -305,
      height: AXIAL_HEIGHT,
      constraint: hubA.trolley.constraint,
    });
    key("KeyW", true);
    frames(10); // 10 * 0.05 * 18 = 9m -> from -305 to -296, through obstacle at -300
    assert.ok(
      state().y > -298,
      `rail-authoritative movement must skip ordinary obstacle collision: y=${state().y}`,
    );
  });
});

test("trolley direction property drives forward/reverse correctly and hard-clamps at rail endpoints", () => {
  const hubA = ENDCAP_HUBS[0]; // direction: 1
  const hubB = ENDCAP_HUBS[1]; // direction: -1
  scenario([], ({ player, key, frames, state }) => {
    // Endcap A: direction 1 -> W drives toward +Y, S reverses toward -Y
    player.teleport({
      theta: SPINE_THETA,
      y: 405,
      height: AXIAL_HEIGHT,
      constraint: hubA.trolley.constraint,
    });
    assert.equal(state().railDirection, 1);
    key("KeyW", true);
    frames(20); // tries to travel past 410
    assert.equal(state().y, 410, "hard-clamped at maxY endpoint 410");
    assert.equal(state().speed, 0, "speed zero when clamped at rail endpoint");

    key("KeyW", false);
    key("KeyS", true); // reverse back toward -Y
    frames(10);
    assert.ok(state().y < 405, "reverse drives backward along Y");
    key("KeyS", false);

    // Endcap B: direction -1 -> W drives toward -Y, S reverses toward +Y
    player.teleport(hubB.trolley);
    assert.equal(state().railDirection, -1);
    assert.equal(state().y, 410);

    key("KeyW", true);
    frames(10);
    assert.ok(
      state().y < 410,
      "W drives in -Y direction when trolley direction is -1",
    );
    key("KeyW", false);

    // Hard clamp at minY endpoint (-410)
    player.teleport({
      theta: SPINE_THETA,
      y: -405,
      height: AXIAL_HEIGHT,
      constraint: hubB.trolley.constraint,
    });
    key("KeyW", true); // drives toward -Y
    frames(20);
    assert.equal(state().y, -410, "hard-clamped at minY endpoint -410");
    assert.equal(state().speed, 0, "speed zero at minY rail endpoint");
  });
});

test("pause clears keys while retaining constraint, and reset or ordinary teleport clears mode", () => {
  const hub = ENDCAP_HUBS[0];
  scenario([], ({ player, key, frames, state }) => {
    player.teleport(hub.landing);
    assert.equal(state().traversalMode, "secured");

    key("KeyW", true);
    frames(5);
    const yBeforePause = state().y;

    // Pause clears input and stops motion
    player.setEnabled(false);
    frames(10);
    assert.equal(state().y, yBeforePause, "no motion while paused");
    assert.equal(state().speed, 0, "speed is 0 while paused");
    assert.equal(
      state().traversalMode,
      "secured",
      "constraint retained across pause",
    );

    // Resume without new key press: inputs were cleared so no motion resumes
    player.setEnabled(true);
    frames(10);
    assert.equal(
      state().y,
      yBeforePause,
      "motion does not resume until fresh key press",
    );
    assert.equal(state().speed, 0);

    // reset() clears constraint and returns to spawn in walk mode
    player.reset();
    assert.equal(state().traversalMode, "walk");
    assert.equal(state().railDirection, 0);
    assert.equal(state().height, 0);

    // Ordinary teleport without constraint clears trolley mode to walk
    player.teleport(hub.trolley);
    assert.equal(state().traversalMode, "trolley");
    assert.equal(state().railDirection, 1);
    player.teleport({ theta: 0, y: -300, height: 0 });
    assert.equal(state().traversalMode, "walk");
    assert.equal(state().railDirection, 0);
  });
});

test("invalid constraint throws atomically before mutating player state", () => {
  scenario([], ({ player, state }) => {
    player.teleport({ theta: 0.5, y: -100, height: 0, yaw: 0.25 });
    const baseline = { ...state() };
    assert.equal(baseline.traversalMode, "walk");

    const invalidConstraints = [
      { mode: "invalid" },
      {
        mode: "secured",
        height: NaN,
        theta: Math.PI,
        speed: 3,
        minY: -429,
        maxY: -413,
        minDTheta: -0.5,
        maxDTheta: 0.5,
      },
      {
        mode: "secured",
        height: 180,
        theta: Math.PI,
        speed: 3,
        minY: -429,
        maxY: -413,
        minDTheta: -0.5,
        maxDTheta: 0.5,
      },
      {
        mode: "secured",
        height: -1,
        theta: Math.PI,
        speed: 3,
        minY: -429,
        maxY: -413,
        minDTheta: -0.5,
        maxDTheta: 0.5,
      },
      {
        mode: "secured",
        height: 170,
        theta: Math.PI,
        speed: 0,
        minY: -429,
        maxY: -413,
        minDTheta: -0.5,
        maxDTheta: 0.5,
      },
      {
        mode: "secured",
        height: 170,
        theta: Math.PI,
        speed: 3,
        minY: -500,
        maxY: 0,
        minDTheta: -0.5,
        maxDTheta: 0.5,
      },
      {
        mode: "secured",
        height: 170,
        theta: Math.PI,
        speed: 3,
        minY: 10,
        maxY: 5,
        minDTheta: -0.5,
        maxDTheta: 0.5,
      },
      {
        mode: "secured",
        height: 170,
        theta: Math.PI,
        speed: 3,
        minY: -429,
        maxY: -413,
        minDTheta: -4,
        maxDTheta: 0.5,
      },
      {
        mode: "secured",
        height: 170,
        theta: Math.PI,
        speed: 3,
        minY: -429,
        maxY: -413,
        minDTheta: 0.5,
        maxDTheta: -0.5,
      },
      {
        mode: "trolley",
        height: 170,
        theta: Math.PI,
        speed: 18,
        minY: -410,
        maxY: 410,
        direction: 0,
      },
      {
        mode: "trolley",
        height: 170,
        theta: Math.PI,
        speed: 18,
        minY: -410,
        maxY: 410,
        direction: 2,
      },
      "not-an-object",
    ];

    for (const c of invalidConstraints) {
      assert.throws(
        () =>
          player.teleport({
            theta: 1.5,
            y: 200,
            height: 50,
            yaw: 1.0,
            constraint: c,
          }),
        /Invalid constraint/,
      );
      assert.equal(
        state().theta,
        baseline.theta,
        "theta must not mutate on invalid constraint",
      );
      assert.equal(
        state().y,
        baseline.y,
        "y must not mutate on invalid constraint",
      );
      assert.equal(
        state().height,
        baseline.height,
        "height must not mutate on invalid constraint",
      );
      assert.equal(state().traversalMode, baseline.traversalMode);
      assert.equal(state().railDirection, baseline.railDirection);
    }
  });
});

test("fallback walk at h170 under roof174.5 cannot cross axis", () => {
  const roof = {
    theta: SPINE_THETA,
    y: -420,
    width: 20,
    depth: 20,
    base: SPINE_ROOF_HEIGHT, // 174.5
    height: 1.0,
  };
  const floor = {
    theta: SPINE_THETA,
    y: -420,
    width: 20,
    depth: 20,
    base: AXIAL_HEIGHT - 0.6,
    height: 0.6, // top is 170
  };
  scenario([floor, roof], ({ player, key, frames, state }) => {
    player.teleport({ theta: SPINE_THETA, y: -420, height: AXIAL_HEIGHT });
    assert.equal(state().traversalMode, "walk");
    assert.equal(state().height, AXIAL_HEIGHT);
    assert.equal(state().grounded, true);

    // Launch maximum jump in low gravity near axis
    key("Space", true);
    frames(1);
    key("Space", false);

    let peak = state().height;
    for (let frame = 0; frame < 160 && !state().grounded; frame++) {
      frames(1);
      peak = Math.max(peak, state().height);
    }

    // Body height is EYE_HEIGHT + 0.15 = 1.85, arresting at roof.base - 1.85 = 172.65
    assert.ok(
      peak <= SPINE_ROOF_HEIGHT - (EYE_HEIGHT + 0.15) + 1e-9,
      `peak jump ${peak} arrested by ceiling at ${SPINE_ROOF_HEIGHT}`,
    );
    assert.ok(
      peak < RADIUS,
      "jump cannot penetrate roof to cross axis at RADIUS 180",
    );
    assert.equal(state().height, AXIAL_HEIGHT, "player lands back on axial floor");
    assert.equal(state().grounded, true);
  });
});

test("out-of-range teleport resolves support after clamping its position", () => {
  const boundaryDeck = { ...deck, y: 440, depth: 20 };
  scenario([boundaryDeck], ({ player, state }) => {
    player.teleport({ theta: 0, y: 10000, height: 9 });
    assert.equal(state().height, 9);
    assert.equal(state().grounded, true);
  });
});
