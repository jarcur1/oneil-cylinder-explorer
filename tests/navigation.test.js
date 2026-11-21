import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Scene } from "three";
import { RADIUS, LENGTH } from "../src/habitat.js";
import { horizontalDistance, spatialDistance } from "../src/cylinder-math.js";
import { LANDMARKS } from "../src/landmarks.js";
import { DISTRICT_STOPS } from "../src/district-layout.js";
import {
  CITY_STOPS,
  MAIN_LIFT,
  SKYWALK_LIFT,
  SKYWALK_HEIGHT,
  TOWER,
} from "../src/city-layout.js";
import { SERVICE_ACCESS, SERVICE_FLOOR, SERVICE_STOPS } from "../src/service-layout.js";
import {
  AXIAL_HEIGHT,
  ENDCAP_HUBS,
  SPINE_THETA,
  SUNLINE_PANEL,
} from "../src/sunline-layout.js";
import { CITY_LIFT_STOPS, getCityLift } from "../src/city-transit.js";
import { SUNLINE_TRANSFERS, getSunlineTransfer } from "../src/sunline-transit.js";
import { TRAM_THETA, TRAM_HEIGHT, TRAM_STOPS, STILLWATER_TRAM_STOPS, STILLWATER_TRAM_Y } from "../src/tram-layout.js";
import { DELIVERY_STATIONS, SUPPLY_STATIONS, PLANTING_STATIONS } from "../src/delivery-layout.js";
import { LIBRARY_LAYOUT, LIBRARY_TARGET } from "../src/library-layout.js";
import { createDelivery } from "../src/delivery.js";
import { createMaintenanceState } from "../src/maintenance-state.js";
import { createSunlineState } from "../src/sunline-state.js";
import { createPlayer } from "../src/player.js";
import {
  MAP_LAYERS,
  NAV_TARGETS,
  NAV_CONNECTIONS,
  getNavigationLayer,
  projectMapPoint,
  createNavigation,
} from "../src/navigation.js";

const globalDeck = {
  theta: 0,
  y: 0,
  width: RADIUS * Math.PI * 2 + 20,
  depth: LENGTH,
  base: -0.2,
  height: 0.2,
};

const skywalkDeck = {
  theta: SKYWALK_LIFT.theta,
  y: SKYWALK_LIFT.y,
  width: 80,
  depth: 40,
  base: SKYWALK_HEIGHT - 0.35,
  height: 0.35,
};

const skyroomDeck = {
  theta: MAIN_LIFT.theta,
  y: MAIN_LIFT.y,
  width: 24,
  depth: 24,
  base: TOWER.observationHeight - 0.4,
  height: 0.4,
};

const overlookDeck = {
  theta: DISTRICT_STOPS[2].theta,
  y: DISTRICT_STOPS[2].y,
  width: 16,
  depth: 16,
  base: 0,
  height: 2.16,
};

function withPlayerScenario(obstacles, run, options = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), {
    pointerLockElement: null,
    createElement(tag) {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 0,
            font: "",
            textAlign: "",
            textBaseline: "",
            fillRect() {},
            strokeRect() {},
            fillText() {},
          }),
        };
      }
      return {};
    },
  });
  const camera = new PerspectiveCamera();
  const scene = new Scene();
  const player = createPlayer(camera, new EventTarget(), {
    obstacles,
    groundHeight: SERVICE_FLOOR,
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
    run({
      player,
      camera,
      scene,
      key,
      frames,
      state: () => player.getState(state),
    });
  } finally {
    player.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test("transit descriptors and navigation static tables are canonical, unique, and readonly", () => {
  assert.equal(Object.isFrozen(CITY_LIFT_STOPS), true);
  assert.equal(Object.isFrozen(SUNLINE_TRANSFERS), true);
  assert.equal(Object.isFrozen(MAP_LAYERS), true);
  assert.equal(Object.isFrozen(NAV_TARGETS), true);
  assert.equal(Object.isFrozen(NAV_CONNECTIONS), true);

  assert.deepEqual(
    MAP_LAYERS.map((l) => l.id),
    ["surface", "service", "axial"],
  );

  for (const stop of [...CITY_LIFT_STOPS, ...SUNLINE_TRANSFERS]) {
    assert.equal(typeof stop.id, "string");
    assert.ok(stop.id.length > 0);
    assert.equal(typeof stop.name, "string");
    assert.ok(stop.name.length > 0);
    assert.equal(Object.isFrozen(stop), true);
    assert.equal(Object.isFrozen(stop.destination), true);
  }

  const targetIds = new Set();
  for (const target of NAV_TARGETS) {
    assert.equal(Object.isFrozen(target), true);
    assert.ok(!targetIds.has(target.id), `Duplicate NAV_TARGETS id: ${target.id}`);
    targetIds.add(target.id);
    assert.equal(typeof target.name, "string");
    assert.ok(Number.isFinite(target.theta));
    assert.ok(Number.isFinite(target.y));
    assert.ok(Number.isFinite(target.height));
    assert.equal(target.layer, getNavigationLayer(target.height));
  }

  // Mutations by consumers must fail on static tables
  assert.throws(() => {
    NAV_TARGETS[0].height = 999;
  }, TypeError);
  assert.throws(() => {
    NAV_CONNECTIONS[0].from.y = 123;
  }, TypeError);
  assert.throws(() => {
    CITY_LIFT_STOPS[0].destination.height = 999;
  }, TypeError);

  // Landmarks adapt true explicit floor height (not discovery minHeight)
  const overlook = NAV_TARGETS.find((t) => t.id === "greenway-overlook");
  assert.equal(overlook.height, 2.16);
  const skyroom = NAV_TARGETS.find((t) => t.id === "skyroom");
  assert.equal(skyroom.height, TOWER.observationHeight);
  const waterPlant = NAV_TARGETS.find((t) => t.id === "meridian-water-plant");
  assert.equal(waterPlant.height, SERVICE_FLOOR);
  for (const landmark of LANDMARKS) {
    const adapted = NAV_TARGETS.find((t) => t.id === landmark.id);
    assert.ok(adapted, `Missing landmark ${landmark.id}`);
    assert.equal(adapted.landmarkId, landmark.id);
    assert.equal(adapted.height, landmark.height);
  }

  // City lifts and meaningful Sunline rim/lift/dock nodes exist in NAV_TARGETS
  for (const stop of CITY_LIFT_STOPS) {
    assert.ok(targetIds.has(stop.id), `Missing city lift ${stop.id}`);
  }
  for (const stop of SUNLINE_TRANSFERS.filter((s) => s.mode !== "trolley")) {
    assert.ok(targetIds.has(stop.id), `Missing sunline transfer ${stop.id}`);
  }

  // Both lines' ground station stops exist as kind "tram" (not landmarks)
  for (const stop of [...TRAM_STOPS, ...STILLWATER_TRAM_STOPS]) {
    const target = NAV_TARGETS.find((t) => t.id === stop.id);
    assert.ok(target, `Missing tram target ${stop.id}`);
    assert.equal(target.kind, "tram");
    assert.equal(target.height, 0);
    assert.equal(target.layer, "surface");
    assert.equal(target.theta, stop.theta);
    assert.equal(target.y, stop.y);
    assert.equal(target.name, stop.name);
  }

  // Connections cover all vertical lifts + Endcap A<->B trolley link
  const trolleyLink = NAV_CONNECTIONS.find((c) => c.type === "trolley");
  assert.ok(trolleyLink);
  assert.equal(trolleyLink.from.layer, "axial");
  assert.equal(trolleyLink.to.layer, "axial");
  assert.equal(trolleyLink.from.y, ENDCAP_HUBS[0].trolley.y);
  assert.equal(trolleyLink.to.y, ENDCAP_HUBS[1].trolley.y);
  const liftLinks = NAV_CONNECTIONS.filter((c) => c.type === "lift");
  assert.equal(liftLinks.length, 5);
  const tramLinks = NAV_CONNECTIONS.filter((c) => c.type === "tram");
  assert.equal(tramLinks.length, 2);
  assert.deepEqual(new Set(tramLinks.map((link) => link.id)), new Set(["link-civilian-tram", "link-stillwater-tram"]));
  const axialLink = tramLinks.find((link) => link.id === "link-civilian-tram");
  assert.equal(axialLink.from.layer, "surface");
  assert.equal(axialLink.to.layer, "surface");
  assert.equal(axialLink.from.theta, TRAM_THETA);
  assert.equal(axialLink.to.theta, TRAM_THETA);
  assert.equal(axialLink.from.height, TRAM_HEIGHT);
  assert.equal(axialLink.to.height, TRAM_HEIGHT);
  assert.equal(axialLink.from.y, TRAM_STOPS[0].y);
  assert.equal(axialLink.to.y, TRAM_STOPS[TRAM_STOPS.length - 1].y);
  const stillwaterLink = tramLinks.find((link) => link.id === "link-stillwater-tram");
  assert.equal(stillwaterLink.from.theta, STILLWATER_TRAM_STOPS[0].trackTheta);
  assert.equal(stillwaterLink.to.theta, STILLWATER_TRAM_STOPS[1].trackTheta);
  for (const endpoint of [stillwaterLink.from, stillwaterLink.to]) {
    assert.equal(endpoint.y, STILLWATER_TRAM_Y);
    assert.equal(endpoint.height, TRAM_HEIGHT);
    assert.equal(endpoint.layer, "surface");
  }

  // Local transit selectors retain exact guards after migration
  assert.equal(
    getCityLift({ ...MAIN_LIFT, height: 0.35, grounded: true })?.id,
    "main-lift-up",
  );
  assert.equal(
    getCityLift({ ...MAIN_LIFT, height: 0.36, grounded: true }),
    null,
  );
  assert.equal(
    getCityLift({ ...MAIN_LIFT, height: 0, grounded: false }),
    null,
  );
  assert.equal(
    getSunlineTransfer({
      ...ENDCAP_HUBS[0].rim,
      grounded: true,
      traversalMode: "walk",
    })?.id,
    "endcap-a-hub-rim-lift",
  );
  assert.equal(
    getSunlineTransfer({
      ...ENDCAP_HUBS[0].rim,
      grounded: true,
      traversalMode: "secured",
    }),
    null,
  );
});

test("projection unrolls across -PI/2..3PI/2 seam, preserves Y orientation, and avoids silent clamping", () => {
  assert.equal(getNavigationLayer(-1.01), "service");
  assert.equal(getNavigationLayer(-1), "surface");
  assert.equal(getNavigationLayer(42), "surface");
  assert.equal(getNavigationLayer(AXIAL_HEIGHT - 1), "axial");
  assert.throws(() => getNavigationLayer(NaN), RangeError);

  const out = {};
  const promenade = projectMapPoint(0, 0, out);
  assert.equal(promenade, out);
  assert.ok(Math.abs(promenade.x - 0.25) < 1e-12);
  assert.ok(Math.abs(promenade.y - 0.5) < 1e-12);

  // Sunline spine around +-PI stays continuous near x=0.75, far from seam
  const plusPi = projectMapPoint(Math.PI, LENGTH / 2);
  const minusPi = projectMapPoint(-Math.PI, -LENGTH / 2);
  assert.ok(Math.abs(plusPi.x - 0.75) < 1e-12);
  assert.ok(Math.abs(minusPi.x - 0.75) < 1e-12);
  assert.equal(plusPi.y, 0);
  assert.equal(minusPi.y, 1);

  const spineLeft = projectMapPoint(SPINE_THETA - 0.25, 0);
  const spineRight = projectMapPoint(-Math.PI + 0.3, 0);
  assert.ok(Math.abs(spineRight.x - spineLeft.x - 0.55 / (Math.PI * 2)) < 1e-12);

  // Seam boundary wrapping around -PI/2 and 3PI/2
  const seamStart = projectMapPoint(-Math.PI / 2, 0);
  const seamWrap = projectMapPoint(1.5 * Math.PI, 0);
  const justPastSeam = projectMapPoint(-Math.PI / 2 + 0.01, 0);
  const justBeforeSeam = projectMapPoint(-Math.PI / 2 - 0.01, 0);
  assert.ok(Math.abs(seamStart.x) < 1e-12);
  assert.ok(Math.abs(seamWrap.x) < 1e-12);
  assert.ok(justPastSeam.x > 0 && justPastSeam.x < 0.01);
  assert.ok(justBeforeSeam.x < 1 && justBeforeSeam.x > 0.99);

  // Out-of-bounds y is not silently clamped; non-finite coordinates throw
  const beyondNorth = projectMapPoint(0, LENGTH / 2 + 90);
  assert.ok(beyondNorth.y < 0);
  assert.throws(() => projectMapPoint(NaN, 0), RangeError);
  assert.throws(() => projectMapPoint(0, Infinity), RangeError);
});

test("selection handling rejects unknown IDs safely and reuses waypoint out containers", () => {
  const nav = createNavigation();
  assert.equal(nav.getSelection(), null);
  assert.equal(nav.getWaypoint({ theta: 0, y: 0, height: 0 }, {}), null);

  const selected = nav.select({ kind: "destination", id: "skyroom" });
  assert.deepEqual(selected, { kind: "destination", id: "skyroom" });
  assert.equal(Object.isFrozen(selected), true);

  // Reject unknown/invalid selections without losing current selection
  assert.equal(nav.select({ kind: "destination", id: "unknown-stop" }), null);
  assert.equal(nav.select({ kind: "job", id: "tram" }), null);
  assert.equal(nav.select("skyroom"), null);
  assert.deepEqual(nav.getSelection(), { kind: "destination", id: "skyroom" });

  // Reusable out container preserves sub-object identities across calls
  const reusableOut = {};
  const first = nav.getWaypoint({ theta: 0, y: 0, height: 0 }, {}, reusableOut);
  assert.equal(first, reusableOut);
  const targetRef = first.target;
  const guidanceRef = first.guidance;

  const second = nav.getWaypoint(
    { theta: MAIN_LIFT.theta, y: MAIN_LIFT.y, height: TOWER.observationHeight },
    {},
    reusableOut,
  );
  assert.equal(second, reusableOut);
  assert.equal(second.target, targetRef);
  assert.equal(second.guidance, guidanceRef);
  assert.equal(second.arrived, true);

  // Missing jobViews returns null waypoint safely for a selected job
  nav.select({ kind: "job", id: "delivery" });
  assert.equal(nav.getWaypoint({ theta: 0, y: 0, height: 0 }, null), null);
  assert.equal(nav.getWaypoint({ theta: 0, y: 0, height: 0 }, {}), null);

  nav.select(null);
  assert.equal(nav.getSelection(), null);
  assert.equal(nav.getWaypoint({ theta: 0, y: 0, height: 0 }, {}, reusableOut), null);
});

test("floor-aware arrival rejects same theta/y on another floor and keeps zero-distance finite", () => {
  const nav = createNavigation();

  // Beneath Skyroom at ground lobby: horizontal distance 0, wrong floor
  nav.select({ kind: "destination", id: "skyroom" });
  const lobbyAtLift = { theta: MAIN_LIFT.theta, y: MAIN_LIFT.y, height: 0 };
  const wpSkyroom = nav.getWaypoint(lobbyAtLift, {});
  assert.equal(wpSkyroom.arrived, false);
  assert.equal(wpSkyroom.distance, 0);
  assert.equal(wpSkyroom.finalDistance, TOWER.observationHeight);
  assert.equal(wpSkyroom.guidance.height, 0);
  assert.equal(wpSkyroom.guidance.theta, MAIN_LIFT.theta);
  assert.equal(wpSkyroom.guidance.y, MAIN_LIFT.y);

  // Same theta/y on ground beneath Overlook (2.16m): wrong floor, no invented lift
  nav.select({ kind: "destination", id: "greenway-overlook" });
  const underOverlook = {
    theta: DISTRICT_STOPS[2].theta,
    y: DISTRICT_STOPS[2].y,
    height: 0,
  };
  const wpOverlookFromGround = nav.getWaypoint(underOverlook, {});
  assert.equal(wpOverlookFromGround.arrived, false);
  assert.equal(wpOverlookFromGround.guidance.height, 2.16);
  assert.equal(wpOverlookFromGround.guidance.name, "Orchard overlook");
  const onOverlook = nav.getWaypoint(
    { ...underOverlook, height: 2.16 },
    {},
  );
  assert.equal(onOverlook.arrived, true);
  assert.equal(onOverlook.distance, 0);

  // Ground above service lift return target (-8m): wrong floor
  nav.select({ kind: "destination", id: "service-lift-up" });
  const aboveService = nav.getWaypoint(
    { theta: SERVICE_ACCESS.theta, y: SERVICE_ACCESS.y, height: 0 },
    {},
  );
  assert.equal(aboveService.arrived, false);
  assert.equal(aboveService.guidance.height, 0);
  assert.equal(aboveService.guidance.theta, SERVICE_ACCESS.theta);

  // Ground directly under SL-02: wrong floor, guides to nearer endcap rim
  nav.select({ kind: "destination", id: "sunline-module-02" });
  const underModule = nav.getWaypoint(
    { theta: SPINE_THETA, y: SUNLINE_PANEL.y, height: 0 },
    {},
  );
  assert.equal(underModule.arrived, false);
  assert.equal(underModule.guidance.height, 0);
  assert.equal(underModule.guidance.y, ENDCAP_HUBS[0].rim.y);
});

test("public library guidance leads through the east entrance and rejects the closed upper floors", () => {
  const nav = createNavigation();
  const target = NAV_TARGETS.find((entry) => entry.id === LIBRARY_TARGET.id);
  assert.equal(target.kind, "public");
  assert.equal(target.landmarkId, undefined);
  assert.match(target.hint, /east portico.*central doorway/i);
  assert.match(target.hint, /ground-floor.*public.*upper archives.*closed/i);
  nav.select({ kind: "destination", id: target.id });

  const approach = nav.getWaypoint({
    theta: (LIBRARY_LAYOUT.door.s + 5) / RADIUS,
    y: target.y,
    height: 0,
    traversalMode: "walk",
  }, {});
  assert.equal(approach.arrived, false);
  assert.equal(approach.guidance.kind, "public");
  assert.equal(approach.guidance.theta, target.theta);
  assert.equal(approach.guidance.y, target.y);
  assert.equal(approach.guidance.height, LIBRARY_LAYOUT.floor);
  assert.ok(approach.distance > 8);

  const doorway = nav.getWaypoint({
    theta: (LIBRARY_LAYOUT.door.s - 2.5) / RADIUS,
    y: target.y,
    height: LIBRARY_LAYOUT.floor,
  }, {});
  assert.equal(doorway.arrived, true);
  assert.ok(doorway.finalDistance < 2);
  const tooFar = nav.getWaypoint({
    theta: target.theta,
    y: target.y + 2.1,
    height: target.height,
  }, {});
  assert.equal(tooFar.arrived, false, "uses the public entrance's 2 m range, not lift defaults");
  for (const height of [LIBRARY_LAYOUT.upperBase, 9, TOWER.observationHeight, SERVICE_FLOOR]) {
    const wrongFloor = nav.getWaypoint({ theta: target.theta, y: target.y, height }, {});
    assert.equal(wrongFloor.arrived, false, `same map position at height ${height} is not arrival`);
    assert.ok(Number.isFinite(wrongFloor.distance));
  }
  const fromSkywalk = nav.getWaypoint({
    theta: SKYWALK_LIFT.theta, y: SKYWALK_LIFT.y, height: SKYWALK_HEIGHT,
  }, {});
  assert.equal(fromSkywalk.guidance.kind, "lift");
  assert.equal(fromSkywalk.guidance.height, SKYWALK_HEIGHT);
  assert.equal(fromSkywalk.target.name, "Library reading room");
  assert.equal(nav.select({ kind: "job", id: target.id }), null, "a public room is not a fourth job");
  assert.deepEqual(nav.getSelection(), { kind: "destination", id: target.id });
});

test("cross-floor guidance exits current 9m/42m/service/axial level before entering target level", () => {
  const nav = createNavigation();

  withPlayerScenario(
    [globalDeck, skywalkDeck, skyroomDeck, overlookDeck],
    ({ player, state }) => {
      // 1. Skyroom (42m) -> Water plant (-8m): must exit 42m via main lift down BEFORE service lift
      nav.select({ kind: "destination", id: "meridian-water-plant" });
      player.teleport({ theta: MAIN_LIFT.theta, y: MAIN_LIFT.y, height: TOWER.observationHeight });
      let wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, TOWER.observationHeight);
      assert.equal(wp.guidance.y, MAIN_LIFT.y);
      const exitSkyroom = getCityLift(state());
      assert.equal(exitSkyroom?.id, "main-lift-down");
      player.teleport(exitSkyroom.destination);

      // Now at 0m: must guide to surface service pavilion lift BEFORE underground target
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, 0);
      assert.equal(wp.guidance.theta, SERVICE_ACCESS.theta);
      assert.equal(wp.guidance.y, SERVICE_ACCESS.y);

      player.teleport(SERVICE_ACCESS);
      const enterService = getCityLift(state());
      assert.equal(enterService?.id, "service-lift-down");
      player.teleport(enterService.destination);

      // Now at -8m: guides directly to water plant
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, SERVICE_FLOOR);
      assert.equal(wp.guidance.theta, SERVICE_STOPS[0].theta);
      assert.equal(wp.guidance.y, SERVICE_STOPS[0].y);

      // 2. Service (-8m) -> Skywalk (9m): must exit service via service-lift-up first
      nav.select({ kind: "destination", id: "skywalk-lift-down" });
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, SERVICE_FLOOR);
      assert.equal(wp.guidance.theta, SERVICE_ACCESS.theta);
      const exitService = getCityLift(state());
      assert.equal(exitService?.id, "service-lift-up");
      player.teleport(exitService.destination);

      // Now at 0m: guides to Skywalk up lift
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, 0);
      assert.equal(wp.guidance.theta, SKYWALK_LIFT.theta);
      assert.equal(wp.guidance.y, SKYWALK_LIFT.y);

      // 3. Skywalk (9m) -> Skyroom (42m): must exit 9m via skywalk-lift-down BEFORE main-lift-up
      player.teleport({ theta: SKYWALK_LIFT.theta, y: SKYWALK_LIFT.y, height: SKYWALK_HEIGHT });
      nav.select({ kind: "destination", id: "skyroom" });
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, SKYWALK_HEIGHT);
      assert.equal(wp.guidance.theta, SKYWALK_LIFT.theta);
      assert.equal(wp.guidance.y, SKYWALK_LIFT.y);
      const exitSkywalk = getCityLift(state());
      assert.equal(exitSkywalk?.id, "skywalk-lift-down");
      player.teleport(exitSkywalk.destination);

      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, 0);
      assert.equal(wp.guidance.theta, MAIN_LIFT.theta);

      // 4. Surface near Endcap B -> SL-02 -> return to Meridian Plaza
      nav.select({ kind: "destination", id: "sunline-module-02" });
      player.teleport({ theta: ENDCAP_HUBS[1].rim.theta, y: ENDCAP_HUBS[1].rim.y, height: 0 });
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, 0);
      assert.equal(wp.guidance.y, ENDCAP_HUBS[1].rim.y);
      const rimUp = getSunlineTransfer(state());
      assert.equal(rimUp?.id, "endcap-b-hub-rim-lift");
      player.teleport(rimUp.destination);

      // Secured at Endcap B landing: rail target guides to Endcap B trolley dock
      assert.equal(state().traversalMode, "secured");
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, AXIAL_HEIGHT);
      assert.equal(wp.guidance.y, ENDCAP_HUBS[1].dock.y);

      // Move to dock and board trolley
      player.teleport({ ...ENDCAP_HUBS[1].dock, constraint: ENDCAP_HUBS[1].constraint });
      const board = getSunlineTransfer(state());
      assert.equal(board?.id, "endcap-b-hub-board-trolley");
      player.teleport(board.destination);
      assert.equal(state().traversalMode, "trolley");

      // On trolley: guides directly to SL-02; selecting Meridian Plaza guides to nearest disembark first
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.y, SUNLINE_PANEL.y);
      assert.equal(wp.guidance.height, AXIAL_HEIGHT);

      nav.select({ kind: "destination", id: "meridian-plaza" });
      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, AXIAL_HEIGHT);
      assert.equal(wp.guidance.y, ENDCAP_HUBS[1].trolley.y);

      const disembark = getSunlineTransfer(state());
      assert.equal(disembark?.id, "endcap-b-hub-disembark-trolley");
      player.teleport(disembark.destination);
      assert.equal(state().traversalMode, "secured");

      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, AXIAL_HEIGHT);
      assert.equal(wp.guidance.y, ENDCAP_HUBS[1].landing.y);

      player.teleport({ ...ENDCAP_HUBS[1].landing, constraint: ENDCAP_HUBS[1].constraint });
      const returnDown = getSunlineTransfer(state());
      assert.equal(returnDown?.id, "endcap-b-hub-return-lift");
      player.teleport(returnDown.destination);
      assert.equal(state().traversalMode, "walk");

      wp = nav.getWaypoint(state(), {});
      assert.equal(wp.guidance.height, 0);
      assert.equal(wp.guidance.y, CITY_STOPS[0].y);
    },
  );
});

test("live delivery, maintenance, and sunline jobs follow actual state/view advancement through completion", () => {
  const nav = createNavigation();

  withPlayerScenario(
    [globalDeck, skywalkDeck],
    ({ player, camera, scene, key, frames, state }) => {
      const delivery = createDelivery(scene, camera);
      const maintenance = createMaintenanceState();
      const sunline = createSunlineState();
      const views = (s) => ({
        delivery: delivery.getView(s),
        maintenance: maintenance.getView(s),
        sunline: sunline.getView(s),
      });

      // --- 1. Delivery job ---
      nav.select({ kind: "job", id: "delivery" });
      player.reset();
      let wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.id, "delivery");
      assert.equal(wp.target.height, 0);
      assert.equal(wp.arrived, false);

      player.teleport({
        theta: DELIVERY_STATIONS.pickup.s / RADIUS,
        y: DELIVERY_STATIONS.pickup.y,
        height: 0,
      });
      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.arrived, true);
      assert.equal(delivery.interact(state()).phase, "carrying");

      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.arrived, false);
      assert.ok(wp.finalDistance > 50);
      assert.equal(wp.target.y, DELIVERY_STATIONS.dropoff.y);

      player.teleport({
        theta: DELIVERY_STATIONS.dropoff.s / RADIUS,
        y: DELIVERY_STATIONS.dropoff.y,
        height: 0,
      });
      assert.equal(nav.getWaypoint(state(), views(state())).arrived, true);
      assert.equal(delivery.interact(state()).phase, "complete");
      assert.equal(delivery.getPhase(), "complete");
      assert.equal(delivery.getSupplyPhase(), "available");
      assert.equal(delivery.getView(state()).inventory, "");
      assert.equal(nav.getWaypoint(state(), views(state())).target.name, "Glasshouse 01 produce dispatch");
      assert.equal(delivery.interact({ ...state(), grounded: false }), null);
      assert.equal(delivery.interact({ ...state(), height: 13, traversalMode: "tram" }), null);
      assert.equal(delivery.interact(state()).phase, "carrying");
      assert.equal(delivery.getView(state()).inventory, "Fresh produce crate");
      assert.equal(nav.getWaypoint(state(), views(state())).target.y, SUPPLY_STATIONS.dropoff.y);
      player.teleport({
        theta: SUPPLY_STATIONS.dropoff.s / RADIUS,
        y: SUPPLY_STATIONS.dropoff.y,
        height: 0,
      });
      assert.equal(delivery.interact({ ...state(), height: 9 }), null);
      assert.equal(delivery.interact({ ...state(), y: state().y + 4 }), null);
      assert.equal(delivery.interact(state()).phase, "complete");
      assert.equal(delivery.getSupplyPhase(), "complete");
      assert.equal(delivery.interact(state()), null);
      assert.equal(nav.getWaypoint(state(), views(state())).target.name, "Glasshouse 01 seedling dispatch");
      assert.equal(nav.getWaypoint(state(), views(state())).guidance.name, "Meridian Plaza");
      player.teleport({
        theta: PLANTING_STATIONS.pickup.s / RADIUS,
        y: PLANTING_STATIONS.pickup.y,
        height: 0,
      });
      assert.equal(nav.getWaypoint(state(), views(state())).arrived, true);
      assert.equal(delivery.interact(state()).phase, "carrying");
      assert.equal(delivery.getView(state()).inventory, "Woodland seedling tray");
      const guidance = (pose) => nav.getWaypoint(pose, views(pose)).guidance.name;
      assert.equal(guidance(state()), "Glasshouse 01");
      assert.equal(guidance({ ...state(), traversalMode: "tram", height: 13, rideLineId: "line-01" }), "Disembark at Meridian Plaza");
      assert.equal(guidance({ ...state(), ...TRAM_STOPS.find((stop) => stop.id === "tram-plaza") }), "Meridian South");
      assert.equal(guidance({ ...state(), traversalMode: "tram", height: 13, rideLineId: "line-02" }), "Disembark at Stillwater Reserve");
      const plot = {
        theta: PLANTING_STATIONS.dropoff.s / RADIUS - 2 / RADIUS - 2 * Math.PI,
        y: PLANTING_STATIONS.dropoff.y,
        height: 0,
      };
      player.teleport(plot);
      assert.equal(guidance(state()), "Stillwater restoration plot");
      assert.equal(nav.getWaypoint(state(), views(state())).arrived, true);
      assert.equal(delivery.interact({ ...state(), grounded: false }), null);
      assert.equal(delivery.interact({ ...state(), height: 13, traversalMode: "tram" }), null);
      assert.equal(delivery.interact(state()).phase, "complete");
      assert.equal(delivery.getPlantingPhase(), "complete");
      assert.equal(delivery.interact(state()), null);
      assert.equal(nav.getWaypoint(state(), views(state())), null);

      // Completed/visited destinations remain trackable after jobs complete
      nav.select({ kind: "destination", id: "greenway-market" });
      assert.equal(nav.getWaypoint(state(), views(state())).id, "greenway-market");

      // --- 2. Maintenance job ---
      nav.select({ kind: "job", id: "maintenance" });
      player.teleport({
        theta: CITY_STOPS[0].theta,
        y: CITY_STOPS[0].y,
        height: 0,
      });
      const initialViews = views(state());
      wp = nav.getWaypoint(state(), initialViews);
      assert.equal(wp.target.height, 0);
      assert.equal(wp.target.theta, initialViews.maintenance.target.s / RADIUS);
      assert.ok(
        Math.abs(
          wp.finalDistance -
            spatialDistance(
              state().theta,
              state().y,
              0,
              initialViews.maintenance.target.s / RADIUS,
              initialViews.maintenance.target.y,
              initialViews.maintenance.target.height,
            ),
        ) < 1e-10,
      );
      player.teleport({
        theta: views(state()).maintenance.target.s / RADIUS,
        y: views(state()).maintenance.target.y,
        height: 0,
      });
      assert.equal(nav.getWaypoint(state(), views(state())).arrived, true);
      assert.equal(maintenance.interact(state()).changed, true);
      assert.equal(maintenance.getPhase(), "assigned");

      // Assigned target is 9m Skywalk unit; from ground, guidance routes to Skywalk street lift
      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.target.height, SKYWALK_HEIGHT);
      assert.equal(wp.guidance.height, 0);
      assert.equal(wp.guidance.theta, SKYWALK_LIFT.theta);
      assert.equal(wp.guidance.y, SKYWALK_LIFT.y);

      player.teleport({ theta: SKYWALK_LIFT.theta, y: SKYWALK_LIFT.y, height: 0 });
      player.teleport(getCityLift(state()).destination);

      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.guidance.height, SKYWALK_HEIGHT);
      assert.equal(wp.arrived, false);

      player.teleport({
        theta: wp.target.theta,
        y: wp.target.y,
        height: SKYWALK_HEIGHT,
      });
      assert.equal(nav.getWaypoint(state(), views(state())).arrived, true);
      assert.equal(maintenance.interact(state()).changed, true);
      assert.equal(maintenance.getPhase(), "repaired");

      // Repaired target returns to Mara at 0m; from 9m Skywalk, guides to Skywalk down lift first
      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.target.height, 0);
      assert.equal(wp.guidance.height, SKYWALK_HEIGHT);
      assert.equal(wp.guidance.theta, SKYWALK_LIFT.theta);

      player.teleport({ theta: SKYWALK_LIFT.theta, y: SKYWALK_LIFT.y, height: SKYWALK_HEIGHT });
      player.teleport(getCityLift(state()).destination);
      wp = nav.getWaypoint(state(), views(state()));
      player.teleport({ theta: wp.target.theta, y: wp.target.y, height: 0 });
      assert.equal(maintenance.interact(state()).changed, true);
      assert.equal(maintenance.getPhase(), "complete");
      assert.equal(nav.getWaypoint(state(), views(state())), null);

      // --- 3. Sunline job ---
      nav.select({ kind: "job", id: "sunline" });
      const hubA = ENDCAP_HUBS[0];
      player.teleport({ theta: hubA.rim.theta, y: hubA.rim.y, height: 0 });
      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.target.height, AXIAL_HEIGHT);
      assert.equal(wp.guidance.height, 0);
      assert.equal(wp.guidance.y, hubA.rim.y);
      // When nearer Endcap B on surface, live sunline view/guidance picks Endcap B rim
      player.teleport({ theta: ENDCAP_HUBS[1].rim.theta, y: ENDCAP_HUBS[1].rim.y, height: 0 });
      assert.equal(nav.getWaypoint(state(), views(state())).guidance.y, ENDCAP_HUBS[1].rim.y);
      player.teleport({ theta: hubA.rim.theta, y: hubA.rim.y, height: 0 });


      player.teleport(getSunlineTransfer(state()).destination);
      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.guidance.theta, hubA.control.theta);
      assert.equal(wp.guidance.y, hubA.control.y);

      player.teleport({ ...hubA.control, constraint: hubA.constraint });
      assert.equal(nav.getWaypoint(state(), views(state())).arrived, true);
      assert.equal(sunline.interact(state()).changed, true);
      assert.equal(sunline.getPhase(), "isolated");

      // Isolated phase in secured mode guides to Hub A trolley dock
      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.target.y, SUNLINE_PANEL.y);
      assert.equal(wp.guidance.y, hubA.dock.y);

      player.teleport({ ...hubA.dock, constraint: hubA.constraint });
      player.teleport(getSunlineTransfer(state()).destination);
      assert.equal(state().traversalMode, "trolley");

      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.guidance.y, SUNLINE_PANEL.y);

      // Drive real trolley along spine to SL-02
      key("KeyW", true);
      for (let i = 0; i < 600; i++) {
        frames(1);
        if (
          horizontalDistance(
            state().theta,
            state().y,
            SUNLINE_PANEL.theta,
            SUNLINE_PANEL.y,
            SUNLINE_PANEL.height,
          ) <= 0.9
        ) {
          break;
        }
      }
      key("KeyW", false);
      assert.equal(nav.getWaypoint(state(), views(state())).arrived, true);
      assert.equal(sunline.interact(state()).changed, true);
      assert.equal(sunline.getPhase(), "replaced");

      // Replaced phase on trolley guides to Hub A trolley disembark, then control
      wp = nav.getWaypoint(state(), views(state()));
      assert.equal(wp.guidance.y, hubA.trolley.y);
      player.teleport({ ...hubA.trolley, constraint: hubA.trolley.constraint });
      player.teleport(getSunlineTransfer(state()).destination);
      player.teleport({ ...hubA.control, constraint: hubA.constraint });
      assert.equal(sunline.interact(state()).changed, true);
      assert.equal(sunline.getPhase(), "complete");
      assert.equal(nav.getWaypoint(state(), views(state())), null);
    },
  );
});

test("tram targets, riding disembark guidance, wrong-level rejection, and ground final-leg arrival", () => {
  const nav = createNavigation();
  const gateway = TRAM_STOPS[0];
  const market = TRAM_STOPS[1];
  const glasshouseStop = TRAM_STOPS[2];
  const plazaStop = TRAM_STOPS[3];
  const towerStop = TRAM_STOPS[4];

  // 1. On-foot selection of a tram station guides to the ground pad and requires ground height to arrive
  nav.select({ kind: "destination", id: market.id });
  const onGroundFar = nav.getWaypoint(
    { theta: 0, y: gateway.y, height: 0, traversalMode: "walk" },
    {},
  );
  assert.equal(onGroundFar.arrived, false);
  assert.equal(onGroundFar.guidance.theta, market.theta);
  assert.equal(onGroundFar.guidance.y, market.y);
  assert.equal(onGroundFar.guidance.height, 0);

  // Directly above the station at car height 13m on walk mode: wrong floor -> arrived is false
  const wrongHeightWalk = nav.getWaypoint(
    { theta: market.theta, y: market.y, height: TRAM_HEIGHT, traversalMode: "walk" },
    {},
  );
  assert.equal(wrongHeightWalk.arrived, false);
  assert.equal(wrongHeightWalk.finalDistance, TRAM_HEIGHT);

  // Ground arrival at the station pad
  const atMarketPad = nav.getWaypoint(
    { theta: market.theta, y: market.y, height: 0, traversalMode: "walk" },
    {},
  );
  assert.equal(atMarketPad.arrived, true);
  assert.equal(atMarketPad.distance, 0);

  // From elevated Skywalk (9m) / Service (-8m) / Skyroom (42m), selecting a tram stop exits that level first
  assert.equal(
    nav.getWaypoint(
      { theta: SKYWALK_LIFT.theta, y: SKYWALK_LIFT.y, height: SKYWALK_HEIGHT, traversalMode: "walk" },
      {},
    ).guidance.y,
    SKYWALK_LIFT.y,
  );
  assert.equal(
    nav.getWaypoint(
      { theta: SERVICE_ACCESS.theta, y: SERVICE_ACCESS.y, height: SERVICE_FLOOR, traversalMode: "walk" },
      {},
    ).guidance.height,
    SERVICE_FLOOR,
  );

  // 2. While riding the tram, guidance chooses closest appropriate disembark car-stop at height 13m
  const reusableOut = {};
  nav.select({ kind: "destination", id: "greenway-glasshouse" });
  const ridingToGlasshouse = nav.getWaypoint(
    { theta: TRAM_THETA, y: gateway.y, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
    reusableOut,
  );
  const targetRef = ridingToGlasshouse.target;
  const guidanceRef = ridingToGlasshouse.guidance;
  assert.equal(ridingToGlasshouse.arrived, false);
  assert.equal(ridingToGlasshouse.guidance.theta, TRAM_THETA);
  assert.equal(ridingToGlasshouse.guidance.y, glasshouseStop.y);
  assert.equal(ridingToGlasshouse.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToGlasshouse.guidance.name, `Disembark at ${glasshouseStop.name}`);
  assert.equal(ridingToGlasshouse.guidance.kind, "tram");
  assert.equal(ridingToGlasshouse.target.height, 0);

  // Docked in the car at Glasshouse 01 stop: still NOT arrived until disembarked to ground
  const dockedAtGlasshouse = nav.getWaypoint(
    { theta: TRAM_THETA, y: glasshouseStop.y, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
    reusableOut,
  );
  assert.equal(dockedAtGlasshouse.target, targetRef);
  assert.equal(dockedAtGlasshouse.guidance, guidanceRef);
  assert.equal(dockedAtGlasshouse.arrived, false);
  assert.equal(dockedAtGlasshouse.distance, 0);
  assert.ok(dockedAtGlasshouse.finalDistance > 13);

  // Disembarked to ground pad -> final leg guides to ground Glasshouse 01 doorway
  const disembarkedAtPad = nav.getWaypoint(
    { theta: glasshouseStop.theta, y: glasshouseStop.y, height: 0, traversalMode: "walk" },
    {},
    reusableOut,
  );
  assert.equal(disembarkedAtPad.arrived, false);
  assert.equal(disembarkedAtPad.guidance.height, 0);
  assert.equal(disembarkedAtPad.guidance.theta, DISTRICT_STOPS[1].theta);
  assert.equal(disembarkedAtPad.guidance.y, DISTRICT_STOPS[1].y);

  // Final destination arrival at ground Glasshouse 01
  const arrivedGlasshouse = nav.getWaypoint(
    { theta: DISTRICT_STOPS[1].theta, y: DISTRICT_STOPS[1].y, height: 0, traversalMode: "walk" },
    {},
    reusableOut,
  );
  assert.equal(arrivedGlasshouse.arrived, true);


  // Market square (y=-450) is 16m from Glasshouse stop (-434) vs 20m from Market stop (-470),
  // yet must guide to canonical associated Market Square station via landmarkIds.
  nav.select({ kind: "destination", id: "greenway-market" });
  const ridingToMarket = nav.getWaypoint(
    { theta: TRAM_THETA, y: gateway.y, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
  );
  assert.equal(ridingToMarket.guidance.y, market.y);
  assert.equal(ridingToMarket.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToMarket.guidance.name, `Disembark at ${market.name}`);

  nav.select({ kind: "destination", id: "civic-lobby" });
  const ridingToLobby = nav.getWaypoint(
    { theta: TRAM_THETA, y: 0, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
  );
  assert.equal(ridingToLobby.guidance.y, towerStop.y);
  assert.equal(ridingToLobby.guidance.name, `Disembark at ${towerStop.name}`);
  // 3. Selecting a tram station itself while riding still guides to 13m car-stop and does not arrive until on ground
  nav.select({ kind: "destination", id: plazaStop.id });
  const ridingToPlazaStop = nav.getWaypoint(
    { theta: TRAM_THETA, y: plazaStop.y, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
  );
  assert.equal(ridingToPlazaStop.arrived, false);
  assert.equal(ridingToPlazaStop.guidance.theta, TRAM_THETA);
  assert.equal(ridingToPlazaStop.guidance.y, plazaStop.y);
  assert.equal(ridingToPlazaStop.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToPlazaStop.guidance.name, `Disembark at ${plazaStop.name}`);

  const onPlazaGroundPad = nav.getWaypoint(
    { theta: plazaStop.theta, y: plazaStop.y, height: 0, traversalMode: "walk" },
    {},
  );
  assert.equal(onPlazaGroundPad.arrived, true);

  // 4. Cross-floor targets while riding disembark at nearest appropriate surface stop first
  nav.select({ kind: "destination", id: "skyroom" });
  const ridingToSkyroom = nav.getWaypoint(
    { theta: TRAM_THETA, y: 0, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
  );
  assert.equal(ridingToSkyroom.arrived, false);
  assert.equal(ridingToSkyroom.guidance.y, towerStop.y);
  assert.equal(ridingToSkyroom.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToSkyroom.guidance.name, `Disembark at ${towerStop.name}`);

  nav.select({ kind: "destination", id: "meridian-water-plant" });
  const ridingToService = nav.getWaypoint(
    { theta: TRAM_THETA, y: 0, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
  );
  assert.equal(ridingToService.guidance.y, plazaStop.y);
  assert.equal(ridingToService.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToService.guidance.name, `Disembark at ${plazaStop.name}`);

  nav.select({ kind: "destination", id: "sunline-module-02" });
  const ridingToAxial = nav.getWaypoint(
    { theta: TRAM_THETA, y: 0, height: TRAM_HEIGHT, traversalMode: "tram" },
    {},
  );
  assert.equal(ridingToAxial.guidance.y, gateway.y);
  assert.equal(ridingToAxial.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToAxial.guidance.name, `Disembark at ${gateway.name}`);

  // 5. Delivery job target while riding disembarks at nearest appropriate stop, then finishes on ground
  nav.select({ kind: "job", id: "delivery" });
  const pickupViews = {
    delivery: {
      title: "Neighborhood delivery",
      phase: "available",
      target: {
        s: DELIVERY_STATIONS.pickup.s,
        y: DELIVERY_STATIONS.pickup.y,
        height: 0,
      },
    },
  };
  const ridingToPickup = nav.getWaypoint(
    { theta: TRAM_THETA, y: 0, height: TRAM_HEIGHT, traversalMode: "tram" },
    pickupViews,
  );
  assert.equal(ridingToPickup.arrived, false);
  assert.equal(ridingToPickup.guidance.y, market.y);
  assert.equal(ridingToPickup.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToPickup.guidance.name, `Disembark at ${market.name}`);
  // Non-ground job targets resolve ground access leg first (not raw final-target Y)
  nav.select({ kind: "job", id: "maintenance" });
  const skywalkJobViews = {
    maintenance: {
      title: "Civic maintenance",
      phase: "assigned",
      target: {
        theta: SKYWALK_LIFT.theta,
        y: 440,
        height: SKYWALK_HEIGHT,
      },
    },
  };
  const ridingToSkywalkJob = nav.getWaypoint(
    { theta: TRAM_THETA, y: 0, height: TRAM_HEIGHT, traversalMode: "tram" },
    skywalkJobViews,
  );
  assert.equal(ridingToSkywalkJob.guidance.y, towerStop.y);
  assert.equal(ridingToSkywalkJob.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToSkywalkJob.guidance.name, `Disembark at ${towerStop.name}`);

  // Service-level job near tower Y still resolves via SERVICE_ACCESS (y=425) -> Meridian Plaza stop
  nav.select({ kind: "job", id: "sunline" });
  const serviceLevelJobViews = {
    sunline: {
      title: "Service override",
      phase: "available",
      target: {
        theta: SERVICE_ACCESS.theta,
        y: towerStop.y,
        height: SERVICE_FLOOR,
      },
    },
  };
  const ridingToServiceJob = nav.getWaypoint(
    { theta: TRAM_THETA, y: 0, height: TRAM_HEIGHT, traversalMode: "tram" },
    serviceLevelJobViews,
  );
  assert.equal(ridingToServiceJob.guidance.y, plazaStop.y);
  assert.equal(ridingToServiceJob.guidance.height, TRAM_HEIGHT);
  assert.equal(ridingToServiceJob.guidance.name, `Disembark at ${plazaStop.name}`);
});

test("tram disembark guidance is scoped to the ridden line", () => {
  const nav = createNavigation();
  nav.select({ kind: "destination", id: "stillwater-shore" });
  const rider = { theta: TRAM_THETA, y: STILLWATER_TRAM_Y, height: TRAM_HEIGHT, traversalMode: "tram" };
  const stillwater = nav.getWaypoint({ ...rider, rideLineId: "line-02" }, {});
  assert.equal(stillwater.guidance.theta, STILLWATER_TRAM_STOPS[1].trackTheta);
  assert.equal(stillwater.guidance.y, STILLWATER_TRAM_Y);
  assert.equal(stillwater.guidance.height, TRAM_HEIGHT);
  assert.equal(stillwater.guidance.name, `Disembark at ${STILLWATER_TRAM_STOPS[1].name}`);
  const axial = nav.getWaypoint({ ...rider, rideLineId: "line-01" }, {});
  const legacy = nav.getWaypoint(rider, {});
  assert.deepEqual(axial.guidance, legacy.guidance);
  assert.equal(axial.guidance.theta, TRAM_THETA);
  assert.ok(TRAM_STOPS.some((stop) => stop.y === axial.guidance.y));
});
