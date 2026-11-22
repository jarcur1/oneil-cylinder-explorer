import { test, expect } from "@playwright/test";
import { EYE_HEIGHT, RADIUS } from "../src/habitat.js";
import { RESERVOIR_LAYOUT, RESERVOIR_THETA, reservoirY } from "../src/reservoir-layout.js";
import { MAIN_LIFT } from "../src/city-layout.js";

const lookout = RESERVOIR_LAYOUT.lookout;
const views = [
  { name: "station-path", theta: RESERVOIR_THETA, y: reservoirY(-106), height: 0 },
  { name: "lookout", theta: RESERVOIR_THETA + lookout.s / RADIUS, y: reservoirY(lookout.y), height: lookout.top },
];

test("both Stillwater viewpoints see the Gate pylons, plaza ring, and transit roof", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/checks/world.html");
  await page.waitForFunction(() => Boolean(window.__worldFixture));
  for (const view of views) {
    const result = await page.evaluate(async ({ view, eyeHeight, radius, tower }) => {
      const f = window.__worldFixture;
      const { surfacePos, surfaceUp } = await import("/src/surface.js");
      const url = performance.getEntriesByType("resource").find(({ name }) => /\/three\.js\?/.test(name)).name;
      const { Raycaster } = await import(url);
      f.player.teleport({ ...view, yaw: 0 });
      let state;
      for (let frame = 0; frame < 10; frame++) state = f.step(1 / 60, { updateWorld: false });
      const eye = surfacePos(state.theta, state.y, state.height + eyeHeight);
      const up = surfaceUp(state.theta);
      const points = [
        [tower.theta - 7.5 / radius, tower.y, 80],
        [tower.theta + 7.5 / radius, tower.y - 3, 75],
        [tower.theta, tower.y - 5, 48.5], // The roof must be visible through the open slot.
        [-18 / radius, tower.y - 40, 0.068],
        [18 / radius, tower.y - 40, 0.068],
        [58 / radius, tower.y + 63, 52],
      ];
      f.scene.updateMatrixWorld(true);
      const hits = points.map(([theta, y, height]) => {
        const direction = surfacePos(theta, y, height).sub(eye).normalize();
        const ray = new Raycaster(eye, direction);
        const hit = ray.intersectObjects(f.scene.children, true).find(({ object }) => {
          for (let node = object; node; node = node.parent) if (!node.visible) return false;
          return true;
        });
        return { name: hit?.object.name || hit?.object.parent.name, pitch: Math.asin(direction.dot(up)) };
      });
      const gate = surfacePos(tower.theta, tower.y, 65);
      const direction = gate.clone().sub(eye);
      const west = -Math.cos(state.theta) * direction.x - Math.sin(state.theta) * direction.z;
      f.camera.position.copy(eye);
      f.camera.up.copy(up);
      f.camera.lookAt(gate);
      f.camera.updateMatrixWorld();
      f.render();
      return { grounded: state.grounded, height: state.height, hits, north: direction.y, west };
    }, { view, eyeHeight: EYE_HEIGHT, radius: RADIUS, tower: MAIN_LIFT });
    expect(result.grounded).toBe(true);
    expect(result.north).toBeGreaterThan(0);
    expect(result.west).toBeGreaterThan(0);
    expect(result.height).toBeCloseTo(view.height, 4);
    expect(result.hits.map(({ name }) => name)).toEqual([
      "meridian_gate_crown", "meridian_gate_crown", "civic_tower_crown",
      "meridian_plaza_ring", "meridian_plaza_ring", "meridian_transit_roof",
    ]);
    expect(Math.max(...result.hits.map(({ pitch }) => pitch))).toBeLessThan(1.5);
    await page.screenshot({ path: testInfo.outputPath(`meridian-from-${view.name}.png`) });
  }
});
