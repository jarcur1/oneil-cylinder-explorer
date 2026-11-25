import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { addCivicBlock, addCivicSolid } from "./civic-primitives.js";
import { addOrientedPanel, addSurfaceBox, surfacePos } from "./surface.js";
import { STILLWATER_LENS, reservoirS, reservoirY } from "./reservoir-layout.js";

const _basis = new THREE.Matrix4();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3(0, 1, 0);
const _up = new THREE.Vector3();

function placeSurfaceGroup(object, s, y, h = 0) {
  const theta = reservoirS(s) / RADIUS;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  _east.set(cos, 0, sin);
  _up.set(-sin, 0, cos);
  _basis.makeBasis(_east, _north, _up);
  object.position.copy(surfacePos(theta, reservoirY(y), h));
  object.quaternion.setFromRotationMatrix(_basis);
  return object;
}

function createCanvasTexture(width, height, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  return texture;
}

function createSignMaterial(eyebrow, title, lines, { width = 1024, height = 512, compact = false } = {}) {
  const texture = createCanvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = "#173c3c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#d1b171";
    ctx.lineWidth = compact ? 8 : 9;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    ctx.strokeStyle = "rgba(209, 177, 113, 0.32)";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, w - 60, h - 60);

    const padX = compact ? 54 : 64;
    const maxW = w - padX * 2;
    ctx.fillStyle = "#d9bc80";
    ctx.font = `600 ${compact ? 34 : 36}px system-ui`;
    ctx.fillText(eyebrow, padX, compact ? 92 : 94, maxW);

    ctx.fillStyle = "#f6edd9";
    ctx.font = `700 ${compact ? 64 : 74}px system-ui`;
    ctx.fillText(title, padX, compact ? 180 : 192, maxW);

    ctx.fillStyle = "#d1b171";
    ctx.fillRect(padX, compact ? 210 : 224, Math.min(240, maxW * 0.4), 4);

    ctx.fillStyle = "#efe5cf";
    ctx.font = `${compact ? 42 : 44}px system-ui`;
    const startY = compact ? 284 : 302;
    const stepY = compact ? 64 : 72;
    lines.forEach((line, i) => ctx.fillText(line, padX, startY + i * stepY, maxW));
  });
  return new THREE.MeshBasicMaterial({ map: texture });
}

function createMaterials() {
  const deckTex = createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#c8beaa";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        const hash = ((x * 37 + y * 59) % 19) - 9;
        ctx.fillStyle = `rgba(110, 102, 86, ${0.06 + (hash + 9) * 0.004})`;
        ctx.fillRect(x, y, 8, 8);
      }
    }
    ctx.strokeStyle = "rgba(82, 78, 66, 0.34)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }, 8, 7);

  const stepTex = createCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#b9af99";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 246, 224, 0.25)";
    ctx.fillRect(0, 0, 12, h);
    ctx.fillStyle = "rgba(62, 58, 49, 0.22)";
    ctx.fillRect(w - 6, 0, 6, h);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "rgba(70, 66, 56, 0.16)";
      ctx.fillRect(0, i * 32, w, 2);
    }
  }, 1, 3);

  const timberTex = createCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#8a613f";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      const shade = i % 2 === 0 ? "rgba(52, 32, 18, 0.16)" : "rgba(225, 184, 134, 0.10)";
      ctx.fillStyle = shade;
      ctx.fillRect(0, i * 8, w, 3);
    }
  }, 2, 1);

  const barrelTex = createCanvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#1c4342");
    grad.addColorStop(0.5, "#2a5d5b");
    grad.addColorStop(1, "#183938");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(218, 181, 107, 0.35)";
    ctx.fillRect(0, 22, w, 4);
    ctx.fillRect(0, h - 26, w, 4);
    ctx.fillStyle = "rgba(12, 24, 24, 0.28)";
    for (let y = 40; y < h - 40; y += 44) {
      ctx.fillRect(0, y, w, 2);
    }
  });

  return {
    deck: new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.88, metalness: 0.04 }),
    step: new THREE.MeshStandardMaterial({ map: stepTex, roughness: 0.85, metalness: 0.05 }),
    timber: new THREE.MeshStandardMaterial({ map: timberTex, roughness: 0.78, metalness: 0.04 }),
    tealMetal: new THREE.MeshStandardMaterial({ color: 0x264e4b, roughness: 0.44, metalness: 0.52 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x1b2b2c, roughness: 0.5, metalness: 0.58 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xcfa55b, roughness: 0.32, metalness: 0.78 }),
    barrel: new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.36, metalness: 0.48 }),
    baffle: new THREE.MeshStandardMaterial({ color: 0x0d1517, roughness: 0.92, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x7fd6e0,
      transparent: true,
      opacity: 0.48,
      roughness: 0.08,
      metalness: 0.25,
      emissive: 0x13424c,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    }),
  };
}

function buildTelescope(parent, materials, obstacles) {
  const { instrument, eyepoint } = STILLWATER_LENS;
  const deckTop = STILLWATER_LENS.deck.top;
  const pivotGroup = new THREE.Group();
  pivotGroup.name = "stillwater_lens_telescope";
  placeSurfaceGroup(pivotGroup, instrument.s, instrument.y, instrument.height);
  parent.add(pivotGroup);

  const deckRelZ = deckTop - instrument.height; // -1.95 m below trunnion center

  // Octagonal stone base plinth + azimuth ring + turntable (Z is local radial up)
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.24, 0.26, 8).rotateX(Math.PI / 2),
    materials.step,
  );
  plinth.name = "telescope_plinth";
  plinth.position.set(0, 0, deckRelZ + 0.13);
  pivotGroup.add(plinth);

  const azRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.98, 0.14, 16).rotateX(Math.PI / 2),
    materials.brass,
  );
  azRing.name = "telescope_azimuth_ring";
  azRing.position.set(0, 0, deckRelZ + 0.33);
  pivotGroup.add(azRing);

  const pedCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.74, 0.82, 0.32, 16).rotateX(Math.PI / 2),
    materials.tealMetal,
  );
  pedCollar.name = "telescope_azimuth_pedestal";
  pedCollar.position.set(0, 0, deckRelZ + 0.56);
  pivotGroup.add(pedCollar);

  // Broad brass & teal yoke saddle and twin trunnion forks in North-South (+/- Y)
  const yokeSaddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 1.98, 0.22),
    materials.tealMetal,
  );
  yokeSaddle.name = "telescope_yoke_saddle";
  yokeSaddle.position.set(0, 0, deckRelZ + 0.80);
  pivotGroup.add(yokeSaddle);

  const yokeTrim = new THREE.Mesh(
    new THREE.BoxGeometry(0.80, 1.84, 0.06),
    materials.brass,
  );
  yokeTrim.name = "telescope_yoke_saddle_trim";
  yokeTrim.position.set(0, 0, deckRelZ + 0.93);
  pivotGroup.add(yokeTrim);

  const armHeight = Math.abs(deckRelZ + 0.92);
  const armGeom = new THREE.BoxGeometry(0.42, 0.18, armHeight);
  const ribGeom = new THREE.BoxGeometry(0.18, 0.05, armHeight - 0.12);
  const bearingGeom = new THREE.CylinderGeometry(0.20, 0.20, 0.24, 16);

  for (const side of [-1, 1]) {
    const label = side < 0 ? "south" : "north";
    const arm = new THREE.Mesh(armGeom, materials.tealMetal);
    arm.name = `telescope_yoke_arm_${label}`;
    arm.position.set(0, side * 0.86, deckRelZ + 0.92 + armHeight / 2);
    pivotGroup.add(arm);

    const innerRib = new THREE.Mesh(ribGeom, materials.brass);
    innerRib.name = `telescope_yoke_rib_${label}`;
    innerRib.position.set(0, side * 0.76, deckRelZ + 0.92 + armHeight / 2);
    pivotGroup.add(innerRib);

    const bearing = new THREE.Mesh(bearingGeom, materials.brass);
    bearing.name = `telescope_trunnion_bearing_${label}`;
    bearing.position.set(0, side * 0.86, 0);
    pivotGroup.add(bearing);
  }

  // Altitude brass setting circle on south arm
  const altCircle = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.032, 8, 24).rotateX(Math.PI / 2),
    materials.brass,
  );
  altCircle.name = "telescope_altitude_circle";
  altCircle.position.set(0, -0.71, 0);
  pivotGroup.add(altCircle);

  // Optical barrel oriented toward virtual eyepoint (local -X tilted up +Z)
  const dx = eyepoint.s - instrument.s;
  const dy = eyepoint.y - instrument.y;
  const dz = eyepoint.height - instrument.height;
  const tilt = Math.atan2(dz, Math.hypot(dx, dy));
  const yaw = Math.atan2(-dy, -dx);

  const barrelGroup = new THREE.Group();
  barrelGroup.name = "telescope_optical_barrel_assembly";
  barrelGroup.rotation.order = "ZYX";
  barrelGroup.rotation.z = yaw;
  barrelGroup.rotation.y = tilt;
  pivotGroup.add(barrelGroup);

  const tubeX = (geo) => geo.rotateZ(Math.PI / 2);

  // Main optical tube (-2.15 to +0.95 along X; -X faces west)
  const mainTube = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.33, 0.33, 3.10, 20)),
    materials.barrel,
  );
  mainTube.name = "telescope_main_barrel";
  mainTube.position.set(-0.60, 0, 0);
  barrelGroup.add(mainTube);

  // Central trunnion cradle & axle
  const cradleBand = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.365, 0.365, 0.66, 20)),
    materials.tealMetal,
  );
  cradleBand.name = "telescope_cradle_band";
  barrelGroup.add(cradleBand);

  const trunnionAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 1.88, 12),
    materials.brass,
  );
  trunnionAxle.name = "telescope_trunnion_axle";
  barrelGroup.add(trunnionAxle);

  // Brass clamping rings
  for (const [idx, ringX] of [[1, -1.55], [2, -0.36], [3, 0.36], [4, 0.88]]) {
    const ring = new THREE.Mesh(
      tubeX(new THREE.CylinderGeometry(0.355, 0.355, 0.09, 20)),
      materials.brass,
    );
    ring.name = `telescope_brass_ring_${idx}`;
    ring.position.set(ringX, 0, 0);
    barrelGroup.add(ring);
  }

  // Forward brass collar, dew shield, dark baffle, and glass objective (stops behind s=77)
  const forwardCollar = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.375, 0.35, 0.22, 20)),
    materials.brass,
  );
  forwardCollar.name = "telescope_objective_collar";
  forwardCollar.position.set(-2.14, 0, 0);
  barrelGroup.add(forwardCollar);

  const dewShield = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.385, 0.385, 0.48, 20, 1, true)),
    materials.tealMetal,
  );
  dewShield.material = materials.tealMetal.clone();
  dewShield.material.side = THREE.DoubleSide;
  dewShield.name = "telescope_dew_shield";
  dewShield.position.set(-2.46, 0, 0);
  barrelGroup.add(dewShield);

  const frontRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.385, 0.032, 10, 24).rotateY(Math.PI / 2),
    materials.brass,
  );
  frontRim.name = "telescope_objective_rim";
  frontRim.position.set(-2.70, 0, 0);
  barrelGroup.add(frontRim);

  const baffle = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.335, 0.335, 0.04, 20)),
    materials.baffle,
  );
  baffle.name = "telescope_optical_baffle";
  baffle.position.set(-2.22, 0, 0);
  barrelGroup.add(baffle);

  const objectiveLens = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.345, 0.345, 0.05, 24)),
    materials.glass,
  );
  objectiveLens.name = "telescope_glass_objective";
  objectiveLens.position.set(-2.34, 0, 0);
  barrelGroup.add(objectiveLens);

  // Tapered breech, focuser drawtube, focus knobs, and eyepiece (east end toward station)
  const breech = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.33, 0.16, 0.28, 18)),
    materials.tealMetal,
  );
  breech.name = "telescope_breech";
  breech.position.set(1.09, 0, 0);
  barrelGroup.add(breech);

  const focuser = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 16)),
    materials.brass,
  );
  focuser.name = "telescope_focuser";
  focuser.position.set(1.32, 0, 0);
  barrelGroup.add(focuser);

  const focusShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.34, 10),
    materials.darkMetal,
  );
  focusShaft.name = "telescope_focus_shaft";
  focusShaft.position.set(1.32, 0, -0.05);
  barrelGroup.add(focusShaft);

  for (const side of [-1, 1]) {
    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.045, 12),
      materials.brass,
    );
    knob.name = `telescope_focus_knob_${side < 0 ? "south" : "north"}`;
    knob.position.set(1.32, side * 0.17, -0.05);
    barrelGroup.add(knob);
  }

  const eyepiece = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.068, 0.055, 0.13, 14)),
    materials.darkMetal,
  );
  eyepiece.name = "telescope_eyepiece";
  eyepiece.position.set(1.48, 0, 0);
  barrelGroup.add(eyepiece);

  // Collage of low details: piggyback finder scope, counterweight bar, vernier conduit
  const finderTube = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.055, 0.055, 0.92, 12)),
    materials.brass,
  );
  finderTube.name = "telescope_finder_scope";
  finderTube.position.set(0.32, 0.24, 0.41);
  barrelGroup.add(finderTube);

  const finderLens = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 12)),
    materials.glass,
  );
  finderLens.name = "telescope_finder_lens";
  finderLens.position.set(-0.13, 0.24, 0.41);
  barrelGroup.add(finderLens);

  for (const [idx, fx] of [[1, 0.04], [2, 0.54]]) {
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.20),
      materials.darkMetal,
    );
    bracket.name = `telescope_finder_mount_${idx}`;
    bracket.position.set(fx, 0.18, 0.31);
    barrelGroup.add(bracket);
  }

  const cwRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.46, 10).rotateX(Math.PI / 2),
    materials.darkMetal,
  );
  cwRod.name = "telescope_counterweight_rod";
  cwRod.position.set(0.28, 0, -0.52);
  barrelGroup.add(cwRod);

  const cwMass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.18, 14).rotateX(Math.PI / 2),
    materials.brass,
  );
  cwMass.name = "telescope_counterweight";
  cwMass.position.set(0.28, 0, -0.64);
  barrelGroup.add(cwMass);

  const vernierTube = new THREE.Mesh(
    tubeX(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 8)),
    materials.brass,
  );
  vernierTube.name = "telescope_vernier_conduit";
  vernierTube.position.set(0.25, -0.36, -0.08);
  barrelGroup.add(vernierTube);

  // Keep station (s=82, y=74) completely clear while protecting the pier/yoke footprint
  obstacles.push({
    name: "stillwater_lens_telescope_collider",
    theta: reservoirS(instrument.s) / RADIUS,
    y: reservoirY(instrument.y),
    width: 2.3,
    depth: 2.3,
    height: 2.4,
    base: deckTop,
  });
}

function buildSouthCanopyAndExhibit(parent, materials, obstacles) {
  const deckTop = STILLWATER_LENS.deck.top;
  const canopyGroup = new THREE.Group();
  canopyGroup.name = "stillwater_lens_south_canopy";
  placeSurfaceGroup(canopyGroup, 87.5, 67.45, deckTop);
  parent.add(canopyGroup);

  // Two asymmetric curved arch/mast ribs anchored along the south bay (never over y=74 ray)
  const westPts = [
    new THREE.Vector3(-3.1, 0.0, 0.0),
    new THREE.Vector3(-3.1, 0.12, 1.45),
    new THREE.Vector3(-3.1, 0.55, 2.80),
    new THREE.Vector3(-3.1, 1.70, 3.85),
    new THREE.Vector3(-3.1, 3.40, 3.60),
  ];
  const eastPts = [
    new THREE.Vector3(3.1, 0.0, 0.0),
    new THREE.Vector3(3.1, 0.12, 1.10),
    new THREE.Vector3(3.1, 0.55, 2.15),
    new THREE.Vector3(3.1, 1.70, 3.05),
    new THREE.Vector3(3.1, 3.40, 2.85),
  ];
  const westCurve = new THREE.CatmullRomCurve3(westPts);
  const eastCurve = new THREE.CatmullRomCurve3(eastPts);

  for (const [label, xPos, curve] of [["west", -3.1, westCurve], ["east", 3.1, eastCurve]]) {
    const rib = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.11, 8, false),
      materials.tealMetal,
    );
    rib.name = `canopy_arch_rib_${label}`;
    canopyGroup.add(rib);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.16), materials.brass);
    shoe.name = `canopy_rib_shoe_${label}`;
    shoe.position.set(xPos, 0.0, 0.08);
    canopyGroup.add(shoe);

    const endPt = curve.getPoint(1);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), materials.brass);
    cap.name = `canopy_rib_tip_${label}`;
    cap.position.copy(endPt);
    canopyGroup.add(cap);
  }

  // Narrow prisms under the slats provide a ceiling while keeping the open
  // gaps between the canopy and its exhibit walkable.
  const registerSpan = (name, west, east, overhang, depth, lowest, highest) => {
    obstacles.push({
      name,
      theta: reservoirS(87.5) / RADIUS,
      y: reservoirY(67.45 + (west.y + east.y) / 2),
      width: east.x - west.x + overhang,
      depth: Math.abs(west.y - east.y) + depth,
      base: deckTop + Math.min(west.z, east.z) + lowest,
      height: Math.abs(west.z - east.z) + highest - lowest,
    });
  };

  // Three longitudinal purlins connecting the asymmetric ribs
  for (const [idx, t] of [[1, 0.42], [2, 0.68], [3, 0.94]]) {
    const pW = westCurve.getPoint(t);
    const pE = eastCurve.getPoint(t);
    const span = pW.distanceTo(pE) + 1.1;
    const purlin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, span, 8),
      materials.darkMetal,
    );
    purlin.name = `canopy_purlin_${idx}`;
    purlin.position.copy(pW).add(pE).multiplyScalar(0.5);
    purlin.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      pE.clone().sub(pW).normalize(),
    );
    canopyGroup.add(purlin);
    registerSpan(purlin.name, pW, pE, 1.1, 0.14, -0.1, 0.1);
  }

  // Instanced timber canopy slats resting across the twin arch ribs
  const slatCount = 10;
  const slatGeo = new THREE.BoxGeometry(1, 0.18, 0.06);
  const slatMesh = new THREE.InstancedMesh(slatGeo, materials.timber, slatCount);
  slatMesh.name = "canopy_timber_slats";
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.28);
  const sVec = new THREE.Vector3();
  const upOffset = new THREE.Vector3(0, 0, 0.12);
  for (let i = 0; i < slatCount; i++) {
    const t = 0.34 + (i / (slatCount - 1)) * 0.63;
    const pW = westCurve.getPoint(t);
    const pE = eastCurve.getPoint(t);
    const dir = pE.clone().sub(pW).normalize();
    const len = pW.distanceTo(pE) + 1.15;
    const mid = pW.clone().add(pE).multiplyScalar(0.5).add(upOffset);
    q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir).multiply(tiltQ);
    m.compose(mid, q, sVec.set(len, 1, 1));
    slatMesh.setMatrixAt(i, m);
    registerSpan(`canopy_slat_${i}`, pW, pE, 1.15, 0.21, 0.03, 0.22);
  }
  slatMesh.instanceMatrix.needsUpdate = true;
  slatMesh.computeBoundingSphere();
  canopyGroup.add(slatMesh);

  for (const [label, ribS] of [["west", 84.4], ["east", 90.6]]) {
    obstacles.push({
      name: `canopy_rib_footing_${label}`,
      theta: reservoirS(ribS) / RADIUS,
      y: reservoirY(67.48),
      width: 0.44,
      depth: 0.44,
      height: 2.6,
      base: deckTop,
    });
  }

  // South exhibit wall & interpretive panel (top h=2.69 < 2.7)
  addCivicSolid(parent, materials.tealMetal, obstacles, reservoirS(87.5), reservoirY(67.72),
    4.8, 0.22, 1.45, deckTop).name = "exhibit_wall";
  obstacles[obstacles.length - 1].name = "exhibit_wall";

  addSurfaceBox(parent, materials.brass, reservoirS(87.5), reservoirY(67.72),
    4.88, 0.28, 0.04, deckTop + 1.45).name = "exhibit_wall_cap";

  const exhibitMat = createSignMaterial(
    "STILLWATER LENS  ·  HABITAT OPTICS",
    "CURVED HORIZON & SUNLINE",
    [
      "Looking west, the 360 m cylinder curves smoothly upward,",
      "lifting the balancing basin and Sunline into one frame.",
    ],
    { width: 1536, height: 420 },
  );
  addOrientedPanel(
    parent,
    exhibitMat,
    surfacePos(reservoirS(87.5) / RADIUS, reservoirY(67.85), deckTop + 0.88),
    "north",
    4.5,
    1.15,
  ).name = "stillwater_lens_exhibit_panel";

  // Tactile cylinder cross-section & lens pedestal under the slatted canopy
  const pedGroup = new THREE.Group();
  pedGroup.name = "stillwater_lens_tactile_model";
  placeSurfaceGroup(pedGroup, 87.5, 68.85, deckTop);
  parent.add(pedGroup);

  const pedBase = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.72, 0.86), materials.step);
  pedBase.name = "tactile_pedestal_base";
  pedBase.position.set(0, 0, 0.43);
  pedGroup.add(pedBase);

  const pedCap = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.78, 0.06), materials.brass);
  pedCap.name = "tactile_pedestal_cap";
  pedCap.position.set(0, 0, 0.89);
  pedGroup.add(pedCap);

  const hullRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.025, 10, 24).rotateX(Math.PI / 2),
    materials.tealMetal,
  );
  hullRing.name = "tactile_hull_ring";
  hullRing.position.set(-0.22, 0, 1.18);
  pedGroup.add(hullRing);

  const lensModel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.04, 18).rotateX(Math.PI / 2),
    materials.glass,
  );
  lensModel.name = "tactile_lens_disc";
  lensModel.position.set(0.28, 0, 1.14);
  pedGroup.add(lensModel);

  obstacles.push({
    name: "stillwater_lens_tactile_pedestal",
    theta: reservoirS(87.5) / RADIUS,
    y: reservoirY(68.85),
    width: 1.36,
    depth: 0.78,
    height: 1.32,
    base: deckTop,
  });
}

function buildStepsAndRails(parent, materials, obstacles) {
  const { deck } = STILLWATER_LENS;
  const deckTop = deck.top;
  const deckLeft = deck.s - deck.width / 2;   // 77
  const deckRight = deck.s + deck.width / 2; // 93
  const deckSouth = deck.y - deck.depth / 2; // 67
  const deckNorth = deck.y + deck.depth / 2; // 81

  const solid = (name, mat, s, y, w, d, h, base = 0) => {
    const mesh = addCivicSolid(parent, mat, obstacles, reservoirS(s), reservoirY(y), w, d, h, base);
    mesh.name = name;
    obstacles[obstacles.length - 1].name = name;
    return mesh;
  };
  const block = (name, mat, s, y, w, d, h, base = 0) => {
    const mesh = addCivicBlock(parent, mat, reservoirS(s), reservoirY(y), w, d, h, base);
    mesh.name = name;
    return mesh;
  };
  const box = (name, mat, s, y, w, d, h, base = 0) => {
    const mesh = addSurfaceBox(parent, mat, reservoirS(s), reservoirY(y), w, d, h, base);
    mesh.name = name;
    return mesh;
  };

  // Six shallow steps (< 0.2 m per rise) climbing west from s=99 to deck edge s=93
  const stepCount = 6;
  const stepRise = deckTop / (stepCount + 1);
  const stairWidth = 4.6;
  for (let i = 0; i < stepCount; i++) {
    solid(
      `lens_east_step_${i + 1}`,
      materials.step,
      98.5 - i,
      deck.y,
      1.0,
      stairWidth,
      (i + 1) * stepRise,
      0,
    );
  }

  // Stepped stair cheek curbs & low side rails leaving 4.6 m center opening clear
  for (const [sideName, cheekY] of [["south", deck.y - 2.44], ["north", deck.y + 2.44]]) {
    for (let seg = 0; seg < 3; seg++) {
      const segS = 98.0 - seg * 2.0;
      const topH = 0.90 + seg * 0.48;
      block(`stair_cheek_${sideName}_${seg + 1}`, materials.tealMetal, segS, cheekY, 2.0, 0.22, topH, 0);
      box(`stair_cheek_cap_${sideName}_${seg + 1}`, materials.brass, segS, cheekY, 2.04, 0.26, 0.06, topH);
      obstacles.push({
        name: `stair_cheek_collider_${sideName}_${seg + 1}`,
        theta: reservoirS(segS) / RADIUS,
        y: reservoirY(cheekY),
        width: 2,
        depth: 0.26,
        height: topH + 0.06,
        base: 0,
      });
    }
  }

  // Perimeter railings (all h <= 2.25 < 2.7; east rail opens cleanly at y74 stair portal)
  const addRailRun = (name, s, y, w, d, postCoords) => {
    block(`${name}_curb`, materials.step, s, y, w, d, 0.12, deckTop);
    block(`${name}_mid`, materials.tealMetal, s, y, w > d ? w - 0.12 : 0.08, d > w ? d - 0.12 : 0.08, 0.06, deckTop + 0.50);
    block(`${name}_top`, materials.brass, s, y, w > d ? w : 0.14, d > w ? d : 0.14, 0.09, deckTop + 0.96);
    postCoords.forEach(([ps, py], idx) => {
      box(`${name}_post_${idx + 1}`, materials.tealMetal, ps, py, 0.12, 0.12, 0.96, deckTop);
    });
    obstacles.push({
      name: `${name}_collider`,
      theta: reservoirS(s) / RADIUS,
      y: reservoirY(y),
      width: Math.max(w, 0.26),
      depth: Math.max(d, 0.26),
      height: 1.05,
      base: deckTop,
    });
  };

  const wS = deckLeft + 0.18;
  const eS = deckRight - 0.18;
  const sY = deckSouth + 0.18;
  const nY = deckNorth - 0.18;

  addRailRun("west_rail", wS, deck.y, 0.24, deck.depth - 0.12, [
    [wS, sY], [wS, sY + 2.27], [wS, sY + 4.54], [wS, deck.y], [wS, nY - 4.54], [wS, nY - 2.27], [wS, nY],
  ]);
  addRailRun("north_rail", deck.s, nY, deck.width - 0.12, 0.24, [
    [79.8, nY], [82.4, nY], [85.0, nY], [87.6, nY], [90.2, nY], [eS, nY],
  ]);
  addRailRun("south_rail", deck.s, sY, deck.width - 0.12, 0.24, [
    [79.8, sY], [82.4, sY], [85.0, sY], [87.6, sY], [90.2, sY], [eS, sY],
  ]);
  addRailRun("east_south_rail", eS, 69.37, 0.24, 4.62, [
    [eS, 69.45], [eS, 71.56],
  ]);
  addRailRun("east_north_rail", eS, 78.63, 0.24, 4.62, [
    [eS, 76.44], [eS, 78.55],
  ]);
}

function buildSeatingAndSignage(parent, materials, obstacles) {
  const deckTop = STILLWATER_LENS.deck.top;
  const box = (name, mat, s, y, w, d, h, base) => {
    const mesh = addSurfaceBox(parent, mat, reservoirS(s), reservoirY(y), w, d, h, base);
    mesh.name = name;
    return mesh;
  };

  // Three timber-and-teal observatory benches (clear of central ray y=74)
  const benches = [
    ["north_west", 81.8, 79.8, 3.0],
    ["north_east", 87.8, 79.8, 3.0],
    ["south_west", 80.4, 68.4, 2.6],
  ];
  for (const [label, bs, by, bw] of benches) {
    for (const legOff of [-bw * 0.36, bw * 0.36]) {
      box(`lens_bench_${label}_leg_${legOff < 0 ? "w" : "e"}`, materials.tealMetal,
        bs + legOff, by, 0.16, 0.62, 0.42, deckTop);
    }
    for (const [idx, yOff] of [[1, -0.22], [2, 0], [3, 0.22]]) {
      box(`lens_bench_${label}_slat_${idx}`, materials.timber,
        bs, by + yOff, bw, 0.18, 0.06, deckTop + 0.42);
    }
    obstacles.push({
      name: `lens_bench_${label}_collider`,
      theta: reservoirS(bs) / RADIUS,
      y: reservoirY(by),
      width: bw,
      depth: 0.72,
      height: 0.48,
      base: deckTop,
    });
  }

  // Station floor medallion & brass centerline inlay from stair landing to s=82, y=74
  const { station } = STILLWATER_LENS;
  box("lens_walkway_inlay", materials.brass, 87.8, STILLWATER_LENS.deck.y, 9.8, 0.20, 0.015, deckTop);
  const medallion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.66, 0.02, 20).rotateX(Math.PI / 2),
    materials.brass,
  );
  medallion.name = "lens_station_medallion";
  placeSurfaceGroup(medallion, station.theta * RADIUS - reservoirS(0), station.y - reservoirY(0), station.height + 0.01);
  parent.add(medallion);

  // Approach interpretive sign beside east trail / stairs (visible walking up trail s=100)
  const approachS = 95.8;
  const approachY = 70.0;
  for (const [idx, py] of [[1, approachY - 1.0], [2, approachY + 1.0]]) {
    box(`approach_sign_post_${idx}`, materials.tealMetal, approachS, py, 0.14, 0.14, 2.24, 0);
  }
  box("approach_sign_board", materials.tealMetal, approachS, approachY, 0.12, 2.72, 1.22, 1.04);
  box("approach_sign_cap", materials.brass, approachS, approachY, 0.18, 2.80, 0.06, 2.26);
  obstacles.push({
    name: "stillwater_lens_approach_sign_collider",
    theta: reservoirS(approachS) / RADIUS,
    y: reservoirY(approachY),
    width: 0.36,
    depth: 2.76,
    height: 2.32,
    base: 0,
  });
  const approachMat = createSignMaterial(
    "STILLWATER RESERVE  ·  OBSERVATORY",
    "STILLWATER LENS",
    ["Take the steps onto the observation deck", "Press E at the telescope"],
  );
  addOrientedPanel(
    parent,
    approachMat,
    surfacePos(reservoirS(approachS + 0.08) / RADIUS, reservoirY(approachY), 1.65),
    "east",
    2.56,
    1.10,
  ).name = "stillwater_lens_approach_sign";

  // Scope station plaque (announces E at scope, h <= 2.59 < 2.7)
  const plaqueS = 81.2;
  const plaqueY = 72.4;
  for (const [idx, py] of [[1, plaqueY - 0.55], [2, plaqueY + 0.55]]) {
    box(`scope_plaque_post_${idx}`, materials.tealMetal, plaqueS, py, 0.10, 0.10, 0.62, deckTop);
  }
  box("scope_plaque_board", materials.tealMetal, plaqueS, plaqueY, 0.10, 1.60, 0.80, deckTop + 0.55);
  box("scope_plaque_cap", materials.brass, plaqueS, plaqueY, 0.14, 1.66, 0.04, deckTop + 1.35);
  obstacles.push({
    name: "stillwater_lens_scope_plaque_collider",
    theta: reservoirS(plaqueS) / RADIUS,
    y: reservoirY(plaqueY),
    width: 0.32,
    depth: 1.64,
    height: 1.40,
    base: deckTop,
  });
  const plaqueMat = createSignMaterial(
    "OPTICAL STATION",
    "PRESS E AT SCOPE",
    ["Stand on the brass marker", "Choose a view across the habitat"],
    { width: 1024, height: 480, compact: true },
  );
  addOrientedPanel(
    parent,
    plaqueMat,
    surfacePos(reservoirS(plaqueS + 0.07) / RADIUS, reservoirY(plaqueY), deckTop + 0.95),
    "east",
    1.48,
    0.70,
  ).name = "stillwater_lens_scope_plaque";
}

/**
 * Open shore observatory deck, six-step east stair, asymmetric slatted side canopy,
 * and brass/teal west-facing telescope at local (85, 74). Parent is untransformed.
 */
export function createStillwaterLensDeck(parent) {
  const group = new THREE.Group();
  group.name = "stillwater_lens_deck";
  parent.add(group);

  const obstacles = [];
  const materials = createMaterials();
  const { deck } = STILLWATER_LENS;

  const deckMesh = addCivicSolid(
    group,
    materials.deck,
    obstacles,
    reservoirS(deck.s),
    reservoirY(deck.y),
    deck.width,
    deck.depth,
    deck.top,
    0,
  );
  deckMesh.name = "stillwater_lens_deck_floor";
  obstacles[obstacles.length - 1].name = "stillwater_lens_deck_floor";

  buildStepsAndRails(group, materials, obstacles);
  buildTelescope(group, materials, obstacles);
  buildSouthCanopyAndExhibit(group, materials, obstacles);
  buildSeatingAndSignage(group, materials, obstacles);

  return { obstacles };
}
