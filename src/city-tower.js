import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import {
  addCivicBlock,
  addCivicSolid,
  createFacadeMaterial,
} from "./civic-primitives.js";
import { addSurfaceSign, surfacePos } from "./surface.js";
import { TOWER } from "./city-layout.js";

/**
 * Hollow tower lobby, 42 m Skyroom, and 9 m public skywalk.
 * Solid prisms use explicit underside bases so streets remain walkable below.
 */
export function createCityTower(parent) {
  const obstacles = [];
  const skyroomFloor = TOWER.observationHeight;
  const skyroomSlabHeight = 0.4;
  const skyroomSlabBase = skyroomFloor - skyroomSlabHeight;
  const skyroomWallHeight = 5.5;
  const skyroomRoofBase = skyroomFloor + skyroomWallHeight;

  function registerSolid(s, y, width, depth, height, base = 0) {
    obstacles.push({
      theta: s / RADIUS,
      y,
      width,
      depth,
      height,
      base,
    });
  }

  // =========================================================================
  // SHARED MATERIALS (Ultra-low draw call budget, authored civic palette)
  // =========================================================================
  const facadeMat = createFacadeMaterial("#334148", "#8ed5e3", 12, 18);
  const facadeTierMat = createFacadeMaterial("#29353b", "#a1e5f0", 8, 12);

  const stoneWallMat = new THREE.MeshStandardMaterial({
    color: 0x48565e,
    roughness: 0.76,
    metalness: 0.12,
  });

  const lobbyFloorMat = new THREE.MeshStandardMaterial({
    color: 0x222a2f,
    roughness: 0.52,
    metalness: 0.2,
  });

  const skyroomFloorMat = new THREE.MeshStandardMaterial({
    color: 0x28343b,
    roughness: 0.55,
    metalness: 0.18,
  });

  const skywalkDeckMat = new THREE.MeshStandardMaterial({
    color: 0x404e54,
    roughness: 0.7,
    metalness: 0.16,
  });

  const metalFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1b2327,
    roughness: 0.38,
    metalness: 0.68,
  });

  const railingMat = new THREE.MeshStandardMaterial({
    color: 0x68afa6,
    roughness: 0.32,
    metalness: 0.48,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x94d6e4,
    roughness: 0.1,
    metalness: 0.85,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });

  const liftGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf5ead0,
    emissive: 0x6e5828,
    roughness: 0.3,
  });

  const spireMat = new THREE.MeshStandardMaterial({
    color: 0xddeef5,
    roughness: 0.22,
    metalness: 0.88,
  });

  const benchWoodMat = new THREE.MeshStandardMaterial({
    color: 0x765f46,
    roughness: 0.68,
    metalness: 0.08,
  });

  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x3a664c,
    roughness: 0.82,
    metalness: 0.05,
  });

  // =========================================================================
  // SCENE GRAPH HIERARCHY
  // =========================================================================
  const towerRoot = new THREE.Group();
  towerRoot.name = "civic_tower_root";
  parent.add(towerRoot);

  const lobbyGroup = new THREE.Group();
  lobbyGroup.name = "civic_tower_lobby";
  towerRoot.add(lobbyGroup);

  const bodyGroup = new THREE.Group();
  bodyGroup.name = "civic_tower_body";
  towerRoot.add(bodyGroup);

  const skyroomGroup = new THREE.Group();
  skyroomGroup.name = "civic_tower_skyroom";
  towerRoot.add(skyroomGroup);

  const crownGroup = new THREE.Group();
  crownGroup.name = "civic_tower_crown";
  towerRoot.add(crownGroup);

  const skywalkGroup = new THREE.Group();
  skywalkGroup.name = "civic_skywalk";
  towerRoot.add(skywalkGroup);

  // =========================================================================
  // 1. TOWER GROUND LOBBY (Center s = 48, y = 35, width 26, depth 26, height 5.5)
  // =========================================================================
  // Smooth lobby floor paving (h <= 0.08 m)
  addCivicBlock(lobbyGroup, lobbyFloorMat, 48.0, 35.0, 26.0, 26.0, 0.05, 0.0);

  // South Wall (y = 22.0): Split around 6.0 m wide central entrance (s in [45, 51])
  // West south wall segment (s in [35, 45]): center s = 40, width 10, depth 0.8, height 5.5
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 40.0, 22.0, 10.0, 0.8, 5.5, 0.0);

  // East south wall segment (s in [51, 61]): center s = 56, width 10, depth 0.8, height 5.5
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 56.0, 22.0, 10.0, 0.8, 5.5, 0.0);

  // South entrance overhead lintel: s in [45, 51], base 4.2 m, height 1.3 m (top 5.5 m)
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 48.0, 22.0, 6.0, 0.8, 1.3, 4.2);

  // South entrance architectural portal columns (clear 6 m gateway between them)
  addCivicSolid(lobbyGroup, metalFrameMat, obstacles, 44.7, 21.6, 0.6, 0.6, 4.2, 0.0);
  addCivicSolid(lobbyGroup, metalFrameMat, obstacles, 51.3, 21.6, 0.6, 0.6, 4.2, 0.0);

  // Entrance marquee canopy: base 4.2 m, height 0.3 m
  addCivicSolid(lobbyGroup, metalFrameMat, obstacles, 48.0, 21.3, 7.6, 1.6, 0.3, 4.2);

  // Entrance sign over doorway
  addSurfaceSign(
    lobbyGroup,
    "MERIDIAN CIVIC TOWER\nMAIN LOBBY & SKYROOM ACCESS",
    48.0,
    21.1,
    5.8,
    4.5,
  );

  // North Wall (y = 48.0): Solid back wall, width 26, depth 0.8, height 5.5
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 48.0, 48.0, 26.0, 0.8, 5.5, 0.0);

  // West Wall (s = 35.0): Solid side wall, width 0.8, depth 26, height 5.5
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 35.0, 35.0, 0.8, 26.0, 5.5, 0.0);

  // East Wall (s = 61.0): Solid side wall, width 0.8, depth 26, height 5.5
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 61.0, 35.0, 0.8, 26.0, 5.5, 0.0);

  // Glazed accent panels along the south lobby facade
  addCivicBlock(lobbyGroup, glassMat, 40.0, 22.0, 8.0, 0.2, 3.4, 0.8);
  addCivicBlock(lobbyGroup, glassMat, 56.0, 22.0, 8.0, 0.2, 3.4, 0.8);

  // -------------------------------------------------------------------------
  // Main Lift at Ground Lobby: Anchor s = 48, y = 35 (height 0)
  // Direct unobstructed walk from doorway (48, 22) straight to (48, 35).
  // -------------------------------------------------------------------------
  // Rear shaft service wall (north of lift anchor at y = 37.2)
  addCivicSolid(lobbyGroup, metalFrameMat, obstacles, 48.0, 37.2, 4.4, 0.6, 5.5, 0.0);

  // West and East guide shaft piers (leaving 4.6 m wide clear space between them)
  addCivicSolid(lobbyGroup, metalFrameMat, obstacles, 45.4, 35.2, 0.6, 0.8, 5.5, 0.0);
  addCivicSolid(lobbyGroup, metalFrameMat, obstacles, 50.6, 35.2, 0.6, 0.8, 5.5, 0.0);

  // Lift floor threshold indicator pad
  addCivicBlock(lobbyGroup, liftGlowMat, 48.0, 35.0, 2.4, 2.4, 0.02, 0.04);

  // Visible control sign facing approaching visitors from the south
  addSurfaceSign(
    lobbyGroup,
    "EXPRESS LIFT\n[E] TO SKYROOM · 42m",
    48.0,
    36.8,
    3.8,
    2.2,
  );

  // Lobby Non-Shadow PointLight (height 3.5 m, range 18, intensity 15)
  const lobbyLight = new THREE.PointLight(0xffeed8, 15, 18, 1.2);
  lobbyLight.name = "civic_tower_lobby_light";
  lobbyLight.position.copy(surfacePos(48.0 / RADIUS, 35.0, 3.5));
  lobbyLight.castShadow = false;
  lobbyGroup.add(lobbyLight);

  // -------------------------------------------------------------------------
  // Lobby Furnishings (Positioned along perimeter, leaving corridor clear)
  // -------------------------------------------------------------------------
  // West Information / Concierge desk
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 39.0, 30.0, 4.2, 1.4, 1.1, 0.0);

  // East Waiting Lounge Benches
  addCivicSolid(lobbyGroup, benchWoodMat, obstacles, 57.0, 30.0, 1.4, 4.2, 0.5, 0.0);

  // Corner Architectural Planters
  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 38.0, 44.0, 2.2, 2.2, 0.8, 0.0);
  addCivicBlock(lobbyGroup, foliageMat, 38.0, 44.0, 1.8, 1.8, 0.4, 0.8);

  addCivicSolid(lobbyGroup, stoneWallMat, obstacles, 58.0, 44.0, 2.2, 2.2, 0.8, 0.0);
  addCivicBlock(lobbyGroup, foliageMat, 58.0, 44.0, 1.8, 1.8, 0.4, 0.8);

  // =========================================================================
  // 2. TOWER MIDDLE BODY (Ends under the finished observation floor)
  // =========================================================================
  // Keep this cap below the slab: overlapping curved meshes would z-fight.
  addCivicSolid(
    bodyGroup,
    facadeMat,
    obstacles,
    48.0,
    35.0,
    26.0,
    26.0,
    skyroomSlabBase - 5.5,
    5.5,
  );

  // Lobby ceiling transition plinth band
  addCivicSolid(bodyGroup, stoneWallMat, obstacles, 48.0, 35.0, 26.6, 26.6, 0.6, 5.2);

  // Mid-tier Cornice 1 at height 20 m (reveals and shadows)
  addCivicSolid(bodyGroup, stoneWallMat, obstacles, 48.0, 35.0, 26.8, 26.8, 0.8, 19.6);

  // Mid-tier Cornice 2 at height 32 m
  addCivicSolid(bodyGroup, stoneWallMat, obstacles, 48.0, 35.0, 26.5, 26.5, 0.8, 31.6);

  // Four corner vertical buttress piers (articulating the silhouette)
  addCivicSolid(
    bodyGroup,
    stoneWallMat,
    obstacles,
    35.2,
    22.2,
    1.4,
    1.4,
    skyroomFloor - 5.5,
    5.5,
  );

  addCivicSolid(
    bodyGroup,
    stoneWallMat,
    obstacles,
    60.8,
    22.2,
    1.4,
    1.4,
    skyroomFloor - 5.5,
    5.5,
  );

  addCivicSolid(
    bodyGroup,
    stoneWallMat,
    obstacles,
    35.2,
    47.8,
    1.4,
    1.4,
    skyroomFloor - 5.5,
    5.5,
  );

  addCivicSolid(
    bodyGroup,
    stoneWallMat,
    obstacles,
    60.8,
    47.8,
    1.4,
    1.4,
    skyroomFloor - 5.5,
    5.5,
  );

  // =========================================================================
  // 3. SKYROOM OBSERVATION LOUNGE (Height 42.0 m to 47.5 m)
  // =========================================================================
  // Interior finished floor slab: top at observationHeight
  addCivicSolid(
    skyroomGroup,
    skyroomFloorMat,
    obstacles,
    48.0,
    35.0,
    24.0,
    24.0,
    skyroomSlabHeight,
    skyroomSlabBase,
  );

  // -------------------------------------------------------------------------
  // Glazed Perimeter Walls with Structural Frames & Colliders (base observationHeight)
  // Prevents the actor from falling through floor or outside the glass.
  // -------------------------------------------------------------------------
  // South glazed wall (y = 23.0, width 24, depth 0.6)
  addCivicBlock(skyroomGroup, glassMat, 48.0, 23.0, 24.0, 0.2, skyroomWallHeight, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 48.0, 23.0, 24.0, 0.6, 0.5, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 48.0, 23.0, 24.0, 0.6, 0.5, skyroomRoofBase - 0.5);
  registerSolid(48.0, 23.0, 24.0, 0.6, skyroomWallHeight, skyroomFloor);

  // North glazed wall (y = 47.0, width 24, depth 0.6)
  addCivicBlock(skyroomGroup, glassMat, 48.0, 47.0, 24.0, 0.2, skyroomWallHeight, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 48.0, 47.0, 24.0, 0.6, 0.5, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 48.0, 47.0, 24.0, 0.6, 0.5, skyroomRoofBase - 0.5);
  registerSolid(48.0, 47.0, 24.0, 0.6, skyroomWallHeight, skyroomFloor);

  // West glazed wall (s = 36.0, width 0.6, depth 24)
  addCivicBlock(skyroomGroup, glassMat, 36.0, 35.0, 0.2, 24.0, skyroomWallHeight, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 36.0, 35.0, 0.6, 24.0, 0.5, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 36.0, 35.0, 0.6, 24.0, 0.5, skyroomRoofBase - 0.5);
  registerSolid(36.0, 35.0, 0.6, 24.0, skyroomWallHeight, skyroomFloor);

  // East glazed wall (s = 60.0, width 0.6, depth 24)
  addCivicBlock(skyroomGroup, glassMat, 60.0, 35.0, 0.2, 24.0, skyroomWallHeight, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 60.0, 35.0, 0.6, 24.0, 0.5, skyroomFloor);
  addCivicBlock(skyroomGroup, metalFrameMat, 60.0, 35.0, 0.6, 24.0, 0.5, skyroomRoofBase - 0.5);
  registerSolid(60.0, 35.0, 0.6, 24.0, skyroomWallHeight, skyroomFloor);

  // -------------------------------------------------------------------------
  // Main Lift at Skyroom: Anchor s = 48, y = 35 (height observationHeight)
  // Full-body space clear around actor center.
  // -------------------------------------------------------------------------
  // Rear shaft service wall (north of lift anchor at y = 37.2)
  addCivicSolid(
    skyroomGroup,
    metalFrameMat,
    obstacles,
    48.0,
    37.2,
    4.4,
    0.6,
    skyroomWallHeight,
    skyroomFloor,
  );

  // West and East guide shaft piers
  addCivicSolid(
    skyroomGroup,
    metalFrameMat,
    obstacles,
    45.4,
    35.2,
    0.6,
    0.8,
    skyroomWallHeight,
    skyroomFloor,
  );
  addCivicSolid(
    skyroomGroup,
    metalFrameMat,
    obstacles,
    50.6,
    35.2,
    0.6,
    0.8,
    skyroomWallHeight,
    skyroomFloor,
  );

  // Lift floor threshold indicator pad
  addCivicBlock(skyroomGroup, liftGlowMat, 48.0, 35.0, 2.4, 2.4, 0.02, skyroomFloor + 0.02);

  // Return lift sign
  addSurfaceSign(
    skyroomGroup,
    "EXPRESS LIFT\n[E] TO LOBBY · 0m",
    48.0,
    36.8,
    3.8,
    skyroomFloor + 1.8,
  );

  // Skyroom Non-Shadow PointLight (height observationHeight + 3.5 m, range 18, intensity 16)
  const skyroomLight = new THREE.PointLight(0xe2f4fa, 16, 18, 1.2);
  skyroomLight.name = "civic_tower_skyroom_light";
  skyroomLight.position.copy(surfacePos(48.0 / RADIUS, 35.0, skyroomFloor + 3.5));
  skyroomLight.castShadow = false;
  skyroomGroup.add(skyroomLight);

  // -------------------------------------------------------------------------
  // Skyroom Observation Lounge Furnishings
  // Panoramic viewing seats & orientation consoles overlooking Greenway & habitat
  // -------------------------------------------------------------------------
  // South viewing benches (facing south toward plaza, avenue, and Greenway farm)
  addCivicSolid(skyroomGroup, benchWoodMat, obstacles, 41.5, 25.5, 3.8, 1.0, 0.5, skyroomFloor);

  addCivicSolid(skyroomGroup, benchWoodMat, obstacles, 54.5, 25.5, 3.8, 1.0, 0.5, skyroomFloor);

  // West viewing bench (facing across the cylinder curvature)
  addCivicSolid(skyroomGroup, benchWoodMat, obstacles, 38.0, 35.0, 1.0, 4.2, 0.5, skyroomFloor);

  // Southwest Vista Information Console
  addCivicSolid(skyroomGroup, metalFrameMat, obstacles, 40.0, 24.2, 1.8, 0.6, 0.9, skyroomFloor);
  addSurfaceSign(
    skyroomGroup,
    "GREENWAY VISTA\nFARMS & HABITAT PLAZA",
    40.0,
    24.0,
    2.2,
    skyroomFloor + 1.0,
  );

  // Southeast Vista Information Console
  addCivicSolid(skyroomGroup, metalFrameMat, obstacles, 56.0, 24.2, 1.8, 0.6, 0.9, skyroomFloor);
  addSurfaceSign(
    skyroomGroup,
    "MERIDIAN SKYROOM\n42m OBSERVATION DECK",
    56.0,
    24.0,
    2.2,
    skyroomFloor + 1.0,
  );

  // Low guardrails along the glass perimeter for leaning observation
  addCivicSolid(skyroomGroup, railingMat, obstacles, 48.0, 23.6, 23.0, 0.1, 0.9, skyroomFloor);
  addCivicSolid(skyroomGroup, railingMat, obstacles, 48.0, 46.4, 23.0, 0.1, 0.9, skyroomFloor);
  addCivicSolid(skyroomGroup, railingMat, obstacles, 36.6, 35.0, 0.1, 23.0, 0.9, skyroomFloor);
  addCivicSolid(skyroomGroup, railingMat, obstacles, 59.4, 35.0, 0.1, 23.0, 0.9, skyroomFloor);

  // =========================================================================
  // 4. TOWER ROOF, CROWN & SPIRE (Height 47.5 m to 60.0 m)
  // Stepped silhouette culminating in landmark antenna at exactly 60 m
  // =========================================================================
  // Skyroom overhanging roof slab (base 47.5 m, height 1.0 m, top 48.5 m)
  addCivicSolid(crownGroup, stoneWallMat, obstacles, 48.0, 35.0, 25.2, 25.2, 1.0, skyroomRoofBase);

  // Crown Tier 1 - Stepped lantern base (base 48.5 m, height 4.5 m, top 53.0 m)
  addCivicSolid(crownGroup, facadeTierMat, obstacles, 48.0, 35.0, 16.0, 16.0, 4.5, 48.5);

  // Crown Tier 2 - Architectural lantern (base 53.0 m, height 3.5 m, top 56.5 m)
  addCivicSolid(crownGroup, metalFrameMat, obstacles, 48.0, 35.0, 10.0, 10.0, 3.5, 53.0);

  // Landmark Fin & Spire Mast (base 56.5 m, height 3.5 m, top 60.0 m)
  addCivicSolid(crownGroup, spireMat, obstacles, 48.0, 35.0, 2.0, 2.0, 3.5, 56.5);

  // Spire beacon fin at 60.0 m tip
  addCivicBlock(crownGroup, liftGlowMat, 48.0, 35.0, 0.6, 0.6, 0.4, 59.8);

  // =========================================================================
  // 5. PUBLIC ELEVATED SKYWALK & STREET LIFT
  // =========================================================================
  // Slabs: Top exactly 9.0 m, thickness 0.35 m (base 8.65 m)
  // Main path: s in [-31, 45.5], y = 65, depth 5 m (center s = 7.25, width 76.5)
  addCivicSolid(
    skywalkGroup,
    skywalkDeckMat,
    obstacles,
    7.25,
    65.0,
    76.5,
    5.0,
    0.35,
    8.65,
  );

  // Branch deck: s = 48, width 5 m (s in [45.5, 50.5]), y in [50, 80], depth 30 m
  addCivicSolid(
    skywalkGroup,
    skywalkDeckMat,
    obstacles,
    48.0,
    65.0,
    5.0,
    30.0,
    0.35,
    8.65,
  );

  // -------------------------------------------------------------------------
  // Supporting Pillars (Ground h = 0 to underside of slab h = 8.65 m)
  // Strictly outside promenade s in [-5, 5] (16 m clear span over promenade)
  // -------------------------------------------------------------------------
  const pillarLocations = [
    { s: -28.0, y: 65.0 }, // West terrace end support
    { s: -17.0, y: 65.0 },
    { s: -8.0, y: 65.0 }, // West promenade pier
    { s: 8.0, y: 65.0 }, // East promenade pier
    { s: 25.0, y: 65.0 }, // East of street lift
    { s: 38.0, y: 65.0 },
    { s: 48.0, y: 52.0 }, // Branch south end support
    { s: 48.0, y: 78.0 }, // Branch north end support
  ];

  for (const p of pillarLocations) {
    addCivicSolid(skywalkGroup, metalFrameMat, obstacles, p.s, p.y, 0.8, 0.8, 8.65, 0.0);
  }

  // -------------------------------------------------------------------------
  // Safety Railings (Base 9.0 m, top 10.1 m, thickness 0.2 m)
  // Railed viewing terrace ends, zero rails crossing the slab junction.
  // -------------------------------------------------------------------------
  // West end viewing terrace rail (s = -30.9, y = 65, depth 5)
  addCivicSolid(skywalkGroup, railingMat, obstacles, -30.9, 65.0, 0.2, 5.0, 1.1, 9.0);
  addSurfaceSign(
    skywalkGroup,
    "VIEWING TERRACE\nPROMENADE OVERLOOK",
    -30.7,
    65.0,
    2.4,
    9.5,
  );

  // Main path north safety rail (from s = -31.0 to 45.5, stops before branch junction)
  addCivicSolid(skywalkGroup, railingMat, obstacles, 7.25, 67.4, 76.5, 0.2, 1.1, 9.0);

  // Main path south safety rail (from s = -31.0 to 45.5, stops before branch junction)
  addCivicSolid(skywalkGroup, railingMat, obstacles, 7.25, 62.6, 76.5, 0.2, 1.1, 9.0);

  // Branch west safety rail - north segment (y in [67.5, 80], depth 12.5)
  addCivicSolid(skywalkGroup, railingMat, obstacles, 45.6, 73.75, 0.2, 12.5, 1.1, 9.0);

  // Branch west safety rail - south segment (y in [50, 62.5], depth 12.5)
  addCivicSolid(skywalkGroup, railingMat, obstacles, 45.6, 56.25, 0.2, 12.5, 1.1, 9.0);

  // Branch north end viewing rail (y = 79.9, width 5)
  addCivicSolid(skywalkGroup, railingMat, obstacles, 48.0, 79.9, 5.0, 0.2, 1.1, 9.0);
  addSurfaceSign(
    skywalkGroup,
    "MERIDIAN SKYWALK\nNORTH TERRACE VIEW",
    48.0,
    79.7,
    2.4,
    9.5,
  );

  // Branch south end viewing rail (y = 50.1, width 5)
  addCivicSolid(skywalkGroup, railingMat, obstacles, 48.0, 50.1, 5.0, 0.2, 1.1, 9.0);
  addSurfaceSign(
    skywalkGroup,
    "MERIDIAN SKYWALK\nSOUTH TOWER VIEW",
    48.0,
    50.3,
    2.4,
    9.5,
  );

  // Branch east continuous safety rail (s = 50.4, y = 65, depth 30)
  addCivicSolid(skywalkGroup, railingMat, obstacles, 50.4, 65.0, 0.2, 30.0, 1.1, 9.0);

  // -------------------------------------------------------------------------
  // Skywalk Street Lift: Anchor s = 18, y = 65 at ground (0 m) and deck (9 m)
  // Lightweight 4-post frame with open south entry, no obstacle at center.
  // -------------------------------------------------------------------------
  const liftPosts = [
    { s: 16.6, y: 66.4 },
    { s: 19.4, y: 66.4 },
    { s: 16.6, y: 63.6 },
    { s: 19.4, y: 63.6 },
  ];

  for (const lp of liftPosts) {
    addCivicSolid(skywalkGroup, metalFrameMat, obstacles, lp.s, lp.y, 0.2, 0.2, 12.0, 0.0);
  }

  // Lift canopy at top (base 12.0 m, height 0.2 m)
  addCivicSolid(skywalkGroup, metalFrameMat, obstacles, 18.0, 65.0, 3.2, 3.2, 0.2, 12.0);

  // Ground-level glazing stops under the deck; upstairs is open onto the skywalk.
  addCivicSolid(skywalkGroup, glassMat, obstacles, 18.0, 66.4, 2.6, 0.08, 8.65, 0.0);
  addCivicSolid(skywalkGroup, glassMat, obstacles, 16.6, 65.0, 0.08, 2.6, 8.65, 0.0);
  addCivicSolid(skywalkGroup, glassMat, obstacles, 19.4, 65.0, 0.08, 2.6, 8.65, 0.0);

  // Illuminated landing thresholds at ground and deck
  addCivicBlock(skywalkGroup, liftGlowMat, 18.0, 65.0, 2.0, 2.0, 0.02, 0.04);
  addCivicBlock(skywalkGroup, liftGlowMat, 18.0, 65.0, 2.0, 2.0, 0.02, 9.02);

  // Visible control indicators / signs at ground and deck levels
  addSurfaceSign(
    skywalkGroup,
    "STREET LIFT\n[E] TO SKYWALK · 9m",
    18.0,
    66.2,
    2.4,
    1.8,
  );
  addSurfaceSign(
    skywalkGroup,
    "STREET LIFT\n[E] TO STREET · 0m",
    18.0,
    66.2,
    2.4,
    10.8,
  );

  // -------------------------------------------------------------------------
  // Skywalk Furnishings (Deck path remains >= 2.0 m clear everywhere)
  // -------------------------------------------------------------------------
  // Main path viewing benches along the north rail (leaves 4.2 m clear walkway)
  addCivicSolid(skywalkGroup, benchWoodMat, obstacles, -10.0, 66.7, 3.0, 0.8, 0.5, 9.0);

  addCivicSolid(skywalkGroup, benchWoodMat, obstacles, 32.0, 66.7, 3.0, 0.8, 0.5, 9.0);

  // Branch north decorative civic planter (leaves 4.0 m clear walkway)
  addCivicSolid(skywalkGroup, stoneWallMat, obstacles, 48.0, 74.0, 1.0, 2.4, 0.6, 9.0);
  addCivicBlock(skywalkGroup, foliageMat, 48.0, 74.0, 0.8, 2.2, 0.3, 9.6);

  // Branch south viewing bench (leaves 4.0 m clear walkway)
  addCivicSolid(skywalkGroup, benchWoodMat, obstacles, 48.0, 55.0, 1.0, 2.4, 0.5, 9.0);

  return { obstacles };
}
