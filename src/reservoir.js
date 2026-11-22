import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { addOrientedPanel, addSurfaceBox, addSurfacePatch, addSurfaceSign, surfacePos } from "./surface.js";
import { addCivicSolid } from "./civic-primitives.js";
import { RESERVOIR_LAYOUT, reservoirS, reservoirY } from "./reservoir-layout.js";
import { createWoodland } from "./woodland.js";
import { createReservoirPavilion } from "./reservoir-pavilion.js";
import { STILLWATER_TRAM_STOPS } from "./tram-layout.js";

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
  // Join the Line 02 ground pad to the existing northbound entrance path.
  const tramPad = STILLWATER_TRAM_STOPS[1];
  const entranceS = reservoirS(0);
  const padS = tramPad.theta * RADIUS;
  addSurfacePatch(root, path, (padS + entranceS) / 2, tramPad.y,
    entranceS - padS, 3, 0.026).name = "stillwater_tram_entrance_connector";
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
  // The lookout board faces the open north approach and stands on the platform,
  // behind the walking area at the existing south rail.
  const guideCanvas = document.createElement("canvas");
  guideCanvas.width = 1536;
  guideCanvas.height = 512;
  const guide = guideCanvas.getContext("2d");
  guide.fillStyle = "#173d3d";
  guide.fillRect(0, 0, 1536, 512);
  guide.strokeStyle = "#c7a66a";
  guide.lineWidth = 10;
  guide.strokeRect(18, 18, 1500, 476);
  guide.fillStyle = "#d6b77b";
  guide.font = "600 38px system-ui";
  guide.fillText("STILLWATER  /  MERIDIAN LOOKOUT", 65, 82);
  guide.fillStyle = "#f4ebd6";
  guide.font = "700 82px system-ui";
  guide.fillText("CIVIC TOWER  &  GATE", 65, 190);
  guide.font = "46px system-ui";
  guide.fillText("Look for the twin brass towers", 65, 290);
  guide.fillText("and the ring in the plaza below.", 65, 360);
  guide.fillStyle = "#d6b77b";
  guide.font = "600 40px system-ui";
  guide.fillText("TURN NORTH, THEN LOOK HIGH TO YOUR LEFT", 65, 447);
  const guideTexture = new THREE.CanvasTexture(guideCanvas);
  guideTexture.colorSpace = THREE.SRGBColorSpace;
  guideTexture.anisotropy = 4;
  const guideS = reservoirS(-100);
  const guideY = reservoirY(-93.4);
  const guideBoard = new THREE.Group();
  guideBoard.name = "meridian_lookout_guide";
  root.add(guideBoard);
  addSurfaceBox(guideBoard, metal, guideS, guideY, 6.2, 0.16, 2.1, 1.6);
  for (const s of [-102.5, -97.5]) {
    addSurfaceBox(guideBoard, metal, reservoirS(s), guideY, 0.16, 0.16, 1.1, 0.6);
  }
  addOrientedPanel(guideBoard, new THREE.MeshBasicMaterial({ map: guideTexture }),
    surfacePos(guideS / RADIUS, guideY + 0.09, 2.65), "north", 6, 2);

  // Mark the open entrance-path sightline, rather than asking players to
  // look through the guideway from directly beneath the boarding platform.
  for (const s of [4, 6.2]) box(metal, s, -101, 0.12, 0.12, 1.4);
  addSurfaceSign(root, "MERIDIAN VIEW\nLOOK HIGH ABOVE AND LEFT", reservoirS(5.1), reservoirY(-101), 2.8, 1.35)
    .name = "meridian_arrival_wayfinding";

  obstacles.push(...createWoodland(root).obstacles, ...createReservoirPavilion(root).obstacles);
  const light = new THREE.SpotLight(0xffffff, 117000, 620, 0.69, 0.25);
  light.name = "stillwater_sunline_light";
  light.position.set(0, 450, 30);
  light.target.position.set(0, 450, 360);
  light.castShadow = false;
  root.add(light, light.target);
  return { obstacles };
}
