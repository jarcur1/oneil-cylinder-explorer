import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { setSurfaceMatrix } from "./surface.js";
import {
  RESERVOIR_LAYOUT,
  RESERVOIR_THETA,
  RESERVOIR_Y,
  STILLWATER_LENS,
  reservoirS,
  reservoirY,
} from "./reservoir-layout.js";
import { inStillwaterTramCorridor } from "./tram-layout.js";
import { PLANTING_BED } from "./delivery-layout.js";

// Groves are deliberately irregular, leaving open glades between them. The
// eastern and northern groves are drier; those by the shore favor birch.
const GROVES = [
  [-135, -116, 18, 13, "oak"], [-120, -40, 21, 22, "birch"],
  [-140, 20, 19, 27, "oak"], [-126, 79, 19, 20, "pine"],
  [-71, 73, 16, 16, "birch"], [-52, 129, 23, 10, "oak"],
  [-5, 130, 19, 10, "pine"], [45, 128, 21, 11, "oak"],
  [82, 77, 15, 18, "birch"], [128, 45, 19, 25, "pine"],
  [130, -21, 17, 25, "pine"], [128, -95, 20, 19, "oak"],
  [76, -114, 19, 12, "birch"], [28, -124, 17, 9, "oak"],
  [-145, 127, 12, 9, "pine"], [140, 122, 12, 10, "pine"],
];

const MIN_BRANCH_HEIGHT = 2.8;
const MIN_FOLIAGE_BASE = 3.0;
const _frameMatrix = new THREE.Matrix4();
const _frameRotZ = new THREE.Matrix4();
const _frameRotY = new THREE.Matrix4();
const _branchProbe = new THREE.Vector3();

function setBranchFrameMatrix(matrix, s, y, base, azimuth, tilt) {
  setSurfaceMatrix(matrix, reservoirS(s) / RADIUS, reservoirY(y), base - 0.5, 1, 1, 1);
  matrix.multiply(_frameRotZ.makeRotationZ(azimuth));
  matrix.multiply(_frameRotY.makeRotationY(tilt));
  return matrix;
}

function branchPoint(s, y, base, azimuth, tilt, distance) {
  setBranchFrameMatrix(_frameMatrix, s, y, base, azimuth, tilt);
  _branchProbe.set(0, 0, distance).applyMatrix4(_frameMatrix);
  const theta = Math.atan2(_branchProbe.x, -_branchProbe.z);
  const deltaTheta = Math.atan2(
    Math.sin(theta - RESERVOIR_THETA),
    Math.cos(theta - RESERVOIR_THETA),
  );
  return {
    s: deltaTheta * RADIUS,
    y: _branchProbe.y - RESERVOIR_Y,
    h: RADIUS - Math.hypot(_branchProbe.x, _branchProbe.z),
  };
}

function createFoliageClusterGeometry(amplitude, seedOffset) {
  const geo = new THREE.IcosahedronGeometry(0.5);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Quantized position hash moves coincident corner vertices together.
    let h = (Math.imul(Math.round(x * 1000) + seedOffset, 73856093) ^
      Math.imul(Math.round(y * 1000) + seedOffset, 19349663) ^
      Math.imul(Math.round(z * 1000) + seedOffset, 83492791)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    const radial = 1 + (((h & 0xffff) / 65535) * 2 - 1) * amplitude;
    pos.setXYZ(i, x * radial, y * radial, z * radial);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function insideRect(s, y, rect, margin) {
  return Math.abs(s - rect.s) < rect.width / 2 + margin &&
    Math.abs(y - rect.y) < rect.depth / 2 + margin;
}

function clearOfPublicSpace(s, y, margin) {
  const { bounds, basin, bank, pavilion, lookout, paths } = RESERVOIR_LAYOUT;
  if (s < bounds.minS + margin || s > bounds.maxS - margin ||
      y < bounds.minY + margin || y > bounds.maxY - margin) return false;
  if (insideRect(s, y, PLANTING_BED, margin)) return false;
  if (insideRect(s, y, STILLWATER_LENS.clearing, margin + 1)) return false;
  if (insideRect(s, y, basin, bank.width + margin) ||
      insideRect(s, y, pavilion, margin + 2) ||
      insideRect(s, y, lookout, margin + 2)) return false;
  if (Math.hypot(s, y + 120) < 8 + margin) return false;
  return !paths.some((path) => insideRect(s, y, path, margin));
}

/** Build static, instanced woodland directly in the cylinder's surface frame. */
export function createWoodland(parent) {
  let seed = 0x78d12a3b;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // The sum produces a bounded, center-weighted distribution without grid rows.
  const clustered = () => random() + random() + random() + random() - 2;
  const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const bark = material(0x604a37);
  // Subtle vertical bark fissures and mottling for the close-up oak limbs.
  const oakBarkPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const furrow = Math.sin(x * 0.42 + Math.sin(y * 0.24) * 1.35);
      const mottle = ((Math.imul(x * 37 + y * 19, 1103515245) >>> 24) & 31) - 15;
      const shade = 0.96 + furrow * 0.14 + mottle * 0.005;
      const index = (y * 64 + x) * 4;
      oakBarkPixels[index] = Math.max(0, Math.min(255, Math.round(96 * shade)));
      oakBarkPixels[index + 1] = Math.max(0, Math.min(255, Math.round(74 * shade)));
      oakBarkPixels[index + 2] = Math.max(0, Math.min(255, Math.round(55 * shade)));
      oakBarkPixels[index + 3] = 255;
    }
  }
  const oakBarkTexture = new THREE.DataTexture(oakBarkPixels, 64, 64, THREE.RGBAFormat);
  oakBarkTexture.colorSpace = THREE.SRGBColorSpace;
  oakBarkTexture.wrapS = THREE.RepeatWrapping;
  oakBarkTexture.wrapT = THREE.RepeatWrapping;
  oakBarkTexture.generateMipmaps = true;
  oakBarkTexture.minFilter = THREE.LinearMipmapLinearFilter;
  oakBarkTexture.magFilter = THREE.LinearFilter;
  oakBarkTexture.needsUpdate = true;
  const detailedOakBark = material(0xffffff);
  detailedOakBark.map = oakBarkTexture;
  const paleBark = material(0xd5d1b9);
  // Small repeating horizontal lenticels make the pale bark readable close up.
  const barkPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const band = Math.floor(y / 4);
      const hash = (Math.imul(band + 11, 1103515245) >>> 0);
      const start = hash % 57;
      const fleck = y % 4 === 0 && x >= start && x < start + 3 + (hash >>> 8) % 7;
      const grain = ((x * 13 + y * 7) % 13) - 6;
      const index = (y * 64 + x) * 4;
      barkPixels[index] = fleck ? 55 : 229 + grain;
      barkPixels[index + 1] = fleck ? 54 : 226 + grain;
      barkPixels[index + 2] = fleck ? 48 : 208 + grain;
      barkPixels[index + 3] = 255;
    }
  }
  const barkTexture = new THREE.DataTexture(barkPixels, 64, 64, THREE.RGBAFormat);
  barkTexture.colorSpace = THREE.SRGBColorSpace;
  barkTexture.generateMipmaps = true;
  barkTexture.minFilter = THREE.LinearMipmapLinearFilter;
  barkTexture.magFilter = THREE.LinearFilter;
  barkTexture.needsUpdate = true;
  paleBark.color.setHex(0xffffff);
  paleBark.map = barkTexture;
  const needleBark = material(0x594536);
  const leaves = material(0xffffff);
  const batches = {
    oakTrunks: { name: "woodland_oak_trunks", geo: new THREE.CylinderGeometry(0.35, 0.5, 1, 7).rotateX(Math.PI / 2), mat: bark, instances: [] },
    birchTrunks: { name: "woodland_birch_trunks", geo: new THREE.CylinderGeometry(0.36, 0.5, 1, 6).rotateX(Math.PI / 2), mat: paleBark, instances: [] },
    pineTrunks: { name: "woodland_pine_trunks", geo: new THREE.CylinderGeometry(0.3, 0.5, 1, 7).rotateX(Math.PI / 2), mat: needleBark, instances: [] },
    oakCrowns: { name: "woodland_oak_crowns", geo: new THREE.IcosahedronGeometry(0.5, 1), mat: leaves, instances: [] },
    birchCrowns: { name: "woodland_birch_crowns", geo: new THREE.DodecahedronGeometry(0.5, 0), mat: leaves, instances: [] },
    pineCrowns: { name: "woodland_pine_crowns", geo: new THREE.ConeGeometry(0.5, 1, 7).rotateX(Math.PI / 2), mat: leaves, instances: [] },
    oakBranches: {
      name: "woodland_oak_branches",
      geo: new THREE.CylinderGeometry(0.22, 0.5, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2),
      mat: detailedOakBark,
      instances: [],
    },
    birchBranches: {
      name: "woodland_birch_branches",
      geo: new THREE.CylinderGeometry(0.24, 0.5, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2),
      mat: paleBark,
      instances: [],
    },
    oakDetailCrowns: {
      name: "woodland_oak_foliage_clusters",
      geo: createFoliageClusterGeometry(0.22, 101),
      mat: leaves,
      instances: [],
    },
    birchDetailCrowns: {
      name: "woodland_birch_foliage_clusters",
      geo: createFoliageClusterGeometry(0.24, 211),
      mat: leaves,
      instances: [],
    },
    shrubs: { name: "woodland_shrubs", geo: new THREE.DodecahedronGeometry(0.5, 0), mat: leaves, instances: [] },
  };
  const palettes = {
    oak: [0x365d31, 0x497642, 0x557d3b, 0x456a35],
    birch: [0x739858, 0x87a960, 0x688f51, 0x9bab65],
    pine: [0x294b37, 0x345941, 0x3e6043, 0x284d42],
    shrub: [0x526e39, 0x6a8144, 0x3e653d, 0x798953],
  };
  const pickColor = (type) => palettes[type][Math.floor(random() * palettes[type].length)];
  const add = (batch, s, y, base, width, depth, height, yaw = 0, color = null) => {
    batches[batch].instances.push({ s, y, base, width, depth, height, yaw, color });
  };
  const addBranch = (batch, s, y, base, diameter, length, azimuth, tilt, color = 0xffffff) => {
    batches[batch].instances.push({ s, y, base, diameter, length, azimuth, tilt, color });
  };
  const obstacles = [];
  const trees = [];
  const westGroveCandidates = [];
  // A fixed attempt limit makes generation deterministic even if the layout changes.
  for (let attempt = 0; attempt < 30000 && trees.length < 480; attempt++) {
    const grove = GROVES[Math.floor(random() * GROVES.length)];
    const s = grove[0] + clustered() * grove[2];
    const y = grove[1] + clustered() * grove[3];
    if (!clearOfPublicSpace(s, y, 2.2)) continue;
    if (inStillwaterTramCorridor(reservoirS(s), reservoirY(y), 5)) continue;
    if (trees.some((tree) => Math.hypot(tree.s - s, tree.y - y) < 2.35)) continue;
    const type = random() < 0.72 ? grove[4] : ["oak", "birch", "pine"][Math.floor(random() * 3)];
    const young = random() < 0.25;
    const height = young ? 4.0 + random() * 2.5 :
      type === "pine" ? 10 + random() * 6 : type === "birch" ? 8 + random() * 4.5 : 8 + random() * 4;
    const diameter = young ? 0.18 + random() * 0.12 :
      type === "oak" ? 0.65 + random() * 0.4 : 0.35 + random() * 0.24;
    const yaw = random() * Math.PI * 2;
    const crownWidth = (young ? 1.5 + random() : type === "oak" ? 4.3 + random() * 2 : type === "birch" ? 2.6 + random() * 1.3 : 3.2 + random() * 1.5);
    trees.push({ s, y });

    const trunkBatch = `${type}Trunks`;
    const trunkHeight = type === "pine" ? height * 0.9 : height * 0.7;
    const stemCount = type === "birch" && !young && random() < 0.65 ? 3 : 1;
    const detail = !young && type !== "pine" && s <= -103 &&
      Math.hypot((s + 120) / 24, (y + 38) / 30) <= 1;
    const stems = detail ? [] : null;
    for (let stem = 0; stem < stemCount; stem++) {
      const angle = yaw + stem * Math.PI * 2 / stemCount;
      const offset = stemCount === 1 ? 0 : diameter * 0.7;
      const stemS = s + Math.cos(angle) * offset;
      const stemY = y + Math.sin(angle) * offset;
      const stemDiameter = stemCount === 1 ? diameter : diameter * 0.65;
      const stemHeight = trunkHeight * (stem === 0 ? 1 : 0.75 + random() * 0.23);
      add(trunkBatch, stemS, stemY, 0, stemDiameter, stemDiameter, stemHeight, angle);
      stems?.push({ s: stemS, y: stemY, diameter: stemDiameter, height: stemHeight, angle });
      obstacles.push({ name: `woodland_${type}_trunk`, theta: reservoirS(stemS) / RADIUS,
        y: reservoirY(stemY), width: stemDiameter, depth: stemDiameter, base: 0, height: stemHeight });
    }

    const crownBatch = `${type}Crowns`;
    const crownStart = detail ? batches[crownBatch].instances.length : 0;
    if (type === "oak") {
      const base = young ? 2.25 : height * 0.48;
      const crownH = height - base;
      add("oakCrowns", s, y, base, crownWidth, crownWidth * 0.85, crownH, yaw, pickColor(type));
      const lobes = young ? 2 : 3 + Math.floor(random() * 2);
      for (let n = 0; n < lobes; n++) {
        const angle = yaw + n * Math.PI * 2 / lobes + (random() - 0.5) * 0.6;
        const distance = crownWidth * (0.23 + random() * 0.16);
        add("oakCrowns", s + Math.cos(angle) * distance, y + Math.sin(angle) * distance,
          base + random() * crownH * 0.28, crownWidth * (0.48 + random() * 0.22),
          crownWidth * (0.48 + random() * 0.2), crownH * (0.55 + random() * 0.25), angle, pickColor(type));
      }
    } else if (type === "birch") {
      const base = young ? 2.25 : height * 0.49;
      for (let n = 0; n < 3; n++) {
        const angle = yaw + n * Math.PI * 2 / 3;
        const offset = n === 0 ? 0 : crownWidth * 0.25;
        add("birchCrowns", s + Math.cos(angle) * offset, y + Math.sin(angle) * offset,
          base + n * (height - base) * 0.12, crownWidth * (0.55 + random() * 0.2),
          crownWidth * (0.5 + random() * 0.2), (height - base) * (0.7 + random() * 0.25), angle, pickColor(type));
      }
    } else {
      const base = young ? 2.25 : 2.8 + random() * 0.7;
      const tierHeight = (height - base) * 0.57;
      for (let n = 0; n < 3; n++) {
        const width = crownWidth * (1 - n * 0.2);
        add("pineCrowns", s, y, base + n * (height - base) * 0.22,
          width, width, tierHeight * (1 - n * 0.12), yaw + n * 0.3, pickColor(type));
      }
    }
    if (detail) {
      westGroveCandidates.push({
        s, y, type, yaw, crownWidth, stems,
        crownBatch, crownStart, crownEnd: batches[crownBatch].instances.length,
      });
    }
  }

  // Shrubs form little thickets instead of an even sprinkling across clearings.
  for (let patch = 0; patch < 85; patch++) {
    const grove = GROVES[Math.floor(random() * GROVES.length)];
    const centerS = grove[0] + clustered() * grove[2];
    const centerY = grove[1] + clustered() * grove[3];
    const count = 2 + Math.floor(random() * 5);
    for (let n = 0; n < count; n++) {
      const s = centerS + clustered() * 3.5;
      const y = centerY + clustered() * 3.5;
      if (!clearOfPublicSpace(s, y, 2.5)) continue;
      if (inStillwaterTramCorridor(reservoirS(s), reservoirY(y), 5)) continue;
      const width = 0.9 + random() * 1.6;
      add("shrubs", s, y, 0, width, width * (0.65 + random() * 0.4),
        0.7 + random() * 1.1, random() * Math.PI * 2, pickColor("shrub"));
    }
  }

  // Uneven small fans follow the cylindrical floor, with grass and glades left
  // between them. Keep each entire fan away from paths and built features.
  const litterPositions = [];
  const litterNormals = [];
  const litterColors = [];
  const litterIndices = [];
  const patches = [];
  const litterPalette = [0x685b3d, 0x776647, 0x625942, 0x857452, 0x766a4d];
  const litterColor = new THREE.Color();
  for (let attempt = 0; attempt < trees.length * 2 && patches.length < 220; attempt++) {
    const tree = trees[Math.floor(random() * trees.length)];
    const s = tree.s + (random() - 0.5) * 3;
    const y = tree.y + (random() - 0.5) * 3;
    const radius = 1.5 + random() * 1.7;
    if (!clearOfPublicSpace(s, y, radius + 0.5)) continue;
    if (patches.some((patch) => Math.hypot(patch.s - s, patch.y - y) < patch.radius + radius + 0.15)) continue;
    patches.push({ s, y, radius });
    litterColor.setHex(litterPalette[Math.floor(random() * litterPalette.length)]);
    const first = litterPositions.length / 3;
    const vertex = (localS, localY, shade) => {
      const theta = reservoirS(localS) / RADIUS;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      litterPositions.push((RADIUS - 0.012) * sin, reservoirY(localY), -(RADIUS - 0.012) * cos);
      litterNormals.push(-sin, 0, cos);
      litterColors.push(litterColor.r * shade, litterColor.g * shade, litterColor.b * shade);
    };
    vertex(s, y, 0.9);
    const edges = 10;
    const phase = random() * Math.PI * 2;
    for (let i = 0; i < edges; i++) {
      const angle = phase + i * Math.PI * 2 / edges;
      const r = radius * (0.65 + random() * 0.35);
      vertex(s + Math.cos(angle) * r, y + Math.sin(angle) * r, 0.85 + random() * 0.3);
      litterIndices.push(first, first + 1 + i, first + 1 + (i + 1) % edges);
    }
  }
  if (litterIndices.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(litterPositions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(litterNormals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(litterColors, 3));
    geometry.setIndex(litterIndices);
    const litter = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, side: THREE.DoubleSide,
    }));
    litter.name = "woodland_leaf_litter";
    parent.add(litter);
  }

  // Flat pointed fronds radiate from each fern, rather than a scaled ball.
  const fernVertices = [];
  for (let frond = 0; frond < 7; frond++) {
    const angle = frond * Math.PI * 2 / 7;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const px = -dy;
    const py = dx;
    fernVertices.push(
      0, 0, 0,
      dx * 0.23 + px * 0.09, dy * 0.23 + py * 0.09, 1,
      dx * 0.5, dy * 0.5, 0.7,
      0, 0, 0,
      dx * 0.5, dy * 0.5, 0.7,
      dx * 0.23 - px * 0.09, dy * 0.23 - py * 0.09, 1,
    );
  }
  const fernGeometry = new THREE.BufferGeometry();
  fernGeometry.setAttribute("position", new THREE.Float32BufferAttribute(fernVertices, 3));
  fernGeometry.computeVertexNormals();
  const ferns = [];
  for (const patch of patches) {
    const count = 2 + Math.floor(random() * 5);
    for (let i = 0; i < count; i++) {
      const s = patch.s + (random() - 0.5) * patch.radius * 1.8;
      const y = patch.y + (random() - 0.5) * patch.radius * 1.8;
      if (!clearOfPublicSpace(s, y, 1)) continue;
      ferns.push({ s, y, width: 0.5 + random() * 0.8,
        height: 0.2 + random() * 0.6, yaw: random() * Math.PI * 2,
        color: [0x426b38, 0x577c40, 0x68884a][Math.floor(random() * 3)] });
    }
  }
  if (ferns.length) {
    const fernMesh = new THREE.InstancedMesh(fernGeometry, new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, side: THREE.DoubleSide,
    }), ferns.length);
    fernMesh.name = "woodland_ferns";
    const fernMatrix = new THREE.Matrix4();
    const fernRotation = new THREE.Matrix4();
    const fernColor = new THREE.Color();
    ferns.forEach((fern, index) => {
      setSurfaceMatrix(fernMatrix, reservoirS(fern.s) / RADIUS, reservoirY(fern.y),
        -fern.height / 2, fern.width, fern.width, fern.height);
      fernMatrix.multiply(fernRotation.makeRotationZ(fern.yaw));
      fernMesh.setMatrixAt(index, fernMatrix);
      fernMesh.setColorAt(index, fernColor.setHex(fern.color));
    });
    fernMesh.instanceMatrix.needsUpdate = true;
    fernMesh.instanceColor.needsUpdate = true;
    parent.add(fernMesh);
  }

  // Replace coarse crowns on a bounded group of mature oak/birch trees in the
  // west path grove (around s=-120, y=-40 beside northbound path s=-100) with
  // tapering attached branches and irregular segmented crown clusters.
  let detailSeed = 0x4f2a9c17;
  const detailRandom = () => {
    detailSeed = (Math.imul(detailSeed, 1664525) + 1013904223) >>> 0;
    return detailSeed / 4294967296;
  };
  const detailPickColor = (type) => palettes[type][Math.floor(detailRandom() * palettes[type].length)];
  const oakBarkShades = [0xffffff, 0xf2ece4, 0xe4ddd2];
  const pushSafeBranch = (batchName, s, y, base, diameter, length, azimuth, tilt, color) => {
    const startH = Math.max(MIN_BRANCH_HEIGHT, base);
    let safeTilt = tilt;
    let tip = branchPoint(s, y, startH, azimuth, safeTilt, length);
    for (let step = 0; step < 6 && tip.h < MIN_BRANCH_HEIGHT; step++) {
      safeTilt *= 0.78;
      tip = branchPoint(s, y, startH, azimuth, safeTilt, length);
    }
    if (tip.h < MIN_BRANCH_HEIGHT) {
      safeTilt = Math.min(safeTilt, 0.25);
    }
    addBranch(batchName, s, y, startH, diameter, length, azimuth, safeTilt, color);
    return { tilt: safeTilt, startH };
  };
  const addFoliageCluster = (batchName, s, y, centerH, width, depth, height, yaw, color) => {
    const base = Math.max(MIN_FOLIAGE_BASE, centerH - height * 0.5);
    add(batchName, s, y, base, width, depth, height, yaw, color);
  };
  const buildDetailedOak = (tree) => {
    const stem = tree.stems[0];
    const primaryCount = 5 + Math.floor(detailRandom() * 2);
    const leaderCount = 2;
    const totalLimbs = primaryCount + leaderCount;
    for (let i = 0; i < totalLimbs; i++) {
      const isLeader = i >= primaryCount;
      const u = isLeader
        ? 0.87 + detailRandom() * 0.08
        : 0.52 + (i / Math.max(1, primaryCount - 1)) * 0.30 + (detailRandom() - 0.5) * 0.06;
      const clampedU = Math.max(0.48, Math.min(0.95, u));
      const base = Math.max(3.0, stem.height * clampedU);
      const trunkDiaAtU = stem.diameter * (1 - 0.30 * clampedU);
      const azimuth = tree.yaw + (isLeader
        ? (i - primaryCount) * Math.PI + (detailRandom() - 0.5) * 0.8
        : (i * Math.PI * 2) / primaryCount + (detailRandom() - 0.5) * 0.55);
      const tilt = isLeader ? 0.30 + detailRandom() * 0.32 : 0.74 + detailRandom() * 0.44;
      const length = tree.crownWidth * (isLeader ? 0.36 + detailRandom() * 0.16 : 0.42 + detailRandom() * 0.22);
      const d0 = trunkDiaAtU * (0.48 + detailRandom() * 0.16);
      const barkShade = oakBarkShades[Math.floor(detailRandom() * oakBarkShades.length)];
      const primary = pushSafeBranch("oakBranches", stem.s, stem.y, base, d0, length, azimuth, tilt, barkShade);

      const secondaryCount = isLeader ? 2 : 2 + (detailRandom() < 0.5 ? 1 : 0);
      for (let j = 0; j < secondaryCount; j++) {
        const t = j === secondaryCount - 1 ? 0.88 + detailRandom() * 0.05 : 0.48 + detailRandom() * 0.28;
        const attach = branchPoint(stem.s, stem.y, primary.startH, azimuth, primary.tilt, length * t);
        const dParent = d0 * (1 - 0.56 * t);
        const d1 = dParent * (0.68 + detailRandom() * 0.18);
        const forkSign = j % 2 === 0 ? 1 : -1;
        const az2 = azimuth + forkSign * (0.34 + detailRandom() * 0.52);
        const tilt2 = Math.max(0.24, Math.min(1.42, primary.tilt + (detailRandom() - 0.38) * 0.50));
        const len2 = length * (0.48 + detailRandom() * 0.24);
        const sec = pushSafeBranch("oakBranches", attach.s, attach.y, attach.h, d1, len2, az2, tilt2, barkShade);

        const twigCount = 1 + (detailRandom() < 0.6 ? 1 : 0);
        for (let k = 0; k < twigCount; k++) {
          const tTwig = k === 0 ? 0.86 : 0.60 + detailRandom() * 0.18;
          const twigAttach = branchPoint(attach.s, attach.y, sec.startH, az2, sec.tilt, len2 * tTwig);
          const d2 = d1 * (1 - 0.56 * tTwig) * (0.65 + detailRandom() * 0.20);
          const az3 = az2 + (k === 0 ? 1 : -1) * (0.28 + detailRandom() * 0.50);
          const tilt3 = Math.max(0.22, Math.min(1.38, sec.tilt + (detailRandom() - 0.45) * 0.55));
          const len3 = len2 * (0.44 + detailRandom() * 0.26);
          const twig = pushSafeBranch("oakBranches", twigAttach.s, twigAttach.y, twigAttach.h, d2, len3, az3, tilt3, barkShade);

          // Segmented canopy pads clustered at twig tips preserve open negative spaces beneath limbs.
          const padCount = 2 + (detailRandom() < 0.45 ? 1 : 0);
          for (let p = 0; p < padCount; p++) {
            const frac = p === 0 ? 0.95 : 0.55 + detailRandom() * 0.35;
            const leafAnchor = branchPoint(twigAttach.s, twigAttach.y, twig.startH, az3, twig.tilt, len3 * frac);
            const w = 1.15 + detailRandom() * 1.05;
            const d = w * (0.78 + detailRandom() * 0.34);
            const h = w * (0.48 + detailRandom() * 0.24);
            const jitterAz = detailRandom() * Math.PI * 2;
            const jitterDist = p === 0 ? 0.18 : 0.35 + detailRandom() * 0.45;
            addFoliageCluster(
              "oakDetailCrowns",
              leafAnchor.s + Math.cos(jitterAz) * jitterDist,
              leafAnchor.y + Math.sin(jitterAz) * jitterDist,
              leafAnchor.h + 0.18 + detailRandom() * 0.32,
              w, d, h, detailRandom() * Math.PI * 2, detailPickColor("oak"),
            );
          }
        }
      }
    }
  };
  const buildDetailedBirch = (tree) => {
    for (const stem of tree.stems) {
      const branchCount = tree.stems.length === 1 ? 5 : 3 + (detailRandom() < 0.55 ? 1 : 0);
      for (let i = 0; i < branchCount; i++) {
        const isTop = i === branchCount - 1;
        const u = isTop
          ? 0.89 + detailRandom() * 0.06
          : 0.48 + (i / Math.max(1, branchCount - 1)) * 0.36 + (detailRandom() - 0.5) * 0.05;
        const clampedU = Math.max(0.45, Math.min(0.95, u));
        const base = Math.max(3.0, stem.height * clampedU);
        const trunkDiaAtU = stem.diameter * (1 - 0.28 * clampedU);
        const azSpread = tree.stems.length === 1
          ? (i * Math.PI * 2) / branchCount
          : ((i / Math.max(1, branchCount - 1)) - 0.5) * 2.2;
        const azimuth = stem.angle + azSpread + (detailRandom() - 0.5) * 0.45;
        const tilt = isTop ? 0.22 + detailRandom() * 0.24 : 0.32 + detailRandom() * 0.40;
        const length = tree.crownWidth * (0.45 + detailRandom() * 0.25);
        const d0 = trunkDiaAtU * (0.46 + detailRandom() * 0.18);
        const limbColor = detailRandom() < 0.6 ? 0xffffff : 0xf5f1e6;
        const primary = pushSafeBranch("birchBranches", stem.s, stem.y, base, d0, length, azimuth, tilt, limbColor);

        const secCount = 2;
        for (let j = 0; j < secCount; j++) {
          const t = j === 0 ? 0.52 + detailRandom() * 0.18 : 0.88 + detailRandom() * 0.06;
          const attach = branchPoint(stem.s, stem.y, primary.startH, azimuth, primary.tilt, length * t);
          const d1 = d0 * (1 - 0.52 * t) * (0.68 + detailRandom() * 0.18);
          const az2 = azimuth + (j === 0 ? -1 : 1) * (0.30 + detailRandom() * 0.42);
          const tilt2 = Math.max(0.20, Math.min(1.05, primary.tilt + (detailRandom() - 0.30) * 0.44));
          const len2 = length * (0.50 + detailRandom() * 0.28);
          const sec = pushSafeBranch("birchBranches", attach.s, attach.y, attach.h, d1, len2, az2, tilt2, 0xeee8d8);

          const twigCount = 1 + (detailRandom() < 0.65 ? 1 : 0);
          for (let k = 0; k < twigCount; k++) {
            const tTwig = k === 0 ? 0.88 : 0.62 + detailRandom() * 0.16;
            const twigAttach = branchPoint(attach.s, attach.y, sec.startH, az2, sec.tilt, len2 * tTwig);
            const d2 = d1 * (1 - 0.52 * tTwig) * (0.62 + detailRandom() * 0.18);
            const az3 = az2 + (k === 0 ? 1 : -1) * (0.32 + detailRandom() * 0.55);
            // Broad outer shoots soften the upright silhouette of the stems.
            const tilt3 = 0.62 + detailRandom() * 0.90;
            const len3 = 0.65 + detailRandom() * 0.65;
            const twig = pushSafeBranch("birchBranches", twigAttach.s, twigAttach.y, twigAttach.h, d2, len3, az3, tilt3, 0x7a6254);

            const puffCount = 1 + (detailRandom() < 0.55 ? 1 : 0);
            for (let p = 0; p < puffCount; p++) {
              const frac = p === 0 ? 0.92 : 0.52 + detailRandom() * 0.28;
              const leafAnchor = branchPoint(twigAttach.s, twigAttach.y, twig.startH, az3, twig.tilt, len3 * frac);
              const w = 0.72 + detailRandom() * 0.65;
              const d = w * (0.78 + detailRandom() * 0.30);
              const h = w * (0.95 + detailRandom() * 0.42);
              const jitterAz = detailRandom() * Math.PI * 2;
              const jitterDist = p === 0 ? 0.12 : 0.24 + detailRandom() * 0.32;
              addFoliageCluster(
                "birchDetailCrowns",
                leafAnchor.s + Math.cos(jitterAz) * jitterDist,
                leafAnchor.y + Math.sin(jitterAz) * jitterDist,
                leafAnchor.h + 0.08 + detailRandom() * 0.22,
                w, d, h, detailRandom() * Math.PI * 2, detailPickColor("birch"),
              );
            }
          }
        }
      }
    }
  };

  westGroveCandidates.sort((a, b) => {
    if (a.type !== b.type) return a.type === "oak" ? -1 : 1;
    return Math.hypot(a.s + 115, a.y + 40) - Math.hypot(b.s + 115, b.y + 40);
  });
  const detailedTrees = westGroveCandidates.slice(0, 16);
  const removedCrowns = { oakCrowns: new Set(), birchCrowns: new Set() };
  for (const tree of detailedTrees) {
    for (let i = tree.crownStart; i < tree.crownEnd; i++) {
      removedCrowns[tree.crownBatch].add(i);
    }
    if (tree.type === "oak") buildDetailedOak(tree);
    else buildDetailedBirch(tree);
  }
  for (const batchName of ["oakCrowns", "birchCrowns"]) {
    const removed = removedCrowns[batchName];
    if (removed.size) {
      batches[batchName].instances = batches[batchName].instances.filter((_, idx) => !removed.has(idx));
    }
  }

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (const batch of Object.values(batches)) {
    if (!batch.instances.length) continue;
    const mesh = new THREE.InstancedMesh(batch.geo, batch.mat, batch.instances.length);
    mesh.name = batch.name;
    batch.instances.forEach((instance, index) => {
      if (instance.tilt !== undefined) {
        setBranchFrameMatrix(matrix, instance.s, instance.y, instance.base, instance.azimuth, instance.tilt);
        matrix.scale(scale.set(instance.diameter, instance.diameter, instance.length));
      } else {
        setSurfaceMatrix(matrix, reservoirS(instance.s) / RADIUS, reservoirY(instance.y),
          instance.base, 1, 1, instance.height);
        matrix.multiply(rotation.makeRotationZ(instance.yaw));
        matrix.scale(scale.set(instance.width, instance.depth, 1));
      }
      mesh.setMatrixAt(index, matrix);
      if (instance.color !== null) mesh.setColorAt(index, color.setHex(instance.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
  }
  return { obstacles };
}
