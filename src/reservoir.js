import * as THREE from "three";
import { addSurfaceBox, addSurfacePatch, addSurfaceSign } from "./surface.js";
import { addCivicSolid } from "./civic-primitives.js";
import { RESERVOIR_LAYOUT, reservoirS, reservoirY } from "./reservoir-layout.js";
import { createWoodland } from "./woodland.js";
import { createReservoirPavilion } from "./reservoir-pavilion.js";

export function createReservoir(parent) {
  const root = new THREE.Group();
  root.name = "stillwater_reserve";
  parent.add(root);
  const obstacles = [];
  const path = new THREE.MeshStandardMaterial({ color: 0xb3aa8c, roughness: 0.95 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8f998c, roughness: 0.9 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x77583b, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x435b50, roughness: 0.7 });
  const reeds = new THREE.MeshStandardMaterial({ color: 0x78864d, roughness: 1 });
  const bed = new THREE.MeshStandardMaterial({ color: 0x6c8373, roughness: 1 });
  const water = new THREE.MeshStandardMaterial({ color: 0x5bafa9, transparent: true, opacity: 0.55, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide });
  const patch = (material, s, y, width, depth, height) =>
    addSurfacePatch(root, material, reservoirS(s), reservoirY(y), width, depth, height);
  const solid = (material, s, y, width, depth, height, base = 0) =>
    addCivicSolid(root, material, obstacles, reservoirS(s), reservoirY(y), width, depth, height, base);
  const box = (material, s, y, width, depth, height, base = 0) =>
    addSurfaceBox(root, material, reservoirS(s), reservoirY(y), width, depth, height, base);

  for (const p of RESERVOIR_LAYOUT.paths) patch(path, p.s, p.y, p.width, p.depth, 0.025);
  const basin = RESERVOIR_LAYOUT.basin;
  patch(bed, basin.s, basin.y, basin.width, basin.depth, 0.03).name = "reservoir_bed";
  const surface = patch(water, basin.s, basin.y, basin.width, basin.depth, basin.water);
  surface.name = "reservoir_shallow_water";
  surface.castShadow = false;

  // Four solid bank strips surround the basin; water remains over the deck,
  // not a collision surface. The south stair climbs from the shore path.
  solid(stone, 15, -55, 102, 6, 0.6);
  solid(stone, 15, 55, 102, 6, 0.6);
  solid(stone, -33, 0, 6, 104, 0.6);
  solid(stone, 63, 0, 6, 104, 0.6);
  for (let i = 0; i < 3; i++) {
    solid(stone, 15, -60.5 + i, 6, 1, (i + 1) * 0.2);
    solid(stone, 15, -51.5 + i, 6, 1, 0.6 - i * 0.2);
  }

  const lookout = RESERVOIR_LAYOUT.lookout;
  solid(timber, lookout.s, lookout.y, lookout.width, lookout.depth, lookout.top);
  // North approach descends away from the platform in three shallow treads.
  for (let i = 0; i < 3; i++) {
    solid(timber, -100, -81.5 + i, 6, 1, 0.6 - i * 0.2);
  }
  // Rails leave the north side open for the approach.
  for (const s of [-107.7, -92.3]) {
    solid(metal, s, -88, 0.25, 12, 0.16, 1.55);
    for (const y of [-93.5, -88, -82.5]) solid(metal, s, y, 0.22, 0.22, 1.1, 0.6);
  }
  solid(metal, -100, -93.7, 15.4, 0.25, 0.16, 1.55);
  for (const s of [-105, -100, -95]) solid(metal, s, -93.7, 0.22, 0.22, 1.1, 0.6);

  for (const [s, y] of [[-48, -74], [42, -74], [-96, 40], [96, 65]]) {
    box(timber, s, y, 3, 0.8, 0.18, 0.48);
    box(timber, s - 1.1, y, 0.18, 0.65, 0.48);
    box(timber, s + 1.1, y, 0.18, 0.65, 0.48);
  }
  for (const [s, y] of [[-25, -51], [-10, -51], [40, -51], [55, -51], [-25, 51], [0, 51], [40, 51], [55, 51]]) {
    for (let i = 0; i < 3; i++) box(reeds, s + i * 0.32, y + (i % 2) * 0.3, 0.08, 0.08, 0.9 + i * 0.18, 0.02);
  }
  addSurfaceSign(root, "STILLWATER RESERVE\nShallow balancing basin: 0.4 m", reservoirS(7), reservoirY(-106), 5, 1.7);
  addSurfaceSign(root, "SHALLOW WATER\n0.4 m over the walking deck", reservoirS(23), reservoirY(-62), 4, 1.5);
  addSurfaceSign(root, "MERIDIAN LOOKOUT\nAcross the cylinder", reservoirS(-104), reservoirY(-83), 3, 1.7);

  obstacles.push(...createWoodland(root).obstacles, ...createReservoirPavilion(root).obstacles);
  const light = new THREE.SpotLight(0xffffff, 117000, 620, 0.69, 0.25);
  light.name = "stillwater_sunline_light";
  light.position.set(0, 450, 30);
  light.target.position.set(0, 450, 360);
  light.castShadow = false;
  root.add(light, light.target);
  return { obstacles };
}
