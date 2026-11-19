import { test, expect } from "@playwright/test";
import { RADIUS, EYE_HEIGHT } from "../src/habitat.js";
import { RESERVOIR_ARRIVAL, RESERVOIR_TARGETS } from "../src/reservoir-layout.js";

const timeout = process.env.HABITAT_REAL_GPU === "1" ? 120_000 : 600_000;

async function fixture(page) {
  await page.goto("/checks/world.html");
  await page.waitForFunction(() => Boolean(window.__worldFixture));
}

test("real controller crosses the bank and shallow basin and respects the pavilion and lookout", async ({ page }) => {
  test.setTimeout(timeout);
  await fixture(page);
  const result = await page.evaluate(() => {
    const f = window.__worldFixture;
    const radius = f.layouts.RADIUS;
    const local = (state) => ({ s: Math.atan2(Math.sin(state.theta - Math.PI), Math.cos(state.theta - Math.PI)) * radius, y: state.y - 450, height: state.height, grounded: state.grounded });
    const settle = (count = 1) => { let state; for (let i = 0; i < count; i++) state = f.step(1 / 60, { updateWorld: false }); return local(state); };
    const place = (s, y, height = 0) => { f.player.teleport({ theta: Math.PI + s / radius, y: 450 + y, height, yaw: 0 }); settle(3); };
    const walk = (code, count) => { window.dispatchEvent(new KeyboardEvent("keydown", { code })); const state = settle(count); window.dispatchEvent(new KeyboardEvent("keyup", { code })); return state; };
    place(15, -65);
    const bank = walk("KeyW", 65);
    const basin = walk("KeyW", 90);
    settle(60);
    const returnBank = walk("KeyS", 90);
    const returnGround = walk("KeyS", 65);
    place(-100, -77);
    const lookout = walk("KeyS", 90);
    place(-72, -96);
    const entry = walk("KeyW", 85);
    const northWall = walk("KeyW", 140);
    place(-78, -95);
    const southWall = walk("KeyW", 90);
    place(-72, -82, 8);
    const roof = settle(120);
    return { bank, basin, returnBank, returnGround, lookout, entry, northWall, southWall, roof };
  });
  expect(result.bank.y).toBeGreaterThan(-59);
  expect(result.bank.height).toBeCloseTo(0.6, 4);
  expect(result.basin.y).toBeGreaterThan(-51);
  expect(result.basin.height).toBeCloseTo(0, 4);
  expect(result.returnBank.height).toBeCloseTo(0.6, 4);
  expect(result.returnGround.y).toBeLessThan(-59);
  expect(result.returnGround.height).toBeCloseTo(0, 4);
  expect(result.lookout.y).toBeLessThan(-83);
  expect(result.lookout.height).toBeCloseTo(0.6, 4);
  expect(result.entry.y).toBeGreaterThan(-90);
  expect(result.entry.height).toBeCloseTo(0.05, 4);
  expect(result.northWall.y).toBeLessThan(-72.5);
  expect(result.southWall.y).toBeLessThan(-91);
  expect(result.roof.grounded).toBe(true);
  expect(result.roof.height).toBeCloseTo(6.15, 4);
});

test("rendered reserve geometry is on the opposite wall and visual viewpoints are captured", async ({ page }, testInfo) => {
  test.setTimeout(timeout);
  await fixture(page);
  const geometry = await page.evaluate(async () => {
    const f = window.__worldFixture;
    const url = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/three\.js\?/.test(name));
    const THREE = await import(url);
    const root = f.scene.getObjectByName("stillwater_reserve");
    if (!root) throw new Error("Reserve scene root missing");
    root.updateWorldMatrix(true, true);
    const water = root.getObjectByName("reservoir_shallow_water");
    const positions = water.geometry.getAttribute("position");
    const samples = [];
    for (const i of [0, Math.floor(positions.count / 2), positions.count - 1]) {
      const v = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(water.matrixWorld);
      samples.push({ x: v.x, y: v.y, z: v.z, radius: Math.hypot(v.x, v.z) });
    }
    const forest = {};
    for (const species of ["oak", "birch", "pine"]) {
      const crown = root.getObjectByName(`woodland_${species}_crowns`);
      const trunk = root.getObjectByName(`woodland_${species}_trunks`);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const heights = [];
      let opposite = 0;
      for (let i = 0; i < trunk.count; i++) {
        trunk.getMatrixAt(i, matrix);
        matrix.premultiply(trunk.matrixWorld);
        position.setFromMatrixPosition(matrix);
        if (position.z > 300 && position.y > 310 && position.y < 590) opposite++;
        heights.push(new THREE.Vector3().setFromMatrixColumn(matrix, 2).length());
      }
      const vertices = crown.geometry.getAttribute("position");
      const point = new THREE.Vector3();
      const center = new THREE.Vector3();
      const up = new THREE.Vector3();
      const tangent = new THREE.Vector3();
      const aspects = [];
      let bottomRadius = 0;
      let topRadius = 0;
      for (let i = 0; i < Math.min(crown.count, 30); i++) {
        crown.getMatrixAt(i, matrix);
        matrix.premultiply(crown.matrixWorld);
        center.setFromMatrixPosition(matrix);
        up.setFromMatrixColumn(matrix, 2).normalize();
        tangent.set(up.z, 0, -up.x).normalize();
        const projected = [];
        for (let v = 0; v < vertices.count; v++) {
          point.fromBufferAttribute(vertices, v).applyMatrix4(matrix).sub(center);
          projected.push({ h: point.dot(up), x: point.dot(tangent), y: point.y });
        }
        const minH = Math.min(...projected.map((p) => p.h));
        const maxH = Math.max(...projected.map((p) => p.h));
        const minX = Math.min(...projected.map((p) => p.x));
        const maxX = Math.max(...projected.map((p) => p.x));
        const minY = Math.min(...projected.map((p) => p.y));
        const maxY = Math.max(...projected.map((p) => p.y));
        aspects.push(Math.max(maxX - minX, maxY - minY) / (maxH - minH));
        for (const p of projected) {
          const radius = Math.hypot(p.x, p.y);
          if (p.h <= minH + (maxH - minH) * 0.2) bottomRadius = Math.max(bottomRadius, radius);
          if (p.h >= maxH - (maxH - minH) * 0.2) topRadius = Math.max(topRadius, radius);
        }
      }
      forest[species] = { meanAspect: aspects.reduce((a, b) => a + b, 0) / aspects.length,
        taper: topRadius / bottomRadius,
        minHeight: Math.min(...heights), maxHeight: Math.max(...heights), opposite, count: trunk.count };
    }
    const shrubs = root.getObjectByName("woodland_shrubs");
    const shrubMatrix = new THREE.Matrix4();
    shrubs.getMatrixAt(0, shrubMatrix);
    shrubMatrix.premultiply(shrubs.matrixWorld);
    const shrubPosition = new THREE.Vector3().setFromMatrixPosition(shrubMatrix);
    return { samples, forest, shrub: { z: shrubPosition.z, height: new THREE.Vector3().setFromMatrixColumn(shrubMatrix, 2).length() } };
  });
  for (const point of geometry.samples) {
    expect(point.z).toBeGreaterThan(340);
    expect(point.radius).toBeCloseTo(RADIUS - 0.4, 3);
    expect(point.y).toBeGreaterThanOrEqual(398);
    expect(point.y).toBeLessThanOrEqual(502);
  }
  expect(geometry.forest.oak.meanAspect).toBeGreaterThan(geometry.forest.birch.meanAspect * 1.1);
  expect(geometry.forest.pine.taper).toBeLessThan(0.2);
  for (const species of Object.values(geometry.forest)) {
    expect(species.opposite).toBe(species.count);
    expect(species.minHeight).toBeLessThan(6);
    expect(species.maxHeight - species.minHeight).toBeGreaterThan(3);
  }
  expect(geometry.shrub.z).toBeGreaterThan(300);
  expect(geometry.shrub.height).toBeLessThan(2);
  // Fixture-only camera positioning provides reproducible visual evidence; it does not alter native gameplay.
  for (const [name, from, toward] of [
    ["scene", [0, -120, 3], [15, -35, 1]],
    ["woodland", [-100, 25, 3], [-125, 65, 5]],
    ["shrubs", [100, 40, 2], [125, 55, 2]],
    ["lookout", [-100, -76, 3], [-100, -90, 1]],
  ]) {
    await page.evaluate(async ({ from, toward }) => {
      const f = window.__worldFixture;
      const { surfacePos, surfaceUp } = await import("/src/surface.js");
      const pos = ([s, y, h]) => surfacePos(Math.PI + s / f.layouts.RADIUS, 450 + y, h);
      f.camera.position.copy(pos(from));
      f.camera.up.copy(surfaceUp(Math.PI + from[0] / f.layouts.RADIUS));
      f.camera.lookAt(pos(toward));
      f.camera.updateMatrixWorld();
      f.render();
    }, { from, toward });
    await page.screenshot({ path: testInfo.outputPath(`reservoir-${name}.png`) });
  }
});

test("reserve spotlight does not brighten the rendered Sunline corridor floor", async ({ page }) => {
  test.setTimeout(timeout);
  await fixture(page);
  const samples = await page.evaluate(async () => {
    const f = window.__worldFixture;
    const url = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/three\.js\?/.test(name));
    const THREE = await import(url);
    const { surfacePos } = await import("/src/surface.js");
    const spot = f.scene.getObjectByName("stillwater_sunline_light");
    const corridor = f.scene.getObjectByName("sunline_corridor");
    if (!spot || !corridor) throw new Error("Reserve spotlight or Sunline corridor missing");
    const gl = f.renderer.getContext();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const size = 32;
    const pixels = new Uint8Array(size * size * 4);
    const capture = (intensity) => {
      spot.intensity = intensity;
      f.renderer.render(f.scene, f.camera);
      gl.readPixels(Math.floor((width - size) / 2), Math.floor((height - size) / 2), size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return Array.from(pixels);
    };
    const compare = () => {
      const intensity = spot.intensity;
      const on = capture(intensity), off = capture(0), restored = capture(intensity);
      const mean = (a) => a.reduce((sum, v, i) => sum + (i % 4 === 3 ? 0 : v), 0) / (a.length / 4 * 3);
      return { on: mean(on), off: mean(off), restored: mean(restored) };
    };
    f.camera.position.set(0.5, 450, 8);
    f.camera.up.set(0, 1, 0);
    f.camera.lookAt(0.5, 450, 10);
    f.camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), f.camera);
    const hit = ray.intersectObjects(f.scene.children, true)[0];
    let ancestor = hit?.object;
    while (ancestor && ancestor !== corridor) ancestor = ancestor.parent;
    if (!hit || ancestor !== corridor || Math.abs(Math.hypot(hit.point.x, hit.point.z) - 10) > 0.02) {
      throw new Error("Center ray does not hit the Sunline corridor floor at radius 10");
    }
    const floor = compare();
    const theta = Math.PI + 100 / f.layouts.RADIUS;
    f.camera.position.copy(surfacePos(theta, 450, 2));
    f.camera.up.set(0, 1, 0);
    f.camera.lookAt(surfacePos(theta, 450, 0.025));
    f.camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(0, 0), f.camera);
    const pathHit = ray.intersectObjects(f.scene.children, true)[0];
    const reserve = f.scene.getObjectByName("stillwater_reserve");
    if (!pathHit || pathHit.object.parent !== reserve || pathHit.object.material.transparent) {
      throw new Error("Center ray does not hit an opaque reserve path");
    }
    const path = compare();
    return { floor, path };
  });
  expect(samples.floor.off).toBeGreaterThan(1);
  expect(Math.abs(samples.floor.on - samples.floor.off)).toBeLessThanOrEqual(1);
  expect(Math.abs(samples.floor.restored - samples.floor.on)).toBeLessThanOrEqual(1);
  expect(samples.path.on - samples.path.off).toBeGreaterThan(1);
  expect(Math.abs(samples.path.restored - samples.path.on)).toBeLessThanOrEqual(1);
});

test("losing the real WebGL context at the ready intro disables entry controls", async ({ page }) => {
  test.setTimeout(timeout);
  await page.goto("/");
  await expect(page.locator("#start-reservoir")).toBeEnabled();
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("WEBGL_lose_context unavailable");
    extension.loseContext();
  });
  for (const id of ["start", "start-city", "start-greenway", "start-reservoir"]) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
});

for (const viewport of [{ width: 1100, height: 760 }, { width: 375, height: 600 }]) {
test(`native intro arrival, public map targets, and pause-menu visit at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
  test.setTimeout(timeout);
  const context = await browser.newContext({ viewport });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#start-reservoir")).toBeEnabled();
    await page.locator("#start-reservoir").click();
    await expect(page.locator("#pause")).toBeVisible();
    await page.evaluate(async ({ radius, eyeHeight }) => {
      const url = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/three\.js\?/.test(name));
      const { Scene, Vector3 } = await import(url);
      const direction = new Vector3();
      const prior = Scene.prototype.onAfterRender;
      Scene.prototype.onAfterRender = function (renderer, scene, camera) {
        prior?.call(this, renderer, scene, camera);
        camera.getWorldDirection(direction);
        const theta = Math.atan2(camera.position.x, -camera.position.z);
        window.__reserveView = { theta, y: camera.position.y, height: radius - Math.hypot(camera.position.x, camera.position.z) - eyeHeight,
          yaw: Math.atan2(direction.x * Math.cos(theta) + direction.z * Math.sin(theta), direction.y),
          pitch: Math.asin(Math.max(-1, Math.min(1, -direction.x * Math.sin(theta) + direction.z * Math.cos(theta)))) };
      };
    }, { radius: RADIUS, eyeHeight: EYE_HEIGHT });
    await page.waitForFunction(() => Boolean(window.__reserveView), null, { timeout });
    const arrival = await page.evaluate(() => window.__reserveView);
    const expectArrival = (view) => {
      expect(Math.abs(Math.atan2(Math.sin(view.theta - RESERVOIR_ARRIVAL.theta), Math.cos(view.theta - RESERVOIR_ARRIVAL.theta)))).toBeLessThan(0.01);
      expect(view.y).toBeCloseTo(RESERVOIR_ARRIVAL.y, 1);
      expect(view.height).toBeCloseTo(RESERVOIR_ARRIVAL.height, 1);
      expect(view.yaw).toBeCloseTo(RESERVOIR_ARRIVAL.yaw, 2);
      expect(view.pitch).toBeCloseTo(0, 2);
    };
    expectArrival(arrival);
    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    const bounds = await page.locator("#habitat-map").evaluate((map) => {
      const zones = map.querySelector(".map-zones-layer");
      if (![...zones.querySelectorAll("text")].some((el) => el.textContent === "Stillwater Reserve")) throw new Error("Reserve zone label missing");
      const pins = [...map.querySelectorAll('[data-marker-id^="stillwater-"] .map-pin-hit')].map((el) => ({ x: Number(el.getAttribute("cx")), y: Number(el.getAttribute("cy")) }));
      if (pins.length !== 3) throw new Error("Reserve pins missing");
      const candidates = [...zones.querySelectorAll("rect.map-zone-district")].map((rect) =>
        Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Number(rect.getAttribute(key))]))
      ).filter((rect) => pins.every(({ x, y }) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height));
      if (candidates.length !== 1) throw new Error("Expected one district zone containing reserve pins");
      return candidates[0];
    });
    let previousDestination = null;
    for (const destination of RESERVOIR_TARGETS) {
      const pin = await page.locator(`[data-marker-id="${destination.id}"] .map-pin-hit`).evaluate((el) => ({ x: Number(el.getAttribute("cx")), y: Number(el.getAttribute("cy")) }));
      expect(pin.x).toBeGreaterThanOrEqual(bounds.x);
      expect(pin.x).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(pin.y).toBeGreaterThanOrEqual(bounds.y);
      expect(pin.y).toBeLessThanOrEqual(bounds.y + bounds.height);
      await page.locator(`button[data-destination-id="${destination.id}"]`).click();
      await expect(page.locator("#habitat-map-active-waypoint")).toContainText(destination.name);
      await expect(page.locator(`button[data-destination-id="${destination.id}"]`)).toHaveAttribute("aria-pressed", "true");
      if (previousDestination) await expect(page.locator(`button[data-destination-id="${previousDestination}"]`)).toHaveAttribute("aria-pressed", "false");
      previousDestination = destination.id;
    }
    for (const layer of ["service", "axial"]) {
      await page.locator(`[data-map-layer="${layer}"]`).click();
      await expect(page.locator(".map-zones-layer")).not.toContainText("Stillwater Reserve");
    }
    await page.locator('[data-map-layer="surface"]').click();
    await page.locator("#map-close").click();
    await expect(page.locator("#waypoint-label")).toContainText(RESERVOIR_TARGETS.at(-1).name);
    const beforeWalk = await page.evaluate(() => window.__reserveView);
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(({ before, radius }) => {
        const current = window.__reserveView;
        const arc = Math.atan2(Math.sin(current.theta - before.theta), Math.cos(current.theta - before.theta)) * radius;
        return current.y - before.y > 1 && Math.abs(arc) < 0.1;
      }, { before: beforeWalk, radius: RADIUS }, { timeout });
    } finally {
      await page.keyboard.up("KeyW");
    }
    const beforeJump = await page.evaluate(() => window.__reserveView.height);
    await page.keyboard.down("Space");
    try {
      await page.waitForFunction((height) => window.__reserveView.height > height + 0.2, beforeJump, { timeout });
    } finally {
      await page.keyboard.up("Space");
    }
    await page.waitForFunction((height) => {
      const now = performance.now();
      if (Math.abs(window.__reserveView.height - height) >= 0.05) {
        window.__landingSince = null;
        return false;
      }
      window.__landingSince ??= now;
      return now - window.__landingSince >= 500;
    }, beforeJump, { timeout });
    const beforeStrafe = await page.evaluate(() => window.__reserveView);
    await page.keyboard.down("KeyA");
    try {
      await page.waitForFunction(({ theta, radius }) => Math.abs(Math.atan2(Math.sin(window.__reserveView.theta - theta), Math.cos(window.__reserveView.theta - theta)) * radius) > 1,
        { theta: beforeStrafe.theta, radius: RADIUS }, { timeout });
    } finally {
      await page.keyboard.up("KeyA");
    }
    await page.keyboard.down("ArrowLeft");
    await page.keyboard.down("ArrowUp");
    try {
      await page.waitForFunction(() => Math.abs(window.__reserveView.yaw) > 0.1 && Math.abs(window.__reserveView.pitch) > 0.1, null, { timeout });
    } finally {
      await page.keyboard.up("ArrowLeft");
      await page.keyboard.up("ArrowUp");
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.locator("#teleport-reservoir").click();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await expect(page.locator("#pause")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__reserveView.y), { timeout }).toBeCloseTo(RESERVOIR_ARRIVAL.y, 1);
    expectArrival(await page.evaluate(() => window.__reserveView));
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
}
