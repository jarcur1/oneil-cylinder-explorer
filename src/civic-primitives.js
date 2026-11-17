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

// One static 512px facade replaces hundreds of separate window meshes.
// Cell hashes, not random state, keep rooms identical across loads and saves.
export function createFacadeMaterial(
  wallColor,
  windowColor,
  columns,
  rows,
  style = "residential",
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 512, 512);
  const cellW = 512 / columns,
    cellH = 512 / rows;
  const residential = style === "residential";
  const tower = style === "tower";
  const workshop = style === "workshop";
  const library = style === "library";
  const broadGlazing = tower || workshop || style === "transit";
  for (let row = 0; row < rows; row++) {
    const y = row * cellH;
    // Floor slabs, a lit stone arris, and staggered masonry joints.
    ctx.fillStyle = "rgba(20,31,33,.23)";
    ctx.fillRect(0, y + cellH * 0.94, 512, cellH * 0.06);
    ctx.fillStyle = "rgba(255,247,225,.28)";
    ctx.fillRect(0, y + cellH * 0.04, 512, 1);
    for (let col = 0; col < columns; col++) {
      const x = col * cellW;
      const hash = ((row + 1) * 73 + (col + 1) * 137 + row * col * 19) % 101;
      ctx.fillStyle = "rgba(32,39,37,.12)";
      ctx.fillRect(x + (row % 2) * cellW * 0.5, y, 1, cellH * 0.94);
      ctx.fillRect(x, y + cellH * 0.49, cellW * 0.12, 1);
      const wx = x + cellW * (broadGlazing ? 0.12 : 0.19);
      const wy = y + cellH * (library ? 0.13 : 0.17);
      const ww = cellW * (broadGlazing ? 0.76 : 0.62);
      const wh = cellH * (library ? 0.67 : 0.59);
      // Pale outer reveal, dark inset, then glazing: depth without extra geometry.
      ctx.fillStyle = tower ? "#657c80" : "rgba(255,243,216,.55)";
      ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 5);
      ctx.fillStyle = "#192e32";
      ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
      const occupied = hash < (residential ? 23 : library ? 15 : 9);
      const glass = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      glass.addColorStop(0, occupied ? "#c0a57a" : windowColor);
      glass.addColorStop(1, occupied ? "#75604a" : "#182f36");
      ctx.fillStyle = glass;
      ctx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
      // Static room dressing; no emissive maps or animated texture updates.
      if (residential && hash % 3 === 0) {
        const blindHeight = wh * (0.24 + (hash % 5) * 0.1);
        ctx.fillStyle = hash % 2 ? "#a9aa9a" : "#bcae91";
        ctx.fillRect(wx + 1, wy + 1, ww - 2, blindHeight);
        ctx.fillStyle = "rgba(35,45,44,.28)";
        for (let slat = 3; slat < blindHeight; slat += 3) {
          ctx.fillRect(wx + 1, wy + slat, ww - 2, 1);
        }
      } else if (residential && hash % 3 === 1) {
        const curtainWidth = ww * (0.14 + (hash % 4) * 0.035);
        ctx.fillStyle = hash % 2 ? "#b8ad99" : "#849995";
        ctx.fillRect(wx + 1, wy + 1, curtainWidth, wh - 2);
        ctx.fillRect(wx + ww - curtainWidth - 1, wy + 1, curtainWidth, wh - 2);
        ctx.fillStyle = "rgba(255,247,223,.21)";
        ctx.fillRect(wx + 2, wy + 1, 1, wh - 2);
      } else if (library) {
        ctx.fillStyle = "rgba(17,34,36,.66)";
        ctx.fillRect(wx + 2, wy + wh * 0.65, ww - 4, 2);
        for (let book = 0; book < 5; book++) {
          ctx.fillStyle = ["#9d8e68", "#6a8986", "#a1765a"][(book + hash) % 3];
          ctx.fillRect(wx + 3 + book * (ww - 6) / 5, wy + wh * 0.46, 2, wh * 0.18);
        }
      }
      // Reflection is restrained so dark recesses and occupied rooms stay legible.
      ctx.fillStyle = "rgba(202,231,232,.19)";
      ctx.fillRect(wx + 2, wy + 2, ww - 4, Math.max(1, wh * 0.09));
      ctx.fillStyle = "rgba(12,29,33,.8)";
      ctx.fillRect(wx + ww * 0.49, wy, Math.max(1, ww * 0.045), wh);
      if (workshop || style === "transit") {
        ctx.fillRect(wx, wy + wh * 0.46, ww, Math.max(1, wh * 0.045));
      }
      // Deep head shadow and a projecting sill drawn into the shared atlas.
      ctx.fillStyle = "rgba(6,19,23,.48)";
      ctx.fillRect(wx, wy, ww, Math.max(2, wh * 0.08));
      ctx.fillStyle = "rgba(239,227,200,.68)";
      ctx.fillRect(wx - 2, wy + wh + 1, ww + 4, tower ? 1 : 2);
      ctx.fillStyle = "rgba(27,34,33,.22)";
      ctx.fillRect(wx - 2, wy + wh + 3, ww + 4, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: tower ? 0.54 : workshop ? 0.82 : 0.72,
    metalness: tower ? 0.24 : 0.12,
  });
}
