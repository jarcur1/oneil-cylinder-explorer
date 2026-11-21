import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { setSurfaceMatrix } from "./surface.js";
import { RESERVOIR_LAYOUT, reservoirS, reservoirY } from "./reservoir-layout.js";
import { inStillwaterTramCorridor } from "./tram-layout.js";

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

function insideRect(s, y, rect, margin) {
  return Math.abs(s - rect.s) < rect.width / 2 + margin &&
    Math.abs(y - rect.y) < rect.depth / 2 + margin;
}

function clearOfPublicSpace(s, y, margin) {
  const { bounds, basin, bank, pavilion, lookout, paths } = RESERVOIR_LAYOUT;
  if (s < bounds.minS + margin || s > bounds.maxS - margin ||
      y < bounds.minY + margin || y > bounds.maxY - margin) return false;
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
  const obstacles = [];
  const trees = [];
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
    for (let stem = 0; stem < stemCount; stem++) {
      const angle = yaw + stem * Math.PI * 2 / stemCount;
      const offset = stemCount === 1 ? 0 : diameter * 0.7;
      const stemS = s + Math.cos(angle) * offset;
      const stemY = y + Math.sin(angle) * offset;
      const stemDiameter = stemCount === 1 ? diameter : diameter * 0.65;
      const stemHeight = trunkHeight * (stem === 0 ? 1 : 0.75 + random() * 0.23);
      add(trunkBatch, stemS, stemY, 0, stemDiameter, stemDiameter, stemHeight, angle);
      obstacles.push({ name: `woodland_${type}_trunk`, theta: reservoirS(stemS) / RADIUS,
        y: reservoirY(stemY), width: stemDiameter, depth: stemDiameter, base: 0, height: stemHeight });
    }

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

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (const batch of Object.values(batches)) {
    if (!batch.instances.length) continue;
    const mesh = new THREE.InstancedMesh(batch.geo, batch.mat, batch.instances.length);
    mesh.name = batch.name;
    batch.instances.forEach((instance, index) => {
      setSurfaceMatrix(matrix, reservoirS(instance.s) / RADIUS, reservoirY(instance.y),
        instance.base, 1, 1, instance.height);
      matrix.multiply(rotation.makeRotationZ(instance.yaw));
      matrix.scale(scale.set(instance.width, instance.depth, 1));
      mesh.setMatrixAt(index, matrix);
      if (instance.color !== null) mesh.setColorAt(index, color.setHex(instance.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
  }
  return { obstacles };
}
