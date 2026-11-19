import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { addCivicSolid } from "./civic-primitives.js";
import { addSurfaceBox, addOrientedPanel, surfacePos } from "./surface.js";
import { RESERVOIR_LAYOUT, reservoirS, reservoirY } from "./reservoir-layout.js";

// Coordinates in this module are local to the reserve; the parent is untransformed.
export function createReservoirPavilion(parent) {
  const group = new THREE.Group();
  group.name = "stillwaterPavilion";
  parent.add(group);
  const obstacles = [];
  const { s, y, width, depth, floor, ceiling } = RESERVOIR_LAYOUT.pavilion;
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: 0xa69e88, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xb7a88e, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x76543b, roughness: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x4d6255, roughness: 0.82 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x91bec0, transparent: true, opacity: 0.4, roughness: 0.24, metalness: 0.05, side: THREE.DoubleSide }),
    tank: new THREE.MeshStandardMaterial({ color: 0x78908a, roughness: 0.65, metalness: 0.25 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x526f70, roughness: 0.55, metalness: 0.35 }),
  };
  function solid(name, material, x, z, w, d, h, base = 0) {
    const mesh = addCivicSolid(group, material, obstacles, reservoirS(x), reservoirY(z), w, d, h, base);
    mesh.name = name;
    obstacles[obstacles.length - 1].name = name;
    return mesh;
  }
  function box(name, material, x, z, w, d, h, base) {
    const mesh = addSurfaceBox(group, material, reservoirS(x), reservoirY(z), w, d, h, base);
    mesh.name = name;
    obstacles.push({ name, theta: reservoirS(x) / RADIUS, y: reservoirY(z), width: w, depth: d, height: h, base });
    return mesh;
  }

  solid("pavilionFloor", materials.floor, s, y, width, depth, floor);
  solid("pavilionRoof", materials.roof, s, y, width + 0.8, depth + 0.8, 0.35, ceiling);
  // The six-metre south opening leads directly into the unobstructed central aisle.
  for (const side of [-1, 1]) {
    solid(`pavilionSouthWall${side}`, materials.stone, s + side * 7.5, y - 8.8, 8.2, 0.4, 3.4, floor);
    solid(`pavilionSouthPillar${side}`, materials.wood, s + side * 3.2, y - 8.8, 0.4, 0.4, ceiling - floor, floor);
    solid(`pavilionCorner${side}`, materials.wood, s + side * 11.8, y - 8.8, 0.4, 0.4, ceiling - floor, floor);
  }
  solid("pavilionSouthBeam", materials.wood, s, y - 8.8, width, 0.4, 0.45, 5.35);
  solid("pavilionDoorLintel", materials.wood, s, y - 8.8, 6, 0.4, 1.2, 4.15);
  // Continuous low walls and high beams frame actual glazed openings.
  for (const side of [-1, 1]) {
    const x = s + side * 11.8;
    solid(`pavilionSideSill${side}`, materials.stone, x, y, 0.4, 17.2, 1.15, floor);
    solid(`pavilionSideHeader${side}`, materials.wood, x, y, 0.4, 17.2, 1.25, 4.55);
    for (const offset of [-8.4, 0, 8.4]) {
      solid(`pavilionSidePost${side}_${offset}`, materials.wood, x, y + offset, 0.4, 0.4, 3.35, 1.2);
    }
    for (const offset of [-4.2, 4.2]) {
      solid(`pavilionSideWindow${side}_${offset}`, materials.glass, x, y + offset, 0.12, 8, 3.35, 1.2);
    }
  }
  solid("pavilionNorthSill", materials.stone, s, y + 8.8, 23.2, 0.4, 1.15, floor);
  solid("pavilionNorthHeader", materials.wood, s, y + 8.8, 23.2, 0.4, 1.25, 4.55);
  for (const offset of [-11.4, 0, 11.4]) {
    solid(`pavilionNorthPost${offset}`, materials.wood, s + offset, y + 8.8, 0.4, 0.4, 3.35, 1.2);
  }
  for (const offset of [-5.7, 5.7]) {
    solid(`pavilionNorthWindow${offset}`, materials.glass, s + offset, y + 8.8, 11, 0.12, 3.35, 1.2);
  }

  // Static interpretive equipment is confined to the two sides of the room.
  for (const [index, x, z] of [[1, s - 8, y + 2], [2, s - 8, y - 2], [3, s + 8, y + 2]]) {
    box(`pavilionTank${index}`, materials.tank, x, z, 2.4, 2.4, 2.5, floor);
    box(`pavilionTankCap${index}`, materials.wood, x, z, 2.5, 2.5, 0.16, 2.55);
  }
  box("pavilionFilterManifold", materials.pipe, s - 8, y, 0.35, 6.8, 0.35, 2.8);
  box("pavilionStoragePipe", materials.pipe, s + 8, y + 5, 0.35, 4, 0.35, 2.8);

  function panel(name, title, subtitle, lines, x, z, h, facing, w, height) {
    const canvas = document.createElement("canvas");
    canvas.width = 1536;
    canvas.height = 768;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#244740";
    ctx.fillRect(0, 0, 1536, 768);
    ctx.strokeStyle = "#d7c5a0";
    ctx.lineWidth = 7;
    ctx.strokeRect(24, 24, 1488, 720);
    ctx.fillStyle = "#fff1d5";
    ctx.font = "600 66px system-ui";
    ctx.fillText(title, 70, 125, 1390);
    ctx.fillStyle = "#d4c59e";
    ctx.font = "38px system-ui";
    ctx.fillText(subtitle, 70, 195, 1390);
    ctx.fillStyle = "#fff3df";
    ctx.font = "46px system-ui";
    lines.forEach((line, i) => ctx.fillText(line, 70, 310 + i * 88, 1390));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = addOrientedPanel(group, new THREE.MeshBasicMaterial({ map: texture }),
      surfacePos(reservoirS(x) / RADIUS, reservoirY(z), h), facing, w, height);
    mesh.name = name;
  }
  // Framed panels face into the aisle, leaving the glazing visible above them.
  for (const side of [-1, 1]) {
    solid(`pavilionExhibitFrame${side}`, materials.wood, s + side * 10.8, y - 5.8, 0.22, 4.8, 2.6, 0.7);
  }
  panel("pavilionFilterExhibit", "FILTER AND REUSE", "STILLWATER · WATER MANAGEMENT",
    ["Collected water can be filtered and treated", "before returning to shared storage.", "These tanks and pipes illustrate the route;", "they are not an operating control panel."],
    s - 10.68, y - 5.8, 2, "east", 4.6, 2.4);
  panel("pavilionStorageExhibit", "A SHALLOW BALANCING BASIN", "STILLWATER · PUBLIC RESERVE",
    ["The basin holds a shallow 0.4 m of water.", "Storage helps balance water across the habitat.", "Gravity weakens toward the cylinder axis;", "the axial Sunline illuminates the interior."],
    s + 10.68, y - 5.8, 2, "west", 4.6, 2.4);
  panel("pavilionEntranceSign", "STILLWATER PAVILION", "PUBLIC WATER-SYSTEM EXHIBIT",
    ["Enter through the open south doorway.", "Explore the reserve's water and storage story."],
    s + 7.3, y - 9.01, 2, "south", 5.2, 2.6);

  return { obstacles };
}
