import { test, expect } from "@playwright/test";
import {
  RADIUS,
  LENGTH,
  SPAWN,
  VIEW_DISTANCE,
} from "../src/habitat.js";
import { DISTRICT_BOUNDS, DISTRICT_STOPS } from "../src/district-layout.js";
import { CITY_ARRIVAL, CITY_BOUNDS, CITY_STOPS } from "../src/city-layout.js";
import { DELIVERY_STATIONS } from "../src/delivery-layout.js";
import {
  AXIAL_HEIGHT,
  ENDCAP_HUBS,
  SUNLINE_TRACK_MIN_Y,
  SUNLINE_TRACK_MAX_Y,
} from "../src/sunline-layout.js";
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
test("stale untouched tab exit preserves active tab save and reset stays cleared", async ({
  browser,
}) => {
  // Multi-tab sequential WebGL loads, Endcap A lift + walk, reset reload, and Tab D check under software GPU.
  test.setTimeout(120_000);
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  try {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await test.step("Open Tab A and Tab B and isolate SL-02 on Tab A", async () => {
      await Promise.all([pageA.goto("/"), pageB.goto("/")]);
      await expect(pageA.locator("#start")).toBeEnabled();
      await expect(pageB.locator("#start")).toBeEnabled();

      await pageA.bringToFront();
      await pageA.locator("#start").click();
      await expect(pageA.locator("#pause")).toBeVisible();
      await expect(pageA.locator("#interaction")).toBeVisible();
      await expect(pageA.locator("#interaction-label")).toContainText("Endcap A");

      // Ride radial lift to Endcap A hub and wait for actual secured floor + discovery
      await pageA.keyboard.press("KeyE");
      await expect(pageA.locator("#viewport")).not.toHaveClass(/lift-travel/, {
        timeout: 20_000,
      });
      await expect(pageA.locator("#motion")).toHaveText("MAG BOOTS SECURED");
      await expect(pageA.locator("#height")).toHaveText(`${AXIAL_HEIGHT.toFixed(1)} m UP`);
      await expect(pageA.locator("#area")).toContainText("ENDCAP A");
      const hubRowA = pageA.locator("#landmarks li", {
        hasText: "Endcap A maintenance hub",
      });
      await expect(hubRowA).toHaveClass(/found/);
      await expect(hubRowA).toContainText("VISITED");

      // Walk along the hub deck until longitudinal coordinate reaches console row, then move laterally to console proximity
      const controlLongitudinalM = Math.round(
        ENDCAP_HUBS[0].control.y + LENGTH / 2,
      );
      await pageA.keyboard.down("KeyW");
      await pageA.waitForFunction(
        (targetM) => {
          const pos = document.getElementById("position")?.textContent || "";
          const match = pos.match(/\/\s*(\d+)\s*m$/);
          return match && Number(match[1]) >= targetM;
        },
        controlLongitudinalM,
        { timeout: 45_000 },
      );
      await pageA.keyboard.up("KeyW");

      await pageA.keyboard.down("KeyD");
      await pageA.waitForFunction(
        () => {
          const box = document.getElementById("interaction");
          const label = document.getElementById("interaction-label");
          return box && !box.hidden && label && label.textContent.includes("Isolate");
        },
        null,
        { timeout: 45_000 },
      );
      await pageA.keyboard.up("KeyD");
      await pageA.keyboard.press("KeyE");

      await expect(pageA.locator("#sunline-job")).toHaveAttribute(
        "data-phase",
        "isolated",
      );
      await expect(pageA.locator("#sunline-progress")).toHaveText("1 / 3");
      await expect(pageA.locator("#sunline-district")).toHaveAttribute(
        "data-online",
        "false",
      );

      // Pause progressed Tab A before closing B or loading C to halt software-GPU rendering
      await pageA.keyboard.press("Escape");
      await expect(pageA.locator("#pause-panel")).toBeVisible();
    });

    let pageC;

    await test.step("Close untouched Tab B and verify Tab C restores saved progress", async () => {
      await pageB.goto("about:blank");
      await pageB.close();

      pageC = await context.newPage();
      await pageC.goto("/");
      await expect(pageC.locator("#start")).toBeEnabled();

      const persisted = await pageC.evaluate(() =>
        JSON.parse(localStorage.getItem("new-dawn.save.v1")),
      );
      expect(persisted.discoveries).toEqual(["endcap-a-hub"]);
      expect(persisted.sunlinePhase).toBe("isolated");

      await pageC.locator("#start").click();
      await expect(pageC.locator("#pause")).toBeVisible();
      await expect(pageC.locator("#landmarks li.found")).toHaveCount(1);
      const hubRowC = pageC.locator("#landmarks li", {
        hasText: "Endcap A maintenance hub",
      });
      await expect(hubRowC).toHaveClass(/found/);
      await expect(hubRowC).toContainText("VISITED");
      await expect(pageC.locator("#sunline-job")).toHaveAttribute(
        "data-phase",
        "isolated",
      );
      await expect(pageC.locator("#sunline-progress")).toHaveText("1 / 3");
      await expect(pageC.locator("#sunline-district")).toHaveAttribute(
        "data-online",
        "false",
      );
    });

    await test.step("Reset progress on Tab C and verify cleared state", async () => {
      await pageC.keyboard.press("Escape");
      await expect(pageC.locator("#pause-panel")).toBeVisible();
      const reloaded = pageC.waitForEvent("load");
      pageC.once("dialog", (dialog) => dialog.accept());
      await pageC.locator("#new-game").click();
      await reloaded;
      await expect(pageC.locator("#start")).toBeVisible();
      await expect(pageC.locator("#start")).toBeEnabled();

      const afterReset = await pageC.evaluate(() =>
        JSON.parse(localStorage.getItem("new-dawn.save.v1")),
      );
      expect(afterReset.discoveries).toEqual([]);
      expect(afterReset.sunlinePhase).toBe("available");

      await pageC.locator("#start").click();
      await expect(pageC.locator("#pause")).toBeVisible();
      await expect(pageC.locator("#landmarks li.found")).toHaveCount(0);
      await expect(pageC.locator("#sunline-job")).toHaveAttribute(
        "data-phase",
        "available",
      );
      await expect(pageC.locator("#sunline-progress")).toHaveText("0 / 3");
      await expect(pageC.locator("#sunline-district")).toHaveAttribute(
        "data-online",
        "true",
      );

      await pageC.keyboard.press("Escape");
      await expect(pageC.locator("#pause-panel")).toBeVisible();
    });

    await test.step("Navigate/close old progressed Tab A and verify fresh Tab D remains cleared", async () => {
      await pageA.goto("about:blank");
      await pageA.close();

      const pageD = await context.newPage();
      await pageD.goto("/");
      await expect(pageD.locator("#start")).toBeEnabled();

      const afterOldTabExit = await pageD.evaluate(() =>
        JSON.parse(localStorage.getItem("new-dawn.save.v1")),
      );
      expect(afterOldTabExit.discoveries).toEqual([]);
      expect(afterOldTabExit.sunlinePhase).toBe("available");

      await pageD.locator("#start").click();
      await expect(pageD.locator("#pause")).toBeVisible();
      await expect(pageD.locator("#landmarks li.found")).toHaveCount(0);
      await expect(pageD.locator("#sunline-job")).toHaveAttribute(
        "data-phase",
        "available",
      );
      await expect(pageD.locator("#sunline-progress")).toHaveText("0 / 3");
      await expect(pageD.locator("#sunline-district")).toHaveAttribute(
        "data-online",
        "true",
      );
    });
  } finally {
    await context.close();
  }
});

test("missing AudioParam.cancelAndHoldAtTime still runs native audio and pause/resume cleanly", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.addInitScript(() => {
      delete window.AudioParam.prototype.cancelAndHoldAtTime;
      window.__audioTaps = [];
      const origConnect = AudioNode.prototype.connect;
      const analysers = new WeakMap();
      AudioNode.prototype.connect = function wrappedConnect(target, ...rest) {
        const ctx = this.context;
        if (
          ctx &&
          target === ctx.destination &&
          !(this instanceof AnalyserNode)
        ) {
          let analyser = analysers.get(ctx);
          if (!analyser) {
            analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            analysers.set(ctx, analyser);
            origConnect.call(analyser, ctx.destination);
            window.__audioTaps.push({ ctx, analyser });
          }
          origConnect.call(this, analyser, ...rest);
          return target;
        }
        return origConnect.call(this, target, ...rest);
      };
    });


    const waitAudibleAfter = (minTime) =>
      page
        .waitForFunction((tMin) => {
          const tap = window.__audioTaps.at(-1);
          if (!tap || tap.ctx.state !== "running" || tap.ctx.currentTime <= tMin)
            return null;
          const buf = new Float32Array(tap.analyser.fftSize);
          tap.analyser.getFloatTimeDomainData(buf);
          let maxAbs = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = Math.abs(buf[i]);
            if (v > maxAbs) maxAbs = v;
          }
          return maxAbs > 5e-5
            ? {
                count: window.__audioTaps.length,
                state: tap.ctx.state,
                currentTime: tap.ctx.currentTime,
                maxAbs,
              }
            : null;
        }, minTime)
        .then((h) => h.jsonValue());

    const getAudioClock = () =>
      page.evaluate(() => {
        const tap = window.__audioTaps.at(-1);
        return tap
          ? { state: tap.ctx.state, currentTime: tap.ctx.currentTime }
          : null;
      });

    await page.goto("/");
    await expect(page.locator("#start")).toBeEnabled();
    expect(
      await page.evaluate(
        () => typeof window.AudioParam.prototype.cancelAndHoldAtTime,
      ),
    ).toBe("undefined");

    await page.locator("#start").click();
    await expect(page.locator("#pause")).toBeVisible();
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "running",
    );
    await expect(page.locator("#sound")).toHaveText("SOUND ON");

    const started0 = await waitAudibleAfter(0.03);
    expect(started0.count).toBe(1);
    expect(started0.maxAbs).toBeGreaterThan(5e-5);
    const started1 = await waitAudibleAfter(started0.currentTime + 0.03);
    expect(started1.currentTime).toBeGreaterThan(started0.currentTime);
    expect(started1.maxAbs).toBeGreaterThan(5e-5);

    // Mute exercises requestSilence without cancelAndHoldAtTime and freezes audio clock
    await page.keyboard.press("KeyM");
    await expect(page.locator("#sound")).toHaveText("SOUND OFF");
    await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "paused",
    );
    await page.waitForFunction(
      () => window.__audioTaps.at(-1)?.ctx.state === "suspended",
    );
    const muted0 = await getAudioClock();
    await waitFrames(page, 8);
    const muted1 = await getAudioClock();
    expect(muted1.state).toBe("suspended");
    expect(muted1.currentTime).toBe(muted0.currentTime);

    // Unmute restarts native audio clock and audible output
    await page.keyboard.press("KeyM");
    await expect(page.locator("#sound")).toHaveText("SOUND ON");
    await expect(page.locator("#sound")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "running",
    );
    const unmuted = await waitAudibleAfter(muted1.currentTime + 0.03);
    expect(unmuted.maxAbs).toBeGreaterThan(5e-5);

    // Pause must not throw, must freeze audio clock, and must show resume UI
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await expect(page.locator("#resume")).toBeFocused();
    await expect(page.locator("#pause")).toBeHidden();
    await expect(page.locator("#crosshair")).toBeHidden();
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "paused",
    );
    await page.waitForFunction(
      () => window.__audioTaps.at(-1)?.ctx.state === "suspended",
    );
    const paused0 = await getAudioClock();
    await waitFrames(page, 8);
    const paused1 = await getAudioClock();
    expect(paused1.state).toBe("suspended");
    expect(paused1.currentTime).toBe(paused0.currentTime);

    // Resume restarts native audio output and active UI
    await page.locator("#resume").click();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await expect(page.locator("#pause")).toBeVisible();
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "running",
    );
    const resumed = await waitAudibleAfter(paused1.currentTime + 0.03);
    expect(resumed.maxAbs).toBeGreaterThan(5e-5);

    // Deterministic latest-request stress: rapid mute toggles converge to final parity without spawning a second context
    await page.keyboard.press("KeyM");
    await page.keyboard.press("KeyM");
    await page.keyboard.press("KeyM");
    await expect(page.locator("#sound")).toHaveText("SOUND OFF");
    await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "paused",
    );
    await page.waitForFunction(
      () => window.__audioTaps.at(-1)?.ctx.state === "suspended",
    );
    const stressMuted = await getAudioClock();
    expect(stressMuted.state).toBe("suspended");

    await page.keyboard.press("KeyM");
    await page.keyboard.press("KeyM");
    await page.keyboard.press("KeyM");
    await expect(page.locator("#sound")).toHaveText("SOUND ON");
    await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#sound")).toHaveAttribute(
      "data-status",
      "running",
    );
    const stressResumed = await waitAudibleAfter(stressMuted.currentTime + 0.03);
    expect(stressResumed.count).toBe(1);
    expect(stressResumed.maxAbs).toBeGreaterThan(5e-5);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

for (const closeWhile of ["paused", "running"]) {
  test(`closed ${closeWhile} AudioContext becomes unavailable without blocking gameplay`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.addInitScript(() => {
        const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
        window.__audioContexts = [];
        class ObservedAudioContext extends NativeAudioContext {
          constructor(...args) {
            super(...args);
            window.__audioContexts.push(this);
          }
        }
        if (window.AudioContext) window.AudioContext = ObservedAudioContext;
        if (window.webkitAudioContext) window.webkitAudioContext = ObservedAudioContext;
      });
      await page.goto("/");
      await expect(page.locator("#start")).toBeEnabled();
      await page.locator("#start").click();
      await expect(page.locator("#sound")).toHaveAttribute("data-status", "running");
      if (closeWhile === "paused") {
        await page.keyboard.press("Escape");
        await expect(page.locator("#pause-panel")).toBeVisible();
        await expect(page.locator("#sound")).toHaveAttribute("data-status", "paused");
      }

      // Paused: mute must handle suspend rejection without a frame update.
      // Running: a frame failure must update the HUD without user interaction.
      await page.evaluate(async () => {
        await window.__audioContexts[0].close();
      });
      if (closeWhile === "running") {
        await expect(page.locator("#sound")).toHaveText("SOUND N/A");
      }
      await page.keyboard.press("KeyM");
      await expect(page.locator("#sound")).toHaveText("SOUND N/A");
      await expect(page.locator("#sound")).toHaveAttribute("data-status", "unavailable");
      await expect(page.locator("#sound")).toBeDisabled();
      if (closeWhile === "running") await page.keyboard.press("Escape");
      await expect(page.locator("#pause-panel")).toBeVisible();

      await page.locator("#resume").click();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#interaction-label")).toContainText("Endcap A");
      await page.keyboard.press("KeyE");
      await expect(page.locator("#height")).toHaveText(`${AXIAL_HEIGHT.toFixed(1)} m UP`);
      await expect(page.locator("#motion")).toHaveText("MAG BOOTS SECURED");
      await expect(page.locator("#sound")).toHaveText("SOUND N/A");
      expect(await page.evaluate(() => window.__audioContexts.map((ctx) => ctx.state)))
        .toEqual(["closed"]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("idle and paused frames avoid WebGL redraws while resize, resume, and paused lifts work", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
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
    });

    const getDraws = () => page.evaluate(() => window.__webglDrawCalls);

    await page.goto("/");
    await expect(page.locator("#start")).toBeEnabled();
    await waitFrames(page, 2);

    // Idle on intro emits zero draws across 30 explicit RAF frames
    const intro0 = await getDraws();
    await waitFrames(page, 30);
    const intro1 = await getDraws();
    expect(intro1).toBe(intro0);

    // Playing in Greenway submits draws
    await page.locator("#start-greenway").click();
    await expect(page.locator("#pause")).toBeVisible();
    await page.waitForFunction(
      (prev) => window.__webglDrawCalls > prev,
      intro1,
    );
    const playingDraws = await getDraws();
    expect(playingDraws).toBeGreaterThan(intro1);

    // Pausing stops draws across 30 explicit RAF frames
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await waitFrames(page, 2);
    const paused0 = await getDraws();
    await waitFrames(page, 30);
    const paused1 = await getDraws();
    expect(paused1).toBe(paused0);

    // Resize while paused triggers a redraw and returns to idle across 30 RAF frames
    await page.setViewportSize({ width: 960, height: 600 });
    await page.waitForFunction(
      (prev) => window.__webglDrawCalls > prev,
      paused1,
    );
    const resized0 = await getDraws();
    expect(resized0).toBeGreaterThan(paused1);
    await waitFrames(page, 30);
    const resized1 = await getDraws();
    expect(resized1).toBe(resized0);

    // Resume restarts rendering
    await page.locator("#resume").click();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await page.waitForFunction(
      (prev) => window.__webglDrawCalls > prev,
      resized1,
    );
    const resumedDraws = await getDraws();
    expect(resumedDraws).toBeGreaterThan(resized1);

    // Pausing during an in-progress lift keeps lift-travel active and pose frozen until resume
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await page.locator("#visit-endcap").click();
    await expect(page.locator("#pause-panel")).toBeHidden();
    await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/);
    await expect(page.locator("#height")).toHaveText("0.0 m UP");
    await expect(page.locator("#interaction")).toBeVisible();
    await expect(page.locator("#interaction-label")).toContainText("Endcap A");

    await page.keyboard.press("KeyE");
    await expect(page.locator("#viewport")).toHaveClass(/lift-travel/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-panel")).toBeVisible();
    await expect(page.locator("#viewport")).toHaveClass(/lift-travel/);
    await expect(page.locator("#height")).toHaveText("0.0 m UP");

    await waitFrames(page, 2);
    const liftPaused0 = await getDraws();
    await waitFrames(page, 30);
    expect(await getDraws()).toBe(liftPaused0);
    await expect(page.locator("#viewport")).toHaveClass(/lift-travel/);
    await expect(page.locator("#height")).toHaveText("0.0 m UP");
    await expect(page.locator("#area")).toContainText("RIM ACCESS");

    await page.locator("#resume").click();
    await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/);
    await expect(page.locator("#height")).toHaveText(`${AXIAL_HEIGHT.toFixed(1)} m UP`);
    await expect(page.locator("#motion")).toHaveText("MAG BOOTS SECURED");
    await expect(page.locator("#area")).toContainText("ENDCAP A");
  } finally {
    await context.close();
  }
});

test("authored city lifts and endcap axial trolley roundtrips work through production world and selectors", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/checks/world.html");
    await page.waitForFunction(() => Boolean(window.__worldFixture));

    const summary = await page.evaluate(() => {
      const f = window.__worldFixture;
      const {
        world,
        player,
        step,
        render,
        getCityLift,
        getSunlineTransfer,
        inspectSunlineTrolley,
        inspectSunlineCorridorInstances,
        walkSecuredTo,
        layouts,
      } = f;

      const settle = (count = 5) => {
        let last;
        for (let i = 0; i < count; i++) last = step(1 / 60);
        return last;
      };

      // 1. Tower lift: 0 m <-> 42 m
      player.teleport({
        theta: layouts.MAIN_LIFT.theta,
        y: layouts.MAIN_LIFT.y,
        height: 0,
      });
      let s = settle(2);
      const toSkyroom = getCityLift(s);
      if (!toSkyroom || !toSkyroom.prompt.includes("42 m")) {
        throw new Error(`Expected Skyroom lift prompt, got ${toSkyroom?.prompt}`);
      }
      if (getCityLift({ ...s, grounded: false }) !== null) {
        throw new Error("Airborne state must not expose lift prompt");
      }
      player.teleport(toSkyroom.destination);
      s = settle(6);
      render();
      if (s.height !== 42 || !s.grounded || s.traversalMode !== "walk") {
        throw new Error(`Skyroom arrival mismatch: ${JSON.stringify(s)}`);
      }
      const toLobby = getCityLift(s);
      if (!toLobby || !toLobby.prompt.includes("lobby")) {
        throw new Error(`Expected lobby lift prompt, got ${toLobby?.prompt}`);
      }
      player.teleport(toLobby.destination);
      s = settle(6);
      if (s.height !== 0 || !s.grounded) {
        throw new Error(`Lobby return mismatch: ${JSON.stringify(s)}`);
      }

      // 2. Skywalk lift: 0 m <-> 9 m
      player.teleport({
        theta: layouts.SKYWALK_LIFT.theta,
        y: layouts.SKYWALK_LIFT.y,
        height: 0,
      });
      s = settle(2);
      const toSkywalk = getCityLift(s);
      if (!toSkywalk || !toSkywalk.prompt.includes("9 m")) {
        throw new Error(`Expected Skywalk lift prompt, got ${toSkywalk?.prompt}`);
      }
      player.teleport(toSkywalk.destination);
      s = settle(6);
      if (s.height !== 9 || !s.grounded) {
        throw new Error(`Skywalk arrival mismatch: ${JSON.stringify(s)}`);
      }
      const toStreet = getCityLift(s);
      if (!toStreet || !toStreet.prompt.includes("street")) {
        throw new Error(`Expected street lift prompt, got ${toStreet?.prompt}`);
      }
      player.teleport(toStreet.destination);
      s = settle(6);
      if (s.height !== 0 || !s.grounded) {
        throw new Error(`Street return mismatch: ${JSON.stringify(s)}`);
      }

      // 3. Service level lift: 0 m <-> -8 m
      player.teleport({
        theta: layouts.SERVICE_ACCESS.theta,
        y: layouts.SERVICE_ACCESS.y,
        height: 0,
      });
      s = settle(2);
      const toService = getCityLift(s);
      if (!toService || !toService.prompt.includes("8 m below")) {
        throw new Error(`Expected service lift prompt, got ${toService?.prompt}`);
      }
      player.teleport(toService.destination);
      s = settle(6);
      if (s.height !== -8 || !s.grounded) {
        throw new Error(`Service arrival mismatch: ${JSON.stringify(s)}`);
      }
      const toSurface = getCityLift(s);
      if (!toSurface || !toSurface.prompt.includes("surface")) {
        throw new Error(`Expected surface lift prompt, got ${toSurface?.prompt}`);
      }
      player.teleport(toSurface.destination);
      s = settle(6);
      if (s.height !== 0 || !s.grounded) {
        throw new Error(`Surface return mismatch: ${JSON.stringify(s)}`);
      }

      // 4. Endcap A rim -> secured -> trolley -> drive across spine -> Endcap B -> return to Endcap A rim
      const trolleySpeed = layouts.ENDCAP_HUBS[0].trolley.constraint.speed;
      const endcapAY = layouts.ENDCAP_HUBS[0].trolley.y;
      const endcapBY = layouts.ENDCAP_HUBS[1].trolley.y;
      const sl02Y = layouts.SUNLINE_PANEL.y;

      const driveW = (targetY, dir) => {
        const dt = 0.05;
        const distance = Math.abs(targetY - s.y);
        const maxSteps = Math.ceil(distance / (trolleySpeed * dt)) + 10;
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
        for (let i = 0; i < maxSteps; i++) {
          s = step(dt);
          if ((dir > 0 && s.y >= targetY) || (dir < 0 && s.y <= targetY)) break;
        }
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
      };

      const trolleyHiddenInitial = inspectSunlineTrolley();
      player.teleport(layouts.ENDCAP_HUBS[0].rim);
      s = settle(2);
      const liftToHubA = getSunlineTransfer(s);
      if (!liftToHubA || !liftToHubA.prompt.includes("Endcap A")) {
        throw new Error(`Expected Endcap A rim lift, got ${liftToHubA?.prompt}`);
      }
      player.teleport(liftToHubA.destination);
      s = settle(4);
      if (s.height !== layouts.AXIAL_HEIGHT || s.traversalMode !== "secured") {
        throw new Error(`Hub A arrival mismatch: ${JSON.stringify(s)}`);
      }
      const trolleyHiddenOnLanding = inspectSunlineTrolley();

      // Walk landing -> console -> dock in Endcap A using real controller keys
      s = walkSecuredTo(
        layouts.ENDCAP_HUBS[0].control.theta,
        layouts.ENDCAP_HUBS[0].control.y,
      );
      const hubAConsolePrompt = world.sunline.getView(s).prompt;
      render();

      s = walkSecuredTo(
        layouts.ENDCAP_HUBS[0].dock.theta,
        layouts.ENDCAP_HUBS[0].dock.y,
      );
      const boardA = getSunlineTransfer(s);
      if (!boardA || !boardA.prompt.includes("Board")) {
        throw new Error(`Expected trolley board at A, got ${boardA?.prompt}`);
      }
      player.teleport(boardA.destination);
      s = settle(2);
      if (s.traversalMode !== "trolley" || s.railDirection !== 1) {
        throw new Error(`Trolley A mismatch: ${JSON.stringify(s)}`);
      }
      const trolleyBoardA = inspectSunlineTrolley();
      render();

      driveW(sl02Y, 1);
      if (Math.abs(s.y - sl02Y) > 1.0) {
        throw new Error(`Expected trolley pass at SL-02 y=${sl02Y}, got ${s.y}`);
      }
      const trolleyAtSl02 = inspectSunlineTrolley();
      const sl02ObservedY = s.y;
      const corridorInstances = inspectSunlineCorridorInstances();

      driveW(endcapBY, 1);
      if (s.y !== endcapBY) {
        throw new Error(`Expected trolley arrival at y=${endcapBY}, got ${s.y}`);
      }
      const trolleyEndB = inspectSunlineTrolley();

      const dockB = getSunlineTransfer(s);
      if (!dockB || !dockB.prompt.includes("Endcap B")) {
        throw new Error(`Expected disembark at B, got ${dockB?.prompt}`);
      }
      player.teleport(dockB.destination);
      s = settle(2);
      if (s.traversalMode !== "secured" || s.height !== layouts.AXIAL_HEIGHT) {
        throw new Error(`Dock B arrival mismatch: ${JSON.stringify(s)}`);
      }
      const trolleyHiddenAfterDisembarkB = inspectSunlineTrolley();

      // Walk dock -> console -> landing in Endcap B using real controller keys
      s = walkSecuredTo(
        layouts.ENDCAP_HUBS[1].control.theta,
        layouts.ENDCAP_HUBS[1].control.y,
      );
      const hubBConsolePrompt = world.sunline.getView(s).prompt;

      s = walkSecuredTo(
        layouts.ENDCAP_HUBS[1].landing.theta,
        layouts.ENDCAP_HUBS[1].landing.y,
      );
      const liftToRimB = getSunlineTransfer(s);
      if (!liftToRimB || !liftToRimB.prompt.includes("Endcap B rim")) {
        throw new Error(`Expected Endcap B rim lift, got ${liftToRimB?.prompt}`);
      }
      render();
      player.teleport(liftToRimB.destination);
      s = settle(4);
      if (s.height !== 0 || s.traversalMode !== "walk" || !s.grounded) {
        throw new Error(`Rim B arrival mismatch: ${JSON.stringify(s)}`);
      }

      // Return trip: Rim B -> Hub B landing -> walk to dock -> Trolley (-1) -> Dock A -> walk to landing -> Rim A
      player.teleport(getSunlineTransfer(s).destination);
      s = settle(2);
      s = walkSecuredTo(
        layouts.ENDCAP_HUBS[1].dock.theta,
        layouts.ENDCAP_HUBS[1].dock.y,
      );
      player.teleport(getSunlineTransfer(s).destination);
      s = settle(2);
      if (s.traversalMode !== "trolley" || s.railDirection !== -1) {
        throw new Error(`Trolley B mismatch: ${JSON.stringify(s)}`);
      }
      const trolleyBoardB = inspectSunlineTrolley();

      driveW(endcapAY, -1);
      if (s.y !== endcapAY) {
        throw new Error(`Expected trolley return at y=${endcapAY}, got ${s.y}`);
      }
      const trolleyReturnA = inspectSunlineTrolley();
      const dockA = getSunlineTransfer(s);
      if (!dockA || !dockA.prompt.includes("Endcap A")) {
        throw new Error(`Expected disembark at A, got ${dockA?.prompt}`);
      }
      player.teleport(dockA.destination);
      s = settle(2);
      const trolleyHiddenAfterDisembarkA = inspectSunlineTrolley();

      s = walkSecuredTo(
        layouts.ENDCAP_HUBS[0].landing.theta,
        layouts.ENDCAP_HUBS[0].landing.y,
      );
      const liftToRimA = getSunlineTransfer(s);
      if (!liftToRimA || !liftToRimA.prompt.includes("Endcap A rim")) {
        throw new Error(`Expected Endcap A rim lift, got ${liftToRimA?.prompt}`);
      }
      player.teleport(liftToRimA.destination);
      s = settle(4);
      render();

      return {
        finalHeight: s.height,
        finalMode: s.traversalMode,
        finalGrounded: s.grounded,
        hubAConsolePrompt,
        hubBConsolePrompt,
        sl02ObservedY,
        endcapAY,
        endcapBY,
        axialZ: layouts.RADIUS - layouts.AXIAL_HEIGHT,
        trolleyHiddenInitial,
        trolleyHiddenOnLanding,
        trolleyBoardA,
        trolleyAtSl02,
        trolleyEndB,
        trolleyHiddenAfterDisembarkB,
        trolleyBoardB,
        trolleyReturnA,
        trolleyHiddenAfterDisembarkA,
        corridorInstances,
      };
    });

    expect(summary.finalHeight).toBe(0);
    expect(summary.finalMode).toBe("walk");
    expect(summary.finalGrounded).toBe(true);
    expect(summary.hubAConsolePrompt).toContain("Isolate");
    expect(summary.hubBConsolePrompt).toContain("Isolate");

    expect(summary.trolleyHiddenInitial.found).toBe(true);
    expect(summary.trolleyHiddenInitial.visible).toBe(false);
    expect(summary.trolleyHiddenOnLanding.visible).toBe(false);
    expect(summary.trolleyHiddenAfterDisembarkB.visible).toBe(false);
    expect(summary.trolleyHiddenAfterDisembarkA.visible).toBe(false);

    for (const [label, sample, expectedY] of [
      ["boardA", summary.trolleyBoardA, summary.endcapAY],
      ["sl02", summary.trolleyAtSl02, summary.sl02ObservedY],
      ["endB", summary.trolleyEndB, summary.endcapBY],
      ["boardB", summary.trolleyBoardB, summary.endcapBY],
      ["returnA", summary.trolleyReturnA, summary.endcapAY],
    ]) {
      expect(sample.found, `${label} found`).toBe(true);
      expect(sample.visible, `${label} visible`).toBe(true);
      expect(Math.abs(sample.worldPos.x), `${label} x`).toBeLessThan(0.05);
      expect(
        Math.abs(sample.worldPos.z - summary.axialZ),
        `${label} z`,
      ).toBeLessThan(0.05);
      expect(
        Math.abs(sample.worldPos.y - expectedY),
        `${label} y`,
      ).toBeLessThan(0.05);
    }
    expect(summary.trolleyBoardA.spareEmitterVisible).toBe(true);
    expect(summary.trolleyBoardA.rotationZ).toBe(0);
    expect(Math.abs(summary.trolleyBoardB.rotationZ - Math.PI)).toBeLessThan(
      1e-5,
    );

    const expectedInstanceCount =
      Math.floor((SUNLINE_TRACK_MAX_Y - SUNLINE_TRACK_MIN_Y) / 10) + 1;
    expect(summary.corridorInstances.length).toBe(3);
    for (const inst of summary.corridorInstances) {
      expect(inst.count).toBe(expectedInstanceCount);
      expect(inst.hasBoundingBox).toBe(true);
      expect(inst.hasBoundingSphere).toBe(true);
      expect(inst.minY).toBeLessThanOrEqual(SUNLINE_TRACK_MIN_Y + 0.5);
      expect(inst.maxY).toBeGreaterThanOrEqual(SUNLINE_TRACK_MAX_Y - 0.5);
      expect(inst.sphereRadius).toBeGreaterThanOrEqual(
        (SUNLINE_TRACK_MAX_Y - SUNLINE_TRACK_MIN_Y) / 2,
      );
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("real main service lift switches and restores render camera layers during travel", async ({
  browser,
}) => {
  // This 48 m native walk, two lift travels, and WebGL pixel readbacks use
  // capped simulation time under slow software rendering.
  test.setTimeout(150_000);
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("#start-city")).toBeEnabled();

    // Passively observe the actual Three.js Scene render camera mask via the loaded Three module URL
    const hooked = await page.evaluate(async () => {
      const { RADIUS } = await import("/src/habitat.js");
      const { SERVICE_ACCESS } = await import("/src/service-layout.js");
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
      let threeUrl = null;
      for (const url of candidates) {
        try {
          const mod = await import(url);
          if (mod?.Scene?.prototype?.onBeforeRender) {
            ThreeMod = mod;
            threeUrl = url;
            break;
          }
        } catch {}
      }
      if (!ThreeMod) {
        throw new Error(
          `Could not locate loaded Three module from: ${JSON.stringify(candidates)}`,
        );
      }

      const observer = {
        threeUrl,
        renderCount: 0,
        lastMask: null,
        arc: null,
        targetArc: SERVICE_ACCESS.theta * RADIUS,
        masksSeen: [],
        wantSample: false,
        lastSample: null,
      };
      window.__serviceCameraObserver = observer;

      const origBefore = ThreeMod.Scene.prototype.onBeforeRender;
      ThreeMod.Scene.prototype.onBeforeRender = function observedBeforeRender(
        renderer,
        scene,
        camera,
        ...rest
      ) {
        if (camera?.layers) {
          observer.renderCount++;
          observer.lastMask = camera.layers.mask;
          observer.arc =
            Math.atan2(camera.position.x, -camera.position.z) * RADIUS;
          if (observer.masksSeen.at(-1) !== camera.layers.mask) {
            observer.masksSeen.push(camera.layers.mask);
          }
        }
        return origBefore.call(this, renderer, scene, camera, ...rest);
      };

      const origAfter = ThreeMod.Scene.prototype.onAfterRender;
      ThreeMod.Scene.prototype.onAfterRender = function observedAfterRender(
        renderer,
        scene,
        camera,
        ...rest
      ) {
        if (observer.wantSample && renderer?.getContext) {
          observer.wantSample = false;
          const gl = renderer.getContext();
          const size = 24;
          const x = Math.max(0, Math.floor((gl.drawingBufferWidth - size) / 2));
          const y = Math.max(0, Math.floor((gl.drawingBufferHeight - size) / 2));
          const pixels = new Uint8Array(size * size * 4);
          gl.readPixels(x, y, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let lumSum = 0;
          const count = size * size;
          for (let i = 0; i < pixels.length; i += 4) {
            lumSum +=
              (0.2126 * pixels[i] +
                0.7152 * pixels[i + 1] +
                0.0722 * pixels[i + 2]) /
              255;
          }
          observer.lastSample = {
            mask: camera?.layers?.mask ?? null,
            meanLuminance: lumSum / count,
          };
        }
        return origAfter.call(this, renderer, scene, camera, ...rest);
      };

      return { threeUrl };
    });

    const sampleActiveRender = async () => {
      await page.evaluate(() => {
        window.__serviceCameraObserver.lastSample = null;
        window.__serviceCameraObserver.wantSample = true;
      });
      await page.waitForFunction(
        () => window.__serviceCameraObserver.lastSample !== null,
      );
      return page.evaluate(() => window.__serviceCameraObserver.lastSample);
    };

    await test.step("Walk via native WASD from Meridian arrival to service pavilion", async () => {
      await page.locator("#start-city").click();
      await expect(page.locator("#pause")).toBeVisible();
      await expect(page.locator("#area")).toContainText("MERIDIAN CIVIC DISTRICT");
      await expect(page.locator("#height")).toHaveText("0.0 m UP");

      await page.waitForFunction(
        () => (window.__serviceCameraObserver?.renderCount ?? 0) >= 2,
      );
      expect(
        await page.evaluate(() => window.__serviceCameraObserver.lastMask),
      ).toBe(1);

      // Align on rendered camera position; rounded HUD degrees span more than
      // three metres here and cannot reliably identify the narrow doorway.
      await page.keyboard.down("KeyA");
      await page.waitForFunction(
        () => {
          const observed = window.__serviceCameraObserver;
          return (
            observed.arc !== null &&
            Math.abs(observed.arc - observed.targetArc) < 0.4
          );
        },
        null,
        { timeout: 45_000 },
      );
      await page.keyboard.up("KeyA");

      // Sprint north along the clear south approach into the service pavilion
      await page.keyboard.down("ShiftLeft");
      await page.keyboard.down("KeyW");
      await page.waitForFunction(
        () => {
          const box = document.getElementById("interaction");
          const label = document.getElementById("interaction-label");
          return (
            box &&
            !box.hidden &&
            label &&
            label.textContent.includes("Descend to service level")
          );
        },
        null,
        { timeout: 60_000 },
      );
      await page.keyboard.up("KeyW");
      await page.keyboard.up("ShiftLeft");
    });

    const surfaceSample = await sampleActiveRender();
    expect(surfaceSample.mask).toBe(1);
    expect(surfaceSample.meanLuminance).toBeGreaterThan(0.01);

    await test.step("Descend to service level and verify camera switches to layer 1", async () => {
      await page.keyboard.press("KeyE");
      await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/, {
        timeout: 20_000,
      });
      await expect(page.locator("#height")).toHaveText("8.0 m DOWN");
      await expect(page.locator("#area")).toContainText("MERIDIAN SERVICE LEVEL");
      await expect(page.locator("#interaction")).toBeVisible();
      await expect(page.locator("#interaction-label")).toContainText(
        "Return lift to Meridian surface",
      );

      const descendCount = await page.evaluate(
        () => window.__serviceCameraObserver.renderCount,
      );
      await page.waitForFunction(
        (prev) => window.__serviceCameraObserver.renderCount > prev + 1,
        descendCount,
      );
    });

    const serviceSample = await sampleActiveRender();
    expect(serviceSample.mask).toBe(2);
    expect(serviceSample.meanLuminance).toBeGreaterThan(0.01);

    await test.step("Return to surface and verify camera restores layer 0", async () => {
      await page.keyboard.press("KeyE");
      await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/, {
        timeout: 20_000,
      });
      await expect(page.locator("#height")).toHaveText("0.0 m UP");
      await expect(page.locator("#area")).toContainText("MERIDIAN CIVIC DISTRICT");
      await expect(page.locator("#interaction")).toBeVisible();
      await expect(page.locator("#interaction-label")).toContainText(
        "Descend to service level",
      );

      const returnCount = await page.evaluate(
        () => window.__serviceCameraObserver.renderCount,
      );
      await page.waitForFunction(
        (prev) => window.__serviceCameraObserver.renderCount > prev + 1,
        returnCount,
      );
    });

    const returnSample = await sampleActiveRender();
    expect(returnSample.mask).toBe(1);
    expect(returnSample.meanLuminance).toBeGreaterThan(0.01);

    const masksSeen = await page.evaluate(
      () => window.__serviceCameraObserver.masksSeen,
    );
    expect(masksSeen).toEqual([1, 2, 1]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("regional lighting ownership, locality, pause invariance, and four-line sign bounds hold in WebGL", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/checks/world.html");
    await page.waitForFunction(() => Boolean(window.__worldFixture));

    const result = await page.evaluate(() => {
      const f = window.__worldFixture;
      const {
        world,
        camera,
        layouts,
        sampleLuminanceAt,
        getLightInventory,
        inspectSignAt,
      } = f;
      const sampleGreenway = () =>
        sampleLuminanceAt(
          0,
          layouts.GREENWAY_PLACEMENT.toWorldY(-242),
          4,
          0,
          layouts.GREENWAY_PLACEMENT.toWorldY(-225),
          0,
        );
      const sampleMeridian = () =>
        sampleLuminanceAt(
          0,
          layouts.MERIDIAN_PLACEMENT.toWorldY(-17),
          4,
          0,
          layouts.MERIDIAN_PLACEMENT.toWorldY(0),
          0,
        );
      const lights = getLightInventory();
      const shadowCasters = lights.filter((l) => l.castShadow);
      const surfacePointLights = lights.filter(
        (l) => l.isPointLight && l.layer0 && !l.layer1,
      );
      const isolatedServiceLights = lights.filter(
        (l) => l.isPointLight && !l.layer0 && l.layer1,
      );

      const initialStatus = world.sunline.getDistrictStatus();
      const greenwayDay = sampleGreenway();
      const meridianDay = sampleMeridian();

      // Isolate SL-02 at Endcap A console
      const isolateRes = world.sunline.interact({
        theta: layouts.ENDCAP_HUBS[0].control.theta,
        y: layouts.ENDCAP_HUBS[0].control.y,
        height: layouts.AXIAL_HEIGHT,
        grounded: true,
        traversalMode: "secured",
      });
      const isolatedStatus = world.sunline.getDistrictStatus();

      // Partial transition then pause (dt = 0 does not advance transition)
      const pose = {
        theta: 0,
        y: layouts.GREENWAY_PLACEMENT.toWorldY(-230),
        height: 0,
        grounded: true,
        traversalMode: "walk",
      };
      world.update(0.35, 0.35, pose);
      const greenwayMid = sampleGreenway();
      world.update(0, 0.35, pose);
      const greenwayPaused = sampleGreenway();

      // Finish emergency lighting transition
      for (let i = 0; i < 6; i++) {
        world.update(0.25, 0.35 + (i + 1) * 0.25, pose);
      }
      const greenwayEmergency = sampleGreenway();
      const meridianEmergency = sampleMeridian();

      // Replace SL-02 on trolley and restore at Endcap B console
      world.sunline.interact({
        theta: layouts.SUNLINE_PANEL.theta,
        y: layouts.SUNLINE_PANEL.y,
        height: layouts.AXIAL_HEIGHT,
        grounded: true,
        traversalMode: "trolley",
      });
      world.sunline.interact({
        theta: layouts.ENDCAP_HUBS[1].control.theta,
        y: layouts.ENDCAP_HUBS[1].control.y,
        height: layouts.AXIAL_HEIGHT,
        grounded: true,
        traversalMode: "secured",
      });
      const restoredStatus = world.sunline.getDistrictStatus();

      for (let i = 0; i < 8; i++) {
        world.update(0.25, 2.0 + (i + 1) * 0.25, pose);
      }
      const greenwayRestored = sampleGreenway();

      const fourLineSign = inspectSignAt(
        8.5,
        layouts.MERIDIAN_PLACEMENT.toWorldY(-10),
        3.8,
        2.4,
      );

      return {
        cameraFar: camera.far,
        viewDistance: layouts.VIEW_DISTANCE,
        shadowCasterCount: shadowCasters.length,
        shadowCasterName: shadowCasters[0]?.name,
        surfacePointCount: surfacePointLights.length,
        servicePointCount: isolatedServiceLights.length,
        initialOnline: initialStatus.online,
        isolatedChanged: Boolean(isolateRes?.changed),
        isolatedOnline: isolatedStatus.online,
        restoredOnline: restoredStatus.online,
        greenwayDay,
        meridianDay,
        greenwayMid,
        greenwayPaused,
        greenwayEmergency,
        meridianEmergency,
        greenwayRestored,
        fourLineSign,
      };
    });

    // Camera far plane and world lighting ownership
    expect(result.viewDistance).toBeGreaterThan(
      Math.hypot(LENGTH, RADIUS * 2),
    );
    expect(result.cameraFar).toBeCloseTo(VIEW_DISTANCE, 5);
    expect(result.shadowCasterCount).toBe(1);
    expect(result.shadowCasterName).toBe("habitat_sunlight");
    expect(result.surfacePointCount).toBe(6);
    expect(result.servicePointCount).toBe(4);

    // State & emergency transition
    expect(result.initialOnline).toBe(true);
    expect(result.isolatedChanged).toBe(true);
    expect(result.isolatedOnline).toBe(false);
    expect(result.restoredOnline).toBe(true);

    // Locality, transition pause invariance, and restoration
    expect(result.greenwayDay).toBeGreaterThan(0.05);
    expect(result.greenwayMid).toBeLessThan(result.greenwayDay);
    expect(Math.abs(result.greenwayPaused - result.greenwayMid)).toBeLessThan(
      1e-4,
    );
    expect(result.greenwayEmergency).toBeLessThan(result.greenwayDay * 0.65);
    expect(
      Math.abs(result.meridianEmergency - result.meridianDay),
    ).toBeLessThan(result.meridianDay * 0.08);
    expect(result.greenwayRestored).toBeGreaterThan(
      result.greenwayEmergency * 1.4,
    );

    // Four-line civic sign canvas bounds (no glyph clipping over or past border)
    expect(result.fourLineSign.found).toBe(true);
    expect(result.fourLineSign.outerBleedPixels).toBe(0);
    expect(result.fourLineSign.innerMarginBleedPixels).toBe(0);
    expect(result.fourLineSign.glyphPixels).toBeGreaterThan(500);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("separated district geometry, colliders, job/service/lift targets, and live Nia/Mara anchors align in world space", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/checks/world.html");
    await page.waitForFunction(() => Boolean(window.__worldFixture));

    const result = await page.evaluate(() => {
      const f = window.__worldFixture;
      const {
        world,
        player,
        step,
        render,
        getCityLift,
        layouts,
        inspectTargetAlignment,
        inspectResidentAnchors,
        inspectSceneStructure,
        inspectCarriedCargo,
      } = f;

      const settle = (count = 5) => {
        let last;
        for (let i = 0; i < count; i++) last = step(1 / 60);
        return last;
      };

      const walkWithKey = (code, steps = 20) => {
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
        let last;
        for (let i = 0; i < steps; i++) last = step(1 / 60);
        window.dispatchEvent(new KeyboardEvent("keyup", { code }));
        return last;
      };

      const structure = inspectSceneStructure();

      // 1. Authored mesh + collider alignment across separated districts and subsystems
      const alignments = {
        deliveryPickup: inspectTargetAlignment({
          s: layouts.DELIVERY_STATIONS.pickup.s,
          y: layouts.DELIVERY_STATIONS.pickup.y,
          base: 0,
          height: 0.8,
          width: 1.8,
          depth: 1.0,
          rootName: "delivery_stations",
        }),
        deliveryDropoff: inspectTargetAlignment({
          s: layouts.DELIVERY_STATIONS.dropoff.s,
          y: layouts.DELIVERY_STATIONS.dropoff.y,
          base: 0,
          height: 0.85,
          width: 1.4,
          depth: 0.8,
          rootName: "delivery_stations",
        }),
        greenwayOverlook: inspectTargetAlignment({
          s: -58,
          y: layouts.DISTRICT_STOPS[2].y,
          base: 0,
          height: 2.16,
          width: 16,
          depth: 16,
          rootName: "greenway_district",
        }),
        farmUtilityShed: inspectTargetAlignment({
          s: 42,
          y: layouts.GREENWAY_PLACEMENT.toWorldY(-135),
          base: 0,
          height: 5.2,
          meshHeight: 3.8,
          width: 8.5,
          depth: 11.0,
          rootName: "greenway_district",
        }),
        skyroomFloor: inspectTargetAlignment({
          s: 48,
          y: layouts.MAIN_LIFT.y,
          base: layouts.TOWER.observationHeight - 0.4,
          height: 0.4,
          width: 24,
          depth: 24,
          rootName: "civic_tower_skyroom",
        }),
        ventilationUnit: inspectTargetAlignment({
          s: layouts.VENTILATION_UNIT.s,
          y: layouts.VENTILATION_UNIT.y,
          base: layouts.VENTILATION_UNIT.height,
          height: layouts.VENTILATION_UNIT.casingHeight,
          width: layouts.VENTILATION_UNIT.width,
          depth: layouts.VENTILATION_UNIT.depth,
          rootName: "maintenance_quest",
        }),
        servicePavilionNorthWall: inspectTargetAlignment({
          s: layouts.SERVICE_ACCESS.theta * layouts.RADIUS,
          y: layouts.SERVICE_ACCESS.y + 2.4,
          base: 0,
          height: 3.4,
          width: 5.2,
          depth: 0.4,
          rootName: "serviceSurfacePavilion",
        }),
        serviceCorridorWestWall: inspectTargetAlignment({
          s: -17.9,
          y: layouts.MERIDIAN_PLACEMENT.toWorldY(-18.5),
          base: layouts.SERVICE_FLOOR - 0.6,
          height: 8.0,
          width: 0.8,
          depth: 31.0,
          rootName: "serviceUnderground",
        }),
      };

      // 2. Greenway Delivery pickup/dropoff collision + interaction flow
      const oldPickupView = world.delivery.getView({
        theta: layouts.DELIVERY_STATIONS.pickup.s / layouts.RADIUS,
        y: -240,
        height: 0,
        grounded: true,
        traversalMode: "walk",
      });

      player.teleport({
        theta: layouts.DELIVERY_STATIONS.pickup.s / layouts.RADIUS,
        y: layouts.DELIVERY_STATIONS.pickup.y - 1.5,
        height: 0,
        yaw: 0,
      });
      let s = settle(2);
      const carriedBefore = inspectCarriedCargo();
      const pickupPrompt = world.delivery.getView(s).prompt;
      s = walkWithKey("KeyW", 20);
      const pickupBlockedY = s.y;
      const pickupRes = world.delivery.interact(s);
      const carryingView = world.delivery.getView(s);
      render();
      const carriedWhileCarrying = inspectCarriedCargo();

      player.teleport({
        theta: (layouts.DELIVERY_STATIONS.dropoff.s - 1.5) / layouts.RADIUS,
        y: layouts.DELIVERY_STATIONS.dropoff.y,
        height: 0,
        yaw: Math.PI / 2,
      });
      s = settle(2);
      const dropoffPrompt = world.delivery.getView(s).prompt;
      s = walkWithKey("KeyW", 20);
      const dropoffBlockedS = s.theta * layouts.RADIUS;
      const dropoffRes = world.delivery.interact(s);
      const completeDeliveryView = world.delivery.getView(s);
      const carriedAfter = inspectCarriedCargo();
      // 3. Greenway Overlook elevated floor support at relocated world Y
      player.teleport({
        theta: -58 / layouts.RADIUS,
        y: layouts.DISTRICT_STOPS[2].y,
        height: 2.2,
      });
      s = settle(6);
      const overlookState = { height: s.height, grounded: s.grounded };

      // 4. Relocated Mara Voss + Maintenance Ventilation Unit flow + altitude guard + collision
      const oldMaraPrompt = world.maintenance.getView({
        theta: layouts.CARETAKER.s / layouts.RADIUS,
        y: -5,
        height: 0,
        grounded: true,
        traversalMode: "walk",
      }).prompt;

      player.teleport({
        theta: layouts.CARETAKER.s / layouts.RADIUS,
        y: layouts.CARETAKER.y - 1.5,
        height: 0,
      });
      s = settle(2);
      const maraPrompt = world.maintenance.getView(s).prompt;
      const maraAssignRes = world.maintenance.interact(s);
      const assignedPhase = world.maintenance.getPhase();

      const belowUnitInteract = world.maintenance.interact({
        theta: layouts.VENTILATION_UNIT.s / layouts.RADIUS,
        y: layouts.VENTILATION_UNIT.y - 1.5,
        height: 0,
        grounded: true,
        traversalMode: "walk",
      });

      player.teleport({
        theta: layouts.VENTILATION_UNIT.s / layouts.RADIUS,
        y: layouts.VENTILATION_UNIT.y - 2.0,
        height: layouts.SKYWALK_HEIGHT,
        yaw: 0,
      });
      s = settle(4);
      const skywalkSupport = { height: s.height, grounded: s.grounded };
      s = walkWithKey("KeyW", 20);
      const unitBlockedY = s.y;
      const repairRes = world.maintenance.interact(s);
      const repairedPhase = world.maintenance.getPhase();

      player.teleport({
        theta: layouts.CARETAKER.s / layouts.RADIUS,
        y: layouts.CARETAKER.y - 1.5,
        height: 0,
      });
      s = settle(2);
      const maraCompleteRes = world.maintenance.interact(s);
      const completePhase = world.maintenance.getPhase();

      // 5. Meridian Service Level descent, wall collision, and service room floor support
      player.teleport({
        theta: layouts.SERVICE_ACCESS.theta,
        y: layouts.SERVICE_ACCESS.y,
        height: 0,
      });
      s = settle(2);
      const serviceLift = getCityLift(s);
      player.teleport(serviceLift.destination);
      s = settle(4);
      player.teleport({
        theta: -14 / layouts.RADIUS,
        y: layouts.MERIDIAN_PLACEMENT.toWorldY(-18.5),
        height: layouts.SERVICE_FLOOR,
        yaw: -Math.PI / 2,
      });
      s = settle(2);
      s = walkWithKey("KeyW", 20);
      const serviceWallBlockedS = s.theta * layouts.RADIUS;

      const serviceRoomStates = layouts.SERVICE_STOPS.map((stop) => {
        player.teleport({
          theta: stop.theta,
          y: stop.y,
          height: layouts.SERVICE_FLOOR,
        });
        const settled = settle(4);
        return {
          id: stop.id,
          height: settled.height,
          grounded: settled.grounded,
        };
      });

      // 6. Relocated Nia Sen & Mara Voss live world anchors + resident placement tracking
      const residentsBefore = inspectResidentAnchors();
      const niaBefore = residentsBefore.find((r) => r.id === "resident-square");
      const maraAnchor = residentsBefore.find((r) => r.id === "caretaker-mara");

      for (let i = 0; i < 8; i++) step(0.25);
      const residentsAfter = inspectResidentAnchors();
      const niaAfter = residentsAfter.find((r) => r.id === "resident-square");

      const oldNiaReaction = world.residents.getReaction(
        {
          theta: 0,
          y: -230,
          height: 0,
          grounded: true,
          traversalMode: "walk",
        },
        "available",
      );

      player.teleport({
        theta: niaAfter.sampleS / layouts.RADIUS,
        y: niaAfter.sampleY - 1.5,
        height: 0,
      });
      s = settle(2);
      const niaAtReaction = inspectResidentAnchors().find(
        (r) => r.id === "resident-square",
      );
      const liveNiaReaction = world.residents.getReaction(s, "available");
      render();

      return {
        structure,
        alignments,
        delivery: {
          oldPickupPrompt: oldPickupView.prompt,
          pickupPrompt,
          pickupBlockedY,
          pickupTargetY: layouts.DELIVERY_STATIONS.pickup.y,
          pickupPhase: pickupRes?.phase ?? null,
          carryingPhase: carryingView.phase,
          carryingInventory: carryingView.inventory,
          carriedBefore,
          carriedWhileCarrying,
          carriedAfter,
          dropoffPrompt,
          dropoffBlockedS,
          dropoffTargetS: layouts.DELIVERY_STATIONS.dropoff.s,
          dropoffPhase: dropoffRes?.phase ?? null,
          completePhase: completeDeliveryView.phase,
        },
        overlookState,
        maintenance: {
          oldMaraPrompt,
          maraPrompt,
          assignedChanged: Boolean(maraAssignRes?.changed),
          assignedPhase,
          belowUnitInteract,
          skywalkSupport,
          unitBlockedY,
          unitSouthFaceY:
            layouts.VENTILATION_UNIT.y - layouts.VENTILATION_UNIT.depth / 2,
          repairedChanged: Boolean(repairRes?.changed),
          repairedPhase,
          completeChanged: Boolean(maraCompleteRes?.changed),
          completePhase,
        },
        service: {
          serviceWallBlockedS,
          serviceRoomStates,
        },
        residents: {
          residentsAfter,
          niaBefore,
          niaAfter,
          niaAtReaction,
          maraAnchor,
          oldNiaReaction,
          liveNiaPrompt: liveNiaReaction?.prompt ?? null,
          liveNiaTargetY: liveNiaReaction?.target?.y ?? null,
          liveNiaTargetS: liveNiaReaction?.target?.s ?? null,
        },
      };
    });

    // Scene group separation & global underside deck
    expect(result.structure.inhabitedDistrictsY).toBe(0);
    expect(result.structure.greenwayDistrictY).toBe(-220);
    expect(result.structure.meridianDistrictY).toBe(455);
    expect(result.structure.residentsY).toBe(0);
    expect(result.structure.globalDeck).toEqual({
      y: 0,
      depth: LENGTH,
      base: -0.6,
      height: 0.6,
    });

    // Geometry + collider alignment at all inspected targets
    for (const [name, entry] of Object.entries(result.alignments)) {
      expect(entry.meshFound, `${name} mesh`).toBe(true);
      expect(entry.colliderFound, `${name} collider`).toBe(true);
      expect(entry.meshDistToExpected, `${name} mesh distance`).toBeLessThan(0.6);
      expect(entry.collider.dist, `${name} collider distance`).toBeLessThan(0.1);
      expect(
        Math.abs(entry.meshBox.centerY - entry.collider.y),
        `${name} world Y alignment`,
      ).toBeLessThan(0.2);
    }

    // Delivery alignment, blocking, and full flow
    expect(result.delivery.oldPickupPrompt).toBeNull();
    expect(result.delivery.pickupPrompt).toBe("Pick up seed crate");
    expect(result.delivery.pickupBlockedY).toBeLessThan(
      result.delivery.pickupTargetY - 0.4,
    );
    expect(result.delivery.pickupPhase).toBe("carrying");
    expect(result.delivery.carryingPhase).toBe("carrying");
    expect(result.delivery.carryingInventory).toBe("Heritage seed crate");
    expect(result.delivery.carriedBefore).toMatchObject({
      found: true,
      visible: false,
    });
    expect(result.delivery.carriedWhileCarrying).toMatchObject({
      found: true,
      visible: true,
    });
    expect(result.delivery.carriedAfter).toMatchObject({
      found: true,
      visible: false,
    });
    expect(result.delivery.dropoffPrompt).toBe("Deliver seed crate");
    expect(result.delivery.dropoffBlockedS).toBeLessThan(
      result.delivery.dropoffTargetS - 0.4,
    );
    expect(result.delivery.dropoffPhase).toBe("complete");
    expect(result.delivery.completePhase).toBe("complete");
    // Overlook deck support
    expect(result.overlookState.grounded).toBe(true);
    expect(Math.abs(result.overlookState.height - 2.16)).toBeLessThan(0.05);

    // Maintenance flow, altitude guard, and unit collision
    expect(result.maintenance.oldMaraPrompt).toBeNull();
    expect(result.maintenance.maraPrompt).toBe("Speak with Mara Voss");
    expect(result.maintenance.assignedChanged).toBe(true);
    expect(result.maintenance.assignedPhase).toBe("assigned");
    expect(result.maintenance.belowUnitInteract).toBeNull();
    expect(result.maintenance.skywalkSupport.grounded).toBe(true);
    expect(
      Math.abs(result.maintenance.skywalkSupport.height - 9),
    ).toBeLessThan(0.05);
    expect(result.maintenance.unitBlockedY).toBeLessThan(
      result.maintenance.unitSouthFaceY,
    );
    expect(result.maintenance.repairedChanged).toBe(true);
    expect(result.maintenance.repairedPhase).toBe("repaired");
    expect(result.maintenance.completeChanged).toBe(true);
    expect(result.maintenance.completePhase).toBe("complete");

    // Service level wall collision & room floor support
    expect(result.service.serviceWallBlockedS).toBeGreaterThan(-17.5);
    for (const room of result.service.serviceRoomStates) {
      expect(room.grounded, `${room.id} grounded`).toBe(true);
      expect(room.height, `${room.id} height`).toBe(-8);
    }

    // Relocated Nia Sen & Mara Voss live world anchors and all resident world tracking
    expect(result.residents.maraAnchor.sampleS).toBe(-8);
    expect(result.residents.maraAnchor.sampleY).toBe(450);
    expect(result.residents.maraAnchor.worldDist).toBeLessThan(0.1);

    expect(result.residents.niaBefore.worldDist).toBeLessThan(0.1);
    expect(result.residents.niaAfter.worldDist).toBeLessThan(0.1);
    expect(result.residents.niaAtReaction.worldDist).toBeLessThan(0.1);
    expect(
      result.residents.niaBefore.sampleS !== result.residents.niaAfter.sampleS ||
        result.residents.niaBefore.sampleY !== result.residents.niaAfter.sampleY,
    ).toBe(true);
    expect(result.residents.niaAfter.sampleY).toBeGreaterThanOrEqual(
      DISTRICT_STOPS[0].y - 10,
    );
    expect(result.residents.niaAfter.sampleY).toBeLessThanOrEqual(
      DISTRICT_STOPS[0].y + 7,
    );
    expect(result.residents.oldNiaReaction).toBeNull();
    expect(result.residents.liveNiaPrompt).toBe("Speak with Nia Sen");
    expect(result.residents.liveNiaTargetS).toBeCloseTo(
      result.residents.niaAtReaction.sampleS,
      5,
    );
    expect(result.residents.liveNiaTargetY).toBeCloseTo(
      result.residents.niaAtReaction.sampleY,
      5,
    );
    for (const res of result.residents.residentsAfter) {
      expect(res.worldDist, `${res.id} world tracking`).toBeLessThan(0.1);
      const inGreenway =
        res.sampleY >= DISTRICT_BOUNDS.minY &&
        res.sampleY <= DISTRICT_BOUNDS.maxY;
      const inMeridian =
        res.sampleY >= CITY_BOUNDS.minY && res.sampleY <= CITY_BOUNDS.maxY;
      expect(
        inGreenway || inMeridian,
        `${res.id} sampleY=${res.sampleY} within a district`,
      ).toBe(true);
    }

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("expanded Greenway and Meridian routes and telemetry work through native app controls without seeded progress", async ({
  browser,
}) => {
  // Combined native Greenway (70 m + pickup) and Meridian (61 m) walks under software GPU.
  test.setTimeout(180_000);
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("#start-greenway")).toBeEnabled();

    await test.step("Spawn in Greenway approach, verify 1g surface telemetry, and collect seed crate", async () => {
      await page.locator("#start-greenway").click();
      await expect(page.locator("#pause")).toBeVisible();
      await expect(page.locator("#gravity")).toHaveText("1.000 G");
      await expect(page.locator("#area")).toHaveText("OUTER PROMENADE");

      const spawnLongM = Math.round(SPAWN.y + LENGTH / 2);
      await expect(page.locator("#position")).toContainText(`${spawnLongM} m`);

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
            area === "GREENWAY COMMONS" &&
            match &&
            Number(match[1]) >= entryM
          );
        },
        greenwayEntryM,
        { timeout: 60_000 },
      );
      await expect(page.locator("#area")).toHaveText("GREENWAY COMMONS");

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
        { timeout: 60_000 },
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
        { timeout: 60_000 },
      );
      await page.keyboard.up("KeyD");

      await page.keyboard.press("KeyE");
      await expect(page.locator("#inventory")).toBeVisible();
      await expect(page.locator("#inventory-label")).toHaveText(
        "Heritage seed crate",
      );
      await expect(page.locator("#job")).toHaveAttribute(
        "data-phase",
        "carrying",
      );
    });

    await test.step("Travel to Meridian via pause menu and sprint into Meridian plaza", async () => {
      await page.keyboard.press("Escape");
      await expect(page.locator("#pause-panel")).toBeVisible();
      await page.locator("#visit-city").click();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#gravity")).toHaveText("1.000 G");
      await expect(page.locator("#area")).toHaveText("MERIDIAN CIVIC DISTRICT");

      const cityLongM = Math.round(CITY_ARRIVAL.y + LENGTH / 2);
      await expect(page.locator("#position")).toContainText(`${cityLongM} m`);

      await page.keyboard.down("ShiftLeft");
      await page.keyboard.down("KeyW");
      const plazaRow = page.locator("#landmarks li", {
        hasText: CITY_STOPS[0].name,
      });
      await expect(plazaRow).toHaveClass(/found/, { timeout: 90_000 });
      await page.keyboard.up("KeyW");
      await page.keyboard.up("ShiftLeft");
    });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
