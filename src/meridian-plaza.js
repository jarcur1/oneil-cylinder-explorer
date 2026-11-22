import * as THREE from "three";
import { RADIUS } from "./habitat.js";

// All court finishes share one height and meet edge-to-edge. The small offset
// clears the adjoining street paving without creating a collision step.
const COURT_HEIGHT = 0.075;
const CENTER_Y = -5;
const ELLIPSE_X = 20;
const ELLIPSE_Y = 13.6;

export function addMeridianPlaza(parent) {
  const finishes = [
    new THREE.MeshStandardMaterial({ color: 0xd6c8ac, roughness: 0.91 }),
    new THREE.MeshStandardMaterial({ color: 0xc4b598, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x254b4d, roughness: 0.87 }),
    new THREE.MeshStandardMaterial({ color: 0xe3d4b5, roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: 0xc69043, roughness: 0.67, metalness: 0.28 }),
  ];
  const vertices = finishes.map(() => []);
  const normals = finishes.map(() => []);
  const indices = finishes.map(() => []);
  const vertexIds = finishes.map(() => new Map());

  function vertex(material, s, y) {
    // Weld shared polar-band edges despite interpolation roundoff.
    const key = `${Math.round(s * 1e5)},${Math.round(y * 1e5)}`;
    const existing = vertexIds[material].get(key);
    if (existing !== undefined) {
      indices[material].push(existing);
      return;
    }
    const index = vertices[material].length / 3;
    vertexIds[material].set(key, index);
    indices[material].push(index);
    const theta = s / RADIUS;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    vertices[material].push((RADIUS - COURT_HEIGHT) * sin, y, -(RADIUS - COURT_HEIGHT) * cos);
    normals[material].push(-sin, 0, cos);
  }

  // Tessellating radially as well as around the ellipse keeps each chord close
  // to the cylindrical surface, including the long central compass points.
  function band(material, a, b, innerA, innerB, outerA, outerB, steps) {
    const point = (angle, radius) => [
      Math.cos(angle) * ELLIPSE_X * radius,
      CENTER_Y + Math.sin(angle) * ELLIPSE_Y * radius,
    ];
    for (let j = 0; j < steps; j++) {
      const t0 = j / steps;
      const t1 = (j + 1) / steps;
      const p0 = point(a, innerA + (outerA - innerA) * t0);
      const p1 = point(a, innerA + (outerA - innerA) * t1);
      const p2 = point(b, innerB + (outerB - innerB) * t1);
      const p3 = point(b, innerB + (outerB - innerB) * t0);
      for (const p of [p0, p1, p2]) vertex(material, p[0], p[1]);
      if (j !== 0 || innerA !== 0 || innerB !== 0) {
        for (const p of [p0, p2, p3]) vertex(material, p[0], p[1]);
      }
    }
  }

  // Include the rectangle's corner bearings so the outer paving follows the
  // original 44 x 30 footprint exactly rather than clipping its corners.
  const angles = Array.from({ length: 128 }, (_, i) => i * Math.PI * 2 / 128);
  const corner = Math.atan2(15 / ELLIPSE_Y, 22 / ELLIPSE_X);
  angles.push(corner, Math.PI - corner, Math.PI + corner, 2 * Math.PI - corner, 2 * Math.PI);
  angles.sort((a, b) => a - b);
  const boundary = (angle) => Math.min(
    22 / Math.abs(ELLIPSE_X * Math.cos(angle)),
    15 / Math.abs(ELLIPSE_Y * Math.sin(angle)),
  );
  const pointRadius = (angle) => {
    // Eight long points alternate with eight short re-entrant points.
    const phase = (angle * 8 / Math.PI) % 2;
    return 0.25 + 0.36 * Math.abs(phase - 1);
  };

  for (let i = 0; i < angles.length - 1; i++) {
    const a = angles[i];
    const b = angles[i + 1];
    const middle = (a + b) / 2;
    const tipA = pointRadius(a);
    const tipB = pointRadius(b);
    const bearing = Math.floor(middle * 8 / Math.PI);
    // Alternating stone and brass facets give the inlaid compass its bearings.
    band(bearing % 2 ? 3 : 4, a, b, 0, 0, tipA, tipB, 3);
    band(2, a, b, tipA, tipB, 0.72, 0.72, 3);
    // Individually coloured voussoirs around the petrol rosette.
    band(Math.floor(middle * 16 / Math.PI) % 2, a, b, 0.72, 0.72, 0.84, 0.84, 1);
    // The continuous brass ellipse covers the historical ray samples at ±18.
    band(4, a, b, 0.84, 0.84, 1, 1, 1);
    band(Math.floor(middle * 16 / Math.PI) % 2, a, b, 1, 1, boundary(a), boundary(b), 3);
  }

  // The named brass mesh includes the uninterrupted ring and compass facets.
  for (let i = 0; i < finishes.length; i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices[i], 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals[i], 3));
    geometry.setIndex(indices[i]);
    const mesh = new THREE.Mesh(geometry, finishes[i]);
    if (i === 4) mesh.name = "meridian_plaza_ring";
    parent.add(mesh);
  }
}
