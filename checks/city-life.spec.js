import { test, expect } from "@playwright/test";
import { LIBRARY_LAYOUT } from "../src/library-layout.js";

test("Meridian reading, dwell gestures, and armillary preserve physical anchors and freeze on pause", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1100, height: 760 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/checks/world.html");
  await page.waitForFunction(() => Boolean(window.__worldFixture));

  const result = await page.evaluate((library) => {
    const f = window.__worldFixture;
    const actors = f.world.residents.residents.filter((r) => r.dwells);
    const rings = ["cityArmillaryRingTeal", "cityArmillaryRingBrass"].map((name) => {
      const ring = f.scene.getObjectByName(name);
      if (!ring) throw new Error(`Missing authored armillary ring: ${name}`);
      return ring;
    });
    const assembly = f.scene.getObjectByName("cityArmillaryRings");
    const snapshot = (root) => {
      const values = [];
      root.traverse((node) => values.push(
        ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray(),
      ));
      return values;
    };
    const currentRotation = actors[0].root.quaternion.clone();
    const previousRotation = currentRotation.clone();
    const assertBinocularFit = (actor) => {
      const optics = actor.binoculars;
      if (!optics.geometry.boundingBox) optics.geometry.computeBoundingBox();
      const box = optics.geometry.boundingBox;
      const centerInOptics = (name) => {
        const mesh = actor.root.getObjectByName(name);
        if (!mesh?.isMesh) throw new Error(`Missing authored ${name} on ${actor.cfg.id}`);
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const center = mesh.geometry.boundingBox.getCenter(optics.position.clone());
        return optics.worldToLocal(mesh.localToWorld(center));
      };
      for (const side of ["left", "right"]) {
        const hand = centerInOptics(`hand-${side}`);
        if (box.distanceToPoint(hand) > 0.055
          || !(side === "left" ? hand.x < -0.035 : hand.x > 0.035)) {
          throw new Error(`${side} hand loses its optics grip at dwell ${actor.dwellElapsed}`);
        }
        const eye = centerInOptics(`eye-${side}`);
        const relief = box.min.y - eye.y;
        if (!(relief >= 0.01 && relief <= 0.08)
          || !(eye.x >= box.min.x && eye.x <= box.max.x)
          || !(side === "left" ? eye.x < 0 : eye.x > 0)
          || !(eye.z >= box.min.z && eye.z <= box.max.z)) {
          throw new Error(`${side} eye misses the rear aperture at dwell ${actor.dwellElapsed}`);
        }
      }
    };
    const readerSeat = f.scene.getObjectByName("library_reader_seat");
    const readingBook = f.scene.getObjectByName("library_reading_book");
    if (!readerSeat?.isMesh || !readingBook) {
      throw new Error("Library reading needs its actual seat and permanent table book");
    }
    const readerFit = (actor, sample) => {
      f.scene.updateMatrixWorld(true);
      const point = actor.root.position.clone();
      const boundsInHeading = (object) => {
        const min = point.clone().set(Infinity, Infinity, Infinity);
        const max = point.clone().set(-Infinity, -Infinity, -Infinity);
        object.traverse((mesh) => {
          if (!mesh.isMesh) return;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox;
          for (const x of [box.min.x, box.max.x]) {
            for (const y of [box.min.y, box.max.y]) {
              for (const z of [box.min.z, box.max.z]) {
                actor.heading.worldToLocal(mesh.localToWorld(point.set(x, y, z)));
                min.min(point);
                max.max(point);
              }
            }
          }
        });
        return { min, max };
      };
      const seat = boundsInHeading(readerSeat);
      const pelvis = boundsInHeading(actor.root.getObjectByName("pelvis"));
      sample.seatError = Math.max(sample.seatError, Math.abs(pelvis.min.z - seat.max.z));
      if (pelvis.min.x < seat.min.x || pelvis.max.x > seat.max.x
        || pelvis.min.y < seat.min.y || pelvis.max.y > seat.max.y) {
        throw new Error("Reader pelvis is not over the actual chair seat");
      }
      for (const side of ["left", "right"]) {
        const sole = boundsInHeading(actor.root.getObjectByName(`foot-${side}`));
        sample.soleError = Math.max(sample.soleError,
          Math.abs(sole.min.z + actor.height + 0.07 - library.floor));
      }
      const book = boundsInHeading(readingBook);
      const bookCenter = book.min.clone().add(book.max).multiplyScalar(0.5);
      if (Math.abs(bookCenter.x) > 0.03
        || Math.abs(bookCenter.y - (library.book.y - library.reader.y)) > 0.03
        || Math.abs(bookCenter.z + actor.height + 0.07 - library.book.height) > 0.06) {
        throw new Error("Reader is not seated beside the actual authored book");
      }
      const head = actor.head.getWorldPosition(point);
      const target = actor.heading.localToWorld(bookCenter.clone()).sub(head).normalize();
      const look = point.clone().set(0, 1, 0)
        .applyQuaternion(actor.head.getWorldQuaternion(actor.head.quaternion.clone()));
      sample.bookFacing = Math.min(sample.bookFacing, look.dot(target));
      sample.readingFrames++;
    };
    const ringStart = rings.map((r) => r.quaternion.clone());
    const ringAnchor = snapshot(assembly).slice(0, 10);
    const mara = f.scene.getObjectByName("caretaker-mara");
    const maraStart = snapshot(mara);
    const samples = actors.map((r) => ({
      id: r.cfg.id, minHead: Infinity, maxHead: -Infinity,
      minElbow: Infinity, maxElbow: -Infinity,
      minProp: Infinity, maxProp: -Infinity,
      footError: 0, poseChange: 0, angularChange: 0, previous: null, feet: null,
      dwellFrames: 0, pauseFrozen: true, image: null, scanImage: null,
      opticFrames: 0, opticPhases: [],
      viewingDuration: r.binoculars ? r.dwells[0].duration : 0,
      readingFrames: 0, seatError: 0, soleError: 0, bookFacing: 1,
    }));
    const renderedSpreads = [];
    const renderView = (frame, position, target, fov = 46) => {
      f.scene.updateMatrixWorld(true);
      f.camera.position.copy(frame.localToWorld(frame.position.clone().set(...position)));
      f.camera.up.copy(frame.position.clone().set(0, 0, 1)
        .applyQuaternion(frame.getWorldQuaternion(frame.quaternion.clone())));
      f.camera.lookAt(frame.localToWorld(frame.position.clone().set(...target)));
      f.camera.fov = fov;
      f.camera.updateProjectionMatrix();
      f.camera.layers.set(0);
      f.render();
      const gl = f.renderer.getContext();
      const pixels = new Uint8Array(128 * 128 * 4);
      gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) - 64,
        Math.floor(gl.drawingBufferHeight / 2) - 64, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let low = 255;
      let high = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      renderedSpreads.push(high - low);
      return f.renderer.domElement.toDataURL("image/png");
    };
    let maxAnchorError = 0;
    let maxFootHeightError = 0;
    for (let frame = 0; frame < 30 * 60; frame++) {
      f.step(1 / 60);
      for (let index = 0; index < actors.length; index++) {
        const r = actors[index];
        const sample = samples[index];
        const pose = [...snapshot(r.torso), r.body.position.z];
        if (sample.previous) {
          for (let i = 0; i < pose.length; i++) {
            // Each transform contains position (3), quaternion (4), scale (3).
            if (i % 10 === 3) {
              sample.angularChange = Math.max(sample.angularChange,
                currentRotation.fromArray(pose, i)
                  .angleTo(previousRotation.fromArray(sample.previous, i)));
              i += 3;
            } else {
              sample.poseChange = Math.max(sample.poseChange, Math.abs(pose[i] - sample.previous[i]));
            }
          }
        }
        sample.previous = pose;
        maxAnchorError = Math.max(maxAnchorError, Math.abs(r.root.position.y - r.sampleState.y));
        maxFootHeightError = Math.max(maxFootHeightError,
          Math.abs(Math.hypot(r.root.position.x, r.root.position.z) - (f.layouts.RADIUS - r.height - 0.07)));
        if (r.dwellState !== "dwelling") continue;
        sample.dwellFrames++;
        const feet = [
          ...snapshot(r.leftThigh), ...snapshot(r.rightThigh),
          ...r.root.position.toArray(), ...r.heading.quaternion.toArray(), ...r.body.position.toArray(),
        ];
        if (!sample.feet) sample.feet = feet;
        for (let i = 0; i < feet.length; i++) {
          sample.footError = Math.max(sample.footError, Math.abs(feet[i] - sample.feet[i]));
        }
        sample.minHead = Math.min(sample.minHead, r.head.rotation.z);
        sample.maxHead = Math.max(sample.maxHead, r.head.rotation.z);
        sample.minElbow = Math.min(sample.minElbow, r.rightForearm.rotation.x);
        sample.maxElbow = Math.max(sample.maxElbow, r.rightForearm.rotation.x);
        const prop = r.satchel || r.briefcase || r.binoculars;
        if (prop) {
          sample.minProp = Math.min(sample.minProp, prop.rotation.x);
          sample.maxProp = Math.max(sample.maxProp, prop.rotation.x);
        }
        if (r.reading) readerFit(r, sample);
        if (r.binoculars) {
          assertBinocularFit(r);
          sample.opticFrames++;
          sample.opticPhases[Math.floor(r.dwellElapsed)] = true;
          if (!sample.scanImage && r.dwellElapsed >= 4) {
            sample.scanImage = renderView(r.heading, [-1.0, 1.8, 1.9], [0, 0.1, 1.35], 38);
          }
        }
        if (!sample.image && r.dwellElapsed >= (r.binoculars ? 1 : 2)) {
          sample.image = r.reading
            ? renderView(r.heading, [2.2, -2.8, 1.8], [0, 0.4, 0.75], 42)
            : r.binoculars
              ? renderView(r.heading, [1.0, 1.8, 1.9], [0, 0.1, 1.35], 38)
              : renderView(r.heading, [2.4, 3.2, 2.0], [0, 0, 1.0]);
          const before = JSON.stringify(snapshot(r.root));
          f.world.update(0, 1e15, f.player.getState({}));
          sample.pauseFrozen = before === JSON.stringify(snapshot(r.root));
        }
      }
    }
    const ringMotion = rings.map((ring, index) => ring.quaternion.angleTo(ringStart[index]));
    const paused = [snapshot(assembly), ...actors.map((r) => snapshot(r.root))];
    f.world.update(0, 1e15, f.player.getState({}));
    f.world.update(0, -1e15, f.player.getState({}));
    const pauseFrozen = JSON.stringify(paused)
      === JSON.stringify([snapshot(assembly), ...actors.map((r) => snapshot(r.root))]);
    const ringShadow = [];
    assembly.traverse((node) => {
      if (node.isMesh) ringShadow.push({ cast: node.castShadow, receive: node.receiveShadow });
    });
    const cityImage = renderView(assembly, [12, -18, 12], [0, 0, -2], 65);
    const ringWorld = assembly.getWorldPosition(assembly.position.clone());
    const theta = 12 / f.layouts.RADIUS;
    // setSurfaceMatrix places the unit-height frame's center half a meter
    // above its authored 4.55 m base; the original ring center is 5.05 m.
    const ringCenterHeight = 4.55 + 1 / 2;
    const ringAnchorError = Math.hypot(
      ringWorld.x - (f.layouts.RADIUS - ringCenterHeight) * Math.sin(theta),
      ringWorld.y - f.layouts.MERIDIAN_PLACEMENT.toWorldY(-5),
      ringWorld.z + (f.layouts.RADIUS - ringCenterHeight) * Math.cos(theta),
    );
    return {
      samples: samples.map(({ previous, feet, ...sample }) => sample),
      maxAnchorError, maxFootHeightError, ringMotion, ringAnchorError, renderedSpreads,
      ringAnchorStable: JSON.stringify(ringAnchor) === JSON.stringify(snapshot(assembly).slice(0, 10)),
      maraStable: JSON.stringify(maraStart) === JSON.stringify(snapshot(mara)),
      pauseFrozen, ringShadow, cityImage,
      anchors: f.inspectResidentAnchors(),
    };
  }, LIBRARY_LAYOUT);

  expect(errors).toEqual([]);
  expect(result.maxAnchorError).toBeLessThan(1e-9);
  expect(result.maxFootHeightError).toBeLessThan(1e-8);
  expect(result.maraStable).toBe(true);
  expect(result.pauseFrozen).toBe(true);
  expect(result.ringAnchorStable).toBe(true);
  expect(result.ringAnchorError).toBeLessThan(1e-8);
  for (const spread of result.renderedSpreads) expect(spread).toBeGreaterThan(2);
  for (const motion of result.ringMotion) expect(motion).toBeGreaterThan(0.2);
  expect(result.ringShadow.length).toBeGreaterThan(0);
  for (const mesh of result.ringShadow) {
    expect(mesh.cast).toBe(false);
    expect(mesh.receive).toBe(true);
  }
  for (const anchor of result.anchors) expect(anchor.worldDist).toBeCloseTo(0.07, 6);
  for (const sample of result.samples) {
    expect(sample.dwellFrames, sample.id).toBeGreaterThan(120);
    expect(sample.maxHead - sample.minHead, sample.id)
      .toBeGreaterThan(sample.id === "resident-plaza" ? 0.015 : 0.1);
    expect(sample.footError, sample.id).toBeLessThan(1e-9);
    expect(sample.poseChange, sample.id).toBeLessThan(0.065);
    expect(sample.angularChange, sample.id).toBeLessThan(0.1);
    expect(sample.pauseFrozen, sample.id).toBe(true);
    if (sample.id === "resident-plaza") {
      expect(sample.readingFrames).toBe(sample.dwellFrames);
      expect(sample.seatError).toBeLessThan(0.015);
      expect(sample.soleError).toBeLessThan(0.015);
      expect(sample.bookFacing).toBeGreaterThan(0.98);
      expect(sample.maxProp - sample.minProp).toBe(0);
      expect(sample.maxElbow - sample.minElbow).toBeGreaterThan(0.015);
    }
    if (sample.id === "resident-lobby") {
      expect(sample.maxProp - sample.minProp, sample.id).toBeGreaterThan(0.02);
      expect(sample.maxElbow - sample.minElbow, sample.id).toBeGreaterThan(0.1);
    }
    if (sample.viewingDuration) {
      expect(sample.opticFrames, sample.id).toBe(sample.dwellFrames);
      expect(sample.opticPhases, sample.id).toEqual(Array(sample.viewingDuration).fill(true));
      expect(sample.maxProp - sample.minProp, sample.id).toBeGreaterThan(0.01);
      expect(sample.scanImage, sample.id).toMatch(/^data:image\/png;base64,/);
      await testInfo.attach(`${sample.id}-actual-scan-late`, {
        body: Buffer.from(sample.scanImage.split(",")[1], "base64"), contentType: "image/png",
      });
    }
    expect(sample.image, sample.id).toMatch(/^data:image\/png;base64,/);
    await testInfo.attach(sample.id === "resident-plaza"
      ? "library-reader-actual-seat-and-book" : `${sample.id}-actual-dwell`, {
      body: Buffer.from(sample.image.split(",")[1], "base64"), contentType: "image/png",
    });
  }
  await testInfo.attach("meridian-armillary-actual-scene", {
    body: Buffer.from(result.cityImage.split(",")[1], "base64"), contentType: "image/png",
  });
});
