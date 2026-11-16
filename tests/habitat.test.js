import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Scene } from "three";
import {
  RADIUS,
  LENGTH,
  EYE_HEIGHT,
  SPAWN,
  VIEW_DISTANCE,
  MERIDIAN_PLACEMENT,
  gravityAtHeight,
} from "../src/habitat.js";
import {
  DISTRICT_BOUNDS,
  DISTRICT_STOPS,
  inDistrict,
} from "../src/district-layout.js";
import {
  CITY_BOUNDS,
  CITY_ARRIVAL,
  CITY_STOPS,
  MAIN_LIFT,
  SKYWALK_LIFT,
  SKYWALK_HEIGHT,
  TOWER,
  inCity,
} from "../src/city-layout.js";
import {
  SERVICE_FLOOR,
  SERVICE_ACCESS,
  SERVICE_BOUNDS,
  SERVICE_STOPS,
  inServiceLevel,
} from "../src/service-layout.js";
import { DELIVERY_STATIONS } from "../src/delivery-layout.js";
import { CARETAKER, VENTILATION_UNIT } from "../src/maintenance-layout.js";
import {
  AXIAL_HEIGHT,
  ENDCAP_HUBS,
  SUNLINE_PANEL,
  SUNLINE_TRACK_MIN_Y,
  SUNLINE_TRACK_MAX_Y,
  getAxialHub,
} from "../src/sunline-layout.js";
import { LANDMARKS } from "../src/landmarks.js";
import { createPlayer } from "../src/player.js";
import { createSunlineState } from "../src/sunline-state.js";
import { getSunlineTransfer } from "../src/sunline-transit.js";
import { getCityLift } from "../src/city-transit.js";
import { createMaintenanceState } from "../src/maintenance-state.js";
import { createResidents } from "../src/residents.js";
import { createSaveStore } from "../src/save-game.js";

function scenario(obstacles, run, options = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), {
    pointerLockElement: null,
  });
  const camera = new PerspectiveCamera();
  const player = createPlayer(camera, new EventTarget(), {
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
    run({ player, camera, key, frames, state: () => player.getState(state) });
  } finally {
    player.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

const globalDeck = {
  theta: 0,
  y: 0,
  width: Math.PI * 2 * RADIUS,
  depth: LENGTH,
  base: -0.6,
  height: 0.6,
};

test("expanded radius keeps 1g at the surface and halves gravity at fixed 180m height", () => {
  const deckAt180m = {
    theta: 0,
    y: SPAWN.y,
    width: 30,
    depth: 30,
    base: 180 - 0.5,
    height: 0.5,
  };

  function jumpRiseAt(pose, obstacles) {
    let result;
    scenario(
      obstacles,
      ({ player, camera, key, frames, state }) => {
        player.teleport(pose);
        const startRadial = Math.hypot(camera.position.x, camera.position.z);
        const g = state().gravity;
        key("Space", true);
        frames(1);
        key("Space", false);
        let peak = state().height;
        for (let i = 0; i < 80; i++) {
          frames(1);
          peak = Math.max(peak, state().height);
        }
        assert.equal(state().height, pose.height);
        assert.equal(state().grounded, true);
        result = { gravity: g, rise: peak - pose.height, startRadial };
      },
      { groundHeight: SERVICE_FLOOR },
    );
    return result;
  }

  const surface = jumpRiseAt({ theta: 0, y: SPAWN.y, height: 0 }, [globalDeck]);
  const midCylinder = jumpRiseAt(
    { theta: 0, y: SPAWN.y, height: 180 },
    [globalDeck, deckAt180m],
  );

  assert.equal(surface.gravity, 9.81);
  assert.ok(Math.abs(midCylinder.gravity - 9.81 * 0.5) < 1e-9);
  assert.equal(gravityAtHeight(360), 0);
  // Old 180m height is now half-radius (0.5g), not weightless axis; jump rises ~2x surface rise.
  assert.ok(midCylinder.rise > surface.rise * 1.8);
  assert.ok(midCylinder.rise < surface.rise * 2.3);
  assert.ok(Math.abs(surface.startRadial - (360 - EYE_HEIGHT)) < 1e-6);
  assert.ok(Math.abs(midCylinder.startRadial - (180 - EYE_HEIGHT)) < 1e-6);
});

test("districts are separated along the expanded cylinder with stable landmark IDs and camera far plane", () => {
  assert.ok(
    CITY_BOUNDS.minY - DISTRICT_BOUNDS.maxY > 500,
    "Greenway and Meridian must be separated by a broad open promenade",
  );
  assert.ok(SPAWN.y < -450, "SPAWN sits beyond old -450m habitat limit");
  assert.ok(SPAWN.y < DISTRICT_BOUNDS.minY, "SPAWN approaches Greenway from the south");
  assert.equal(inDistrict(SPAWN.theta * RADIUS, SPAWN.y), false);
  assert.equal(inCity(SPAWN.theta * RADIUS, SPAWN.y), false);

  assert.ok(SERVICE_BOUNDS.minY >= CITY_BOUNDS.minY);
  assert.ok(SERVICE_BOUNDS.maxY <= CITY_BOUNDS.maxY);
  assert.equal(inServiceLevel(SERVICE_ACCESS.theta * RADIUS, SERVICE_ACCESS.y, 0), false);
  assert.equal(inServiceLevel(SERVICE_ACCESS.theta * RADIUS, SERVICE_ACCESS.y, -0.5), false);
  assert.equal(inServiceLevel(SERVICE_ACCESS.theta * RADIUS, SERVICE_ACCESS.y, SERVICE_FLOOR), true);

  assert.ok(
    VIEW_DISTANCE > Math.hypot(LENGTH, RADIUS * 2),
    "VIEW_DISTANCE must clear the full endcap-to-endcap diagonal",
  );

  const expectedIds = [
    "greenway-market",
    "greenway-glasshouse",
    "greenway-overlook",
    "meridian-plaza",
    "civic-lobby",
    "skyroom",
    "meridian-water-plant",
    "meridian-power-room",
    "endcap-a-hub",
    "endcap-b-hub",
    "sunline-module-02",
  ];
  assert.deepEqual(
    LANDMARKS.map((stop) => stop.id),
    expectedIds,
  );
  for (const stop of LANDMARKS) {
    assert.ok(
      stop.y >= -LENGTH / 2 + 4 && stop.y <= LENGTH / 2 - 4,
      `Landmark ${stop.id} y=${stop.y} must be inside walkable cylinder bounds`,
    );
  }

  const backing = new Map();
  const mockStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
  };
  const store = createSaveStore(() => mockStorage);
  assert.equal(
    store.save({
      discoveries: expectedIds,
      deliveryPhase: "complete",
      maintenancePhase: "complete",
      sunlinePhase: "complete",
      muted: false,
    }),
    true,
  );
  const loaded = store.load(expectedIds);
  assert.deepEqual(loaded.discoveries, expectedIds);
  assert.equal(store.getStatus().recovered, false);
});

test("remote endcap and full-length trolley traversal operate beyond old cylinder bounds", () => {
  const hubA = ENDCAP_HUBS[0];
  const hubB = ENDCAP_HUBS[1];
  const sunline = createSunlineState();

  scenario([globalDeck], ({ player, camera, key, frames, state }) => {
    player.reset();
    assert.equal(state().y, SPAWN.y);
    assert.equal(state().height, 0);
    assert.equal(state().grounded, true);

    // Board radial lift at remote Endcap A beyond old -450m limit
    player.teleport(hubA.rim);
    assert.ok(state().y < -450);
    const toHubA = getSunlineTransfer(state());
    assert.ok(toHubA);
    player.teleport(toHubA.destination);
    assert.equal(state().traversalMode, "secured");
    assert.equal(state().height, AXIAL_HEIGHT);
    assert.ok(Math.abs(Math.hypot(camera.position.x, camera.position.z) - (RADIUS - AXIAL_HEIGHT - EYE_HEIGHT)) < 1e-6);

    // Isolate SL-02 at Endcap A console
    player.teleport({ ...hubA.control, constraint: hubA.constraint });
    assert.equal(sunline.interact(state()).changed, true);
    assert.equal(sunline.getPhase(), "isolated");

    // Board trolley at Endcap A dock and drive across the 1800m spine to SL-02 and Endcap B
    player.teleport({ ...hubA.dock, constraint: hubA.constraint });
    const board = getSunlineTransfer(state());
    assert.ok(board);
    player.teleport(board.destination);
    assert.equal(state().traversalMode, "trolley");
    assert.equal(state().y, SUNLINE_TRACK_MIN_Y);

    key("KeyW", true);
    let reachedPanel = false;
    for (let i = 0; i < 600; i++) {
      frames(1);
      if (Math.abs(state().y - SUNLINE_PANEL.y) <= 0.9) {
        reachedPanel = true;
        break;
      }
    }
    key("KeyW", false);
    assert.ok(reachedPanel, "Trolley must reach relocated SL-02 beyond old -450m bound");
    assert.equal(sunline.interact(state()).changed, true);
    assert.equal(sunline.getPhase(), "replaced");

    // Continue across old +450m bound all the way to Endcap B trolley dock
    key("KeyW", true);
    for (let i = 0; i < 2000 && state().y < SUNLINE_TRACK_MAX_Y; i++) {
      frames(1);
    }
    key("KeyW", false);
    assert.equal(state().y, SUNLINE_TRACK_MAX_Y);

    const disembark = getSunlineTransfer(state());
    assert.ok(disembark);
    player.teleport(disembark.destination);
    assert.equal(state().traversalMode, "secured");

    // Restore SL-02 at Endcap B console and descend to remote Endcap B rim
    player.teleport({ ...hubB.control, constraint: hubB.constraint });
    assert.equal(sunline.interact(state()).changed, true);
    assert.equal(sunline.getPhase(), "complete");

    player.teleport({ ...hubB.landing, constraint: hubB.constraint });
    const toRimB = getSunlineTransfer(state());
    assert.ok(toRimB);
    player.teleport(toRimB.destination);
    assert.equal(state().traversalMode, "walk");
    assert.equal(state().height, 0);
    assert.equal(state().grounded, true);
    assert.ok(state().y > 450);
  }, { groundHeight: SERVICE_FLOOR });
});

test("relocation placements reject old-location interactions and prevent world-anchor drift", () => {
  // Delivery stations and Greenway stops sit in relocated Greenway and reject old local Y
  assert.equal(inDistrict(0, -230), false);
  assert.equal(DISTRICT_STOPS[0].y, -450);
  assert.equal(inDistrict(DISTRICT_STOPS[0].theta * RADIUS, DISTRICT_STOPS[0].y), true);
  assert.ok(DELIVERY_STATIONS.pickup.y < -450);
  assert.equal(inDistrict(DELIVERY_STATIONS.pickup.s, DELIVERY_STATIONS.pickup.y), true);
  assert.equal(inDistrict(DELIVERY_STATIONS.dropoff.s, DELIVERY_STATIONS.dropoff.y), true);

  // Meridian arrival, lifts, and service stops reject old authored Y and stay inside relocated Meridian
  assert.equal(inCity(0, -5), false);
  assert.equal(CITY_STOPS[0].y, 450);
  assert.equal(inCity(CITY_ARRIVAL.theta * RADIUS, CITY_ARRIVAL.y), true);
  assert.equal(inCity(CITY_STOPS[0].theta * RADIUS, CITY_STOPS[0].y), true);
  for (const stop of SERVICE_STOPS) {
    assert.equal(inServiceLevel(stop.theta * RADIUS, stop.y, SERVICE_FLOOR), true);
  }

  for (const oldPose of [
    { theta: MAIN_LIFT.theta, y: 35, height: 0, grounded: true },
    { theta: SKYWALK_LIFT.theta, y: 65, height: 0, grounded: true },
    { theta: SERVICE_ACCESS.theta, y: -30, height: 0, grounded: true },
    { theta: SERVICE_ACCESS.theta, y: -30, height: SERVICE_FLOOR, grounded: true },
  ]) {
    assert.equal(getCityLift(oldPose), null);
  }

  // Exercise real player transitions across relocated Meridian lifts and maintenance targets
  const meridianSupport = [
    globalDeck,
    {
      theta: 7.25 / RADIUS,
      y: MERIDIAN_PLACEMENT.toWorldY(65),
      width: 76.5,
      depth: 5.0,
      base: SKYWALK_HEIGHT - 0.35,
      height: 0.35,
    },
    {
      theta: 48 / RADIUS,
      y: MERIDIAN_PLACEMENT.toWorldY(65),
      width: 5.0,
      depth: 30.0,
      base: SKYWALK_HEIGHT - 0.35,
      height: 0.35,
    },
    {
      theta: MAIN_LIFT.theta,
      y: MAIN_LIFT.y,
      width: 24.0,
      depth: 24.0,
      base: TOWER.observationHeight - 0.4,
      height: 0.4,
    },
  ];
  const maint = createMaintenanceState("available");
  scenario(
    meridianSupport,
    ({ player, state }) => {
      player.teleport({ theta: CARETAKER.s / RADIUS, y: -5, height: 0 });
      assert.equal(maint.interact(state()), null);

      player.teleport({ theta: CARETAKER.s / RADIUS, y: CARETAKER.y, height: 0 });
      assert.equal(state().grounded, true);
      assert.equal(maint.interact(state()).changed, true);

      // Descend to relocated service level and back
      player.teleport({ ...SERVICE_ACCESS, height: 0 });
      const down = getCityLift(state());
      assert.ok(down);
      player.teleport(down.destination);
      assert.equal(state().height, SERVICE_FLOOR);
      assert.equal(state().grounded, true);
      assert.equal(inServiceLevel(state().theta * RADIUS, state().y, state().height), true);

      const up = getCityLift(state());
      assert.ok(up);
      player.teleport(up.destination);
      assert.equal(state().height, 0);
      assert.equal(state().grounded, true);

      // Ride skywalk lift beyond old +450m bound and service ventilation unit
      player.teleport({ ...SKYWALK_LIFT, height: 0 });
      const toSkywalk = getCityLift(state());
      assert.ok(toSkywalk);
      player.teleport(toSkywalk.destination);
      assert.equal(state().height, SKYWALK_HEIGHT);
      assert.equal(state().grounded, true);
      assert.ok(state().y > 450);

      player.teleport({
        theta: VENTILATION_UNIT.s / RADIUS,
        y: VENTILATION_UNIT.y,
        height: 0,
      });
      assert.equal(maint.interact(state()), null);

      player.teleport({
        theta: VENTILATION_UNIT.s / RADIUS,
        y: VENTILATION_UNIT.y,
        height: VENTILATION_UNIT.height,
      });
      assert.equal(state().grounded, true);
      assert.equal(maint.interact(state()).changed, true);
      assert.equal(maint.getPhase(), "repaired");

      // Ride tower lift to Skyroom
      player.teleport({ ...MAIN_LIFT, height: 0 });
      const toSkyroom = getCityLift(state());
      assert.ok(toSkyroom);
      player.teleport(toSkyroom.destination);
      assert.equal(state().height, TOWER.observationHeight);
      assert.equal(state().grounded, true);
    },
    { groundHeight: SERVICE_FLOOR },
  );

  // Residents match relocated world coordinates at initialization and do not drift on repeated updates
  const scene = new Scene();
  const residents = createResidents(scene);
  const nia = residents.residents.find((r) => r.cfg.id === "resident-square");
  assert.ok(nia);
  assert.equal(
    residents.getReaction(
      { theta: nia.sampleState.s / RADIUS, y: -230, height: 0, grounded: true, traversalMode: "walk" },
      "available",
    ),
    null,
  );
  assert.ok(
    residents.getReaction(
      { theta: nia.sampleState.s / RADIUS, y: nia.sampleState.y, height: 0, grounded: true, traversalMode: "walk" },
      "available",
    ),
  );
  for (let i = 0; i < 600; i++) residents.update(1 / 60, i / 60);
  assert.equal(getAxialHub({ theta: Math.PI, y: -422, height: AXIAL_HEIGHT }), null);
  assert.ok(Math.abs(nia.root.position.y - nia.sampleState.y) < 1e-9);
});
