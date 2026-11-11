import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera } from "three";
import { createPlayer } from "../src/player.js";
import { RADIUS, EYE_HEIGHT, GRAVITY, gravityAtHeight } from "../src/habitat.js";

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
