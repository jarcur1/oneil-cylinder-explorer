import { test, expect } from "@playwright/test";

test("market traffic follows Line 02, and Stillwater paths stay open", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1200, height: 760 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/checks/world.html");
  await page.waitForFunction(() => Boolean(window.__worldFixture));

  // The fixture runs real tram and resident updates but lets the test sample two
  // complete services without waiting for them in real time.
  const outcome = await page.evaluate(async () => {
    const { scene, world, step } = window.__worldFixture;
    const { RADIUS, MERIDIAN_PLACEMENT } = await import("/src/habitat.js");
    const stationId = "tram-meridian-south";
    const any = (prefix) => scene.getObjectsByProperty("isGroup", true).filter((node) => node.name.startsWith(prefix));
    const passengers = any("daily_meridian_passenger_");
    const waiting = new Map(passengers.map((actor) => [actor, actor.position.clone()]));
    const walkers = any("daily_stillwater_walker_");
    const keeper = scene.getObjectByName("daily_groundkeeper");
    const solids = world.obstacles;
    const samples = new Map([...walkers, ...passengers].map((actor) => [actor, {
      minY: Infinity, maxY: -Infinity,
    }]));
    const pose = (actor) => {
      const values = [];
      actor.traverse((node) => values.push(...node.quaternion.toArray()));
      return values;
    };
    const startPose = pose(keeper);
    const status = {};
    const waves = new Map();
    const departuresOutsideDock = [];
    const unseen = new Set();
    const intersections = new Set();
    const away = new Set();
    const returns = new Map();
    let docked = false;
    let visit = 0;
    let working = false;
    for (let frame = 0; frame < 2100; frame++) {
      step(0.1);
      world.stillwaterTram.getStopStatus(stationId, status);
      if (status.docked && !docked) visit++;
      docked = status.docked;
      if (frame % 5 === 0 && !working) working = pose(keeper).some((v, i) => Math.abs(v - startPose[i]) > 0.08);
      for (const [actor, sample] of samples) {
        if (!actor.visible || actor.scale.x < 0.95) unseen.add(actor.name);
        const commuter = passengers.includes(actor);
        const { x, y, z } = actor.position;
        const theta = Math.atan2(x, -z);
        const h = RADIUS - Math.hypot(x, z);
        sample.minY = Math.min(sample.minY, y);
        sample.maxY = Math.max(sample.maxY, y);
        if (commuter) {
          const gap = actor.position.distanceTo(waiting.get(actor));
          if (!away.has(actor) && gap > 0.65) {
            away.add(actor);
            if (!docked) departuresOutsideDock.push(actor.name);
            if (!waves.has(visit)) waves.set(visit, []);
            waves.get(visit).push({ name: actor.name, frame });
          } else if (away.has(actor) && gap < 0.22) {
            away.delete(actor);
            returns.set(actor.name, (returns.get(actor.name) ?? 0) + 1);
          }
        }
        if (frame % 3 !== 0) continue;
        for (const o of solids) {
          if ((o.base ?? 0) >= h + 1.3 || (o.base ?? 0) + o.height <= h + 0.18) continue;
          const a = theta - o.theta;
          const ds = Math.atan2(Math.sin(a), Math.cos(a)) * RADIUS;
          if (Math.abs(ds) < o.width / 2 + 0.18 && Math.abs(y - o.y) < o.depth / 2 + 0.18) {
            intersections.add(`${actor.name}: ${o.name ?? `${(o.theta * RADIUS).toFixed(1)} / ${o.y.toFixed(1)}`}`);
          }
        }
      }
    }
    // Check actual player clearance on both routes and collision with a small solid prop.
    const walk = (s, y, seconds, code = "KeyW") => {
      window.__worldFixture.player.teleport({ theta: s / RADIUS, y, height: 0, yaw: 0 });
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      let state;
      for (let i = 0; i < 60 * seconds; i++) state = step(1 / 60, { updateWorld: false });
      window.dispatchEvent(new KeyboardEvent("keyup", { code }));
      return state.y - y;
    };
    return {
      working,
      waves: [...waves.values()].map((departures) => ({
        names: departures.map((event) => event.name),
        staggered: departures.every((event, index) => index === 0 || event.frame > departures[index - 1].frame),
      })),
      departuresOutsideDock,
      unseen: [...unseen],
      returns: Object.fromEntries(returns),
      intersections: [...intersections],
      walkerTravel: walkers.map((actor) => samples.get(actor).maxY - samples.get(actor).minY),
      passengerDestinations: passengers.map((actor) => MERIDIAN_PLACEMENT.toLocalY(samples.get(actor).maxY)),
      marketWalk: walk(21, MERIDIAN_PLACEMENT.toWorldY(-90), 5),
      pavilionWalk: walk(Math.PI * RADIUS - 72, 450 - 99, 4),
      pumpWalk: walk(26.85, MERIDIAN_PLACEMENT.toWorldY(-67.45), 1, "KeyS"),
    };
  });
  expect(outcome.working).toBe(true);
  const names = [1, 2, 3].map((i) => `daily_meridian_passenger_${i}`);
  expect(outcome.waves).toEqual(Array(2).fill({ names, staggered: true }));
  expect(outcome.departuresOutsideDock).toEqual([]);
  expect(outcome.unseen).toEqual([]);
  expect(outcome.returns).toEqual(Object.fromEntries(names.map((name) => [name, 2])));
  expect(outcome.intersections).toEqual([]);
  expect(outcome.walkerTravel).toHaveLength(2);
  expect(Math.min(...outcome.walkerTravel)).toBeGreaterThan(15);
  expect(Math.min(...outcome.passengerDestinations)).toBeGreaterThan(-91);
  expect(outcome.marketWalk).toBeGreaterThan(18);
  expect(outcome.pavilionWalk).toBeGreaterThan(13);
  expect(outcome.pumpWalk).toBeLessThan(-0.25);
  expect(outcome.pumpWalk).toBeGreaterThan(-0.9);
  expect(errors).toEqual([]);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__worldFixture));
  for (const [name, from, toward, time] of [
    ["meridian-market", [16, 455 - 89, 2.7], [29, 455 - 72, 1.5], 26],
    ["meridian-counters", [21, 455 - 80, 1.7], [28, 455 - 77, 1.45], 0],
    ["meridian-station-market-link", [13.8, 337.3, 2.3], [21, 359, 1.4], 0],
    ["stillwater-grounds", [-91, 450 - 96, 2.2], [-83, 450 - 104, 0.9], 1],
  ]) {
    await page.evaluate(async ({ name, from, toward, time }) => {
      const f = window.__worldFixture;
      const { RADIUS } = await import("/src/habitat.js");
      const { surfacePos, surfaceUp } = await import("/src/surface.js");
      const theta = ([s]) => s / RADIUS + (name.startsWith("stillwater") ? Math.PI : 0);
      const pos = (point) => surfacePos(theta(point), point[1], point[2]);
      for (let i = 0; i < Math.round(time * 10); i++) f.step(0.1);
      f.camera.position.copy(pos(from));
      f.camera.up.copy(surfaceUp(theta(from)));
      f.camera.lookAt(pos(toward));
      f.render();
    }, { name, from, toward, time });
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  }
});
