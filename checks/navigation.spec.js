import { test, expect } from "@playwright/test";
import { LENGTH } from "../src/habitat.js";
import { DISTRICT_BOUNDS, DISTRICT_STOPS } from "../src/district-layout.js";
import { MAIN_LIFT, SKYWALK_LIFT } from "../src/city-layout.js";
import { SERVICE_ACCESS } from "../src/service-layout.js";
import { AXIAL_HEIGHT, ENDCAP_HUBS } from "../src/sunline-layout.js";
import { DELIVERY_STATIONS } from "../src/delivery-layout.js";
import {
  NAV_TARGETS,
  NAV_CONNECTIONS,
  projectMapPoint,
  getNavigationLayer,
} from "../src/navigation.js";

const waitFrames = (page, count = 2) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let left = n;
        const step = () => {
          if (--left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );

function wrappedDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function findTargetNearXY(theta, y, layer, { maxDeltaY = 2, excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds);
  return NAV_TARGETS.find(
    (t) =>
      t.layer === layer &&
      !excluded.has(t.id) &&
      Math.abs(wrappedDelta(t.theta, theta)) < 0.05 &&
      Math.abs(t.y - y) <= maxDeltaY,
  );
}

async function clickDestination(page, id) {
  const buttons = page
    .locator(`#habitat-map button[data-destination-id="${id}"]`)
    .filter({ visible: true });
  if ((await buttons.count()) > 0) {
    await buttons.first().click();
    return;
  }
  await page
    .locator(`#habitat-map [data-destination-id="${id}"]`)
    .filter({ visible: true })
    .first()
    .click();
}

async function expectDestinationVisible(page, id) {
  await expect(
    page
      .locator(`#habitat-map [data-destination-id="${id}"]`)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

async function expectDestinationFilteredOut(page, id) {
  const allSvgCount = await page
    .locator("#habitat-map svg [data-destination-id]")
    .count();
  if (allSvgCount > 0) {
    await expect(
      page
        .locator(`#habitat-map svg [data-destination-id="${id}"]`)
        .filter({ visible: true }),
    ).toHaveCount(0);
    return;
  }
  await expect(
    page
      .locator(`#habitat-map [data-destination-id="${id}"]`)
      .filter({ visible: true }),
  ).toHaveCount(0);
}

function parseFiniteMetres(text) {
  const trimmed = (text || "").trim();
  expect(trimmed).not.toBe("");
  expect(trimmed).not.toMatch(/NaN|Infinity/i);
  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*m\b/i);
  return match ? Number(match[1]) : null;
}

function boxesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

async function assertWaypointLayoutValid(page, width, height) {
  await expect(page.locator("#waypoint")).toBeVisible();
  await expect(page.locator("#waypoint-label")).toBeVisible();
  await expect(page.locator("#waypoint-distance")).toBeVisible();

  const labelText = (await page.locator("#waypoint-label").textContent())?.trim() || "";
  const distText = (await page.locator("#waypoint-distance").textContent())?.trim() || "";
  expect(labelText.length).toBeGreaterThan(0);
  expect(distText.length).toBeGreaterThan(0);
  expect(distText).not.toMatch(/NaN|Infinity/i);

  const pointerEvents = await page
    .locator("#waypoint")
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pointerEvents).toBe("none");

  const labelBox = await page.locator("#waypoint-label").boundingBox();
  const distBox = await page.locator("#waypoint-distance").boundingBox();
  expect(labelBox).not.toBeNull();
  expect(distBox).not.toBeNull();
  for (const box of [labelBox, distBox]) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5);
  }

  for (const selector of ["#pause", "#map-toggle", "#sound"]) {
    const control = page.locator(selector);
    if (await control.isVisible()) {
      const controlBox = await control.boundingBox();
      if (controlBox) {
        expect(boxesOverlap(labelBox, controlBox)).toBe(false);
        expect(boxesOverlap(distBox, controlBox)).toBe(false);
      }
    }
  }

  return { labelBox, distBox, labelText, distText };
}

function toPlotSvg(plotBox, theta, y) {
  const norm = projectMapPoint(theta, y);
  return {
    x: plotBox.x + norm.x * plotBox.width,
    y: plotBox.y + norm.y * plotBox.height,
  };
}

async function readTransitLinks(page) {
  return page.evaluate(() => {
    const plot = document.querySelector("#habitat-map svg .map-plot-bg");
    const plotBox = plot
      ? {
          x: Number(plot.getAttribute("x")),
          y: Number(plot.getAttribute("y")),
          width: Number(plot.getAttribute("width")),
          height: Number(plot.getAttribute("height")),
        }
      : null;
    const readItems = (selector) =>
      Array.from(document.querySelectorAll(selector)).map((el) => ({
        title: el.querySelector("title")?.textContent?.trim() || "",
        x1: el.hasAttribute("x1") ? Number(el.getAttribute("x1")) : null,
        y1: el.hasAttribute("y1") ? Number(el.getAttribute("y1")) : null,
        x2: el.hasAttribute("x2") ? Number(el.getAttribute("x2")) : null,
        y2: el.hasAttribute("y2") ? Number(el.getAttribute("y2")) : null,
        cx: el.hasAttribute("cx") ? Number(el.getAttribute("cx")) : null,
        cy: el.hasAttribute("cy") ? Number(el.getAttribute("cy")) : null,
      }));
    const pins = Object.fromEntries(
      Array.from(
        document.querySelectorAll("#habitat-map svg [data-marker-id]"),
      ).map((group) => {
        const hit = group.querySelector(".map-pin-hit");
        return [
          group.getAttribute("data-marker-id"),
          {
            cx: Number(hit?.getAttribute("cx")),
            cy: Number(hit?.getAttribute("cy")),
          },
        ];
      }),
    );
    return {
      plotBox,
      pins,
      trolley: readItems("#habitat-map svg .map-links-layer .map-link-trolley"),
      portal: readItems("#habitat-map svg .map-links-layer .map-link-portal"),
      vertical: readItems("#habitat-map svg .map-links-layer .map-link-vertical"),
    };
  });
}

async function tabToElement(page, selector, maxTabs = 40) {
  for (let i = 0; i < maxTabs; i++) {
    const matches = await page.evaluate((sel) => {
      const active = document.activeElement;
      return Boolean(active && active.matches(sel));
    }, selector);
    if (matches) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Did not reach focus on ${selector} within ${maxTabs} Tabs`);
}

test("map opens and closes cleanly from intro, playing, and paused states with focus trapping, Escape, and G", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 480 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("#start")).toBeEnabled();
    await expect(page.locator("#map-toggle")).toBeEnabled();
    await expect(page.locator("#map-toggle")).toHaveAttribute(
      "aria-controls",
      "habitat-map",
    );
    await expect(page.locator("#waypoint")).toBeHidden();

    await test.step("Intro: Ctrl+G ignored, G and #map-toggle open modal with focus trap, closing stays on intro", async () => {
      await page.keyboard.press("Control+KeyG");
      await expect(page.locator("#habitat-map")).toBeHidden();

      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#waypoint")).toBeHidden();

      const focusedInside = await page.evaluate(() =>
        document
          .getElementById("habitat-map")
          ?.contains(document.activeElement),
      );
      expect(focusedInside).toBe(true);

      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        const stillInside = await page.evaluate(() =>
          document
            .getElementById("habitat-map")
            ?.contains(document.activeElement),
        );
        expect(stillInside).toBe(true);
      }
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(() =>
          document
            .getElementById("habitat-map")
            ?.contains(document.activeElement),
        ),
      ).toBe(true);

      await page.locator("#map-close").click();
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#intro")).toBeVisible();
      await expect(page.locator("#pause")).toBeHidden();
      await expect(page.locator("#pause-panel")).toBeHidden();

      await page.locator("#map-toggle").click();
      await expect(page.locator("#habitat-map")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#intro")).toBeVisible();
      await expect(page.locator("#pause")).toBeHidden();
      await expect(page.locator("#pause-panel")).toBeHidden();
    });

    await test.step("Playing: map suppresses pause panel, blocks world E/job scroll, and Escape/G resume playing", async () => {
      await page.locator("#start").click();
      await expect(page.locator("#pause")).toBeVisible();
      await expect(page.locator("#crosshair")).toBeVisible();
      await expect(page.locator("#interaction")).toBeVisible();

      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#waypoint")).toBeHidden();

      const scrollBefore = await page.evaluate(() => {
        const stack = document.querySelector(".job-stack");
        return stack ? stack.scrollTop : 0;
      });
      await page.keyboard.press("PageDown");
      await page.keyboard.press("KeyE");
      await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/);
      const scrollAfter = await page.evaluate(() => {
        const stack = document.querySelector(".job-stack");
        return stack ? stack.scrollTop : 0;
      });
      expect(scrollAfter).toBe(scrollBefore);

      // Escape closes map before ordinary pause handler
      await page.keyboard.press("Escape");
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#pause")).toBeVisible();
      await expect(page.locator("#crosshair")).toBeVisible();
      await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/);

      // G toggles open and closed from playing
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#pause")).toBeVisible();
    });

    await test.step("Paused: opening map from pause returns to pause panel without starting gameplay", async () => {
      await page.keyboard.press("Escape");
      await expect(page.locator("#pause-panel")).toBeVisible();
      await expect(page.locator("#pause")).toBeHidden();

      await page.locator("#map-toggle").click();
      await expect(page.locator("#habitat-map")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#pause-panel")).toBeVisible();
      await expect(page.locator("#pause")).toBeHidden();

      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await page.locator("#map-close").click();
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#pause-panel")).toBeVisible();
      await expect(page.locator("#pause")).toBeHidden();

      await page.locator("#resume").click();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#pause")).toBeVisible();
    });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("three layer filters, known locations, lift/trolley links, job targets, and clear control work", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const skywalkLiftTarget = findTargetNearXY(
      SKYWALK_LIFT.theta,
      SKYWALK_LIFT.y,
      "surface",
    );
    const serviceSurfaceTarget = findTargetNearXY(
      SERVICE_ACCESS.theta,
      SERVICE_ACCESS.y,
      "surface",
    );
    const endcapRimTarget = findTargetNearXY(
      ENDCAP_HUBS[0].rim.theta,
      ENDCAP_HUBS[0].rim.y,
      "surface",
    );
    const endcapBRimTarget = findTargetNearXY(
      ENDCAP_HUBS[1].rim.theta,
      ENDCAP_HUBS[1].rim.y,
      "surface",
    );
    const mainLiftTarget = findTargetNearXY(
      MAIN_LIFT.theta,
      MAIN_LIFT.y,
      "surface",
      { excludeIds: ["civic-lobby", "skyroom"] },
    );
    const serviceSubTarget = findTargetNearXY(
      SERVICE_ACCESS.theta,
      SERVICE_ACCESS.y,
      "service",
    );
    const dockATarget = findTargetNearXY(
      ENDCAP_HUBS[0].dock.theta,
      ENDCAP_HUBS[0].dock.y,
      "axial",
      { maxDeltaY: 6, excludeIds: ["endcap-a-hub"] },
    );
    const dockBTarget = findTargetNearXY(
      ENDCAP_HUBS[1].dock.theta,
      ENDCAP_HUBS[1].dock.y,
      "axial",
      { maxDeltaY: 6, excludeIds: ["endcap-b-hub"] },
    );

    expect(skywalkLiftTarget).toBeTruthy();
    expect(serviceSurfaceTarget).toBeTruthy();
    expect(endcapRimTarget).toBeTruthy();
    expect(serviceSubTarget).toBeTruthy();
    expect(dockATarget).toBeTruthy();
    expect(dockBTarget).toBeTruthy();
    expect(endcapBRimTarget).toBeTruthy();
    expect(mainLiftTarget).toBeTruthy();
    const trolleyConn = NAV_CONNECTIONS.find((c) => c.type === "trolley");
    expect(trolleyConn).toBeTruthy();
    expect(
      NAV_CONNECTIONS.some(
        (c) =>
          Math.abs(c.from.y - c.to.y) > 1000 &&
          c.from.height >= AXIAL_HEIGHT - 1 &&
          c.to.height >= AXIAL_HEIGHT - 1,
      ),
    ).toBe(true);
    expect(
      NAV_CONNECTIONS.some((c) => Math.abs(c.from.height - c.to.height) > 5),
    ).toBe(true);

    await page.goto("/");
    await expect(page.locator("#start-greenway")).toBeEnabled();
    await page.locator("#start-greenway").click();
    await expect(page.locator("#pause")).toBeVisible();

    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    await expect(page.locator('[data-map-layer="surface"]')).toBeVisible();
    await expect(page.locator('[data-map-layer="service"]')).toBeVisible();
    await expect(page.locator('[data-map-layer="axial"]')).toBeVisible();

    await test.step("Surface layer filters surface locations, 9/42 m elevations, and lift access points", async () => {
      await page.locator('[data-map-layer="surface"]').click();
      for (const id of [
        "greenway-market",
        "greenway-glasshouse",
        "greenway-overlook",
        "meridian-plaza",
        "civic-lobby",
        "skyroom",
        skywalkLiftTarget.id,
        serviceSurfaceTarget.id,
        endcapRimTarget.id,
      ]) {
        await expectDestinationVisible(page, id);
      }
      await expectDestinationFilteredOut(page, "meridian-water-plant");
      await expectDestinationFilteredOut(page, "sunline-module-02");

      const mapText = (await page.locator("#habitat-map").textContent()) || "";
      expect(mapText).toMatch(/\b42\s*m\b/i);
      expect(mapText).toMatch(/\b9\s*m\b/i);

      const surfaceLinks = await readTransitLinks(page);
      expect(surfaceLinks.plotBox).not.toBeNull();
      expect(surfaceLinks.trolley).toHaveLength(0);

      const expectedSurfaceVerticals = NAV_CONNECTIONS.filter(
        (c) =>
          c.type === "lift" &&
          getNavigationLayer(c.from.height) === "surface" &&
          getNavigationLayer(c.to.height) === "surface",
      );
      expect(surfaceLinks.vertical).toHaveLength(expectedSurfaceVerticals.length);
      for (const conn of expectedSurfaceVerticals) {
        const item = surfaceLinks.vertical.find((v) => v.title === conn.label);
        expect(item).toBeTruthy();
        const expected = toPlotSvg(
          surfaceLinks.plotBox,
          conn.from.theta,
          conn.from.y,
        );
        expect(Math.hypot(item.cx - expected.x, item.cy - expected.y)).toBeLessThan(1);
      }
      const mainLiftItem = surfaceLinks.vertical.find((v) =>
        v.title.includes("Civic tower"),
      );
      expect(
        Math.hypot(
          mainLiftItem.cx - surfaceLinks.pins[mainLiftTarget.id].cx,
          mainLiftItem.cy - surfaceLinks.pins[mainLiftTarget.id].cy,
        ),
      ).toBeLessThan(1);
      const skywalkLiftItem = surfaceLinks.vertical.find((v) =>
        v.title.includes("Skywalk"),
      );
      expect(
        Math.hypot(
          skywalkLiftItem.cx - surfaceLinks.pins[skywalkLiftTarget.id].cx,
          skywalkLiftItem.cy - surfaceLinks.pins[skywalkLiftTarget.id].cy,
        ),
      ).toBeLessThan(1);

      const expectedSurfacePortals = NAV_CONNECTIONS.filter((c) => {
        const fl = getNavigationLayer(c.from.height);
        const tl = getNavigationLayer(c.to.height);
        return fl !== tl && (fl === "surface" || tl === "surface");
      });
      expect(surfaceLinks.portal).toHaveLength(expectedSurfacePortals.length);
      for (const conn of expectedSurfacePortals) {
        const item = surfaceLinks.portal.find((p) => p.title === conn.label);
        expect(item).toBeTruthy();
        const pose =
          getNavigationLayer(conn.from.height) === "surface"
            ? conn.from
            : conn.to;
        const expected = toPlotSvg(surfaceLinks.plotBox, pose.theta, pose.y);
        expect(Math.hypot(item.cx - expected.x, item.cy - expected.y)).toBeLessThan(1);
      }
      const surfacePinMap = [
        ["Service", serviceSurfaceTarget.id],
        ["Endcap A", endcapRimTarget.id],
        ["Endcap B", endcapBRimTarget.id],
      ];
      for (const [needle, pinId] of surfacePinMap) {
        const portal = surfaceLinks.portal.find((p) => p.title.includes(needle));
        expect(portal).toBeTruthy();
        expect(
          Math.hypot(
            portal.cx - surfaceLinks.pins[pinId].cx,
            portal.cy - surfaceLinks.pins[pinId].cy,
          ),
        ).toBeLessThan(1);
      }
    });

    await test.step("Service layer shows underground locations and lift target and sets cross-floor guidance", async () => {
      await page.locator('[data-map-layer="service"]').click();
      for (const id of [
        "meridian-water-plant",
        "meridian-power-room",
        serviceSubTarget.id,
      ]) {
        await expectDestinationVisible(page, id);
      }
      await expectDestinationFilteredOut(page, "greenway-market");
      await expectDestinationFilteredOut(page, "sunline-module-02");


      const serviceLinks = await readTransitLinks(page);
      expect(serviceLinks.vertical).toHaveLength(0);
      expect(serviceLinks.trolley).toHaveLength(0);
      expect(serviceLinks.portal).toHaveLength(1);
      expect(serviceLinks.portal[0].title).toContain("Service");
      expect(
        Math.hypot(
          serviceLinks.portal[0].cx - serviceLinks.pins[serviceSubTarget.id].cx,
          serviceLinks.portal[0].cy - serviceLinks.pins[serviceSubTarget.id].cy,
        ),
      ).toBeLessThan(1);
      await clickDestination(page, "meridian-water-plant");
      await page.locator("#map-close").click();
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#waypoint")).toBeVisible();
      expect(
        parseFiniteMetres(await page.locator("#waypoint-distance").textContent()),
      ).toBeGreaterThan(0);
    });

    await test.step("Axial layer shows Endcap hubs, SL-02, and trolley docks with link geometry", async () => {
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await page.locator('[data-map-layer="axial"]').click();
      for (const id of [
        "endcap-a-hub",
        "endcap-b-hub",
        "sunline-module-02",
        dockATarget.id,
        dockBTarget.id,
      ]) {
        await expectDestinationVisible(page, id);
      }
      await expectDestinationFilteredOut(page, "greenway-market");
      await expectDestinationFilteredOut(page, "meridian-water-plant");

      const axialLinks = await readTransitLinks(page);
      expect(axialLinks.vertical).toHaveLength(0);
      expect(axialLinks.trolley).toHaveLength(1);
      const trolleyEl = axialLinks.trolley[0];
      expect(trolleyEl.title).toBe(trolleyConn.label);
      const expectedFrom = toPlotSvg(
        axialLinks.plotBox,
        trolleyConn.from.theta,
        trolleyConn.from.y,
      );
      const expectedTo = toPlotSvg(
        axialLinks.plotBox,
        trolleyConn.to.theta,
        trolleyConn.to.y,
      );
      expect(
        Math.hypot(trolleyEl.x1 - expectedFrom.x, trolleyEl.y1 - expectedFrom.y),
      ).toBeLessThan(1);
      expect(
        Math.hypot(trolleyEl.x2 - expectedTo.x, trolleyEl.y2 - expectedTo.y),
      ).toBeLessThan(1);
      expect(
        Math.abs(trolleyEl.x1 - axialLinks.pins[dockATarget.id].cx),
      ).toBeLessThan(1);
      expect(
        Math.abs(trolleyEl.x2 - axialLinks.pins[dockBTarget.id].cx),
      ).toBeLessThan(1);
      expect(Math.abs(trolleyEl.y2 - trolleyEl.y1)).toBeGreaterThan(350);

      const expectedAxialPortals = NAV_CONNECTIONS.filter((c) => {
        const fl = getNavigationLayer(c.from.height);
        const tl = getNavigationLayer(c.to.height);
        return fl !== tl && (fl === "axial" || tl === "axial");
      });
      expect(axialLinks.portal).toHaveLength(expectedAxialPortals.length);
      for (const conn of expectedAxialPortals) {
        const item = axialLinks.portal.find((p) => p.title === conn.label);
        expect(item).toBeTruthy();
        const pose =
          getNavigationLayer(conn.from.height) === "axial"
            ? conn.from
            : conn.to;
        const expected = toPlotSvg(axialLinks.plotBox, pose.theta, pose.y);
        expect(Math.hypot(item.cx - expected.x, item.cy - expected.y)).toBeLessThan(1);
      }

      await clickDestination(page, "sunline-module-02");
      await page.locator("#map-close").click();
      await expect(page.locator("#waypoint")).toBeVisible();
      expect(
        parseFiniteMetres(await page.locator("#waypoint-distance").textContent()),
      ).toBeGreaterThan(0);
    });

    await test.step("Job target buttons and clear waypoint control update active waypoint", async () => {
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await page.locator('[data-job-id="maintenance"]').click();
      await page.locator("#map-close").click();
      await expect(page.locator("#waypoint")).toBeVisible();
      expect(
        parseFiniteMetres(await page.locator("#waypoint-distance").textContent()),
      ).toBeGreaterThan(0);

      await page.keyboard.press("KeyG");
      await page.locator('[data-job-id="sunline"]').click();
      await page.locator("#map-close").click();
      await expect(page.locator("#waypoint")).toBeVisible();
      expect(
        parseFiniteMetres(await page.locator("#waypoint-distance").textContent()),
      ).toBeGreaterThan(0);

      await page.keyboard.press("KeyG");
      await page.locator("[data-clear-waypoint]").click();
      await page.locator("#map-close").click();
      await expect(page.locator("#waypoint")).toBeHidden();
    });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("compact 375x600 map avoids overflow and waypoint handles zero-distance, collinear, and behind-camera poses", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const width = 375;
  const height = 600;
  const context = await browser.newContext({
    viewport: { width, height },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const endcapRimTarget = findTargetNearXY(
      ENDCAP_HUBS[0].rim.theta,
      ENDCAP_HUBS[0].rim.y,
      "surface",
    );
    expect(endcapRimTarget).toBeTruthy();

    await page.goto("/");
    await expect(page.locator("#start")).toBeEnabled();

    await page.evaluate(async () => {
      const candidates = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /three/i.test(name));
      candidates.sort((a, b) => {
        const aMain = /\/three(?:\.module)?\.js(?:[?#]|$)/i.test(a) ? 0 : 1;
        const bMain = /\/three(?:\.module)?\.js(?:[?#]|$)/i.test(b) ? 0 : 1;
        return aMain - bMain;
      });
      let ThreeMod = null;
      for (const url of candidates) {
        try {
          const mod = await import(url);
          if (mod?.Scene?.prototype?.onAfterRender) {
            ThreeMod = mod;
            break;
          }
        } catch {}
      }
      if (!ThreeMod) throw new Error("Unable to observe Three camera orientation");
      window.__navCameraObserver = { dirY: null, renderCount: 0 };
      const origAfter = ThreeMod.Scene.prototype.onAfterRender;
      ThreeMod.Scene.prototype.onAfterRender = function observedAfterRender(
        renderer,
        scene,
        camera,
        ...rest
      ) {
        if (camera?.matrixWorld?.elements) {
          window.__navCameraObserver.renderCount++;
          window.__navCameraObserver.dirY = -camera.matrixWorld.elements[9];
        }
        return origAfter.call(this, renderer, scene, camera, ...rest);
      };
    });

    await page.locator("#start").click();
    await expect(page.locator("#pause")).toBeVisible();

    await test.step("Compact dialog fits 375x600 without horizontal overflow and handles zero-distance target", async () => {
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();

      const layoutMetrics = await page.evaluate(() => {
        const dialog = document.getElementById("habitat-map");
        const rect = dialog.getBoundingClientRect();
        return {
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
          dialogScrollWidth: dialog.scrollWidth,
          dialogClientWidth: dialog.clientWidth,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      });
      expect(layoutMetrics.docScrollWidth).toBeLessThanOrEqual(width);
      expect(layoutMetrics.dialogScrollWidth).toBeLessThanOrEqual(
        layoutMetrics.dialogClientWidth + 1,
      );
      expect(layoutMetrics.rect.x).toBeGreaterThanOrEqual(-0.5);
      expect(layoutMetrics.rect.y).toBeGreaterThanOrEqual(-0.5);
      expect(layoutMetrics.rect.x + layoutMetrics.rect.width).toBeLessThanOrEqual(
        width + 0.5,
      );
      expect(layoutMetrics.rect.y + layoutMetrics.rect.height).toBeLessThanOrEqual(
        height + 0.5,
      );

      for (const selector of [
        "#map-close",
        '[data-map-layer="surface"]',
        '[data-map-layer="service"]',
        '[data-map-layer="axial"]',
      ]) {
        const box = await page.locator(selector).boundingBox();
        expect(box).not.toBeNull();
        expect(box.width).toBeGreaterThanOrEqual(20);
        expect(box.height).toBeGreaterThanOrEqual(20);
        expect(box.x).toBeGreaterThanOrEqual(-0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      }

      await page.locator('[data-map-layer="surface"]').click();
      await clickDestination(page, endcapRimTarget.id);
      await page.locator("#map-close").click();

      await assertWaypointLayoutValid(page, width, height);
    });

    await test.step("Behind-camera vs ahead-of-camera marker positions are truthful inside 375x600", async () => {
      await page.keyboard.press("KeyG");
      await page.locator('[data-map-layer="surface"]').click();
      await clickDestination(page, "meridian-plaza");
      await page.locator("#map-close").click();

      await page.waitForFunction(
        () =>
          window.__navCameraObserver?.dirY !== null &&
          window.__navCameraObserver.dirY < -0.5,
      );
      const behindLayout = await assertWaypointLayoutValid(page, width, height);
      const crosshairBox = await page.locator("#crosshair").boundingBox();
      if (crosshairBox) {
        expect(boxesOverlap(behindLayout.labelBox, crosshairBox)).toBe(false);
      }

      // Turn 180 degrees to face +Y (ahead toward Meridian Plaza)
      await page.keyboard.down("ArrowLeft");
      await page.waitForFunction(
        () =>
          window.__navCameraObserver?.dirY !== null &&
          window.__navCameraObserver.dirY > 0.7,
        null,
        { timeout: 45_000 },
      );
      await page.keyboard.up("ArrowLeft");

      const behindCenter = {
        x: behindLayout.labelBox.x + behindLayout.labelBox.width / 2,
        y: behindLayout.labelBox.y + behindLayout.labelBox.height / 2,
      };
      await expect
        .poll(async () => {
          const aheadLayout = await assertWaypointLayoutValid(
            page,
            width,
            height,
          );
          const aheadCenter = {
            x: aheadLayout.labelBox.x + aheadLayout.labelBox.width / 2,
            y: aheadLayout.labelBox.y + aheadLayout.labelBox.height / 2,
          };
          return Math.hypot(
            aheadCenter.x - behindCenter.x,
            aheadCenter.y - behindCenter.y,
          );
        })
        .toBeGreaterThan(30);
    });

    await test.step("Overhead vertically collinear guidance pose projects finitely inside 375x600", async () => {
      const overlook = DISTRICT_STOPS.find((s) => s.id === "greenway-overlook");
      expect(overlook).toBeTruthy();

      await page.goto("/checks/navigation-fixture.html");
      await page.waitForFunction(() => Boolean(window.__navFixture));

      const guidanceCheck = await page.evaluate(
        ({ theta, y, vw, vh }) => {
          const f = window.__navFixture;
          const player = {
            theta,
            y,
            height: 0,
            traversalMode: "walk",
            grounded: true,
          };
          f.setPlayerState(player);
          f.navigation.select({ kind: "destination", id: "greenway-overlook" });
          const wp = f.navigation.getWaypoint(
            player,
            { delivery: null, maintenance: null, sunline: null },
            {},
          );
          f.camera.aspect = vw / vh;
          f.camera.updateProjectionMatrix();
          f.camera.position.copy(f.surfacePos(theta, y, 1.65));
          f.camera.up.copy(f.surfaceUp(theta));
          f.camera.lookAt(f.surfacePos(theta, y + 10, 1.65));
          f.camera.updateMatrixWorld();
          f.waypoint.update(player, wp);
          return {
            arrived: wp.arrived,
            guidanceHeight: wp.guidance.height,
            guidanceTheta: wp.guidance.theta,
            guidanceY: wp.guidance.y,
          };
        },
        { theta: overlook.theta, y: overlook.y, vw: width, vh: height },
      );
      expect(guidanceCheck.arrived).toBe(false);
      expect(guidanceCheck.guidanceHeight).toBeGreaterThan(1.5);
      expect(guidanceCheck.guidanceTheta).toBeCloseTo(overlook.theta, 6);
      expect(guidanceCheck.guidanceY).toBeCloseTo(overlook.y, 6);

      await assertWaypointLayoutValid(page, width, height);
      await expect(page.locator("#waypoint")).toHaveAttribute(
        "data-behind",
        "false",
      );
      await expect(page.locator("#waypoint")).toHaveAttribute(
        "data-edge",
        "true",
      );
      await expect(page.locator("#waypoint-level")).toContainText("ELEVATED");
      expect(
        parseFiniteMetres(await page.locator("#waypoint-distance").textContent()),
      ).toBeGreaterThan(0);

      // Look straight up radially along surfaceUp directly at the overhead target
      await page.evaluate(({ theta, y }) => {
        const f = window.__navFixture;
        const player = f.getPlayerState();
        const wp = f.navigation.getWaypoint(
          player,
          { delivery: null, maintenance: null, sunline: null },
          {},
        );
        f.camera.position.copy(f.surfacePos(theta, y, 1.65));
        f.camera.up.copy(f.surfaceUp(theta));
        f.camera.lookAt(f.surfacePos(theta, y, 20));
        f.camera.updateMatrixWorld();
        f.waypoint.update(player, wp);
      }, { theta: overlook.theta, y: overlook.y });

      await assertWaypointLayoutValid(page, width, height);
      await expect(page.locator("#waypoint")).toHaveAttribute(
        "data-behind",
        "false",
      );
      await expect(page.locator("#waypoint")).toHaveAttribute(
        "data-edge",
        "false",
      );
      await expect(page.locator("#waypoint-level")).toContainText("ELEVATED");
      expect(
        parseFiniteMetres(await page.locator("#waypoint-distance").textContent()),
      ).toBeGreaterThan(0);
    });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("opening map freezes WebGL redraws, pauses audio, isolates audio failure, and preserves mid-lift timing", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 480 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.addInitScript(() => {
      window.__webglDrawCalls = 0;
      const methods = [
        "drawArrays",
        "drawElements",
        "drawArraysInstanced",
        "drawElementsInstanced",
      ];
      for (const Proto of [
        window.WebGL2RenderingContext?.prototype,
        window.WebGLRenderingContext?.prototype,
      ]) {
        if (!Proto) continue;
        for (const name of methods) {
          const orig = Proto[name];
          if (typeof orig !== "function") continue;
          Proto[name] = function wrappedDraw(...args) {
            window.__webglDrawCalls++;
            return orig.apply(this, args);
          };
        }
      }

      const NativeAudioContext =
        window.AudioContext || window.webkitAudioContext;
      window.__audioContexts = [];
      class ObservedAudioContext extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          window.__audioContexts.push(this);
        }
      }
      if (window.AudioContext) window.AudioContext = ObservedAudioContext;
      if (window.webkitAudioContext)
        window.webkitAudioContext = ObservedAudioContext;
    });

    const getDraws = () => page.evaluate(() => window.__webglDrawCalls);

    await page.goto("/");
    await expect(page.locator("#start")).toBeEnabled();
    await waitFrames(page, 2);

    const intro0 = await getDraws();
    await waitFrames(page, 20);
    expect(await getDraws()).toBe(intro0);

    await page.locator("#start").click();
    await expect(page.locator("#pause")).toBeVisible();
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "running",
    );
    await page.waitForFunction(
      (prev) => window.__webglDrawCalls > prev,
      intro0,
    );

    await test.step("2D map interaction emits zero WebGL redraws and pauses audio", async () => {
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#sound")).toHaveAttribute(
        "data-status",
        "paused",
      );

      await waitFrames(page, 2);
      const mapDraws0 = await getDraws();
      await page.locator('[data-map-layer="service"]').click();
      await page.locator('[data-map-layer="axial"]').click();
      await clickDestination(page, "endcap-a-hub");
      await waitFrames(page, 30);
      expect(await getDraws()).toBe(mapDraws0);

      await page.locator("#map-close").click();
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#pause")).toBeVisible();
      await expect(page.locator("#sound")).toHaveAttribute(
        "data-status",
        "running",
      );
      await page.waitForFunction(
        (prev) => window.__webglDrawCalls > prev,
        mapDraws0,
      );
    });

    await test.step("Opening map mid-lift freezes lift timer and completes cleanly on close", async () => {
      await expect(page.locator("#interaction-label")).toContainText(
        "Endcap A",
      );
      await page.keyboard.press("KeyE");
      await expect(page.locator("#viewport")).toHaveClass(/lift-travel/);

      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#viewport")).toHaveClass(/lift-travel/);
      await expect(page.locator("#height")).toHaveText("0.0 m UP");
      await expect(page.locator("#waypoint")).toBeHidden();

      await waitFrames(page, 2);
      const midLiftDraws0 = await getDraws();
      await waitFrames(page, 30);
      expect(await getDraws()).toBe(midLiftDraws0);
      await expect(page.locator("#viewport")).toHaveClass(/lift-travel/);
      await expect(page.locator("#height")).toHaveText("0.0 m UP");

      await page.keyboard.press("Escape");
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/, {
        timeout: 20_000,
      });
      await expect(page.locator("#height")).toHaveText(
        `${AXIAL_HEIGHT.toFixed(1)} m UP`,
      );
      await expect(page.locator("#motion")).toHaveText("MAG BOOTS SECURED");
      await expect(page.locator("#area")).toContainText("ENDCAP A");
      await expect(page.locator("#waypoint")).toBeVisible();
      await expect(page.locator("#waypoint-distance")).toHaveText("ARRIVED");
    });

    await test.step("Closed AudioContext stays isolated when opening and closing map", async () => {
      await page.evaluate(async () => {
        await window.__audioContexts[0].close();
      });
      await expect(page.locator("#sound")).toHaveText("SOUND N/A");
      await page.keyboard.press("KeyM");
      await expect(page.locator("#sound")).toHaveAttribute(
        "data-status",
        "unavailable",
      );

      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await page.locator("#map-close").click();
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#pause")).toBeVisible();
      await expect(page.locator("#sound")).toHaveText("SOUND N/A");
    });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("selected delivery job waypoint advances live after real seed crate pickup and hides cargo while map is open", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({
    viewport: { width: 640, height: 480 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("#start-greenway")).toBeEnabled();
    await page.locator("#start-greenway").click();
    await expect(page.locator("#pause")).toBeVisible();

    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    await page.locator('[data-job-id="delivery"]').click();
    await page.locator("#map-close").click();
    await expect(page.locator("#habitat-map")).toBeHidden();

    await expect(page.locator("#waypoint")).toBeVisible();
    const initialDist = parseFiniteMetres(
      await page.locator("#waypoint-distance").textContent(),
    );
    expect(initialDist).toBeGreaterThan(50);

    const greenwayEntryM = Math.ceil(DISTRICT_BOUNDS.minY + LENGTH / 2);
    const pickupLongM = Math.round(DELIVERY_STATIONS.pickup.y + LENGTH / 2);

    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");
    await page.waitForFunction(
      (entryM) => {
        const area = document.getElementById("area")?.textContent || "";
        const pos = document.getElementById("position")?.textContent || "";
        const match = pos.match(/\/\s*(\d+)\s*m$/);
        return (
          area === "GREENWAY COMMONS" && match && Number(match[1]) >= entryM
        );
      },
      greenwayEntryM,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      (targetM) => {
        const pos = document.getElementById("position")?.textContent || "";
        const match = pos.match(/\/\s*(\d+)\s*m$/);
        return match && Number(match[1]) >= targetM;
      },
      pickupLongM - 12,
      { timeout: 60_000 },
    );
    await page.keyboard.up("ShiftLeft");

    await page.waitForFunction(
      (targetM) => {
        const pos = document.getElementById("position")?.textContent || "";
        const match = pos.match(/\/\s*(\d+)\s*m$/);
        return match && Number(match[1]) >= targetM;
      },
      pickupLongM,
      { timeout: 45_000 },
    );
    await page.keyboard.up("KeyW");

    await page.keyboard.down("KeyD");
    await page.waitForFunction(
      () => {
        const box = document.getElementById("interaction");
        const label = document.getElementById("interaction-label");
        return (
          box &&
          !box.hidden &&
          label &&
          label.textContent.includes("Pick up seed crate")
        );
      },
      null,
      { timeout: 45_000 },
    );
    await page.keyboard.up("KeyD");

    await expect
      .poll(async () => {
        const text =
          (await page.locator("#waypoint-distance").textContent()) || "";
        if (/arrived/i.test(text)) return 0;
        return parseFiniteMetres(text);
      })
      .toBeLessThanOrEqual(15);

    await page.keyboard.press("KeyE");
    await expect(page.locator("#inventory")).toBeVisible();
    await expect(page.locator("#inventory-label")).toHaveText(
      "Heritage seed crate",
    );
    await expect(page.locator("#job")).toHaveAttribute(
      "data-phase",
      "carrying",
    );

    await expect
      .poll(async () =>
        parseFiniteMetres(
          await page.locator("#waypoint-distance").textContent(),
        ),
      )
      .toBeGreaterThan(50);

    // Map open hides cargo inventory and waypoint; closing restores both
    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    await expect(page.locator("#inventory")).toBeHidden();
    await expect(page.locator("#waypoint")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.locator("#habitat-map")).toBeHidden();
    await expect(page.locator("#inventory")).toBeVisible();
    await expect(page.locator("#inventory-label")).toHaveText(
      "Heritage seed crate",
    );
    await expect(page.locator("#waypoint")).toBeVisible();
    expect(
      parseFiniteMetres(await page.locator("#waypoint-distance").textContent()),
    ).toBeGreaterThan(50);

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("keyboard list selection and viewport resize preserve focus on active map list control", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("#start-greenway")).toBeEnabled();
    await page.locator("#start-greenway").click();
    await expect(page.locator("#pause")).toBeVisible();

    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();

    await tabToElement(page, '#habitat-map button[data-job-id="delivery"]');
    await page.keyboard.press("Enter");
    await expect(
      page.locator('#habitat-map button[data-job-id="delivery"]'),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("data-job-id") === "delivery" &&
          Boolean(
            document
              .getElementById("habitat-map")
              ?.contains(document.activeElement),
          ),
      ),
    ).toBe(true);

    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-job-id"),
      ),
    ).toBe("maintenance");

    await tabToElement(
      page,
      '#habitat-map button[data-destination-id="greenway-market"]',
    );
    await page.keyboard.press("Space");
    await expect(
      page.locator('#habitat-map button[data-destination-id="greenway-market"]'),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("data-destination-id") ===
            "greenway-market" &&
          Boolean(
            document
              .getElementById("habitat-map")
              ?.contains(document.activeElement),
          ),
      ),
    ).toBe(true);

    await page.setViewportSize({ width: 680, height: 520 });
    await waitFrames(page, 4);
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("data-destination-id") ===
          "greenway-market",
      ),
    ).toBe(true);

    await page.setViewportSize({ width: 375, height: 600 });
    await waitFrames(page, 4);
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("data-destination-id") ===
          "greenway-market",
      ),
    ).toBe(true);

    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-destination-id"),
      ),
    ).toBe("greenway-glasshouse");

    // Long station lists must not scroll the atlas out of the desktop view.
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.locator('button[data-destination-id="tram-tower"]').click();
    await expect(page.locator(".habitat-map-svg")).toBeInViewport({ ratio: 0.95 });
    await expect(
      page.locator('button[data-destination-id="tram-tower"]'),
    ).toBeFocused();

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("standalone map component suppresses async close events on close() and survives same-task close/open", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/checks/navigation-fixture.html");
    await page.waitForFunction(() => Boolean(window.__navFixture));

    // Programmatic close() alone must not notify onClose asynchronously
    await page.evaluate(() => {
      const f = window.__navFixture;
      f.resetCloseNotifications();
      f.map.open(f.buildSnapshot());
      f.map.close();
    });
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await waitFrames(page, 4);
    expect(
      await page.evaluate(() => ({
        open: window.__navFixture.map.isOpen(),
        notifications: window.__navFixture.getCloseNotifications(),
      })),
    ).toEqual({ open: false, notifications: 0 });

    // Same-task close(); open(snapshot) must stay open after queued native close event fires
    const syncOpen = await page.evaluate(() => {
      const f = window.__navFixture;
      f.resetCloseNotifications();
      f.map.open(f.buildSnapshot());
      f.map.close();
      f.map.open(f.buildSnapshot());
      return f.map.isOpen();
    });
    expect(syncOpen).toBe(true);

    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await waitFrames(page, 4);
    await expect(page.locator("#habitat-map")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        open: window.__navFixture.map.isOpen(),
        notifications: window.__navFixture.getCloseNotifications(),
      })),
    ).toEqual({ open: true, notifications: 0 });

    // Real user cancel (Escape) still closes the dialog and notifies onClose
    await page.keyboard.press("Escape");
    await expect(page.locator("#habitat-map")).toBeHidden();
    expect(
      await page.evaluate(() => ({
        open: window.__navFixture.map.isOpen(),
        notifications: window.__navFixture.getCloseNotifications(),
      })),
    ).toEqual({ open: false, notifications: 1 });

    // Explicit close button still closes and notifies onClose
    await page.evaluate(() => {
      const f = window.__navFixture;
      f.map.open(f.buildSnapshot());
    });
    await expect(page.locator("#habitat-map")).toBeVisible();
    await page.locator("#map-close").click();
    await expect(page.locator("#habitat-map")).toBeHidden();
    expect(
      await page.evaluate(() => ({
        open: window.__navFixture.map.isOpen(),
        notifications: window.__navFixture.getCloseNotifications(),
      })),
    ).toEqual({ open: false, notifications: 2 });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("WebGL context loss while map is open shows error, closes map, and blocks world reactivation", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 640, height: 480 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.addInitScript(() => {
      window.__webglDrawCalls = 0;
      window.__webglContexts = [];
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function wrappedGetContext(
        type,
        ...args
      ) {
        const ctx = origGetContext.call(this, type, ...args);
        if (
          ctx &&
          (type === "webgl2" || type === "webgl") &&
          !window.__webglContexts.includes(ctx)
        ) {
          window.__webglContexts.push(ctx);
        }
        return ctx;
      };

      const methods = [
        "drawArrays",
        "drawElements",
        "drawArraysInstanced",
        "drawElementsInstanced",
      ];
      for (const Proto of [
        window.WebGL2RenderingContext?.prototype,
        window.WebGLRenderingContext?.prototype,
      ]) {
        if (!Proto) continue;
        for (const name of methods) {
          const orig = Proto[name];
          if (typeof orig !== "function") continue;
          Proto[name] = function wrappedDraw(...args) {
            window.__webglDrawCalls++;
            return orig.apply(this, args);
          };
        }
      }
    });

    const getDraws = () => page.evaluate(() => window.__webglDrawCalls);

    await page.goto("/");
    await expect(page.locator("#start")).toBeEnabled();
    await page.locator("#start").click();
    await expect(page.locator("#pause")).toBeVisible();
    await expect(page.locator("#interaction-label")).toContainText("Endcap A");
    await page.waitForFunction(() => window.__webglDrawCalls > 0);

    await page.keyboard.press("KeyG");
    await expect(page.locator("#habitat-map")).toBeVisible();
    await expect(page.locator("#pause-panel")).toBeHidden();

    const lost = await page.evaluate(() => {
      const gl =
        window.__webglContexts?.find((ctx) => !ctx.isContextLost?.()) ||
        document.querySelector("#viewport canvas")?.getContext("webgl2") ||
        document.querySelector("#viewport canvas")?.getContext("webgl");
      const ext = gl?.getExtension("WEBGL_lose_context");
      if (!ext) return false;
      ext.loseContext();
      return true;
    });
    expect(lost).toBe(true);

    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#error-message")).toContainText(
      /context was lost/i,
    );
    await expect(page.locator("#habitat-map")).toBeHidden();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await expect(page.locator("#pause")).toBeHidden();
    await expect(page.locator("#crosshair")).toBeHidden();
    await expect(page.locator("#waypoint")).toBeHidden();
    await expect(page.locator("#map-toggle")).toBeDisabled();
    await expect(page.locator("#map-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await waitFrames(page, 2);
    const drawsAfterLoss = await getDraws();
    await waitFrames(page, 20);
    expect(await getDraws()).toBe(drawsAfterLoss);

    await page.keyboard.press("KeyG");
    await page.keyboard.press("Escape");
    await page.keyboard.press("KeyE");
    await waitFrames(page, 10);

    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#habitat-map")).toBeHidden();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await expect(page.locator("#pause")).toBeHidden();
    await expect(page.locator("#crosshair")).toBeHidden();
    await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/);
    await expect(page.locator("#map-toggle")).toBeDisabled();
    expect(await getDraws()).toBe(drawsAfterLoss);

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
