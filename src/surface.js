import * as THREE from "three";
import { RADIUS } from "./habitat.js";

// Local axes: X follows the circumference, Y the cylinder axis, Z points inward.
export function surfacePos(theta, y, h = 0) {
  const r = RADIUS - h;
  return new THREE.Vector3(r * Math.sin(theta), y, -r * Math.cos(theta));
}

export function surfaceUp(theta) {
  return new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
}

export function setSurfaceMatrix(matrix, theta, y, base, width, depth, height) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const r = RADIUS - (base + height / 2);
  return matrix.set(
    width * c,
    0,
    -height * s,
    r * s,
    0,
    depth,
    0,
    y,
    width * s,
    0,
    height * c,
    -r * c,
    0,
    0,
    0,
    1,
  );
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matrix = new THREE.Matrix4();

// District coordinates use arc metres s = theta * RADIUS, not world X.
export function addSurfaceBox(
  parent,
  material,
  s,
  y,
  width,
  depth,
  height,
  base = 0,
) {
  const mesh = new THREE.Mesh(unitBox, material);
  setSurfaceMatrix(matrix, s / RADIUS, y, base, width, depth, height);
  mesh.applyMatrix4(matrix);
  parent.add(mesh);
  return mesh;
}

// Broad paving must follow the hull rather than float above its curved edges.
export function addSurfacePatch(
  parent,
  material,
  s,
  y,
  width,
  depth,
  h = 0.04,
) {
  const segments = Math.max(1, Math.ceil(width / 2));
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (s - width / 2 + (width * i) / segments) / RADIUS;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    for (const longitudinal of [y - depth / 2, y + depth / 2]) {
      positions.push((RADIUS - h) * sin, longitudinal, -(RADIUS - h) * cos);
      normals.push(-sin, 0, cos);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

export function addSurfaceSign(parent, text, s, y, width = 5, base = 2.3) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#153d3b";
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = "#d7e5ad";
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 1000, 232);
  const lines = text.split("\n");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f1eddb";
  const maxWidth = 940;
  const minY = 26;
  const maxY = 230;
  let fontSize = lines.length > 1 ? 56 : 72;
  let lineStep = (fontSize * 78) / 56;

  while (true) {
    ctx.font = `600 ${fontSize}px system-ui`;
    lineStep = (fontSize * 78) / 56;
    let fits = true;
    let prevBottom = -Infinity;
    for (let i = 0; i < lines.length; i++) {
      const lineY = 128 + (i - (lines.length - 1) / 2) * lineStep;
      const metrics = ctx.measureText(lines[i]);
      const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.55;
      const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.55;
      const top = lineY - ascent;
      const bottom = lineY + descent;
      if (top < minY || bottom > maxY || top - prevBottom < 4) {
        fits = false;
        break;
      }
      prevBottom = bottom;
    }
    if (fits || fontSize <= 12) break;
    fontSize -= 1;
  }

  ctx.font = `600 ${fontSize}px system-ui`;
  lines.forEach((line, i) =>
    ctx.fillText(
      line,
      512,
      128 + (i - (lines.length - 1) / 2) * lineStep,
      maxWidth,
    ),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    material,
  );
  mesh.position.copy(surfacePos(s / RADIUS, y, base + width / 8));
  mesh.rotation.set(Math.PI / 2, 0, 0);
  mesh.quaternion.premultiply(
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -s / RADIUS,
    ),
  );
  parent.add(mesh);
  return mesh;
}

// Text height follows local cylindrical up; normals face the actual approach.
export function addOrientedPanel(
  parent,
  material,
  position,
  facing,
  width = 3.6,
  height = 0.9,
) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.position.copy(position);
  const theta = Math.atan2(position.x, -position.z);
  const up = surfaceUp(theta);
  const east = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const normal =
    facing === "north"
      ? new THREE.Vector3(0, 1, 0)
      : facing === "south"
        ? new THREE.Vector3(0, -1, 0)
        : facing === "east"
          ? east
          : east.negate();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  mesh.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, normal),
  );
  parent.add(mesh);
  return mesh;
}
