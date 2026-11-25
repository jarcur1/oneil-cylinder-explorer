import { test, expect } from "@playwright/test";
import { RADIUS, EYE_HEIGHT } from "../src/habitat.js";
import { RESERVOIR_THETA, RESERVOIR_Y, STILLWATER_LENS } from "../src/reservoir-layout.js";

const timeout = process.env.HABITAT_REAL_GPU === "1" ? 120_000 : 500_000;
const view = (page) => page.evaluate(() => window.__lensView);

async function walkTo(page, code, axis, target, sign = 1, sprint = false) {
  if (sprint) await page.keyboard.down("ShiftLeft");
  await page.keyboard.down(code);
  try {
    await page.waitForFunction(({ axis, target, sign }) =>
      sign * (window.__lensView?.[axis] ?? NaN) >= sign * target,
    { axis, target, sign }, { timeout: timeout / 3 });
  } finally {
    await page.keyboard.up(code);
    if (sprint) await page.keyboard.up("ShiftLeft");
  }
}

test("follow the east trail, use the real telescope, and return to the same place", async ({ page }, testInfo) => {
  test.setTimeout(timeout);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#start-reservoir").click();
  await page.evaluate(async ({ radius, theta, originY }) => {
    const moduleUrl = performance.getEntriesByType("resource").find(({ name }) => /\/three\.js\?/.test(name)).name;
    const { Scene } = await import(moduleUrl);
    const previous = Scene.prototype.onAfterRender;
    Scene.prototype.onAfterRender = function (renderer, scene, camera) {
      previous?.call(this, renderer, scene, camera);
      const { x, y, z } = camera.position;
      const t = Math.atan2(x, -z) - theta;
      window.__lensView = {
        s: Math.atan2(Math.sin(t), Math.cos(t)) * radius,
        y: y - originY,
        h: radius - Math.hypot(x, z),
        rotation: camera.quaternion.toArray(),
        fov: camera.fov,
      };
    };
  }, { radius: RADIUS, theta: RESERVOIR_THETA, originY: RESERVOIR_Y });

  const hud = page.locator("#optics-hud");
  const prompt = page.locator("#interaction:visible #interaction-label");
  await page.keyboard.press("KeyE");
  await expect(hud).toBeHidden();
  await walkTo(page, "KeyW", "y", -70, 1, true);
  await walkTo(page, "KeyD", "s", 100, 1, true);
  await walkTo(page, "KeyW", "y", 74, 1, true);
  await walkTo(page, "KeyA", "s", 82.6, -1);
  await expect(prompt).toHaveText(/look through the telescope/i);
  const standing = await view(page);
  expect(standing.h).toBeCloseTo(STILLWATER_LENS.deck.top + EYE_HEIGHT, 2);
  const saveBefore = await page.evaluate(() => localStorage.getItem("new-dawn.save.v1"));

  await page.keyboard.press("KeyE");
  await expect(hud).toBeVisible();
  await expect.poll(async () => (await view(page)).s).toBeCloseTo(STILLWATER_LENS.eyepoint.s, 3);
  const meridian = await view(page);
  await expect(page.locator("#optics-title")).toContainText(/meridian/i);
  await page.screenshot({ path: testInfo.outputPath("lens-meridian.png") });
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#optics-title")).toContainText(/sunline/i);
  await expect.poll(async () => (await view(page)).rotation).not.toEqual(meridian.rotation);
  const sunline = await view(page);
  await page.screenshot({ path: testInfo.outputPath("lens-sunline.png") });
  await page.keyboard.press("Digit3");
  await expect(page.locator("#optics-title")).toContainText(/basin/i);
  await expect.poll(async () => (await view(page)).rotation).not.toEqual(sunline.rotation);
  const basin = await view(page);
  expect(basin.fov).toBeGreaterThan(meridian.fov);
  await page.screenshot({ path: testInfo.outputPath("lens-basin.png") });

  await page.keyboard.down("KeyW");
  await page.keyboard.press("KeyR");
  // A native key kept down sends repeat keydowns after returning.
  await page.keyboard.down("KeyW");
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.up("KeyW");
  await expect(hud).toBeHidden();
  await expect.poll(view.bind(null, page)).toEqual(standing);

  await page.keyboard.press("KeyE");
  await expect(hud).toBeVisible();
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.locator("#optics-basin").click();
  await expect(page.locator("#optics-title")).toContainText(/basin/i);
  await expect(page.locator("#optics-basin")).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("lens-portrait.png") });
  await page.locator("#optics-return").focus();
  await page.keyboard.press("Enter");
  await expect(hud).toBeHidden();
  await page.setViewportSize(desktop);
  await expect.poll(view.bind(null, page)).toEqual(standing);

  await page.keyboard.press("KeyE");
  await expect(hud).toBeVisible();
  await page.keyboard.press("KeyG");
  await expect(page.locator("#habitat-map")).toBeVisible();
  await expect(hud).toBeHidden();
  await page.locator("#map-close").click();
  await expect(prompt).toHaveText(/look through the telescope/i);
  await expect.poll(view.bind(null, page)).toEqual(standing);

  await page.keyboard.press("KeyE");
  await expect(hud).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await expect(hud).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("new-dawn.save.v1"))).toBe(saveBefore);
  expect(errors).toEqual([]);
});

test("the observatory is visible from the approach, with a clear raised deck", async ({ page }, testInfo) => {
  test.setTimeout(timeout);
  await page.setViewportSize({ width: 1200, height: 760 });
  await page.goto("/checks/world.html");
  await page.waitForFunction(() => Boolean(window.__worldFixture));
  const result = await page.evaluate(async () => {
    const f = window.__worldFixture;
    const { RADIUS } = await import("/src/habitat.js");
    const { surfacePos, surfaceUp } = await import("/src/surface.js");
    const { reservoirS, reservoirY, STILLWATER_LENS } = await import("/src/reservoir-layout.js");
    const { canUseOptics } = await import("/src/stillwater-optics.js");
    f.player.teleport({ theta: reservoirS(100) / RADIUS, y: reservoirY(74), height: 0, yaw: -Math.PI / 2 });
    const onTrail = f.step(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    let atTelescope;
    for (let i = 0; i < 190; i++) {
      const state = f.step(1 / 60, { updateWorld: false });
      if (canUseOptics(state)) { atTelescope = state; break; }
    }
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    const put = (s, y, height) =>
      f.player.teleport({ theta: reservoirS(s) / RADIUS, y: reservoirY(y), height, yaw: 0 });
    const step = () => f.step(1 / 60, { updateWorld: false });
    put(98, 76.44, 2.5);
    let cheek;
    for (let i = 0; i < 100; i++) cheek = step().height;
    const jump = (s, y) => {
      put(s, y, STILLWATER_LENS.deck.top);
      step();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      let apex = step().height;
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
      for (let i = 0; i < 70; i++) apex = Math.max(apex, step().height);
      return apex;
    };
    const openApex = jump(86, 74);
    const canopyApex = jump(89.5, 68.5);
    const theta = reservoirS(106) / RADIUS;
    f.camera.position.copy(surfacePos(theta, reservoirY(63), 3.1));
    f.camera.up.copy(surfaceUp(theta));
    f.camera.lookAt(surfacePos(reservoirS(85) / RADIUS, reservoirY(75), 2.4));
    f.render();
    return { trailAccess: canUseOptics(onTrail), floor: atTelescope?.height, cheek, openApex, canopyApex };
  });
  expect(result.trailAccess).toBe(false);
  expect(result.floor).toBeCloseTo(STILLWATER_LENS.deck.top, 4);
  expect(result.cheek).toBeCloseTo(0.96, 4);
  expect(result.openApex - result.canopyApex).toBeGreaterThan(1);
  await page.screenshot({ path: testInfo.outputPath("stillwater-lens-deck.png") });
});
