import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import {
  surfacePos,
  setSurfaceMatrix,
  addSurfaceBox,
  addSurfacePatch,
  addSurfaceSign,
} from "./surface.js";

// Helper: connect two world points with a rectangular beam
function addWorldBeam(parent, material, p1, p2, thickness = 0.14) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 1e-4) return null;
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const geo = new THREE.BoxGeometry(thickness, thickness, len);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    dir.clone().normalize(),
  );
  parent.add(mesh);
  return mesh;
}

export function createFarm(parent) {
  const obstacles = [];
  const farmGroup = new THREE.Group();
  farmGroup.name = "greenway_farm";
  parent.add(farmGroup);

  // ==========================================
  // 1. SHARED MATERIALS
  // ==========================================
  const pathPavingMat = new THREE.MeshStandardMaterial({
    color: 0xc8bc9e,
    roughness: 0.88,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const soilFurrowMat = new THREE.MeshStandardMaterial({
    color: 0x3d2c1f,
    roughness: 0.95,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const richSoilMat = new THREE.MeshStandardMaterial({
    color: 0x2a1d14,
    roughness: 0.98,
    metalness: 0.02,
  });

  const canalWaterMat = new THREE.MeshStandardMaterial({
    color: 0x16525c,
    roughness: 0.12,
    metalness: 0.65,
    side: THREE.DoubleSide,
  });

  const stoneTrimMat = new THREE.MeshStandardMaterial({
    color: 0x8f8a7e,
    roughness: 0.8,
    metalness: 0.1,
  });

  const woodBridgeMat = new THREE.MeshStandardMaterial({
    color: 0x6e5239,
    roughness: 0.85,
    metalness: 0.05,
  });

  // Greenhouse materials
  const ghFloorMat = new THREE.MeshStandardMaterial({
    color: 0xc4baaa,
    roughness: 0.82,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const ghAisleMat = new THREE.MeshStandardMaterial({
    color: 0x9e583c, // Terracotta tiles
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const ghPlazaCenterMat = new THREE.MeshStandardMaterial({
    color: 0x3d7065, // Inlaid decorative green stone
    roughness: 0.7,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  const ghFoundationMat = new THREE.MeshStandardMaterial({
    color: 0x7c817e,
    roughness: 0.85,
    metalness: 0.15,
  });

  const ghSteelFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1d3436, // Deep forest teal steel
    roughness: 0.45,
    metalness: 0.65,
  });

  const ghGlassMat = new THREE.MeshStandardMaterial({
    color: 0x9ee6df,
    transparent: true,
    opacity: 0.38,
    roughness: 0.08,
    metalness: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const cedarPlanterMat = new THREE.MeshStandardMaterial({
    color: 0x5a3d2c,
    roughness: 0.78,
    metalness: 0.05,
  });

  const growLightMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c2,
    emissive: 0xffb84d,
    emissiveIntensity: 1.8,
    roughness: 0.3,
  });

  // Utility shed & machinery materials
  const shedWallMat = new THREE.MeshStandardMaterial({
    color: 0x4a3b2e,
    roughness: 0.9,
    metalness: 0.05,
  });

  const shedCorrugatedRoofMat = new THREE.MeshStandardMaterial({
    color: 0x27595c, // Deep teal corrugated metal
    roughness: 0.45,
    metalness: 0.4,
  });

  const shedTrimMat = new THREE.MeshStandardMaterial({
    color: 0xded2be,
    roughness: 0.65,
    metalness: 0.1,
  });

  const galvanizedSteelMat = new THREE.MeshStandardMaterial({
    color: 0x5b686e,
    roughness: 0.4,
    metalness: 0.75,
  });

  const waterTankMat = new THREE.MeshStandardMaterial({
    color: 0x364f5c,
    roughness: 0.38,
    metalness: 0.55,
  });

  const castMachineryGreenMat = new THREE.MeshStandardMaterial({
    color: 0x274a38,
    roughness: 0.55,
    metalness: 0.45,
  });

  const brassFittingMat = new THREE.MeshStandardMaterial({
    color: 0xcfa442,
    roughness: 0.3,
    metalness: 0.85,
  });

  const rubberTireMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.92,
    metalness: 0.05,
  });

  const wagonWoodMat = new THREE.MeshStandardMaterial({
    color: 0x7a5b3a,
    roughness: 0.85,
    metalness: 0.05,
  });

  const crateWoodMat = new THREE.MeshStandardMaterial({
    color: 0x997346,
    roughness: 0.85,
    metalness: 0.05,
  });

  // Crop foliage materials
  const goldenGrainMat = new THREE.MeshStandardMaterial({
    color: 0xdeb342,
    roughness: 0.82,
    metalness: 0.05,
  });

  const crispGreensMat = new THREE.MeshStandardMaterial({
    color: 0x2f8c47,
    roughness: 0.75,
    metalness: 0.05,
  });

  const tallCropMat = new THREE.MeshStandardMaterial({
    color: 0x386e35,
    roughness: 0.8,
    metalness: 0.05,
  });

  const tomatoFruitMat = new THREE.MeshStandardMaterial({
    color: 0xd6281e,
    roughness: 0.35,
    metalness: 0.05,
  });

  // ==========================================
  // 2. THOROUGHFARES & ACCESS LANES (UNOBSTRUCTED)
  // ==========================================
  // A. East-west Service Lane from square (y = -246, s in [35, 140])
  addSurfacePatch(
    farmGroup,
    pathPavingMat,
    (35 + 140) / 2,
    -246,
    140 - 35,
    5.0,
    0.07,
  );

  // B. Branch approach lane to Greenhouse 01 (s = 64, y in [-246, -232])
  addSurfacePatch(farmGroup, pathPavingMat, 64, -239, 4.6, 14.0, 0.075);

  // C. North Crosslane (y = -174, s in [35, 135])
  addSurfacePatch(
    farmGroup,
    pathPavingMat,
    (35 + 135) / 2,
    -174,
    135 - 35,
    5.0,
    0.07,
  );

  // D. Greenhouse North Exit connecting to Crosslane (s = 64, y in [-196, -174])
  addSurfacePatch(farmGroup, pathPavingMat, 64, -185, 4.6, 22.0, 0.075);

  // E. Farm Utility Yard Apron & paths (s in [36, 48], y in [-150, -125])
  addSurfacePatch(farmGroup, pathPavingMat, 42, -137.5, 12.0, 25.0, 0.065);

  // ==========================================
  // 3. GLASSHOUSE 01 (CENTER s = 64, y = -214, WIDTH 22, DEPTH 36)
  // ==========================================
  // S-bounds: [53, 75]
  // Y-bounds: [-232, -196]
  // Doorways: 4m wide at s in [62, 66], at y = -232 and y = -196.
  // Central aisle: s in [62, 66] continuous and open.

  // Floor
  addSurfacePatch(farmGroup, ghFloorMat, 64, -214, 22.4, 36.4, 0.08);
  // Central aisle paving
  addSurfacePatch(farmGroup, ghAisleMat, 64, -214, 4.2, 36.4, 0.085);
  // Center plaza medallion around stop center (s=64, y=-214)
  addSurfacePatch(farmGroup, ghPlazaCenterMat, 64, -214, 6.4, 6.4, 0.09);

  // --- Solid Wall & Jamb Collision Strips ---
  // West solid boundary strip (s = 53.2, y = -214, width = 0.8, depth = 36.0, height = 4.8)
  obstacles.push({
    theta: 53.2 / RADIUS,
    y: -214,
    width: 0.8,
    depth: 36.0,
    height: 4.8,
  });

  // East solid boundary strip (s = 74.8, y = -214, width = 0.8, depth = 36.0, height = 4.8)
  obstacles.push({
    theta: 74.8 / RADIUS,
    y: -214,
    width: 0.8,
    depth: 36.0,
    height: 4.8,
  });

  // South jamb west (s = 57.5, y = -232, width = 9.0, depth = 0.8, height = 4.8)
  obstacles.push({
    theta: 57.5 / RADIUS,
    y: -232,
    width: 9.0,
    depth: 0.8,
    height: 4.8,
  });

  // South jamb east (s = 70.5, y = -232, width = 9.0, depth = 0.8, height = 4.8)
  obstacles.push({
    theta: 70.5 / RADIUS,
    y: -232,
    width: 9.0,
    depth: 0.8,
    height: 4.8,
  });

  // North jamb west (s = 57.5, y = -196, width = 9.0, depth = 0.8, height = 4.8)
  obstacles.push({
    theta: 57.5 / RADIUS,
    y: -196,
    width: 9.0,
    depth: 0.8,
    height: 4.8,
  });

  // North jamb east (s = 70.5, y = -196, width = 9.0, depth = 0.8, height = 4.8)
  obstacles.push({
    theta: 70.5 / RADIUS,
    y: -196,
    width: 9.0,
    depth: 0.8,
    height: 4.8,
  });

  // --- Foundation Dwarf Walls (Visual) ---
  addSurfaceBox(farmGroup, ghFoundationMat, 53.2, -214, 0.6, 36.0, 0.75, 0);
  addSurfaceBox(farmGroup, ghFoundationMat, 74.8, -214, 0.6, 36.0, 0.75, 0);
  addSurfaceBox(farmGroup, ghFoundationMat, 57.5, -232, 9.0, 0.6, 0.75, 0);
  addSurfaceBox(farmGroup, ghFoundationMat, 70.5, -232, 9.0, 0.6, 0.75, 0);
  addSurfaceBox(farmGroup, ghFoundationMat, 57.5, -196, 9.0, 0.6, 0.75, 0);
  addSurfaceBox(farmGroup, ghFoundationMat, 70.5, -196, 9.0, 0.6, 0.75, 0);

  // --- Doorway Jamb Columns flanking the 4m opening ---
  // South doorway posts at s = 61.8 and s = 66.2
  addSurfaceBox(farmGroup, ghSteelFrameMat, 61.8, -232, 0.45, 0.55, 4.8, 0);
  addSurfaceBox(farmGroup, ghSteelFrameMat, 66.2, -232, 0.45, 0.55, 4.8, 0);
  // Doorway header above 3.8m clearance (base = 3.95m, height = 0.85m)
  addSurfaceBox(farmGroup, ghSteelFrameMat, 64.0, -232, 4.8, 0.55, 0.85, 3.95);

  // North doorway posts at s = 61.8 and s = 66.2
  addSurfaceBox(farmGroup, ghSteelFrameMat, 61.8, -196, 0.45, 0.55, 4.8, 0);
  addSurfaceBox(farmGroup, ghSteelFrameMat, 66.2, -196, 0.45, 0.55, 4.8, 0);
  // Doorway header above 3.8m clearance (base = 3.95m, height = 0.85m)
  addSurfaceBox(farmGroup, ghSteelFrameMat, 64.0, -196, 4.8, 0.55, 0.85, 3.95);

  // --- Translucent Glass Walls ---
  addSurfaceBox(farmGroup, ghGlassMat, 53.2, -214, 0.08, 35.8, 4.05, 0.75);
  addSurfaceBox(farmGroup, ghGlassMat, 74.8, -214, 0.08, 35.8, 4.05, 0.75);
  addSurfaceBox(farmGroup, ghGlassMat, 57.5, -232, 8.8, 0.08, 4.05, 0.75);
  addSurfaceBox(farmGroup, ghGlassMat, 70.5, -232, 8.8, 0.08, 4.05, 0.75);
  addSurfaceBox(farmGroup, ghGlassMat, 57.5, -196, 8.8, 0.08, 4.05, 0.75);
  addSurfaceBox(farmGroup, ghGlassMat, 70.5, -196, 8.8, 0.08, 4.05, 0.75);

  // --- Evenly Spaced Structural Ribs & Gabled Roof ---
  // 12 bays along y from -232 to -196 (3m spacing)
  const numBays = 12;
  const bayDepth = 3.0;
  const yStart = -232;

  // Roof glass custom geometry
  const roofGlassPositions = [];
  const roofGlassNormals = [];

  for (let b = 0; b < numBays; b++) {
    const yA = yStart + b * bayDepth;
    const yB = yStart + (b + 1) * bayDepth;

    // West slope vertices (s=53, h=4.8) -> (s=64, h=7.0)
    const pW1 = surfacePos(53 / RADIUS, yA, 4.8);
    const pW2 = surfacePos(53 / RADIUS, yB, 4.8);
    const pW3 = surfacePos(64 / RADIUS, yB, 7.0);
    const pW4 = surfacePos(64 / RADIUS, yA, 7.0);

    // Quad: pW1, pW2, pW3 and pW1, pW3, pW4
    roofGlassPositions.push(
      pW1.x,
      pW1.y,
      pW1.z,
      pW2.x,
      pW2.y,
      pW2.z,
      pW3.x,
      pW3.y,
      pW3.z,
      pW1.x,
      pW1.y,
      pW1.z,
      pW3.x,
      pW3.y,
      pW3.z,
      pW4.x,
      pW4.y,
      pW4.z,
    );

    // East slope vertices (s=64, h=7.0) -> (s=75, h=4.8)
    const pE1 = surfacePos(64 / RADIUS, yA, 7.0);
    const pE2 = surfacePos(64 / RADIUS, yB, 7.0);
    const pE3 = surfacePos(75 / RADIUS, yB, 4.8);
    const pE4 = surfacePos(75 / RADIUS, yA, 4.8);

    roofGlassPositions.push(
      pE1.x,
      pE1.y,
      pE1.z,
      pE2.x,
      pE2.y,
      pE2.z,
      pE3.x,
      pE3.y,
      pE3.z,
      pE1.x,
      pE1.y,
      pE1.z,
      pE3.x,
      pE3.y,
      pE3.z,
      pE4.x,
      pE4.y,
      pE4.z,
    );
  }

  // Gable end glazing above h = 4.8m
  for (const yEnd of [-232, -196]) {
    const gW1 = surfacePos(53 / RADIUS, yEnd, 4.8);
    const gW2 = surfacePos(64 / RADIUS, yEnd, 4.8);
    const gPeak = surfacePos(64 / RADIUS, yEnd, 7.0);
    const gE1 = surfacePos(75 / RADIUS, yEnd, 4.8);

    roofGlassPositions.push(
      gW1.x,
      gW1.y,
      gW1.z,
      gW2.x,
      gW2.y,
      gW2.z,
      gPeak.x,
      gPeak.y,
      gPeak.z,
      gW2.x,
      gW2.y,
      gW2.z,
      gE1.x,
      gE1.y,
      gE1.z,
      gPeak.x,
      gPeak.y,
      gPeak.z,
    );
  }

  const roofGlassGeo = new THREE.BufferGeometry();
  roofGlassGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(roofGlassPositions, 3),
  );
  roofGlassGeo.computeVertexNormals();
  const roofGlassMesh = new THREE.Mesh(roofGlassGeo, ghGlassMat);
  farmGroup.add(roofGlassMesh);

  // Structural frame ribs & rafters at every bay division
  for (let k = 0; k <= numBays; k++) {
    const yK = yStart + k * bayDepth;

    // Vertical wall rib posts
    addSurfaceBox(farmGroup, ghSteelFrameMat, 53.2, yK, 0.3, 0.3, 4.8, 0);
    addSurfaceBox(farmGroup, ghSteelFrameMat, 74.8, yK, 0.3, 0.3, 4.8, 0);

    // Rafters
    const eaveW = surfacePos(53 / RADIUS, yK, 4.8);
    const ridge = surfacePos(64 / RADIUS, yK, 7.0);
    const eaveE = surfacePos(75 / RADIUS, yK, 4.8);

    addWorldBeam(farmGroup, ghSteelFrameMat, eaveW, ridge, 0.16);
    addWorldBeam(farmGroup, ghSteelFrameMat, ridge, eaveE, 0.16);

    // Collar tie truss beam at safe overhead height h = 5.4m
    const tieW = surfacePos(56.5 / RADIUS, yK, 5.4);
    const tieE = surfacePos(71.5 / RADIUS, yK, 5.4);
    addWorldBeam(farmGroup, ghSteelFrameMat, tieW, tieE, 0.12);

    // Vertical king post from collar tie to ridge
    const tieMid = surfacePos(64 / RADIUS, yK, 5.4);
    addWorldBeam(farmGroup, ghSteelFrameMat, tieMid, ridge, 0.12);
  }

  // Ridge beam and eave beams along the full 36m length
  addWorldBeam(
    farmGroup,
    ghSteelFrameMat,
    surfacePos(64 / RADIUS, -232, 7.02),
    surfacePos(64 / RADIUS, -196, 7.02),
    0.18,
  );
  addWorldBeam(
    farmGroup,
    ghSteelFrameMat,
    surfacePos(53 / RADIUS, -232, 4.8),
    surfacePos(53 / RADIUS, -196, 4.8),
    0.16,
  );
  addWorldBeam(
    farmGroup,
    ghSteelFrameMat,
    surfacePos(75 / RADIUS, -232, 4.8),
    surfacePos(75 / RADIUS, -196, 4.8),
    0.16,
  );

  // --- Interior Planter Beds & Hydroponic Crops ---
  // Beds leaving central aisle s[62,66] clear, height ~0.6m
  // 4 large beds separated by a central crossway around y = -214
  const planterBeds = [
    { s: 57.5, y: -223, width: 6.0, depth: 8.5 }, // South-West Bed
    { s: 57.5, y: -205, width: 6.0, depth: 8.5 }, // North-West Bed
    { s: 70.5, y: -223, width: 6.0, depth: 8.5 }, // South-East Bed
    { s: 70.5, y: -205, width: 6.0, depth: 8.5 }, // North-East Bed
  ];

  for (const bed of planterBeds) {
    // Solid collider recorded for bed height 0.6m
    obstacles.push({
      theta: bed.s / RADIUS,
      y: bed.y,
      width: bed.width,
      depth: bed.depth,
      height: 0.6,
    });

    // Cedar retaining planter box
    addSurfaceBox(
      farmGroup,
      cedarPlanterMat,
      bed.s,
      bed.y,
      bed.width,
      bed.depth,
      0.6,
      0,
    );
    // Dark rich soil top
    addSurfaceBox(
      farmGroup,
      richSoilMat,
      bed.s,
      bed.y,
      bed.width - 0.4,
      bed.depth - 0.4,
      0.08,
      0.54,
    );

    // Open trellis, not an opaque panel hiding the vegetables.
    for (const side of [-1, 1]) {
      addSurfaceBox(
        farmGroup,
        ghSteelFrameMat,
        bed.s + side * (bed.width / 2 - 0.4),
        bed.y,
        0.08,
        0.08,
        1.6,
        0.6,
      );
    }
    for (const h of [1.3, 2.15]) {
      addSurfaceBox(
        farmGroup,
        ghSteelFrameMat,
        bed.s,
        bed.y,
        bed.width - 0.8,
        0.08,
        0.08,
        h,
      );
    }
  }

  // Instanced crops inside Greenhouse (Tomatoes on South beds, Lettuce on North beds)
  const ghVegCount = 90;
  // setSurfaceMatrix supplies final dimensions; geometry must have unit bounds.
  const tomatoBushGeo = new THREE.DodecahedronGeometry(1, 0);
  tomatoBushGeo.computeBoundingBox();
  const { min, max } = tomatoBushGeo.boundingBox;
  tomatoBushGeo.scale(
    1 / (max.x - min.x),
    1 / (max.y - min.y),
    1 / (max.z - min.z),
  );
  const tomatoMesh = new THREE.InstancedMesh(
    tomatoBushGeo,
    crispGreensMat,
    ghVegCount,
  );
  const tomatoFruitGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const tomatoFruitMesh = new THREE.InstancedMesh(
    tomatoFruitGeo,
    tomatoFruitMat,
    ghVegCount,
  );

  const mVeg = new THREE.Matrix4();
  let vIdx = 0;
  for (const bed of [planterBeds[0], planterBeds[2]]) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -4; c <= 4; c++) {
        const vS = bed.s + r * 0.9;
        const vY = bed.y + c * 0.85;

        setSurfaceMatrix(mVeg, vS / RADIUS, vY, 0.6, 0.55, 0.55, 0.55);
        tomatoMesh.setMatrixAt(vIdx, mVeg);

        setSurfaceMatrix(
          mVeg,
          (vS + 0.22) / RADIUS,
          vY + 0.1,
          0.86,
          0.18,
          0.18,
          0.18,
        );
        tomatoFruitMesh.setMatrixAt(vIdx, mVeg);
        vIdx++;
      }
    }
  }
  tomatoMesh.count = vIdx;
  tomatoFruitMesh.count = vIdx;
  tomatoMesh.instanceMatrix.needsUpdate = true;
  tomatoFruitMesh.instanceMatrix.needsUpdate = true;
  farmGroup.add(tomatoMesh);
  farmGroup.add(tomatoFruitMesh);

  const lettuceMesh = new THREE.InstancedMesh(
    tomatoBushGeo,
    crispGreensMat,
    ghVegCount,
  );
  let lettuceCount = 0;
  for (const bed of [planterBeds[1], planterBeds[3]]) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -4; c <= 4; c++) {
        setSurfaceMatrix(
          mVeg,
          (bed.s + r * 0.9) / RADIUS,
          bed.y + c * 0.85,
          0.62,
          0.5,
          0.5,
          0.32,
        );
        lettuceMesh.setMatrixAt(lettuceCount++, mVeg);
      }
    }
  }
  lettuceMesh.instanceMatrix.needsUpdate = true;
  farmGroup.add(lettuceMesh);

  // Overhead warm grow-light fixtures (suspended at safe height h = 4.4m > 3.8m)
  for (const bed of planterBeds) {
    addSurfaceBox(farmGroup, growLightMat, bed.s, bed.y, 4.0, 0.4, 0.15, 4.4);
    // Suspension cables
    addWorldBeam(
      farmGroup,
      ghSteelFrameMat,
      surfacePos(bed.s / RADIUS, bed.y, 4.4),
      surfacePos(bed.s / RADIUS, bed.y, 5.6),
      0.04,
    );
  }

  // --- Glasshouse Signs ---
  addSurfaceSign(
    farmGroup,
    "GLASSHOUSE 01\nHYDROPONIC NURSERY",
    64.0,
    -232.4,
    5.4,
    4.0,
  );
  addSurfaceSign(
    farmGroup,
    "GLASSHOUSE 01\nNORTH EXIT -> FIELDS",
    64.0,
    -195.6,
    5.4,
    4.0,
  );

  // ==========================================
  // 4. OUTSIDE CROP PLOTS (s in [86, 132], y in [-274, -145])
  // ==========================================
  // Earth plots
  addSurfacePatch(farmGroup, soilFurrowMat, 109, -263.5, 44, 21.0, 0.06);
  addSurfacePatch(farmGroup, soilFurrowMat, 109, -210.0, 44, 60.0, 0.06);
  addSurfacePatch(farmGroup, soilFurrowMat, 109, -157.5, 44, 23.0, 0.06);

  // Central Irrigation Canal (s = 109.5, y from -274 to -145)
  addSurfacePatch(farmGroup, canalWaterMat, 109.5, -209.5, 1.6, 129.0, 0.065);
  // Canal Stone Edges
  addSurfaceBox(farmGroup, stoneTrimMat, 108.6, -209.5, 0.3, 129.0, 0.16, 0);
  addSurfaceBox(farmGroup, stoneTrimMat, 110.4, -209.5, 0.3, 129.0, 0.16, 0);

  // Canal-side Walking Footpath (s = 106.5)
  addSurfacePatch(farmGroup, pathPavingMat, 106.5, -209.5, 2.2, 129.0, 0.07);
  // East Perimeter Field Track (s = 132.5)
  addSurfacePatch(farmGroup, pathPavingMat, 132.5, -209.5, 2.4, 129.0, 0.07);

  // Bridges / Covered Crossings over Irrigation Canal (height 0.12m <= 0.25m step height)
  // Bridge 1: Service Road at y = -246
  addSurfaceBox(farmGroup, woodBridgeMat, 109.5, -246, 3.6, 5.0, 0.12, 0);
  addSurfaceBox(farmGroup, shedWallMat, 107.6, -246, 0.2, 5.0, 0.22, 0.12);
  addSurfaceBox(farmGroup, shedWallMat, 111.4, -246, 0.2, 5.0, 0.22, 0.12);

  // Bridge 2: Mid-field crossing at y = -210 with covered timber arch pergola (overhead > 3.8m)
  addSurfaceBox(farmGroup, woodBridgeMat, 109.5, -210, 3.6, 3.2, 0.12, 0);
  addSurfaceBox(farmGroup, shedWallMat, 107.6, -210, 0.2, 3.2, 0.22, 0.12);
  addSurfaceBox(farmGroup, shedWallMat, 111.4, -210, 0.2, 3.2, 0.22, 0.12);
  // Pergola posts & canopy
  addSurfaceBox(farmGroup, shedTrimMat, 107.8, -211.2, 0.18, 0.18, 4.0, 0);
  addSurfaceBox(farmGroup, shedTrimMat, 107.8, -208.8, 0.18, 0.18, 4.0, 0);
  addSurfaceBox(farmGroup, shedTrimMat, 111.2, -211.2, 0.18, 0.18, 4.0, 0);
  addSurfaceBox(farmGroup, shedTrimMat, 111.2, -208.8, 0.18, 0.18, 4.0, 0);
  addSurfaceBox(farmGroup, shedTrimMat, 109.5, -210.0, 3.8, 2.6, 0.15, 4.0);

  // Bridge 3: North Crosslane at y = -174
  addSurfaceBox(farmGroup, woodBridgeMat, 109.5, -174, 3.6, 5.0, 0.12, 0);
  addSurfaceBox(farmGroup, shedWallMat, 107.6, -174, 0.2, 5.0, 0.22, 0.12);
  addSurfaceBox(farmGroup, shedWallMat, 111.4, -174, 0.2, 5.0, 0.22, 0.12);
  for (const [y, depth] of [
    [-246, 5],
    [-210, 3.2],
    [-174, 5],
  ]) {
    obstacles.push({
      theta: 109.5 / RADIUS,
      y,
      width: 3.6,
      depth,
      height: 0.12,
    });
  }

  // --- Low Instanced Crop Geometry (Golden Grain & Crisp Greens) ---
  // Golden grain cluster geometry
  const wheatGeo = new THREE.BoxGeometry(1, 1, 1);
  const maxWheat = 1200;
  const wheatMesh = new THREE.InstancedMesh(wheatGeo, goldenGrainMat, maxWheat);

  // Crisp greens (cabbage/chard) rosette geometry
  const maxGreens = 1200;
  const greensMesh = new THREE.InstancedMesh(
    tomatoBushGeo,
    crispGreensMat,
    maxGreens,
  );

  // Tall crop geometry
  const maxTall = 800;
  const tallMesh = new THREE.InstancedMesh(wheatGeo, tallCropMat, maxTall);

  let wheatCount = 0;
  let greensCount = 0;
  let tallCount = 0;
  const mCrop = new THREE.Matrix4();

  // Populate Field Rows
  // Sector 1: South (y in [-272, -253])
  // West side: Golden Wheat
  for (let sP = 88.5; sP <= 104.5; sP += 1.6) {
    for (let yP = -272; yP <= -253; yP += 1.2) {
      if (wheatCount < maxWheat) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.5, 0.5, 0.85);
        wheatMesh.setMatrixAt(wheatCount++, mCrop);
      }
    }
  }
  // East side: Crisp Greens
  for (let sP = 113.5; sP <= 129.5; sP += 1.6) {
    for (let yP = -272; yP <= -253; yP += 1.2) {
      if (greensCount < maxGreens) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.55, 0.55, 0.35);
        greensMesh.setMatrixAt(greensCount++, mCrop);
      }
    }
  }

  // Sector 2: Middle (y in [-239, -181])
  // West side South: Greens
  for (let sP = 88.5; sP <= 104.5; sP += 1.6) {
    for (let yP = -239; yP <= -214; yP += 1.2) {
      if (greensCount < maxGreens) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.55, 0.55, 0.35);
        greensMesh.setMatrixAt(greensCount++, mCrop);
      }
    }
  }
  // West side North: Golden Wheat
  for (let sP = 88.5; sP <= 104.5; sP += 1.6) {
    for (let yP = -206; yP <= -181; yP += 1.2) {
      if (wheatCount < maxWheat) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.5, 0.5, 0.85);
        wheatMesh.setMatrixAt(wheatCount++, mCrop);
      }
    }
  }
  // East side South: Tall Crops (Maize)
  for (let sP = 113.5; sP <= 129.5; sP += 1.6) {
    for (let yP = -239; yP <= -214; yP += 1.3) {
      if (tallCount < maxTall) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.45, 0.45, 1.45);
        tallMesh.setMatrixAt(tallCount++, mCrop);
      }
    }
  }
  // East side North: Greens
  for (let sP = 113.5; sP <= 129.5; sP += 1.6) {
    for (let yP = -206; yP <= -181; yP += 1.2) {
      if (greensCount < maxGreens) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.55, 0.55, 0.35);
        greensMesh.setMatrixAt(greensCount++, mCrop);
      }
    }
  }

  // Sector 3: North (y in [-166, -149])
  // West side: Golden Wheat
  for (let sP = 88.5; sP <= 104.5; sP += 1.6) {
    for (let yP = -166; yP <= -149; yP += 1.2) {
      if (wheatCount < maxWheat) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.5, 0.5, 0.85);
        wheatMesh.setMatrixAt(wheatCount++, mCrop);
      }
    }
  }
  // East side: Tall Crops
  for (let sP = 113.5; sP <= 129.5; sP += 1.6) {
    for (let yP = -166; yP <= -149; yP += 1.3) {
      if (tallCount < maxTall) {
        setSurfaceMatrix(mCrop, sP / RADIUS, yP, 0, 0.45, 0.45, 1.45);
        tallMesh.setMatrixAt(tallCount++, mCrop);
      }
    }
  }

  wheatMesh.count = wheatCount;
  greensMesh.count = greensCount;
  tallMesh.count = tallCount;
  wheatMesh.instanceMatrix.needsUpdate = true;
  greensMesh.instanceMatrix.needsUpdate = true;
  tallMesh.instanceMatrix.needsUpdate = true;

  farmGroup.add(wheatMesh);
  farmGroup.add(greensMesh);
  farmGroup.add(tallMesh);

  // Sector Direction Signs
  addSurfaceSign(
    farmGroup,
    "SECTOR E CROPS\nGRAIN & BRASSICA PLOTS",
    88.0,
    -248.6,
    4.8,
    2.4,
  );
  addSurfaceSign(
    farmGroup,
    "CROSS-DISTRICT LANE\n<- VILLAGE  |  EAST CROPS ->",
    64.0,
    -171.4,
    5.0,
    2.4,
  );
  addSurfaceSign(
    farmGroup,
    "GREENWAY AGRI-ZONE\n-> GLASSHOUSE 01 & FIELDS",
    37.0,
    -248.6,
    4.8,
    2.4,
  );

  // ==========================================
  // 5. FARM UTILITY SHED, WATER PUMP & MACHINERY (s in [36, 48], y in [-150, -125])
  // ==========================================
  // A. Solid Farm Utility Shed (center s = 42, y = -135, width = 8.5, depth = 11.0, height = 5.2)
  obstacles.push({
    theta: 42.0 / RADIUS,
    y: -135.0,
    width: 8.5,
    depth: 11.0,
    height: 5.2,
  });

  // Shed main body
  addSurfaceBox(farmGroup, shedWallMat, 42.0, -135.0, 8.5, 11.0, 3.8, 0);
  // Pitched Corrugated Teal Roof (base = 3.8, height = 1.4)
  addSurfaceBox(
    farmGroup,
    shedCorrugatedRoofMat,
    42.0,
    -135.0,
    9.2,
    11.6,
    1.4,
    3.8,
  );

  // Sliding Barn Doors on East Facade (s = 46.3, y = -135)
  addSurfaceBox(farmGroup, shedTrimMat, 46.3, -135.0, 0.12, 3.4, 2.6, 0);
  addSurfaceBox(
    farmGroup,
    galvanizedSteelMat,
    46.3,
    -135.0,
    0.18,
    3.8,
    0.15,
    2.7,
  );

  // Window Frames on South and North walls
  addSurfaceBox(farmGroup, shedTrimMat, 42.0, -140.55, 2.0, 0.12, 1.4, 1.6);
  addSurfaceBox(farmGroup, ghGlassMat, 42.0, -140.55, 1.8, 0.08, 1.2, 1.7);
  addSurfaceBox(farmGroup, shedTrimMat, 42.0, -129.45, 2.0, 0.12, 1.4, 1.6);
  addSurfaceBox(farmGroup, ghGlassMat, 42.0, -129.45, 1.8, 0.08, 1.2, 1.7);

  // Exterior wall lantern with warm glow
  addSurfaceBox(farmGroup, brassFittingMat, 46.4, -133.0, 0.2, 0.2, 0.35, 3.0);
  addSurfaceBox(farmGroup, growLightMat, 46.45, -133.0, 0.12, 0.12, 0.15, 2.9);

  // B. Water Storage Tank & Heavy Feed Lines (s = 39, y = -146)
  obstacles.push({
    theta: 39.0 / RADIUS,
    y: -146.0,
    width: 3.8,
    depth: 3.8,
    height: 4.8,
  });

  // Concrete Base Plinth
  addSurfaceBox(farmGroup, stoneTrimMat, 39.0, -146.0, 3.8, 3.8, 0.45, 0);
  // Cylindrical Tank (width 3.4, depth 3.4, height 3.6, base 0.45)
  addSurfaceBox(farmGroup, waterTankMat, 39.0, -146.0, 3.4, 3.4, 3.6, 0.45);
  // Tank Roof Cap
  addSurfaceBox(
    farmGroup,
    galvanizedSteelMat,
    39.0,
    -146.0,
    3.6,
    3.6,
    0.4,
    4.05,
  );
  // Water level indicator sight tube on south face
  addSurfaceBox(
    farmGroup,
    brassFittingMat,
    39.0,
    -147.75,
    0.15,
    0.12,
    3.0,
    0.7,
  );

  // C. High-Pressure Irrigation Pump Station (s = 43.5, y = -146)
  obstacles.push({
    theta: 43.5 / RADIUS,
    y: -146.0,
    width: 2.2,
    depth: 2.0,
    height: 1.75,
  });

  // Concrete Equipment Pad
  addSurfaceBox(farmGroup, stoneTrimMat, 43.5, -146.0, 2.2, 2.0, 0.25, 0);
  // Cast Machinery Pump Housing
  addSurfaceBox(
    farmGroup,
    castMachineryGreenMat,
    43.5,
    -146.0,
    1.6,
    1.4,
    1.4,
    0.25,
  );
  // Brass Valves & Flanged Manifold
  addSurfaceBox(farmGroup, brassFittingMat, 43.5, -145.2, 1.8, 0.2, 0.25, 0.8);
  addSurfaceBox(
    farmGroup,
    brassFittingMat,
    43.5,
    -146.8,
    0.25,
    0.25,
    0.6,
    1.65,
  );

  // Animated Pump Indicators (Impeller & Pulsing Status LED)
  const thetaPump = 43.5 / RADIUS;
  const pumpGroup = new THREE.Group();
  pumpGroup.position.copy(surfacePos(thetaPump, -146.0, 1.65));
  pumpGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -thetaPump);
  farmGroup.add(pumpGroup);

  // Spinning flow impeller
  const impellerGeo = new THREE.BoxGeometry(0.24, 0.04, 0.14);
  const flowImpellerMesh = new THREE.Mesh(impellerGeo, brassFittingMat);
  flowImpellerMesh.userData.atmosphereDynamic = true;
  flowImpellerMesh.position.set(0, 0, 0.1);
  pumpGroup.add(flowImpellerMesh);

  // Pulsing status LED
  const pumpLedMat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00d4b0,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  const pumpLedMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    pumpLedMat,
  );
  pumpLedMesh.position.set(0.4, -0.6, 0.05);
  pumpGroup.add(pumpLedMesh);

  // D. Modest Agricultural Service Cart with wheels & cargo (s = 45, y = -128)
  obstacles.push({
    theta: 45.0 / RADIUS,
    y: -128.0,
    width: 2.2,
    depth: 4.0,
    height: 1.5,
  });

  // Cart local group
  const thetaCart = 45.0 / RADIUS;
  const cartGroup = new THREE.Group();
  cartGroup.position.copy(surfacePos(thetaCart, -128.0, 0));
  cartGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -thetaCart);
  farmGroup.add(cartGroup);

  // Flatbed timber deck
  const cartDeck = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 3.8, 0.18),
    wagonWoodMat,
  );
  cartDeck.position.set(0, 0, 0.65);
  cartGroup.add(cartDeck);

  // Side rails
  const railL = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 3.8, 0.35),
    shedTrimMat,
  );
  railL.position.set(-0.95, 0, 0.85);
  const railR = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 3.8, 0.35),
    shedTrimMat,
  );
  railR.position.set(0.95, 0, 0.85);
  cartGroup.add(railL);
  cartGroup.add(railR);

  // 4 Spoked wagon wheels
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelPositions = [
    [-1.05, -1.3, 0.45],
    [1.05, -1.3, 0.45],
    [-1.05, 1.3, 0.45],
    [1.05, 1.3, 0.45],
  ];
  for (const [wX, wY, wZ] of wheelPositions) {
    const wMesh = new THREE.Mesh(wheelGeo, rubberTireMat);
    wMesh.position.set(wX, wY, wZ);
    cartGroup.add(wMesh);
  }

  // Loaded cargo crates on cart
  const crateGeo = new THREE.BoxGeometry(0.7, 0.9, 0.5);
  const crateOffsets = [
    [-0.45, -0.6, 0.95],
    [0.45, -0.6, 0.95],
    [-0.45, 0.4, 0.95],
    [0.45, 0.4, 0.95],
    [0.0, -0.1, 1.45],
  ];
  for (const [cX, cY, cZ] of crateOffsets) {
    const cMesh = new THREE.Mesh(crateGeo, crateWoodMat);
    cMesh.position.set(cX, cY, cZ);
    cartGroup.add(cMesh);
  }

  // E. Storage Pallets & Crates Area (s = 38, y = -127)
  obstacles.push({
    theta: 38.0 / RADIUS,
    y: -127.0,
    width: 1.8,
    depth: 2.2,
    height: 1.2,
  });
  addSurfaceBox(farmGroup, wagonWoodMat, 38.0, -127.0, 1.8, 2.2, 0.15, 0);
  addSurfaceBox(farmGroup, crateWoodMat, 37.6, -127.4, 0.8, 0.9, 0.55, 0.15);
  addSurfaceBox(farmGroup, crateWoodMat, 38.4, -127.4, 0.8, 0.9, 0.55, 0.15);
  addSurfaceBox(farmGroup, crateWoodMat, 38.0, -126.6, 0.8, 0.9, 0.55, 0.15);
  addSurfaceBox(farmGroup, crateWoodMat, 38.0, -127.0, 0.8, 0.9, 0.5, 0.7);

  // Utility yard sign
  addSurfaceSign(
    farmGroup,
    "FARM UTILITY YARD\nPUMP STA. 03 & WORKSHOP",
    42.0,
    -148.8,
    4.6,
    2.4,
  );

  // ==========================================
  // 6. ANIMATED WIND ROTOR (AEOLIAN WIND PUMP / AERATOR)
  // ==========================================
  // Location: s = 42, y = -121 (at north end of utility yard, high above ground, far from aisles)
  obstacles.push({
    theta: 42.0 / RADIUS,
    y: -121.0,
    width: 2.4,
    depth: 2.4,
    height: 12.0,
  });

  const thetaRotor = 42.0 / RADIUS;
  const windTowerGroup = new THREE.Group();
  windTowerGroup.position.copy(surfacePos(thetaRotor, -121.0, 0));
  windTowerGroup.quaternion.setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -thetaRotor,
  );
  farmGroup.add(windTowerGroup);

  // 4 Tapered lattice tower legs (Base 2.4m, Top 0.9m, Height 11.2m)
  const towerHeight = 11.2;
  const legGeo = new THREE.CylinderGeometry(0.06, 0.08, towerHeight, 6);
  legGeo.rotateX(Math.PI / 2); // default along Z
  const legCorners = [
    [-1.1, -1.1, -0.4, -0.4],
    [1.1, -1.1, 0.4, -0.4],
    [1.1, 1.1, 0.4, 0.4],
    [-1.1, 1.1, -0.4, 0.4],
  ];

  for (const [bx, by, tx, ty] of legCorners) {
    const pBot = new THREE.Vector3(bx, by, 0);
    const pTop = new THREE.Vector3(tx, ty, towerHeight);
    const legDir = new THREE.Vector3().subVectors(pTop, pBot);
    const legLen = legDir.length();
    const legMid = new THREE.Vector3()
      .addVectors(pBot, pTop)
      .multiplyScalar(0.5);

    const legMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, legLen),
      galvanizedSteelMat,
    );
    legMesh.position.copy(legMid);
    legMesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      legDir.clone().normalize(),
    );
    windTowerGroup.add(legMesh);
  }

  // Intermediate cross-bracing struts
  for (const hFrac of [3.5, 7.0, 10.2]) {
    const scale = 1.0 - (hFrac / towerHeight) * 0.65;
    const wStrut = 2.2 * scale;
    const braceX1 = new THREE.Mesh(
      new THREE.BoxGeometry(wStrut, 0.08, 0.08),
      galvanizedSteelMat,
    );
    braceX1.position.set(0, -wStrut / 2, hFrac);
    const braceX2 = new THREE.Mesh(
      new THREE.BoxGeometry(wStrut, 0.08, 0.08),
      galvanizedSteelMat,
    );
    braceX2.position.set(0, wStrut / 2, hFrac);
    const braceY1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, wStrut, 0.08),
      galvanizedSteelMat,
    );
    braceY1.position.set(-wStrut / 2, 0, hFrac);
    const braceY2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, wStrut, 0.08),
      galvanizedSteelMat,
    );
    braceY2.position.set(wStrut / 2, 0, hFrac);

    windTowerGroup.add(braceX1);
    windTowerGroup.add(braceX2);
    windTowerGroup.add(braceY1);
    windTowerGroup.add(braceY2);
  }

  // Top Maintenance Platform & Nacelle
  const platformMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.4, 0.12),
    galvanizedSteelMat,
  );
  platformMesh.position.set(0, 0, towerHeight);
  windTowerGroup.add(platformMesh);

  // Machinery nacelle (generator / pump hub)
  const nacelleMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.6, 0.8),
    castMachineryGreenMat,
  );
  nacelleMesh.position.set(0, 0, towerHeight + 0.55);
  windTowerGroup.add(nacelleMesh);

  // Directional Tail Rudder Vane
  const tailGroup = new THREE.Group();
  tailGroup.userData.atmosphereDynamic = true;
  tailGroup.position.set(0, 0.8, towerHeight + 0.55);
  windTowerGroup.add(tailGroup);

  const tailBoom = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 2.2, 0.08),
    galvanizedSteelMat,
  );
  tailBoom.position.set(0, 1.1, 0);
  tailGroup.add(tailBoom);

  const rudderFin = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 1.4, 1.1),
    shedTrimMat,
  );
  rudderFin.position.set(0, 1.8, 0.25);
  tailGroup.add(rudderFin);

  // Rotor Assembly (Multi-blade Aerator)
  const rotorGroup = new THREE.Group();
  rotorGroup.userData.atmosphereDynamic = true;
  // Rotor hub sits on south face of nacelle (facing approaching wind along axis)
  rotorGroup.position.set(0, -0.9, towerHeight + 0.55);
  windTowerGroup.add(rotorGroup);

  // Hub nose cone
  const hubCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.26, 0.35, 12),
    brassFittingMat,
  );
  hubCone.rotateX(-Math.PI / 2);
  rotorGroup.add(hubCone);

  // 12 Aerodynamic blades with twist angle
  const numBlades = 12;
  const bladeGeo = new THREE.BoxGeometry(0.2, 0.03, 1.8);
  for (let b = 0; b < numBlades; b++) {
    const angle = (b * Math.PI * 2) / numBlades;
    const bladeMesh = new THREE.Mesh(bladeGeo, galvanizedSteelMat);
    // Position blade extending outward from hub
    bladeMesh.position.set(Math.sin(angle) * 1.05, 0, Math.cos(angle) * 1.05);
    // Rotate blade around local Y (facing axis) and slight aerodynamic pitch
    bladeMesh.rotation.y = -angle;
    bladeMesh.rotation.z = 0.25;
    rotorGroup.add(bladeMesh);
  }

  // Outer reinforcing hoop ring
  const hoopGeo = new THREE.TorusGeometry(2.0, 0.03, 8, 32);
  const hoopMesh = new THREE.Mesh(hoopGeo, galvanizedSteelMat);
  hoopMesh.rotateX(Math.PI / 2);
  rotorGroup.add(hoopMesh);

  // ==========================================
  // 7. REAL-TIME ANIMATION UPDATE
  // ==========================================
  function update(dt, elapsed) {
    const delta = dt || 0;
    const time = elapsed || 0;

    // A. Wind Rotor continuous rotation
    // In windTowerGroup coordinates:
    // Rotor faces -Y. Rotation around local Y spins the rotor wheel!
    rotorGroup.rotation.y += delta * 2.2;

    // B. Tail vane gentle atmospheric yaw drift
    tailGroup.rotation.z = Math.sin(time * 0.8) * 0.06;

    // C. Irrigation Pump Flow Impeller spinning
    flowImpellerMesh.rotation.z += delta * 4.5;

    // D. Irrigation Pump Status LED pulsing
    pumpLedMesh.material.emissiveIntensity = 1.0 + 0.6 * Math.sin(time * 4.2);
  }

  return {
    obstacles,
    update,
  };
}
