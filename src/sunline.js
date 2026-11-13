import * as THREE from "three";
import { RADIUS, LENGTH } from "./habitat.js";
import { addCivicBlock, addCivicSolid } from "./civic-primitives.js";
import { surfacePos, addOrientedPanel } from "./surface.js";
import {
  SPINE_THETA,
  AXIAL_HEIGHT,
  SPINE_ROOF_HEIGHT,
  axialArc,
  axialAngle,
  SUNLINE_MODULE_COUNT,
  SUNLINE_MODULE_LENGTH,
  SERVICE_MODULE_INDEX,
  SERVICE_MODULE_Y,
  ENDCAP_HUBS,
} from "./sunline-layout.js";
import { createSunlineState } from "./sunline-state.js";

// Sign creation requires the same real canvas support as the rest of the world.
function createSignMaterial(text, bgColor = "#152d2b", fgColor = "#f1eddb") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 1000, 232);
  const lines = text.split("\n");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fgColor;
  ctx.font = `bold ${lines.length > 1 ? 50 : 66}px sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, 512, 128 + (i - (lines.length - 1) / 2) * 72, 960);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
  });
}

const CONSOLE_DISPLAY_THEMES = Object.freeze({
  available: {
    bg: "#132924",
    border: "#d7e5ad",
    headerFg: "#f1eddb",
    subFg: "#cde3d6",
    badgeBg: "#14532d",
    badgeBorder: "#4ade80",
    badgeFg: "#dcfce7",
    actionFg: "#fef08a",
    subLine: "MODULE SL-02: ENERGIZED",
    actionLine: "[E] ISOLATE MODULE SL-02",
  },
  isolated: {
    bg: "#2b1614",
    border: "#f59e0b",
    headerFg: "#fef3c7",
    subFg: "#fecaca",
    badgeBg: "#7f1d1d",
    badgeBorder: "#f87171",
    badgeFg: "#fef2f2",
    actionFg: "#fde68a",
    subLine: "MODULE SL-02: ISOLATED · OFFLINE",
    actionLine: "[E] INSPECT · SERVICE SL-02 ON TROLLEY",
  },
  replaced: {
    bg: "#281c11",
    border: "#f59e0b",
    headerFg: "#fef3c7",
    subFg: "#fde68a",
    badgeBg: "#7c2d12",
    badgeBorder: "#fbbf24",
    badgeFg: "#fef3c7",
    actionFg: "#bef264",
    subLine: "MODULE SL-02: EMITTER REPLACED",
    actionLine: "[E] RESTORE MODULE SL-02",
  },
  complete: {
    bg: "#102a1f",
    border: "#4ade80",
    headerFg: "#f1eddb",
    subFg: "#bbf7d0",
    badgeBg: "#14532d",
    badgeBorder: "#4ade80",
    badgeFg: "#dcfce7",
    actionFg: "#e2e8f0",
    subLine: "MODULE SL-02: ONLINE & NOMINAL",
    actionLine: "[E] INSPECT ISOLATION CONSOLE",
  },
});

function createConsoleDisplay(hubLabel) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 448;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
  });
  let renderedPhase = null;

  function update(phase, districtStatus) {
    if (phase === renderedPhase) return;
    renderedPhase = phase;
    const theme = CONSOLE_DISPLAY_THEMES[phase] || CONSOLE_DISPLAY_THEMES.available;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, 1024, 448);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, 996, 420);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = theme.headerFg;
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(`${hubLabel.toUpperCase()} ISOLATION CONSOLE`, 512, 78, 940);

    ctx.fillStyle = theme.subFg;
    ctx.font = "bold 36px sans-serif";
    ctx.fillText(theme.subLine, 512, 148, 940);

    ctx.fillStyle = theme.badgeBg;
    ctx.fillRect(52, 192, 920, 108);
    ctx.strokeStyle = theme.badgeBorder;
    ctx.lineWidth = 6;
    ctx.strokeRect(52, 192, 920, 108);
    ctx.fillStyle = theme.badgeFg;
    ctx.font = "bold 40px sans-serif";
    ctx.fillText(
      `${districtStatus.name.toUpperCase()}: ${districtStatus.status}`,
      512,
      246,
      880,
    );

    ctx.fillStyle = theme.actionFg;
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(theme.actionLine, 512, 368, 940);

    texture.needsUpdate = true;
  }

  return { material, update };
}

function createOrientedSign(parent, text, pos, facing, width = 3.6, height = 0.9, bg = "#152d2b") {
  return addOrientedPanel(parent, createSignMaterial(text, bg), pos, facing, width, height);
}

/**
 * Constructs the entire axial Sunline system:
 * - Both endcap maintenance hubs (A & B) with foot-level collision envelopes
 * - Radial lift shafts connecting rim stations at h=0 to hub decks at h=170
 * - Full 820m glazed maintenance passage with dual rails and instanced frames/lamps
 * - Constrained maintenance trolley with onboard spare emitter
 * - 9-section axial sunline array with isolated SL-02 core and side service panel
 *
 * @param {THREE.Object3D} parent - Scene or world group
 * @param {'available' | 'isolated' | 'replaced' | 'complete'} [initialPhase='available']
 * @returns {{
 *   obstacles: Array<object>,
 *   getPhase: () => string,
 *   getDistrictStatus: () => object,
 *   getView: (playerState?: object) => object,
 *   interact: (playerState: object) => object | null,
 *   setActive: (active: boolean) => void,
 *   update: (dt: number, elapsed?: number, playerState?: object) => void
 * }}
 */
export function createSunline(parent, initialPhase = "available") {
  const state = createSunlineState(initialPhase);

  // Root dynamic group excluded from static shadow bake
  const sunlineGroup = new THREE.Group();
  sunlineGroup.name = "sunline_system";
  sunlineGroup.userData.atmosphereDynamic = true;
  parent.add(sunlineGroup);

  // =========================================================================
  // 1. INDUSTRIAL ART MATERIALS (No shadow budget, reuse Three standard/lambert/basic)
  // =========================================================================
  const mats = {
    floor: new THREE.MeshLambertMaterial({ color: 0x627d8b }),
    wall: new THREE.MeshLambertMaterial({ color: 0x718997 }),
    ceiling: new THREE.MeshLambertMaterial({ color: 0x455a69 }),
    metalDark: new THREE.MeshLambertMaterial({ color: 0x424f58 }),
    metalBright: new THREE.MeshLambertMaterial({ color: 0x889baa }),
    hazardAmber: new THREE.MeshLambertMaterial({ color: 0xd97706 }),
    dockTeal: new THREE.MeshBasicMaterial({ color: 0x14b8a6 }),
    glass: new THREE.MeshLambertMaterial({
      color: 0x9ed3dc,
      transparent: true,
      opacity: 0.32,
    }),
    lampLit: new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
    coreLit: new THREE.MeshBasicMaterial({ color: 0xfffbee }),
    coreDark: new THREE.MeshLambertMaterial({ color: 0x1a2126 }),
    glowHalo: new THREE.MeshBasicMaterial({
      color: 0xffe899,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    }),
    statusGreen: new THREE.MeshBasicMaterial({ color: 0x22c55e }),
    statusAmber: new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    statusRed: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  };

  const obstacles = [];
  const axialFloorHeight = 0.6;
  const axialFloorBase = AXIAL_HEIGHT - axialFloorHeight;
  const axialRoofHeight = 0.5;
  const axialClearHeight = SPINE_ROOF_HEIGHT - AXIAL_HEIGHT;

  // =========================================================================
  // 2. ENDCAP HUBS A & B (y in [-430, -412] and [412, 430], floor h170, top 174.5)
  // =========================================================================
  const hubsGroup = new THREE.Group();
  hubsGroup.name = "sunline_hubs";
  sunlineGroup.add(hubsGroup);

  let hubAIndicator = null;
  let hubBIndicator = null;
  const consoleDisplays = [];

  for (const hubData of ENDCAP_HUBS) {
    const isA = hubData.side < 0;
    const hubCenterY = hubData.side * 421;
    const hubOuterWallY = isA ? -430.4 : 430.4;
    const hubGateY = isA ? -412.4 : 412.4;
    const hubPrefix = isA ? "endcap_a" : "endcap_b";

    const hubSubGroup = new THREE.Group();
    hubSubGroup.name = `${hubPrefix}_hub`;
    hubsGroup.add(hubSubGroup);

    // 2.1 Hub Floor: top EXACT AXIAL_HEIGHT (base 169.4, height 0.6), physical width 12m at r10 (arc 216m)
    addCivicSolid(
      hubSubGroup,
      mats.floor,
      obstacles,
      SPINE_THETA * RADIUS,
      hubCenterY,
      axialArc(12),
      18,
      axialFloorHeight,
      axialFloorBase,
    );

    // 2.2 Hub Ceiling: underside EXACT SPINE_ROOF_HEIGHT (base 174.5, height 0.5)
    addCivicSolid(
      hubSubGroup,
      mats.ceiling,
      obstacles,
      SPINE_THETA * RADIUS,
      hubCenterY,
      axialArc(12),
      18,
      axialRoofHeight,
      SPINE_ROOF_HEIGHT,
    );

    // 2.3 Outer Bulkhead Wall (y = +-430, blocks access to docking cylinders)
    addCivicSolid(
      hubSubGroup,
      mats.wall,
      obstacles,
      SPINE_THETA * RADIUS,
      hubOuterWallY,
      axialArc(13.2),
      0.8,
      axialClearHeight,
      AXIAL_HEIGHT,
    );

    // 2.4 Side Walls (theta = SPINE_THETA +- 0.64)
    addCivicSolid(
      hubSubGroup,
      mats.wall,
      obstacles,
      (SPINE_THETA - 0.64) * RADIUS,
      hubCenterY,
      axialArc(0.8),
      18,
      axialClearHeight,
      AXIAL_HEIGHT,
    );
    addCivicSolid(
      hubSubGroup,
      mats.wall,
      obstacles,
      (SPINE_THETA + 0.64) * RADIUS,
      hubCenterY,
      axialArc(0.8),
      18,
      axialClearHeight,
      AXIAL_HEIGHT,
    );

    // 2.5 Boarding Bulkhead and Gate (y = +-412, prevents on-foot rail transit)
    addCivicSolid(
      hubSubGroup,
      mats.wall,
      obstacles,
      SPINE_THETA * RADIUS,
      hubGateY,
      axialArc(13.2),
      0.8,
      axialClearHeight,
      AXIAL_HEIGHT,
    );

    // Gate portal frame & hazard markings around the boarding aperture
    addCivicBlock(
      hubSubGroup,
      mats.hazardAmber,
      SPINE_THETA * RADIUS,
      hubGateY + (isA ? -0.45 : 0.45),
      axialArc(3.2),
      0.1,
      3.8,
      AXIAL_HEIGHT,
    );

    // Boarding Gate Sign over portal facing inward toward boarding dock
    const gateSignPos = surfacePos(SPINE_THETA, hubGateY + (isA ? -0.52 : 0.52), AXIAL_HEIGHT + 3.2);
    createOrientedSign(
      hubSubGroup,
      `${hubData.label.toUpperCase()} BOARDING PORTAL · 0.056 G\n[E] BOARD MAINTENANCE TROLLEY`,
      gateSignPos,
      isA ? "south" : "north",
      4.2,
      1.0,
      "#242319",
    );

    // Boarding Pad threshold indicator at dock (y = +-414, theta = SPINE_THETA)
    addCivicBlock(
      hubSubGroup,
      mats.dockTeal,
      SPINE_THETA * RADIUS,
      hubData.dock.y,
      axialArc(2.4),
      2.4,
      0.02,
      AXIAL_HEIGHT + 0.01,
    );

    // 2.6 Isolation Control Console (target at theta = SPINE_THETA + 0.3, y = +-422)
    // Physical console offset to theta = SPINE_THETA + 0.42 leaving trigger clear
    const consoleTheta = SPINE_THETA + 0.42;
    const consoleY = hubData.control.y;
    addCivicSolid(
      hubSubGroup,
      mats.metalDark,
      obstacles,
      consoleTheta * RADIUS,
      consoleY,
      axialArc(1.0),
      1.6,
      1.2,
      AXIAL_HEIGHT,
    );

    // Console desk display panel facing -theta (inward toward player approach)
    const consoleDeskPos = surfacePos(consoleTheta - axialAngle(0.62), consoleY, AXIAL_HEIGHT + 1.1);
    const consoleDisplay = createConsoleDisplay(hubData.label);
    const consoleDisplayMesh = addOrientedPanel(
      hubSubGroup,
      consoleDisplay.material,
      consoleDeskPos,
      "west",
      1.5,
      0.65,
    );
    consoleDisplayMesh.name = `${hubPrefix}_console_display`;
    consoleDisplays.push(consoleDisplay);

    // Interactive console status indicator beacon
    const indicatorGeo = new THREE.BoxGeometry(0.2, 0.2, 0.15);
    const indicatorMesh = new THREE.Mesh(indicatorGeo, mats.statusAmber);
    indicatorMesh.name = `${hubPrefix}_console_indicator`;
    indicatorMesh.castShadow = false;
    indicatorMesh.receiveShadow = false;
    indicatorMesh.position.copy(
      surfacePos(consoleTheta - axialAngle(0.45), consoleY, AXIAL_HEIGHT + 1.35),
    );
    hubSubGroup.add(indicatorMesh);
    if (isA) hubAIndicator = indicatorMesh;
    else hubBIndicator = indicatorMesh;

    // 2.7 Power and Cooling Machinery Bank (theta = SPINE_THETA + 0.42, y = +-426)
    const powerMachineryY = hubData.side * 426;
    addCivicSolid(
      hubSubGroup,
      mats.metalDark,
      obstacles,
      consoleTheta * RADIUS,
      powerMachineryY,
      axialArc(1.2),
      2.4,
      2.2,
      AXIAL_HEIGHT,
    );

    // 2.8 Spare Emitter Storage Rack (theta = SPINE_THETA - 0.42, y = +-420)
    const rackTheta = SPINE_THETA - 0.42;
    const rackY = hubData.side * 420;
    addCivicSolid(
      hubSubGroup,
      mats.metalDark,
      obstacles,
      rackTheta * RADIUS,
      rackY,
      axialArc(1.0),
      2.0,
      1.8,
      AXIAL_HEIGHT,
    );

    // Spare emitter tubes in rack
    const spareTubeGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 12);
    spareTubeGeo.rotateX(Math.PI / 2);
    const rackSpare1 = new THREE.Mesh(spareTubeGeo, mats.metalBright);
    rackSpare1.castShadow = false;
    rackSpare1.position.copy(surfacePos(rackTheta + axialAngle(0.35), rackY, AXIAL_HEIGHT + 0.6));
    hubSubGroup.add(rackSpare1);

    const rackSpare2 = new THREE.Mesh(spareTubeGeo, mats.metalBright);
    rackSpare2.castShadow = false;
    rackSpare2.position.copy(surfacePos(rackTheta + axialAngle(0.35), rackY, AXIAL_HEIGHT + 1.2));
    hubSubGroup.add(rackSpare2);

    // 2.9 Radial Lift Landing (target at theta = SPINE_THETA - 0.25, y = +-424)
    // Enclosure placed at theta = SPINE_THETA - 0.42, y = +-424 leaving trigger clear
    const liftShaftTheta = SPINE_THETA - 0.42;
    const liftShaftY = hubData.landing.y;
    addCivicSolid(
      hubSubGroup,
      mats.wall,
      obstacles,
      liftShaftTheta * RADIUS,
      liftShaftY,
      axialArc(1.6),
      1.6,
      axialClearHeight,
      AXIAL_HEIGHT,
    );

    // Landing threshold pad
    addCivicBlock(
      hubSubGroup,
      mats.dockTeal,
      hubData.landing.theta * RADIUS,
      liftShaftY,
      axialArc(1.8),
      1.8,
      0.02,
      AXIAL_HEIGHT + 0.01,
    );

    // The return-lift label is mounted on its enclosure, not over the camera.
    const landingSignPos = surfacePos(
      liftShaftTheta + axialAngle(0.82), liftShaftY, AXIAL_HEIGHT + 2,
    );
    createOrientedSign(
      hubSubGroup,
      `RADIAL LIFT TO LIVING SURFACE (RIM · 1.0 G)\n[E] RETURN TO ${hubData.label.toUpperCase()} RIM`,
      landingSignPos,
      "east",
      1.5,
      0.65,
      "#152b2b",
    );

    // Magnetic Boots Safety Notice mounted on wall
    const noticePos = surfacePos(
      SPINE_THETA - 0.59,
      hubData.side * 426,
      AXIAL_HEIGHT + 2.4,
    );
    createOrientedSign(
      hubSubGroup,
      "AT-REST GRAVITY: 0.056 G\nMAGNETIC BOOTS MUST BE SECURED",
      noticePos,
      "east",
      3.2,
      0.8,
      "#382012",
    );

    // 2.10 Hub-to-dock visual collar (|y| in [430, 436], connects hub to docking cylinders)
    const collarCenterY = isA ? -433 : 433;
    const collarGeo = new THREE.CylinderGeometry(10.0, 10.0, 6.0, 24, 1, true);
    const collarMesh = new THREE.Mesh(collarGeo, mats.metalDark);
    collarMesh.castShadow = false;
    collarMesh.receiveShadow = false;
    collarMesh.position.set(0, collarCenterY, 0);
    hubSubGroup.add(collarMesh);
  }

  // =========================================================================
  // 3. RIM LIFT STATIONS & RADIAL SHAFTS (h = 0 to h = 169.4, footprint <= 2m)
  // =========================================================================
  const rimGroup = new THREE.Group();
  rimGroup.name = "sunline_rim_stations";
  sunlineGroup.add(rimGroup);

  for (const hubData of ENDCAP_HUBS) {
    const isA = hubData.side < 0;
    const rimY = hubData.rim.y;
    const rimTheta = hubData.rim.theta; // SPINE_THETA - 0.25
    const columnBaseY = rimY + (isA ? -2.4 : 2.4);

    // 3.1 Solid base structure at rim level (leaves player trigger at rimY unobstructed)
    obstacles.push({
      theta: rimTheta,
      y: columnBaseY,
      width: 1.6,
      depth: 1.6,
      base: 0.0,
      height: 4.0,
    });

    // Rim station plinth & entrance housing
    const rimPlinthGeo = new THREE.BoxGeometry(1.6, 1.6, 4.0);
    const rimPlinth = new THREE.Mesh(rimPlinthGeo, mats.wall);
    rimPlinth.castShadow = false;
    rimPlinth.position.copy(surfacePos(rimTheta, columnBaseY, 2.0));
    rimPlinth.rotation.set(0, -rimTheta, 0);
    rimGroup.add(rimPlinth);

    // Rim lift threshold plate
    const rimPadGeo = new THREE.BoxGeometry(2.0, 2.0, 0.04);
    const rimPad = new THREE.Mesh(rimPadGeo, mats.dockTeal);
    rimPad.castShadow = false;
    rimPad.position.copy(surfacePos(rimTheta, rimY, 0.02));
    rimPad.rotation.set(0, -rimTheta, 0);
    rimGroup.add(rimPad);

    // Rim Lift Call Sign facing approaching surface players
    const rimSignPos = surfacePos(rimTheta, columnBaseY + (isA ? 0.85 : -0.85), 2.2);
    createOrientedSign(
      rimGroup,
      `RADIAL LIFT TO AXIAL SERVICE SPINE (0.056 G)\n[E] TAKE LIFT TO ${hubData.label.toUpperCase()} HUB`,
      rimSignPos,
      isA ? "north" : "south",
      2.8,
      0.9,
      "#152b2b",
    );

    // 3.2 Continuous radial lift shaft connecting h=0 to h=169.4
    // Rises radially along ray at theta = rimTheta, y = columnBaseY
    const shaftP0 = surfacePos(rimTheta, columnBaseY, 0);
    const shaftP1 = surfacePos(rimTheta, columnBaseY, axialFloorBase);
    const shaftMid = new THREE.Vector3().addVectors(shaftP0, shaftP1).multiplyScalar(0.5);
    const shaftLen = shaftP0.distanceTo(shaftP1);

    const shaftTrussGeo = new THREE.BoxGeometry(1.4, 1.4, shaftLen);
    const shaftTruss = new THREE.Mesh(shaftTrussGeo, mats.metalDark);
    shaftTruss.castShadow = false;
    shaftTruss.position.copy(shaftMid);
    shaftTruss.lookAt(shaftP1);
    rimGroup.add(shaftTruss);

    // Radial guide rails running alongside the shaft tube
    const shaftRailGeo = new THREE.CylinderGeometry(0.06, 0.06, shaftLen, 8);
    shaftRailGeo.rotateX(Math.PI / 2);
    const shaftRail = new THREE.Mesh(shaftRailGeo, mats.metalBright);
    shaftRail.castShadow = false;
    shaftRail.position.copy(shaftMid);
    shaftRail.lookAt(shaftP1);
    rimGroup.add(shaftRail);
  }

  // =========================================================================
  // 4. GLAZED CORRIDOR & RAIL PASSAGE (Y in [-412, 412], rails in [-410, 410])
  // =========================================================================
  const corridorGroup = new THREE.Group();
  corridorGroup.name = "sunline_corridor";
  sunlineGroup.add(corridorGroup);

  const corridorLen = 824; // [-412, 412]

  // 4.1 Floor: physical width 4.2m at r10 (arc 75.6m), floor top EXACT AXIAL_HEIGHT (base 169.4, height 0.6)
  addCivicSolid(
    corridorGroup,
    mats.floor,
    obstacles,
    SPINE_THETA * RADIUS,
    0,
    axialArc(4.2),
    corridorLen,
    axialFloorHeight,
    axialFloorBase,
  );

  // 4.2 Roof: covering roof at underside SPINE_ROOF_HEIGHT (base 174.5, height 0.5)
  addCivicSolid(
    corridorGroup,
    mats.ceiling,
    obstacles,
    SPINE_THETA * RADIUS,
    0,
    axialArc(4.2),
    corridorLen,
    axialRoofHeight,
    SPINE_ROOF_HEIGHT,
  );

  // 4.3 Side Windows & Boundary Colliders (reveal habitat, prevent falling)
  addCivicBlock(
    corridorGroup,
    mats.glass,
    (SPINE_THETA - 0.21) * RADIUS,
    0,
    axialArc(0.08),
    corridorLen,
    4.3,
    AXIAL_HEIGHT + 0.1,
  );
  addCivicBlock(
    corridorGroup,
    mats.glass,
    (SPINE_THETA + 0.21) * RADIUS,
    0,
    axialArc(0.08),
    corridorLen,
    4.3,
    AXIAL_HEIGHT + 0.1,
  );
  obstacles.push(
    {
      theta: SPINE_THETA - 0.24,
      y: 0,
      width: axialArc(0.4),
      depth: corridorLen,
      base: AXIAL_HEIGHT,
      height: axialClearHeight,
    },
    {
      theta: SPINE_THETA + 0.24,
      y: 0,
      width: axialArc(0.4),
      depth: corridorLen,
      base: AXIAL_HEIGHT,
      height: axialClearHeight,
    },
  );

  // 4.4 Twin Guide Rails along Y in [-410, 410]
  const railLen = 820;
  addCivicBlock(
    corridorGroup,
    mats.metalBright,
    (SPINE_THETA - axialAngle(0.6)) * RADIUS,
    0,
    axialArc(0.12),
    railLen,
    0.15,
    AXIAL_HEIGHT,
  );
  addCivicBlock(
    corridorGroup,
    mats.metalBright,
    (SPINE_THETA + axialAngle(0.6)) * RADIUS,
    0,
    axialArc(0.12),
    railLen,
    0.15,
    AXIAL_HEIGHT,
  );
  addCivicBlock(
    corridorGroup,
    mats.metalDark,
    SPINE_THETA * RADIUS,
    0,
    axialArc(0.2),
    railLen,
    0.08,
    AXIAL_HEIGHT,
  );

  // 4.5 Batched Repeated Geometry: Structural Arch Ribs & Ceiling Lamps (every 10m)
  const ribCount = Math.floor(railLen / 10) + 1; // 83 ribs
  const ribBoxGeo = new THREE.BoxGeometry(0.16, 0.35, 4.4);
  const leftRibInst = new THREE.InstancedMesh(ribBoxGeo, mats.metalDark, ribCount);
  const rightRibInst = new THREE.InstancedMesh(ribBoxGeo, mats.metalDark, ribCount);
  leftRibInst.castShadow = false;
  rightRibInst.castShadow = false;

  const lampBoxGeo = new THREE.BoxGeometry(0.5, 0.3, 0.08);
  const lampInst = new THREE.InstancedMesh(lampBoxGeo, mats.lampLit, ribCount);
  lampInst.castShadow = false;

  const dummy = new THREE.Object3D();
  for (let k = 0; k < ribCount; k++) {
    const yStation = -410 + k * 10;

    // Left rib vertical post
    dummy.position.copy(surfacePos(SPINE_THETA - 0.205, yStation, AXIAL_HEIGHT + 2.2));
    dummy.rotation.set(0, -(SPINE_THETA - 0.205), 0);
    dummy.updateMatrix();
    leftRibInst.setMatrixAt(k, dummy.matrix);

    // Right rib vertical post
    dummy.position.copy(surfacePos(SPINE_THETA + 0.205, yStation, AXIAL_HEIGHT + 2.2));
    dummy.rotation.set(0, -(SPINE_THETA + 0.205), 0);
    dummy.updateMatrix();
    rightRibInst.setMatrixAt(k, dummy.matrix);

    // Ceiling utility lamp fixture
    dummy.position.copy(surfacePos(SPINE_THETA, yStation, SPINE_ROOF_HEIGHT - 0.1));
    dummy.rotation.set(0, -SPINE_THETA, 0);
    dummy.updateMatrix();
    lampInst.setMatrixAt(k, dummy.matrix);
  }
  leftRibInst.instanceMatrix.needsUpdate = true;
  rightRibInst.instanceMatrix.needsUpdate = true;
  lampInst.instanceMatrix.needsUpdate = true;
  corridorGroup.add(leftRibInst);
  corridorGroup.add(rightRibInst);
  corridorGroup.add(lampInst);

  // =========================================================================
  // 5. MAINTENANCE TROLLEY (Physical body <=2.6m at floor, <=2m at h172, eye clear >0.3m)
  // =========================================================================
  const trolleyGroup = new THREE.Group();
  trolleyGroup.name = "sunline_trolley";
  // At SPINE_THETA: x = 0, z = RADIUS - AXIAL_HEIGHT = 10
  trolleyGroup.position.copy(surfacePos(SPINE_THETA, -410, AXIAL_HEIGHT));
  sunlineGroup.add(trolleyGroup);

  // 5.1 Floor Chassis: width 2.2m (<=2.6m), length 3.2m, thickness 0.1m
  const chassisGeo = new THREE.BoxGeometry(2.2, 3.2, 0.1);
  const chassisMesh = new THREE.Mesh(chassisGeo, mats.metalDark);
  chassisMesh.castShadow = false;
  chassisMesh.position.set(0, 0, 0); // local z=0 corresponds to world h=170
  trolleyGroup.add(chassisMesh);

  // Non-slip tread plate
  const treadGeo = new THREE.BoxGeometry(2.0, 3.0, 0.02);
  const treadMesh = new THREE.Mesh(treadGeo, mats.floor);
  treadMesh.castShadow = false;
  treadMesh.position.set(0, 0, -0.05);
  trolleyGroup.add(treadMesh);

  // Undercarriage rail clamps & drive motor blocks
  const clampGeo = new THREE.BoxGeometry(0.2, 0.6, 0.25);
  const clampL = new THREE.Mesh(clampGeo, mats.metalBright);
  const clampR = new THREE.Mesh(clampGeo, mats.metalBright);
  clampL.castShadow = false;
  clampR.castShadow = false;
  clampL.position.set(-0.6, 0, 0.15);
  clampR.position.set(0.6, 0, 0.15);
  trolleyGroup.add(clampL);
  trolleyGroup.add(clampR);

  // 5.2 Side Grips / Safety Railings (at x = +-0.95m, well clear of eye at x=0, z=-1.7)
  const railPostGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8).rotateX(Math.PI / 2);
  const railBarGeo = new THREE.CylinderGeometry(0.03, 0.03, 3.2, 8);

  for (const sx of [-0.95, 0.95]) {
    const bar = new THREE.Mesh(railBarGeo, mats.hazardAmber);
    bar.castShadow = false;
    bar.position.set(sx, 0, -1.05);
    trolleyGroup.add(bar);

    for (const sy of [-1.5, 0, 1.5]) {
      const post = new THREE.Mesh(railPostGeo, mats.metalDark);
      post.castShadow = false;
      post.position.set(sx, sy, -0.55);
      trolleyGroup.add(post);
    }
  }

  // 5.3 Forward Driver Console (y = 1.25m, x in [-0.4, 0.4], height 0.9m)
  const driverConsoleGeo = new THREE.BoxGeometry(0.8, 0.35, 0.85);
  const driverConsole = new THREE.Mesh(driverConsoleGeo, mats.metalDark);
  driverConsole.castShadow = false;
  driverConsole.position.set(0, 1.25, -0.45);
  trolleyGroup.add(driverConsole);

  // Speedometer display screen facing backward toward driver
  const speedoGeo = new THREE.PlaneGeometry(0.6, 0.2);
  const speedoMat = createSignMaterial("MAG-RAIL TROLLEY MT-01\nW: DRIVE  ·  S: REVERSE", "#12201b", "#38bdf8");
  const speedo = new THREE.Mesh(speedoGeo, speedoMat);
  speedo.castShadow = false;
  speedo.position.set(0, 1.07, -0.75);
  speedo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, -1, 0),
  ));
  trolleyGroup.add(speedo);

  // 5.4 Rear Spare Emitter Container (y in [-1.4, -0.7], x in [-0.4, 0.4])
  const caseBoxGeo = new THREE.BoxGeometry(1.0, 0.7, 0.35);
  const caseBox = new THREE.Mesh(caseBoxGeo, mats.metalDark);
  caseBox.castShadow = false;
  caseBox.position.set(0, -1.05, -0.2);
  trolleyGroup.add(caseBox);

  // Explicit replacement emitter cartridge secured aboard the trolley
  const spareEmitterGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 12);
  spareEmitterGeo.rotateZ(Math.PI / 2);
  const spareEmitterMesh = new THREE.Mesh(spareEmitterGeo, mats.coreLit);
  spareEmitterMesh.name = "trolley_spare_emitter";
  spareEmitterMesh.castShadow = false;
  spareEmitterMesh.receiveShadow = false;
  spareEmitterMesh.position.set(0, -1.05, -0.4);
  trolleyGroup.add(spareEmitterMesh);

  // Hazard bumpers (front and rear)
  const bumperGeo = new THREE.BoxGeometry(2.3, 0.15, 0.15);
  const frontBumper = new THREE.Mesh(bumperGeo, mats.hazardAmber);
  const rearBumper = new THREE.Mesh(bumperGeo, mats.hazardAmber);
  frontBumper.castShadow = false;
  rearBumper.castShadow = false;
  frontBumper.position.set(0, 1.62, 0);
  rearBumper.position.set(0, -1.62, 0);
  trolleyGroup.add(frontBumper);
  trolleyGroup.add(rearBumper);

  // =========================================================================
  // 6. 9-SECTION SUNLINE CORE ARRAY (cover LENGTH - 8 = 892m along cylinder axis)
  // =========================================================================
  const sunlineCoreArray = new THREE.Group();
  sunlineCoreArray.name = "sunline_core_array";
  sunlineGroup.add(sunlineCoreArray);

  let targetCoreMesh = null;
  let targetGlowMesh = null;
  let targetDarkCoreMesh = null;

  const moduleLen = SUNLINE_MODULE_LENGTH;
  const coreGeo = new THREE.CylinderGeometry(1.6, 1.6, moduleLen, 24);
  const glowGeo = new THREE.CylinderGeometry(3.6, 3.6, moduleLen, 24, 1, true);

  for (let i = 0; i < SUNLINE_MODULE_COUNT; i++) {
    const moduleCenterY =
      -(LENGTH - 8) / 2 + SUNLINE_MODULE_LENGTH * (i + 0.5);

    const moduleGroup = new THREE.Group();
    moduleGroup.name = `sunline_module_${i}`;
    sunlineCoreArray.add(moduleGroup);

    // Dark casing ring collars and structural braces at module joints
    const collarGeo = new THREE.CylinderGeometry(1.7, 1.7, 0.8, 24, 1, true);
    const collar1 = new THREE.Mesh(collarGeo, mats.metalDark);
    const collar2 = new THREE.Mesh(collarGeo, mats.metalDark);
    collar1.castShadow = false;
    collar2.castShadow = false;
    collar1.position.set(0, moduleCenterY - moduleLen / 2 + 0.5, 0);
    collar2.position.set(0, moduleCenterY + moduleLen / 2 - 0.5, 0);
    collar1.name = `sunline_casing_${i}`;
    moduleGroup.add(collar1);
    moduleGroup.add(collar2);

    if (i === SERVICE_MODULE_INDEX) {
      // Module 1 (SL-02): Isolatable target section
      targetCoreMesh = new THREE.Mesh(coreGeo, mats.coreLit);
      targetCoreMesh.name = `sunline_core_${i}`;
      targetCoreMesh.castShadow = false;
      targetCoreMesh.receiveShadow = false;
      targetCoreMesh.position.set(0, moduleCenterY, 0);
      moduleGroup.add(targetCoreMesh);

      targetGlowMesh = new THREE.Mesh(glowGeo, mats.glowHalo);
      targetGlowMesh.name = `sunline_glow_${i}`;
      targetGlowMesh.castShadow = false;
      targetGlowMesh.receiveShadow = false;
      targetGlowMesh.position.set(0, moduleCenterY, 0);
      moduleGroup.add(targetGlowMesh);

      // Dark offline core casing shown when unlit
      targetDarkCoreMesh = new THREE.Mesh(coreGeo, mats.coreDark);
      targetDarkCoreMesh.name = `sunline_core_dark_${i}`;
      targetDarkCoreMesh.castShadow = false;
      targetDarkCoreMesh.receiveShadow = false;
      targetDarkCoreMesh.position.set(0, moduleCenterY, 0);
      targetDarkCoreMesh.visible = false;
      moduleGroup.add(targetDarkCoreMesh);
    } else {
      // Other 8 modules: Always lit
      const litCore = new THREE.Mesh(coreGeo, mats.coreLit);
      litCore.name = `sunline_core_${i}`;
      litCore.castShadow = false;
      litCore.receiveShadow = false;
      litCore.position.set(0, moduleCenterY, 0);
      moduleGroup.add(litCore);

      const litGlow = new THREE.Mesh(glowGeo, mats.glowHalo);
      litGlow.name = `sunline_glow_${i}`;
      litGlow.castShadow = false;
      litGlow.receiveShadow = false;
      litGlow.position.set(0, moduleCenterY, 0);
      moduleGroup.add(litGlow);
    }
  }

  // =========================================================================
  // 7. MODULE SL-02 SIDE SERVICE PANEL (at SERVICE_MODULE_Y, visible from trolley)
  // =========================================================================
  const panelGroup = new THREE.Group();
  panelGroup.name = "sunline_panel_sl02";
  sunlineGroup.add(panelGroup);

  // Positioned along the side of the rail corridor (x = 1.8, h = 171.4, eye clearance > 0.3m)
  const panelHousingGeo = new THREE.BoxGeometry(0.3, 1.4, 1.2);
  const panelHousing = new THREE.Mesh(panelHousingGeo, mats.metalDark);
  panelHousing.castShadow = false;
  panelHousing.position.copy(surfacePos(SPINE_THETA + axialAngle(1.8), SERVICE_MODULE_Y, AXIAL_HEIGHT + 1.4));
  panelGroup.add(panelHousing);

  // Service panel indicator sign with prominent [E] marker
  const panelSignPos = surfacePos(SPINE_THETA + axialAngle(1.64), SERVICE_MODULE_Y, AXIAL_HEIGHT + 1.8);
  createOrientedSign(
    panelGroup,
    "SUNLINE MODULE SL-02 · SERVICE ACCESS\n[E] ACCESS EMITTER BAY",
    panelSignPos,
    "west",
    1.3,
    0.55,
    "#262114",
  );

  // Receptacle slot for replacement emitter cartridge
  const sl02EmitterGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 12);
  sl02EmitterGeo.rotateZ(Math.PI / 2);
  const sl02EmitterMesh = new THREE.Mesh(sl02EmitterGeo, mats.coreLit);
  sl02EmitterMesh.name = "sunline_panel_emitter";
  sl02EmitterMesh.castShadow = false;
  sl02EmitterMesh.receiveShadow = false;
  sl02EmitterMesh.position.copy(surfacePos(SPINE_THETA + axialAngle(1.68), SERVICE_MODULE_Y, AXIAL_HEIGHT + 1.1));
  sl02EmitterMesh.visible = false;
  panelGroup.add(sl02EmitterMesh);

  // =========================================================================
  // 8. VISUAL PHASE SYNCHRONIZATION
  // =========================================================================
  function syncVisualPhase(phase) {
    const isTargetLit = phase === "available" || phase === "complete";
    if (targetCoreMesh) targetCoreMesh.visible = isTargetLit;
    if (targetGlowMesh) targetGlowMesh.visible = isTargetLit;
    if (targetDarkCoreMesh) targetDarkCoreMesh.visible = !isTargetLit;

    // Trolley carries spare emitter in available and isolated phases; consumed in replaced/complete
    if (spareEmitterMesh) {
      spareEmitterMesh.visible = phase === "available" || phase === "isolated";
    }

    // SL-02 panel shows newly installed emitter in replaced and complete phases
    if (sl02EmitterMesh) {
      sl02EmitterMesh.visible = phase === "replaced" || phase === "complete";
    }

    // Hub console status indicator colors
    let indicatorMat = mats.statusAmber;
    if (phase === "isolated") {
      indicatorMat = mats.statusRed;
    } else if (phase === "complete") {
      indicatorMat = mats.statusGreen;
    }
    if (hubAIndicator) hubAIndicator.material = indicatorMat;
    if (hubBIndicator) hubBIndicator.material = indicatorMat;
    const districtStatus = state.getDistrictStatus();
    for (let i = 0; i < consoleDisplays.length; i++) {
      consoleDisplays[i].update(phase, districtStatus);
    }
  }

  // Synchronize initial state visuals
  syncVisualPhase(state.getPhase());

  // =========================================================================
  // 9. LIFECYCLE, ACTIVE TOGGLE & UPDATE
  // =========================================================================
  let active = false;
  trolleyGroup.visible = false;

  function setActive(val) {
    active = !!val;
    if (!active) trolleyGroup.visible = false;
  }

  function update(dt, elapsed, playerState) {
    const mounted = active && playerState?.traversalMode === "trolley";
    trolleyGroup.visible = !!mounted;
    if (mounted) {
      trolleyGroup.position.y = playerState.y;
      trolleyGroup.rotation.z = playerState.railDirection < 0 ? Math.PI : 0;
    }
  }

  function getPhase() {
    return state.getPhase();
  }

  function getDistrictStatus() {
    return state.getDistrictStatus();
  }

  function getView(playerState) {
    return state.getView(playerState);
  }

  function interact(playerState) {
    const result = state.interact(playerState);
    if (result && result.changed) {
      syncVisualPhase(state.getPhase());
    }
    return result;
  }

  return {
    obstacles,
    getPhase,
    getDistrictStatus,
    getView,
    interact,
    setActive,
    update,
  };
}
