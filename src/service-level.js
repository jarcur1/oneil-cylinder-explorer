import * as THREE from "three";
import { MERIDIAN_PLACEMENT, RADIUS } from "./habitat.js";
import { addCivicBlock } from "./civic-primitives.js";
import { addOrientedPanel, surfacePos, surfaceUp } from "./surface.js";
import { SERVICE_FLOOR, SERVICE_ACCESS } from "./service-layout.js";

// =============================================================================
// PROCEDURAL INDUSTRIAL TEXTURE HELPERS
// =============================================================================

function createSignTexture({
  title,
  subtitle = "",
  bgColor = "#0f172a",
  textColor = "#f8fafc",
  accentColor = "#38bdf8",
  border = true,
  stripe = false,
  badge = "",
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");

  // Solid background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 1024, 320);

  // Industrial hazard / caution top stripe
  if (stripe) {
    const stripeW = 28;
    for (let x = -320; x < 1024 + 100; x += stripeW * 2) {
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeW, 0);
      ctx.lineTo(x + stripeW + 28, 28);
      ctx.lineTo(x + 28, 28);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Outer border
  if (border) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 1000, 296);
  }

  // Top-right status / sector badge
  if (badge) {
    ctx.fillStyle = accentColor;
    ctx.fillRect(800, 24, 200, 48);
    ctx.fillStyle = bgColor;
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge, 900, 48);
  }

  // Main title
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 50px system-ui, -apple-system, sans-serif";
  const titleY = subtitle ? 116 : 160;
  ctx.fillText(title, 512, titleY, 940);

  // Subtitle / instructions
  if (subtitle) {
    ctx.fillStyle = accentColor;
    ctx.font = "600 32px monospace, system-ui, sans-serif";
    ctx.fillText(subtitle, 512, 215, 940);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLiftPadTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  // Base industrial slate
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 512, 512);

  // Perimeter caution stripes
  const borderSize = 36;
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, 0, 512, borderSize);
  ctx.fillRect(0, 512 - borderSize, 512, borderSize);
  ctx.fillRect(0, 0, borderSize, 512);
  ctx.fillRect(512 - borderSize, 0, borderSize, 512);

  ctx.fillStyle = "#0f172a";
  for (let i = 0; i < 512; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i + 48, borderSize);
    ctx.lineTo(i + 24, borderSize);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(i, 512 - borderSize);
    ctx.lineTo(i + 24, 512 - borderSize);
    ctx.lineTo(i + 48, 512);
    ctx.lineTo(i + 24, 512);
    ctx.fill();
  }

  // Inner landing circle
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(256, 256, 175, 0, Math.PI * 2);
  ctx.stroke();

  // Central lift icon
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 96px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("▲▼", 256, 225);

  ctx.font = "bold 34px monospace";
  ctx.fillText("SERVICE LIFT", 256, 315);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHazardStripeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = "#0f172a";
  const stripeW = 32;
  for (let x = -64; x < 256 + 64; x += stripeW * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + stripeW, 0);
    ctx.lineTo(x + stripeW + 64, 64);
    ctx.lineTo(x + 64, 64);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// =============================================================================
// GEOMETRY & ORIENTATION UTILITIES
// =============================================================================

function addWallSign(parent, texture, s, y, h, width, height, facing) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
  });
  return addOrientedPanel(
    parent,
    mat,
    surfacePos(s / RADIUS, y, h),
    facing,
    width,
    height,
  );
}

function addFloorDecal(parent, texture, s, y, h, width, depth) {
  const theta = s / RADIUS;
  const up = surfaceUp(theta);
  const east = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const north = new THREE.Vector3(0, 1, 0);

  // Local X = east, Local Y = north, Local Z = up (inward toward axis)
  const matrix = new THREE.Matrix4().makeBasis(east, north, up);
  matrix.setPosition(surfacePos(theta, y, h));

  const geo = new THREE.PlaneGeometry(width, depth);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.applyMatrix4(matrix);
  parent.add(mesh);
  return mesh;
}

// A fixed east/up/south mount keeps the rotor's local Z shaft normal to its casing.
function addSouthFacingRotor(parent, s, y, height, name) {
  const theta = s / RADIUS;
  const mount = new THREE.Group();
  mount.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)),
      surfaceUp(theta),
      new THREE.Vector3(0, -1, 0),
    ),
  );
  mount.position.copy(surfacePos(theta, y, height));
  const rotor = new THREE.Group();
  rotor.name = name;
  mount.add(rotor);
  parent.add(mount);
  return rotor;
}

// =============================================================================
// SERVICE LEVEL FACTORY
// =============================================================================

/**
 * Creates the enclosed Meridian Service Level slice (-8m) and surface entry pavilion.
 *
 * @param {THREE.Object3D} parent
 * @returns {{ obstacles: Array<{ theta: number, y: number, width: number, depth: number, height: number, base: number }>, update: (dt: number, elapsed: number) => void }}
 */
export function createServiceLevel(parent) {
  const serviceRoot = new THREE.Group();
  serviceRoot.name = "serviceLevelRoot";
  parent.add(serviceRoot);

  const surfacePavilionGroup = new THREE.Group();
  surfacePavilionGroup.name = "serviceSurfacePavilion";
  serviceRoot.add(surfacePavilionGroup);

  const undergroundGroup = new THREE.Group();
  undergroundGroup.name = "serviceUnderground";
  undergroundGroup.userData.atmosphereDynamic = true;
  serviceRoot.add(undergroundGroup);

  const obstacles = [];
  function registerSolid(s, y, width, depth, height, base) {
    obstacles.push({
      theta: s / RADIUS,
      y,
      width,
      depth,
      height,
      base,
    });
  }

  // Shared textures
  const liftPadTex = createLiftPadTexture();
  const hazardStripeTex = createHazardStripeTexture();

  // Shared materials
  const mats = {
    // Concrete slabs
    corridorFloor: new THREE.MeshStandardMaterial({
      color: 0x272c30,
      roughness: 0.88,
      metalness: 0.12,
    }),
    waterFloor: new THREE.MeshStandardMaterial({
      color: 0x1e3038,
      roughness: 0.72,
      metalness: 0.18,
    }),
    powerFloor: new THREE.MeshStandardMaterial({
      color: 0x2a2824,
      roughness: 0.82,
      metalness: 0.15,
    }),
    ceilingConcrete: new THREE.MeshStandardMaterial({
      color: 0x1b2024,
      roughness: 0.9,
      metalness: 0.18,
    }),
    wallConcrete: new THREE.MeshStandardMaterial({
      color: 0x363d44,
      roughness: 0.84,
      metalness: 0.15,
    }),
    wallDivider: new THREE.MeshStandardMaterial({
      color: 0x2f363c,
      roughness: 0.8,
      metalness: 0.2,
    }),

    // Architectural & Industrial metals
    darkSteel: new THREE.MeshStandardMaterial({
      color: 0x1a2126,
      roughness: 0.44,
      metalness: 0.72,
    }),
    structuralBeams: new THREE.MeshStandardMaterial({
      color: 0x242d33,
      roughness: 0.5,
      metalness: 0.65,
    }),
    waterPlantTeal: new THREE.MeshStandardMaterial({
      color: 0x184e57,
      roughness: 0.38,
      metalness: 0.62,
    }),
    powerPlantAmber: new THREE.MeshStandardMaterial({
      color: 0x473924,
      roughness: 0.42,
      metalness: 0.6,
    }),
    stainlessTank: new THREE.MeshStandardMaterial({
      color: 0x566066,
      roughness: 0.35,
      metalness: 0.78,
    }),
    brassFitting: new THREE.MeshStandardMaterial({
      color: 0xb59857,
      roughness: 0.32,
      metalness: 0.8,
    }),
    copperBusbar: new THREE.MeshStandardMaterial({
      color: 0xb87333,
      roughness: 0.28,
      metalness: 0.86,
    }),
    ceramicInsulator: new THREE.MeshStandardMaterial({
      color: 0x7c3826,
      roughness: 0.3,
      metalness: 0.1,
    }),

    // Route lines & Luminous Indicators
    routeLineCyan: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    routeLineAmber: new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
    routeLineWhite: new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
    glowWaterCyan: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    glowPowerAmber: new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
    statusGreen: new THREE.MeshBasicMaterial({ color: 0x22c55e }),

    // Surface pavilion civic palette
    pavilionLimestone: new THREE.MeshStandardMaterial({
      color: 0xded6c6,
      roughness: 0.8,
      metalness: 0.05,
    }),
    pavilionBronze: new THREE.MeshStandardMaterial({
      color: 0x2b2824,
      roughness: 0.48,
      metalness: 0.58,
    }),
    pavilionGlass: new THREE.MeshStandardMaterial({
      color: 0x4aa3ad,
      roughness: 0.18,
      metalness: 0.4,
      transparent: true,
      opacity: 0.72,
    }),
    hazardStripe: new THREE.MeshBasicMaterial({
      map: hazardStripeTex,
      side: THREE.DoubleSide,
    }),
  };

  // Shared Box Geometry for unit boxes
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

  // Animated elements registry
  const animatedRotors = [];

  // ===========================================================================
  // 1. SURFACE ENTRY PAVILION (Layer 0, Centered at s = -14, y = -30)
  // ===========================================================================
  {
    const PAV_S = SERVICE_ACCESS.theta * RADIUS;
    const PAV_Y = MERIDIAN_PLACEMENT.toLocalY(SERVICE_ACCESS.y);
    const PAV_W = 5.2;
    const PAV_D = 5.2;
    const PAV_H = 3.4;

    // Raised limestone base plinth
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionLimestone,
      PAV_S,
      PAV_Y,
      PAV_W + 0.4,
      PAV_D + 0.4,
      0.15,
      0.0,
    );

    // North wall
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionLimestone,
      PAV_S,
      PAV_Y + PAV_D / 2 - 0.2,
      PAV_W,
      0.4,
      PAV_H,
      0.15,
    );
    registerSolid(PAV_S, PAV_Y + PAV_D / 2 - 0.2, PAV_W, 0.4, PAV_H, 0.0);

    // West wall
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionLimestone,
      PAV_S - PAV_W / 2 + 0.2,
      PAV_Y,
      0.4,
      PAV_D,
      PAV_H,
      0.15,
    );
    registerSolid(PAV_S - PAV_W / 2 + 0.2, PAV_Y, 0.4, PAV_D, PAV_H, 0.0);

    // East wall
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionLimestone,
      PAV_S + PAV_W / 2 - 0.2,
      PAV_Y,
      0.4,
      PAV_D,
      PAV_H,
      0.15,
    );
    registerSolid(PAV_S + PAV_W / 2 - 0.2, PAV_Y, 0.4, PAV_D, PAV_H, 0.0);

    // South doorway: open entry with framing corner pillars (3.2m clear opening)
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionBronze,
      PAV_S - 2.1,
      PAV_Y - PAV_D / 2 + 0.2,
      0.8,
      0.4,
      PAV_H,
      0.15,
    );
    registerSolid(PAV_S - 2.1, PAV_Y - PAV_D / 2 + 0.2, 0.8, 0.4, PAV_H, 0.0);

    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionBronze,
      PAV_S + 2.1,
      PAV_Y - PAV_D / 2 + 0.2,
      0.8,
      0.4,
      PAV_H,
      0.15,
    );
    registerSolid(PAV_S + 2.1, PAV_Y - PAV_D / 2 + 0.2, 0.8, 0.4, PAV_H, 0.0);

    // Doorway overhead lintel
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionBronze,
      PAV_S,
      PAV_Y - PAV_D / 2 + 0.2,
      PAV_W,
      0.4,
      0.7,
      PAV_H - 0.55,
    );
    registerSolid(
      PAV_S, PAV_Y - PAV_D / 2 + 0.2, PAV_W, 0.4, 0.7, PAV_H - 0.55,
    );

    // Architectural Roof Canopy
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionBronze,
      PAV_S,
      PAV_Y,
      PAV_W + 0.8,
      PAV_D + 0.8,
      0.35,
      PAV_H + 0.15,
    );
    registerSolid(PAV_S, PAV_Y, PAV_W + 0.8, PAV_D + 0.8, 0.35, PAV_H + 0.15);
    addCivicBlock(
      surfacePavilionGroup,
      mats.pavilionGlass,
      PAV_S,
      PAV_Y,
      PAV_W - 0.6,
      PAV_D - 0.6,
      0.1,
      PAV_H + 0.35,
    );

    // Lift platform pad (centered at s = -14, y = -30)
    addFloorDecal(
      surfacePavilionGroup,
      liftPadTex,
      PAV_S,
      PAV_Y,
      0.19,
      2.5,
      2.5,
    );
    addCivicBlock(
      surfacePavilionGroup,
      mats.darkSteel,
      PAV_S,
      PAV_Y,
      2.6,
      2.6,
      0.08,
      0.08,
    );

    // Entry Sign above the south doorway
    const surfaceEntrySignTex = createSignTexture({
      title: "MERIDIAN SERVICE ACCESS",
      subtitle: "PRESS [E] · SERVICE LIFT TO LEVEL -8",
      bgColor: "#152e35",
      textColor: "#f1f5f9",
      accentColor: "#38bdf8",
      stripe: true,
      badge: "LIFT 01",
    });
    addWallSign(
      surfacePavilionGroup,
      surfaceEntrySignTex,
      PAV_S,
      PAV_Y - PAV_D / 2 - 0.05,
      2.65,
      3.8,
      1.1,
      "south",
    );

    // Interior instruction sign beside the lift pad
    const surfacePadSignTex = createSignTexture({
      title: "SERVICE LEVEL ACCESS",
      subtitle: "[E] DESCEND TO WATER & POWER PLANTS",
      bgColor: "#0f172a",
      textColor: "#ffffff",
      accentColor: "#f59e0b",
      badge: "-8.0 M",
    });
    addWallSign(
      surfacePavilionGroup,
      surfacePadSignTex,
      PAV_S - PAV_W / 2 + 0.45,
      PAV_Y,
      1.8,
      2.6,
      0.8,
      "east",
    );
  }

  // ===========================================================================
  // 2. UNDERGROUND ENVELOPE: FLOORS & CEILINGS (Layer 1)
  // All floors walkable at SERVICE_FLOOR = -8.0; ceilings at h = -3.8 (clear height 4.2m)
  // ===========================================================================
  {
    const FLOOR_BASE = SERVICE_FLOOR - 0.6;
    const FLOOR_THICKNESS = 0.6; // top is at -8.0
    const CEIL_BASE = -3.8;
    const CEIL_VISUAL_THICKNESS = 0.6; // underside visible at -3.8
    const CEIL_COLLIDER_HEIGHT = 3.2; // solid ceiling blocker up to living surface deck (-0.6)

    // 2.1 Main Corridor (s: [-17.5, -10.5], y: [-34, 23]) -> width 7.0m, center s = -14, depth 57m, center y = -5.5
    addCivicBlock(
      undergroundGroup,
      mats.corridorFloor,
      -14.0,
      -5.5,
      7.2,
      57.2,
      FLOOR_THICKNESS,
      FLOOR_BASE,
    );
    registerSolid(-14.0, -5.5, 7.2, 57.2, FLOOR_THICKNESS, FLOOR_BASE);

    addCivicBlock(
      undergroundGroup,
      mats.ceilingConcrete,
      -14.0,
      -5.5,
      7.2,
      57.2,
      CEIL_VISUAL_THICKNESS,
      CEIL_BASE,
    );
    registerSolid(-14.0, -5.5, 7.2, 57.2, CEIL_COLLIDER_HEIGHT, CEIL_BASE);

    // 2.2 West Water Room (s: [-33.5, -17.5], y: [-3, 15]) -> width 16.0m, center s = -25.5, depth 18.0m, center y = 6.0
    addCivicBlock(
      undergroundGroup,
      mats.waterFloor,
      -25.5,
      6.0,
      16.2,
      18.2,
      FLOOR_THICKNESS,
      FLOOR_BASE,
    );
    registerSolid(-25.5, 6.0, 16.2, 18.2, FLOOR_THICKNESS, FLOOR_BASE);

    addCivicBlock(
      undergroundGroup,
      mats.ceilingConcrete,
      -25.5,
      6.0,
      16.2,
      18.2,
      CEIL_VISUAL_THICKNESS,
      CEIL_BASE,
    );
    registerSolid(-25.5, 6.0, 16.2, 18.2, CEIL_COLLIDER_HEIGHT, CEIL_BASE);

    // 2.3 East Power Room (s: [-10.5, 7.5], y: [-3, 15]) -> width 18.0m, center s = -1.5, depth 18.0m, center y = 6.0
    addCivicBlock(
      undergroundGroup,
      mats.powerFloor,
      -1.5,
      6.0,
      18.2,
      18.2,
      FLOOR_THICKNESS,
      FLOOR_BASE,
    );
    registerSolid(-1.5, 6.0, 18.2, 18.2, FLOOR_THICKNESS, FLOOR_BASE);

    addCivicBlock(
      undergroundGroup,
      mats.ceilingConcrete,
      -1.5,
      6.0,
      18.2,
      18.2,
      CEIL_VISUAL_THICKNESS,
      CEIL_BASE,
    );
    registerSolid(-1.5, 6.0, 18.2, 18.2, CEIL_COLLIDER_HEIGHT, CEIL_BASE);
  }

  // ===========================================================================
  // 3. UNDERGROUND ENVELOPE: BOUNDARY WALLS & DIVIDERS (Layer 1)
  // Fully enclosed: no escape into unmodeled space; wall height covers [-8.6, -3.2]
  // ===========================================================================
  {
    const WALL_BASE = -8.6;
    const WALL_H = 8.0; // extends from -8.6 all the way to living surface deck (-0.6)

    // 3.1 Corridor Terminus Walls (South & North)
    // South Wall at y = -34.0 (centered y = -34.4, depth 0.8)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -14.0,
      -34.4,
      7.6,
      0.8,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-14.0, -34.4, 7.6, 0.8, WALL_H, WALL_BASE);

    // North Wall at y = 23.0 (centered y = 23.4, depth 0.8)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -14.0,
      23.4,
      7.6,
      0.8,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-14.0, 23.4, 7.6, 0.8, WALL_H, WALL_BASE);

    // 3.2 Corridor Outer Flanks South of Rooms (y: [-34, -3], depth 31m, center y = -18.5)
    // West Wall at s = -17.5 (centered s = -17.9, width 0.8)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -17.9,
      -18.5,
      0.8,
      31.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-17.9, -18.5, 0.8, 31.0, WALL_H, WALL_BASE);

    // East Wall at s = -10.5 (centered s = -10.1, width 0.8)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -10.1,
      -18.5,
      0.8,
      31.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-10.1, -18.5, 0.8, 31.0, WALL_H, WALL_BASE);

    // 3.3 Corridor Outer Flanks North of Rooms (y: [15, 23], depth 8m, center y = 19.0)
    // West Wall at s = -17.5
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -17.9,
      19.0,
      0.8,
      8.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-17.9, 19.0, 0.8, 8.0, WALL_H, WALL_BASE);

    // East Wall at s = -10.5
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -10.1,
      19.0,
      0.8,
      8.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-10.1, 19.0, 0.8, 8.0, WALL_H, WALL_BASE);

    // 3.4 Dividing Walls Between Corridor and Rooms (y: [-3, 15], Doorways at y = [3, 9])
    // West dividing wall: south segment y: [-3, 3] (center y = 0, depth 6.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallDivider,
      -17.9,
      0.0,
      0.8,
      6.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-17.9, 0.0, 0.8, 6.0, WALL_H, WALL_BASE);

    // West dividing wall: north segment y: [9, 15] (center y = 12, depth 6.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallDivider,
      -17.9,
      12.0,
      0.8,
      6.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-17.9, 12.0, 0.8, 6.0, WALL_H, WALL_BASE);

    // Doorway headers preserve four metres of clear height.
    addCivicBlock(
      undergroundGroup,
      mats.structuralBeams,
      -17.9,
      6.0,
      0.8,
      6.0,
      0.2,
      -4.0,
    );
    registerSolid(-17.9, 6.0, 0.8, 6.0, 0.2, -4.0);

    // East dividing wall: south segment y: [-3, 3]
    addCivicBlock(
      undergroundGroup,
      mats.wallDivider,
      -10.1,
      0.0,
      0.8,
      6.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-10.1, 0.0, 0.8, 6.0, WALL_H, WALL_BASE);

    // East dividing wall: north segment y: [9, 15]
    addCivicBlock(
      undergroundGroup,
      mats.wallDivider,
      -10.1,
      12.0,
      0.8,
      6.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-10.1, 12.0, 0.8, 6.0, WALL_H, WALL_BASE);

    // East doorway overhead header beam across y: [3, 9]
    addCivicBlock(
      undergroundGroup,
      mats.structuralBeams,
      -10.1,
      6.0,
      0.8,
      6.0,
      0.2,
      -4.0,
    );
    registerSolid(-10.1, 6.0, 0.8, 6.0, 0.2, -4.0);

    // 3.5 West Water Room Outer Walls
    // Outer West Wall at s = -33.5 (centered s = -33.9, width 0.8, depth 18.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -33.9,
      6.0,
      0.8,
      18.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-33.9, 6.0, 0.8, 18.0, WALL_H, WALL_BASE);

    // Outer South Wall at y = -3.0 (centered y = -3.4, depth 0.8, width 16.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -25.5,
      -3.4,
      16.0,
      0.8,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-25.5, -3.4, 16.0, 0.8, WALL_H, WALL_BASE);

    // Outer North Wall at y = 15.0 (centered y = 15.4, depth 0.8, width 16.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -25.5,
      15.4,
      16.0,
      0.8,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-25.5, 15.4, 16.0, 0.8, WALL_H, WALL_BASE);

    // 3.6 East Power Room Outer Walls
    // Outer East Wall at s = 7.5 (centered s = 7.9, width 0.8, depth 18.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      7.9,
      6.0,
      0.8,
      18.0,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(7.9, 6.0, 0.8, 18.0, WALL_H, WALL_BASE);

    // Outer South Wall at y = -3.0 (centered y = -3.4, depth 0.8, width 18.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -1.5,
      -3.4,
      18.0,
      0.8,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-1.5, -3.4, 18.0, 0.8, WALL_H, WALL_BASE);

    // Outer North Wall at y = 15.0 (centered y = 15.4, depth 0.8, width 18.0)
    addCivicBlock(
      undergroundGroup,
      mats.wallConcrete,
      -1.5,
      15.4,
      18.0,
      0.8,
      WALL_H,
      WALL_BASE,
    );
    registerSolid(-1.5, 15.4, 18.0, 0.8, WALL_H, WALL_BASE);
  }

  // ===========================================================================
  // 4. UNDERGROUND RETURN LIFT LANDING & SIGNAGE (s = -14, y = -30, h = -8.0)
  // Facing North directly down the service corridor toward the rooms
  // ===========================================================================
  {
    // Return Lift Platform Pad
    addFloorDecal(undergroundGroup, liftPadTex, -14.0, -30.0, -7.89, 2.5, 2.5);
    addCivicBlock(
      undergroundGroup,
      mats.darkSteel,
      -14.0,
      -30.0,
      2.6,
      2.6,
      0.08,
      -8.0,
    );

    // Stanchions framing the pad
    addCivicBlock(
      undergroundGroup,
      mats.structuralBeams,
      -15.4,
      -31.4,
      0.2,
      0.2,
      1.2,
      -8.0,
    );
    addCivicBlock(
      undergroundGroup,
      mats.structuralBeams,
      -12.6,
      -31.4,
      0.2,
      0.2,
      1.2,
      -8.0,
    );

    // Return Lift Sign on the South Wall right behind the landing
    const returnSignTex = createSignTexture({
      title: "MERIDIAN SURFACE RETURN LIFT",
      subtitle: "PRESS [E] TO ASCEND TO CIVIC PLAZA",
      bgColor: "#0f172a",
      textColor: "#f8fafc",
      accentColor: "#38bdf8",
      stripe: true,
      badge: "SURFACE",
    });
    addWallSign(
      undergroundGroup,
      returnSignTex,
      -14.0,
      -33.9,
      -6.2,
      3.8,
      1.1,
      "north",
    );

    // Directional corridor sign on the West Wall at the landing
    const corridorDirSignTex = createSignTexture({
      title: "MERIDIAN SERVICE LEVEL · LEVEL -8",
      subtitle: "↑ NORTH TO WATER (W-1) & POWER (E-1) PLANTS",
      bgColor: "#1e293b",
      textColor: "#ffffff",
      accentColor: "#f59e0b",
      badge: "SECTOR 0",
    });
    addWallSign(
      undergroundGroup,
      corridorDirSignTex,
      -17.45,
      -27.0,
      -6.2,
      3.6,
      1.0,
      "east",
    );
  }

  // ===========================================================================
  // 5. MAIN CORRIDOR ARCHITECTURE & WAYFINDING (s: [-17.5, -10.5], y: [-34, 23])
  // ===========================================================================
  {
    // 5.1 Structural Steel Portal Frames (Rib arches every 6m)
    const ribPositions = [-24, -18, -12, -6, 0, 12, 18];
    for (const yRib of ribPositions) {
      // West column post
      addCivicBlock(
        undergroundGroup,
        mats.structuralBeams,
        -17.45,
        yRib,
        0.2,
        0.5,
        4.0,
        -8.0,
      );
      registerSolid(-17.45, yRib, 0.2, 0.5, 4.0, -8.0);
      // East column post
      addCivicBlock(
        undergroundGroup,
        mats.structuralBeams,
        -10.55,
        yRib,
        0.2,
        0.5,
        4.0,
        -8.0,
      );
      registerSolid(-10.55, yRib, 0.2, 0.5, 4.0, -8.0);
      // Ceiling crossbar girder
      addCivicBlock(
        undergroundGroup,
        mats.structuralBeams,
        -14.0,
        yRib,
        6.6,
        0.5,
        0.2,
        -4.0,
      );
      registerSolid(-14, yRib, 6.6, 0.5, 0.2, -4.0);
    }

    // Water mains and a copper cable tray stay against the corridor walls.
    const pipeGeometry = new THREE.CylinderGeometry(0.11, 0.11, 54, 12);
    const waterMain = new THREE.Mesh(pipeGeometry, mats.waterPlantTeal);
    waterMain.position.copy(surfacePos(-17.42 / RADIUS, -5.5, -5.0));
    undergroundGroup.add(waterMain);
    registerSolid(-17.42, -5.5, 0.22, 54, 0.22, -5.11);
    addCivicBlock(undergroundGroup, mats.copperBusbar, -10.63, -5.5, 0.16, 54, 0.16, -5.1);
    registerSolid(-10.63, -5.5, 0.16, 54, 0.16, -5.1);

    // 5.2 Floor Route Markings
    // Cyan route line (to Water Treatment Plant): runs north along west side, then turns west into room at y = 6
    addCivicBlock(
      undergroundGroup,
      mats.routeLineCyan,
      -15.0,
      -11.0,
      0.25,
      34.0,
      0.02,
      -7.98,
    );
    addCivicBlock(
      undergroundGroup,
      mats.routeLineCyan,
      -20.25,
      6.0,
      10.5,
      0.25,
      0.02,
      -7.98,
    );

    // Amber route line (to Power Substation): runs north along east side, then turns east into room at y = 6
    addCivicBlock(
      undergroundGroup,
      mats.routeLineAmber,
      -13.0,
      -11.0,
      0.25,
      34.0,
      0.02,
      -7.98,
    );
    addCivicBlock(
      undergroundGroup,
      mats.routeLineAmber,
      -7.25,
      6.0,
      11.5,
      0.25,
      0.02,
      -7.98,
    );

    // Center walkway dashed line down corridor
    for (let yDash = -28; yDash <= 20; yDash += 4) {
      addCivicBlock(
        undergroundGroup,
        mats.routeLineWhite,
        -14.0,
        yDash,
        0.18,
        2.0,
        0.02,
        -7.98,
      );
    }

    // 5.3 Doorway Lintel Signs at Junction (y = 6)
    // West Doorway: entrance to Water Plant
    const waterHeaderTex = createSignTexture({
      title: "WATER PURIFICATION PLANT",
      subtitle: "SECTOR W-1 · PRIMARY DESALINATION & COOLING",
      bgColor: "#0f232a",
      textColor: "#f0fdfa",
      accentColor: "#38bdf8",
      stripe: true,
      badge: "WATER",
    });
    addWallSign(
      undergroundGroup,
      waterHeaderTex,
      -17.45,
      6.0,
      -5.3,
      4.2,
      0.9,
      "east",
    );

    // East Doorway: entrance to Power Room
    const powerHeaderTex = createSignTexture({
      title: "POWER DISTRIBUTION SUBSTATION",
      subtitle: "SECTOR E-1 · 11KV TRANSFORMERS & BUSBARS",
      bgColor: "#291b0c",
      textColor: "#fffbeb",
      accentColor: "#f59e0b",
      stripe: true,
      badge: "POWER",
    });
    addWallSign(
      undergroundGroup,
      powerHeaderTex,
      -10.55,
      6.0,
      -5.3,
      4.2,
      0.9,
      "west",
    );

    // Suspended Overhead Corridor Intersection Sign
    const overheadNavTex = createSignTexture({
      title: "← WATER PLANT (W-1)      POWER SUBSTATION (E-1) →",
      subtitle: "↓ SOUTH TO SERVICE LIFT EXIT · MERIDIAN PLAZA",
      bgColor: "#111827",
      textColor: "#f9fafb",
      accentColor: "#e2e8f0",
      badge: "JUNCTION",
    });
    addWallSign(
      undergroundGroup,
      overheadNavTex,
      -14.0,
      6.0,
      -4.6,
      5.2,
      0.95,
      "south",
    );

    // 5.4 North End Bulkhead Airlock (y = 23)
    addCivicBlock(
      undergroundGroup,
      mats.darkSteel,
      -14.0,
      22.7,
      3.2,
      0.3,
      3.2,
      -8.0,
    );
    addCivicBlock(
      undergroundGroup,
      mats.hazardStripe,
      -14.0,
      22.86,
      3.2,
      0.02,
      0.3,
      -4.95,
    );

    const airlockSignTex = createSignTexture({
      title: "PRESSURIZED AIRLOCK · SECTOR N-02",
      subtitle: "RESTRICTED AREA · AUTHORIZED PERSONNEL ONLY",
      bgColor: "#3b0707",
      textColor: "#fef2f2",
      accentColor: "#ef4444",
      stripe: true,
      badge: "LOCKED",
    });
    addWallSign(
      undergroundGroup,
      airlockSignTex,
      -14.0,
      22.50,
      -6.2,
      2.8,
      0.8,
      "south",
    );
  }

  // ===========================================================================
  // 6. WEST WATER ROOM: MACHINERY & VISUALS (s: [-33.5, -17.5], y: [-3, 15])
  // Landmark ID: 'meridian-water-plant', center s = -25.5, y = 6.0
  // ===========================================================================
  {
    // 6.1 Desalination / Clarification Vats (North Bay, y = 11.5)
    const vatPositions = [
      { s: -29.0, y: 11.5 },
      { s: -22.0, y: 11.5 },
    ];
    for (const vat of vatPositions) {
      // Cylindrical Tank (represented with 16-segment curved solid / box footprint)
      addCivicBlock(
        undergroundGroup,
        mats.stainlessTank,
        vat.s,
        vat.y,
        3.2,
        3.2,
        3.2,
        -8.0,
      );
      registerSolid(vat.s, vat.y, 3.2, 3.2, 3.2, -8.0);

      // Vat base rim & top cap
      addCivicBlock(
        undergroundGroup,
        mats.darkSteel,
        vat.s,
        vat.y,
        3.4,
        3.4,
        0.3,
        -8.0,
      );
      addCivicBlock(
        undergroundGroup,
        mats.darkSteel,
        vat.s,
        vat.y,
        3.4,
        3.4,
        0.25,
        -4.8,
      );

      // Glowing liquid level sight glass on the South face
      addCivicBlock(
        undergroundGroup,
        mats.glowWaterCyan,
        vat.s,
        vat.y - 1.62,
        0.2,
        0.05,
        2.2,
        -7.4,
      );
    }

    // Overhead high-pressure interconnecting pipe between the two vats
    addCivicBlock(
      undergroundGroup,
      mats.waterPlantTeal,
      -25.5,
      11.5,
      7.0,
      0.35,
      0.35,
      -4.9,
    );

    // 6.2 High-Pressure Pump Skids & Animated Impellers (South Bay, y = 0.5)
    const pumpSkids = [
      { s: -29.0, y: 0.5, speed: 4.2 },
      { s: -23.0, y: 0.5, speed: -3.8 },
    ];

    for (let i = 0; i < pumpSkids.length; i++) {
      const p = pumpSkids[i];

      // Concrete equipment plinth
      addCivicBlock(
        undergroundGroup,
        mats.darkSteel,
        p.s,
        p.y,
        2.4,
        3.0,
        0.4,
        -8.0,
      );
      registerSolid(p.s, p.y, 2.4, 3.0, 1.6, -8.0);

      // Electric motor housing (North half of skid)
      addCivicBlock(
        undergroundGroup,
        mats.structuralBeams,
        p.s,
        p.y + 0.7,
        1.6,
        1.3,
        1.1,
        -7.6,
      );

      // Pump volute / casing (South half of skid)
      addCivicBlock(
        undergroundGroup,
        mats.waterPlantTeal,
        p.s,
        p.y - 0.6,
        1.8,
        1.2,
        1.2,
        -7.6,
      );

      const rotorGroup = addSouthFacingRotor(
        undergroundGroup, p.s, p.y - 1.25, -7.0, `service_pump_rotor_${i}`,
      );

      // Impeller blades (6 brass vanes radiating from center hub)
      const hubMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12),
        mats.brassFitting,
      );
      hubMesh.rotation.x = Math.PI / 2;
      hubMesh.userData.atmosphereDynamic = true;
      rotorGroup.add(hubMesh);

      for (let b = 0; b < 6; b++) {
        const vaneMesh = new THREE.Mesh(unitBoxGeo, mats.brassFitting);
        vaneMesh.scale.set(0.06, 0.55, 0.08);
        const angle = (b * Math.PI) / 3;
        vaneMesh.position.set(-Math.sin(angle) * 0.27, Math.cos(angle) * 0.27, 0);
        vaneMesh.rotation.z = angle;
        vaneMesh.userData.atmosphereDynamic = true;
        rotorGroup.add(vaneMesh);
      }

      animatedRotors.push({ group: rotorGroup, speed: p.speed, axis: "z" });

      // Brass pressure gauges and valves
      addCivicBlock(
        undergroundGroup,
        mats.brassFitting,
        p.s - 0.7,
        p.y - 0.6,
        0.2,
        0.2,
        0.5,
        -6.4,
      );
      addCivicBlock(
        undergroundGroup,
        mats.brassFitting,
        p.s + 0.7,
        p.y - 0.6,
        0.2,
        0.2,
        0.5,
        -6.4,
      );
    }

    // 6.3 Central Control Console on the West Wall (s = -32.5, y = 6.0)
    addCivicBlock(
      undergroundGroup,
      mats.darkSteel,
      -32.5,
      6.0,
      1.0,
      3.4,
      1.1,
      -8.0,
    );
    registerSolid(-32.5, 6.0, 1.0, 3.4, 1.1, -8.0);

    // Glowing status screens on control desk
    addCivicBlock(
      undergroundGroup,
      mats.glowWaterCyan,
      -32.9,
      5.2,
      0.05,
      0.8,
      0.5,
      -6.8,
    );
    addCivicBlock(
      undergroundGroup,
      mats.glowWaterCyan,
      -32.9,
      6.8,
      0.05,
      0.8,
      0.5,
      -6.8,
    );
    addCivicBlock(
      undergroundGroup,
      mats.statusGreen,
      -32.9,
      6.0,
      0.05,
      0.4,
      0.3,
      -6.8,
    );

    // Wall Placards & Schematics
    const waterPlacardTex = createSignTexture({
      title: "DESALINATION & RECIRCULATION MATRIX",
      subtitle: "SYSTEM STATUS: 100% NOMINAL · FLOW: 4,800 M³/DAY",
      bgColor: "#082f49",
      textColor: "#f0f9ff",
      accentColor: "#38bdf8",
      stripe: true,
      badge: "W-1",
    });
    addWallSign(
      undergroundGroup,
      waterPlacardTex,
      -33.45,
      6.0,
      -5.6,
      3.6,
      1.1,
      "east",
    );

    const waterSafetySignTex = createSignTexture({
      title: "CAUTION: HIGH PRESSURE FLUID LINES",
      subtitle: "EAR DEFENDERS REQUIRED IN PUMP BAY",
      bgColor: "#1e293b",
      textColor: "#ffffff",
      accentColor: "#f59e0b",
      stripe: true,
      badge: "SAFETY",
    });
    addWallSign(
      undergroundGroup,
      waterSafetySignTex,
      -25.5,
      -2.95,
      -6.0,
      3.2,
      0.9,
      "north",
    );
  }

  // ===========================================================================
  // 7. EAST POWER ROOM: MACHINERY & VISUALS (s: [-10.5, 7.5], y: [-3, 15])
  // Landmark ID: 'meridian-power-room', center s = -1.5, y = 6.0
  // ===========================================================================
  {
    // 7.1 High-Voltage Step-Down Transformers (North Bay, y = 11.5)
    const transformers = [
      { s: -4.5, y: 11.5 },
      { s: 2.5, y: 11.5 },
    ];

    for (const t of transformers) {
      // Main transformer core tank
      addCivicBlock(
        undergroundGroup,
        mats.powerPlantAmber,
        t.s,
        t.y,
        3.4,
        2.6,
        2.6,
        -8.0,
      );
      registerSolid(t.s, t.y, 3.4, 2.6, 2.6, -8.0);

      // Ribbed cooling radiators on sides
      addCivicBlock(
        undergroundGroup,
        mats.darkSteel,
        t.s - 1.8,
        t.y,
        0.2,
        2.2,
        2.2,
        -7.8,
      );
      addCivicBlock(
        undergroundGroup,
        mats.darkSteel,
        t.s + 1.8,
        t.y,
        0.2,
        2.2,
        2.2,
        -7.8,
      );

      // Ceramic high-voltage insulator bushings on top
      for (let b = -0.8; b <= 0.8; b += 0.8) {
        addCivicBlock(
          undergroundGroup,
          mats.ceramicInsulator,
          t.s + b,
          t.y,
          0.3,
          0.3,
          0.7,
          -5.4,
        );
        addCivicBlock(
          undergroundGroup,
          mats.copperBusbar,
          t.s + b,
          t.y,
          0.12,
          0.12,
          0.4,
          -4.7,
        );
      }
    }

    // Overhead heavy copper busbar run bridging the transformers into ceiling
    addCivicBlock(
      undergroundGroup,
      mats.copperBusbar,
      -1.0,
      11.5,
      8.0,
      0.15,
      0.15,
      -4.4,
    );

    // 7.2 Cooling Fan Turbine Skids & Animated Fans (South Bay, y = 0.5)
    const fanSkids = [
      { s: -4.5, y: 0.5, speed: 5.5 },
      { s: 2.5, y: 0.5, speed: -5.0 },
    ];

    for (let i = 0; i < fanSkids.length; i++) {
      const f = fanSkids[i];

      // Concrete plinth & casing
      addCivicBlock(
        undergroundGroup,
        mats.darkSteel,
        f.s,
        f.y,
        2.8,
        2.6,
        0.4,
        -8.0,
      );
      registerSolid(f.s, f.y, 2.8, 2.6, 2.2, -8.0);

      addCivicBlock(
        undergroundGroup,
        mats.structuralBeams,
        f.s,
        f.y,
        2.6,
        2.4,
        1.8,
        -7.6,
      );

      const fanGroup = addSouthFacingRotor(
        undergroundGroup, f.s, f.y - 1.25, -6.6, `service_fan_rotor_${i}`,
      );

      // Fan hub
      const hubMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16),
        mats.darkSteel,
      );
      hubMesh.rotation.x = Math.PI / 2;
      hubMesh.userData.atmosphereDynamic = true;
      fanGroup.add(hubMesh);

      // Six vanes around the shaft, clear of the solid south casing face.
      for (let b = 0; b < 6; b++) {
        const bladeMesh = new THREE.Mesh(unitBoxGeo, mats.structuralBeams);
        bladeMesh.scale.set(0.12, 0.65, 0.05);
        const angle = (b * Math.PI) / 3;
        bladeMesh.position.set(-Math.sin(angle) * 0.32, Math.cos(angle) * 0.32, 0);
        bladeMesh.rotation.z = angle;
        bladeMesh.userData.atmosphereDynamic = true;
        fanGroup.add(bladeMesh);
      }

      animatedRotors.push({ group: fanGroup, speed: f.speed, axis: "z" });
    }

    // 7.3 Grid Battery & Capacitor Bank Cabinets on the East Wall (s = 6.6, y = 6.0)
    addCivicBlock(
      undergroundGroup,
      mats.darkSteel,
      6.6,
      6.0,
      1.0,
      4.2,
      2.6,
      -8.0,
    );
    registerSolid(6.6, 6.0, 1.0, 4.2, 2.6, -8.0);

    // Amber status LED rows on battery cabinets
    for (let yLed = 4.4; yLed <= 7.6; yLed += 0.8) {
      addCivicBlock(
        undergroundGroup,
        mats.glowPowerAmber,
        6.05,
        yLed,
        0.05,
        0.4,
        0.1,
        -6.5,
      );
      addCivicBlock(
        undergroundGroup,
        mats.statusGreen,
        6.05,
        yLed,
        0.05,
        0.1,
        0.1,
        -6.8,
      );
    }

    // High Voltage Warning Placards & Specs
    const powerPlacardTex = createSignTexture({
      title: "MERIDIAN 11KV SUBSTATION BUS 04",
      subtitle: "GRID FREQUENCY: 60.0 HZ · LOAD: 84% NOMINAL",
      bgColor: "#451a03",
      textColor: "#fffbeb",
      accentColor: "#f59e0b",
      stripe: true,
      badge: "E-1",
    });
    addWallSign(
      undergroundGroup,
      powerPlacardTex,
      7.45,
      -1.0,
      -5.6,
      3.6,
      1.1,
      "west",
    );

    const dangerHvTex = createSignTexture({
      title: "DANGER · HIGH VOLTAGE 11,000V",
      subtitle: "AUTHORIZED ELECTRICAL CIVIC STAFF ONLY",
      bgColor: "#2e0808",
      textColor: "#fee2e2",
      accentColor: "#ef4444",
      stripe: true,
      badge: "DANGER",
    });
    addWallSign(
      undergroundGroup,
      dangerHvTex,
      -1.5,
      -2.95,
      -6.0,
      3.4,
      0.9,
      "north",
    );
  }

  // ===========================================================================
  // 8. UNDERGROUND ISOLATED LIGHTING (Layer 1 ONLY)
  // Isolated Layer 1 ambient fill + 4 nonshadow PointLights matching fixtures
  // Surface lights never affect layer 1; underground lights never affect layer 0.
  // ===========================================================================
  {
    const undergroundAmbient = new THREE.AmbientLight(0xa8bdd0, 1.2);
    undergroundGroup.add(undergroundAmbient);
    const fixtures = [
      ["service_lift_light", -14, -26, 0xaad0ec, 80],
      ["service_junction_light", -14, 6, 0xd4e4f0, 100],
      ["service_water_light", -25.5, 6, 0x70cce0, 110],
      ["service_power_light", -1.5, 6, 0xffcf87, 110],
    ];
    for (const [name, s, y, color, intensity] of fixtures) {
      addCivicBlock(undergroundGroup, mats.darkSteel, s, y, 2.1, 0.65, 0.16, -3.98);
      const diffuser = new THREE.MeshBasicMaterial({ color });
      addCivicBlock(undergroundGroup, diffuser, s, y, 1.8, 0.5, 0.08, -4);
      registerSolid(s, y, 2.1, 0.65, 0.18, -4);
      const light = new THREE.PointLight(color, intensity, 24, 2);
      light.name = name;
      light.position.copy(surfacePos(s / RADIUS, y, -4.25));
      light.castShadow = false;
      undergroundGroup.add(light);
    }
  }

  // ===========================================================================
  // 9. LAYER 1 ASSIGNMENT ENFORCEMENT
  // Recursively ensure EVERY mesh and light in undergroundGroup is on Layer 1.
  // Surface pavilion meshes retain default Layer 0.
  // ===========================================================================
  undergroundGroup.traverse((child) => {
    child.layers.set(1);
  });

  // ===========================================================================
  // 10. UPDATE LOOP
  // Rotates pump impellers and cooling fans dynamically without allocations
  // ===========================================================================
  function update(dt, elapsed) {
    for (let i = 0; i < animatedRotors.length; i++) {
      const r = animatedRotors[i];
      r.group.rotation[r.axis] += dt * r.speed;
    }
  }

  return {
    obstacles,
    update,
  };
}
