import { test, expect } from "@playwright/test";

const frames = (page, count) => page.evaluate((count) => new Promise((resolve) => {
  const next = () => --count ? requestAnimationFrame(next) : resolve();
  requestAnimationFrame(next);
}), count);

async function tabTo(page, id) {
  for (let i = 0; i < 24; i++) {
    if (await page.evaluate((id) => document.activeElement?.id === id, id)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard could not reach ${id}`);
}

test("collapsed HUD stays usable with keyboard, map selection, pause and compact layout", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#start-greenway")).toBeEnabled();
    await expect(page.locator("#discovery-toggle")).toBeHidden();
    await expect(page.locator("#jobs-toggle")).toBeHidden();
    await page.locator("#start-greenway").click();
    await expect(page.locator("#pause")).toBeVisible();
    for (const kind of ["discovery", "jobs"]) {
      await expect(page.locator(`#${kind}-toggle`)).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(`#${kind}-details`)).toBeHidden();
      await expect(page.locator(`#${kind}-summary`)).toBeVisible();
    }
    await page.keyboard.press("Control+Alt+KeyJ");
    await page.keyboard.press("Control+Alt+KeyH");
    await expect(page.locator("#jobs-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#discovery-toggle")).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("KeyJ");
    await expect(page.locator("#jobs-details")).toBeVisible();
    await expect(page.locator("#jobs-summary")).toBeHidden();
    await page.keyboard.press("KeyJ");
    await tabTo(page, "jobs-toggle");
    await page.keyboard.press("Space");
    await expect(page.locator("#jobs-details")).toBeVisible();
    await frames(page, 12);
    await expect(page.locator("#height")).toHaveText("0.0 m UP");
    await expect(page.locator("#pause")).toBeVisible();
    await page.keyboard.press("KeyJ");
    await page.keyboard.press("KeyH");
    await expect(page.locator("#discovery-details")).toBeVisible();
    await expect(page.locator("#landmarks")).toBeVisible();

    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    await page.locator('button[data-job-id="maintenance"]').click();
    await page.keyboard.press("KeyH");
    await page.keyboard.press("KeyJ");
    await expect(page.locator("#discovery-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#jobs-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.locator("#map-close").click();
    await expect(page.locator("#jobs-summary")).toContainText(await page.locator("#maintenance-title").textContent());
    await expect(page.locator("#waypoint-label")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.locator("#resume").click();
    await expect(page.locator("#discovery-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#jobs-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("KeyH");
    await page.screenshot({ path: test.info().outputPath("collapsed-hud-desktop.png") });

    await page.setViewportSize({ width: 375, height: 600 });
    await frames(page, 3);
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth,
      cards: document.querySelector(".hud-cards").getBoundingClientRect().toJSON(),
    }));
    expect(layout.overflow).toBeLessThanOrEqual(layout.width);
    expect(layout.cards.bottom).toBeLessThan(300);
    await expect(page.locator("#waypoint-label")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("collapsed-hud-compact.png") });
    await page.keyboard.press("KeyH");
    await expect(page.locator("#landmarks")).toBeVisible();
    await page.keyboard.press("KeyH");
    await page.keyboard.press("PageDown");
    await expect(page.locator("#jobs-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#jobs-details")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("real station canvases show visit forecasts and repaint only when displayed service changes", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/checks/world.html");
    await page.waitForFunction(() => Boolean(window.__worldFixture));
    const result = await page.evaluate(() => {
      const { scene, world } = window.__worldFixture;
      const station = scene.getObjectByName("tram_station_tram-gateway");
      const textures = new Set();
      station.traverse((object) => {
        const texture = object.material?.map;
        if (texture?.image?.width > texture?.image?.height) textures.add(texture);
      });
      const maps = [...textures];
      const versions = () => maps.map((texture) => texture.version);
      const initial = versions();
      const output = {};
      world.tram.getStopStatus("tram-market", output);
      world.tram.getState({});
      const afterReads = versions();
      world.tram.update(0.1);
      const sameSecond = versions();
      world.tram.update(0.95);
      const nextSecond = versions();
      world.tram.update(18.4);
      const beforeClosing = versions();
      const open = { ...world.tram.getStopStatus("tram-gateway", output) };
      world.tram.update(0.1);
      const closing = { ...world.tram.getStopStatus("tram-gateway", output) };
      const afterClosing = versions();
      const statusBeforePause = world.tram.getState({});
      world.tram.update(0);
      const pause = versions();
      return { initial, afterReads, sameSecond, nextSecond, beforeClosing, afterClosing, pause,
        open, closing, statusBeforePause, statusAfterPause: world.tram.getState({}) };
    });
    expect(result.initial.length).toBeGreaterThan(0);
    expect(result.afterReads).toEqual(result.initial);
    expect(result.sameSecond).toEqual(result.initial);
    for (let i = 0; i < result.initial.length; i++) {
      expect(result.nextSecond[i] - result.initial[i]).toBe(1);
      expect(result.afterClosing[i] - result.beforeClosing[i]).toBe(1);
    }
    expect(result.open.boardingOpen).toBe(true);
    expect(result.closing.boardingOpen).toBe(false);
    expect(result.closing.docked).toBe(true);
    expect(result.closing.arrivalIn).toBe(0);
    expect(result.pause).toEqual(result.afterClosing);
    expect(result.statusAfterPause).toEqual(result.statusBeforePause);
  } finally {
    await context.close();
  }
});
