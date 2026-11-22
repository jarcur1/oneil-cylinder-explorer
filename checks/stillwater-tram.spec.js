import { test, expect } from "@playwright/test";
import { LENGTH } from "../src/habitat.js";
import { STILLWATER_TRAM_STOPS } from "../src/tram-layout.js";

test("Line 02 follows the curved route in both directions with rider and clear pads", async ({ page }) => {
  await page.goto("/checks/world.html");
  await page.waitForFunction(() => Boolean(window.__worldFixture));
  const result = await page.evaluate(() => {
    const { world, player, step, inspectTram, layouts, scene } = window.__worldFixture;
    const tram = world.trams.find((line) => line.lineId === "line-02");
    const stops = layouts.STILLWATER_TRAM_STOPS;
    player.teleport({ ...stops[0] });
    step(0);
    const ground = player.getState({});
    const board = tram.getInteraction(ground);
    if (board?.kind !== "board" || board.stationId !== "tram-meridian-south") {
      throw new Error(`Expected boarding at tram-meridian-south, got ${JSON.stringify(board)}`);
    }
    player.attachRide(tram);
    let maxFootGap = 0, maxEyeGap = 0, maxPlayerGap = 0, maxYGap = 0, minTangent = 1;
    let minEastDelta = Infinity, maxWestDelta = -Infinity;
    let east = 0, west = 0, last = tram.getPose({}).theta;
    let eastOrientation = null, westOrientation = null;
    for (let i = 0; i < 2600; i++) {
      const ps = step(0.05);
      const pose = tram.getPose({});
      const ts = tram.getState({});
      maxYGap = Math.max(maxYGap, Math.abs(pose.y - 340));
      if (ts.phase === "moving") {
        const snap = i % 20 === 0 ? inspectTram("line-02") : null;
        const carriage = scene.getObjectByName("stillwater_tram_carriage");
        const axis = carriage.localToWorld(carriage.position.clone().set(0, 0, 1))
          .sub(carriage.getWorldPosition(carriage.position.clone())).normalize();
        const tangent = axis.x * Math.cos(pose.theta) + axis.z * Math.sin(pose.theta);
        minTangent = Math.min(minTangent, Math.abs(tangent));
        if (snap) {
          maxFootGap = Math.max(maxFootGap, snap.footAgreementDist);
          maxEyeGap = Math.max(maxEyeGap, snap.cameraEyeDist);
        }
        maxPlayerGap = Math.max(maxPlayerGap, Math.abs(ps.theta - pose.theta) * layouts.RADIUS, Math.abs(ps.y - pose.y));
        if (ts.direction > 0) { east++; minEastDelta = Math.min(minEastDelta, pose.theta - last); eastOrientation = Math.sign(tangent); }
        else { west++; maxWestDelta = Math.max(maxWestDelta, pose.theta - last); westOrientation = Math.sign(tangent); }
      }
      last = pose.theta;
      if (west && ts.phase === "dwell" && ts.stationId === stops[0].id) break;
    }
    const clearance = world.obstacles.filter((o) => {
      if (o.depth === layouts.LENGTH && o.width > layouts.RADIUS * 4) return false;
      const s = Math.atan2(Math.sin(o.theta), Math.cos(o.theta)) * layouts.RADIUS;
      const unwrapped = s < -Math.PI * layouts.RADIUS / 2 ? s + 2 * Math.PI * layouts.RADIUS : s;
      const halfCar = layouts.TRAM_CAR_LENGTH / 2 * layouts.RADIUS / (layouts.RADIUS - layouts.TRAM_HEIGHT);
      return unwrapped + o.width / 2 > stops[0].trackTheta * layouts.RADIUS - halfCar + 0.02 &&
        unwrapped - o.width / 2 < stops[1].trackTheta * layouts.RADIUS + halfCar - 0.02 &&
        Math.abs(o.y - 340) < (o.depth + layouts.TRAM_CAR_WIDTH) / 2 - 0.02 &&
        (o.base ?? 0) < layouts.TRAM_HEIGHT + layouts.TRAM_CAR_HEIGHT - 0.02 &&
        (o.base ?? 0) + o.height > layouts.TRAM_HEIGHT + 0.02;
    }).map(({ theta, y, width, depth, base, height }) => ({ theta, y, width, depth, base, height }));
    const pads = stops.map((stop) => {
      player.teleport({ ...stop, yaw: 0 });
      let settled;
      for (let i = 0; i < 4; i++) settled = step(0.05);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
      let walked;
      for (let i = 0; i < 12; i++) walked = step(0.05);
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
      return { grounded: settled.grounded, height: settled.height, push: Math.hypot((settled.theta - stop.theta) * layouts.RADIUS, settled.y - stop.y), progress: walked.y - settled.y };
    });
    return { board, east, west, minEastDelta, maxWestDelta, minTangent, eastOrientation, westOrientation, maxFootGap, maxEyeGap, maxPlayerGap, maxYGap, clearance, pads };
  });
  expect(result.board).toMatchObject({ kind: "board", stationId: "tram-meridian-south" });
  expect(result.east).toBeGreaterThan(100);
  expect(result.west).toBeGreaterThan(100);
  expect(result.minEastDelta).toBeGreaterThanOrEqual(0);
  expect(result.maxWestDelta).toBeLessThanOrEqual(0);
  expect(result.minTangent).toBeGreaterThan(0.999);
  expect(result.eastOrientation).toBe(result.westOrientation);
  expect(result.maxFootGap).toBeLessThan(0.01);
  expect(result.maxEyeGap).toBeLessThan(0.01);
  expect(result.maxYGap).toBe(0);
  expect(result.maxPlayerGap).toBeLessThan(0.01);
  expect(result.clearance).toEqual([]);
  for (const pad of result.pads) {
    expect(pad.grounded).toBe(true);
    expect(pad.height).toBe(0);
    expect(pad.push).toBeLessThan(0.05);
    expect(pad.progress).toBeGreaterThan(2);
  }
});

test("map renders each line's own telemetry and clears absent telemetry", async ({ page }) => {
  await page.goto("/checks/world.html");
  const result = await page.evaluate(async () => {
    const { createHabitatMap } = await import("/src/habitat-map.js");
    const map = createHabitatMap();
    const state01 = { theta: 0.15, y: -400, height: 13, phase: "moving", direction: 1 };
    const state02 = { theta: 1.4, y: 340, height: 13, phase: "moving", direction: -1 };
    const snapshot = { trams: [
      { lineId: "line-01", state: state01 },
      { lineId: "line-02", state: state02 },
    ] };
    const readLine = (id) => {
      const marker = document.querySelector(`[data-tram-marker][data-tram-line="${id}"]`);
      const rect = marker.querySelector("rect");
      return {
        x: Number(rect.getAttribute("x")), y: Number(rect.getAttribute("y")),
        width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")),
        direction: marker.getAttribute("data-tram-direction"),
        statusCount: document.querySelectorAll(`[data-tram-status][data-tram-line="${id}"]`).length,
      };
    };
    map.open(snapshot);
    const before = [readLine("line-01"), readLine("line-02")];
    state02.theta = 2;
    state02.direction = 1;
    map.render(snapshot);
    const after = [readLine("line-01"), readLine("line-02")];
    map.render({});
    const empty = {
      markers: document.querySelectorAll("[data-tram-marker]").length,
      statuses: document.querySelectorAll("[data-tram-status]").length,
    };
    map.close();
    return { before, after, empty };
  });
  const [axial, curved] = result.before;
  expect(axial.statusCount).toBe(1);
  expect(curved.statusCount).toBe(1);
  expect(axial.width).toBeLessThan(axial.height);
  expect(curved.width).toBeGreaterThan(curved.height);
  expect(axial.direction).toBe("north");
  expect(curved.direction).toBe("west");
  expect([axial.x, axial.y]).not.toEqual([curved.x, curved.y]);
  expect(result.after[0]).toEqual(axial);
  expect(result.after[1].x).not.toBe(curved.x);
  expect(result.after[1].y).toBe(curved.y);
  expect(result.after[1].direction).toBe("east");
  expect(result.empty).toEqual({ markers: 0, statuses: 0 });
});

test("native Line 02 journey and two-line map freeze", async ({ page }) => {
  test.setTimeout(600_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#start-city")).toBeEnabled();
  await page.locator("#start-city").click();
  const waitPosition = (predicate, target) => page.waitForFunction(({ predicate, target }) => {
    const match = (document.querySelector("#position")?.textContent || "").match(/(\d+)°\s*\/\s*(-?\d+)\s*m/);
    if (!match) return false;
    const [angle, y] = [Number(match[1]), Number(match[2])];
    return predicate === "south" ? y <= target : predicate === "east" ? angle >= target : y >= target;
  }, { predicate, target }, { timeout: 120_000 });

  await page.keyboard.down("KeyS");
  await waitPosition("south", Math.round(STILLWATER_TRAM_STOPS[0].y + LENGTH / 2));
  await page.keyboard.up("KeyS");
  await page.keyboard.down("KeyD");
  await waitPosition("east", Math.round(STILLWATER_TRAM_STOPS[0].theta * 180 / Math.PI));
  await page.keyboard.up("KeyD");
  await page.waitForFunction(() => !document.querySelector("#interaction")?.hidden && /board/i.test(document.querySelector("#interaction-label")?.textContent || ""), null, { timeout: 240_000 });
  await page.keyboard.press("KeyE");
  await expect(page.locator("#motion")).toHaveText(/tram/i, { timeout: 30_000 });
  await expect(page.locator("#height")).toHaveText("13.0 m UP");
  await waitPosition("east", 10);
  await page.keyboard.press("KeyE");
  await expect(page.locator("#motion")).toHaveText(/tram/i);
  await expect(page.locator("#height")).toHaveText("13.0 m UP");
  await page.keyboard.press("KeyG");
  await expect(page.locator("#habitat-map")).toBeVisible();
  for (const id of ["line-01", "line-02"]) {
    await expect(page.locator(`.map-link-tram[data-tram-line="${id}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-tram-marker][data-tram-line="${id}"]`)).toBeVisible();
    await expect(page.locator(`[data-tram-status][data-tram-line="${id}"]`)).toHaveCount(1);
  }
  const readMarkers = () => page.locator("[data-tram-marker]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      line: node.getAttribute("data-tram-line"),
      phase: node.getAttribute("data-tram-phase"),
      direction: node.getAttribute("data-tram-direction"),
      rect: ["x", "y", "width", "height"].map((attr) => node.querySelector("rect").getAttribute(attr)),
    })).sort((a, b) => a.line.localeCompare(b.line)));
  const before = await readMarkers();
  expect(before.map(({ line }) => line)).toEqual(["line-01", "line-02"]);
  expect(Number(before[0].rect[2])).toBeLessThan(Number(before[0].rect[3]));
  expect(Number(before[1].rect[2])).toBeGreaterThan(Number(before[1].rect[3]));
  await page.waitForTimeout(1500);
  expect(await readMarkers()).toEqual(before);
  await page.locator("#map-close").click();
  await page.waitForFunction(() => !document.querySelector("#interaction")?.hidden && /exit/i.test(document.querySelector("#interaction-label")?.textContent || ""), null, { timeout: 240_000 });
  await page.keyboard.press("KeyE");
  await expect(page.locator("#height")).toHaveText("0.0 m UP", { timeout: 30_000 });
  await expect(page.locator("#motion")).toHaveText(/on foot|walking/i);
  await page.keyboard.down("KeyD");
  await waitPosition("east", 180);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyW");
  await waitPosition("north", Math.round(LENGTH / 2 + 340 + 5));
  await page.keyboard.up("KeyW");
  expect(errors).toEqual([]);
});
