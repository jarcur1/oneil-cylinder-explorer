import { test, expect } from "@playwright/test";
import { RADIUS } from "../src/habitat.js";
import { RESERVOIR_THETA, RESERVOIR_Y } from "../src/reservoir-layout.js";

const budget = process.env.HABITAT_REAL_GPU === "1" ? 60_000 : 180_000;

async function observeView(page) {
  await page.evaluate(async ({ radius, theta, originY }) => {
    const resource = performance.getEntriesByType("resource")
      .find(({ name }) => /\/three\.js\?/.test(name));
    const { Scene } = await import(resource.name);
    const previous = Scene.prototype.onAfterRender;
    Scene.prototype.onAfterRender = function (renderer, scene, camera) {
      previous?.call(this, renderer, scene, camera);
      const { x, y, z } = camera.position;
      const t = Math.atan2(x, -z) - theta;
      window.__surveyView = {
        s: Math.atan2(Math.sin(t), Math.cos(t)) * radius,
        y: y - originY,
        h: radius - Math.hypot(x, z),
        rotation: camera.quaternion.toArray(),
      };
    };
  }, { radius: RADIUS, theta: RESERVOIR_THETA, originY: RESERVOIR_Y });
  await page.waitForFunction(() => Boolean(window.__surveyView), null, { timeout: budget });
}

async function holdUntil(page, code, axis, target, sign = 1) {
  await page.keyboard.down(code);
  try {
    await page.waitForFunction(({ axis, target, sign }) =>
      sign * (window.__surveyView?.[axis] ?? NaN) >= sign * target,
    { axis, target, sign }, { timeout: budget });
  } finally {
    await page.keyboard.up(code);
  }
}

const readView = (page) => page.evaluate(() => window.__surveyView);

test("launch from Stillwater, fly above the reserve, and return without moving the operator", async ({ page }, testInfo) => {
  test.setTimeout(10 * budget);
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
  await page.locator("#start-reservoir").click();
  await observeView(page);
  await page.keyboard.press("KeyE");
  await expect(page.locator("#drone-hud")).toBeHidden();

  await holdUntil(page, "KeyW", "y", -100);
  await holdUntil(page, "KeyA", "s", -72, -1);
  await holdUntil(page, "KeyW", "y", -85);
  await holdUntil(page, "KeyD", "s", -68);
  const prompt = page.locator("#interaction:visible #interaction-label");
  await expect(prompt).toHaveText(/launch survey drone/i);
  const ground = await readView(page);
  const saveBefore = await page.evaluate(() => localStorage.getItem("new-dawn.save.v1"));
  const drone = page.locator("#drone-hud");

  await page.keyboard.press("KeyE");
  await expect(drone).toBeVisible();
  await expect.poll(async () => (await readView(page)).h).toBeGreaterThan(10);
  const launched = await readView(page);
  await holdUntil(page, "KeyW", "s", launched.s + 12);
  await holdUntil(page, "Space", "h", 125);
  await holdUntil(page, "KeyQ", "h", 108, -1);
  await expect.poll(async () => parseFloat(await page.locator("#gravity").textContent())).toBeLessThan(0.75);
  const beforeLook = await readView(page);
  await page.keyboard.down("ArrowDown");
  try {
    await expect.poll(async () => {
      const { rotation } = await readView(page);
      return Math.abs(rotation.reduce((dot, value, i) => dot + value * beforeLook.rotation[i], 0));
    }).toBeLessThan(Math.cos(0.2));
  } finally {
    await page.keyboard.up("ArrowDown");
  }
  await page.screenshot({ path: testInfo.outputPath("stillwater-survey-flight.png") });
  await page.keyboard.press("KeyE");
  await expect(drone).toBeVisible();
  await page.keyboard.press("KeyR");
  await expect(drone).toBeHidden();
  await expect.poll(readView.bind(null, page)).toEqual(ground);

  await page.keyboard.press("KeyE");
  await expect(drone).toBeVisible();
  await page.keyboard.press("KeyG");
  await expect(page.locator("#habitat-map")).toBeVisible();
  await expect(drone).toBeHidden();
  await page.locator("#map-close").click();
  await expect(prompt).toHaveText(/launch survey drone/i);
  await expect.poll(readView.bind(null, page)).toEqual(ground);

  await page.keyboard.press("KeyE");
  await expect(drone).toBeVisible();
  await page.locator("#drone-return").focus();
  await page.keyboard.press("Enter");
  await expect(drone).toBeHidden();
  await expect.poll(readView.bind(null, page)).toEqual(ground);

  await page.keyboard.press("KeyE");
  await expect(drone).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-panel")).toBeVisible();
  await expect(drone).toBeHidden();
  await page.locator("#resume").click();
  await expect(prompt).toHaveText(/launch survey drone/i);
  await expect.poll(readView.bind(null, page)).toEqual(ground);
  expect(await page.evaluate(() => localStorage.getItem("new-dawn.save.v1"))).toBe(saveBefore);
  expect(errors).toEqual([]);
});
