import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { addSurfaceBox, addSurfacePatch, addOrientedPanel, surfacePos } from "./surface.js";
import { reservoirS, reservoirY } from "./reservoir-layout.js";

// A small, static working place: all coordinates are local to Stillwater.
export function createStillwaterCare(parent) {
  const group = new THREE.Group();
  group.name = "stillwater_grounds_bay";
  parent.add(group);

  const wood = new THREE.MeshStandardMaterial({ color: 0x76543b, roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x503d2e, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x526f70, roughness: 0.55, metalness: 0.35 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8aa74, roughness: 0.5, metalness: 0.45 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x49392d, roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x668357, roughness: 0.9 });
  const tray = new THREE.MeshStandardMaterial({ color: 0x344d43, roughness: 0.86 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x2b5d56, roughness: 0.8 });
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xb3aa8c, roughness: 0.95 });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xa45d41, roughness: 0.88 });
  const obstacles = [];

  function box(name, material, s, y, width, depth, height, base) {
    const mesh = addSurfaceBox(group, material, reservoirS(s), reservoirY(y), width, depth, height, base);
    mesh.name = name;
    return mesh;
  }

  function solid(name, material, s, y, width, depth, height, base = 0) {
    const mesh = box(name, material, s, y, width, depth, height, base);
    obstacles.push({ name, theta: reservoirS(s) / RADIUS, y: reservoirY(y), width, depth, height, base });
    return mesh;
  }

  // The north edge stops short of the worker's standing position at y=-102.
  box("groundsStorageBench", wood, -83, -104, 3.6, 1.2, 0.82, 0);
  box("groundsBenchTop", darkWood, -83, -104, 3.7, 1.25, 0.08, 0.82);
  box("groundsBenchFrontRail", brass, -83, -103.37, 3.35, 0.04, 0.045, 0.7);
  for (const s of [-84.15, -83, -81.85]) {
    box("groundsStorageDoor", darkWood, s, -103.39, 1.04, 0.025, 0.48, 0.13);
    box("groundsStorageHandle", brass, s, -103.37, 0.25, 0.035, 0.035, 0.46);
  }
  obstacles.push({
    name: "groundsStorageBench",
    theta: reservoirS(-83) / RADIUS,
    y: reservoirY(-104),
    width: 3.7,
    depth: 1.25,
    height: 0.9,
    base: 0,
  });

  // Two seedling flats sit on the worktop, with visible soil and young leaves.
  for (const [index, s] of [-84.1, -83.35].entries()) {
    box(`groundsSeedlingFlat${index}`, tray, s, -104.02, 0.62, 0.68, 0.09, 0.9);
    box(`groundsSeedlingSoil${index}`, soil, s, -104.02, 0.55, 0.61, 0.025, 0.99);
    for (const dx of [-0.16, 0.16]) {
      for (const dy of [-0.18, 0.18]) {
        box(`groundsSeedling${index}`, leaf, s + dx, -104.02 + dy, 0.11, 0.1, 0.14, 1.015);
      }
    }
  }

  // Hand tools and spare irrigation fittings are kept on the bench itself.
  box("groundsTrowelHandle", wood, -82.6, -104.13, 0.09, 0.4, 0.07, 0.9);
  box("groundsTrowelBlade", metal, -82.6, -103.82, 0.19, 0.23, 0.035, 0.91);
  box("groundsForkHandle", wood, -82.25, -104.13, 0.08, 0.4, 0.07, 0.9);
  box("groundsForkHead", metal, -82.25, -103.88, 0.22, 0.08, 0.04, 0.91);
  for (const dx of [-0.08, 0, 0.08]) {
    box("groundsForkTine", metal, -82.25 + dx, -103.79, 0.025, 0.16, 0.035, 0.91);
  }
  box("groundsIrrigationPipe", metal, -81.92, -104.03, 0.08, 0.65, 0.08, 0.9);
  box("groundsIrrigationCoupling", brass, -81.92, -103.9, 0.14, 0.12, 0.13, 0.9);
  box("groundsIrrigationValve", brass, -81.92, -104.2, 0.25, 0.07, 0.04, 1.03);

  // The marker faces north toward the person returning tools.
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#244740";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#d7c5a0";
  ctx.lineWidth = 12;
  ctx.strokeRect(22, 22, 980, 468);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff1d5";
  ctx.font = "600 82px system-ui";
  ctx.fillText("STILLWATER GROUNDS", 512, 202, 920);
  ctx.fillStyle = "#d4c59e";
  ctx.font = "54px system-ui";
  ctx.fillText("TOOL RETURN", 512, 310);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sign = addOrientedPanel(group, new THREE.MeshBasicMaterial({ map: texture }),
    surfacePos(reservoirS(-83) / RADIUS, reservoirY(-103.35), 0.39), "north", 1.65, 0.45);
  sign.name = "groundsToolReturnMarker";

  // Shallow paving pad and east spur join the existing pavilion approach seam at s=-75.
  addSurfacePatch(group, pathMat, reservoirS(-83), reservoirY(-103), 6.0, 6.0, 0.025)
    .name = "groundsShelterPad";
  addSurfacePatch(group, pathMat, reservoirS(-77.5), reservoirY(-101.5), 5.0, 3.0, 0.025)
    .name = "groundsShelterSpur";

  // Open-north wood/teal rain canopy hugging the bench with clear headroom above the actor.
  for (const [si, s] of [-85.9, -80.1].entries()) {
    for (const [yi, y] of [-105.75, -102.35].entries()) {
      box(`groundsShelterPostPlinth${si}${yi}`, darkWood, s, y, 0.24, 0.24, 0.12, 0);
      solid(`groundsShelterPost${si}${yi}`, wood, s, y, 0.18, 0.18, 2.52, 0);
    }
    solid(`groundsShelterSideBeam${si}`, wood, s, -104.05, 0.18, 3.58, 0.14, 2.38);
  }
  for (const [yi, y] of [-105.75, -102.35].entries()) {
    solid(`groundsShelterCrossBeam${yi}`, wood, -83, y, 5.98, 0.18, 0.14, 2.38);
  }
  solid("groundsShelterBackWall", wood, -83, -105.75, 5.62, 0.08, 1.1, 0.12);
  box("groundsShelterBackRail", darkWood, -83, -105.75, 5.64, 0.12, 0.06, 1.22);
  box("groundsShelterRoof", teal, -83, -104.1, 6.2, 3.8, 0.14, 2.52);
  box("groundsShelterRoofRidge", teal, -83, -104.1, 6.0, 2.0, 0.1, 2.66);
  box("groundsShelterNorthGutter", metal, -83, -102.2, 6.2, 0.06, 0.08, 2.48);
  obstacles.push({
    name: "groundsShelterRoof",
    theta: reservoirS(-83) / RADIUS,
    y: reservoirY(-104.1),
    width: 6.2,
    depth: 3.8,
    height: 0.24,
    base: 2.52,
  });

  // Rain barrel with downspout (SW corner) and potting crate with clay pots (SE corner).
  box("groundsShelterDownspout", metal, -85.72, -105.45, 0.07, 0.07, 2.52, 0);
  solid("groundsRainBarrel", teal, -85.35, -105.25, 0.56, 0.56, 0.86, 0);
  box("groundsRainBarrelLid", darkWood, -85.35, -105.25, 0.6, 0.6, 0.05, 0.86);
  box("groundsRainBarrelTap", brass, -85.35, -104.93, 0.08, 0.08, 0.08, 0.35);
  solid("groundsPottingCrate", wood, -80.65, -105.25, 0.64, 0.52, 0.42, 0);
  box("groundsPottingSoil", soil, -80.65, -105.25, 0.56, 0.44, 0.04, 0.42);
  box("groundsClayPotA", terracotta, -80.78, -105.25, 0.18, 0.18, 0.18, 0.46);
  box("groundsClayPotB", terracotta, -80.52, -105.22, 0.16, 0.16, 0.24, 0.46);

  return { obstacles };
}
