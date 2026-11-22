import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { horizontalDistance } from "./cylinder-math.js";
import { surfacePos } from "./surface.js";
import { DELIVERY_STATIONS, SUPPLY_STATIONS, PLANTING_BED, PLANTING_STATIONS } from "./delivery-layout.js";
import { reservoirS, reservoirY } from "./reservoir-layout.js";

/**
 * Creates dynamic canvas textures for legible station signage.
 * Features slate teal backgrounds, amber/teal border trims, and crisp typography.
 */
function createStationSignTexture(
  badgeText,
  titleText,
  subtitleText,
  accentColor,
  footerText = "GREENWAY COMMONS · AGRI-SUPPLY",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  // Deep slate-teal backdrop
  ctx.fillStyle = "#0d2120";
  ctx.fillRect(0, 0, 512, 256);

  // Outer border with station accent
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 240);

  // Subtle inner border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 476, 220);

  // Header badge
  ctx.fillStyle = accentColor;
  ctx.fillRect(28, 26, 170, 32);
  ctx.fillStyle = "#071413";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, 113, 42);

  // Primary title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(titleText, 28, 108);

  // Route / station instructions
  ctx.fillStyle = "#d7e5ad";
  ctx.font = "22px system-ui, -apple-system, sans-serif";
  ctx.fillText(subtitleText, 28, 156);

  // Divider rule
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fillRect(28, 188, 456, 2);

  // Sub-footer
  ctx.fillStyle = accentColor;
  ctx.font = "16px monospace";
  ctx.fillText(footerText, 28, 216);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates the canvas stencil for a seed or produce crate.
 */
function createCrateLabelTexture(produce = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  // Aged biological crate parchment background
  ctx.fillStyle = "#e4d6b6";
  ctx.fillRect(0, 0, 512, 256);

  // Weathered stencil border
  ctx.strokeStyle = "#463121";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 236);

  // Top amber accent banner
  ctx.fillStyle = produce ? "#35834e" : "#d97718";
  ctx.fillRect(10, 10, 492, 26);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(produce ? "GREENWAY COMMONS FARM" : "CYLINDER BOTANICAL REPOSITORY", 256, 23);

  // Stencil brand text
  ctx.fillStyle = "#271b12";
  ctx.font = "900 36px monospace";
  ctx.fillText(produce ? "FRESH PRODUCE" : "HERITAGE SEEDS", 256, 88);

  // Teal lot code
  ctx.font = "bold 24px monospace";
  ctx.fillStyle = "#1b4d4f";
  ctx.fillText(produce ? "FARM TO CITY // CYL-N1" : "LOT #408 // CYL-N1", 256, 130);

  // Receiving destination
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillStyle = "#3d2b1f";
  ctx.fillText(produce ? "DEST: MERIDIAN PLAZA" : "DEST: GLASSHOUSE 01", 256, 172);

  // Handling notice
  ctx.fillStyle = "#63503f";
  ctx.font = "14px monospace";
  ctx.fillText(produce ? "FRESH HARVEST · HANDLE WITH CARE" : "KEEP COOL & DRY · VIABLE GERMPLASM", 256, 214);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Checks whether the player meets interaction eligibility criteria:
 * - Must be grounded in walk mode
 * - Feet height between 0 and 0.5m
 * - Wrapped ground distance <= station.range
 */
function isEligible(playerState, station) {
  if (!playerState || !playerState.grounded) return false;
  if (playerState.traversalMode !== "walk") return false;
  const h = playerState.height;
  if (!(h >= 0 && h <= 0.5)) return false;
  const dist = horizontalDistance(
    playerState.theta,
    playerState.y,
    station.s / RADIUS,
    station.y,
    0,
  );
  return dist <= station.range;
}

/**
 * Builds the physical seed crate group (world station scale).
 */
function buildStationCrate(crateLabelTexture) {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshLambertMaterial({ color: 0x7c5432 });
  const bracketMat = new THREE.MeshLambertMaterial({ color: 0x223231 });
  const strapMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
  const labelMat = new THREE.MeshBasicMaterial({
    map: crateLabelTexture,
    side: THREE.DoubleSide,
  });

  // Main wooden crate body (width: 0.58, depth: 0.44, height: 0.36)
  const bodyGeo = new THREE.BoxGeometry(0.58, 0.44, 0.36);
  const body = new THREE.Mesh(bodyGeo, woodMat);
  group.add(body);

  // Corner reinforcement metal brackets
  const cornerGeo = new THREE.BoxGeometry(0.045, 0.045, 0.364);
  for (const sx of [-0.275, 0.275]) {
    for (const sy of [-0.205, 0.205]) {
      const corner = new THREE.Mesh(cornerGeo, bracketMat);
      corner.position.set(sx, sy, 0);
      group.add(corner);
    }
  }

  // Amber security strap
  const strapGeo = new THREE.BoxGeometry(0.586, 0.06, 0.366);
  const strap = new THREE.Mesh(strapGeo, strapMat);
  group.add(strap);

  // Front stencil label facing south (-Y)
  const frontLabelGeo = new THREE.PlaneGeometry(0.38, 0.19);
  const frontLabel = new THREE.Mesh(frontLabelGeo, labelMat);
  frontLabel.position.set(0, -0.222, 0);
  frontLabel.rotation.set(Math.PI / 2, 0, 0);
  group.add(frontLabel);

  // Top stencil label facing UP (+Z)
  const topLabelGeo = new THREE.PlaneGeometry(0.38, 0.19);
  const topLabel = new THREE.Mesh(topLabelGeo, labelMat);
  topLabel.position.set(0, 0, 0.182);
  group.add(topLabel);

  return group;
}

// The same recognizable tray is staged at dispatch and carried by the player.
function buildSeedlingTray() {
  const group = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x34463a }));
  group.add(tray);
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.25, 5).rotateX(Math.PI / 2);
  const leafGeo = new THREE.SphereGeometry(0.085, 6, 4);
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x71904b });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x68a64e });
  for (const x of [-0.2, 0, 0.2]) {
    for (const y of [-0.13, 0.13]) {
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(x, y, 0.18);
      group.add(stem);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(x, y, 0.32);
      leaves.scale.set(1, 0.8, 1.25);
      group.add(leaves);
    }
  }
  return group;
}

/**
 * Builds a subtle, eye-catching floating station beacon.
 */
function buildStationMarker(accentColor, ringColor) {
  const group = new THREE.Group();

  const beaconGeo = new THREE.OctahedronGeometry(0.16, 0);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.9,
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  group.add(beacon);

  const ringGeo = new THREE.TorusGeometry(0.24, 0.016, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ringColor,
    transparent: true,
    opacity: 0.75,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.set(Math.PI / 2, 0, 0);
  group.add(ring);

  return { group, beacon, ring, beaconMat, ringMat };
}

/**
 * Manages the seed, produce, and woodland planting delivery legs.
 *
 * @param {THREE.Object3D} parent - District world group in the O'Neill cylinder
 * @param {THREE.Camera} camera - Player PerspectiveCamera
 * @param {string} [initialPhase="available"] - Restored seed delivery phase
 * @param {string} [initialSupplyPhase="available"] - Restored unlocked produce phase
 * @param {string} [initialPlantingPhase="available"] - Restored unlocked planting phase
 * @returns {{ obstacles, update, setActive, getView, interact, getPhase, getSupplyPhase, getPlantingPhase }}
 */
export function createDelivery(parent, camera, initialPhase = "available", initialSupplyPhase = "available", initialPlantingPhase = "available") {
  const deliveryGroup = new THREE.Group();
  deliveryGroup.name = "delivery_stations";
  parent.add(deliveryGroup);

  const crateLabelTexture = createCrateLabelTexture();
  const produceLabelTexture = createCrateLabelTexture(true);

  // Pre-cached stable targets
  const TARGET_PICKUP = Object.freeze({
    theta: DELIVERY_STATIONS.pickup.s / RADIUS,
    y: DELIVERY_STATIONS.pickup.y,
    height: 0,
    range: DELIVERY_STATIONS.pickup.range,
    name: "Heritage seed crate",
  });

  const TARGET_DROPOFF = Object.freeze({
    theta: DELIVERY_STATIONS.dropoff.s / RADIUS,
    y: DELIVERY_STATIONS.dropoff.y,
    height: 0,
    range: DELIVERY_STATIONS.dropoff.range,
    name: "Glasshouse 01 receiving desk",
  });
  const TARGET_SUPPLY_PICKUP = Object.freeze({
    theta: SUPPLY_STATIONS.pickup.s / RADIUS,
    y: SUPPLY_STATIONS.pickup.y,
    height: 0,
    range: SUPPLY_STATIONS.pickup.range,
    name: "Glasshouse 01 produce dispatch",
  });
  const TARGET_SUPPLY_DROPOFF = Object.freeze({
    theta: SUPPLY_STATIONS.dropoff.s / RADIUS,
    y: SUPPLY_STATIONS.dropoff.y,
    height: 0,
    range: SUPPLY_STATIONS.dropoff.range,
    name: "Meridian produce receiver",
  });
  const TARGET_PLANTING_PICKUP = Object.freeze({
    theta: PLANTING_STATIONS.pickup.s / RADIUS, y: PLANTING_STATIONS.pickup.y,
    height: 0, range: PLANTING_STATIONS.pickup.range, name: "Glasshouse 01 seedling dispatch",
  });
  const TARGET_PLANTING_DROPOFF = Object.freeze({
    theta: PLANTING_STATIONS.dropoff.s / RADIUS, y: PLANTING_STATIONS.dropoff.y,
    height: 0, range: PLANTING_STATIONS.dropoff.range, name: "Stillwater restoration plot",
  });

  // Matching static ground collision boxes (crate is decorative)
  const obstacles = [
    {
      theta: TARGET_PICKUP.theta,
      y: TARGET_PICKUP.y,
      width: 1.8,
      depth: 1.0,
      height: 0.8,
    },
    {
      theta: TARGET_DROPOFF.theta,
      y: TARGET_DROPOFF.y,
      width: 1.4,
      depth: 0.8,
      height: 0.85,
    },
    {
      theta: TARGET_SUPPLY_DROPOFF.theta,
      y: TARGET_SUPPLY_DROPOFF.y,
      width: 1.4,
      depth: 0.8,
      height: 0.85,
    },
    {
      theta: reservoirS(PLANTING_BED.s) / RADIUS,
      y: reservoirY(PLANTING_BED.y),
      width: PLANTING_BED.width, depth: PLANTING_BED.depth, height: 0.45,
    },
  ];

  // ----------------------------------------------------
  // 1. PICKUP STATION (s = 7.2, y = -240)
  // ----------------------------------------------------
  const pickupGroup = new THREE.Group();
  pickupGroup.position.copy(
    surfacePos(TARGET_PICKUP.theta, TARGET_PICKUP.y, 0),
  );
  pickupGroup.rotation.y = -TARGET_PICKUP.theta;
  deliveryGroup.add(pickupGroup);

  const pickupWoodMat = new THREE.MeshLambertMaterial({ color: 0x5a3d2a });
  const pickupMetalMat = new THREE.MeshLambertMaterial({ color: 0x1f2e2d });
  const amberAccentMat = new THREE.MeshLambertMaterial({ color: 0xf5a623 });

  // Tabletop (1.8 x 1.0 x 0.08, height from 0.72 to 0.80)
  const pickupTopGeo = new THREE.BoxGeometry(1.8, 1.0, 0.08);
  const pickupTop = new THREE.Mesh(pickupTopGeo, pickupWoodMat);
  pickupTop.position.set(0, 0, 0.76);
  pickupGroup.add(pickupTop);

  // Table Apron
  const pickupApronGeo = new THREE.BoxGeometry(1.64, 0.84, 0.06);
  const pickupApron = new THREE.Mesh(pickupApronGeo, pickupMetalMat);
  pickupApron.position.set(0, 0, 0.69);
  pickupGroup.add(pickupApron);

  // Table Legs (4 corner legs to ground)
  const pickupLegGeo = new THREE.BoxGeometry(0.1, 0.1, 0.72);
  for (const lx of [-0.76, 0.76]) {
    for (const ly of [-0.38, 0.38]) {
      const leg = new THREE.Mesh(pickupLegGeo, pickupMetalMat);
      leg.position.set(lx, ly, 0.36);
      pickupGroup.add(leg);
    }
  }

  // Amber tabletop trim strips
  const pickupTrimGeo = new THREE.BoxGeometry(1.82, 0.03, 0.04);
  const pickupTrimS = new THREE.Mesh(pickupTrimGeo, amberAccentMat);
  pickupTrimS.position.set(0, -0.49, 0.78);
  pickupGroup.add(pickupTrimS);

  // Station signboard facing approaching players (-Y direction)
  const pickupSignTex = createStationSignTexture(
    "DISPATCH",
    "HERITAGE SEEDS",
    "Collection Table · Lot #408",
    "#f5a623",
  );
  const pickupSignMat = new THREE.MeshBasicMaterial({
    map: pickupSignTex,
    side: THREE.DoubleSide,
  });
  const pickupSignGeo = new THREE.PlaneGeometry(0.92, 0.4);
  const pickupSign = new THREE.Mesh(pickupSignGeo, pickupSignMat);
  pickupSign.position.set(0, -0.51, 0.86);
  pickupSign.rotation.set(Math.PI / 2, 0, 0);
  pickupGroup.add(pickupSign);

  // Seed crate on pickup table (base = 0.80, center = 0.98)
  const pickupCrateGroup = buildStationCrate(crateLabelTexture);
  pickupCrateGroup.position.set(0, 0, 0.98);
  pickupGroup.add(pickupCrateGroup);

  // Subtle floating beacon above pickup table
  const pickupMarker = buildStationMarker(0xffb74d, 0x26c6da);
  pickupMarker.group.position.set(0, 0, 1.55);
  pickupGroup.add(pickupMarker.group);

  // ----------------------------------------------------
  // 2. DROPOFF STATION (s = 67, y = -214)
  // ----------------------------------------------------
  const dropoffGroup = new THREE.Group();
  dropoffGroup.position.copy(
    surfacePos(TARGET_DROPOFF.theta, TARGET_DROPOFF.y, 0),
  );
  dropoffGroup.rotation.y = -TARGET_DROPOFF.theta;
  deliveryGroup.add(dropoffGroup);

  const dropoffTopMat = new THREE.MeshLambertMaterial({ color: 0x758882 });
  const dropoffFrameMat = new THREE.MeshLambertMaterial({ color: 0x1b3735 });
  const tealAccentMat = new THREE.MeshLambertMaterial({ color: 0x26c6da });

  // Tabletop (1.4 x 0.8 x 0.08, height from 0.77 to 0.85)
  const dropoffTopGeo = new THREE.BoxGeometry(1.4, 0.8, 0.08);
  const dropoffTop = new THREE.Mesh(dropoffTopGeo, dropoffTopMat);
  dropoffTop.position.set(0, 0, 0.81);
  dropoffGroup.add(dropoffTop);

  // Table Apron
  const dropoffApronGeo = new THREE.BoxGeometry(1.24, 0.64, 0.06);
  const dropoffApron = new THREE.Mesh(dropoffApronGeo, dropoffFrameMat);
  dropoffApron.position.set(0, 0, 0.74);
  dropoffGroup.add(dropoffApron);

  // Table Legs (4 corner legs to ground)
  const dropoffLegGeo = new THREE.BoxGeometry(0.08, 0.08, 0.77);
  for (const lx of [-0.58, 0.58]) {
    for (const ly of [-0.28, 0.28]) {
      const leg = new THREE.Mesh(dropoffLegGeo, dropoffFrameMat);
      leg.position.set(lx, ly, 0.385);
      dropoffGroup.add(leg);
    }
  }

  // Teal tabletop trim strip
  const dropoffTrimGeo = new THREE.BoxGeometry(1.42, 0.03, 0.04);
  const dropoffTrimS = new THREE.Mesh(dropoffTrimGeo, tealAccentMat);
  dropoffTrimS.position.set(0, -0.39, 0.83);
  dropoffGroup.add(dropoffTrimS);

  // Reuse the table's geometry/materials before adding the farm-only props.
  const supplyReceiver = dropoffGroup.clone(true);
  supplyReceiver.name = "meridian_produce_receiver";
  supplyReceiver.position.copy(surfacePos(TARGET_SUPPLY_DROPOFF.theta, TARGET_SUPPLY_DROPOFF.y, 0));
  supplyReceiver.rotation.y = -TARGET_SUPPLY_DROPOFF.theta;
  deliveryGroup.add(supplyReceiver);
  const receiverSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.5),
    new THREE.MeshBasicMaterial({
      map: createStationSignTexture("RECEIVING", "MERIDIAN PLAZA", "Fresh Produce Drop Point", "#67c488", "MERIDIAN · FOOD SUPPLY"),
      side: THREE.DoubleSide,
    }),
  );
  receiverSign.position.set(0, -0.41, 1.15);
  receiverSign.rotation.x = Math.PI / 2;
  supplyReceiver.add(receiverSign);
  const receivedProduce = buildStationCrate(produceLabelTexture);
  receivedProduce.position.set(0, 0, 1.03);
  supplyReceiver.add(receivedProduce);
  const supplyMarker = buildStationMarker(0x67c488, 0xffb74d);
  supplyMarker.group.position.set(0, 0, 1.62);
  supplyReceiver.add(supplyMarker.group);

  // Station signboard facing west (-X direction towards glasshouse aisle)
  const dropoffSignTex = createStationSignTexture(
    "RECEIVING",
    "GLASSHOUSE 01",
    "Nursery Drop Point",
    "#26c6da",
  );
  const dispatchSignTex = createStationSignTexture("DISPATCH", "GLASSHOUSE 01", "Produce for Meridian Plaza", "#67c488");
  const plantingSignTex = createStationSignTexture("DISPATCH", "GLASSHOUSE 01", "Seedlings for Stillwater", "#a9d76e");
  const dropoffSignMat = new THREE.MeshBasicMaterial({
    map: dropoffSignTex,
    side: THREE.DoubleSide,
  });
  const dropoffSignGeo = new THREE.PlaneGeometry(0.78, 0.34);
  const dropoffSign = new THREE.Mesh(dropoffSignGeo, dropoffSignMat);
  dropoffSign.position.set(-0.68, 0, 0.94);
  dropoffSign.rotation.set(Math.PI / 2, -Math.PI / 2, 0);
  dropoffGroup.add(dropoffSign);

  // Seed crate on dropoff table (base = 0.85, center = 1.03)
  const dropoffCrateGroup = buildStationCrate(crateLabelTexture);
  dropoffCrateGroup.position.set(0, 0, 1.03);
  dropoffCrateGroup.visible = false;
  dropoffGroup.add(dropoffCrateGroup);
  const dispatchTray = buildSeedlingTray();
  dispatchTray.position.set(0, 0, 0.91);
  dropoffGroup.add(dispatchTray);

  // Subtle floating beacon above dropoff table
  const dropoffMarker = buildStationMarker(0x26c6da, 0xffb74d);
  dropoffMarker.group.position.set(0, 0, 1.62);
  dropoffMarker.group.visible = false;
  dropoffGroup.add(dropoffMarker.group);

  // The bed is static; only the saplings change visibility, and never cast
  // baked shadows, so a completed run and a reload look the same.
  const bed = new THREE.Group();
  bed.name = "stillwater_planting_bed";
  bed.position.copy(surfacePos(reservoirS(PLANTING_BED.s) / RADIUS, reservoirY(PLANTING_BED.y), 0));
  bed.rotation.y = -reservoirS(PLANTING_BED.s) / RADIUS;
  deliveryGroup.add(bed);
  const bedWood = new THREE.MeshLambertMaterial({ color: 0x79543a });
  const soil = new THREE.Mesh(new THREE.BoxGeometry(PLANTING_BED.width - 0.2, PLANTING_BED.depth - 0.2, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x49382a }));
  soil.position.z = 0.2;
  bed.add(soil);
  for (const x of [-PLANTING_BED.width / 2 + 0.1, PLANTING_BED.width / 2 - 0.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, PLANTING_BED.depth, 0.45), bedWood);
    rail.position.set(x, 0, 0.225);
    bed.add(rail);
  }
  for (const y of [-PLANTING_BED.depth / 2 + 0.1, PLANTING_BED.depth / 2 - 0.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(PLANTING_BED.width - 0.4, 0.2, 0.45), bedWood);
    rail.position.set(0, y, 0.225);
    bed.add(rail);
  }
  const postGeo = new THREE.BoxGeometry(0.09, 0.09, 0.68);
  for (const y of [-0.5, 0.5]) {
    const post = new THREE.Mesh(postGeo, bedWood);
    post.position.set(-PLANTING_BED.width / 2 + 0.06, y, 0.68);
    bed.add(post);
  }
  const bedSign = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.65),
    new THREE.MeshBasicMaterial({ map: createStationSignTexture("RESTORATION", "STILLWATER", "Woodland planting plot", "#a9d76e"), side: THREE.DoubleSide }));
  bedSign.position.set(-PLANTING_BED.width / 2 - 0.01, 0, 0.85);
  bedSign.rotation.set(Math.PI / 2, -Math.PI / 2, 0);
  bed.add(bedSign);
  const planted = new THREE.Group();
  planted.name = "stillwater_planted_seedlings";
  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.06, 0.85, 6).rotateX(Math.PI / 2);
  const crownGeo = new THREE.IcosahedronGeometry(0.34, 1);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x73573b });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x649a4d });
  for (const x of [-1.1, 0, 1.1]) {
    for (const y of [-1.5, 0, 1.5]) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, y, 0.78);
      planted.add(trunk);
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.set(x, y, 1.3);
      crown.scale.z = 1.4;
      planted.add(crown);
    }
  }
  bed.add(planted);

  // ----------------------------------------------------
  // 3. CARRIED CRATE PROP (Attached to Camera)
  // ----------------------------------------------------
  const carriedCrateGroup = new THREE.Group();
  carriedCrateGroup.name = "carried_delivery_crate";
  // Camera-local: lower-right corner, non-obscuring
  carriedCrateGroup.position.set(0.4, -0.35, -0.85);
  carriedCrateGroup.visible = false;
  camera.add(carriedCrateGroup);
  const carriedTray = buildSeedlingTray();
  carriedTray.name = "carried_woodland_seedlings";
  carriedTray.scale.setScalar(0.55);
  carriedTray.rotation.x = -Math.PI / 2;
  carriedCrateGroup.add(carriedTray);

  const carriedWoodMat = new THREE.MeshLambertMaterial({ color: 0x825a38 });
  const carriedBracketMat = new THREE.MeshLambertMaterial({ color: 0x223231 });
  const carriedStrapMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
  const carriedLabelMat = new THREE.MeshBasicMaterial({
    map: crateLabelTexture,
    side: THREE.DoubleSide,
  });

  // Carried crate body (compact first-person prop: 0.32 x 0.22 x 0.24)
  const carriedBodyGeo = new THREE.BoxGeometry(0.32, 0.22, 0.24);
  const carriedBody = new THREE.Mesh(carriedBodyGeo, carriedWoodMat);
  carriedCrateGroup.add(carriedBody);

  // Corner brackets
  const carriedBracketGeo = new THREE.BoxGeometry(0.026, 0.224, 0.026);
  for (const bx of [-0.15, 0.15]) {
    for (const bz of [-0.11, 0.11]) {
      const corner = new THREE.Mesh(carriedBracketGeo, carriedBracketMat);
      corner.position.set(bx, 0, bz);
      carriedCrateGroup.add(corner);
    }
  }

  // Amber identification strap
  const carriedStrapGeo = new THREE.BoxGeometry(0.324, 0.224, 0.04);
  const carriedStrap = new THREE.Mesh(carriedStrapGeo, carriedStrapMat);
  carriedCrateGroup.add(carriedStrap);

  // Stenciled label visible on top face of carried crate
  const carriedTopLabelGeo = new THREE.PlaneGeometry(0.24, 0.12);
  const carriedTopLabel = new THREE.Mesh(carriedTopLabelGeo, carriedLabelMat);
  carriedTopLabel.position.set(0, 0.112, 0);
  carriedTopLabel.rotation.set(-Math.PI / 2, 0, 0);
  carriedCrateGroup.add(carriedTopLabel);

  // Stenciled label on back face facing player
  const carriedBackLabelGeo = new THREE.PlaneGeometry(0.24, 0.12);
  const carriedBackLabel = new THREE.Mesh(carriedBackLabelGeo, carriedLabelMat);
  carriedBackLabel.position.set(0, 0, 0.122);
  carriedCrateGroup.add(carriedBackLabel);

  // ----------------------------------------------------
  // 4. DELIVERY STATE & CONTRACTS
  // ----------------------------------------------------
  const VALID_PHASES = new Set(["available", "carrying", "complete"]);
  let phase = VALID_PHASES.has(initialPhase) ? initialPhase : "available";
  let supplyPhase = phase === "complete" && VALID_PHASES.has(initialSupplyPhase)
    ? initialSupplyPhase
    : "available";
  let plantingPhase = phase === "complete" && supplyPhase === "complete" && VALID_PHASES.has(initialPlantingPhase)
    ? initialPlantingPhase
    : "available";
  let active = false;

  function isCarrying() {
    return phase === "carrying" || (phase === "complete" && supplyPhase === "carrying") ||
      (phase === "complete" && supplyPhase === "complete" && plantingPhase === "carrying");
  }

  function updateVisualsForPhase() {
    const unlocked = phase === "complete";
    const plantingUnlocked = unlocked && supplyPhase === "complete";
    pickupCrateGroup.visible = phase === "available";
    pickupMarker.group.visible = phase === "available";
    dropoffCrateGroup.visible = unlocked && supplyPhase === "available";
    dispatchTray.visible = plantingUnlocked && plantingPhase === "available";
    dropoffMarker.group.visible = phase === "carrying" || (unlocked && supplyPhase === "available") ||
      (plantingUnlocked && plantingPhase === "available");
    supplyMarker.group.visible = unlocked && supplyPhase === "carrying";
    receivedProduce.visible = plantingUnlocked;
    planted.visible = plantingUnlocked && plantingPhase === "complete";
    carriedCrateGroup.visible = active && isCarrying();
    carriedTray.visible = plantingUnlocked && plantingPhase === "carrying";
    for (const child of carriedCrateGroup.children) {
      if (child !== carriedTray) child.visible = !carriedTray.visible;
    }
    if (unlocked) {
      dropoffSignMat.map = plantingUnlocked ? plantingSignTex : dispatchSignTex;
      dropoffCrateGroup.traverse((node) => {
        if (node.isMesh && node.material.map === crateLabelTexture) {
          node.material.map = produceLabelTexture;
        }
      });
      carriedLabelMat.map = produceLabelTexture;
    }
  }

  // Set initial prop and beacon visibilities for restored phase
  updateVisualsForPhase();

  /**
   * Returns the saved seed phase, independent of the active delivery leg.
   *
   * @returns {"available" | "carrying" | "complete"}
   */
  function getPhase() {
    return phase;
  }

  function getSupplyPhase() {
    return supplyPhase;
  }

  function getPlantingPhase() {
    return plantingPhase;
  }

  /**
   * Toggles visibility of the carried camera prop.
   * Does NOT alter delivery phase or completion state.
   *
   * @param {boolean} bool
   */
  function setActive(bool) {
    active = Boolean(bool);
    carriedCrateGroup.visible = active && isCarrying();
  }

  /**
   * Re-evaluates passed playerState and transitions phase if eligible.
   *
   * @param {object} playerState
   * @returns {{ phase: string, message: string } | null}
   */
  function interact(playerState) {
    if (phase === "available") {
      if (isEligible(playerState, DELIVERY_STATIONS.pickup)) {
        phase = "carrying";
        updateVisualsForPhase();
        return {
          phase: "carrying",
          message: "Picked up the heritage seed crate.",
        };
      }
      return null;
    }

    if (phase === "carrying") {
      if (isEligible(playerState, DELIVERY_STATIONS.dropoff)) {
        phase = "complete";
        updateVisualsForPhase();
        return {
          phase: "complete",
          message: "Seeds delivered. Press E again at this desk to collect produce for Meridian.",
        };
      }
      return null;
    }

    if (supplyPhase === "available" && isEligible(playerState, SUPPLY_STATIONS.pickup)) {
      supplyPhase = "carrying";
      updateVisualsForPhase();
      return { phase: "carrying", message: "Produce collected. Take the tram to Meridian Plaza." };
    }
    if (supplyPhase === "carrying" && isEligible(playerState, SUPPLY_STATIONS.dropoff)) {
      supplyPhase = "complete";
      updateVisualsForPhase();
      return { phase: "complete", message: "Fresh produce delivered. Collect seedlings at Glasshouse 01 for Stillwater." };
    }
    if (supplyPhase === "complete" && plantingPhase === "available" && isEligible(playerState, PLANTING_STATIONS.pickup)) {
      plantingPhase = "carrying";
      updateVisualsForPhase();
      return { phase: "carrying", message: "Seedling tray collected for Stillwater." };
    }
    if (supplyPhase === "complete" && plantingPhase === "carrying" && isEligible(playerState, PLANTING_STATIONS.dropoff)) {
      plantingPhase = "complete";
      updateVisualsForPhase();
      return { phase: "complete", message: "Seedlings planted at the Stillwater restoration plot." };
    }

    return null;
  }

  /**
   * Returns current UI and mission HUD state.
   *
   * @param {object} playerState
   * @returns {{ id, phase, title, objective, inventory, prompt, target, distance, progress, status }}
   */
  function getView(playerState) {
    if (phase === "complete" && supplyPhase === "complete") {
      const carrying = plantingPhase === "carrying";
      const complete = plantingPhase === "complete";
      const station = carrying ? PLANTING_STATIONS.dropoff : PLANTING_STATIONS.pickup;
      const target = complete ? null : carrying ? TARGET_PLANTING_DROPOFF : TARGET_PLANTING_PICKUP;
      return {
        id: "planting",
        phase: plantingPhase,
        title: "Stillwater restoration",
        objective: complete ? "Seedlings planted at the Stillwater restoration plot." : carrying
          ? "Leave by the glasshouse south door and take the south lane to Line 01. Ride to Meridian Plaza, walk south to Meridian South and take Line 02, then follow the entrance path to the plot."
          : "Collect the seedling tray at Glasshouse 01. From the tram, use the south lane and glasshouse south door.",
        inventory: carrying ? "Woodland seedling tray" : "",
        prompt: !complete && isEligible(playerState, station) ? (carrying ? "Plant seedlings" : "Collect seedling tray") : null,
        target,
        distance: playerState && target ? horizontalDistance(playerState.theta, playerState.y, target.theta, target.y, 0) : 0,
        progress: complete ? "2 / 2" : carrying ? "1 / 2" : "0 / 2",
        status: complete ? "RESTORATION COMPLETE" : carrying ? "PLANT AT STILLWATER" : "READY FOR PICKUP",
      };
    }
    const produce = phase === "complete";
    const currentPhase = produce ? supplyPhase : phase;
    const carrying = currentPhase === "carrying";
    const station = produce
      ? (carrying ? SUPPLY_STATIONS.dropoff : SUPPLY_STATIONS.pickup)
      : (carrying ? DELIVERY_STATIONS.dropoff : DELIVERY_STATIONS.pickup);
    const target = produce
      ? (carrying ? TARGET_SUPPLY_DROPOFF : TARGET_SUPPLY_PICKUP)
      : (carrying ? TARGET_DROPOFF : TARGET_PICKUP);
    const eligible = isEligible(playerState, station);
    let objective;
    if (!produce) {
      objective = carrying
        ? "Take the east lane to Glasshouse 01. The receiving desk is on the right inside."
        : "Collect the heritage seed crate east of the square approach.";
    } else {
      objective = carrying
        ? "Exit by the glasshouse south door; take the south cross-lane west to the tram. Ride to Meridian Plaza. From its pad walk north just short of the next gantry, east to the receiver lane, then north to the desk."
        : "Collect produce from the Glasshouse 01 receiving desk. From the tram use the south cross-lane and south door, not the glasshouse west wall.";
    }
    return {
      id: produce ? "produce" : "seed",
      phase: currentPhase,
      title: produce ? "Farm to city" : "A small favor",
      objective,
      inventory: carrying ? (produce ? "Fresh produce crate" : "Heritage seed crate") : "",
      prompt: eligible
        ? (carrying ? (produce ? "Deliver produce crate" : "Deliver seed crate")
          : (produce ? "Collect produce crate" : "Pick up seed crate"))
        : null,
      target,
      distance: playerState && target
        ? horizontalDistance(playerState.theta, playerState.y, target.theta, target.y, 0)
        : 0,
      progress: carrying ? "1 / 2" : "0 / 2",
      status: carrying
        ? (produce ? "DELIVER TO MERIDIAN PLAZA" : "DELIVER TO GLASSHOUSE 01")
        : "READY FOR PICKUP",
    };
  }

  /**
   * Per-frame animation for station markers and handheld carried crate bob.
   * Runtime allocations in animation loops strictly avoided.
   *
   * @param {number} _dt
   * @param {number} elapsed
   */
  function update(_dt, elapsed) {
    // 1. Carried crate handheld bobbing and tilt
    if (carriedCrateGroup.visible) {
      carriedCrateGroup.position.set(
        0.4 + Math.cos(elapsed * 2.2) * 0.005,
        -0.35 + Math.sin(elapsed * 4.4) * 0.012,
        -0.85,
      );
      carriedCrateGroup.rotation.set(
        0.08 + Math.sin(elapsed * 4.4) * 0.015,
        -0.12,
        Math.sin(elapsed * 2.2) * 0.018,
      );
    }

    // 2. Active station marker subtle animation
    if (pickupMarker.group.visible) {
      pickupMarker.group.position.z = 1.55 + Math.sin(elapsed * 2.8) * 0.05;
      pickupMarker.beacon.rotation.y = elapsed * 1.6;
      pickupMarker.beacon.rotation.x = elapsed * 0.7;
      pickupMarker.ring.rotation.z = elapsed * -0.9;
      pickupMarker.beaconMat.opacity = 0.8 + 0.18 * Math.sin(elapsed * 3.4);
    }

    if (dropoffMarker.group.visible) {
      dropoffMarker.group.position.z = 1.62 + Math.sin(elapsed * 2.8) * 0.05;
      dropoffMarker.beacon.rotation.y = elapsed * 1.6;
      dropoffMarker.beacon.rotation.x = elapsed * 0.7;
      dropoffMarker.ring.rotation.z = elapsed * -0.9;
      dropoffMarker.beaconMat.opacity = 0.8 + 0.18 * Math.sin(elapsed * 3.4);
    }
    if (supplyMarker.group.visible) {
      supplyMarker.group.position.z = 1.62 + Math.sin(elapsed * 2.8) * 0.05;
      supplyMarker.beacon.rotation.y = elapsed * 1.6;
      supplyMarker.beacon.rotation.x = elapsed * 0.7;
      supplyMarker.ring.rotation.z = elapsed * -0.9;
      supplyMarker.beaconMat.opacity = 0.8 + 0.18 * Math.sin(elapsed * 3.4);
    }
  }

  return {
    obstacles,
    update,
    setActive,
    getView,
    interact,
    getPhase,
    getSupplyPhase,
    getPlantingPhase,
  };
}
