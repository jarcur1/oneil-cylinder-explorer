import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { CARETAKER } from "./maintenance-layout.js";

// =============================================================================
// Ambient Residents of Greenway and Meridian Civic District
// -----------------------------------------------------------------------------
// Upright human-scale low-poly figures walking curved cylinder habitat routes.
// - Local frame: localZ is inward UP, localY is forward longitudinal (+Y).
// - Root orientation: position on cylinder surface, rotation.y = -theta.
// - Heading orientation: child rotation.z = -atan2(ds, dy).
// - Gait: stride-distance synchronized, zero runtime allocations.
// =============================================================================

const FOOT_HEIGHT = 0.07; // Above hull/floor surface to align feet with stone paving
const STRIDE_LENGTH = 1.35; // Meters per full double-step cycle
const SETTLE_DURATION = 0.8; // Seconds to smoothly settle into a viewpoint dwell
const RESUME_DURATION = 0.8; // Seconds to smoothly resume walking from a dwell
const SETTLE_DISTANCE_FACTOR = 0.5; // Average speed ratio during smoothstep deceleration

// -----------------------------------------------------------------------------
// Shared Geometry Library (Allocated once, reused across all residents)
// -----------------------------------------------------------------------------
const geoPelvis = new THREE.BoxGeometry(0.3, 0.2, 0.18);
const geoThigh = new THREE.BoxGeometry(0.13, 0.14, 0.38);
const geoShin = new THREE.BoxGeometry(0.11, 0.12, 0.38);
const geoFoot = new THREE.BoxGeometry(0.12, 0.22, 0.07);
const geoTorso = new THREE.BoxGeometry(0.34, 0.22, 0.44);
const geoNeck = new THREE.BoxGeometry(0.1, 0.1, 0.08);
const geoHead = new THREE.BoxGeometry(0.2, 0.2, 0.22);
const geoUpperArm = new THREE.BoxGeometry(0.1, 0.1, 0.28);
const geoForearm = new THREE.BoxGeometry(0.09, 0.09, 0.26);
const geoHand = new THREE.BoxGeometry(0.08, 0.08, 0.1);
const geoEye = new THREE.BoxGeometry(0.04, 0.02, 0.03);
const geoNose = new THREE.BoxGeometry(0.03, 0.03, 0.05);
const geoEar = new THREE.BoxGeometry(0.02, 0.04, 0.05);

// Accessory geometries
const geoHatFedoraBrim = new THREE.BoxGeometry(0.32, 0.34, 0.03);
const geoHatFedoraCrown = new THREE.BoxGeometry(0.21, 0.22, 0.11);
const geoHatFedoraBand = new THREE.BoxGeometry(0.22, 0.23, 0.03);

const geoHatStrawBrim = new THREE.BoxGeometry(0.38, 0.38, 0.03);
const geoHatStrawCrown = new THREE.BoxGeometry(0.22, 0.22, 0.1);
const geoSatchel = new THREE.BoxGeometry(0.1, 0.2, 0.18);
const geoSatchelStrap = new THREE.BoxGeometry(0.04, 0.24, 0.46);

const geoHatCapCrown = new THREE.BoxGeometry(0.22, 0.24, 0.09);
const geoHatCapVisor = new THREE.BoxGeometry(0.16, 0.08, 0.02);
const geoApron = new THREE.BoxGeometry(0.28, 0.03, 0.52);
const geoApronPocket = new THREE.BoxGeometry(0.2, 0.02, 0.12);

const geoBeanie = new THREE.BoxGeometry(0.22, 0.22, 0.14);
const geoBeaniePompom = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const geoScarf = new THREE.BoxGeometry(0.24, 0.22, 0.08);

const geoHardhatCrown = new THREE.BoxGeometry(0.24, 0.26, 0.12);
const geoHardhatBrim = new THREE.BoxGeometry(0.26, 0.28, 0.02);
const geoVest = new THREE.BoxGeometry(0.35, 0.23, 0.38);
const geoReflectiveStripe = new THREE.BoxGeometry(0.36, 0.24, 0.06);

// Caretaker badge & city accessory geometries (DOM-free Node-compatible meshes)
const geoBadgeFrame = new THREE.BoxGeometry(0.12, 0.02, 0.06);
const geoBadgePlate = new THREE.BoxGeometry(0.1, 0.022, 0.045);
const geoBadgePin = new THREE.BoxGeometry(0.03, 0.025, 0.03);
const geoBriefcase = new THREE.BoxGeometry(0.08, 0.28, 0.2);
const geoBinoculars = new THREE.BoxGeometry(0.14, 0.08, 0.06);

// -----------------------------------------------------------------------------
// Shared Material Library
// -----------------------------------------------------------------------------
const matEye = new THREE.MeshBasicMaterial({ color: 0x151515 });
const matReflective = new THREE.MeshBasicMaterial({ color: 0xdde4e8 });

const skinMats = {
  peach: new THREE.MeshStandardMaterial({ color: 0xf5c396, roughness: 0.8 }),
  olive: new THREE.MeshStandardMaterial({ color: 0xdca878, roughness: 0.8 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x935c36, roughness: 0.8 }),
  fair: new THREE.MeshStandardMaterial({ color: 0xfde3cf, roughness: 0.8 }),
  golden: new THREE.MeshStandardMaterial({ color: 0xba7c4e, roughness: 0.8 }),
};

const apparelMats = {
  // Resident 1 (Promenade): Town coat, charcoal trousers, fedora
  slateJacket: new THREE.MeshStandardMaterial({
    color: 0x364858,
    roughness: 0.85,
  }),
  charcoalPants: new THREE.MeshStandardMaterial({
    color: 0x272a2e,
    roughness: 0.9,
  }),
  slateHat: new THREE.MeshStandardMaterial({
    color: 0x242a30,
    roughness: 0.85,
  }),
  hatBand: new THREE.MeshStandardMaterial({ color: 0x5a646e, roughness: 0.7 }),
  darkShoe: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }),

  // Resident 2 (Square): Terracotta shirt, olive trousers, straw sunhat, satchel
  terracottaShirt: new THREE.MeshStandardMaterial({
    color: 0xc15c3d,
    roughness: 0.85,
  }),
  olivePants: new THREE.MeshStandardMaterial({
    color: 0x4c5a3d,
    roughness: 0.9,
  }),
  strawHat: new THREE.MeshStandardMaterial({ color: 0xdfc27d, roughness: 0.9 }),
  leatherBag: new THREE.MeshStandardMaterial({
    color: 0x6e3d22,
    roughness: 0.75,
  }),
  brownShoe: new THREE.MeshStandardMaterial({
    color: 0x3a251b,
    roughness: 0.75,
  }),

  // Resident 3 (Glasshouse): Forest shirt, brown dungarees, canvas apron, work cap
  forestShirt: new THREE.MeshStandardMaterial({
    color: 0x385c3f,
    roughness: 0.85,
  }),
  dungareeBrown: new THREE.MeshStandardMaterial({
    color: 0x4a3a2d,
    roughness: 0.9,
  }),
  canvasApron: new THREE.MeshStandardMaterial({
    color: 0xdcd6c5,
    roughness: 0.9,
  }),
  apronTrim: new THREE.MeshStandardMaterial({
    color: 0xb8b09d,
    roughness: 0.85,
  }),
  earthCap: new THREE.MeshStandardMaterial({
    color: 0x3e352d,
    roughness: 0.85,
  }),
  mudBoot: new THREE.MeshStandardMaterial({ color: 0x201c19, roughness: 0.8 }),

  // Resident 4 (Orchard): Burgundy sweater, khaki trousers, gold beanie, teal scarf
  burgundySweater: new THREE.MeshStandardMaterial({
    color: 0x7a283c,
    roughness: 0.9,
  }),
  khakiPants: new THREE.MeshStandardMaterial({
    color: 0x94876b,
    roughness: 0.9,
  }),
  goldBeanie: new THREE.MeshStandardMaterial({
    color: 0xd49b28,
    roughness: 0.9,
  }),
  tealScarf: new THREE.MeshStandardMaterial({
    color: 0x2f6062,
    roughness: 0.85,
  }),

  // Resident 5 (Canal): Cobalt jacket, navy trousers, yellow hardhat, hi-vis vest
  cobaltJacket: new THREE.MeshStandardMaterial({
    color: 0x1e4b7a,
    roughness: 0.85,
  }),
  navyPants: new THREE.MeshStandardMaterial({
    color: 0x152234,
    roughness: 0.9,
  }),
  safetyYellow: new THREE.MeshStandardMaterial({
    color: 0xf5b800,
    roughness: 0.45,
    metalness: 0.1,
  }),
  hiVisOrange: new THREE.MeshStandardMaterial({
    color: 0xee5d1a,
    roughness: 0.7,
  }),

  // Mara Voss (Civic Caretaker): Deep spruce officer jacket, tailored pants, gold insignia
  caretakerJacket: new THREE.MeshStandardMaterial({
    color: 0x1e3f42,
    roughness: 0.85,
  }),
  caretakerPants: new THREE.MeshStandardMaterial({
    color: 0x242a30,
    roughness: 0.9,
  }),
  caretakerCap: new THREE.MeshStandardMaterial({
    color: 0x183437,
    roughness: 0.85,
  }),
  civicBadgeGold: new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.35,
    metalness: 0.8,
  }),
  civicBadgeEnamel: new THREE.MeshStandardMaterial({
    color: 0xf4f6f8,
    roughness: 0.6,
  }),

  // Resident 6 (Plaza): Warm amber jacket, cream trousers, chocolate beret
  amberJacket: new THREE.MeshStandardMaterial({
    color: 0xd97e36,
    roughness: 0.85,
  }),
  creamPants: new THREE.MeshStandardMaterial({
    color: 0xccc5b3,
    roughness: 0.9,
  }),
  chocolateBeret: new THREE.MeshStandardMaterial({
    color: 0x3a251e,
    roughness: 0.9,
  }),

  // Resident 7 (Lobby): Formal charcoal coat, black slacks, leather briefcase
  formalCoat: new THREE.MeshStandardMaterial({
    color: 0x2a323d,
    roughness: 0.85,
  }),
  formalPants: new THREE.MeshStandardMaterial({
    color: 0x1e2228,
    roughness: 0.9,
  }),

  // Resident 8 (Skywalk): Teal outdoor windbreaker, light khaki pants, sun visor
  skywalkTeal: new THREE.MeshStandardMaterial({
    color: 0x297075,
    roughness: 0.85,
  }),
  lightKhakiPants: new THREE.MeshStandardMaterial({
    color: 0x8c8370,
    roughness: 0.9,
  }),

  // Resident 9 (Skyroom): Plum jacket, twill trousers, lavender scarf
  plumJacket: new THREE.MeshStandardMaterial({
    color: 0x5e2b4d,
    roughness: 0.85,
  }),
  twillPants: new THREE.MeshStandardMaterial({
    color: 0x34313d,
    roughness: 0.9,
  }),
  lavenderScarf: new THREE.MeshStandardMaterial({
    color: 0x8e7b9e,
    roughness: 0.85,
  }),
};

// -----------------------------------------------------------------------------
// Closed Path Generation Helpers
// -----------------------------------------------------------------------------
function createRoundedRectPoints(
  minS,
  maxS,
  minY,
  maxY,
  radius,
  segPerCorner = 4,
  height = 0,
) {
  const pts = [];
  const r = Math.min(radius, (maxS - minS) * 0.45, (maxY - minY) * 0.45);
  const k = (RADIUS - height) / RADIUS;

  // 1. West straight (going north)
  pts.push({ s: minS, y: minY + r, heading: 0 });
  pts.push({ s: minS, y: maxY - r, heading: 0 });

  // 2. North-West arc (curving east)
  const cxNW = minS + r;
  const cyNW = maxY - r;
  for (let i = 1; i <= segPerCorner; i++) {
    const angle = Math.PI - (i / segPerCorner) * (Math.PI * 0.5);
    const heading = Math.atan2(k * Math.sin(angle), -Math.cos(angle));
    pts.push({
      s: cxNW + r * Math.cos(angle),
      y: cyNW + r * Math.sin(angle),
      heading,
    });
  }

  // 3. North straight (going east)
  pts.push({ s: maxS - r, y: maxY, heading: Math.PI * 0.5 });

  // 4. North-East arc (curving south)
  const cxNE = maxS - r;
  const cyNE = maxY - r;
  for (let i = 1; i <= segPerCorner; i++) {
    const angle = Math.PI * 0.5 - (i / segPerCorner) * (Math.PI * 0.5);
    const heading = Math.atan2(k * Math.sin(angle), -Math.cos(angle));
    pts.push({
      s: cxNE + r * Math.cos(angle),
      y: cyNE + r * Math.sin(angle),
      heading,
    });
  }

  // 5. East straight (going south)
  pts.push({ s: maxS, y: minY + r, heading: Math.PI });

  // 6. South-East arc (curving west)
  const cxSE = maxS - r;
  const cySE = minY + r;
  for (let i = 1; i <= segPerCorner; i++) {
    const angle = -(i / segPerCorner) * (Math.PI * 0.5);
    const heading = Math.atan2(k * Math.sin(angle), -Math.cos(angle));
    pts.push({
      s: cxSE + r * Math.cos(angle),
      y: cySE + r * Math.sin(angle),
      heading,
    });
  }

  // 7. South straight (going west)
  pts.push({ s: minS + r, y: minY, heading: -Math.PI * 0.5 });

  // 8. South-West arc (curving north)
  const cxSW = minS + r;
  const cySW = minY + r;
  for (let i = 1; i < segPerCorner; i++) {
    const angle = -Math.PI * 0.5 - (i / segPerCorner) * (Math.PI * 0.5);
    const heading = Math.atan2(k * Math.sin(angle), -Math.cos(angle));
    pts.push({
      s: cxSW + r * Math.cos(angle),
      y: cySW + r * Math.sin(angle),
      heading,
    });
  }

  return pts;
}

function createLongitudinalStadiumPoints(
  centerS,
  halfWidth,
  minY,
  maxY,
  segPerCap = 8,
) {
  const pts = [];
  const r = halfWidth;
  const minS = centerS - r;
  const maxS = centerS + r;

  // 1. West straight (going north)
  pts.push({ s: minS, y: minY + r, heading: 0 });
  pts.push({ s: minS, y: maxY - r, heading: 0 });

  // 2. North cap semi-circle (curving east to maxS)
  const cyN = maxY - r;
  for (let i = 1; i <= segPerCap; i++) {
    const angle = Math.PI - (i / segPerCap) * Math.PI;
    pts.push({
      s: centerS + r * Math.cos(angle),
      y: cyN + r * Math.sin(angle),
      heading: Math.PI - angle,
    });
  }

  // 3. East straight (going south)
  pts.push({ s: maxS, y: minY + r, heading: Math.PI });

  // 4. South cap semi-circle (curving west to minS)
  const cyS = minY + r;
  for (let i = 1; i < segPerCap; i++) {
    const angle = -(i / segPerCap) * Math.PI;
    pts.push({
      s: centerS + r * Math.cos(angle),
      y: cyS + r * Math.sin(angle),
      heading: Math.PI - angle,
    });
  }

  return pts;
}

function createTransverseStadiumPoints(
  centerY,
  halfWidth,
  minS,
  maxS,
  segPerCap = 8,
) {
  const pts = [];
  const r = halfWidth;
  const minY = centerY - r;
  const maxY = centerY + r;

  // 1. North straight (going east)
  pts.push({ s: minS + r, y: maxY, heading: Math.PI * 0.5 });
  pts.push({ s: maxS - r, y: maxY, heading: Math.PI * 0.5 });

  // 2. East cap semi-circle (curving south to minY)
  const cxE = maxS - r;
  for (let i = 1; i <= segPerCap; i++) {
    const angle = Math.PI * 0.5 - (i / segPerCap) * Math.PI;
    pts.push({
      s: cxE + r * Math.cos(angle),
      y: centerY + r * Math.sin(angle),
      heading: Math.PI - angle,
    });
  }

  // 3. South straight (going west)
  pts.push({ s: minS + r, y: minY, heading: -Math.PI * 0.5 });

  // 4. West cap semi-circle (curving north to maxY)
  const cxW = minS + r;
  for (let i = 1; i < segPerCap; i++) {
    const angle = -Math.PI * 0.5 - (i / segPerCap) * Math.PI;
    pts.push({
      s: cxW + r * Math.cos(angle),
      y: centerY + r * Math.sin(angle),
      heading: Math.PI - angle,
    });
  }

  return pts;
}

function createLobbyPoints() {
  return [
    // 1. Outside southern turnaround: loop from southbound (s=48.4) to northbound (s=47.6)
    { s: 48.4, y: 16.0 },
    { s: 48.3, y: 15.5 },
    { s: 48.0, y: 15.2 },
    { s: 47.7, y: 15.5 },
    { s: 47.6, y: 16.0 },

    // 2. Approach and pass through south doorway opening (s in [45, 51] at y=22)
    { s: 47.6, y: 20.0 },
    { s: 47.6, y: 22.0 },
    { s: 47.6, y: 26.5 },

    // 3. Turn right (east) toward east lounge corridor
    { s: 47.8, y: 28.0 },
    { s: 48.5, y: 28.8 },
    { s: 49.5, y: 29.0 },
    { s: 51.5, y: 29.0 },

    // 4. Turn left (north) along east corridor
    { s: 52.5, y: 29.2 },
    { s: 53.0, y: 29.8 },
    { s: 53.0, y: 30.5 },
    { s: 53.0, y: 31.2 },

    // 5. Turn left (west) toward express lift
    { s: 52.8, y: 31.8 },
    { s: 52.2, y: 32.0 },
    { s: 51.5, y: 32.0 },
    { s: 49.5, y: 32.0 },
    { s: 48.4, y: 32.0 }, // Dwell point in front of express lift

    // 6. Turn left (south) toward south exit
    { s: 48.4, y: 31.2 },
    { s: 48.4, y: 30.5 },

    // 7. Walk south down corridor and exit through south doorway at y=22
    { s: 48.4, y: 26.5 },
    { s: 48.4, y: 22.0 },
    { s: 48.4, y: 20.0 },
  ];
}

function circularMean(a, b) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * 0.5;
}

function buildPath(points, height = 0) {
  const n = points.length;
  const k = (RADIUS - height) / RADIUS;
  const segData = [];
  let totalLength = 0;

  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const p0 = points[i];
    const p1 = points[nextIdx];
    const ds = p1.s - p0.s;
    const dy = p1.y - p0.y;
    const physDs = ds * k;
    const len = Math.hypot(physDs, dy);
    if (len < 1e-6) continue;

    const segHeading = Math.atan2(physDs, dy);
    segData.push({
      p0,
      p1,
      ds,
      dy,
      len,
      segHeading,
      cumDist: totalLength,
    });
    totalLength += len;
  }

  const m = segData.length;
  const segments = [];
  for (let i = 0; i < m; i++) {
    const prevIdx = (i - 1 + m) % m;
    const nextIdx = (i + 1) % m;
    const seg = segData[i];
    const prevSeg = segData[prevIdx];
    const nextSeg = segData[nextIdx];

    const heading0 =
      seg.p0.heading !== undefined
        ? seg.p0.heading
        : circularMean(prevSeg.segHeading, seg.segHeading);

    const heading1 =
      seg.p1.heading !== undefined
        ? seg.p1.heading
        : circularMean(seg.segHeading, nextSeg.segHeading);

    segments.push({
      s0: seg.p0.s,
      y0: seg.p0.y,
      s1: seg.p1.s,
      y1: seg.p1.y,
      ds: seg.ds,
      dy: seg.dy,
      len: seg.len,
      cumDist: seg.cumDist,
      heading0,
      heading1,
    });
  }

  return {
    segments,
    perimeter: totalLength,
    points,
    height,
  };
}

function samplePath(path, dist, out) {
  const { segments, perimeter } = path;
  let d = dist % perimeter;
  if (d < 0) d += perimeter;

  let low = 0;
  let high = segments.length - 1;
  let segIdx = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].cumDist <= d) {
      segIdx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const seg = segments[segIdx];
  const t = (d - seg.cumDist) / seg.len;
  out.s = seg.s0 + seg.ds * t;
  out.y = seg.y0 + seg.dy * t;

  // Continuous analytic heading interpolation
  let dHeading = seg.heading1 - seg.heading0;
  if (dHeading > Math.PI) dHeading -= Math.PI * 2;
  if (dHeading < -Math.PI) dHeading += Math.PI * 2;
  out.heading = seg.heading0 + dHeading * t;
}

function isDistanceCrossed(d0, d1, target, perimeter) {
  const delta = d1 - d0;
  if (delta <= 0) return false;
  if (delta >= perimeter) return true;
  const normTarget = ((target % perimeter) + perimeter) % perimeter;
  const p0 = ((d0 % perimeter) + perimeter) % perimeter;
  const p1 = p0 + delta;
  if (p1 < perimeter) {
    return p0 <= normTarget && normTarget < p1;
  }
  return normTarget >= p0 || normTarget < p1 % perimeter;
}

// -----------------------------------------------------------------------------
// Route Specifications & Inspectable Data
// -----------------------------------------------------------------------------
const RESIDENT_ROUTES = Object.freeze({
  // Original Greenway Routes (Unchanged)
  promenade: {
    name: "Promenade Stroll",
    height: 0,
    bounds: { minS: -2.5, maxS: -1.0, minY: -282.0, maxY: -249.0 },
    speed: 1.25,
    path: buildPath(
      createRoundedRectPoints(-2.5, -1.0, -282.0, -249.0, 0.5, 4, 0),
      0,
    ),
  },
  square: {
    name: "Market Square Loop",
    height: 0,
    bounds: { minS: -2.0, maxS: 2.0, minY: -240.0, maxY: -223.0 },
    speed: 1.15,
    path: buildPath(
      createRoundedRectPoints(-2.0, 2.0, -240.0, -223.0, 0.8, 4, 0),
      0,
    ),
  },
  glasshouse: {
    name: "Glasshouse Central Aisle",
    height: 0,
    bounds: { minS: 63.4, maxS: 64.6, minY: -243.0, maxY: -181.0 },
    speed: 1.3,
    path: buildPath(
      createLongitudinalStadiumPoints(64.0, 0.6, -243.0, -181.0, 8),
      0,
    ),
  },
  orchard: {
    name: "Orchard Crosslane",
    height: 0,
    bounds: { minS: -57.0, maxS: -3.0, minY: -174.6, maxY: -173.4 },
    speed: 1.25,
    path: buildPath(
      createTransverseStadiumPoints(-174.0, 0.6, -57.0, -3.0, 8),
      0,
    ),
  },
  canal: {
    name: "Canal Bank Footpath",
    height: 0,
    bounds: { minS: 106.0, maxS: 106.8, minY: -235.0, maxY: -184.0 },
    speed: 1.35,
    path: buildPath(
      createLongitudinalStadiumPoints(106.4, 0.4, -235.0, -184.0, 8),
      0,
    ),
  },

  // City Walking Routes
  plaza: {
    name: "Meridian Plaza Loop",
    height: 0,
    bounds: { minS: -10.0, maxS: -6.0, minY: -17.0, maxY: 5.0 },
    speed: 1.2,
    dwells: [{ distance: 21.0, duration: 5.0 }],
    path: buildPath(
      createRoundedRectPoints(-10.0, -6.0, -17.0, 5.0, 1.2, 4, 0),
      0,
    ),
  },
  lobby: {
    name: "Civic Tower Lobby Walk",
    height: 0,
    bounds: { minS: 47.6, maxS: 53.0, minY: 15.2, maxY: 32.0 },
    speed: 1.15,
    dwells: [{ distance: 23.0, duration: 5.0 }],
    path: buildPath(createLobbyPoints(), 0),
  },
  skywalk: {
    name: "Skywalk Viewing Terrace",
    height: 9,
    bounds: { minS: -22.0, maxS: -5.0, minY: 64.0, maxY: 65.7 },
    speed: 1.1,
    dwells: [{ distance: 16.5, duration: 6.0 }],
    path: buildPath(
      createRoundedRectPoints(-22.0, -5.0, 64.0, 65.7, 0.7, 4, 9),
      9,
    ),
  },
  skyroom: {
    name: "Skyroom Observation Lounge",
    height: 42,
    bounds: { minS: 52.0, maxS: 56.5, minY: 29.0, maxY: 40.0 },
    speed: 1.1,
    dwells: [{ distance: 14.0, duration: 6.0 }],
    path: buildPath(
      createRoundedRectPoints(52.0, 56.5, 29.0, 40.0, 1.5, 4, 42),
      42,
    ),
  },
});

// -----------------------------------------------------------------------------
// Resident Configurations
// -----------------------------------------------------------------------------
const RESIDENT_CONFIGS = [
  // 1. Promenade (Greenway)
  {
    id: "resident-promenade",
    role: "Town Flaneur",
    routeKey: "promenade",
    speed: RESIDENT_ROUTES.promenade.speed,
    initialDist: 9.5,
    skin: skinMats.peach,
    shirt: apparelMats.slateJacket,
    pants: apparelMats.charcoalPants,
    shoes: apparelMats.darkShoe,
    addAccessories(head, torso) {
      const fedora = new THREE.Group();
      fedora.name = "hat";
      const brim = new THREE.Mesh(geoHatFedoraBrim, apparelMats.slateHat);
      brim.position.set(0, 0.01, 0.11);
      fedora.add(brim);
      const crown = new THREE.Mesh(geoHatFedoraCrown, apparelMats.slateHat);
      crown.position.set(0, 0.01, 0.17);
      fedora.add(crown);
      const band = new THREE.Mesh(geoHatFedoraBand, apparelMats.hatBand);
      band.position.set(0, 0.01, 0.13);
      fedora.add(band);
      head.add(fedora);
    },
  },

  // 2. Market Square (Greenway)
  {
    id: "resident-square",
    role: "Market Merchant",
    name: "Nia Sen",
    routeKey: "square",
    speed: RESIDENT_ROUTES.square.speed,
    initialDist: 6.2,
    skin: skinMats.olive,
    shirt: apparelMats.terracottaShirt,
    pants: apparelMats.olivePants,
    shoes: apparelMats.brownShoe,
    addAccessories(head, torso) {
      const strawHat = new THREE.Group();
      strawHat.name = "hat";
      const brim = new THREE.Mesh(geoHatStrawBrim, apparelMats.strawHat);
      brim.position.set(0, 0, 0.11);
      strawHat.add(brim);
      const crown = new THREE.Mesh(geoHatStrawCrown, apparelMats.strawHat);
      crown.position.set(0, 0, 0.16);
      strawHat.add(crown);
      head.add(strawHat);

      const satchel = new THREE.Group();
      satchel.name = "satchel";
      const bag = new THREE.Mesh(geoSatchel, apparelMats.leatherBag);
      bag.position.set(0.18, 0.02, -0.06);
      satchel.add(bag);
      const strap = new THREE.Mesh(geoSatchelStrap, apparelMats.leatherBag);
      strap.position.set(0.08, 0, 0.2);
      strap.rotation.y = 0.4;
      satchel.add(strap);
      torso.add(satchel);
    },
  },

  // 3. Glasshouse (Greenway)
  {
    id: "resident-glasshouse",
    role: "Hydroponic Nursery Farmhand",
    routeKey: "glasshouse",
    speed: RESIDENT_ROUTES.glasshouse.speed,
    initialDist: 30.5,
    skin: skinMats.bronze,
    shirt: apparelMats.forestShirt,
    pants: apparelMats.dungareeBrown,
    shoes: apparelMats.mudBoot,
    addAccessories(head, torso) {
      const workCap = new THREE.Group();
      workCap.name = "hat";
      const crown = new THREE.Mesh(geoHatCapCrown, apparelMats.earthCap);
      crown.position.set(0, -0.01, 0.12);
      workCap.add(crown);
      const visor = new THREE.Mesh(geoHatCapVisor, apparelMats.earthCap);
      visor.position.set(0, 0.14, 0.08);
      workCap.add(visor);
      head.add(workCap);

      const apron = new THREE.Group();
      apron.name = "apron";
      const bib = new THREE.Mesh(geoApron, apparelMats.canvasApron);
      bib.position.set(0, 0.115, 0.08);
      apron.add(bib);
      const pocket = new THREE.Mesh(geoApronPocket, apparelMats.apronTrim);
      pocket.position.set(0, 0.135, 0.12);
      apron.add(pocket);
      torso.add(apron);
    },
  },

  // 4. Orchard (Greenway)
  {
    id: "resident-orchard",
    role: "Orchard Caretaker",
    routeKey: "orchard",
    speed: RESIDENT_ROUTES.orchard.speed,
    initialDist: 25.0,
    skin: skinMats.fair,
    shirt: apparelMats.burgundySweater,
    pants: apparelMats.khakiPants,
    shoes: apparelMats.darkShoe,
    addAccessories(head, torso) {
      const beanie = new THREE.Group();
      beanie.name = "hat";
      const crown = new THREE.Mesh(geoBeanie, apparelMats.goldBeanie);
      crown.position.set(0, 0, 0.13);
      beanie.add(crown);
      const pompom = new THREE.Mesh(geoBeaniePompom, apparelMats.goldBeanie);
      pompom.position.set(0, 0, 0.22);
      beanie.add(pompom);
      head.add(beanie);

      const scarf = new THREE.Mesh(geoScarf, apparelMats.tealScarf);
      scarf.name = "scarf";
      scarf.position.set(0, 0, 0.45);
      torso.add(scarf);
    },
  },

  // 5. Canal (Greenway)
  {
    id: "resident-canal",
    role: "Irrigation Canal Worker",
    routeKey: "canal",
    speed: RESIDENT_ROUTES.canal.speed,
    initialDist: 19.5,
    skin: skinMats.golden,
    shirt: apparelMats.cobaltJacket,
    pants: apparelMats.navyPants,
    shoes: apparelMats.darkShoe,
    addAccessories(head, torso) {
      const hardhat = new THREE.Group();
      hardhat.name = "hat";
      const crown = new THREE.Mesh(geoHardhatCrown, apparelMats.safetyYellow);
      crown.position.set(0, 0.01, 0.14);
      hardhat.add(crown);
      const brim = new THREE.Mesh(geoHardhatBrim, apparelMats.safetyYellow);
      brim.position.set(0, 0.01, 0.09);
      hardhat.add(brim);
      head.add(hardhat);

      const vestGroup = new THREE.Group();
      vestGroup.name = "vest";
      const vestMesh = new THREE.Mesh(geoVest, apparelMats.hiVisOrange);
      vestMesh.position.set(0, 0, 0.21);
      vestGroup.add(vestMesh);
      const stripe = new THREE.Mesh(geoReflectiveStripe, matReflective);
      stripe.position.set(0, 0, 0.23);
      vestGroup.add(stripe);
      torso.add(vestGroup);
    },
  },

  // 6. Mara Voss (Civic Caretaker, static named character)
  {
    id: "caretaker-mara",
    name: CARETAKER.name,
    role: CARETAKER.role,
    static: true,
    s: CARETAKER.s,
    y: CARETAKER.y,
    height: CARETAKER.height,
    heading: CARETAKER.heading,
    skin: skinMats.fair,
    shirt: apparelMats.caretakerJacket,
    pants: apparelMats.caretakerPants,
    shoes: apparelMats.darkShoe,
    addAccessories(head, torso) {
      // Civic officer cap
      const cap = new THREE.Group();
      cap.name = "hat";
      const crown = new THREE.Mesh(geoHatCapCrown, apparelMats.caretakerCap);
      crown.position.set(0, -0.01, 0.12);
      cap.add(crown);
      const visor = new THREE.Mesh(geoHatCapVisor, apparelMats.caretakerCap);
      visor.position.set(0, 0.14, 0.08);
      cap.add(visor);
      const capTrim = new THREE.Mesh(geoBadgePin, apparelMats.civicBadgeGold);
      capTrim.position.set(0, 0.12, 0.12);
      cap.add(capTrim);
      head.add(cap);

      // Name badge on chest (DOM-free geometry mesh identifying Mara Voss)
      const badgeGroup = new THREE.Group();
      badgeGroup.name = "name-badge";
      badgeGroup.userData.name = CARETAKER.name;
      badgeGroup.userData.role = CARETAKER.role;

      const badgeFrame = new THREE.Mesh(
        geoBadgeFrame,
        apparelMats.civicBadgeGold,
      );
      badgeFrame.position.set(0.09, 0.115, 0.28);
      badgeGroup.add(badgeFrame);

      const badgePlate = new THREE.Mesh(
        geoBadgePlate,
        apparelMats.civicBadgeEnamel,
      );
      badgePlate.position.set(0.09, 0.122, 0.28);
      badgeGroup.add(badgePlate);

      const badgePin = new THREE.Mesh(geoBadgePin, apparelMats.civicBadgeGold);
      badgePin.position.set(0.09, 0.126, 0.28);
      badgeGroup.add(badgePin);

      torso.add(badgeGroup);

      // Utility belt pouch / keys
      const pouch = new THREE.Group();
      pouch.name = "pouch";
      const bag = new THREE.Mesh(geoSatchel, apparelMats.leatherBag);
      bag.scale.set(0.8, 0.8, 0.8);
      bag.position.set(-0.16, 0.02, -0.04);
      pouch.add(bag);
      torso.add(pouch);
    },
  },

  // 7. Plaza Stroller (Meridian Civic Plaza)
  {
    id: "resident-plaza",
    role: "Meridian Citizen",
    routeKey: "plaza",
    speed: RESIDENT_ROUTES.plaza.speed,
    initialDist: 0.0,
    skin: skinMats.peach,
    shirt: apparelMats.amberJacket,
    pants: apparelMats.creamPants,
    shoes: apparelMats.brownShoe,
    addAccessories(head, torso) {
      const beret = new THREE.Mesh(
        geoHatFedoraCrown,
        apparelMats.chocolateBeret,
      );
      beret.name = "hat";
      beret.position.set(0, -0.02, 0.12);
      beret.scale.set(1.1, 1.1, 0.7);
      head.add(beret);

      const satchel = new THREE.Group();
      satchel.name = "satchel";
      const bag = new THREE.Mesh(geoSatchel, apparelMats.leatherBag);
      bag.position.set(0.18, 0.02, -0.06);
      satchel.add(bag);
      torso.add(satchel);
    },
  },

  // 8. Lobby Visitor (Civic Tower lobby loop)
  {
    id: "resident-lobby",
    role: "Civic Delegate",
    routeKey: "lobby",
    speed: RESIDENT_ROUTES.lobby.speed,
    initialDist: 0.0,
    skin: skinMats.olive,
    shirt: apparelMats.formalCoat,
    pants: apparelMats.formalPants,
    shoes: apparelMats.darkShoe,
    addAccessories(head, torso) {
      const fedora = new THREE.Group();
      fedora.name = "hat";
      const brim = new THREE.Mesh(geoHatFedoraBrim, apparelMats.formalCoat);
      brim.position.set(0, 0.01, 0.11);
      fedora.add(brim);
      const crown = new THREE.Mesh(geoHatFedoraCrown, apparelMats.formalCoat);
      crown.position.set(0, 0.01, 0.17);
      fedora.add(crown);
      head.add(fedora);

      const briefcase = new THREE.Mesh(geoBriefcase, apparelMats.leatherBag);
      briefcase.name = "briefcase";
      briefcase.position.set(0.08, 0.04, -0.28);
      torso.add(briefcase);
    },
  },

  // 9. Skywalk Viewer (9 m public skywalk terrace)
  {
    id: "resident-skywalk",
    role: "Skywalk Observer",
    routeKey: "skywalk",
    speed: RESIDENT_ROUTES.skywalk.speed,
    initialDist: 0.0,
    skin: skinMats.bronze,
    shirt: apparelMats.skywalkTeal,
    pants: apparelMats.lightKhakiPants,
    shoes: apparelMats.darkShoe,
    addAccessories(head, torso) {
      const cap = new THREE.Group();
      cap.name = "hat";
      const crown = new THREE.Mesh(geoHatCapCrown, apparelMats.slateHat);
      crown.position.set(0, -0.01, 0.12);
      cap.add(crown);
      const visor = new THREE.Mesh(geoHatCapVisor, apparelMats.slateHat);
      visor.position.set(0, 0.14, 0.08);
      cap.add(visor);
      head.add(cap);

      const binoculars = new THREE.Mesh(geoBinoculars, apparelMats.darkShoe);
      binoculars.name = "binoculars";
      binoculars.position.set(0, 0.12, 0.28);
      torso.add(binoculars);
    },
  },

  // 10. Skyroom Viewer (42 m Skyroom observation lounge)
  {
    id: "resident-skyroom",
    role: "Panorama Tourist",
    routeKey: "skyroom",
    speed: RESIDENT_ROUTES.skyroom.speed,
    initialDist: 0.0,
    skin: skinMats.golden,
    shirt: apparelMats.plumJacket,
    pants: apparelMats.twillPants,
    shoes: apparelMats.brownShoe,
    addAccessories(head, torso) {
      const scarf = new THREE.Mesh(geoScarf, apparelMats.lavenderScarf);
      scarf.name = "scarf";
      scarf.position.set(0, 0, 0.45);
      torso.add(scarf);
    },
  },
];

// -----------------------------------------------------------------------------
// Resident Assembly
// -----------------------------------------------------------------------------
function buildResident(cfg, residentsGroup) {
  const root = new THREE.Group();
  root.name = cfg.id;
  root.userData.id = cfg.id;
  root.userData.role = cfg.role;
  root.userData.name = cfg.name || cfg.role;
  root.userData.routeKey = cfg.routeKey || null;
  root.userData.speed = cfg.speed || 0;
  root.userData.height =
    cfg.height !== undefined
      ? cfg.height
      : RESIDENT_ROUTES[cfg.routeKey]?.height || 0;
  residentsGroup.add(root);

  // Heading rotates around local Z (surface normal) to face motion direction
  const heading = new THREE.Group();
  heading.name = "heading";
  root.add(heading);

  // Body receives vertical gait bounce and torso sway
  const body = new THREE.Group();
  body.name = "body";
  heading.add(body);

  // Pelvis / Hips
  const pelvis = new THREE.Mesh(geoPelvis, cfg.pants);
  pelvis.name = "pelvis";
  pelvis.position.set(0, 0, 0.76);
  body.add(pelvis);

  // Left Leg (articulated hip and knee)
  const leftThigh = new THREE.Group();
  leftThigh.name = "leg-left";
  leftThigh.position.set(-0.11, 0, 0.74);
  body.add(leftThigh);

  const leftThighMesh = new THREE.Mesh(geoThigh, cfg.pants);
  leftThighMesh.position.set(0, 0, -0.17);
  leftThigh.add(leftThighMesh);

  const leftShin = new THREE.Group();
  leftShin.name = "shin-left";
  leftShin.position.set(0, 0, -0.34);
  leftThigh.add(leftShin);

  const leftShinMesh = new THREE.Mesh(geoShin, cfg.pants);
  leftShinMesh.position.set(0, 0, -0.17);
  leftShin.add(leftShinMesh);

  const leftFootMesh = new THREE.Mesh(geoFoot, cfg.shoes);
  leftFootMesh.name = "foot-left";
  leftFootMesh.position.set(0, 0.04, -0.365);
  leftShin.add(leftFootMesh);

  // Right Leg (articulated hip and knee)
  const rightThigh = new THREE.Group();
  rightThigh.name = "leg-right";
  rightThigh.position.set(0.11, 0, 0.74);
  body.add(rightThigh);

  const rightThighMesh = new THREE.Mesh(geoThigh, cfg.pants);
  rightThighMesh.position.set(0, 0, -0.17);
  rightThigh.add(rightThighMesh);

  const rightShin = new THREE.Group();
  rightShin.name = "shin-right";
  rightShin.position.set(0, 0, -0.34);
  rightThigh.add(rightShin);

  const rightShinMesh = new THREE.Mesh(geoShin, cfg.pants);
  rightShinMesh.position.set(0, 0, -0.17);
  rightShin.add(rightShinMesh);

  const rightFootMesh = new THREE.Mesh(geoFoot, cfg.shoes);
  rightFootMesh.name = "foot-right";
  rightFootMesh.position.set(0, 0.04, -0.365);
  rightShin.add(rightFootMesh);

  // Torso
  const torso = new THREE.Group();
  torso.name = "torso";
  torso.position.set(0, 0, 0.85);
  body.add(torso);

  const torsoMesh = new THREE.Mesh(geoTorso, cfg.shirt);
  torsoMesh.position.set(0, 0, 0.22);
  torso.add(torsoMesh);

  // Left Arm (articulated shoulder and elbow)
  const leftArm = new THREE.Group();
  leftArm.name = "arm-left";
  leftArm.position.set(-0.22, 0, 0.4);
  torso.add(leftArm);

  const leftUpperArmMesh = new THREE.Mesh(geoUpperArm, cfg.shirt);
  leftUpperArmMesh.position.set(0, 0, -0.14);
  leftArm.add(leftUpperArmMesh);

  const leftForearm = new THREE.Group();
  leftForearm.name = "forearm-left";
  leftForearm.position.set(0, 0, -0.28);
  leftArm.add(leftForearm);

  const leftForearmMesh = new THREE.Mesh(geoForearm, cfg.shirt);
  leftForearmMesh.position.set(0, 0, -0.12);
  leftForearm.add(leftForearmMesh);

  const leftHandMesh = new THREE.Mesh(geoHand, cfg.skin);
  leftHandMesh.position.set(0, 0, -0.27);
  leftForearm.add(leftHandMesh);

  // Right Arm (articulated shoulder and elbow)
  const rightArm = new THREE.Group();
  rightArm.name = "arm-right";
  rightArm.position.set(0.22, 0, 0.4);
  torso.add(rightArm);

  const rightUpperArmMesh = new THREE.Mesh(geoUpperArm, cfg.shirt);
  rightUpperArmMesh.position.set(0, 0, -0.14);
  rightArm.add(rightUpperArmMesh);

  const rightForearm = new THREE.Group();
  rightForearm.name = "forearm-right";
  rightForearm.position.set(0, 0, -0.28);
  rightArm.add(rightForearm);

  const rightForearmMesh = new THREE.Mesh(geoForearm, cfg.shirt);
  rightForearmMesh.position.set(0, 0, -0.12);
  rightForearm.add(rightForearmMesh);

  const rightHandMesh = new THREE.Mesh(geoHand, cfg.skin);
  rightHandMesh.position.set(0, 0, -0.27);
  rightForearm.add(rightHandMesh);

  // Neck
  const neckMesh = new THREE.Mesh(geoNeck, cfg.skin);
  neckMesh.name = "neck";
  neckMesh.position.set(0, 0, 0.46);
  torso.add(neckMesh);

  // Head with visible facial features facing forward (+Y)
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 0, 0.61);
  torso.add(head);

  const headMesh = new THREE.Mesh(geoHead, cfg.skin);
  head.add(headMesh);

  const leftEye = new THREE.Mesh(geoEye, matEye);
  leftEye.position.set(-0.05, 0.105, 0.02);
  head.add(leftEye);

  const rightEye = new THREE.Mesh(geoEye, matEye);
  rightEye.position.set(0.05, 0.105, 0.02);
  head.add(rightEye);

  const nose = new THREE.Mesh(geoNose, cfg.skin);
  nose.position.set(0, 0.115, -0.02);
  head.add(nose);

  const leftEar = new THREE.Mesh(geoEar, cfg.skin);
  leftEar.position.set(-0.105, 0, 0.01);
  head.add(leftEar);

  const rightEar = new THREE.Mesh(geoEar, cfg.skin);
  rightEar.position.set(0.105, 0, 0.01);
  head.add(rightEar);

  // Distinct hats, aprons, and accessories
  cfg.addAccessories(head, torso);

  if (cfg.static) {
    const height = cfg.height || 0;
    return {
      cfg,
      isStatic: true,
      path: null,
      height,
      distance: 0,
      gaitPhase: 0,
      speed: 0,
      gaitWeight: 0,
      dwellState: "static",
      sampleState: { s: cfg.s, y: cfg.y, heading: cfg.heading },
      root,
      heading,
      body,
      torso,
      leftThigh,
      rightThigh,
      leftShin,
      rightShin,
      leftArm,
      rightArm,
      leftForearm,
      rightForearm,
    };
  }

  const route = RESIDENT_ROUTES[cfg.routeKey];
  const height = cfg.height !== undefined ? cfg.height : route?.height || 0;
  const distance = cfg.initialDist || 0;

  return {
    cfg,
    isStatic: false,
    path: route.path,
    height,
    dwells: route.dwells || null,
    dwellIndex: 0,
    dwellState: "walking",
    dwellElapsed: 0,
    gaitWeight: 1,
    distance,
    gaitPhase: ((distance / STRIDE_LENGTH) * Math.PI * 2) % (Math.PI * 2),
    speed: cfg.speed !== undefined ? cfg.speed : route.speed,
    sampleState: { s: 0, y: 0, heading: 0 },
    root,
    heading,
    body,
    torso,
    leftThigh,
    rightThigh,
    leftShin,
    rightShin,
    leftArm,
    rightArm,
    leftForearm,
    rightForearm,
  };
}

const NIA_REACTION_RANGE = 3;
const NIA_HEIGHT_TOLERANCE = 0.4;
const NIA_SPEAKER = "Nia Sen";
const NIA_PROMPT = "Speak with Nia Sen";
const NIA_DIALOGUES = Object.freeze({
  available: Object.freeze({
    speaker: NIA_SPEAKER,
    text: "Market traffic is steady under full daylight. Word from the endcap is they're scheduling work on sunline module SL-02 soon, so I'm keeping the stall lanterns ready just in case.",
  }),
  isolated: Object.freeze({
    speaker: NIA_SPEAKER,
    text: "The sunline overhead just dropped out and Greenway went straight to emergency lighting. Produce stalls are running on backup strips until someone swaps that SL-02 emitter.",
  }),
  replaced: Object.freeze({
    speaker: NIA_SPEAKER,
    text: "Still under emergency lamps down here in the square. Word is the new emitter is seated up on the spine, so we're waiting on an endcap console to bring daylight back online.",
  }),
  complete: Object.freeze({
    speaker: NIA_SPEAKER,
    text: "Full daylight is back over Greenway Commons! The market feels alive again with SL-02 online—thank you for restoring our sun.",
  }),
});

// -----------------------------------------------------------------------------
// Primary Export: createResidents
// -----------------------------------------------------------------------------
export function createResidents(parent) {
  const residentsGroup = new THREE.Group();
  residentsGroup.name = "residents";
  parent.add(residentsGroup);

  const residents = RESIDENT_CONFIGS.map((cfg) =>
    buildResident(cfg, residentsGroup),
  );
  const nia = residents.find((r) => r.cfg.id === "resident-square") || null;
  const reactionTarget = { s: 0, y: 0, height: 0 };
  const reactionView = {
    prompt: NIA_PROMPT,
    dialogue: NIA_DIALOGUES.available,
    target: reactionTarget,
  };


  function update(dt, _elapsed) {
    // Clamp delta time to avoid large frame skips on tab switch / lag spikes
    const safeDt = dt > 0.25 ? 0.25 : dt;

    for (let i = 0; i < residents.length; i++) {
      const res = residents[i];

      if (res.isStatic) {
        const theta = res.sampleState.s / RADIUS;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        const rFloor = RADIUS - res.height - FOOT_HEIGHT;

        res.root.position.x = rFloor * sinT;
        res.root.position.y = res.sampleState.y;
        res.root.position.z = -rFloor * cosT;
        res.root.rotation.y = -theta;
        res.heading.rotation.z = -res.sampleState.heading;

        res.leftThigh.rotation.x = 0;
        res.rightThigh.rotation.x = 0;
        res.leftShin.rotation.x = 0;
        res.rightShin.rotation.x = 0;
        res.leftArm.rotation.x = 0;
        res.rightArm.rotation.x = 0;
        res.leftForearm.rotation.x = -0.18;
        res.rightForearm.rotation.x = -0.18;
        res.body.position.z = 0;
        res.torso.rotation.z = 0;
        continue;
      }

      if (safeDt > 0) {
        if (res.dwells && res.dwells.length > 0) {
          const dwell = res.dwells[res.dwellIndex];
          const S_dist = SETTLE_DURATION * res.speed * SETTLE_DISTANCE_FACTOR;
          const D_start =
            (dwell.distance - S_dist + res.path.perimeter) % res.path.perimeter;

          if (res.dwellState === "walking") {
            const step = res.speed * safeDt;
            if (
              isDistanceCrossed(
                res.distance,
                res.distance + step,
                D_start,
                res.path.perimeter,
              )
            ) {
              res.dwellState = "settling";
              res.dwellElapsed = 0;
              res.gaitWeight = 1;
            } else {
              res.distance += step;
              res.gaitPhase =
                (res.gaitPhase + (step / STRIDE_LENGTH) * Math.PI * 2) %
                (Math.PI * 2);
            }
          }

          if (res.dwellState === "settling") {
            res.dwellElapsed += safeDt;
            const u = Math.min(1, res.dwellElapsed / SETTLE_DURATION);
            const w = 1 - (3 * u * u - 2 * u * u * u);
            res.gaitWeight = w;
            const step = res.speed * w * safeDt;
            res.distance += step;
            res.gaitPhase =
              (res.gaitPhase + (step / STRIDE_LENGTH) * Math.PI * 2) %
              (Math.PI * 2);
            if (u >= 1) {
              res.dwellState = "dwelling";
              res.dwellElapsed = 0;
              res.gaitWeight = 0;
            }
          } else if (res.dwellState === "dwelling") {
            res.dwellElapsed += safeDt;
            res.gaitWeight = 0;
            if (res.dwellElapsed >= dwell.duration) {
              res.dwellState = "resuming";
              res.dwellElapsed = 0;
            }
          } else if (res.dwellState === "resuming") {
            res.dwellElapsed += safeDt;
            const u = Math.min(1, res.dwellElapsed / RESUME_DURATION);
            const w = 3 * u * u - 2 * u * u * u;
            res.gaitWeight = w;
            const step = res.speed * w * safeDt;
            res.distance += step;
            res.gaitPhase =
              (res.gaitPhase + (step / STRIDE_LENGTH) * Math.PI * 2) %
              (Math.PI * 2);
            if (u >= 1) {
              res.dwellState = "walking";
              res.dwellElapsed = 0;
              res.gaitWeight = 1;
              res.dwellIndex = (res.dwellIndex + 1) % res.dwells.length;
            }
          }
        } else {
          // Standard uninterrupted walking loop
          const step = res.speed * safeDt;
          res.distance += step;
          res.gaitPhase =
            (res.gaitPhase + (step / STRIDE_LENGTH) * Math.PI * 2) %
            (Math.PI * 2);
          res.gaitWeight = 1;
        }

        if (res.distance >= res.path.perimeter) {
          res.distance %= res.path.perimeter;
        }
      }

      // Sample path position and direction without allocations
      samplePath(res.path, res.distance, res.sampleState);

      const theta = res.sampleState.s / RADIUS;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const rFloor = RADIUS - res.height - FOOT_HEIGHT;

      res.root.position.x = rFloor * sinT;
      res.root.position.y = res.sampleState.y;
      res.root.position.z = -rFloor * cosT;

      res.root.rotation.y = -theta;
      res.heading.rotation.z = -res.sampleState.heading;

      // Articulated walking gait synchronized with travelled distance and smoothly damped on dwell
      const swing = Math.sin(res.gaitPhase);
      const gw = res.gaitWeight;

      res.leftThigh.rotation.x = swing * 0.42 * gw;
      res.rightThigh.rotation.x = -swing * 0.42 * gw;

      res.leftShin.rotation.x = -Math.max(0, swing * 0.65) * gw;
      res.rightShin.rotation.x = -Math.max(0, -swing * 0.65) * gw;

      res.leftArm.rotation.x = -swing * 0.32 * gw;
      res.rightArm.rotation.x = swing * 0.32 * gw;
      res.leftForearm.rotation.x = -0.18 - Math.max(0, -swing * 0.15) * gw;
      res.rightForearm.rotation.x = -0.18 - Math.max(0, swing * 0.15) * gw;

      res.body.position.z = Math.abs(swing) * 0.035 * gw;
      res.torso.rotation.z = swing * 0.04 * gw;
    }
    if (nia) {
      reactionTarget.s = nia.sampleState.s;
      reactionTarget.y = nia.sampleState.y;
      reactionTarget.height = nia.height;
    }
  }

  // Initial placement and pose: update(0, 0) immediately places all residents
  update(0, 0);
  function getReaction(playerState, sunlinePhase = "available") {
    if (!nia || !playerState || !playerState.grounded) return null;
    if (playerState.traversalMode !== "walk") return null;

    const targetS = nia.sampleState.s;
    const targetY = nia.sampleState.y;
    const targetHeight = nia.height;
    reactionTarget.s = targetS;
    reactionTarget.y = targetY;
    reactionTarget.height = targetHeight;

    if (!(Math.abs(playerState.height - targetHeight) <= NIA_HEIGHT_TOLERANCE)) {
      return null;
    }

    const targetTheta = targetS / RADIUS;
    const dTheta = Math.atan2(
      Math.sin(playerState.theta - targetTheta),
      Math.cos(playerState.theta - targetTheta),
    );
    const physicalRadius = Math.max(1, RADIUS - targetHeight);
    const dist = Math.hypot(
      dTheta * physicalRadius,
      playerState.y - targetY,
    );
    if (!(dist <= NIA_REACTION_RANGE)) return null;

    reactionView.dialogue =
      NIA_DIALOGUES[sunlinePhase] || NIA_DIALOGUES.available;
    return reactionView;
  }


  return {
    update,
    residents,
    getReaction,
  };
}
