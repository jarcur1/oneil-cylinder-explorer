import { test, expect } from "@playwright/test";
import { RADIUS } from "../src/habitat.js";
import { SAVE_KEY } from "../src/save-game.js";

test.use({ screenshot: "only-on-failure" });

// SwiftShader can take over a second per rendered frame on this authored world.
// Extend wall-clock budgets, never the simulation rate or tram timetable.
const softwareRendering = process.env.HABITAT_REAL_GPU !== "1";
const walkTimeout = softwareRendering ? 600_000 : 120_000;
const timetableTimeout = softwareRendering ? 1_800_000 : 420_000;

// Observe the real rendered camera, without exposing or changing app state.
// Movement, interactions, timetable, saving and reloading remain native.
async function observeCamera(page) {
  await page.evaluate(async (radius) => {
    const url = performance.getEntriesByType("resource").map((entry) => entry.name)
      .find((name) => /\/three\.js\?/.test(name));
    if (!url) throw new Error("Actual Three.js resource was not observed");
    const { Scene } = await import(url);
    const prior = Scene.prototype.onAfterRender;
    let planting;
    Scene.prototype.onAfterRender = function (renderer, scene, camera) {
      prior?.call(this, renderer, scene, camera);
      window.__supplyEye = {
        s: Math.atan2(camera.position.x, -camera.position.z) * radius,
        reserveS: Math.atan2(-camera.position.x, camera.position.z) * radius,
        y: camera.position.y,
      };
      planting ??= scene.getObjectByName("stillwater_planted_seedlings");
      window.__plantedSeedlings = Boolean(planting?.visible && planting.children.length);
    };
  }, RADIUS);
  await page.waitForFunction(() => Boolean(window.__supplyEye));
}

async function walk(page, axis, target, sprint = false) {
  const start = await page.evaluate((key) => window.__supplyEye[key], axis);
  if (Math.abs(start - target) < 0.2) return;
  const direction = Math.sign(target - start);
  const key = axis !== "y" ? (direction > 0 ? "KeyD" : "KeyA")
    : (direction > 0 ? "KeyW" : "KeyS");
  if (sprint) await page.keyboard.down("ShiftLeft");
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ axis, target, direction }) =>
      direction * window.__supplyEye[axis] >= direction * target,
    { axis, target, direction }, { timeout: walkTimeout });
  } catch (error) {
    const evidence = await page.evaluate(() => ({
      eye: window.__supplyEye,
      position: document.getElementById("position").textContent,
      motion: document.getElementById("motion").textContent,
    }));
    throw new Error(`Native walk ${axis} -> ${target}: ${JSON.stringify(evidence)}`, { cause: error });
  } finally {
    await page.keyboard.up(key);
    if (sprint) await page.keyboard.up("ShiftLeft");
  }
}

const readSave = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);

async function transfer(page, action, stop) {
  const boarding = action === "Board";
  const prompt = page.locator("#interaction:visible #interaction-label");
  const height = page.locator("#height");
  const destination = boarding ? "13.0 m UP" : "0.0 m UP";
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(prompt).toHaveText(`${action} tram at ${stop}`, { timeout: timetableTimeout });
    await page.keyboard.press("KeyE");
    try {
      await expect(height).toHaveText(destination, { timeout: 30_000 });
      await expect(page.locator("#motion")).toHaveText(boarding ? /tram/i : /on foot|walking/i);
      return;
    } catch (error) {
      // The doors can close between observing the prompt and sending E.
      if (attempt !== 0 || await height.textContent() !== (boarding ? "0.0 m UP" : "13.0 m UP")) throw error;
    }
  }
}

test("native delivery chain earns cargo, rides both lines, and restores the planted bed", async ({ browser }, testInfo) => {
  test.setTimeout(softwareRendering ? 3_600_000 : 1_200_000);
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.locator("#start-greenway").click();
    await expect(page.locator("#pause")).toBeVisible();
    await observeCamera(page);

    await test.step("Walk the real collection and glasshouse-door route; require separate produce pickup", async () => {
      // Approach the table from the west, clear of the lamp and gantry column.
      await walk(page, "y", -472, true);
      await walk(page, "y", -460);
      await walk(page, "s", 4.1);
      await expect(page.locator("#interaction-label")).toHaveText("Pick up seed crate");
      await page.keyboard.press("KeyE");
      await expect(page.locator("#inventory-label")).toHaveText("Heritage seed crate");
      await walk(page, "y", -465);
      await walk(page, "s", 64, true);
      await walk(page, "y", -434);
      await expect(page.locator("#interaction-label")).toHaveText("Deliver seed crate");
      await page.keyboard.press("KeyE");
      await expect(page.locator("#job")).toHaveAttribute("data-run", "produce");
      await expect(page.locator("#job")).toHaveAttribute("data-phase", "available");
      await expect(page.locator("#inventory")).toBeHidden();
      expect(await readSave(page)).toMatchObject({ deliveryPhase: "complete", supplyPhase: "available" });
      await expect(page.locator("#interaction-label")).toHaveText("Collect produce crate");
      await page.keyboard.press("KeyE");
      await expect(page.locator("#inventory-label")).toHaveText("Fresh produce crate");
      expect(await readSave(page)).toMatchObject({ deliveryPhase: "complete", supplyPhase: "carrying" });
      await page.keyboard.press("KeyG");
      await page.locator('[data-job-id="delivery"]').click();
      await page.locator("#map-close").click();
      await expect(page.locator("#waypoint")).toBeVisible();
    });

    await test.step("Carry produce through the south door and aboard the real scheduled tram", async () => {
      await walk(page, "y", -465);
      await walk(page, "s", 2.7, true);
      await walk(page, "y", -434, true);
      await transfer(page, "Board", "Glasshouse 01");
      await expect(page.locator("#inventory")).toBeVisible();
      await expect(page.locator("#inventory-label")).toHaveText("Fresh produce crate");
      await page.screenshot({ path: testInfo.outputPath("produce-aboard-tram.png") });
      await transfer(page, "Exit", "Meridian Plaza");
      await expect(page.locator("#gravity")).toHaveText("1.000 G");
      await walk(page, "y", 438.8);
      await walk(page, "s", 18);
      await walk(page, "y", 442);
      await expect(page.locator("#interaction-label")).toHaveText("Deliver produce crate");
      await page.screenshot({ path: testInfo.outputPath("meridian-produce-receiver.png") });
    });

    await test.step("Reload earned produce and unlock the Stillwater run", async () => {
      await page.reload();
      await expect(page.locator("#inventory")).toBeHidden();
      await page.locator("#start-city").click();
      await expect(page.locator("#inventory-label")).toHaveText("Fresh produce crate");
      await observeCamera(page);
      await walk(page, "y", 438.8);
      await walk(page, "s", 18);
      await walk(page, "y", 442);
      await expect(page.locator("#interaction-label")).toHaveText("Deliver produce crate");
      await page.keyboard.press("KeyE");
      await expect(page.locator("#job")).toHaveAttribute("data-run", "planting");
      await expect(page.locator("#job")).toHaveAttribute("data-phase", "available");
      await expect(page.locator("#inventory")).toBeHidden();
      expect(await readSave(page)).toMatchObject({ deliveryPhase: "complete", supplyPhase: "complete", plantingPhase: "available" });
    });

    const transferWithTray = async (action, stop) => {
      await transfer(page, action, stop);
      await expect(page.locator("#inventory-label")).toHaveText("Woodland seedling tray");
    };

    await test.step("Dispatch seedlings, then travel via Meridian Plaza and Meridian South", async () => {
      await page.reload();
      await page.locator("#start-greenway").click();
      await observeCamera(page);
      await walk(page, "y", -465, true);
      await walk(page, "s", 64, true);
      await walk(page, "y", -434);
      await expect(page.locator("#interaction-label")).toHaveText("Collect seedling tray");
      await page.keyboard.press("KeyE");
      await expect(page.locator("#inventory-label")).toHaveText("Woodland seedling tray");
      expect(await readSave(page)).toMatchObject({ plantingPhase: "carrying" });
      await page.keyboard.press("KeyG");
      await page.locator('[data-job-id="delivery"]').click();
      await page.locator("#map-close").click();
      await expect(page.locator("#waypoint-label")).toContainText("Glasshouse 01");
      await walk(page, "y", -465);
      await walk(page, "s", 2.7, true);
      await walk(page, "y", -434, true);
      await transferWithTray("Board", "Glasshouse 01");
      await transferWithTray("Exit", "Meridian Plaza");
      await expect(page.locator("#waypoint-label")).toContainText("Meridian South");
      await walk(page, "s", 0);
      await walk(page, "y", 337.3, true);
      await walk(page, "s", 16);
      await transferWithTray("Board", "Meridian South");
      await transferWithTray("Exit", "Stillwater Reserve");
      await expect(page.locator("#waypoint-label")).toContainText("Stillwater restoration plot");
    });

    await test.step("Plant at the reachable bed, reload its saplings, then reset", async () => {
      await walk(page, "reserveS", 0);
      await walk(page, "y", 360);
      await walk(page, "reserveS", 2.8);
      await expect(page.locator("#interaction:visible #interaction-label")).toHaveText("Plant seedlings");
      await page.reload();
      await expect(page.locator("#inventory")).toBeHidden();
      await page.locator("#start-reservoir").click();
      await expect(page.locator("#inventory-label")).toHaveText("Woodland seedling tray");
      await observeCamera(page);
      await page.keyboard.press("KeyG");
      await page.locator('[data-job-id="delivery"]').click();
      await page.locator("#map-close").click();
      await walk(page, "y", 360);
      await walk(page, "reserveS", 2.8);
      await expect(page.locator("#interaction:visible #interaction-label")).toHaveText("Plant seedlings");
      expect(await page.evaluate(() => window.__plantedSeedlings)).toBe(false);
      await page.keyboard.press("KeyE");
      await expect(page.locator("#job")).toHaveAttribute("data-phase", "complete");
      await expect(page.locator("#inventory")).toBeHidden();
      await expect(page.locator("#waypoint")).toBeHidden();
      await page.keyboard.press("KeyG");
      await expect(page.locator("#map-clear")).toBeDisabled();
      await expect(page.locator('[data-job-id="delivery"]')).toHaveAttribute("aria-pressed", "false");
      await page.locator("#map-close").click();
      expect(await readSave(page)).toMatchObject({ plantingPhase: "complete" });
      await expect.poll(() => page.evaluate(() => window.__plantedSeedlings)).toBe(true);
      await walk(page, "y", 354);
      await page.screenshot({ path: testInfo.outputPath("stillwater-planted.png") });
      await page.reload();
      await page.locator("#start-reservoir").click();
      await observeCamera(page);
      await expect(page.locator("#job")).toHaveAttribute("data-run", "planting");
      await expect.poll(() => page.evaluate(() => window.__plantedSeedlings)).toBe(true);
      await expect(page.locator("#job")).toHaveAttribute("data-phase", "complete");
      await expect(page.locator("#inventory")).toBeHidden();
      await page.keyboard.press("Escape");
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#new-game").click();
      await expect.poll(async () => (await readSave(page))?.deliveryPhase).toBe("available");
      expect(await readSave(page)).toMatchObject({ deliveryPhase: "available", supplyPhase: "available", plantingPhase: "available" });
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
