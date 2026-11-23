import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { addCivicBlock, addCivicSolid, createFacadeMaterial } from "./civic-primitives.js";
import { createLibrary } from "./library.js";
import { LIBRARY_LAYOUT } from "./library-layout.js";
import { addMeridianPlaza } from "./meridian-plaza.js";
import {
  setSurfaceMatrix,
  addSurfaceBox,
  addSurfacePatch,
  addSurfaceSign,
  addOrientedPanel,
  surfacePos,
} from "./surface.js";

// Flush architectural displays are painted once, then lit with the building.
// Shared within each frontage type; these are not doors or playable interiors.
function createStreetDisplayMaterial(style) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#84745a";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#182d32";
  ctx.fillRect(8, 8, 496, 496);
  ctx.strokeStyle = "#a99a76";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 476, 476);
  const exchange = style === "exchange";
  ctx.textAlign = "center";
  ctx.fillStyle = "#e4d7b8";
  ctx.font = "600 30px system-ui";
  ctx.fillText(exchange ? "LOCAL EXCHANGE" : "COMMONS RESIDENCES", 256, 68, 450);
  ctx.font = "18px system-ui";
  ctx.fillStyle = "#9cb7b1";
  ctx.fillText(exchange ? "DISTRICT NOTICE WINDOW" : "RESIDENTIAL ENTRANCE", 256, 105, 450);
  ctx.fillStyle = "#31484a";
  ctx.fillRect(32, 132, 448, 280);
  if (exchange) {
    for (let i = 0; i < 2; i++) {
      const x = 52 + i * 212;
      ctx.fillStyle = i ? "#b2bba7" : "#d1bd95";
      ctx.fillRect(x, 156, 194, 225);
      ctx.fillStyle = "#2a4848";
      ctx.font = "600 23px system-ui";
      ctx.fillText(i ? "GROWERS" : "REPAIR / REUSE", x + 97, 196, 178);
      ctx.font = "17px system-ui";
      ctx.fillText(i ? "LOCAL CO-OP" : "DISTRICT WORKSHOP", x + 97, 226, 178);
      for (let line = 0; line < 5; line++) {
        ctx.fillStyle = "rgba(31,57,56,.35)";
        ctx.fillRect(x + 20, 254 + line * 21, 154 - (line % 2) * 28, 4);
      }
    }
  } else {
    // Etched identity glass and mail-slot graphic, not an opening in the solid.
    ctx.fillStyle = "#9aab9e";
    ctx.fillRect(48, 150, 180, 240);
    ctx.fillStyle = "#647e78";
    for (let fold = 0; fold < 7; fold++) {
      ctx.fillRect(54 + fold * 25, 150, 5, 240);
    }
    for (let slot = 0; slot < 6; slot++) {
      const x = 254 + (slot % 2) * 102;
      const y = 156 + Math.floor(slot / 2) * 78;
      ctx.fillStyle = "#8b8c79";
      ctx.fillRect(x, y, 92, 65);
      ctx.fillStyle = "#253e40";
      ctx.fillRect(x + 10, y + 19, 72, 5);
      ctx.fillStyle = "#dfd3b2";
      ctx.fillRect(x + 34, y + 40, 25, 7);
    }
  }
  ctx.fillStyle = "rgba(207,231,224,.1)";
  ctx.beginPath();
  ctx.moveTo(32, 132);
  ctx.lineTo(178, 132);
  ctx.lineTo(378, 412);
  ctx.lineTo(300, 412);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e4d7b8";
  ctx.font = "16px system-ui";
  ctx.fillText(exchange ? "EXTERIOR DISPLAY · BADGE ACCESS ONLY" : "PRIVATE ACCESS · NO PUBLIC ENTRY", 256, 459, 448);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.64,
    metalness: 0.14,
    // Panels sit exactly on the radial side wall, within the solid footprint.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

/**
 * Creates the streets, civic plaza, mid-rise architecture, landscaping, and wayfinding
 * for Meridian Civic District.
 *
 * @param {THREE.Object3D} parent
 * @returns {{ obstacles: Array<{ theta: number, y: number, width: number, depth: number, height: number, base: number }>, update: (dt: number) => void }}
 */
export function createCityStreets(parent) {
  const districtGroup = new THREE.Group();
  districtGroup.name = "cityStreets";
  parent.add(districtGroup);

  const obstacles = [];

  // ==========================================
  // 1. MATERIAL PALETTE
  // Warm limestone/concrete with teal metal/glass and planted areas
  // ==========================================
  const mats = {
    // Facades with procedural window textures
    libraryFacade: createFacadeMaterial("#ded6c6", "#1c3d44", 8, 8, "library"),
    housingNorthFacade: createFacadeMaterial("#d4c9b8", "#23494e", 8, 10, "residential"),
    transitFacade: createFacadeMaterial("#ece7dd", "#1e525a", 9, 12, "transit"),
    housingSouthFacade: createFacadeMaterial("#cfbeaa", "#2a4c48", 7, 7, "residential"),
    housingEastFacade: createFacadeMaterial("#c8beae", "#284b4f", 7, 8, "residential"),
    lanternFacade: createFacadeMaterial("#234347", "#a3c5c1", 7, 8, "residential"),
    commercialFacade: createFacadeMaterial("#b9a891", "#1f3a3c", 7, 8, "exchange"),
    workshopFacade: createFacadeMaterial("#9c988e", "#2f484e", 6, 5, "workshop"),

    // Architectural Trim & Structure
    limestone: new THREE.MeshStandardMaterial({
      color: 0xdfd8c8,
      roughness: 0.82,
      metalness: 0.04,
    }),
    concretePlinth: new THREE.MeshStandardMaterial({
      color: 0x7a7770,
      roughness: 0.88,
      metalness: 0.05,
    }),
    tealMetal: new THREE.MeshStandardMaterial({
      color: 0x1b4648,
      roughness: 0.38,
      metalness: 0.65,
    }),
    bronzeMetal: new THREE.MeshStandardMaterial({
      color: 0x2b2824,
      roughness: 0.48,
      metalness: 0.58,
    }),
    brassAccent: new THREE.MeshStandardMaterial({
      color: 0xc4a35a,
      roughness: 0.32,
      metalness: 0.82,
    }),
    canopyGlass: new THREE.MeshStandardMaterial({
      color: 0x4aa3ad,
      roughness: 0.18,
      metalness: 0.4,
      transparent: true,
      opacity: 0.72,
    }),

    // Paving
    promenadePaving: new THREE.MeshStandardMaterial({
      color: 0x86847e,
      roughness: 0.84,
      metalness: 0.06,
    }),
    plazaPaving: new THREE.MeshStandardMaterial({
      color: 0xa49f93,
      roughness: 0.82,
      metalness: 0.05,
    }),
    plazaInlay: new THREE.MeshStandardMaterial({
      color: 0x46484a,
      roughness: 0.86,
      metalness: 0.08,
    }),
    streetPaving: new THREE.MeshStandardMaterial({
      color: 0x8f8a81,
      roughness: 0.88,
      metalness: 0.04,
    }),
    transitionPaving: new THREE.MeshStandardMaterial({
      color: 0x7c786e,
      roughness: 0.88,
      metalness: 0.05,
    }),
    curbStone: new THREE.MeshStandardMaterial({
      color: 0x726f68,
      roughness: 0.86,
      metalness: 0.06,
    }),

    // Landscaping & Foliage
    turf: new THREE.MeshStandardMaterial({
      color: 0x365e38,
      roughness: 0.92,
      metalness: 0.0,
    }),
    earthBed: new THREE.MeshStandardMaterial({
      color: 0x3e3328,
      roughness: 0.96,
      metalness: 0.0,
    }),
    treeTrunk: new THREE.MeshStandardMaterial({
      color: 0x544131,
      roughness: 0.88,
      metalness: 0.04,
    }),
    treeCanopy: new THREE.MeshStandardMaterial({
      color: 0x275330,
      roughness: 0.76,
      metalness: 0.0,
    }),
    treeCanopyAccent: new THREE.MeshStandardMaterial({
      color: 0x386c42,
      roughness: 0.78,
      metalness: 0.0,
    }),
    flowerGold: new THREE.MeshStandardMaterial({
      color: 0xc89938,
      roughness: 0.8,
      metalness: 0.0,
    }),

    // Street Furniture & Lamps
    woodCedar: new THREE.MeshStandardMaterial({
      color: 0x7a5232,
      roughness: 0.74,
      metalness: 0.06,
    }),
    lampLuminaire: new THREE.MeshStandardMaterial({
      color: 0xfef5dc,
      emissive: 0xfce4a8,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.1,
    }),
  };

  // Shared unit geometries and reusable matrix
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinderGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateX(
    Math.PI / 2,
  );
  const unitSphereGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const tempMatrix = new THREE.Matrix4();

  // Subgroups
  const pavingGroup = new THREE.Group();
  pavingGroup.name = "cityPaving";
  districtGroup.add(pavingGroup);

  const buildingsGroup = new THREE.Group();
  buildingsGroup.name = "cityBuildings";
  districtGroup.add(buildingsGroup);

  const monumentsGroup = new THREE.Group();
  monumentsGroup.name = "cityMonuments";
  districtGroup.add(monumentsGroup);

  const furnitureGroup = new THREE.Group();
  furnitureGroup.name = "cityFurniture";
  districtGroup.add(furnitureGroup);

  // ==========================================
  // 2. STREETS, PLAZA & PAVING NETWORK
  // Legible blocks with curved radial ground patches
  // ==========================================

  // --- Farm-to-City Transition y[-110, -80] along promenade ---
  addSurfacePatch(pavingGroup, mats.transitionPaving, 0, -102.5, 10, 15, 0.04);
  addSurfacePatch(pavingGroup, mats.promenadePaving, 0, -87.5, 12, 15, 0.045);
  addSurfacePatch(pavingGroup, mats.curbStone, -6.5, -95, 1.2, 30, 0.052);
  addSurfacePatch(pavingGroup, mats.curbStone, 6.5, -95, 1.2, 30, 0.052);
  addSurfacePatch(pavingGroup, mats.turf, -11.0, -95, 7.0, 28, 0.035);
  addSurfacePatch(pavingGroup, mats.turf, 11.0, -95, 7.0, 28, 0.035);
  addSurfacePatch(pavingGroup, mats.flowerGold, -10.0, -95, 2.4, 20, 0.04);
  addSurfacePatch(pavingGroup, mats.flowerGold, 10.0, -95, 2.4, 20, 0.04);

  // Transition Gateway Pylons at y = -81 (outside s[-5, 5])
  addSurfaceBox(
    monumentsGroup,
    mats.concretePlinth,
    -7.5,
    -81,
    1.4,
    1.4,
    4.2,
    0,
  );
  addSurfaceBox(monumentsGroup, mats.tealMetal, -7.5, -81, 1.6, 1.6, 0.4, 4.2);
  obstacles.push({
    theta: -7.5 / RADIUS,
    y: -81,
    width: 1.4,
    depth: 1.4,
    height: 4.2,
    base: 0,
  });

  addSurfaceBox(
    monumentsGroup,
    mats.concretePlinth,
    7.5,
    -81,
    1.4,
    1.4,
    4.2,
    0,
  );
  addSurfaceBox(monumentsGroup, mats.tealMetal, 7.5, -81, 1.6, 1.6, 0.4, 4.2);
  obstacles.push({
    theta: 7.5 / RADIUS,
    y: -81,
    width: 1.4,
    depth: 1.4,
    height: 4.2,
    base: 0,
  });

  addSurfaceSign(
    monumentsGroup,
    "MERIDIAN CIVIC DISTRICT\nPROMENADE ENTRANCE · PLAZA 75m",
    -7.5,
    -82,
    4.6,
    3.0,
  );
  addSurfaceSign(
    monumentsGroup,
    "GREENWAY COMMONS\nFARMS · VILLAGE · MARKET SOUTH",
    7.5,
    -80,
    4.6,
    3.0,
  );

  // --- Promenade South y[-80, -20] ---
  addSurfacePatch(pavingGroup, mats.promenadePaving, 0, -50, 12, 60, 0.045);
  addSurfacePatch(pavingGroup, mats.curbStone, -6.6, -50, 1.2, 60, 0.052);
  addSurfacePatch(pavingGroup, mats.curbStone, 6.6, -50, 1.2, 60, 0.052);
  addSurfacePatch(pavingGroup, mats.turf, -14.0, -50, 12, 56, 0.035);
  addSurfacePatch(pavingGroup, mats.turf, 14.0, -50, 12, 56, 0.035);

  // --- Central Civic Plaza centered at s = 0, y = -5 ---
  addMeridianPlaza(pavingGroup);

  // --- East Route to Civic Tower Doorway ---
  // East route begins at the compass court's edge (s = 22).
  addSurfacePatch(pavingGroup, mats.streetPaving, 37.5, 5, 31, 10, 0.048);
  addSurfacePatch(pavingGroup, mats.curbStone, 37.5, 0.5, 31, 1.2, 0.055);
  addSurfacePatch(pavingGroup, mats.curbStone, 37.5, 9.5, 31, 1.2, 0.055);
  // Turn north along s = 48 from y = 5 to y = 14.8 (meeting south border of tower parcel at y = 15)
  addSurfacePatch(pavingGroup, mats.streetPaving, 48, 10, 10, 10, 0.05);
  addSurfacePatch(pavingGroup, mats.curbStone, 43.5, 10, 1.2, 10, 0.055);
  addSurfacePatch(pavingGroup, mats.curbStone, 52.5, 10, 1.2, 10, 0.055);

  // --- North Promenade y[10, 125] ---
  addSurfacePatch(pavingGroup, mats.promenadePaving, 0, 35, 12, 50, 0.045);
  addSurfacePatch(pavingGroup, mats.promenadePaving, 0, 75, 12, 30, 0.045);
  addSurfacePatch(pavingGroup, mats.promenadePaving, 0, 107.5, 12, 35, 0.045);
  addSurfacePatch(pavingGroup, mats.curbStone, -6.6, 67.5, 1.2, 115, 0.052);
  addSurfacePatch(pavingGroup, mats.curbStone, 6.6, 67.5, 1.2, 115, 0.052);
  addSurfacePatch(pavingGroup, mats.turf, -14.0, 35, 12, 45, 0.035);
  addSurfacePatch(pavingGroup, mats.turf, 14.0, 35, 12, 45, 0.035);

  // --- Side Streets & Building Access Lanes ---
  // North cross-street along y = 65 (West to Housing s[-31, -6]; East to Skywalk Lift s[6, 26])
  addSurfacePatch(pavingGroup, mats.streetPaving, -18.5, 65, 25, 8, 0.048);
  addSurfacePatch(pavingGroup, mats.streetPaving, 16.0, 65, 20, 8, 0.048);
  // Skywalk lift ground terrace around s = 18, y = 65 (completely unobstructed at anchor)
  addSurfacePatch(pavingGroup, mats.plazaInlay, 18.0, 65, 8, 8, 0.052);

  // West South Housing lane (y = -62)
  addSurfacePatch(pavingGroup, mats.streetPaving, -17.0, -62, 22, 8, 0.048);

  // East South Housing lane (y = -49)
  addSurfacePatch(pavingGroup, mats.streetPaving, 21.5, -49, 31, 8, 0.048);

  // West Workshop lane (y = 9)
  addSurfacePatch(pavingGroup, mats.streetPaving, -38.5, 9, 65, 8, 0.048);

  // East Outer Commercial lane (y = -7)
  addSurfacePatch(pavingGroup, mats.streetPaving, 52.5, -7, 61, 8, 0.048);

  // Transit Concourse approach (y = 98)
  addSurfacePatch(pavingGroup, mats.streetPaving, 25.0, 98, 38, 10, 0.048);
  addSurfacePatch(pavingGroup, mats.plazaPaving, 42.0, 98, 12, 16, 0.052);

  // ==========================================
  // 3. MID-RISE CIVIC ARCHITECTURE (7 Fixed Footprints)
  // Multi-tier curved solids and setbacks; the library has a public ground floor.
  // ==========================================

  // ------------------------------------------
  // 1. Library: s = -35, y = -20, w = 24, d = 30, h = 30
  // ------------------------------------------
  const libGroup = new THREE.Group();
  libGroup.name = "bldgLibrary";
  buildingsGroup.add(libGroup);
  const library = createLibrary(libGroup);
  obstacles.push(...library.obstacles);
  // Upper archives stay solid and inaccessible, preserving the existing silhouette.
  addCivicSolid(libGroup, mats.libraryFacade, obstacles, -35, -20, 24, 30,
    22.6 - LIBRARY_LAYOUT.upperBase, LIBRARY_LAYOUT.upperBase).name = "libraryClosedUpperVolume";
  addCivicSolid(libGroup, mats.limestone, obstacles, -35, -20, 24.5, 30.5, 0.8, 22.6).name = "libraryCornice";
  addCivicSolid(libGroup, mats.libraryFacade, obstacles, -35, -20, 18, 24, 6.6, 23.4).name = "libraryUpperSetback";
  addCivicSolid(libGroup, mats.limestone, obstacles, -35, -20, 10, 14, 0.8, 30).name = "libraryLanternBase";
  addCivicSolid(libGroup, mats.canopyGlass, obstacles, -35, -20, 9.2, 13.2, 1.6, 30.8).name = "libraryLantern";
  addCivicSolid(libGroup, mats.tealMetal, obstacles, -35, -20, 9.6, 13.6, 0.4, 32.4).name = "libraryLanternCap";
  // Plaza portico canopy on east facade (s = -23)
  addCivicBlock(libGroup, mats.tealMetal, -21.8, -20, 2.6, 12.0, 0.4, 4.2);
  obstacles.push({
    theta: -21.8 / RADIUS,
    y: -20,
    width: 2.6,
    depth: 12,
    height: 0.55,
    base: 4.2,
  });
  addCivicBlock(libGroup, mats.canopyGlass, -21.8, -20, 2.2, 11.2, 0.15, 4.6);
  addSurfaceBox(libGroup, mats.bronzeMetal, -20.6, -24, 0.5, 0.5, 4.2, 0);
  addSurfaceBox(libGroup, mats.bronzeMetal, -20.6, -16, 0.5, 0.5, 4.2, 0);
  obstacles.push({
    theta: -20.6 / RADIUS,
    y: -24,
    width: 0.5,
    depth: 0.5,
    height: 4.2,
    base: 0,
  });
  obstacles.push({
    theta: -20.6 / RADIUS,
    y: -16,
    width: 0.5,
    depth: 0.5,
    height: 4.2,
    base: 0,
  });

  // ------------------------------------------
  // 2. West North Housing: s = -44, y = 65, w = 26, d = 30, h = 38
  // ------------------------------------------
  const hNorthGroup = new THREE.Group();
  hNorthGroup.name = "bldgHousingNorth";
  buildingsGroup.add(hNorthGroup);
  // Foundation plinth
  addCivicBlock(hNorthGroup, mats.concretePlinth, -44, 65, 26.6, 30.6, 0.6, 0);
  // Main volume
  addCivicBlock(
    hNorthGroup,
    mats.housingNorthFacade,
    -44,
    65,
    26,
    30,
    30.0,
    0.6,
  );
  // Cornice
  addCivicBlock(hNorthGroup, mats.limestone, -44, 65, 26.4, 30.4, 0.8, 30.6);
  // Stepped setback tier (reaches 38 m)
  addCivicBlock(
    hNorthGroup,
    mats.housingNorthFacade,
    -44,
    65,
    20,
    24,
    6.6,
    31.4,
  );
  // Layered planted terraces keep the residential roof low and quiet.
  const housingRoof = new THREE.Group();
  housingRoof.name = "meridian_housing_roof";
  hNorthGroup.add(housingRoof);
  addCivicSolid(housingRoof, mats.limestone, obstacles, -44, 65, 20, 24, 0.45, 38);
  addCivicSolid(housingRoof, mats.turf, obstacles, -44, 65, 17.8, 21.8, 0.35, 38.45);
  addCivicSolid(housingRoof, mats.limestone, obstacles, -44, 65, 12.8, 15.8, 0.7, 38.8);
  addCivicSolid(housingRoof, mats.turf, obstacles, -44, 65, 11.2, 14.2, 0.3, 39.5);
  addCivicSolid(housingRoof, mats.tealMetal, obstacles, -44, 65, 5.5, 7.5, 0.45, 39.8);
  // Ground entrance canopy facing east (s = -31)
  addCivicBlock(hNorthGroup, mats.tealMetal, -29.8, 65, 2.4, 8.0, 0.35, 3.6);
  obstacles.push({
    theta: -29.8 / RADIUS,
    y: 65,
    width: 2.4,
    depth: 8,
    height: 0.35,
    base: 3.6,
  });
  addSurfaceBox(hNorthGroup, mats.bronzeMetal, -28.7, 62, 0.45, 0.45, 3.6, 0);
  addSurfaceBox(hNorthGroup, mats.bronzeMetal, -28.7, 68, 0.45, 0.45, 3.6, 0);
  addSurfaceSign(
    hNorthGroup,
    "RESIDENTIAL QUAD 03\nPRIVATE ACCESS · RESIDENTS ONLY",
    -29.5,
    65,
    4.5,
    4.0,
  );
  // Skywalk viewing terrace abutment facade accent at s = -31, h = 9 (no open door)
  addCivicBlock(hNorthGroup, mats.tealMetal, -31.3, 65, 0.6, 6.0, 3.2, 8.8);
  addSurfaceSign(
    hNorthGroup,
    "VIEWING TERRACE TERMINUS\nNO PUBLIC ENTRY TO RESIDENCES",
    -30.8,
    65,
    4.2,
    12.2,
  );
  // Obstacles
  obstacles.push({
    theta: -44 / RADIUS,
    y: 65,
    width: 26,
    depth: 30,
    height: 38,
    base: 0,
  });
  obstacles.push({
    theta: -28.7 / RADIUS,
    y: 62,
    width: 0.5,
    depth: 0.5,
    height: 3.6,
    base: 0,
  });
  obstacles.push({
    theta: -28.7 / RADIUS,
    y: 68,
    width: 0.5,
    depth: 0.5,
    height: 3.6,
    base: 0,
  });

  // ------------------------------------------
  // 3. East North Transit Building: s = 58, y = 98, w = 28, d = 26, h = 44
  // ------------------------------------------
  const transitGroup = new THREE.Group();
  transitGroup.name = "bldgTransit";
  buildingsGroup.add(transitGroup);
  // Foundation plinth
  addCivicBlock(transitGroup, mats.concretePlinth, 58, 98, 28.6, 26.6, 0.6, 0);
  // Main concourse volume
  addCivicBlock(transitGroup, mats.transitFacade, 58, 98, 28, 26, 34.0, 0.6);
  // Belt cornice
  addCivicBlock(transitGroup, mats.tealMetal, 58, 98, 28.5, 26.5, 1.0, 34.6);
  // Stepped setback tower (reaches 44 m)
  addCivicBlock(transitGroup, mats.transitFacade, 58, 98, 20, 18, 8.4, 35.6);
  // A long, banded train-hall crown rather than a competing vertical spire.
  const transitRoof = new THREE.Group();
  transitRoof.name = "meridian_transit_roof";
  transitGroup.add(transitRoof);
  addCivicSolid(transitRoof, mats.tealMetal, obstacles, 58, 98, 19.6, 17.8, 0.8, 44);
  addCivicSolid(transitRoof, mats.tealMetal, obstacles, 58, 98, 14.4, 17.8, 0.8, 44.8);
  addCivicSolid(transitRoof, mats.tealMetal, obstacles, 58, 98, 9.2, 17.8, 0.8, 45.6);
  for (const y of [91, 94.5, 98, 101.5, 105]) {
    addCivicSolid(transitRoof, mats.limestone, obstacles, 58, y, 19.8, 0.65, 2.8, 44);
  }
  // West concourse entrance canopy (facing plaza at s = 44)
  addCivicBlock(transitGroup, mats.tealMetal, 42.6, 98, 3.0, 14.0, 0.4, 4.4);
  obstacles.push({
    theta: 42.6 / RADIUS,
    y: 98,
    width: 3,
    depth: 14,
    height: 0.55,
    base: 4.4,
  });
  addCivicBlock(transitGroup, mats.canopyGlass, 42.6, 98, 2.6, 13.2, 0.15, 4.8);
  addSurfaceBox(transitGroup, mats.bronzeMetal, 41.3, 92, 0.5, 0.5, 4.4, 0);
  addSurfaceBox(transitGroup, mats.bronzeMetal, 41.3, 104, 0.5, 0.5, 4.4, 0);
  addSurfaceSign(
    transitGroup,
    "MERIDIAN TRANSIT TERMINAL\nPLATFORMS 1-4 · PASS REQUIRED",
    42.0,
    98,
    5.0,
    5.0,
  );
  // Obstacles
  obstacles.push({
    theta: 58 / RADIUS,
    y: 98,
    width: 28,
    depth: 26,
    height: 44,
    base: 0,
  });
  obstacles.push({
    theta: 41.3 / RADIUS,
    y: 92,
    width: 0.6,
    depth: 0.6,
    height: 4.4,
    base: 0,
  });
  obstacles.push({
    theta: 41.3 / RADIUS,
    y: 104,
    width: 0.6,
    depth: 0.6,
    height: 4.4,
    base: 0,
  });

  // ------------------------------------------
  // 4. West South Housing: s = -40, y = -62, w = 25, d = 25, h = 20
  // ------------------------------------------
  const hSouthGroup = new THREE.Group();
  hSouthGroup.name = "bldgHousingSouth";
  buildingsGroup.add(hSouthGroup);
  addCivicBlock(hSouthGroup, mats.concretePlinth, -40, -62, 25.5, 25.5, 0.5, 0);
  addCivicBlock(
    hSouthGroup,
    mats.housingSouthFacade,
    -40,
    -62,
    25,
    25,
    15.0,
    0.5,
  );
  addCivicBlock(hSouthGroup, mats.limestone, -40, -62, 25.4, 25.4, 0.6, 15.5);
  addCivicBlock(
    hSouthGroup,
    mats.housingSouthFacade,
    -40,
    -62,
    18,
    18,
    3.9,
    16.1,
  );
  addCivicBlock(hSouthGroup, mats.tealMetal, -40, -62, 18.2, 18.2, 0.5, 20.0);
  addCivicBlock(hSouthGroup, mats.tealMetal, -26.3, -62, 2.4, 7.0, 0.35, 3.4);
  obstacles.push({
    theta: -26.3 / RADIUS,
    y: -62,
    width: 2.4,
    depth: 7,
    height: 0.35,
    base: 3.4,
  });
  addSurfaceSign(
    hSouthGroup,
    "COMMONS RESIDENCES SOUTH\nAUTHORIZED ACCESS ONLY",
    -26.0,
    -62,
    4.4,
    3.8,
  );
  obstacles.push({
    theta: -40 / RADIUS,
    y: -62,
    width: 25,
    depth: 25,
    height: 20,
    base: 0,
  });

  // ------------------------------------------
  // 5. Lantern Court: terraced residential tower on the existing housing parcel
  // ------------------------------------------
  const hEastGroup = new THREE.Group();
  hEastGroup.name = "bldgHousingEast";
  buildingsGroup.add(hEastGroup);
  addCivicSolid(hEastGroup, mats.concretePlinth, obstacles, 48, -49, 22.5, 24.5, 0.5, 0);
  // Keep the residence closed; cut a real shallow recess in its west wall.
  addCivicSolid(hEastGroup, mats.housingEastFacade, obstacles, 48.35, -49, 21.3, 24, 18.5, 0.5);
  function addWestBay(y, depth, height, base) {
    const bay = addCivicSolid(hEastGroup, mats.housingEastFacade, obstacles, 37.35, y, 0.7, depth, height, base);
    const { position, normal, uv } = bay.geometry.attributes;
    const theta = 37 / RADIUS;
    for (let i = 0; i < position.count; i++) {
      if (normal.getX(i) * Math.cos(theta) + normal.getZ(i) * Math.sin(theta) > -0.99) continue;
      // Keep the same window grid across all three pieces beside the portal.
      const h = RADIUS - Math.hypot(position.getX(i), position.getZ(i));
      uv.setXY(i, (position.getY(i) + 61) / 24, (h - 0.5) / 18.5);
    }
  }
  // End the split at the atlas cell boundaries, so no pane is cut in half.
  const openingDepth = 24 * 3 / 7;
  const sideDepth = (24 - openingDepth) / 2;
  const bayOffset = (openingDepth + sideDepth) / 2;
  const openingTop = 19 - 6 * 18.5 / 8;
  addWestBay(-49 - bayOffset, sideDepth, 18.5, 0.5);
  addWestBay(-49 + bayOffset, sideDepth, 18.5, 0.5);
  addWestBay(-49, openingDepth, 19 - openingTop, openingTop);
  const lanternCourt = new THREE.Group();
  lanternCourt.name = "meridian_lantern_court";
  hEastGroup.add(lanternCourt);
  // Each setback has its own curved solid and matching vertical collision bounds.
  addCivicSolid(lanternCourt, mats.limestone, obstacles, 48, -49, 22, 24, 0.6, 19);
  addCivicSolid(lanternCourt, mats.lanternFacade, obstacles, 48, -49, 21, 23, 20.4, 19.6);
  addCivicSolid(lanternCourt, mats.limestone, obstacles, 48, -49, 21, 23, 0.7, 40);
  addCivicSolid(lanternCourt, mats.lanternFacade, obstacles, 46.5, -50, 18, 20, 19.3, 40.7);
  addCivicSolid(lanternCourt, mats.limestone, obstacles, 46.5, -50, 18, 20, 0.7, 60);
  addCivicSolid(lanternCourt, mats.lanternFacade, obstacles, 48, -51, 15, 17, 18.3, 60.7);
  addCivicSolid(lanternCourt, mats.limestone, obstacles, 48, -51, 15, 17, 0.7, 79);
  addCivicSolid(lanternCourt, mats.lanternFacade, obstacles, 46.5, -49.5, 12, 14, 18.3, 79.7);
  addCivicSolid(lanternCourt, mats.limestone, obstacles, 46.5, -49.5, 12, 14, 0.8, 98);
  addCivicSolid(lanternCourt, mats.canopyGlass, obstacles, 46.5, -49.5, 8, 9, 3.2, 98.8);
  addCivicSolid(lanternCourt, mats.limestone, obstacles, 46.5, -49.5, 8.8, 9.8, 0.8, 102).name = "lanternCourtCrown";
  // Pale balcony slabs mark occupied floors rather than a single glass shaft.
  for (const [s, y, width, depth, base] of [
    [48, -49, 21.4, 23.4, 26], [48, -49, 21.4, 23.4, 33],
    [46.5, -50, 18.4, 20.4, 47], [46.5, -50, 18.4, 20.4, 54],
    [48, -51, 15.4, 17.4, 67], [48, -51, 15.4, 17.4, 73],
    [46.5, -49.5, 12.4, 14.4, 86], [46.5, -49.5, 12.4, 14.4, 92],
  ]) {
    addCivicBlock(lanternCourt, mats.limestone, s, y, width, depth, 0.35, base);
  }
  // Off-centre planted pockets make the setbacks legible from overhead.
  for (const [s, y, width, depth, base] of [
    [56.8, -49, 2, 17, 40.7], [46, -38.5, 14, 1.5, 40.7],
    [40, -50, 2, 15, 60.7], [48, -59, 10, 1.5, 60.7],
    [53.5, -51, 2, 11, 79.7], [46, -58.5, 8, 1.5, 79.7],
  ]) {
    addCivicBlock(lanternCourt, mats.turf, s, y, width, depth, 0.25, base);
  }
  addCivicBlock(hEastGroup, mats.tealMetal, 35.8, -49, 2.4, 7.0, 0.35, 3.4);
  obstacles.push({
    theta: 35.8 / RADIUS,
    y: -49,
    width: 2.4,
    depth: 7,
    height: 0.35,
    base: 3.4,
  });
  const frontage = new THREE.Group();
  frontage.name = "lantern_court_frontage";
  hEastGroup.add(frontage);

  // Locally drawn coursing gives the stone a little scale at walking distance.
  const stoneCanvas = document.createElement("canvas");
  stoneCanvas.width = stoneCanvas.height = 128;
  const stoneContext = stoneCanvas.getContext("2d");
  stoneContext.fillStyle = "#c9bdab";
  stoneContext.fillRect(0, 0, 128, 128);
  stoneContext.strokeStyle = "rgba(87, 78, 67, 0.22)";
  stoneContext.lineWidth = 1;
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    stoneContext.beginPath();
    stoneContext.moveTo(0, y + 0.5);
    stoneContext.lineTo(128, y + 0.5);
    for (let x = (row % 2) * 16; x < 128; x += 32) {
      stoneContext.moveTo(x + 0.5, y);
      stoneContext.lineTo(x + 0.5, y + 16);
    }
    stoneContext.stroke();
  }
  const stoneTexture = new THREE.CanvasTexture(stoneCanvas);
  stoneTexture.colorSpace = THREE.SRGBColorSpace;
  const entryStone = new THREE.MeshStandardMaterial({ map: stoneTexture, roughness: 0.88 });
  // Stone infill surrounds the actual entry inside the wider atlas opening.
  const infillDepth = openingDepth / 2 - 3.7;
  for (const side of [-1, 1]) {
    addCivicSolid(frontage, entryStone, obstacles, 37.43,
      -49 + side * (3.7 + infillDepth / 2), 0.5, infillDepth, 3.4, 0.5);
  }
  addCivicSolid(frontage, entryStone, obstacles, 37.43, -49, 0.5, openingDepth,
    openingTop - 3.9, 3.9);
  const glassCanvas = document.createElement("canvas");
  glassCanvas.width = 256;
  glassCanvas.height = 128;
  const glassContext = glassCanvas.getContext("2d");
  const reflection = glassContext.createLinearGradient(0, 0, 130, 128);
  reflection.addColorStop(0, "#827254");
  reflection.addColorStop(0.47, "#3f5050");
  reflection.addColorStop(1, "#16282b");
  glassContext.fillStyle = reflection;
  glassContext.fillRect(0, 0, 256, 128);
  glassContext.fillStyle = "#bda276";
  glassContext.fillRect(14, 12, 228, 3);
  glassContext.fillStyle = "#252f2a";
  for (const x of [33, 218]) {
    glassContext.fillRect(x - 6, 105, 12, 23);
    glassContext.beginPath();
    glassContext.ellipse(x, 94, 9, 20, 0.3, 0, Math.PI * 2);
    glassContext.fill();
  }
  const glassTexture = new THREE.CanvasTexture(glassCanvas);
  glassTexture.colorSpace = THREE.SRGBColorSpace;
  const lobbyGlass = new THREE.MeshStandardMaterial({
    map: glassTexture, roughness: 0.36, metalness: 0.12,
  });

  // Small projected sills follow the atlas windows, instead of covering them.
  const sillRows = [6, 7];
  const sillColumns = [0, 1, 5, 6];
  const sills = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.limestone,
    sillRows.length * sillColumns.length);
  const frontageMatrix = new THREE.Matrix4();
  let sillIndex = 0;
  for (const row of sillRows) {
    for (const col of sillColumns) {
      const y = -61 + (col + 0.5) * 24 / 7;
      const h = 19 - (row + 0.78) * 18.5 / 8;
      setSurfaceMatrix(frontageMatrix, 36.97 / RADIUS, y, h, 0.14, 2.27, 0.09);
      sills.setMatrixAt(sillIndex++, frontageMatrix);
    }
  }
  frontage.add(sills);

  // Nested jambs occupy the opening and the canopy footprint, not the lane.
  for (const [s, width, offset, depth] of [
    [37.12, 0.24, 3.5, 0.4],
    [37.38, 0.28, 3.12, 0.3],
    [37.60, 0.16, 2.82, 0.22],
  ]) {
    for (const side of [-1, 1]) {
      addCivicSolid(frontage, entryStone, obstacles, s, -49 + side * offset, width, depth, 3.18, 0.5);
    }
    addCivicBlock(frontage, entryStone, s, -49, width, offset * 2 + depth, 0.22, 3.68);
  }
  // Closed glazing sits at the back of the recess, with a framed double door
  // and opaque warm side lights suggesting a lobby rather than an open interior.
  addCivicSolid(frontage, lobbyGlass, obstacles, 37.68, -49, 0.06, 5.5, 3.12, 0.5);
  for (const y of [-51.7, -50.35, -49, -47.65, -46.3]) {
    addCivicBlock(frontage, mats.bronzeMetal, 37.61, y, 0.1, 0.09, 3.12, 0.5);
  }
  addCivicBlock(frontage, mats.bronzeMetal, 37.61, -49, 0.1, 5.5, 0.1, 2.75);
  addCivicBlock(frontage, mats.limestone, 37.48, -49, 0.4, 5.7, 0.12, 0.5);
  for (const y of [-49.18, -48.82]) {
    addCivicBlock(frontage, mats.brassAccent, 37.54, y, 0.1, 0.07, 0.55, 1.35);
  }
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512;
  signCanvas.height = 48;
  const sign = signCanvas.getContext("2d");
  sign.fillStyle = "#223934";
  sign.fillRect(0, 0, 512, 48);
  sign.fillStyle = "#e6d8ad";
  sign.font = "600 36px system-ui";
  sign.textAlign = "center";
  sign.textBaseline = "middle";
  sign.fillText("LANTERN COURT", 256, 24);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  addOrientedPanel(frontage, new THREE.MeshBasicMaterial({ map: signTexture }),
    surfacePos(34.57 / RADIUS, -49, 3.575), "west", 4.7, 0.32);

  // ------------------------------------------
  // 6. Meridian Exchange: offset commercial volumes on the existing parcel
  // ------------------------------------------
  const commGroup = new THREE.Group();
  commGroup.name = "bldgCommercial";
  buildingsGroup.add(commGroup);
  addCivicBlock(commGroup, mats.concretePlinth, 94, -7, 22.5, 28.5, 0.5, 0);
  addCivicBlock(commGroup, mats.commercialFacade, 94, -7, 22, 28, 20.5, 0.5);
  const exchangeTower = new THREE.Group();
  exchangeTower.name = "meridian_exchange_tower";
  commGroup.add(exchangeTower);
  addCivicSolid(exchangeTower, mats.limestone, obstacles, 94, -7, 22, 28, 0.6, 21);
  addCivicSolid(exchangeTower, mats.commercialFacade, obstacles, 94, -7, 22, 28, 23.4, 21.6);
  addCivicSolid(exchangeTower, mats.limestone, obstacles, 94, -7, 22, 28, 0.8, 45);
  addCivicSolid(exchangeTower, mats.commercialFacade, obstacles, 92.5, -9, 19, 24, 23.2, 45.8);
  addCivicSolid(exchangeTower, mats.limestone, obstacles, 92.5, -9, 19, 24, 0.8, 69);
  addCivicSolid(exchangeTower, mats.commercialFacade, obstacles, 95, -5, 18, 22, 23.2, 69.8);
  addCivicSolid(exchangeTower, mats.limestone, obstacles, 95, -5, 18, 22, 0.8, 93);
  addCivicSolid(exchangeTower, mats.tealMetal, obstacles, 93.5, -7, 15, 18, 18.2, 93.8);
  addCivicSolid(exchangeTower, mats.limestone, obstacles, 93.5, -7, 16, 19, 1, 112);
  addCivicSolid(exchangeTower, mats.brassAccent, obstacles, 93.5, -7, 10, 13, 2, 113);
  addCivicSolid(exchangeTower, mats.tealMetal, obstacles, 93.5, -7, 12, 15, 1, 115).name = "exchangeTowerCap";
  // Repeated vertical fins share geometry and draw calls.
  const finGeometry = new THREE.BoxGeometry(1, 1, 1);
  const finMatrix = new THREE.Matrix4();
  const lowerFinRows = [-18, -12, -6, 0, 4];
  const upperFinRows = [-18, -12, -6, 0];
  for (const [material, lowerS, upperS] of [
    [mats.brassAccent, 83.1, 101.9],
    [mats.limestone, 104.9, 83.1],
  ]) {
    const fins = new THREE.InstancedMesh(finGeometry, material, lowerFinRows.length + upperFinRows.length);
    let index = 0;
    for (const y of lowerFinRows) {
      setSurfaceMatrix(finMatrix, lowerS / RADIUS, y, 22, 0.5, 0.65, 23);
      fins.setMatrixAt(index++, finMatrix);
    }
    for (const y of upperFinRows) {
      setSurfaceMatrix(finMatrix, upperS / RADIUS, y, 46, 0.5, 0.65, 23);
      fins.setMatrixAt(index++, finMatrix);
    }
    exchangeTower.add(fins);
  }
  addCivicBlock(commGroup, mats.tealMetal, 81.8, -7, 2.4, 8.0, 0.35, 3.5);
  obstacles.push({
    theta: 81.8 / RADIUS,
    y: -7,
    width: 2.4,
    depth: 8,
    height: 0.35,
    base: 3.5,
  });
  // The Exchange has a recessed-looking bronze entrance between its two
  // street displays. The solid podium behind it remains closed.
  addCivicBlock(commGroup, mats.tealMetal, 83, -7, 0.24, 3.4, 3.35);
  for (const y of [-8.65, -7, -5.35]) {
    addCivicBlock(commGroup, mats.brassAccent, 82.85, y, 0.13, 0.13, 3.35);
  }
  addCivicBlock(commGroup, mats.brassAccent, 82.82, -7, 0.15, 3.4, 0.13, 2.45);
  addSurfaceSign(
    commGroup,
    "MERIDIAN COMMERCIAL EXCHANGE\nTRADING FLOOR · BADGE REQUIRED",
    81.5,
    -7,
    4.8,
    3.9,
  );
  obstacles.push({
    theta: 94 / RADIUS,
    y: -7,
    width: 22,
    depth: 28,
    height: 21,
    base: 0,
  });

  // ------------------------------------------
  // 7. West Outer Workshop: s = -80, y = 9, w = 18, d = 26, h = 16
  // ------------------------------------------
  const wrkGroup = new THREE.Group();
  wrkGroup.name = "bldgWorkshop";
  buildingsGroup.add(wrkGroup);
  addCivicBlock(wrkGroup, mats.concretePlinth, -80, 9, 18.5, 26.5, 0.5, 0);
  addCivicBlock(wrkGroup, mats.workshopFacade, -80, 9, 18, 26, 12.5, 0.5);
  addCivicBlock(wrkGroup, mats.tealMetal, -80, 9, 10, 20, 3.0, 13.0);
  addCivicBlock(wrkGroup, mats.tealMetal, -69.8, 9, 2.4, 10.0, 0.35, 3.8);
  obstacles.push({
    theta: -69.8 / RADIUS,
    y: 9,
    width: 2.4,
    depth: 10,
    height: 0.35,
    base: 3.8,
  });
  addSurfaceSign(
    wrkGroup,
    "CIVIC MAINTENANCE WORKSHOP\nAUTHORIZED PERSONNEL ONLY",
    -69.5,
    9,
    4.8,
    4.2,
  );
  obstacles.push({
    theta: -80 / RADIUS,
    y: 9,
    width: 18,
    depth: 26,
    height: 16,
    base: 0,
  });

  // Unrelated exchange and residential frontages remain closed architectural displays.
  const exchangeDisplay = createStreetDisplayMaterial("exchange");
  const residentialDisplay = createStreetDisplayMaterial("residential");
  const displays = [
    [commGroup, exchangeDisplay, "cityExchangeDisplaySouth", 83, -14, 2.2, "west", 4.8, 2.4],
    [commGroup, exchangeDisplay, "cityExchangeDisplayNorth", 83, 0, 2.2, "west", 4.8, 2.4],
    [hNorthGroup, residentialDisplay, "cityResidentialEntranceNorth", -31, 65, 2.05, "east", 4.8, 2.2],
    [hSouthGroup, residentialDisplay, "cityResidentialEntranceSouth", -27.5, -62, 2.05, "east", 4.8, 2.2],
  ];
  for (const [group, material, name, s, y, h, facing, width, height] of displays) {
    const panel = addOrientedPanel(
      group,
      material,
      surfacePos(s / RADIUS, y, h),
      facing,
      width,
      height,
    );
    panel.name = name;
  }

  // ==========================================
  // 4. PLAZA CENTERPIECE & CIVIC WAYFINDING
  // Distinctive off-center monument & multi-route directories
  // ==========================================

  // --- Plaza Centerpiece: The Meridian Armillary (s = 12, y = -5) ---
  // Tiered stone plinth (outside s[-5, 5])
  addCivicBlock(monumentsGroup, mats.concretePlinth, 12, -5, 4.6, 4.6, 0.7, 0);
  addCivicBlock(monumentsGroup, mats.limestone, 12, -5, 3.6, 3.6, 0.8, 0.7);
  addCivicBlock(monumentsGroup, mats.limestone, 12, -5, 2.4, 2.4, 1.8, 1.5);
  addCivicBlock(monumentsGroup, mats.brassAccent, 12, -5, 2.6, 2.6, 0.3, 3.3);

  // Sculptural celestial sphere and rings
  const sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 16, 16),
    mats.brassAccent,
  );
  setSurfaceMatrix(tempMatrix, 12 / RADIUS, -5, 3.8, 1.5, 1.5, 1.5);
  sphereMesh.applyMatrix4(tempMatrix);
  monumentsGroup.add(sphereMesh);

  const ringGroup = new THREE.Group();
  ringGroup.name = "cityArmillaryRings";
  ringGroup.userData.atmosphereDynamic = true;
  ringGroup.applyMatrix4(
    setSurfaceMatrix(tempMatrix, 12 / RADIUS, -5, 4.55, 1, 1, 1),
  );
  const ringMesh1 = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.08, 8, 24),
    mats.tealMetal,
  );
  ringMesh1.name = "cityArmillaryRingTeal";
  ringMesh1.rotation.set(Math.PI / 4, 0, 0);
  ringGroup.add(ringMesh1);

  const ringMesh2 = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.08, 8, 24),
    mats.brassAccent,
  );
  ringMesh2.name = "cityArmillaryRingBrass";
  ringMesh2.rotation.set(-Math.PI / 4, Math.PI / 3, 0);
  ringGroup.add(ringMesh2);
  monumentsGroup.add(ringGroup);

  addSurfaceBox(monumentsGroup, mats.brassAccent, 12, -5, 0.3, 0.3, 1.2, 6.4);
  obstacles.push({
    theta: 12 / RADIUS,
    y: -5,
    width: 4.6,
    depth: 4.6,
    height: 4.5,
    base: 0,
  });

  // --- Distinctive Map & Directional Signposts ---
  // 1. Plaza Main Map & Directory Kiosk (s = 8.5, y = -10)
  addSurfaceBox(
    monumentsGroup,
    mats.concretePlinth,
    8.5,
    -10,
    1.8,
    1.0,
    0.4,
    0,
  );
  addSurfaceBox(monumentsGroup, mats.tealMetal, 8.5, -10, 1.6, 0.8, 2.2, 0.4);
  addSurfaceSign(
    monumentsGroup,
    "MERIDIAN CIVIC DISTRICT\n↑ SKYWALK LIFT · 75m\n→ TOWER LOBBY · SKYROOM\n↓ GREENWAY COMMONS",
    8.5,
    -10,
    3.8,
    2.4,
  );
  obstacles.push({
    theta: 8.5 / RADIUS,
    y: -10,
    width: 1.8,
    depth: 1.0,
    height: 2.6,
    base: 0,
  });

  // 2. West Plaza Directory (s = -16, y = -5)
  addSurfaceBox(monumentsGroup, mats.concretePlinth, -16, -5, 1.4, 0.8, 0.4, 0);
  addSurfaceBox(monumentsGroup, mats.tealMetal, -16, -5, 1.2, 0.6, 2.0, 0.4);
  addSurfaceSign(
    monumentsGroup,
    "CIVIC LIBRARY & ARCHIVES\nWEST FORECOURT · READING ROOM",
    -16,
    -5,
    4.0,
    2.4,
  );
  obstacles.push({
    theta: -16 / RADIUS,
    y: -5,
    width: 1.4,
    depth: 0.8,
    height: 2.4,
    base: 0,
  });

  // 3. East Route Directory (s = 8, y = 9.2 - north curb of east street)
  addSurfaceBox(monumentsGroup, mats.concretePlinth, 8, 9.2, 1.2, 0.8, 0.4, 0);
  addSurfaceBox(monumentsGroup, mats.tealMetal, 8, 9.2, 1.0, 0.6, 2.0, 0.4);
  addSurfaceSign(
    monumentsGroup,
    "EAST CIVIC ROUTE\n→ CIVIC TOWER & SKYROOM",
    8,
    9.2,
    4.2,
    2.5,
  );
  obstacles.push({
    theta: 8 / RADIUS,
    y: 9.2,
    width: 1.2,
    depth: 0.8,
    height: 2.4,
    base: 0,
  });

  // 4. Tower South Approach Wayfinding (s = 43.5, y = 3.5 - corner curb)
  addSurfaceBox(
    monumentsGroup,
    mats.concretePlinth,
    43.5,
    3.5,
    1.2,
    0.8,
    0.4,
    0,
  );
  addSurfaceBox(monumentsGroup, mats.tealMetal, 43.5, 3.5, 1.0, 0.6, 2.0, 0.4);
  addSurfaceSign(
    monumentsGroup,
    "CIVIC TOWER SOUTH LOBBY\nMAIN LIFT · SKYROOM 42m ↑",
    43.5,
    3.5,
    4.5,
    2.5,
  );
  obstacles.push({
    theta: 43.5 / RADIUS,
    y: 3.5,
    width: 1.2,
    depth: 0.8,
    height: 2.4,
    base: 0,
  });

  // 5. Skywalk Street Lift Wayfinding (s = 11, y = 68.5 - north curb of lift cross-street)
  addSurfaceBox(
    monumentsGroup,
    mats.concretePlinth,
    11,
    68.5,
    1.2,
    0.8,
    0.4,
    0,
  );
  addSurfaceBox(monumentsGroup, mats.tealMetal, 11, 68.5, 1.0, 0.6, 2.0, 0.4);
  addSurfaceSign(
    monumentsGroup,
    "PUBLIC SKYWALK LIFT\nELEVATED VIEWING TERRACE →",
    11,
    68.5,
    4.2,
    2.5,
  );
  obstacles.push({
    theta: 11 / RADIUS,
    y: 68.5,
    width: 1.2,
    depth: 0.8,
    height: 2.4,
    base: 0,
  });

  // 6. Transit Terminal Wayfinding (s = 11, y = 102.5 - north curb of transit street)
  addSurfaceBox(
    monumentsGroup,
    mats.concretePlinth,
    11,
    102.5,
    1.2,
    0.8,
    0.4,
    0,
  );
  addSurfaceBox(monumentsGroup, mats.tealMetal, 11, 102.5, 1.0, 0.6, 2.0, 0.4);
  addSurfaceSign(
    monumentsGroup,
    "MERIDIAN TRANSIT TERMINAL\nPLATFORMS 1-4 · CONCOURSE →",
    11,
    102.5,
    4.5,
    2.5,
  );
  obstacles.push({
    theta: 11 / RADIUS,
    y: 102.5,
    width: 1.2,
    depth: 0.8,
    height: 2.4,
    base: 0,
  });
  // 7. Arrival Point Wayfinding (y = -78)
  addSurfaceSign(
    monumentsGroup,
    "MERIDIAN CIVIC DISTRICT\nCIVIC PLAZA · PROMENADE NORTH",
    -7.0,
    -78,
    4.6,
    2.8,
  );
  addSurfaceSign(
    monumentsGroup,
    "GREENWAY PROMENADE\nMARKET · FARMS · OVERLOOK SOUTH",
    7.0,
    -78,
    4.6,
    2.8,
  );

  // ==========================================
  // 5. STREET FURNITURE & INSTANCED ELEMENTS
  // Benches, Avenue Trees, Planters, Civic Lighting
  // ==========================================

  // --- Street Benches ---
  const benchLocations = [
    // Promenade South
    { s: -6.8, y: -64 },
    { s: 6.8, y: -64 },
    { s: -6.8, y: -42 },
    { s: 6.8, y: -42 },
    { s: -6.8, y: -26 },
    { s: 6.8, y: -26 },

    // Civic Plaza Perimeter
    { s: -15.0, y: -14 },
    { s: -15.0, y: 4 },
    { s: 15.0, y: -14 },
    { s: 15.0, y: 4 },

    // Promenade North
    { s: -6.8, y: 22 },
    { s: 6.8, y: 22 },
    { s: -6.8, y: 46 },
    { s: 6.8, y: 46 },
    { s: -6.8, y: 78 },
    { s: 6.8, y: 78 },
    { s: -6.8, y: 104 },
    { s: 6.8, y: 104 },

    // Library Forecourt
    { s: -20.0, y: -12 },
    { s: -20.0, y: -28 },

    // Transit Concourse
    { s: 35.0, y: 92 },
    { s: 35.0, y: 104 },
  ];

  const benchFrameMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.tealMetal,
    benchLocations.length,
  );
  const benchWoodMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.woodCedar,
    benchLocations.length * 2,
  );

  benchLocations.forEach((b, i) => {
    // Frame base
    setSurfaceMatrix(tempMatrix, b.s / RADIUS, b.y, 0, 2.2, 0.75, 0.45);
    benchFrameMesh.setMatrixAt(i, tempMatrix);

    // Seat slat
    setSurfaceMatrix(tempMatrix, b.s / RADIUS, b.y, 0.45, 2.1, 0.65, 0.08);
    benchWoodMesh.setMatrixAt(i * 2, tempMatrix);

    // Back slat
    setSurfaceMatrix(tempMatrix, b.s / RADIUS, b.y + 0.3, 0.55, 2.1, 0.1, 0.35);
    benchWoodMesh.setMatrixAt(i * 2 + 1, tempMatrix);

    obstacles.push({
      theta: b.s / RADIUS,
      y: b.y,
      width: 2.2,
      depth: 0.8,
      height: 0.85,
      base: 0,
    });
  });

  benchFrameMesh.instanceMatrix.needsUpdate = true;
  benchWoodMesh.instanceMatrix.needsUpdate = true;
  furnitureGroup.add(benchFrameMesh);
  furnitureGroup.add(benchWoodMesh);

  // --- Avenue Trees & Raised Planters ---
  const treeLocations = [
    // Promenade South
    { s: -7.2, y: -72 },
    { s: 7.2, y: -72 },
    { s: -7.2, y: -54 },
    { s: 7.2, y: -54 },
    { s: -7.2, y: -34 },
    { s: 7.2, y: -34 },

    // Plaza Margins
    { s: -18.0, y: -18 },
    { s: -18.0, y: 8 },
    { s: 18.0, y: -18 },
    { s: 18.0, y: 8 },

    // Promenade Mid
    { s: -7.2, y: 14 },
    { s: 7.2, y: 14 },
    { s: -7.2, y: 34 },
    { s: 7.2, y: 34 },
    { s: -7.2, y: 54 },
    { s: 7.2, y: 54 },

    // Promenade North
    { s: -7.2, y: 72 },
    { s: 7.2, y: 72 },
    { s: -7.2, y: 88 },
    { s: 7.2, y: 88 },
    { s: -7.2, y: 112 },
    { s: 7.2, y: 112 },
    { s: -7.2, y: 126 },
    { s: 7.2, y: 126 },

    // East Route Border
    { s: 20.0, y: 0.5 },
    { s: 34.0, y: 0.5 },

    // Transit Concourse
    { s: 28.0, y: 105 },
    { s: 42.0, y: 107 },
  ];

  const treePlanterMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.concretePlinth,
    treeLocations.length,
  );
  const treeEarthMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.earthBed,
    treeLocations.length,
  );
  const treeTrunkMesh = new THREE.InstancedMesh(
    unitCylinderGeo,
    mats.treeTrunk,
    treeLocations.length,
  );
  const treeCanopyMesh = new THREE.InstancedMesh(
    unitSphereGeo,
    mats.treeCanopy,
    treeLocations.length,
  );
  const treeCanopyAccentMesh = new THREE.InstancedMesh(
    unitSphereGeo,
    mats.treeCanopyAccent,
    treeLocations.length,
  );

  treeLocations.forEach((t, i) => {
    // Raised Planter Box
    setSurfaceMatrix(tempMatrix, t.s / RADIUS, t.y, 0, 1.6, 1.6, 0.5);
    treePlanterMesh.setMatrixAt(i, tempMatrix);

    // Planter soil bed
    setSurfaceMatrix(tempMatrix, t.s / RADIUS, t.y, 0.48, 1.45, 1.45, 0.08);
    treeEarthMesh.setMatrixAt(i, tempMatrix);

    // Tree trunk
    setSurfaceMatrix(tempMatrix, t.s / RADIUS, t.y, 0.5, 0.36, 0.36, 2.6);
    treeTrunkMesh.setMatrixAt(i, tempMatrix);

    // Lower canopy
    setSurfaceMatrix(tempMatrix, t.s / RADIUS, t.y, 2.5, 2.8, 2.8, 2.6);
    treeCanopyMesh.setMatrixAt(i, tempMatrix);

    // Upper canopy
    setSurfaceMatrix(tempMatrix, t.s / RADIUS, t.y, 3.8, 2.0, 2.0, 2.0);
    treeCanopyAccentMesh.setMatrixAt(i, tempMatrix);

    obstacles.push({
      theta: t.s / RADIUS,
      y: t.y,
      width: 1.6,
      depth: 1.6,
      height: 0.5,
      base: 0,
    });
    obstacles.push({
      theta: t.s / RADIUS,
      y: t.y,
      width: 0.36,
      depth: 0.36,
      height: 2.6,
      base: 0.5,
    });
  });

  treePlanterMesh.instanceMatrix.needsUpdate = true;
  treeEarthMesh.instanceMatrix.needsUpdate = true;
  treeTrunkMesh.instanceMatrix.needsUpdate = true;
  treeCanopyMesh.instanceMatrix.needsUpdate = true;
  treeCanopyAccentMesh.instanceMatrix.needsUpdate = true;

  furnitureGroup.add(treePlanterMesh);
  furnitureGroup.add(treeEarthMesh);
  furnitureGroup.add(treeTrunkMesh);
  furnitureGroup.add(treeCanopyMesh);
  furnitureGroup.add(treeCanopyAccentMesh);

  // --- Civic Lighting Columns ---
  const lampLocations = [
    // Promenade South
    { s: -6.8, y: -76 },
    { s: 6.8, y: -76 },
    { s: -6.8, y: -48 },
    { s: 6.8, y: -48 },
    { s: -6.8, y: -20 },
    { s: 6.8, y: -20 },

    // Plaza Corners
    { s: -20.0, y: -8 },
    { s: 20.0, y: -8 },

    // Promenade Mid
    { s: -6.8, y: 8 },
    { s: 6.8, y: 8 },
    { s: -6.8, y: 40 },
    { s: 6.8, y: 40 },

    // Skywalk Lift Street Approach
    { s: 13.0, y: 62 },
    { s: 23.0, y: 62 },

    // Promenade North
    { s: -6.8, y: 82 },
    { s: 6.8, y: 82 },
    { s: -6.8, y: 118 },
    { s: 6.8, y: 118 },

    // East Route
    { s: 24.0, y: 9.5 },
    { s: 42.0, y: 9.5 },
    { s: 44.0, y: 14.0 },
  ];

  const lampPostMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.tealMetal,
    lampLocations.length,
  );
  const lampLuminaireMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    mats.lampLuminaire,
    lampLocations.length,
  );

  lampLocations.forEach((l, i) => {
    // Metal column
    setSurfaceMatrix(tempMatrix, l.s / RADIUS, l.y, 0, 0.3, 0.3, 4.0);
    lampPostMesh.setMatrixAt(i, tempMatrix);

    // Luminaire top
    setSurfaceMatrix(tempMatrix, l.s / RADIUS, l.y, 4.0, 0.55, 0.55, 0.55);
    lampLuminaireMesh.setMatrixAt(i, tempMatrix);

    obstacles.push({
      theta: l.s / RADIUS,
      y: l.y,
      width: 0.35,
      depth: 0.35,
      height: 4.5,
      base: 0,
    });
  });

  lampPostMesh.instanceMatrix.needsUpdate = true;
  lampLuminaireMesh.instanceMatrix.needsUpdate = true;
  furnitureGroup.add(lampPostMesh);
  furnitureGroup.add(lampLuminaireMesh);

  function update(dt) {
    // Accumulate simulation deltas only: pause/zero-step never resets the pose.
    if (!Number.isFinite(dt) || dt <= 0) return;
    ringMesh1.rotation.z += dt * 0.045;
    ringMesh1.rotation.y += dt * 0.025;
    ringMesh2.rotation.z -= dt * 0.033;
    ringMesh2.rotation.x += dt * 0.02;
  }

  return { obstacles, update };
}
