import { test, expect } from "@playwright/test";
import {
  RADIUS,
  LENGTH,
  EYE_HEIGHT,
  GRAVITY,
  SPAWN,
  gravityAtHeight,
} from "../src/habitat.js";
import { DELIVERY_STATIONS } from "../src/delivery-layout.js";
import {
  TRAM_THETA,
  TRAM_HEIGHT,
  TRAM_SPEED,
  TRAM_END_DWELL,
  TRAM_DWELL,
  TRAM_BOARD_WINDOW,
  TRAM_STOPS,
  TRAM_CAR_WIDTH,
  TRAM_CAR_LENGTH,
  TRAM_CAR_HEIGHT,
  TRAM_PLATFORM_ARC,
} from "../src/tram-layout.js";

const waitFrames = (page, count = 2) =>
  page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let left = n;
        function tick() {
          if (--left <= 0) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    count,
  );

test("fixture step ordering, 3D carriage/passenger/provider sync, read-API invariants, and free look", async ({
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
        camera,
        step,
        inspectTram,
        gravityAtHeight: gravityFn,
        layouts,
      } = f;

      // 1. Initial t=0 state and read-API non-mutating/zero-allocation checks
      const initial = inspectTram();
      const poseOutA = {};
      const poseOutB = {};
      const retPoseA = world.tram.getPose(poseOutA);
      const retPoseB = world.tram.getPose(poseOutB);
      const stateOutA = {};
      const stateOutB = {};
      const retStateA = world.tram.getState(stateOutA);
      const retStateB = world.tram.getState(stateOutB);

      // 2. updateWorld: false must NOT advance tram or elapsed
      const beforePausedStep = world.tram.getState({});
      const pausedStep = step(0.05, { updateWorld: false });
      const afterPausedStep = world.tram.getState({});
      const pausedVisual = inspectTram();

      // 3. Attach player at Gateway stop while dwelling
      const gw = layouts.TRAM_STOPS[0];
      player.teleport({
        theta: gw.theta,
        y: gw.y,
        height: gw.height,
        yaw: gw.yaw,
      });
      step(0.05);
      const preAttach = {};
      player.getState(preAttach);
      const groundBoardInteraction = world.tram.getInteraction(preAttach);

      player.attachRide(world.tram);
      const attachedImmediate = {};
      player.getState(attachedImmediate);
      const attachedInspect = inspectTram();

      // Advance through initial 20s dwell right up to departure boundary
      const dt = 0.05;
      const preDepartSteps = Math.round((layouts.TRAM_END_DWELL - 0.1) / dt);
      for (let i = 0; i < preDepartSteps; i++) {
        step(dt);
      }
      const dirBeforeLook = camera.getWorldDirection(camera.position.clone());

      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));

      let maxFootGap = 0;
      let maxEyeGap = 0;
      let maxPosePlayerLagY = 0;
      const movingStepDeltas = [];
      let prevMovingY = null;
      let enRouteSample = null;
      let enRouteInteraction = "unset";

      for (let i = 0; i < 30; i++) {
        const s = step(dt);
        const snap = inspectTram();
        maxFootGap = Math.max(maxFootGap, snap.footAgreementDist);
        maxEyeGap = Math.max(maxEyeGap, snap.cameraEyeDist);
        maxPosePlayerLagY = Math.max(
          maxPosePlayerLagY,
          Math.abs(s.y - snap.pose.y),
        );
        if (snap.state.phase === "moving") {
          if (prevMovingY !== null) {
            movingStepDeltas.push(snap.pose.y - prevMovingY);
          }
          prevMovingY = snap.pose.y;
          if (!enRouteSample) {
            enRouteSample = { player: s, tram: snap };
            enRouteInteraction = world.tram.getInteraction(s);
          }
        }
      }

      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowUp" }));

      const dirAfterLook = camera.getWorldDirection(camera.position.clone());

      // 4. Simulate transfer-fade frames where main calls player.update(0) after tram.update(dt)
      world.tram.update(dt);
      player.update(0);
      const fadeSample = {};
      player.getState(fadeSample);
      const fadeInspect = inspectTram();

      // 5. step(0) leaves clock and pose unchanged
      const beforeZeroStep = inspectTram();
      step(0);
      const afterZeroStep = inspectTram();

      // 6. reset() detaches ride cleanly
      player.reset();
      const afterReset = {};
      player.getState(afterReset);

      return {
        initial,
        samePoseRefA: retPoseA === poseOutA,
        samePoseRefB: retPoseB === poseOutB,
        poseStableOnRepeat:
          poseOutA.y === poseOutB.y && poseOutA.speed === poseOutB.speed,
        sameStateRefA: retStateA === stateOutA,
        sameStateRefB: retStateB === stateOutB,
        stateStableOnRepeat:
          stateOutA.departureIn === stateOutB.departureIn &&
          stateOutA.arrivalIn === stateOutB.arrivalIn,
        pausedElapsedUnchanged: pausedStep.elapsed === 0,
        pausedTramUnchanged:
          beforePausedStep.departureIn === afterPausedStep.departureIn &&
          beforePausedStep.y === afterPausedStep.y,
        pausedVisualUnchanged:
          pausedVisual.carriageWorldPos.y === initial.carriageWorldPos.y,
        groundBoardInteraction,
        attachedImmediate,
        attachedInspect,
        expectedGravity13: gravityFn(layouts.TRAM_HEIGHT),
        maxFootGap,
        maxEyeGap,
        maxPosePlayerLagY,
        movingStepDeltas,
        enRouteSample,
        enRouteInteraction,
        lookDot:
          dirBeforeLook.x * dirAfterLook.x +
          dirBeforeLook.y * dirAfterLook.y +
          dirBeforeLook.z * dirAfterLook.z,
        fadePlayerY: fadeSample.y,
        fadePoseY: fadeInspect.pose.y,
        fadeFootGap: fadeInspect.footAgreementDist,
        fadeEyeGap: fadeInspect.cameraEyeDist,
        zeroStepYDelta: afterZeroStep.pose.y - beforeZeroStep.pose.y,
        zeroStepDepartDelta:
          afterZeroStep.state.departureIn - beforeZeroStep.state.departureIn,
        afterReset,
      };
    });

    expect(result.initial.rootFound).toBe(true);
    expect(result.initial.rootVisible).toBe(true);
    expect(result.initial.carriageFound).toBe(true);
    expect(result.initial.carriageVisible).toBe(true);
    expect(result.initial.carriageAtmosphereDynamic).toBe(true);
    expect(result.initial.carriageMeshCount).toBeGreaterThan(5);
    expect(result.initial.carriageBox.size.x).toBeGreaterThanOrEqual(
      TRAM_CAR_WIDTH - 0.3,
    );
    expect(result.initial.carriageBox.size.x).toBeLessThanOrEqual(
      TRAM_CAR_WIDTH + 0.8,
    );
    expect(result.initial.carriageBox.size.y).toBeGreaterThanOrEqual(
      TRAM_CAR_LENGTH - 0.4,
    );
    expect(result.initial.carriageBox.size.y).toBeLessThanOrEqual(
      TRAM_CAR_LENGTH + 1.0,
    );
    expect(result.initial.carriageBox.size.z).toBeGreaterThanOrEqual(
      TRAM_CAR_HEIGHT - 0.3,
    );
    expect(result.initial.carriageBox.size.z).toBeLessThanOrEqual(
      TRAM_CAR_HEIGHT + 1.5,
    );
    expect(result.initial.footAgreementDist).toBeLessThan(1e-4);

    // Every rendered instance must fit its real culling volumes; ties need not
    // share the support-column endpoints.
    for (const inst of result.initial.instancedMeshes) {
      expect(inst.hasBoundingBox).toBe(true);
      expect(inst.hasBoundingSphere).toBe(true);
      expect(inst.testedVertexCount).toBeGreaterThan(0);
      expect(Number.isFinite(inst.boundsEscape)).toBe(true);
      expect(Number.isFinite(inst.sphereEscape)).toBe(true);
      expect(inst.boundsEscape).toBeLessThanOrEqual(1e-4);
      expect(inst.sphereEscape).toBeLessThanOrEqual(1e-4);
    }

    // Exact initial timetable contract
    expect(result.initial.state.phase).toBe("dwell");
    expect(result.initial.state.stationId).toBe(TRAM_STOPS[0].id);
    expect(result.initial.state.nextStationId).toBe(TRAM_STOPS[1].id);
    expect(result.initial.state.direction).toBe(1);
    expect(result.initial.state.departureIn).toBeCloseTo(TRAM_END_DWELL, 6);
    expect(result.initial.state.arrivalIn).toBeCloseTo(
      TRAM_END_DWELL + (TRAM_STOPS[1].y - TRAM_STOPS[0].y) / TRAM_SPEED,
      5,
    );
    expect(result.initial.pose.theta).toBe(TRAM_THETA);
    expect(result.initial.pose.y).toBe(TRAM_STOPS[0].y);
    expect(result.initial.pose.height).toBe(TRAM_HEIGHT);
    expect(result.initial.pose.speed).toBe(0);

    // Read-API non-mutating & allocation-free with caller out
    expect(result.samePoseRefA).toBe(true);
    expect(result.samePoseRefB).toBe(true);
    expect(result.poseStableOnRepeat).toBe(true);
    expect(result.sameStateRefA).toBe(true);
    expect(result.sameStateRefB).toBe(true);
    expect(result.stateStableOnRepeat).toBe(true);

    // updateWorld: false freeze
    expect(result.pausedElapsedUnchanged).toBe(true);
    expect(result.pausedTramUnchanged).toBe(true);
    expect(result.pausedVisualUnchanged).toBe(true);

    // Attachment & 0-lag synchronization
    expect(result.groundBoardInteraction?.kind).toBe("board");
    expect(result.groundBoardInteraction?.stationId).toBe(TRAM_STOPS[0].id);
    expect(result.attachedImmediate.traversalMode).toBe("tram");
    expect(result.attachedImmediate.railDirection).toBe(0);
    expect(result.attachedImmediate.grounded).toBe(true);
    expect(result.attachedImmediate.height).toBe(TRAM_HEIGHT);
    expect(result.attachedImmediate.gravity).toBeCloseTo(
      result.expectedGravity13,
      6,
    );
    expect(result.attachedImmediate.speed).toBe(0);
    expect(result.attachedInspect.footAgreementDist).toBeLessThan(1e-4);
    expect(result.attachedInspect.cameraEyeDist).toBeLessThan(1e-4);

    // Single advance (28 m/s * 0.05s = 1.4m/step), zero player/body/camera lag
    expect(result.maxFootGap).toBeLessThan(1e-4);
    expect(result.maxEyeGap).toBeLessThan(1e-4);
    expect(result.maxPosePlayerLagY).toBeLessThan(1e-6);
    expect(result.movingStepDeltas.length).toBeGreaterThan(10);
    for (const dy of result.movingStepDeltas) {
      expect(dy).toBeCloseTo(TRAM_SPEED * 0.05, 5);
    }

    // En-route telemetry & no WASD/jump & free-look works
    expect(result.enRouteSample.player.traversalMode).toBe("tram");
    expect(result.enRouteSample.player.theta).toBe(TRAM_THETA);
    expect(result.enRouteSample.player.height).toBe(TRAM_HEIGHT);
    expect(result.enRouteSample.player.speed).toBeCloseTo(TRAM_SPEED, 5);
    expect(result.enRouteSample.player.grounded).toBe(true);
    expect(result.enRouteSample.player.gravity).toBeCloseTo(
      result.expectedGravity13,
      6,
    );
    expect(result.enRouteInteraction).toBeNull();
    expect(result.lookDot).toBeLessThan(0.95);

    // update(0) fade frame sync, step(0) no-op, reset() detach
    expect(result.fadePlayerY).toBeCloseTo(result.fadePoseY, 6);
    expect(result.fadeFootGap).toBeLessThan(1e-4);
    expect(result.fadeEyeGap).toBeLessThan(1e-4);
    expect(result.zeroStepYDelta).toBe(0);
    expect(result.zeroStepDepartDelta).toBe(0);
    expect(result.afterReset.traversalMode).toBe("walk");
    expect(result.afterReset.height).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("fixture proves full both-way route, endpoint reversals without teleport, transfer commit guards, and safe ground exits", async ({
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
      const { world, player, step, layouts } = f;
      const dt = 0.05;
      const stops = layouts.TRAM_STOPS;

      // Expected roundtrip sequence: 0 -> 1 -> 2 -> 3 -> 4 -> 3 -> 2 -> 1 -> 0
      const observedStops = [];
      let prevStation = null;
      let maxStepMoveY = 0;
      let prevY = world.tram.getPose({}).y;
      let midRouteExitCommit = null;
      let midRouteInteraction = "unset";
      let lowDwellBoardInteraction = "unset";
      let lowDwellBoardCommit = null;
      let dockedExitCommit = null;
      let dockedExitInteraction = null;
      let towerReversalChecked = false;
      let towerReversalJump = null;

      // Attach player to ride the entire roundtrip
      player.teleport({
        theta: stops[0].theta,
        y: stops[0].y,
        height: 0,
      });
      step(dt);
      const groundPose = {};
      player.getState(groundPose);
      player.attachRide(world.tram);

      // Total period = 20 + 1015/28*2 + 3*8*2 + 20 = 160.5s (~3210 steps); step 170s max
      const maxSteps = Math.ceil(170 / dt);
      for (let i = 0; i < maxSteps; i++) {
        const ps = step(dt);
        const ts = world.tram.getState({});
        const stepDelta = Math.abs(ts.y - prevY);
        if (stepDelta > maxStepMoveY) maxStepMoveY = stepDelta;
        prevY = ts.y;

        if (ts.phase === "dwell" && ts.stationId !== prevStation) {
          observedStops.push({
            stationId: ts.stationId,
            y: ts.y,
            direction: ts.direction,
            nextStationId: ts.nextStationId,
            departureIn: ts.departureIn,
          });
          prevStation = ts.stationId;
        }

        // Check mid-route exit rejection while moving northbound between glasshouse and plaza
        if (
          ts.phase === "moving" &&
          ts.direction === 1 &&
          ts.y > 0 &&
          ts.y < 100 &&
          midRouteExitCommit === null
        ) {
          midRouteInteraction = world.tram.getInteraction(ps);
          midRouteExitCommit = world.tram.canCommitTransfer(
            "exit",
            stops[3].id,
            ps,
          );
        }

        // Check board window (<0.5s remaining at Market): getInteraction null, canCommitTransfer true if >0
        if (
          ts.phase === "dwell" &&
          ts.stationId === stops[1].id &&
          ts.departureIn > 0.05 &&
          ts.departureIn < layouts.TRAM_BOARD_WINDOW - 0.05 &&
          lowDwellBoardCommit === null
        ) {
          const nearGround = {
            theta: stops[1].theta,
            y: stops[1].y,
            height: 0,
            grounded: true,
            traversalMode: "walk",
          };
          lowDwellBoardInteraction = world.tram.getInteraction(nearGround);
          lowDwellBoardCommit = world.tram.canCommitTransfer(
            "board",
            stops[1].id,
            nearGround,
          );
        }

        // Check reversal at Civic Tower (last stop)
        if (
          ts.phase === "dwell" &&
          ts.stationId === stops[4].id &&
          !towerReversalChecked
        ) {
          towerReversalChecked = true;
          towerReversalJump = Math.abs(ts.y - stops[4].y);
          dockedExitInteraction = world.tram.getInteraction(ps);
          dockedExitCommit = world.tram.canCommitTransfer(
            "exit",
            stops[4].id,
            ps,
          );
        }

        // Stop once we complete return dock at Gateway
        if (observedStops.length >= 9) break;
      }

      // Check airborne / wrong-mode / out-of-range board rejections at Gateway
      const gwGround = {
        theta: stops[0].theta,
        y: stops[0].y,
        height: 0,
        grounded: true,
        traversalMode: "walk",
      };
      const boardAirborne = world.tram.canCommitTransfer(
        "board",
        stops[0].id,
        { ...gwGround, grounded: false },
      );
      const boardFar = world.tram.canCommitTransfer("board", stops[0].id, {
        ...gwGround,
        y: stops[0].y + 10,
      });
      const boardWrongStation = world.tram.canCommitTransfer(
        "board",
        stops[1].id,
        gwGround,
      );

      // Test actual safe ground exit & 4-way ground walking at both endpoints (Tower & Gateway)
      const safeExitResults = [];
      for (const stop of [stops[4], stops[0]]) {
        player.teleport({
          theta: stop.theta,
          y: stop.y,
          height: stop.height,
          yaw: stop.yaw,
        });
        let settled;
        for (let k = 0; k < 4; k++) settled = step(dt);
        const startS =
          Math.atan2(
            Math.sin(settled.theta - stop.theta),
            Math.cos(settled.theta - stop.theta),
          ) * layouts.RADIUS;
        const startY = settled.y;

        const walkCheck = (code) => {
          player.teleport({
            theta: stop.theta,
            y: stop.y,
            height: stop.height,
            yaw: 0,
          });
          step(dt);
          window.dispatchEvent(new KeyboardEvent("keydown", { code }));
          let endState;
          for (let k = 0; k < 8; k++) endState = step(dt);
          window.dispatchEvent(new KeyboardEvent("keyup", { code }));
          return {
            ds:
              Math.atan2(
                Math.sin(endState.theta - stop.theta),
                Math.cos(endState.theta - stop.theta),
              ) * layouts.RADIUS,
            dy: endState.y - stop.y,
            height: endState.height,
            grounded: endState.grounded,
          };
        };

        safeExitResults.push({
          id: stop.id,
          settledMode: settled.traversalMode,
          settledHeight: settled.height,
          settledGrounded: settled.grounded,
          pushbackDist: Math.hypot(startS, startY - stop.y),
          walkNorthDy: walkCheck("KeyW").dy,
          walkSouthDy: walkCheck("KeyS").dy,
          walkEastDs: walkCheck("KeyD").ds,
          walkWestDs: walkCheck("KeyA").ds,
        });
      }

      return {
        observedStops,
        maxStepMoveY,
        midRouteInteraction,
        midRouteExitCommit,
        lowDwellBoardInteraction,
        lowDwellBoardCommit,
        dockedExitInteraction,
        dockedExitCommit,
        towerReversalChecked,
        towerReversalJump,
        boardAirborne,
        boardFar,
        boardWrongStation,
        safeExitResults,
      };
    });

    // All 9 stop events across full northbound + southbound shuttle cycle
    expect(summary.observedStops.map((s) => s.stationId)).toEqual([
      TRAM_STOPS[0].id,
      TRAM_STOPS[1].id,
      TRAM_STOPS[2].id,
      TRAM_STOPS[3].id,
      TRAM_STOPS[4].id,
      TRAM_STOPS[3].id,
      TRAM_STOPS[2].id,
      TRAM_STOPS[1].id,
      TRAM_STOPS[0].id,
    ]);
    // Endpoints advertise already-reversed next direction & next stop
    expect(summary.observedStops[4].direction).toBe(-1);
    expect(summary.observedStops[4].nextStationId).toBe(TRAM_STOPS[3].id);
    expect(summary.observedStops[8].direction).toBe(1);
    expect(summary.observedStops[8].nextStationId).toBe(TRAM_STOPS[1].id);

    // Continuous motion without any teleport jump
    expect(summary.maxStepMoveY).toBeLessThanOrEqual(TRAM_SPEED * 0.05 + 1e-4);
    expect(summary.towerReversalChecked).toBe(true);
    expect(summary.towerReversalJump).toBeLessThan(1e-4);

    // Mid-route exit rejected; <0.5s board window rejected by getInteraction but allowed at commit (>0)
    expect(summary.midRouteInteraction).toBeNull();
    expect(summary.midRouteExitCommit).toBe(false);
    expect(summary.lowDwellBoardInteraction?.kind).not.toBe("board");
    expect(summary.lowDwellBoardCommit).toBe(true);
    expect(summary.dockedExitInteraction?.kind).toBe("exit");
    expect(summary.dockedExitCommit).toBe(true);
    expect(summary.boardAirborne).toBe(false);
    expect(summary.boardFar).toBe(false);
    expect(summary.boardWrongStation).toBe(false);

    // Each exit has the authored 1m clear radius; eastward walking then meets
    // the station mast rather than passing through it.
    for (const exitRes of summary.safeExitResults) {
      expect(exitRes.settledMode).toBe("walk");
      expect(exitRes.settledHeight).toBe(0);
      expect(exitRes.settledGrounded).toBe(true);
      expect(exitRes.pushbackDist).toBeLessThan(0.05);
      expect(exitRes.walkNorthDy).toBeGreaterThan(2.0);
      expect(exitRes.walkSouthDy).toBeLessThan(-2.0);
      expect(exitRes.walkEastDs).toBeGreaterThan(1.0);
      expect(exitRes.walkWestDs).toBeLessThan(-2.0);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("fixture proves raised undersides, car corridor, 1m station clear zones, bakery awning gap, and stop metadata", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/checks/world.html");
    await page.waitForFunction(() => Boolean(window.__worldFixture));

    const clearance = await page.evaluate(() => {
      const f = window.__worldFixture;
      const { player, step, inspectTramClearance, layouts } = f;
      const dt = 0.05;

      const staticReport = inspectTramClearance();

      // Physical walk checks underneath elevated rail, underneath platforms, and across ground pads
      const physicalWalks = layouts.TRAM_STOPS.map((stop) => {
        // 1. Walk under elevated rail at s = 0
        player.teleport({ theta: 0, y: stop.y - 2.0, height: 0, yaw: 0 });
        step(dt);
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
        let underRail;
        for (let i = 0; i < 12; i++) underRail = step(dt);
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));

        // 2. Walk under elevated platform at s = TRAM_PLATFORM_ARC (3.8m)
        player.teleport({
          theta: layouts.TRAM_PLATFORM_ARC / layouts.RADIUS,
          y: stop.y - 2.0,
          height: 0,
          yaw: 0,
        });
        step(dt);
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
        let underPlatform;
        for (let i = 0; i < 12; i++) underPlatform = step(dt);
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));

        // 3. Stand at ground boarding/exit point and confirm zero pushback & grounded
        player.teleport({
          theta: stop.theta,
          y: stop.y,
          height: 0,
          yaw: 0,
        });
        let settled;
        for (let i = 0; i < 4; i++) settled = step(dt);
        const padS =
          Math.atan2(
            Math.sin(settled.theta - stop.theta),
            Math.cos(settled.theta - stop.theta),
          ) * layouts.RADIUS;

        return {
          id: stop.id,
          underRailEndY: underRail.y - (stop.y - 2.0),
          underRailHeight: underRail.height,
          underPlatformEndY: underPlatform.y - (stop.y - 2.0),
          underPlatformHeight: underPlatform.height,
          padGrounded: settled.grounded,
          padHeight: settled.height,
          padPushback: Math.hypot(padS, settled.y - stop.y),
        };
      });

      return {
        staticReport,
        physicalWalks,
      };
    });
    // Car corridor completely clear (obstacles + rendered meshes + skywalk clearance)
    expect(clearance.staticReport.carCorridor.obstacleHits).toEqual([]);
    expect(clearance.staticReport.carCorridor.nonTramMeshHits).toEqual([]);
    expect(clearance.staticReport.carCorridor.tramStaticCorridorHits).toEqual([]);
    expect(
      clearance.staticReport.carCorridor.skywalkClearanceY,
    ).toBeGreaterThanOrEqual(10.0);

    // Bakery awning clearance vs second west gantry column
    expect(clearance.staticReport.bakeryGantryClearance.awningFound).toBe(true);
    expect(
      clearance.staticReport.bakeryGantryClearance.meshIntersections,
    ).toEqual([]);
    expect(
      clearance.staticReport.bakeryGantryClearance.obstacleIntersections,
    ).toEqual([]);
    expect(
      clearance.staticReport.bakeryGantryClearance.nearestSouthColumnGapY,
    ).toBeGreaterThanOrEqual(0.5);

    // Raised underside colliders & open ground clearance
    expect(
      clearance.staticReport.raisedUnderside.raisedObstacleCount,
    ).toBeGreaterThan(0);
    expect(clearance.staticReport.raisedUnderside.railGroundBlockers).toEqual(
      [],
    );
    expect(
      clearance.staticReport.raisedUnderside.platformGroundBlockers,
    ).toEqual([]);

    // 1m station clear zones & Market sign / Civic lamp clearance
    for (const cz of clearance.staticReport.stationClearZones) {
      expect(cz.obstacleBlockers, `${cz.id} obstacle blockers`).toEqual([]);
      expect(cz.meshBlockers, `${cz.id} mesh blockers`).toEqual([]);
    }
    expect(clearance.staticReport.propTramCollisions).toEqual([]);

    // Physical walks under rail, under elevated platforms, and at ground pads
    for (const walk of clearance.physicalWalks) {
      expect(walk.underRailEndY, `${walk.id} under rail`).toBeGreaterThan(3.5);
      expect(walk.underRailHeight).toBe(0);
      expect(
        walk.underPlatformEndY,
        `${walk.id} under platform`,
      ).toBeGreaterThan(3.5);
      expect(walk.underPlatformHeight).toBe(0);
      expect(walk.padGrounded).toBe(true);
      expect(walk.padHeight).toBe(0);
      expect(walk.padPushback).toBeLessThan(0.05);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("fixture proves cargo and job eligibility stay intact while riding and after tram transit", async ({
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
        inspectCarriedCargo,
        layouts,
      } = f;
      const dt = 0.05;
      const maxWaitSteps = Math.ceil(180 / dt);

      // 1. Collect real seed crate at pickup
      player.teleport({
        theta: layouts.DELIVERY_STATIONS.pickup.s / layouts.RADIUS,
        y: layouts.DELIVERY_STATIONS.pickup.y - 1.5,
        height: 0,
      });
      let s = step(dt);
      const pickupRes = world.delivery.interact(s);
      render();
      const cargoOnPickup = inspectCarriedCargo();

      // Synthetic tram-mode state at exact ground pickup/dropoff must be ineligible
      const syntheticTramAtPickup = {
        theta: layouts.DELIVERY_STATIONS.pickup.s / layouts.RADIUS,
        y: layouts.DELIVERY_STATIONS.pickup.y,
        height: 0,
        grounded: true,
        traversalMode: "tram",
      };
      const syntheticTramPickupPrompt =
        world.delivery.getView(syntheticTramAtPickup).prompt;
      const syntheticTramPickupInteract = world.delivery.interact(
        syntheticTramAtPickup,
      );

      // 2. Step until tram docks at Market Square (TRAM_STOPS[1])
      for (
        let i = 0;
        i < maxWaitSteps &&
        world.tram.getState({}).stationId !== layouts.TRAM_STOPS[1].id;
        i++
      ) {
        s = step(dt);
      }
      if (world.tram.getState({}).stationId !== layouts.TRAM_STOPS[1].id) {
        throw new Error("Tram did not reach Market Square within 180 simulation seconds");
      }

      player.teleport({
        theta: layouts.TRAM_STOPS[1].theta,
        y: layouts.TRAM_STOPS[1].y,
        height: 0,
      });
      s = step(dt);
      const boardPrompt = world.tram.getInteraction(s);

      // 3. Board tram while carrying crate
      player.attachRide(world.tram);
      s = step(dt);
      render();
      const cargoWhileRidingStart = inspectCarriedCargo();
      const phaseWhileRidingStart = world.delivery.getPhase();

      // Ride past pickup Y (-460) and dropoff Y (-434) to Glasshouse stop
      let promptWhileMoving = null;
      let interactWhileMoving = null;
      let otherPromptWhileRiding = null;
      for (
        let i = 0;
        i < maxWaitSteps &&
        world.tram.getState({}).stationId !== layouts.TRAM_STOPS[2].id;
        i++
      ) {
        s = step(dt);
        promptWhileMoving =
          promptWhileMoving ||
          world.delivery.getView(s).prompt ||
          world.maintenance.getView(s).prompt ||
          world.sunline.getView(s).prompt;
        interactWhileMoving =
          interactWhileMoving || world.delivery.interact(s);
        otherPromptWhileRiding =
          otherPromptWhileRiding ||
          getCityLift(s) ||
          getSunlineTransfer(s);
      }
      if (world.tram.getState({}).stationId !== layouts.TRAM_STOPS[2].id) {
        throw new Error("Tram did not reach Glasshouse 01 within 180 simulation seconds");
      }
      render();
      const cargoAtGlasshouseStop = inspectCarriedCargo();
      const phaseAtGlasshouseStop = world.delivery.getPhase();

      // 4. Disembark at Glasshouse stop and complete delivery at Glasshouse 01 dropoff
      const glasshouseStop = layouts.TRAM_STOPS[2];
      player.teleport({
        theta: glasshouseStop.theta,
        y: glasshouseStop.y,
        height: glasshouseStop.height,
        yaw: glasshouseStop.yaw,
      });
      s = step(dt);

      // Position at the receiving desk for this controlled-fixture delivery check.
      player.teleport({
        theta: (layouts.DELIVERY_STATIONS.dropoff.s - 1.5) / layouts.RADIUS,
        y: layouts.DELIVERY_STATIONS.dropoff.y,
        height: 0,
      });
      s = step(dt);
      const dropoffWalkPrompt = world.delivery.getView(s).prompt;
      const dropoffRes = world.delivery.interact(s);
      render();
      const cargoAfterDropoff = inspectCarriedCargo();

      return {
        pickupPhase: pickupRes?.phase,
        cargoOnPickup,
        syntheticTramPickupPrompt,
        syntheticTramPickupInteract,
        boardPrompt,
        cargoWhileRidingStart,
        phaseWhileRidingStart,
        promptWhileMoving,
        interactWhileMoving,
        otherPromptWhileRiding,
        cargoAtGlasshouseStop,
        phaseAtGlasshouseStop,
        dropoffWalkPrompt,
        dropoffPhase: dropoffRes?.phase,
        finalDeliveryPhase: world.delivery.getPhase(),
        cargoAfterDropoff,
      };
    });

    expect(summary.pickupPhase).toBe("carrying");
    expect(summary.cargoOnPickup.found).toBe(true);
    expect(summary.cargoOnPickup.visible).toBe(true);
    expect(summary.syntheticTramPickupPrompt).toBeNull();
    expect(summary.syntheticTramPickupInteract).toBeNull();
    expect(summary.boardPrompt?.kind).toBe("board");
    expect(summary.cargoWhileRidingStart.visible).toBe(true);
    expect(summary.phaseWhileRidingStart).toBe("carrying");
    expect(summary.promptWhileMoving).toBeNull();
    expect(summary.interactWhileMoving).toBeNull();
    expect(summary.otherPromptWhileRiding).toBeNull();
    expect(summary.cargoAtGlasshouseStop.visible).toBe(true);
    expect(summary.phaseAtGlasshouseStop).toBe("carrying");
    expect(summary.dropoffWalkPrompt).toContain("Deliver");
    expect(summary.dropoffPhase).toBe("complete");
    expect(summary.finalDeliveryPhase).toBe("complete");
    expect(summary.cargoAfterDropoff.visible).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("native production app supports E boarding, short next-stop trip, free look, no WASD/jump, no en-route E fallthrough, pause/map freeze, and docked exit", async ({
  browser,
}) => {
  // Software WebGL advances only 0.05 simulation seconds per expensive frame.
  // This native pickup + scheduled ride must wait for the real timetable.
  test.setTimeout(600_000);
  const context = await browser.newContext({
    viewport: { width: 640, height: 480 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Only instrument WebGL draw-call count to prove pause/map render freezes; zero debug globals or clock/save cheats.
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
    const readLongM = () =>
      page.evaluate(() => {
        const text = document.getElementById("position")?.textContent || "";
        const m = text.match(/\/\s*(-?\d+)\s*m$/);
        return m ? Number(m[1]) : NaN;
      });

    await page.goto("/");
    await expect(page.locator("#start-greenway")).toBeEnabled();
    await page.locator("#start-greenway").click();
    await expect(page.locator("#pause")).toBeVisible();

    const pickupLongM = Math.round(DELIVERY_STATIONS.pickup.y + LENGTH / 2);
    const marketLongM = Math.round(TRAM_STOPS[1].y + LENGTH / 2);
    const glasshouseLongM = Math.round(TRAM_STOPS[2].y + LENGTH / 2);

    await test.step("Inspect tram route on map using G and select delivery job for live waypoint", async () => {
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      // SVG vertical strokes have zero-width boxes, so Playwright visibility
      // is not a valid paint check for this line.
      const routePaint = await page.locator("#habitat-map-svg .map-link-tram").evaluate((line) => {
        const style = getComputedStyle(line);
        let visibleAncestors = true;
        for (let node = line; node; node = node.parentElement) {
          const css = getComputedStyle(node);
          if (css.display === "none" || css.visibility !== "visible" || Number(css.opacity) === 0) {
            visibleAncestors = false;
          }
        }
        return {
          visibleAncestors,
          stroke: style.stroke,
          strokeWidth: Number.parseFloat(style.strokeWidth),
          strokeOpacity: Number(style.strokeOpacity),
          spanRatio: line.getTotalLength() / line.ownerSVGElement.viewBox.baseVal.height,
        };
      });
      expect(routePaint.visibleAncestors).toBe(true);
      expect(routePaint.stroke).not.toBe("none");
      expect(routePaint.strokeWidth).toBeGreaterThan(0);
      expect(routePaint.strokeOpacity).toBeGreaterThan(0);
      expect(routePaint.spanRatio).toBeGreaterThan(0.4);
      await expect(
        page.locator("#habitat-map-svg [data-tram-marker]"),
      ).toBeVisible();
      for (const stop of TRAM_STOPS) {
        await expect(
          page.locator(`#habitat-map-svg [data-marker-id="${stop.id}"]`),
        ).toBeAttached();
        await expect(
          page.locator(`button[data-destination-id="${stop.id}"]`),
        ).toBeVisible();
      }
      await page.locator('[data-job-id="delivery"]').click();
      await page.locator("#map-close").click();
      await expect(page.locator("#habitat-map")).toBeHidden();
    });

    await test.step("Collect real seed crate in Greenway and walk to Market Square tram pad", async () => {
      await page.keyboard.down("ShiftLeft");
      await page.keyboard.down("KeyW");
      await page.waitForFunction(
        (targetM) => {
          const pos = document.getElementById("position")?.textContent || "";
          const match = pos.match(/\/\s*(-?\d+)\s*m$/);
          return match && Number(match[1]) >= targetM - 12;
        },
        pickupLongM,
        { timeout: 90_000 },
      );
      await page.keyboard.up("ShiftLeft");
      await page.waitForFunction(
        (targetM) => {
          const pos = document.getElementById("position")?.textContent || "";
          const match = pos.match(/\/\s*(-?\d+)\s*m$/);
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

      // Walk west back onto promenade (000°) then south to Market Square stop (430 m)
      await page.keyboard.down("KeyA");
      await page.waitForFunction(
        () => {
          const pos = document.getElementById("position")?.textContent || "";
          return /^000°/.test(pos);
        },
        null,
        { timeout: 60_000 },
      );
      await page.keyboard.up("KeyA");

      await page.keyboard.down("KeyS");
      await page.waitForFunction(
        (targetM) => {
          const pos = document.getElementById("position")?.textContent || "";
          const match = pos.match(/\/\s*(-?\d+)\s*m$/);
          return match && Number(match[1]) <= targetM;
        },
        marketLongM,
        { timeout: 60_000 },
      );
      await page.keyboard.up("KeyS");

      await expect(page.locator("#interaction")).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("Wait for tram dock at Market Square, test inspect fallback if early, then board with E", async () => {
      const initialLabel =
        (await page.locator("#interaction-label").textContent()) || "";
      if (!/board/i.test(initialLabel)) {
        await page.keyboard.press("KeyE");
        await expect(page.locator("#toast")).toBeVisible({ timeout: 10_000 });
        await expect(page.locator("#height")).toHaveText("0.0 m UP");
      }

      await page.waitForFunction(
        () => {
          const box = document.getElementById("interaction");
          const label = document.getElementById("interaction-label");
          return (
            box &&
            !box.hidden &&
            label &&
            /board/i.test(label.textContent || "")
          );
        },
        null,
        { timeout: 180_000 },
      );

      await page.keyboard.press("KeyE");
      await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/, {
        timeout: 30_000,
      });
      await expect(page.locator("#height")).toHaveText("13.0 m UP", {
        timeout: 30_000,
      });
      const expectedG = `${(gravityAtHeight(TRAM_HEIGHT) / GRAVITY).toFixed(3)} G`;
      await expect(page.locator("#gravity")).toHaveText(expectedG);
      await expect(page.locator("#motion")).toHaveText(/tram/i);
      await expect(page.locator("#inventory")).toBeVisible();
      await expect(page.locator("#inventory-label")).toHaveText(
        "Heritage seed crate",
      );
      await expect(page.locator("#job")).toHaveAttribute(
        "data-phase",
        "carrying",
      );
      await page.screenshot({ path: test.info().outputPath("tram-passenger.png") });
    });

    await test.step("Aboard docked: verify no WASD/jump, free-look works, and pause freezes renders & cargo", async () => {
      const posBeforeWasd = await readLongM();
      await page.keyboard.down("KeyW");
      await page.keyboard.down("KeyA");
      await page.keyboard.down("Space");
      await waitFrames(page, 6);
      await page.keyboard.up("KeyW");
      await page.keyboard.up("KeyA");
      await page.keyboard.up("Space");

      await expect(page.locator("#height")).toHaveText("13.0 m UP");
      await expect(page.locator("#motion")).toHaveText(/tram/i);
      const posAfterWasd = await readLongM();
      expect(Math.abs(posAfterWasd - posBeforeWasd)).toBeLessThanOrEqual(1);

      // Free look shifts live waypoint screen coordinates
      const waypointLabel = page.locator("#waypoint-label");
      await expect(waypointLabel).toBeVisible();
      const boxBeforeLook = await waypointLabel.boundingBox();
      expect(boxBeforeLook).not.toBeNull();
      await page.keyboard.down("ArrowRight");
      await page.waitForFunction(
        (startX) => {
          const el = document.getElementById("waypoint-label");
          return el && Math.abs(el.getBoundingClientRect().x - startX) > 10;
        },
        boxBeforeLook.x,
        { timeout: 30_000 },
      );
      await page.keyboard.up("ArrowRight");
      const boxAfterLook = await waypointLabel.boundingBox();
      expect(boxAfterLook).not.toBeNull();
      expect(
        Math.hypot(
          boxAfterLook.x - boxBeforeLook.x,
          boxAfterLook.y - boxBeforeLook.y,
        ),
      ).toBeGreaterThan(2);
      // Pause freezes WebGL redraws and hides cargo while preserving carrying phase
      await page.keyboard.press("Escape");
      await expect(page.locator("#pause-panel")).toBeVisible();
      await expect(page.locator("#inventory")).toBeHidden();
      await waitFrames(page, 2);
      const pauseDraws0 = await getDraws();
      await waitFrames(page, 20);
      expect(await getDraws()).toBe(pauseDraws0);

      await page.locator("#resume").click();
      await expect(page.locator("#pause-panel")).toBeHidden();
      await expect(page.locator("#inventory")).toBeVisible();
      await expect(page.locator("#inventory-label")).toHaveText(
        "Heritage seed crate",
      );
      await expect(page.locator("#job")).toHaveAttribute(
        "data-phase",
        "carrying",
      );
    });

    await test.step("En route to Glasshouse 01: verify no E fallthrough and G map freezes vehicle & cargo", async () => {
      await page.waitForFunction(
        (fromM) => {
          const box = document.getElementById("interaction");
          const pos = document.getElementById("position")?.textContent || "";
          const match = pos.match(/\/\s*(-?\d+)\s*m$/);
          return box?.hidden && match && Number(match[1]) >= fromM + 1;
        },
        marketLongM,
        { timeout: 120_000 },
      );

      // En-route E must NOT exit, open dialogue, or mutate job; immediately press G (works even under pointerlock)
      await page.keyboard.press("KeyE");
      await page.keyboard.press("KeyG");
      await expect(page.locator("#habitat-map")).toBeVisible();
      await expect(page.locator("#height")).toHaveText("13.0 m UP");
      await expect(page.locator("#motion")).toHaveText(/tram/i);
      await expect(page.locator("#dialogue")).toBeHidden();
      await expect(page.locator("#inventory")).toBeHidden();
      await expect(page.locator("#job")).toHaveAttribute(
        "data-phase",
        "carrying",
      );

      const tramMarker = page.locator("#habitat-map-svg [data-tram-marker]");
      await expect(tramMarker).toBeVisible();
      const markerBoxBefore = await tramMarker.boundingBox();
      const posWhileFrozen = await readLongM();

      await waitFrames(page, 2);
      const mapDraws0 = await getDraws();
      await page.waitForTimeout(1500);
      await waitFrames(page, 20);
      expect(await getDraws()).toBe(mapDraws0);

      const markerBoxAfter = await tramMarker.boundingBox();
      expect(markerBoxBefore).not.toBeNull();
      expect(markerBoxAfter).not.toBeNull();
      expect(Math.abs(markerBoxAfter.x - markerBoxBefore.x)).toBeLessThan(0.1);
      expect(Math.abs(markerBoxAfter.y - markerBoxBefore.y)).toBeLessThan(0.1);

      await page.locator("#map-close").click();
      await expect(page.locator("#habitat-map")).toBeHidden();
      await expect(page.locator("#inventory")).toBeVisible();
      await expect(page.locator("#inventory-label")).toHaveText(
        "Heritage seed crate",
      );
      const posAfterResume = await readLongM();
      expect(posAfterResume).toBeLessThanOrEqual(posWhileFrozen + 6);
    });

    await test.step("Docked exit at Glasshouse 01 returns cleanly to ground walk with cargo intact", async () => {
      await page.waitForFunction(
        (targetM) => {
          const box = document.getElementById("interaction");
          const pos = document.getElementById("position")?.textContent || "";
          const match = pos.match(/\/\s*(-?\d+)\s*m$/);
          return (
            box &&
            !box.hidden &&
            match &&
            Math.abs(Number(match[1]) - targetM) <= 2
          );
        },
        glasshouseLongM,
        { timeout: 120_000 },
      );

      await page.keyboard.press("KeyE");
      await expect(page.locator("#viewport")).not.toHaveClass(/lift-travel/, {
        timeout: 30_000,
      });
      await expect(page.locator("#height")).toHaveText("0.0 m UP", {
        timeout: 30_000,
      });
      await expect(page.locator("#gravity")).toHaveText("1.000 G");
      await expect(page.locator("#motion")).toHaveText(/on foot|walking/i);
      await expect(page.locator("#inventory")).toBeVisible();
      await expect(page.locator("#inventory-label")).toHaveText(
        "Heritage seed crate",
      );
      await expect(page.locator("#job")).toHaveAttribute(
        "data-phase",
        "carrying",
      );

      const exitM = await readLongM();
      await page.keyboard.down("KeyW");
      await page.waitForFunction(
        (startM) => {
          const pos = document.getElementById("position")?.textContent || "";
          const match = pos.match(/\/\s*(-?\d+)\s*m$/);
          return match && Number(match[1]) >= startM + 2;
        },
        exitM,
        { timeout: 30_000 },
      );
      await page.keyboard.up("KeyW");
    });

    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
