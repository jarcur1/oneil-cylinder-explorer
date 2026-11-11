import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera } from "three";
import { createPlayer } from "../src/player.js";
import { RADIUS, EYE_HEIGHT } from "../src/habitat.js";

function scenario(obstacles, run) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), {
    pointerLockElement: null,
  });
  const player = createPlayer(new PerspectiveCamera(), new EventTarget(), {
    obstacles,
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
