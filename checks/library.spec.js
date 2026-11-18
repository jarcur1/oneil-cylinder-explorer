import { test, expect } from "@playwright/test";
import { RADIUS, EYE_HEIGHT, MERIDIAN_PLACEMENT } from "../src/habitat.js";
import { LIBRARY_LAYOUT } from "../src/library-layout.js";

const softwareRendering = process.env.HABITAT_REAL_GPU !== "1";
const walkTimeout = softwareRendering ? 600_000 : 120_000;

async function fixture(page) {
  await page.goto("/checks/world.html");
  await page.waitForFunction(() => Boolean(window.__worldFixture));
}

async function attachImages(testInfo, images) {
  for (const [name, image] of Object.entries(images)) {
    await testInfo.attach(name, {
      body: Buffer.from(image.split(",")[1], "base64"), contentType: "image/png",
    });
  }
}

test("production library doorway, floor, walls, furniture, upper block and ceiling constrain the real controller", async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(() => {
    const f = window.__worldFixture;
    const { RADIUS: radius, MERIDIAN_PLACEMENT: placement, LIBRARY_LAYOUT: room, EYE_HEIGHT } = f.layouts;
    const local = (state) => ({ s: state.theta * radius, y: placement.toLocalY(state.y), height: state.height, grounded: state.grounded });
    const settle = (frames = 15) => {
      let state;
      for (let i = 0; i < frames; i++) state = f.step(1 / 60, { updateWorld: false });
      return local(state);
    };
    const place = (s, y, height = room.floor) => {
      f.player.teleport({ theta: s / radius, y: placement.toWorldY(y), height, yaw: 0 });
    };
    const key = (code, frames) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      const state = settle(frames);
      window.dispatchEvent(new KeyboardEvent("keyup", { code }));
      return state;
    };
    const walkTo = (axis, target) => {
      const before = local(f.player.getState({}));
      const direction = Math.sign(target - before[axis]);
      const code = axis === "s" ? (direction > 0 ? "KeyD" : "KeyA") : (direction > 0 ? "KeyW" : "KeyS");
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      let state = before;
      for (let i = 0; i < 300 && direction * state[axis] < direction * target; i++) state = settle(1);
      window.dispatchEvent(new KeyboardEvent("keyup", { code }));
      if (Math.abs(state[axis] - target) > 0.2) throw new Error(`Library route blocked: ${axis} -> ${target}: ${JSON.stringify(state)}`);
      return state;
    };
    // One continuous controller-driven journey; only the initial portico pose is supplied.
    place(-20, room.door.y, 0);
    settle();
    const threshold = walkTo("s", -24);
    const interior = walkTo("s", -36.8);
    const aisle = walkTo("y", -17);
    walkTo("y", room.door.y);
    walkTo("s", -24);
    const exit = walkTo("s", -20);
    settle();
    const outside = local(f.player.getState({}));

    const probe = (s, y, code, height = room.floor, frames = 45) => {
      place(s, y, height);
      return key(code, frames);
    };
    const walls = {
      east: probe(-21, -27, "KeyA"),
      west: probe(-44, -24.8, "KeyA"),
      north: probe(-33.5, -8, "KeyW"),
      south: probe(-31, -32, "KeyS"),
    };
    const shelfBlocked = probe(-43, -10.2, "KeyA");
    const tableBlocked = probe(-38, -29, "KeyW");
    place(-36.5, -26, room.tables[1].top + 0.2);
    const tableSupported = settle(60);
    place(-46, -10.2, 2.9);
    const shelfSupported = settle(60);
    // A real jump from the supported shelf reaches the ceiling; no velocity injection.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    let maxHead = 0;
    for (let i = 0; i < 25; i++) {
      const state = f.step(1 / 60, { updateWorld: false });
      maxHead = Math.max(maxHead, state.height + EYE_HEIGHT + 0.15);
      if (i === 0) window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    }
    const afterCeiling = settle(90);
    const upperBlocked = probe(-21, room.door.y, "KeyA", room.upperBase + 0.8, 15);
    return { threshold, interior, aisle, exit, outside, walls, shelfBlocked, tableBlocked, tableSupported, shelfSupported, maxHead, afterCeiling, upperBlocked, floor: room.floor, ceiling: room.ceiling };
  });
  for (const state of [result.threshold, result.interior, result.aisle]) {
    expect(state.grounded).toBe(true);
    expect(state.height).toBeCloseTo(result.floor, 5);
  }
  expect(result.exit.s).toBeGreaterThan(-20.2);
  expect(result.outside.height).toBeCloseTo(0, 5);
  expect(result.walls.east.s).toBeGreaterThan(-22.7);
  expect(result.walls.west.s).toBeGreaterThan(-46.5);
  expect(result.walls.north.y).toBeLessThan(-5.5);
  expect(result.walls.south.y).toBeGreaterThan(-34.5);
  expect(result.shelfBlocked.s).toBeGreaterThan(-45.1);
  expect(result.tableBlocked.y).toBeLessThan(-27.3);
  expect(result.tableSupported.height).toBeCloseTo(0.78, 5);
  expect(result.tableSupported.grounded).toBe(true);
  expect(result.shelfSupported.height).toBeCloseTo(2.75, 5);
  expect(result.shelfSupported.grounded).toBe(true);
  expect(result.maxHead).toBeCloseTo(result.ceiling, 4);
  expect(result.afterCeiling.height).toBeCloseTo(2.75, 5);
  expect(result.upperBlocked.s).toBeGreaterThan(-22.7);
  expect(result.upperBlocked.height).toBeGreaterThan(result.floor + 4);
});

test("actual warm reading room and cylinder-life exhibits render, and an existing resident walks in, reads supported, and leaves", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1100, height: 760 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  const result = await page.evaluate(async () => {
    const f = window.__worldFixture;
    const url = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/three\.js\?/.test(name));
    const { Vector3, Raycaster } = await import(url);
    const { RADIUS: radius, MERIDIAN_PLACEMENT: placement, LIBRARY_LAYOUT: room } = f.layouts;
    const point = (s, y, h) => new Vector3((radius - h) * Math.sin(s / radius), placement.toWorldY(y), -(radius - h) * Math.cos(s / radius));
    const up = (s) => new Vector3(-Math.sin(s / radius), 0, Math.cos(s / radius));
    const must = (name) => {
      const mesh = f.scene.getObjectByName(name);
      if (!mesh) throw new Error(`Missing actual library object: ${name}`);
      return mesh;
    };
    const images = {};
    const spreads = {};
    const view = (name, from, to, fov = 65) => {
      f.scene.updateMatrixWorld(true);
      f.camera.position.copy(point(...from));
      f.camera.up.copy(up(from[0]));
      f.camera.lookAt(point(...to));
      f.camera.fov = fov;
      f.camera.updateProjectionMatrix();
      f.camera.layers.set(0);
      f.render();
      const gl = f.renderer.getContext();
      const pixels = new Uint8Array(128 * 128 * 4);
      gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) - 64, Math.floor(gl.drawingBufferHeight / 2) - 64, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let low = 255;
      let high = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        low = Math.min(low, brightness);
        high = Math.max(high, brightness);
      }
      spreads[name] = high - low;
      images[name] = f.renderer.domElement.toDataURL("image/png");
    };
    const lights = ["libraryWarmLightNorth", "libraryWarmLightSouth"].map((name) => {
      const light = must(name);
      return { point: light.isPointLight, intensity: light.intensity, warm: light.color.r > light.color.b, visible: light.visible, surface: Boolean(light.layers.mask & 1) };
    });
    must("libraryFloor");
    must("libraryCeiling");
    const book = must("library_reading_book");
    const seat = must("library_reader_seat");
    const habitatExhibit = must("libraryHabitatExhibit");
    must("libraryLivingSystemsExhibit");
    const cover = book.getObjectByName("libraryReadingBookCover");
    const tableTop = must("libraryReadingTable1Top");
    if (!cover?.isMesh) throw new Error("Permanent reading book has no real cover mesh");
    f.scene.updateMatrixWorld(true);
    cover.geometry.computeBoundingBox();
    const bookBottom = cover.localToWorld(new Vector3(0, 0, cover.geometry.boundingBox.min.z));
    const bookSupportRay = new Raycaster(bookBottom.clone().addScaledVector(up(room.book.s), 0.02), up(room.book.s).negate());
    const bookSupport = bookSupportRay.intersectObject(tableTop)[0];
    if (!bookSupport) throw new Error("Permanent book is not on the actual reading table");
    const bookSupportError = Math.abs(bookSupport.distance - 0.02);
    view("library-east-entry", [-16, -20, 1.7], [-28, -20, 1.7]);
    view("library-reading-room", [-25, -20, 1.7], [-40, -17, 1.5]);
    view("library-cylinder-life-exhibit", [-40, -20, 2.1], [-46.41, -20, 2.1], 60);
    const ray = new Raycaster();
    const exhibitCenter = habitatExhibit.getWorldPosition(new Vector3());
    ray.set(f.camera.position, exhibitCenter.clone().sub(f.camera.position).normalize());
    const exhibitVisible = ray.intersectObject(must("libraryReadingRoom"), true)[0]?.object === habitatExhibit;
    const actor = f.world.residents.residents.find((resident) => resident.cfg.id === "resident-plaza");
    if (!actor) throw new Error("Existing library visiting resident was not found");
    const actorId = actor.cfg.id;
    const walls = ["libraryWallWest", "libraryWallNorth", "libraryWallSouth", "libraryWallEastNorth", "libraryWallEastSouth", "libraryEntranceLintel"].map(must);
    const phases = new Set();
    let entered = false;
    let leftAfterRead = false;
    let readFrames = 0;
    let maxSeatError = 0;
    let maxFootError = 0;
    let maxAnchorError = 0;
    let wallCrossings = 0;
    let previous = { ...actor.sampleState };
    let previousPelvis = null;
    let maxPelvisDrift = 0;
    let headMin = Infinity;
    let headMax = -Infinity;
    let pauseFrozen = false;
    const snapshot = () => {
      const transforms = [];
      actor.root.traverse((node) => transforms.push(...node.position.toArray(), ...node.quaternion.toArray()));
      return JSON.stringify(transforms);
    };
    // Advance the normal production update at 60 Hz through a full visit. No phase/distance/pose is injected.
    for (let frame = 0; frame < 150 * 60; frame++) {
      f.step(1 / 60);
      const state = actor.sampleState;
      const localY = placement.toLocalY(state.y);
      phases.add(actor.dwellState);
      maxAnchorError = Math.max(maxAnchorError, Math.abs(actor.root.position.y - state.y));
      if (previous.s >= room.door.s && state.s < room.door.s) {
        if (Math.abs(localY - room.door.y) > room.door.width / 2 - 0.2) throw new Error("Resident entered outside the doorway");
        entered = true;
      }
      if (readFrames && previous.s < room.door.s && state.s >= room.door.s) leftAfterRead = true;
      const previousChest = point(previous.s, placement.toLocalY(previous.y), 1.2);
      const chest = point(state.s, localY, 1.2);
      const travel = chest.clone().sub(previousChest);
      if (travel.length() > 1e-7) {
        ray.set(previousChest, travel.clone().normalize());
        ray.far = travel.length();
        wallCrossings += ray.intersectObjects(walls, true).length;
        ray.far = Infinity;
      }
      previous = { ...state };
      if (leftAfterRead) break;
      if (actor.dwellState !== "dwelling" || Math.abs(state.s - room.reader.s) > 0.1) continue;
      readFrames++;
      f.scene.updateMatrixWorld(true);
      const pelvis = actor.root.getObjectByName("pelvis");
      pelvis.geometry.computeBoundingBox();
      const underside = pelvis.localToWorld(new Vector3(0, 0, pelvis.geometry.boundingBox.min.z));
      ray.set(underside.clone().addScaledVector(up(state.s), 0.02), up(state.s).negate());
      const support = ray.intersectObject(seat, true)[0];
      if (!support) throw new Error("Reader pelvis is not supported by the real seat mesh");
      maxSeatError = Math.max(maxSeatError, Math.abs(support.distance - 0.02));
      if (!previousPelvis) previousPelvis = underside.clone();
      maxPelvisDrift = Math.max(maxPelvisDrift, underside.distanceTo(previousPelvis));
      for (const name of ["foot-left", "foot-right"]) {
        const foot = actor.root.getObjectByName(name);
        foot.geometry.computeBoundingBox();
        const bounds = foot.geometry.boundingBox;
        let lowest = Infinity;
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const vertex = foot.localToWorld(new Vector3(x, y, z));
          lowest = Math.min(lowest, radius - Math.hypot(vertex.x, vertex.z));
        }
        maxFootError = Math.max(maxFootError, Math.abs(lowest - room.floor));
      }
      headMin = Math.min(headMin, actor.head.rotation.x);
      headMax = Math.max(headMax, actor.head.rotation.x);
      if (readFrames === 120) {
        view("library-resident-reading", [-35, -18.5, 1.65], [-38, -15, 0.95], 50);
        const before = snapshot();
        f.world.update(0, 1e15, f.player.getState({}));
        f.world.update(0, -1e15, f.player.getState({}));
        pauseFrozen = before === snapshot();
      }
    }
    return { images, spreads, lights, exhibitVisible, bookSupportError, actorId, entered, leftAfterRead, readFrames, maxSeatError, maxFootError, maxAnchorError, wallCrossings, maxPelvisDrift, headMin, headMax, phases: [...phases], pauseFrozen };
  });
  expect(errors).toEqual([]);
  for (const light of result.lights) expect(light).toMatchObject({ point: true, warm: true, visible: true, surface: true });
  for (const light of result.lights) expect(light.intensity).toBeGreaterThan(0);
  expect(result.exhibitVisible).toBe(true);
  for (const spread of Object.values(result.spreads)) expect(spread).toBeGreaterThan(12);
  expect(result.bookSupportError).toBeLessThan(0.005);
  expect(result.actorId).toBe("resident-plaza");
  expect(result.entered).toBe(true);
  expect(result.leftAfterRead).toBe(true);
  expect(result.phases).toEqual(expect.arrayContaining(["walking", "settling", "dwelling", "resuming"]));
  expect(result.readFrames).toBeGreaterThan(120);
  expect(result.wallCrossings).toBe(0);
  expect(result.maxAnchorError).toBeLessThan(1e-8);
  expect(result.maxSeatError).toBeLessThan(0.005);
  expect(result.maxFootError).toBeLessThan(0.005);
  expect(result.maxPelvisDrift).toBeLessThan(0.001);
  expect(result.headMin).toBeLessThan(-0.6);
  expect(result.headMax - result.headMin).toBeGreaterThan(0.005);
  expect(result.pauseFrozen).toBe(true);
  await attachImages(testInfo, result.images);
});

// Observe only the camera and scene actually passed to the renderer. All native
// travel, look, map and pause actions below remain ordinary UI/keyboard input.
async function observeNativeScene(page) {
  await page.evaluate(async ({ radius, eyeHeight }) => {
    const url = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/three\.js\?/.test(name));
    const { Scene, Vector3 } = await import(url);
    const direction = new Vector3();
    const prior = Scene.prototype.onAfterRender;
    Scene.prototype.onAfterRender = function (renderer, scene, camera) {
      prior?.call(this, renderer, scene, camera);
      window.__libraryFrame = (window.__libraryFrame || 0) + 1;
      camera.getWorldDirection(direction);
      const theta = Math.atan2(camera.position.x, -camera.position.z);
      window.__libraryObservation = {
        scene, camera,
        s: theta * radius, y: camera.position.y,
        height: radius - Math.hypot(camera.position.x, camera.position.z) - eyeHeight,
        yaw: Math.atan2(direction.x * Math.cos(theta) + direction.z * Math.sin(theta), direction.y),
        pitch: Math.asin(Math.max(-1, Math.min(1, -direction.x * Math.sin(theta) + direction.z * Math.cos(theta)))),
      };
    };
  }, { radius: RADIUS, eyeHeight: EYE_HEIGHT });
  await page.waitForFunction(() => Boolean(window.__libraryObservation));
}

async function nativeWalk(page, axis, target) {
  const start = await page.evaluate((key) => window.__libraryObservation[key], axis);
  if (Math.abs(start - target) < 0.2) return;
  const direction = Math.sign(target - start);
  const key = axis === "s" ? (direction > 0 ? "KeyD" : "KeyA") : (direction > 0 ? "KeyW" : "KeyS");
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ axis, target, direction }) => direction * window.__libraryObservation[axis] >= direction * target,
      { axis, target, direction }, { timeout: walkTimeout });
  } catch (error) {
    const evidence = await page.evaluate((offsetY) => {
      const { s, y, height, yaw, pitch } = window.__libraryObservation;
      return {
        s, y, localY: y - offsetY, height, yaw, pitch,
        position: document.getElementById("position")?.textContent,
        motion: document.getElementById("motion")?.textContent,
      };
    }, MERIDIAN_PLACEMENT.offsetY);
    throw new Error(`Native library walk ${axis} -> ${target}: ${JSON.stringify(evidence)}`, { cause: error });
  } finally {
    await page.keyboard.up(key);
  }
}

async function nativeLook(page, yaw, pitch = 0) {
  // Coarse arrow-key aim, followed by native mouse input for precise yaw/pitch.
  // Re-center pitch too: pointer-locked moves from map controls affect both axes.
  let frame = await page.evaluate(() => window.__libraryFrame);
  await page.mouse.move(550, 380);
  await page.waitForFunction((before) => window.__libraryFrame > before, frame, { timeout: walkTimeout });
  let current = await page.evaluate(() => window.__libraryObservation.yaw);
  const direction = Math.sign(yaw - current);
  if (Math.abs(yaw - current) > 0.04) {
    const key = direction > 0 ? "ArrowRight" : "ArrowLeft";
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ yaw, direction }) => direction * window.__libraryObservation.yaw >= direction * yaw,
        { yaw, direction }, { timeout: walkTimeout });
    } finally {
      await page.keyboard.up(key);
    }
  }
  const currentPitch = await page.evaluate(() => window.__libraryObservation.pitch);
  const pitchDirection = Math.sign(pitch - currentPitch);
  if (Math.abs(pitch - currentPitch) > 0.04) {
    const key = pitchDirection > 0 ? "ArrowUp" : "ArrowDown";
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ pitch, direction }) => direction * window.__libraryObservation.pitch >= direction * pitch,
        { pitch, direction: pitchDirection }, { timeout: walkTimeout });
    } finally {
      await page.keyboard.up(key);
    }
  }
  let x = 550;
  let y = 380;
  for (let attempt = 0; attempt < 3; attempt++) {
    const observed = await page.evaluate(() => ({
      yaw: window.__libraryObservation.yaw, pitch: window.__libraryObservation.pitch,
    }));
    const delta = Math.atan2(Math.sin(yaw - observed.yaw), Math.cos(yaw - observed.yaw));
    const deltaPitch = pitch - observed.pitch;
    if (Math.abs(delta) < 0.006 && Math.abs(deltaPitch) < 0.006) return;
    const locked = await page.evaluate(() => Boolean(document.pointerLockElement));
    frame = await page.evaluate(() => window.__libraryFrame);
    x += delta / (locked ? 0.0022 : 0.003);
    y -= deltaPitch / (locked ? 0.0022 : 0.003);
    if (!locked) await page.mouse.down();
    await page.mouse.move(x, y);
    if (!locked) await page.mouse.up();
    await page.waitForFunction((before) => window.__libraryFrame > before, frame, { timeout: walkTimeout });
  }
  expect(Math.abs((await page.evaluate(() => window.__libraryObservation.yaw)) - yaw)).toBeLessThan(0.01);
  expect(Math.abs((await page.evaluate(() => window.__libraryObservation.pitch)) - pitch)).toBeLessThan(0.01);
}

async function nativeSnapshot(page) {
  return page.evaluate(() => {
    const { scene, camera } = window.__libraryObservation;
    const transforms = [];
    scene.getObjectByName("residents").traverse((node) => transforms.push(...node.position.toArray(), ...node.quaternion.toArray()));
    return { camera: [...camera.position.toArray(), ...camera.quaternion.toArray()], actors: transforms };
  });
}

test("unseeded native Meridian visit selects the public library, enters, views the exhibit, freezes on map/pause and walks out", async ({ browser }, testInfo) => {
  test.setTimeout(softwareRendering ? 2_400_000 : 600_000);
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.locator("#start-city").click();
    await expect(page.locator("#pause")).toBeVisible();
    await observeNativeScene(page);
    // No save preload, teleport, simulated time or injected interaction state.
    // The Y=-20 crossing is blocked by the lamp at S=-6.8; Y=-15 has a
    // tram gantry at S=-5.2. Cross at Y=-17.5, also south of the Y=-14 bench,
    // then approach along S=-14, clear of the service pavilion and forecourt tree.
    await nativeWalk(page, "y", MERIDIAN_PLACEMENT.toWorldY(-17.5));
    await nativeWalk(page, "s", -14);
    await nativeWalk(page, "y", MERIDIAN_PLACEMENT.toWorldY(LIBRARY_LAYOUT.door.y));
    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    const target = page.locator('button[data-destination-id="meridian-library"]');
    await target.click();
    await expect(page.locator("#habitat-map")).toContainText(/east portico.*central doorway/i);
    await expect(page.locator("#habitat-map")).toContainText(/upper archives remain closed/i);
    await page.locator("#map-close").click();
    await expect(page.locator("#waypoint-label")).toContainText("Library reading room");
    await nativeWalk(page, "s", -21);
    await nativeLook(page, -Math.PI / 2);
    await page.screenshot({ path: testInfo.outputPath("native-library-east-entry.png") });
    await nativeLook(page, 0);
    await nativeWalk(page, "s", -28);
    await expect.poll(() => page.evaluate(() => window.__libraryObservation.height)).toBeCloseTo(LIBRARY_LAYOUT.floor, 3);
    await nativeWalk(page, "s", -32);
    await nativeLook(page, -Math.PI / 2);
    await page.screenshot({ path: testInfo.outputPath("native-library-room-exhibit.png") });
    const renderedRoom = await page.evaluate(() => {
      const { scene, camera } = window.__libraryObservation;
      const panel = scene.getObjectByName("libraryHabitatExhibit");
      const center = panel.getWorldPosition(camera.position.clone()).project(camera);
      return { inView: Math.abs(center.x) < 1 && Math.abs(center.y) < 1 && center.z < 1 };
    });
    expect(renderedRoom.inView).toBe(true);

    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    const mapFrozen = await nativeSnapshot(page);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(500);
    await page.keyboard.up("KeyW");
    expect(await nativeSnapshot(page)).toEqual(mapFrozen);
    await page.locator("#map-close").click();
    await expect(page.locator("#pause")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    const paused = await nativeSnapshot(page);
    await page.waitForTimeout(500);
    expect(await nativeSnapshot(page)).toEqual(paused);
    await page.locator("#resume").click();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await expect.poll(async () => (await nativeSnapshot(page)).actors, { timeout: walkTimeout }).not.toEqual(paused.actors);
    await nativeLook(page, 0);
    await nativeWalk(page, "s", -20);
    await expect.poll(() => page.evaluate(() => window.__libraryObservation.height)).toBeCloseTo(0, 3);
    // Retrace the clear exterior approach instead of crossing the Y=-20 lamp.
    await nativeWalk(page, "s", -14);
    await nativeWalk(page, "y", MERIDIAN_PLACEMENT.toWorldY(-17.5));
    await nativeWalk(page, "s", 0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
