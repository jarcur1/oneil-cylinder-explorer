import * as THREE from "three";
import { RADIUS } from "./habitat.js";

// Curved radial prisms keep tall facades and floors aligned with arc-coordinate
// collision footprints, even forty metres above the hull. Startup geometry only.
export function addCivicBlock(
  parent,
  material,
  s,
  y,
  width,
  depth,
  height,
  base = 0,
) {
  const positions = [],
    uvs = [],
    indices = [];
  const segments = Math.max(1, Math.ceil(width / 3));
  const left = s - width / 2,
    south = y - depth / 2,
    north = y + depth / 2;
  const top = base + height;
  const point = (arc, longitudinal, h) => {
    const angle = arc / RADIUS,
      radius = RADIUS - h;
    return [radius * Math.sin(angle), longitudinal, -radius * Math.cos(angle)];
  };
  function quad(a, b, c, d, tex) {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    uvs.push(...tex);
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  for (let i = 0; i < segments; i++) {
    const u = i / segments,
      v = (i + 1) / segments;
    const a = left + width * u,
      b = left + width * v;
    quad(
      point(a, south, top),
      point(b, south, top),
      point(b, north, top),
      point(a, north, top),
      [u, 0, v, 0, v, 1, u, 1],
    );
    quad(
      point(a, north, base),
      point(b, north, base),
      point(b, south, base),
      point(a, south, base),
      [u, 0, v, 0, v, 1, u, 1],
    );
    quad(
      point(a, south, base),
      point(b, south, base),
      point(b, south, top),
      point(a, south, top),
      [u, 0, v, 0, v, 1, u, 1],
    );
    quad(
      point(b, north, base),
      point(a, north, base),
      point(a, north, top),
      point(b, north, top),
      [v, 0, u, 0, u, 1, v, 1],
    );
  }
  const right = left + width;
  quad(
    point(left, north, base),
    point(left, south, base),
    point(left, south, top),
    point(left, north, top),
    [1, 0, 0, 0, 0, 1, 1, 1],
  );
  quad(
    point(right, south, base),
    point(right, north, base),
    point(right, north, top),
    point(right, south, top),
    [0, 0, 1, 0, 1, 1, 0, 1],
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

export function addCivicSolid(
  parent,
  material,
  obstacles,
  s,
  y,
  width,
  depth,
  height,
  base = 0,
) {
  const mesh = addCivicBlock(
    parent,
    material,
    s,
    y,
    width,
    depth,
    height,
    base,
  );
  obstacles.push({
    theta: s / RADIUS,
    y,
    width,
    depth,
    height,
    base,
  });
  return mesh;
}

// One facade texture replaces hundreds of separate window meshes per building.
export function createFacadeMaterial(wallColor, windowColor, columns, rows) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 512, 512);
  const cellW = 512 / columns,
    cellH = 512 / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = col * cellW,
        y = row * cellH;
      ctx.fillStyle = "rgba(0,0,0,.17)";
      ctx.fillRect(x, y + cellH * 0.89, cellW, cellH * 0.07);
      ctx.fillStyle = (row * 7 + col * 11) % 9 < 2 ? "#c8bda0" : windowColor;
      ctx.fillRect(
        x + cellW * 0.2,
        y + cellH * 0.17,
        cellW * 0.6,
        cellH * 0.58,
      );
      ctx.fillStyle = "rgba(215,237,238,.3)";
      ctx.fillRect(
        x + cellW * 0.2,
        y + cellH * 0.17,
        cellW * 0.6,
        cellH * 0.07,
      );
      ctx.fillStyle = "rgba(22,45,52,.55)";
      ctx.fillRect(
        x + cellW * 0.48,
        y + cellH * 0.17,
        cellW * 0.04,
        cellH * 0.58,
      );
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.72,
    metalness: 0.12,
  });
}
