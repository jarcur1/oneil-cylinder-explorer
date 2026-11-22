import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import {
  surfacePos,
  setSurfaceMatrix,
  addSurfacePatch,
  addOrientedPanel,
} from "./surface.js";
import { addCivicBlock, addCivicSolid } from "./civic-primitives.js";
import {
  TRAM_THETA,
  TRAM_HEIGHT,
  TRAM_STOPS,
  TRAM_TRACK_MIN_Y,
  TRAM_TRACK_MAX_Y,
  TRAM_GANTRY_YS,
  TRAM_CAR_WIDTH,
  TRAM_CAR_LENGTH,
  TRAM_CAR_HEIGHT,
  TRAM_GANTRY_ARC,
  TRAM_GANTRY_COLUMN_SIZE,
  TRAM_PLATFORM_ARC,
  TRAM_PLATFORM_WIDTH,
  TRAM_PLATFORM_LENGTH,
  TRAM_PLATFORM_BASE,
  AXIAL_TRAM_LINE,
  STILLWATER_TRAM_MIN_S,
  STILLWATER_TRAM_MAX_S,
  STILLWATER_TRAM_Y,
} from "./tram-layout.js";
import { createTramState } from "./tram-state.js";

function stopNames(line) {
  return new Map(line.stops.map((stop) => [stop.id, stop.name]));
}

const DOOR_SLIDE_DISTANCE = 0.62;
const DOOR_CLOSE_WINDOW = 0.35;
const WHEEL_RADIUS = 0.28;

let sharedTramMaterials;

function countdown(seconds) {
  const whole = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(whole / 60).toString().padStart(2, "0")}:${(whole % 60).toString().padStart(2, "0")}`;
}

function createStationDisplay(stop, line, names, wide = false) {
  const canvas = document.createElement("canvas");
  canvas.width = wide ? 1024 : 512;
  canvas.height = 224;
  const ctx = canvas.getContext("2d");
  ctx.scale(canvas.width / 512, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  let lastSeconds = -1;
  let lastDocked;
  let lastBoarding;
  let lastDirection;
  let lastDestination;

  function repaint(status) {
    const seconds = Math.ceil(status.docked ? status.departureIn : status.arrivalIn);
    if (
      seconds === lastSeconds &&
      status.docked === lastDocked &&
      status.boardingOpen === lastBoarding &&
      status.direction === lastDirection &&
      status.destinationStationId === lastDestination
    ) return;
    lastSeconds = seconds;
    lastDocked = status.docked;
    lastBoarding = status.boardingOpen;
    lastDirection = status.direction;
    lastDestination = status.destinationStationId;
    ctx.fillStyle = "#112829";
    ctx.fillRect(0, 0, 512, 224);
    ctx.strokeStyle = status.boardingOpen ? "#d5f58e" : "#5eead4";
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 208);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f5f1e3";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText(line.axis === "theta" ? `${line.title} · ${stop.name.toUpperCase()}` : stop.name.toUpperCase(), 24, 45, 464);
    ctx.fillStyle = "#fcd34d";
    ctx.font = "bold 24px monospace";
    const destination = names.get(status.destinationStationId);
    const direction = status.direction > 0 ? line.directionLabels.forward : line.directionLabels.reverse;
    ctx.fillText(line.axis === "theta" ? `TO ${destination.toUpperCase()} · ${direction.toUpperCase()}` : `TO ${destination.toUpperCase()}`, 24, 89, 464);
    ctx.fillStyle = status.boardingOpen ? "#d5f58e" : "#ffffff";
    ctx.font = "bold 28px monospace";
    const service = !status.docked
      ? `ARRIVES IN ${countdown(status.arrivalIn)}`
      : status.boardingOpen
        ? `DEPARTS IN ${countdown(status.departureIn)}`
        : "DOORS CLOSING";
    ctx.fillText(service, 24, 139, 464);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "18px monospace";
    ctx.fillText(
      status.boardingOpen
        ? "STAND ON PAD · [E] BOARD"
        : status.docked
          ? "WAIT FOR NEXT SERVICE"
          : `${(status.direction > 0 ? line.directionLabels.forward : line.directionLabels.reverse).toUpperCase()} · DECK 13m`,
      24, 187, 464,
    );
    texture.needsUpdate = true;
  }
  return { material, repaint };
}

function createBoardingPadMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#123b3c";
  ctx.fillRect(0, 0, 512, 768);
  ctx.strokeStyle = "#d5f58e";
  ctx.lineWidth = 24;
  ctx.strokeRect(18, 18, 476, 732);
  ctx.fillStyle = "#f5f1e3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 82px monospace";
  ctx.fillText("TRAM", 256, 147);
  ctx.font = "bold 280px monospace";
  ctx.fillText("E", 256, 397);
  ctx.font = "bold 48px monospace";
  ctx.fillText("WAIT HERE", 256, 639);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture });
}

function createDestinationDisplay(line, names) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture });

  let lastPhase;
  let lastStation;
  let lastNext;
  let lastDirection;

  function repaint(tramState) {
    if (
      tramState.phase === lastPhase &&
      tramState.stationId === lastStation &&
      tramState.nextStationId === lastNext &&
      tramState.direction === lastDirection
    ) return;
    lastPhase = tramState.phase;
    lastStation = tramState.stationId;
    lastNext = tramState.nextStationId;
    lastDirection = tramState.direction;

    ctx.fillStyle = "#0b1719";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 5;
    ctx.strokeRect(5, 5, 502, 118);

    const dirLabel = tramState.direction >= 0
      ? `${line.directionLabels.forward.toUpperCase()} ${line.axis === "theta" ? "→" : "↑"}`
      : `${line.directionLabels.reverse.toUpperCase()} ${line.axis === "theta" ? "←" : "↓"}`;
    const nextName = names.get(tramState.nextStationId) ?? "TERMINAL";

    ctx.fillStyle = "#134e4a";
    ctx.fillRect(14, 14, 484, 34);

    ctx.fillStyle = "#99f6e4";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (line.axis === "theta") ctx.fillText(line.title, 24, 31, 280);
    else ctx.fillText(line.title, 24, 31);

    ctx.fillStyle = "#fcd34d";
    ctx.textAlign = "right";
    ctx.fillText(dirLabel, 488, 31);

    ctx.textAlign = "left";
    const destination = names.get(tramState.destinationStationId);
    ctx.fillStyle = "#fef3c7";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText(`TO: ${destination.toUpperCase()}`, 22, 73, 468);
    ctx.fillStyle = "#5eead4";
    ctx.font = "bold 16px monospace";
    const position = tramState.phase === "dwell"
      ? `AT ${names.get(tramState.stationId).toUpperCase()}`
      : "IN TRANSIT";
    ctx.fillText(`${position} · NEXT: ${nextName.toUpperCase()}`, 22, 105, 468);

    texture.needsUpdate = true;
  }

  return { material, repaint };
}

function createStillwaterInfrastructure(parent, mats, obstacles, line, names, displays) {
  const track = new THREE.Group();
  track.name = "stillwater_tram_track";
  parent.add(track);
  const start = STILLWATER_TRAM_MIN_S;
  const end = STILLWATER_TRAM_MAX_S;
  const center = (start + end) / 2;
  const length = end - start;
  addCivicSolid(track, mats.railGirder, obstacles, center, STILLWATER_TRAM_Y, length, 0.44, 0.28, 11.7);
  for (const offset of [-0.85, 0.85]) {
    addCivicSolid(track, mats.railGirder, obstacles, center, STILLWATER_TRAM_Y + offset, length, 0.24, 0.38, 11.7);
    addCivicSolid(track, mats.railSteel, obstacles, center, STILLWATER_TRAM_Y + offset, length, 0.12, 0.12, 12.08);
  }
  for (let s = start + 2; s <= end - 2; s += 4) {
    addCivicBlock(track, mats.gantrySteel, s, STILLWATER_TRAM_Y, 0.24, 2.05, 0.16, 11.76);
  }
  for (const s of [start + 0.35, end - 0.35]) {
    addCivicSolid(track, mats.safetyYellow, obstacles, s, STILLWATER_TRAM_Y, 0.55, 2.2, 1.05, 11.7);
  }

  const gantries = new THREE.Group();
  gantries.name = "stillwater_tram_gantries";
  parent.add(gantries);
  const gantryPositions = [start + 0.5, end - 0.5];
  for (let s = start + 18; s <= end; s += 36) {
    if (!line.stops.some((stop) => Math.abs(s - stop.trackTheta * RADIUS) <= 7)) gantryPositions.push(s);
  }
  for (const s of gantryPositions) {
    for (const side of [-1, 1]) {
      const y = STILLWATER_TRAM_Y + side * TRAM_GANTRY_ARC;
      addCivicBlock(gantries, mats.gantrySteel, s, y, TRAM_GANTRY_COLUMN_SIZE, TRAM_GANTRY_COLUMN_SIZE, 11.65, 0.35);
      obstacles.push({ theta: s / RADIUS, y, width: TRAM_GANTRY_COLUMN_SIZE, depth: TRAM_GANTRY_COLUMN_SIZE, height: 12, base: 0 });
      addCivicBlock(gantries, mats.gantryPlinth, s, y, TRAM_GANTRY_COLUMN_SIZE, TRAM_GANTRY_COLUMN_SIZE, 0.35, 0);
    }
    addCivicSolid(gantries, mats.gantrySteel, obstacles, s, STILLWATER_TRAM_Y, 0.65, TRAM_GANTRY_ARC * 2 + TRAM_GANTRY_COLUMN_SIZE, 0.5, 11.2);
  }

  const stations = new THREE.Group();
  stations.name = "stillwater_tram_stations";
  parent.add(stations);
  for (const stop of line.stops) {
    const station = new THREE.Group();
    station.name = `stillwater_tram_station_${stop.id}`;
    stations.add(station);
    const s = stop.trackTheta * RADIUS;
    const platformY = STILLWATER_TRAM_Y - TRAM_PLATFORM_ARC;
    // Civic arc lengths are measured at the hull, while the car sits at deck height.
    const arcScale = RADIUS / (RADIUS - TRAM_HEIGHT);
    const platformLength = TRAM_PLATFORM_LENGTH * arcScale;
    addSurfacePatch(station, mats.padSlate, s, stop.y, 3.2, 2.4, 0.028);
    addSurfacePatch(station, mats.padTealBorder, s, stop.y, 2.8, 2, 0.032);
    const pad = addSurfacePatch(station, mats.padCenter, s, stop.y, 2.4, 1.6, 0.036);
    const rows = pad.geometry.getAttribute("position").count / 2;
    const uv = new Float32Array(rows * 4);
    for (let row = 0; row < rows; row++) {
      const u = row / (rows - 1);
      uv.set([u, 0, u, 1], row * 4);
    }
    pad.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const mastY = STILLWATER_TRAM_Y - 4.4;
    addCivicSolid(station, mats.gantrySteel, obstacles, s, mastY, 0.35, 0.35, TRAM_PLATFORM_BASE - 0.24, 0.24);
    addCivicSolid(station, mats.gantryPlinth, obstacles, s, mastY, 0.48, 0.48, 0.24, 0);
    addCivicSolid(station, mats.platformDeck, obstacles, s, platformY, platformLength, TRAM_PLATFORM_WIDTH, TRAM_HEIGHT - TRAM_PLATFORM_BASE, TRAM_PLATFORM_BASE);
    addCivicBlock(station, mats.safetyYellow, s, platformY + TRAM_PLATFORM_WIDTH / 2 - 0.14, platformLength, 0.24, 0.03, TRAM_HEIGHT);
    addCivicSolid(station, mats.railingsTeal, obstacles, s, platformY - TRAM_PLATFORM_WIDTH / 2 + 0.08, platformLength, 0.16, 1.15, TRAM_HEIGHT);
    for (const offset of [-TRAM_PLATFORM_LENGTH / 2 + 0.08, TRAM_PLATFORM_LENGTH / 2 - 0.08]) {
      addCivicSolid(station, mats.railingsTeal, obstacles, s + offset * arcScale, platformY, 0.16 * arcScale, TRAM_PLATFORM_WIDTH, 1.15, TRAM_HEIGHT);
    }
    for (const offset of [-3.25, 0, 3.25]) {
      addCivicSolid(station, mats.railingsTeal, obstacles, s + offset * arcScale, platformY + TRAM_PLATFORM_WIDTH / 2 - 0.08, 1.5 * arcScale, 0.14, 1.15, TRAM_HEIGHT);
    }
    for (const offset of [-3.4, 3.4]) {
      addCivicSolid(station, mats.gantrySteel, obstacles, s + offset * arcScale, platformY - TRAM_PLATFORM_WIDTH / 2 + 0.14, 0.18 * arcScale, 0.18, 2.8, TRAM_HEIGHT);
    }
    addCivicSolid(station, mats.canopyRoof, obstacles, s, platformY - 0.1, (TRAM_PLATFORM_LENGTH + 0.4) * arcScale, TRAM_PLATFORM_WIDTH + 0.1, 0.18, TRAM_HEIGHT + 2.8);
    const plaque = createStationDisplay(stop, line, names);
    const banner = createStationDisplay(stop, line, names, true);
    displays.push({ id: stop.id, status: {}, plaque, banner });
    addOrientedPanel(station, plaque.material, surfacePos(stop.trackTheta, mastY + 0.19, 2.4), "north", 1.5, 0.66);
    addOrientedPanel(station, banner.material, surfacePos(stop.trackTheta, platformY + TRAM_PLATFORM_WIDTH / 2, TRAM_HEIGHT + 2.38), "north", 4.8, 0.95);
  }
}

export function createTram(parent, line = AXIAL_TRAM_LINE) {
  const state = createTramState(line);
  const names = stopNames(line);
  const obstacles = [];

  const tramGroup = new THREE.Group();
  tramGroup.name = line.sceneName;
  parent.add(tramGroup);

  const staticMats = sharedTramMaterials ??= {
    gantrySteel: new THREE.MeshStandardMaterial({
      color: 0x2c3b42,
      roughness: 0.56,
      metalness: 0.55,
    }),
    gantryPlinth: new THREE.MeshStandardMaterial({
      color: 0x5c6062,
      roughness: 0.85,
      metalness: 0.12,
    }),
    railGirder: new THREE.MeshStandardMaterial({
      color: 0x384952,
      roughness: 0.5,
      metalness: 0.62,
    }),
    railSteel: new THREE.MeshStandardMaterial({
      color: 0xaab7be,
      roughness: 0.28,
      metalness: 0.85,
    }),
    platformDeck: new THREE.MeshStandardMaterial({
      color: 0x6b7275,
      roughness: 0.78,
      metalness: 0.15,
    }),
    safetyYellow: new THREE.MeshStandardMaterial({
      color: 0xd99b26,
      roughness: 0.48,
      metalness: 0.18,
    }),
    railingsTeal: new THREE.MeshStandardMaterial({
      color: 0x286663,
      roughness: 0.42,
      metalness: 0.48,
    }),
    canopyRoof: new THREE.MeshStandardMaterial({
      color: 0x224b4d,
      roughness: 0.52,
      metalness: 0.3,
    }),
    padSlate: new THREE.MeshStandardMaterial({
      color: 0x3b4448,
      roughness: 0.86,
      metalness: 0.08,
    }),
    padTealBorder: new THREE.MeshStandardMaterial({
      color: 0x1e7a72,
      roughness: 0.65,
      metalness: 0.18,
    }),
    padCenter: createBoardingPadMaterial(),
    // Carriage materials
    carChassis: new THREE.MeshStandardMaterial({
      color: 0x222a2f,
      roughness: 0.6,
      metalness: 0.65,
    }),
    carCream: new THREE.MeshStandardMaterial({
      color: 0xf0e9d8,
      roughness: 0.48,
      metalness: 0.12,
    }),
    carTeal: new THREE.MeshStandardMaterial({
      color: 0x1b5658,
      roughness: 0.42,
      metalness: 0.28,
    }),
    carTrimBrass: new THREE.MeshStandardMaterial({
      color: 0xd49b35,
      roughness: 0.32,
      metalness: 0.72,
    }),
    carFloorDeck: new THREE.MeshStandardMaterial({
      color: 0x343b3f,
      roughness: 0.82,
      metalness: 0.12,
    }),
    carAisleStrip: new THREE.MeshStandardMaterial({
      color: 0x4b555a,
      roughness: 0.85,
      metalness: 0.08,
    }),
    carCeiling: new THREE.MeshStandardMaterial({
      color: 0xe8e2d3,
      roughness: 0.7,
      metalness: 0.05,
    }),
    carSeatFabric: new THREE.MeshStandardMaterial({
      color: 0x256965,
      roughness: 0.8,
      metalness: 0.05,
    }),
    carSeatWood: new THREE.MeshStandardMaterial({
      color: 0x7c5434,
      roughness: 0.72,
      metalness: 0.08,
    }),
    carGlass: new THREE.MeshLambertMaterial({
      color: 0xa6dce6,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    cabinLightStrip: new THREE.MeshBasicMaterial({
      color: 0xfff6dc,
    }),
    headlightMat: new THREE.MeshBasicMaterial({
      color: 0xfff6dc,
    }),
    taillightMat: new THREE.MeshBasicMaterial({
      color: 0xe11d48,
    }),
  };
  const mats = {
    ...staticMats,
    doorStatusMat: new THREE.MeshBasicMaterial({ color: 0x22c55e }),
  };
  const stationDisplays = [];
  if (line.axis === "y") {

  const trackArcCenter = TRAM_THETA * RADIUS;
  const trackLen = TRAM_TRACK_MAX_Y - TRAM_TRACK_MIN_Y;
  const trackCenterY = (TRAM_TRACK_MIN_Y + TRAM_TRACK_MAX_Y) / 2;

  // =========================================================================
  // 1. ELEVATED GUIDEWAY & RAILS (underside 11.7m, rail top 12.2m)
  // =========================================================================
  const trackGroup = new THREE.Group();
  trackGroup.name = "tram_track";
  tramGroup.add(trackGroup);

  // Central guideway spine beam (11.70 .. 11.98)
  addCivicBlock(
    trackGroup,
    mats.railGirder,
    trackArcCenter,
    trackCenterY,
    0.44,
    trackLen,
    0.28,
    11.7,
  );

  // Twin longitudinal rail girders + running rail heads at s = +-0.85
  for (const railOffset of [-0.85, 0.85]) {
    addCivicBlock(
      trackGroup,
      mats.railGirder,
      trackArcCenter + railOffset,
      trackCenterY,
      0.24,
      trackLen,
      0.38,
      11.7,
    );
    addCivicBlock(
      trackGroup,
      mats.railSteel,
      trackArcCenter + railOffset,
      trackCenterY,
      0.12,
      trackLen,
      0.12,
      12.08,
    );
  }

  // Instanced sleepers / cross-ties along the guideway
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sleeperStep = 4.0;
  const sleeperYs = [];
  for (
    let sy = TRAM_TRACK_MIN_Y + 2;
    sy <= TRAM_TRACK_MAX_Y - 2;
    sy += sleeperStep
  ) {
    sleeperYs.push(sy);
  }
  const sleepersMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.gantrySteel,
    sleeperYs.length,
  );
  const tempMatrix = new THREE.Matrix4();
  for (let i = 0; i < sleeperYs.length; i++) {
    setSurfaceMatrix(
      tempMatrix,
      TRAM_THETA,
      sleeperYs[i],
      11.76,
      2.05,
      0.24,
      0.16,
    );
    sleepersMesh.setMatrixAt(i, tempMatrix);
  }
  sleepersMesh.instanceMatrix.needsUpdate = true;
  sleepersMesh.computeBoundingBox();
  sleepersMesh.computeBoundingSphere();
  trackGroup.add(sleepersMesh);

  // End-of-track buffer stops
  for (const bufferY of [TRAM_TRACK_MIN_Y + 0.35, TRAM_TRACK_MAX_Y - 0.35]) {
    addCivicBlock(
      trackGroup,
      mats.safetyYellow,
      trackArcCenter,
      bufferY,
      2.2,
      0.55,
      1.05,
      11.7,
    );
  }

  // Raised guideway static collider (leaves ground completely unobstructed)
  obstacles.push({
    theta: TRAM_THETA,
    y: trackCenterY,
    width: 2.0,
    depth: trackLen,
    base: 11.7,
    height: 0.5,
  });

  // =========================================================================
  // 2. INSTANCED GANTRY SUPPORTS (TRAM_GANTRY_YS, columns at s = +-5.2)
  // =========================================================================
  const gantryGroup = new THREE.Group();
  gantryGroup.name = "tram_gantries";
  tramGroup.add(gantryGroup);

  const gantryCount = TRAM_GANTRY_YS.length;
  const columnHeight = 12.0;
  const crossbeamWidth = TRAM_GANTRY_ARC * 2 + TRAM_GANTRY_COLUMN_SIZE;
  const crossbeamDepth = 0.65;
  const crossbeamBase = 11.2;
  const crossbeamHeight = 0.5;

  const gantryColumnsMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.gantrySteel,
    gantryCount * 2,
  );
  const gantryPlinthsMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.gantryPlinth,
    gantryCount * 2,
  );
  const gantryCrossbeamsMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.gantrySteel,
    gantryCount,
  );
  const gantryGussetsMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.gantrySteel,
    gantryCount * 2,
  );

  for (let i = 0; i < gantryCount; i++) {
    const gy = TRAM_GANTRY_YS[i];
    const westTheta = (trackArcCenter - TRAM_GANTRY_ARC) / RADIUS;
    const eastTheta = (trackArcCenter + TRAM_GANTRY_ARC) / RADIUS;

    // West & East vertical columns (s = +-5.2, 0.6 x 0.6 x 12.0 total; preserves 0.1m bakery awning gap at y = -496)
    setSurfaceMatrix(
      tempMatrix,
      westTheta,
      gy,
      0.35,
      TRAM_GANTRY_COLUMN_SIZE,
      TRAM_GANTRY_COLUMN_SIZE,
      columnHeight - 0.35,
    );
    gantryColumnsMesh.setMatrixAt(i * 2, tempMatrix);

    setSurfaceMatrix(
      tempMatrix,
      eastTheta,
      gy,
      0.35,
      TRAM_GANTRY_COLUMN_SIZE,
      TRAM_GANTRY_COLUMN_SIZE,
      columnHeight - 0.35,
    );
    gantryColumnsMesh.setMatrixAt(i * 2 + 1, tempMatrix);

    // Base plinth shoes (exact 0.6 x 0.6 footprint)
    setSurfaceMatrix(
      tempMatrix,
      westTheta,
      gy,
      0,
      TRAM_GANTRY_COLUMN_SIZE,
      TRAM_GANTRY_COLUMN_SIZE,
      0.35,
    );
    gantryPlinthsMesh.setMatrixAt(i * 2, tempMatrix);

    setSurfaceMatrix(
      tempMatrix,
      eastTheta,
      gy,
      0,
      TRAM_GANTRY_COLUMN_SIZE,
      TRAM_GANTRY_COLUMN_SIZE,
      0.35,
    );
    gantryPlinthsMesh.setMatrixAt(i * 2 + 1, tempMatrix);
    // Overhead crossbeam supporting rail underside at 11.7m
    setSurfaceMatrix(
      tempMatrix,
      TRAM_THETA,
      gy,
      crossbeamBase,
      crossbeamWidth,
      crossbeamDepth,
      crossbeamHeight,
    );
    gantryCrossbeamsMesh.setMatrixAt(i, tempMatrix);

    // High upper knee gussets (h >= 10.65m, zero low diagonal braces)
    setSurfaceMatrix(
      tempMatrix,
      (trackArcCenter - (TRAM_GANTRY_ARC - 0.65)) / RADIUS,
      gy,
      10.65,
      0.7,
      0.4,
      0.55,
    );
    gantryGussetsMesh.setMatrixAt(i * 2, tempMatrix);

    setSurfaceMatrix(
      tempMatrix,
      (trackArcCenter + (TRAM_GANTRY_ARC - 0.65)) / RADIUS,
      gy,
      10.65,
      0.7,
      0.4,
      0.55,
    );
    gantryGussetsMesh.setMatrixAt(i * 2 + 1, tempMatrix);

    // Static column & crossbeam colliders
    obstacles.push(
      {
        theta: westTheta,
        y: gy,
        width: TRAM_GANTRY_COLUMN_SIZE,
        depth: TRAM_GANTRY_COLUMN_SIZE,
        base: 0,
        height: columnHeight,
      },
      {
        theta: eastTheta,
        y: gy,
        width: TRAM_GANTRY_COLUMN_SIZE,
        depth: TRAM_GANTRY_COLUMN_SIZE,
        base: 0,
        height: columnHeight,
      },
      {
        theta: TRAM_THETA,
        y: gy,
        width: crossbeamWidth,
        depth: crossbeamDepth,
        base: crossbeamBase,
        height: crossbeamHeight,
      },
    );
  }

  for (const inst of [
    gantryColumnsMesh,
    gantryPlinthsMesh,
    gantryCrossbeamsMesh,
    gantryGussetsMesh,
  ]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingBox();
    inst.computeBoundingSphere();
    gantryGroup.add(inst);
  }

  // =========================================================================
  // 3. FIVE ELEVATED TRAM STATIONS & CLEAR GROUND BOARDING PADS
  // =========================================================================
  const stationsGroup = new THREE.Group();
  stationsGroup.name = "tram_stations";
  tramGroup.add(stationsGroup);

  const mastArc = 4.4;
  const mastSize = 0.35;
  const deckThickness = TRAM_HEIGHT - TRAM_PLATFORM_BASE;
  const guardrailHeight = 1.15;

  for (const stop of TRAM_STOPS) {
    const stationGroup = new THREE.Group();
    stationGroup.name = `tram_station_${stop.id}`;
    stationsGroup.add(stationGroup);

    const stopArc = stop.theta * RADIUS;

    // Non-solid painted ground boarding pad (h ~ 0.03m), leaving >= 1m radius clear around exit
    addSurfacePatch(stationGroup, mats.padSlate, stopArc, stop.y, 2.4, 3.2, 0.028);
    addSurfacePatch(
      stationGroup,
      mats.padTealBorder,
      stopArc,
      stop.y,
      2.0,
      2.8,
      0.032,
    );
    const paintedPad = addSurfacePatch(stationGroup, mats.padCenter, stopArc, stop.y, 1.6, 2.4, 0.036);
    const rows = paintedPad.geometry.getAttribute("position").count / 2;
    const uv = new Float32Array(rows * 4);
    for (let row = 0; row < rows; row++) {
      const u = row / (rows - 1);
      uv.set([u, 0, u, 1], row * 4);
    }
    paintedPad.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    // Slender platform support mast at s = 4.4 (clears exit s = 2.7 and civic lamps s = 6.8)
    addCivicSolid(
      stationGroup,
      mats.gantrySteel,
      obstacles,
      mastArc,
      stop.y,
      mastSize,
      mastSize,
      TRAM_PLATFORM_BASE,
      0,
    );
    addCivicBlock(
      stationGroup,
      mats.gantryPlinth,
      mastArc,
      stop.y,
      0.48,
      0.48,
      0.24,
      0,
    );
    // High cantilever support beam under the elevated deck
    addCivicBlock(
      stationGroup,
      mats.gantrySteel,
      TRAM_PLATFORM_ARC,
      stop.y,
      TRAM_PLATFORM_WIDTH,
      0.45,
      0.45,
      TRAM_PLATFORM_BASE - 0.45,
    );

    // Mast-mounted boarding plaque (attached to mast at s = 4.21, no separate ground signpost)
    const plaque = createStationDisplay(stop, line, names);
    const banner = createStationDisplay(stop, line, names, true);
    stationDisplays.push({ id: stop.id, status: {}, plaque, banner });
    addOrientedPanel(
      stationGroup,
      plaque.material,
      surfacePos(4.21 / RADIUS, stop.y, 2.4),
      "west",
      1.5,
      0.66,
    );

    // Elevated platform deck (center s = 3.8, width 2.4, length 8, base 12.65, top 13.0)
    addCivicSolid(
      stationGroup,
      mats.platformDeck,
      obstacles,
      TRAM_PLATFORM_ARC,
      stop.y,
      TRAM_PLATFORM_WIDTH,
      TRAM_PLATFORM_LENGTH,
      deckThickness,
      TRAM_PLATFORM_BASE,
    );

    // Tactile yellow warning edge along trackside platform lip
    addCivicBlock(
      stationGroup,
      mats.safetyYellow,
      TRAM_PLATFORM_ARC - TRAM_PLATFORM_WIDTH / 2 + 0.14,
      stop.y,
      0.24,
      TRAM_PLATFORM_LENGTH,
      0.03,
      TRAM_HEIGHT,
    );

    // Proper high guardrails on outer East, North, South edges (base 13.0 .. 14.15)
    addCivicSolid(
      stationGroup,
      mats.railingsTeal,
      obstacles,
      TRAM_PLATFORM_ARC + TRAM_PLATFORM_WIDTH / 2 - 0.08,
      stop.y,
      0.16,
      TRAM_PLATFORM_LENGTH,
      guardrailHeight,
      TRAM_HEIGHT,
    );
    addCivicSolid(
      stationGroup,
      mats.railingsTeal,
      obstacles,
      TRAM_PLATFORM_ARC,
      stop.y - TRAM_PLATFORM_LENGTH / 2 + 0.08,
      TRAM_PLATFORM_WIDTH,
      0.16,
      guardrailHeight,
      TRAM_HEIGHT,
    );
    addCivicSolid(
      stationGroup,
      mats.railingsTeal,
      obstacles,
      TRAM_PLATFORM_ARC,
      stop.y + TRAM_PLATFORM_LENGTH / 2 - 0.08,
      TRAM_PLATFORM_WIDTH,
      0.16,
      guardrailHeight,
      TRAM_HEIGHT,
    );

    // Trackside safety screens flanking the two 1.4m boarding door bays (y +- 1.6)
    const screenEdgeS = TRAM_PLATFORM_ARC - TRAM_PLATFORM_WIDTH / 2 + 0.08;
    for (const [screenY, screenDepth] of [
      [stop.y - 3.25, 1.5],
      [stop.y, 1.5],
      [stop.y + 3.25, 1.5],
    ]) {
      addCivicSolid(
        stationGroup,
        mats.railingsTeal,
        obstacles,
        screenEdgeS,
        screenY,
        0.14,
        screenDepth,
        guardrailHeight,
        TRAM_HEIGHT,
      );
    }

    // Elevated canopy stanchions & roof (h = 13.0 .. 15.98)
    for (const postY of [stop.y - 3.4, stop.y + 3.4]) {
      addCivicSolid(
        stationGroup,
        mats.gantrySteel,
        obstacles,
        TRAM_PLATFORM_ARC + TRAM_PLATFORM_WIDTH / 2 - 0.14,
        postY,
        0.18,
        0.18,
        2.8,
        TRAM_HEIGHT,
      );
    }
    addCivicSolid(
      stationGroup,
      mats.canopyRoof,
      obstacles,
      TRAM_PLATFORM_ARC + 0.1,
      stop.y,
      TRAM_PLATFORM_WIDTH + 0.1,
      TRAM_PLATFORM_LENGTH + 0.4,
      0.18,
      TRAM_HEIGHT + 2.8,
    );

    // Elevated station nameboards (shared CanvasTexture material per station)
    const bannerMat = banner.material;
    addOrientedPanel(
      stationGroup,
      bannerMat,
      surfacePos((TRAM_PLATFORM_ARC - TRAM_PLATFORM_WIDTH / 2) / RADIUS, stop.y, TRAM_HEIGHT + 2.38),
      "west",
      4.8,
      0.95,
    );
    addOrientedPanel(
      stationGroup,
      bannerMat,
      surfacePos(TRAM_PLATFORM_ARC / RADIUS, stop.y - TRAM_PLATFORM_LENGTH / 2 - 0.22, TRAM_HEIGHT + 2.38),
      "south",
      2.3,
      0.68,
    );
    addOrientedPanel(
      stationGroup,
      bannerMat,
      surfacePos(TRAM_PLATFORM_ARC / RADIUS, stop.y + TRAM_PLATFORM_LENGTH / 2 + 0.22, TRAM_HEIGHT + 2.38),
      "north",
      2.3,
      0.68,
    );
  }
  } else {
    createStillwaterInfrastructure(tramGroup, mats, obstacles, line, names, stationDisplays);
  }

  // =========================================================================
  // 4. ELEVATED TRAM CARRIAGE (civilian_tram_carriage, dynamic subtree)
  // Local frame: X = east, Y = up (0 = foot height 13m), Z = south
  // =========================================================================
  const carriageGroup = new THREE.Group();
  carriageGroup.name = line.axis === "y" ? "civilian_tram_carriage" : "stillwater_tram_carriage";
  carriageGroup.userData.atmosphereDynamic = true;
  tramGroup.add(carriageGroup);

  const halfW = TRAM_CAR_WIDTH / 2; // 1.4m
  const halfL = TRAM_CAR_LENGTH / 2; // 4.0m
  const wallT = 0.1;

  function addCarPart(geo, mat, lx, ly, lz, parentGroup = carriageGroup) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(lx, ly, lz);
    parentGroup.add(mesh);
    return mesh;
  }

  // 4.1 Bogies & flanged steel wheels (localY in [-0.80, -0.20] => world h = 12.2..12.8)
  const wheelGeo = new THREE.CylinderGeometry(
    WHEEL_RADIUS,
    WHEEL_RADIUS,
    0.11,
    18,
  );
  wheelGeo.rotateZ(Math.PI / 2);
  const flangeGeo = new THREE.CylinderGeometry(
    WHEEL_RADIUS + 0.03,
    WHEEL_RADIUS + 0.03,
    0.03,
    18,
  );
  flangeGeo.rotateZ(Math.PI / 2);
  const axleGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.78, 10);
  axleGeo.rotateZ(Math.PI / 2);
  const bogieFrameGeo = new THREE.BoxGeometry(0.14, 0.22, 1.85);
  const bogieBolsterGeo = new THREE.BoxGeometry(1.9, 0.18, 0.48);

  const wheelMeshes = [];
  for (const bogieZ of [-2.4, 2.4]) {
    addCarPart(bogieBolsterGeo, mats.carChassis, 0, -0.32, bogieZ);
    addCarPart(bogieFrameGeo, mats.carChassis, -0.95, -0.45, bogieZ);
    addCarPart(bogieFrameGeo, mats.carChassis, 0.95, -0.45, bogieZ);

    for (const axleOffset of [-0.65, 0.65]) {
      const axleZ = bogieZ + axleOffset;
      addCarPart(axleGeo, mats.railSteel, 0, -0.52, axleZ);
      for (const sideX of [-0.85, 0.85]) {
        const wheelGroup = new THREE.Group();
        wheelGroup.position.set(sideX, -0.52, axleZ);
        const tread = new THREE.Mesh(wheelGeo, mats.railSteel);
        const flange = new THREE.Mesh(flangeGeo, mats.carChassis);
        flange.position.x = sideX < 0 ? 0.055 : -0.055;
        wheelGroup.add(tread, flange);
        carriageGroup.add(wheelGroup);
        wheelMeshes.push(wheelGroup);
      }
    }
  }

  // 4.2 Floor chassis slab (localY in [-0.20, 0.00] => world h = 12.8..13.0)
  addCarPart(
    new THREE.BoxGeometry(TRAM_CAR_WIDTH - 0.04, 0.2, TRAM_CAR_LENGTH - 0.1),
    mats.carChassis,
    0,
    -0.1,
    0,
  );
  // Thin floor tread & central aisle inlay (sits flush up to localY = 0)
  addCarPart(
    new THREE.BoxGeometry(TRAM_CAR_WIDTH - 0.2, 0.014, TRAM_CAR_LENGTH - 0.24),
    mats.carFloorDeck,
    0,
    -0.007,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(1.06, 0.016, TRAM_CAR_LENGTH - 0.36),
    mats.carAisleStrip,
    0,
    -0.006,
    0,
  );
  // End anti-climber bumpers
  addCarPart(
    new THREE.BoxGeometry(TRAM_CAR_WIDTH, 0.16, 0.12),
    mats.carTrimBrass,
    0,
    -0.06,
    -halfL,
  );
  addCarPart(
    new THREE.BoxGeometry(TRAM_CAR_WIDTH, 0.16, 0.12),
    mats.carTrimBrass,
    0,
    -0.06,
    halfL,
  );

  // 4.3 West wall (continuous lower panel, mullions, header, panoramic windows)
  const westX = -halfW + wallT / 2;
  addCarPart(
    new THREE.BoxGeometry(wallT, 0.95, TRAM_CAR_LENGTH),
    mats.carTeal,
    westX,
    0.475,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(wallT + 0.02, 0.06, TRAM_CAR_LENGTH + 0.02),
    mats.carTrimBrass,
    westX,
    0.95,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(wallT, 0.39, TRAM_CAR_LENGTH),
    mats.carCream,
    westX,
    2.445,
    0,
  );
  for (const pillarZ of [-3.9, -2.0, 0, 2.0, 3.9]) {
    addCarPart(
      new THREE.BoxGeometry(wallT + 0.01, 1.3, 0.18),
      mats.carCream,
      westX,
      1.6,
      pillarZ,
    );
  }
  addCarPart(
    new THREE.PlaneGeometry(TRAM_CAR_LENGTH - 0.24, 1.28),
    mats.carGlass,
    westX,
    1.6,
    0,
  ).rotation.y = Math.PI / 2;

  // 4.4 East wall (with two wide 1.4m doorway openings at z = -1.6 and z = +1.6)
  const eastX = halfW - wallT / 2;
  // South pier [2.3, 4.0], Center pier [-0.9, 0.9], North pier [-4.0, -2.3]
  for (const [segZ, segLen] of [
    [-3.15, 1.7],
    [0, 1.8],
    [3.15, 1.7],
  ]) {
    addCarPart(
      new THREE.BoxGeometry(wallT, 0.95, segLen),
      mats.carTeal,
      eastX,
      0.475,
      segZ,
    );
    addCarPart(
      new THREE.BoxGeometry(wallT + 0.02, 0.06, segLen),
      mats.carTrimBrass,
      eastX,
      0.95,
      segZ,
    );
    addCarPart(
      new THREE.BoxGeometry(wallT, 1.3, 0.18),
      mats.carCream,
      eastX,
      1.6,
      segZ - segLen / 2 + 0.09,
    );
    addCarPart(
      new THREE.BoxGeometry(wallT, 1.3, 0.18),
      mats.carCream,
      eastX,
      1.6,
      segZ + segLen / 2 - 0.09,
    );
    const gl = addCarPart(
      new THREE.PlaneGeometry(segLen - 0.24, 1.28),
      mats.carGlass,
      eastX,
      1.6,
      segZ,
    );
    gl.rotation.y = Math.PI / 2;
  }
  // Full-length East upper header & doorway lintels (localY = 2.15 .. 2.64)
  addCarPart(
    new THREE.BoxGeometry(wallT, 0.49, TRAM_CAR_LENGTH),
    mats.carCream,
    eastX,
    2.395,
    0,
  );
  // Doorway indicator lights above East doorways
  for (const doorCenterZ of [-1.6, 1.6]) {
    addCarPart(
      new THREE.BoxGeometry(0.06, 0.08, 0.45),
      mats.doorStatusMat,
      eastX + 0.04,
      2.24,
      doorCenterZ,
    );
  }

  // 4.5 Animated East Sliding Double Doors (4 leaves across 2 doorways)
  const doorLeaves = [];
  const doorLowerGeo = new THREE.BoxGeometry(0.055, 0.95, 0.72);
  const doorGlassGeo = new THREE.BoxGeometry(0.03, 1.1, 0.56);
  const doorStileGeo = new THREE.BoxGeometry(0.06, 1.15, 0.08);
  const doorTopGeo = new THREE.BoxGeometry(0.06, 0.08, 0.72);

  for (const doorCenterZ of [-1.6, 1.6]) {
    for (const leafSign of [-1, 1]) {
      const closedZ = doorCenterZ + leafSign * 0.36;
      const leafGroup = new THREE.Group();
      leafGroup.position.set(eastX - 0.045, 0, closedZ);
      addCarPart(doorLowerGeo, mats.carTeal, 0, 0.475, 0, leafGroup);
      addCarPart(doorGlassGeo, mats.carGlass, 0, 1.5, 0, leafGroup);
      addCarPart(doorStileGeo, mats.carCream, 0, 1.525, -0.32, leafGroup);
      addCarPart(doorStileGeo, mats.carCream, 0, 1.525, 0.32, leafGroup);
      addCarPart(doorTopGeo, mats.carCream, 0, 2.11, 0, leafGroup);
      carriageGroup.add(leafGroup);
      doorLeaves.push({ group: leafGroup, closedZ, slideSign: leafSign });
    }
  }

  // 4.6 North & South End Caps (panoramic windshields, headers, headlights/taillights)
  const endLampMeshes = { north: [], south: [] };
  for (const endSign of [-1, 1]) {
    const endZ = endSign * (halfL - wallT / 2);
    // Lower bulkhead
    addCarPart(
      new THREE.BoxGeometry(TRAM_CAR_WIDTH, 1.05, wallT),
      mats.carTeal,
      0,
      0.525,
      endZ,
    );
    // Waist pinstripe
    addCarPart(
      new THREE.BoxGeometry(TRAM_CAR_WIDTH + 0.02, 0.06, wallT + 0.02),
      mats.carTrimBrass,
      0,
      1.05,
      endZ,
    );
    // Corner pillars
    for (const px of [-halfW + 0.14, halfW - 0.14]) {
      addCarPart(
        new THREE.BoxGeometry(0.28, 1.15, wallT),
        mats.carCream,
        px,
        1.625,
        endZ,
      );
    }
    // Upper header fascia
    addCarPart(
      new THREE.BoxGeometry(TRAM_CAR_WIDTH, 0.44, wallT),
      mats.carCream,
      0,
      2.42,
      endZ,
    );
    // Panoramic windshield glass
    addCarPart(
      new THREE.PlaneGeometry(TRAM_CAR_WIDTH - 0.56, 1.15),
      mats.carGlass,
      0,
      1.625,
      endZ,
    );

    // Exterior directional lamps (no Three.js lights)
    const lampList = endSign < 0 ? endLampMeshes.north : endLampMeshes.south;
    for (const lx of [-0.95, 0.95]) {
      const lamp = addCarPart(
        new THREE.BoxGeometry(0.22, 0.14, 0.04),
        mats.headlightMat,
        lx,
        0.55,
        endZ + endSign * 0.05,
      );
      lampList.push(lamp);
    }
  }

  // 4.7 Roof & Interior Ceiling (localY in [2.62, 2.80])
  addCarPart(
    new THREE.BoxGeometry(TRAM_CAR_WIDTH - 0.08, 0.05, TRAM_CAR_LENGTH - 0.08),
    mats.carCeiling,
    0,
    2.625,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(TRAM_CAR_WIDTH + 0.04, 0.12, TRAM_CAR_LENGTH + 0.04),
    mats.carCream,
    0,
    2.71,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(TRAM_CAR_WIDTH - 0.55, 0.06, TRAM_CAR_LENGTH - 0.45),
    mats.carTeal,
    0,
    2.77,
    0,
  );

  // Two interior warm ceiling light strips (emissive basic material, zero PointLights)
  for (const stripX of [-0.48, 0.48]) {
    addCarPart(
      new THREE.BoxGeometry(0.1, 0.025, TRAM_CAR_LENGTH - 1.0),
      mats.cabinLightStrip,
      stripX,
      2.59,
      0,
    );
  }

  // 4.8 Interior Furnishings: Benches, Stanchions, Grab Rails, Motorman Consoles
  // West longitudinal bench (clear of passenger eye at (0, 1.7, 0))
  addCarPart(
    new THREE.BoxGeometry(0.5, 0.36, 5.2),
    mats.carSeatWood,
    -1.08,
    0.18,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(0.48, 0.08, 5.16),
    mats.carSeatFabric,
    -1.06,
    0.4,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(0.08, 0.45, 5.16),
    mats.carSeatFabric,
    -1.26,
    0.66,
    0,
  );

  // East center bench between the two doorways
  addCarPart(
    new THREE.BoxGeometry(0.5, 0.36, 1.48),
    mats.carSeatWood,
    1.08,
    0.18,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(0.48, 0.08, 1.44),
    mats.carSeatFabric,
    1.06,
    0.4,
    0,
  );
  addCarPart(
    new THREE.BoxGeometry(0.08, 0.45, 1.44),
    mats.carSeatFabric,
    1.26,
    0.66,
    0,
  );

  // End corner seats (away from doors and center aisle)
  for (const endZ of [-3.15, 3.15]) {
    addCarPart(
      new THREE.BoxGeometry(0.5, 0.36, 1.15),
      mats.carSeatWood,
      1.08,
      0.18,
      endZ,
    );
    addCarPart(
      new THREE.BoxGeometry(0.48, 0.08, 1.11),
      mats.carSeatFabric,
      1.06,
      0.4,
      endZ,
    );
    addCarPart(
      new THREE.BoxGeometry(0.08, 0.45, 1.11),
      mats.carSeatFabric,
      1.26,
      0.66,
      endZ,
    );
  }

  // Vertical brass stanchion poles (outside center aisle)
  const stanchionGeo = new THREE.CylinderGeometry(0.024, 0.024, 2.6, 10);
  for (const sx of [-0.62, 0.62]) {
    for (const sz of [-2.45, -0.85, 0.85, 2.45]) {
      addCarPart(stanchionGeo, mats.carTrimBrass, sx, 1.3, sz);
    }
  }

  // Overhead horizontal grab rails & hanging straps (above eye height 1.7m)
  const grabRailGeo = new THREE.CylinderGeometry(0.018, 0.018, 6.2, 8);
  grabRailGeo.rotateX(Math.PI / 2);
  const strapGeo = new THREE.BoxGeometry(0.03, 0.2, 0.05);
  for (const gx of [-0.52, 0.52]) {
    addCarPart(grabRailGeo, mats.carTrimBrass, gx, 2.22, 0);
    for (let gz = -2.2; gz <= 2.21; gz += 1.1) {
      addCarPart(strapGeo, mats.carChassis, gx, 2.1, gz);
    }
  }

  // Front & rear driver control consoles
  const consoleGeo = new THREE.BoxGeometry(0.7, 0.96, 0.42);
  const consoleScreenGeo = new THREE.BoxGeometry(0.36, 0.14, 0.04);
  for (const endSign of [-1, 1]) {
    const cz = endSign * 3.62;
    addCarPart(consoleGeo, mats.carChassis, -0.75, 0.48, cz);
    addCarPart(
      consoleScreenGeo,
      mats.cabinLightStrip,
      -0.75,
      1.0,
      cz - endSign * 0.12,
    );
  }

  // 4.9 Retained-Canvas Destination Display (1 shared canvas/texture/material)
  const destinationDisplay = createDestinationDisplay(line, names);

  // Interior North header display (faces +Z South toward passenger)
  addCarPart(
    new THREE.PlaneGeometry(1.4, 0.35),
    destinationDisplay.material,
    0,
    2.4,
    -halfL + 0.12,
  );
  // Interior South header display (faces -Z North toward passenger)
  addCarPart(
    new THREE.PlaneGeometry(1.4, 0.35),
    destinationDisplay.material,
    0,
    2.4,
    halfL - 0.12,
  ).rotation.y = Math.PI;
  // Exterior North brow display (faces -Z North)
  addCarPart(
    new THREE.PlaneGeometry(1.4, 0.35),
    destinationDisplay.material,
    0,
    2.44,
    -halfL - 0.02,
  ).rotation.y = Math.PI;
  // Exterior South brow display (faces +Z South)
  addCarPart(
    new THREE.PlaneGeometry(1.4, 0.35),
    destinationDisplay.material,
    0,
    2.44,
    halfL + 0.02,
  );
  // Exterior West & East side route boards
  addCarPart(
    new THREE.PlaneGeometry(1.6, 0.36),
    destinationDisplay.material,
    -halfW - 0.02,
    2.44,
    0,
  ).rotation.y = -Math.PI / 2;
  addCarPart(
    new THREE.PlaneGeometry(1.6, 0.36),
    destinationDisplay.material,
    halfW + 0.02,
    2.44,
    0,
  ).rotation.y = Math.PI / 2;

  // =========================================================================
  // 5. VISUAL SYNCHRONIZATION & DELEGATED STATE API
  // =========================================================================
  const poseScratch = { theta: 0, y: 0, height: 0, speed: 0 };
  const stateScratch = {
    theta: 0,
    y: 0,
    height: 0,
    speed: 0,
    phase: "dwell",
    stationId: null,
    nextStationId: null,
    direction: 1,
    departureIn: 0,
    arrivalIn: 0,
  };

  carriageGroup.rotation.order = "YXZ";

  function syncVisuals(dt = 0) {
    state.getPose(poseScratch);
    state.getState(stateScratch);
    for (const display of stationDisplays) {
      state.getStopStatus(display.id, display.status);
      display.plaque.repaint(display.status);
      display.banner.repaint(display.status);
    }

    const r = RADIUS - poseScratch.height;
    carriageGroup.position.set(
      r * Math.sin(poseScratch.theta),
      poseScratch.y,
      -r * Math.cos(poseScratch.theta),
    );
    carriageGroup.rotation.y = -poseScratch.theta;
    carriageGroup.rotation.x = Math.PI / 2;
    carriageGroup.rotation.z = 0;
    if (line.axis === "theta") carriageGroup.rotateY(-Math.PI / 2);

    const doorOpen =
      stateScratch.phase === "dwell"
        ? Math.min(1, stateScratch.departureIn / DOOR_CLOSE_WINDOW)
        : 0;
    for (let i = 0; i < doorLeaves.length; i++) {
      const leaf = doorLeaves[i];
      leaf.group.position.z =
        leaf.closedZ + leaf.slideSign * DOOR_SLIDE_DISTANCE * doorOpen;
    }

    mats.doorStatusMat.color.setHex(
      stateScratch.phase === "dwell" ? 0x22c55e : 0xf59e0b,
    );

    const northMat =
      stateScratch.direction >= 0 ? mats.headlightMat : mats.taillightMat;
    const southMat =
      stateScratch.direction >= 0 ? mats.taillightMat : mats.headlightMat;
    for (let i = 0; i < endLampMeshes.north.length; i++) {
      endLampMeshes.north[i].material = northMat;
    }
    for (let i = 0; i < endLampMeshes.south.length; i++) {
      endLampMeshes.south[i].material = southMat;
    }

    if (dt > 0 && poseScratch.speed > 0) {
      const deltaAngle =
        -stateScratch.direction * ((poseScratch.speed * dt) / WHEEL_RADIUS);
      for (let i = 0; i < wheelMeshes.length; i++) {
        wheelMeshes[i].rotation.x += deltaAngle;
      }
    }

    destinationDisplay.repaint(stateScratch);
  }

  function update(dt = 0) {
    state.update(dt);
    syncVisuals(dt);
  }

  function getPose(out) {
    return state.getPose(out);
  }

  function getState(out) {
    return state.getState(out);
  }

  function getStopStatus(stopId, out) {
    return state.getStopStatus(stopId, out);
  }

  function getInteraction(playerState) {
    return state.getInteraction(playerState);
  }

  function canCommitTransfer(kind, stationId, playerState) {
    return state.canCommitTransfer(kind, stationId, playerState);
  }

  // Position carriage and paint initial display at t = 0 without advancing time
  update(0);

  return {
    lineId: line.id,
    line,
    obstacles,
    update,
    getPose,
    getState,
    getStopStatus,
    getInteraction,
    canCommitTransfer,
  };
}
