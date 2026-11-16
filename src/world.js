import * as THREE from "three";
import {
  RADIUS,
  LENGTH,
  SPAWN,
  GREENWAY_PLACEMENT,
  MERIDIAN_PLACEMENT,
} from "./habitat.js";
import { surfacePos, surfaceUp, setSurfaceMatrix } from "./surface.js";
import { createVillage } from "./village.js";
import { createFarm } from "./farm.js";
import { inDistrict } from "./district-layout.js";
import { createResidents } from "./residents.js";
import { createDelivery } from "./delivery.js";
import { applyAtmosphere } from "./atmosphere.js";
import { createDistrictLighting } from "./district-lighting.js";
import { createCityStreets } from "./city-streets.js";
import { createCityTower } from "./city-tower.js";
import { inCity } from "./city-layout.js";
import { createMaintenance } from "./maintenance.js";
import { createServiceLevel } from "./service-level.js";
import { SERVICE_FLOOR } from "./service-layout.js";
import { createSunline } from "./sunline.js";
import { createTram } from "./tram.js";
import { LANDMARKS } from "./landmarks.js";
import { wrappedDeltaTheta } from "./cylinder-math.js";

// Deterministic PRNG (Mulberry32)
function createRng(seed = 0x5a17e) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shortest wrapped circumferential arc distance
function shortestArc(thetaA, thetaB) {
  return Math.abs(wrappedDeltaTheta(thetaA, thetaB));
}

// River centerline function
function getRiverTheta(y) {
  return 2.0 + 0.24 * Math.sin(y * 0.016) + 0.12 * Math.cos(y * 0.038);
}

function copyTranslatedObstacles(localObstacles, placement) {
  return localObstacles.map((obs) => ({
    ...obs,
    y: placement.toWorldY(obs.y),
  }));
}

export function createWorld(scene, camera, saved = {}) {
  // World root group
  const worldGroup = new THREE.Group();
  worldGroup.name = "oneil_world";
  scene.add(worldGroup);

  // 1. Terrain Mesh (cylinder interior)
  const segsT = 384;
  const segsY = 360;
  const numVerts = (segsT + 1) * (segsY + 1);

  const positions = new Float32Array(numVerts * 3);
  const normals = new Float32Array(numVerts * 3);
  const colors = new Float32Array(numVerts * 3);
  const indices = new Uint32Array(segsT * segsY * 6);

  for (let i = 0; i <= segsT; i++) {
    const theta = (i / segsT) * Math.PI * 2;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const nx = -sinT;
    const ny = 0;
    const nz = cosT;

    const dCenterArc = shortestArc(theta, 0) * RADIUS;

    for (let j = 0; j <= segsY; j++) {
      const y = -LENGTH / 2 + (j / segsY) * LENGTH;
      const vIdx = i * (segsY + 1) + j;

      // Surface position
      positions[vIdx * 3 + 0] = RADIUS * sinT;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = -RADIUS * cosT;

      // Inward facing normal
      normals[vIdx * 3 + 0] = nx;
      normals[vIdx * 3 + 1] = ny;
      normals[vIdx * 3 + 2] = nz;


      // Procedural color determination
      let r = 0.2;
      let g = 0.46;
      let b = 0.22;

      // Natural grass subtle modulation
      const grassNoise = Math.sin(theta * 10) * Math.cos(y * 0.03) * 0.04;
      r += grassNoise;
      g += grassNoise;
      b += grassNoise * 0.5;

      const riverThetaY = getRiverTheta(y);
      const dRiverArcY = shortestArc(theta, riverThetaY) * RADIUS;

      // Farm strips overhead (theta ~ 2.4 to 5.2)
      if (theta > 2.4 && theta < 5.2) {
        const stripId = Math.floor((y + LENGTH / 2) / 36);
        const sectorId = Math.floor((theta - 2.4) / 0.35);
        const plotHash = (((stripId * 73 + sectorId * 37) % 6) + 6) % 6;

        if (plotHash === 0) {
          // Golden wheat
          r = 0.74;
          g = 0.63;
          b = 0.28;
        } else if (plotHash === 1) {
          // Rich tilled loam
          r = 0.3;
          g = 0.22;
          b = 0.15;
        } else if (plotHash === 2) {
          // Lavender / sage
          r = 0.36;
          g = 0.46;
          b = 0.37;
        } else if (plotHash === 3) {
          // Emerald pasture
          r = 0.18;
          g = 0.52;
          b = 0.24;
        } else if (plotHash === 4) {
          // Barley
          r = 0.65;
          g = 0.55;
          b = 0.32;
        } else {
          // Deep olive vineyard
          r = 0.25;
          g = 0.4;
          b = 0.21;
        }

        // Irrigation ditch / plot border
        const plotYMod = (y + LENGTH / 2) % 36;
        if (plotYMod < 2.0 || plotYMod > 34.0) {
          r = 0.16;
          g = 0.34;
          b = 0.18;
        }
      }

      // River / canal
      if (dRiverArcY < 12.0) {
        // Deep turquoise canal water
        r = 0.09;
        g = 0.44;
        b = 0.54;
        if (dRiverArcY < 5.0) {
          r = 0.14;
          g = 0.58;
          b = 0.66;
        }
      } else if (dRiverArcY < 16.0) {
        // Lush riverbank
        r = 0.14;
        g = 0.48;
        b = 0.2;
      }

      // Cross avenues connecting to landmarks
      const dY1 = Math.abs(y - -190);
      const dY2 = Math.abs(y - 5);
      const dY3 = Math.abs(y - 235);
      const minDY = Math.min(dY1, dY2, dY3);
      if (minDY < 3.2 && theta < 1.1) {
        r = 0.82;
        g = 0.77;
        b = 0.67;
      }

      // Central promenade at theta = 0
      if (dCenterArc < 4.2) {
        // Warm cream paved stone
        r = 0.86;
        g = 0.81;
        b = 0.72;
      } else if (dCenterArc < 6.2) {
        // Curb border
        r = 0.66;
        g = 0.67;
        b = 0.61;
      }

      // Endcap aprons
      if (Math.abs(y) > LENGTH / 2 - 25) {
        r = 0.22;
        g = 0.28;
        b = 0.32;
      }

      colors[vIdx * 3 + 0] = r;
      colors[vIdx * 3 + 1] = g;
      colors[vIdx * 3 + 2] = b;
    }
  }

  let pIndices = 0;
  for (let i = 0; i < segsT; i++) {
    for (let j = 0; j < segsY; j++) {
      const a = i * (segsY + 1) + j;
      const b = (i + 1) * (segsY + 1) + j;
      const c = (i + 1) * (segsY + 1) + (j + 1);
      const d = i * (segsY + 1) + (j + 1);

      indices[pIndices++] = a;
      indices[pIndices++] = b;
      indices[pIndices++] = c;

      indices[pIndices++] = a;
      indices[pIndices++] = c;
      indices[pIndices++] = d;
    }
  }

  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  terrainGeo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  worldGroup.add(terrainMesh);

  // 2. Landmarks & Beacons
  const landmarks = [
    {
      name: "Emerald Spire",
      theta: 0.08,
      y: -190,
      color: 0x00f59b,
    },
    {
      name: "Solaris Zenith",
      theta: 0.9,
      y: 235,
      color: 0xffb703,
    },
  ];

  const beaconAnims = [];

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const beaconGroup = new THREE.Group();

    // 4 arch support columns leaving center (radius 4.2m) walk-through open
    const colGeo = new THREE.BoxGeometry(0.7, 0.7, 1);
    const colMat = new THREE.MeshStandardMaterial({
      color: 0xdfd8c8,
      roughness: 0.6,
      metalness: 0.2,
    });

    const colOffsets = [
      { dArc: 4.2, dY: 0 },
      { dArc: -4.2, dY: 0 },
      { dArc: 0, dY: 4.2 },
      { dArc: 0, dY: -4.2 },
    ];

    const colHeight = 16.0;
    const tempMatrix = new THREE.Matrix4();

    for (const off of colOffsets) {
      const colTheta = lm.theta + off.dArc / RADIUS;
      const colY = lm.y + off.dY;
      const colMesh = new THREE.Mesh(colGeo, colMat);
      setSurfaceMatrix(tempMatrix, colTheta, colY, 0, 0.7, 0.7, colHeight);
      colMesh.applyMatrix4(tempMatrix);
      beaconGroup.add(colMesh);
    }

    // Overhead crown / crystal
    const crystalGeo = new THREE.OctahedronGeometry(3.2, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: lm.color,
      emissive: lm.color,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.8,
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    const crystalHeight = 22.0;
    const crystalPos = surfacePos(lm.theta, lm.y, crystalHeight);
    crystalMesh.position.copy(crystalPos);
    beaconGroup.add(crystalMesh);

    // Rotating halo rings
    const ringGeo1 = new THREE.TorusGeometry(4.8, 0.2, 8, 32);
    const ringMat1 = new THREE.MeshStandardMaterial({
      color: lm.color,
      emissive: lm.color,
      emissiveIntensity: 0.8,
      roughness: 0.4,
    });
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    ringMesh1.position.copy(crystalPos);
    ringMesh1.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      surfaceUp(lm.theta),
    );
    beaconGroup.add(ringMesh1);

    const ringGeo2 = new THREE.TorusGeometry(6.2, 0.16, 8, 32);
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat1);
    ringMesh2.position.copy(crystalPos);
    ringMesh2.quaternion.copy(ringMesh1.quaternion);
    beaconGroup.add(ringMesh2);

    // Luminous vertical beacon light beam
    const beamLength = 88.0;
    const beamGeo = new THREE.CylinderGeometry(
      1.2,
      1.8,
      beamLength,
      16,
      1,
      true,
    );
    const beamMat = new THREE.MeshBasicMaterial({
      color: lm.color,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    const beamCenter = surfacePos(lm.theta, lm.y, 4.0 + beamLength / 2);
    beamMesh.position.copy(beamCenter);
    beamMesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      surfaceUp(lm.theta),
    );
    beaconGroup.add(beamMesh);

    worldGroup.add(beaconGroup);

    beaconAnims.push({
      crystal: crystalMesh,
      ring1: ringMesh1,
      ring2: ringMesh2,
      beamMat,
    });
  }

  // 3. Buildings & Obstacles
  const obstacles = [];
  const rng = createRng(0x917f2a);

  // Candidate generation zones
  const candidateList = [];

  const usableHalfLength = LENGTH / 2 - 40;
  const greenwayFlankMinY = GREENWAY_PLACEMENT.toWorldY(-275);
  const meridianFlankMinY = MERIDIAN_PLACEMENT.toWorldY(-75);
  const outerBandHalfLength = LENGTH / 2 - 90;

  // District 1: South Valley & Greenway Flanks
  for (let i = 0; i < 32; i++) {
    const y =
      -usableHalfLength +
      20 +
      rng() * Math.max(40, greenwayFlankMinY - 25 - (-usableHalfLength + 20));
    const side = rng() > 0.5 ? 1 : -1;
    const theta = side > 0 ? 0.12 + rng() * 0.48 : -0.12 - rng() * 0.45;
    candidateList.push({ theta, y, type: "village" });
  }
  for (let i = 0; i < 36; i++) {
    const y = greenwayFlankMinY + rng() * 165;
    const side = rng() > 0.5 ? 1 : -1;
    const theta = side > 0 ? 0.12 + rng() * 0.55 : -0.12 - rng() * 0.55;
    candidateList.push({ theta, y, type: "village" });
  }

  // Central Valley Promenade Clusters (between Greenway and Meridian)
  for (let i = 0; i < 48; i++) {
    const y = -300 + rng() * 650;
    const side = rng() > 0.5 ? 1 : -1;
    const theta = side > 0 ? 0.12 + rng() * 0.65 : -0.12 - rng() * 0.65;
    candidateList.push({ theta, y, type: i % 2 === 0 ? "village" : "outpost" });
  }

  // District 2: Meridian Metropolis Flanks
  for (let i = 0; i < 56; i++) {
    const y = meridianFlankMinY + rng() * 200;
    const side = rng() > 0.5 ? 1 : -1;
    const theta = side > 0 ? 0.1 + rng() * 0.65 : -0.1 - rng() * 0.65;
    candidateList.push({ theta, y, type: "city" });
  }

  // District 3: North Research Station
  for (let i = 0; i < 40; i++) {
    const northMinY = meridianFlankMinY + 220;
    const y = northMinY + rng() * Math.max(40, usableHalfLength - 20 - northMinY);
    const side = rng() > 0.5 ? 1 : -1;
    const theta = side > 0 ? 0.12 + rng() * 0.7 : -0.12 - rng() * 0.5;
    candidateList.push({ theta, y, type: "outpost" });
  }

  // District 4: Overhead Habitation Clusters
  for (let i = 0; i < 70; i++) {
    const y = -outerBandHalfLength + rng() * (outerBandHalfLength * 2);
    const side = rng() > 0.5 ? 1 : -1;
    const theta = side > 0 ? 1.05 + rng() * 0.45 : 5.35 + rng() * 0.55;
    candidateList.push({ theta, y, type: "hillside" });
  }

  // Agricultural manors & silos
  for (let i = 0; i < 55; i++) {
    const y = -outerBandHalfLength + rng() * (outerBandHalfLength * 2);
    const theta = 2.65 + rng() * 2.3;
    candidateList.push({ theta, y, type: "farm" });
  }

  // Filter and place solid buildings
  const MAX_BUILDINGS = 240;

  for (const cand of candidateList) {
    if (obstacles.length >= MAX_BUILDINGS) break;

    let width = 11 + rng() * 10;
    let depth = 11 + rng() * 11;
    let height = 8 + rng() * 10;

    if (cand.type === "city") {
      height = rng() > 0.4 ? 16 + rng() * 14 : 10 + rng() * 8;
      width = 12 + rng() * 9;
      depth = 12 + rng() * 10;
    } else if (cand.type === "outpost") {
      height = rng() > 0.5 ? 18 + rng() * 12 : 8 + rng() * 8;
    } else if (cand.type === "farm") {
      height = 7 + rng() * 7;
      width = 14 + rng() * 8;
      depth = 14 + rng() * 8;
    }

    const theta = cand.theta;
    const y = cand.y;
    // Both authored neighborhoods replace random scenery, including margins.
    const arc = wrappedDeltaTheta(theta, 0) * RADIUS;
    const margin = Math.max(width, depth) / 2 + 5;
    if (inDistrict(arc, y, margin) || inCity(arc, y, margin)) continue;

    // 1. Spawn clearing
    const dSpawnArc = shortestArc(theta, SPAWN.theta) * RADIUS;
    const dSpawnY = Math.abs(y - SPAWN.y);
    if (Math.hypot(dSpawnArc, dSpawnY) < 32.0 + Math.max(width, depth) / 2) {
      continue;
    }

    // 2. Central promenade clearing (theta = 0)
    const dCenterArc = shortestArc(theta, 0) * RADIUS;
    if (dCenterArc < width / 2 + 8.5) {
      continue;
    }

    // 3. Landmark clearings
    let hitLm = false;
    for (const lm of landmarks) {
      const dLmArc = shortestArc(theta, lm.theta) * RADIUS;
      const dLmY = Math.abs(y - lm.y);
      if (Math.hypot(dLmArc, dLmY) < 20.0 + Math.max(width, depth) / 2) {
        hitLm = true;
        break;
      }
    }
    if (hitLm) continue;

    // 4. River clearing
    const dRiverArc = shortestArc(theta, getRiverTheta(y)) * RADIUS;
    if (dRiverArc < width / 2 + 14.0) {
      continue;
    }

    // 5. Cylinder length margin
    if (Math.abs(y) + depth / 2 > usableHalfLength) {
      continue;
    }

    // 6. Overlap with existing obstacles
    let overlap = false;
    for (let k = 0; k < obstacles.length; k++) {
      const obs = obstacles[k];
      const dObsArc = shortestArc(theta, obs.theta) * RADIUS;
      const dObsY = Math.abs(y - obs.y);
      if (
        dObsArc < (width + obs.width) / 2 + 4.5 &&
        dObsY < (depth + obs.depth) / 2 + 4.5
      ) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    obstacles.push({ theta, y, width, depth, height });
  }

  // Instanced Meshes for Buildings (Cream walls + Teal roofs)
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf5eedd,
    roughness: 0.85,
    metalness: 0.05,
  });

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.25,
  });

  const buildingBodyMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    bodyMat,
    obstacles.length,
  );
  const buildingRoofMesh = new THREE.InstancedMesh(
    unitBoxGeo,
    roofMat,
    obstacles.length,
  );

  const tempMatrix = new THREE.Matrix4();
  const creamTones = [
    new THREE.Color(0xf6f0e2),
    new THREE.Color(0xf1e7d3),
    new THREE.Color(0xebe0ca),
    new THREE.Color(0xf8f4ea),
  ];
  const tealTones = [
    new THREE.Color(0x1e6670),
    new THREE.Color(0x287a85),
    new THREE.Color(0x17535b),
    new THREE.Color(0x2b8b97),
  ];

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const bodyH = obs.height * 0.86;
    const roofH = obs.height * 0.14;

    // Body sits on ground h = 0
    setSurfaceMatrix(
      tempMatrix,
      obs.theta,
      obs.y,
      0,
      obs.width,
      obs.depth,
      bodyH,
    );
    buildingBodyMesh.setMatrixAt(i, tempMatrix);
    buildingBodyMesh.setColorAt(i, creamTones[i % creamTones.length]);

    // Roof sits atop body
    setSurfaceMatrix(
      tempMatrix,
      obs.theta,
      obs.y,
      bodyH,
      obs.width * 1.04,
      obs.depth * 1.04,
      roofH,
    );
    buildingRoofMesh.setMatrixAt(i, tempMatrix);
    buildingRoofMesh.setColorAt(i, tealTones[i % tealTones.length]);
  }

  buildingBodyMesh.instanceMatrix.needsUpdate = true;
  buildingRoofMesh.instanceMatrix.needsUpdate = true;
  if (buildingBodyMesh.instanceColor)
    buildingBodyMesh.instanceColor.needsUpdate = true;
  if (buildingRoofMesh.instanceColor)
    buildingRoofMesh.instanceColor.needsUpdate = true;

  worldGroup.add(buildingBodyMesh);
  worldGroup.add(buildingRoofMesh);

  // 4. Instanced Trees & Foliage (walk-through acceptable, not in obstacles)
  const treeList = [];

  // Promenade avenue trees
  for (let y = -usableHalfLength; y <= usableHalfLength; y += 17) {
    if (Math.abs(y - SPAWN.y) < 22) continue;
    if (inDistrict(0, y, 6) || inCity(0, y, 6)) continue;
    if (
      Math.abs(y - -190) < 12 ||
      Math.abs(y - 5) < 12 ||
      Math.abs(y - 235) < 12
    )
      continue;

    const tLeft = -7.5 / RADIUS;
    const tRight = 7.5 / RADIUS;
    treeList.push({ theta: tLeft, y, scale: 0.95 });
    treeList.push({ theta: tRight, y, scale: 0.95 });
  }

  // Park & orchard trees
  const treeHalfSpan = LENGTH / 2 - 50;
  for (let i = 0; i < 420; i++) {
    const y = -treeHalfSpan + rng() * (treeHalfSpan * 2);
    const theta = rng() * Math.PI * 2;
    const arc = wrappedDeltaTheta(theta, 0) * RADIUS;
    if (inDistrict(arc, y, 6) || inCity(arc, y, 6)) continue;

    const dSpawnArc = shortestArc(theta, SPAWN.theta) * RADIUS;
    if (Math.hypot(dSpawnArc, Math.abs(y - SPAWN.y)) < 24.0) continue;

    const dCenterArc = shortestArc(theta, 0) * RADIUS;
    if (dCenterArc < 8.5) continue;

    const dRiverArc = shortestArc(theta, getRiverTheta(y)) * RADIUS;
    if (dRiverArc < 12.0) continue;

    // Check collision with solid buildings
    let hitBuilding = false;
    for (let k = 0; k < obstacles.length; k++) {
      const obs = obstacles[k];
      const dObsArc = shortestArc(theta, obs.theta) * RADIUS;
      const dObsY = Math.abs(y - obs.y);
      if (dObsArc < obs.width / 2 + 2.0 && dObsY < obs.depth / 2 + 2.0) {
        hitBuilding = true;
        break;
      }
    }
    if (hitBuilding) continue;

    treeList.push({ theta, y, scale: 0.8 + rng() * 0.45 });
  }

  // Surface matrices use local Z for height; Three's cylinder starts on Y.
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.45, 1, 6).rotateX(
    Math.PI / 2,
  );
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x4a3424,
    roughness: 0.92,
    metalness: 0.05,
  });

  const canopyGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.05,
  });

  const trunkMesh = new THREE.InstancedMesh(
    trunkGeo,
    trunkMat,
    treeList.length,
  );
  const canopyMesh = new THREE.InstancedMesh(
    canopyGeo,
    canopyMat,
    treeList.length,
  );

  const foliageColors = [
    new THREE.Color(0x2d7a36),
    new THREE.Color(0x225c29),
    new THREE.Color(0x3ca348),
    new THREE.Color(0x4c7a33),
  ];

  for (let i = 0; i < treeList.length; i++) {
    const tree = treeList[i];
    const trunkH = 3.6 * tree.scale;
    const canopyR = 2.4 * tree.scale;

    // Trunk
    setSurfaceMatrix(
      tempMatrix,
      tree.theta,
      tree.y,
      0,
      0.6 * tree.scale,
      0.6 * tree.scale,
      trunkH,
    );
    trunkMesh.setMatrixAt(i, tempMatrix);

    // Canopy
    setSurfaceMatrix(
      tempMatrix,
      tree.theta,
      tree.y,
      trunkH * 0.75,
      canopyR * 2,
      canopyR * 2,
      canopyR * 2.2,
    );
    canopyMesh.setMatrixAt(i, tempMatrix);
    canopyMesh.setColorAt(i, foliageColors[i % foliageColors.length]);
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;

  worldGroup.add(trunkMesh);
  worldGroup.add(canopyMesh);

  // 5. Endcaps & Tall Structural Ring Structures
  const endcapMat = new THREE.MeshStandardMaterial({
    color: 0x1a262e,
    roughness: 0.75,
    metalness: 0.35,
    side: THREE.DoubleSide,
  });

  const ringGirdMat = new THREE.MeshStandardMaterial({
    color: 0x243742,
    roughness: 0.6,
    metalness: 0.5,
  });

  const accentMat = new THREE.MeshBasicMaterial({
    color: 0x00f5d4,
  });

  const endPositions = [-LENGTH / 2, LENGTH / 2];

  for (const yEnd of endPositions) {
    const endGroup = new THREE.Group();

    // Circular Endcap Disc
    const discGeo = new THREE.CircleGeometry(RADIUS, 96);
    const discMesh = new THREE.Mesh(discGeo, endcapMat);
    discMesh.position.set(0, yEnd, 0);
    discMesh.rotation.x = yEnd < 0 ? -Math.PI / 2 : Math.PI / 2;
    endGroup.add(discMesh);

    // Concentric detail rings scaled out to RADIUS while keeping metre beam thickness
    const ringRadii = [];
    for (let rr = 35; rr <= RADIUS - 20; rr += 50) {
      ringRadii.push(rr);
    }
    for (const rr of ringRadii) {
      const ringGeo = new THREE.RingGeometry(rr - 1.2, rr + 1.2, 64);
      const ringMesh = new THREE.Mesh(ringGeo, ringGirdMat);
      ringMesh.position.set(0, yEnd + (yEnd < 0 ? 0.3 : -0.3), 0);
      ringMesh.rotation.x = discMesh.rotation.x;
      endGroup.add(ringMesh);
    }

    // Glowing teal docking ring
    const glowRingGeo = new THREE.RingGeometry(54, 55.5, 64);
    const glowRingMesh = new THREE.Mesh(glowRingGeo, accentMat);
    glowRingMesh.position.set(0, yEnd + (yEnd < 0 ? 0.4 : -0.4), 0);
    glowRingMesh.rotation.x = discMesh.rotation.x;
    endGroup.add(glowRingMesh);
    // 12 Radial Bulkhead Spokes
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2;
      const spokeGeo = new THREE.BoxGeometry(1.4, 0.8, RADIUS - 20);
      const spokeMesh = new THREE.Mesh(spokeGeo, ringGirdMat);
      const spokeDist = (RADIUS + 20) / 2;
      spokeMesh.position.set(
        Math.sin(angle) * spokeDist,
        yEnd + (yEnd < 0 ? 0.6 : -0.6),
        -Math.cos(angle) * spokeDist,
      );
      spokeMesh.rotation.y = -angle;
      endGroup.add(spokeMesh);
    }

    // Central Docking Airlock Hub
    const hubGeo = new THREE.CylinderGeometry(15, 15, 14, 32);
    const hubMesh = new THREE.Mesh(hubGeo, ringGirdMat);
    hubMesh.position.set(0, yEnd + (yEnd < 0 ? 7 : -7), 0);
    endGroup.add(hubMesh);

    worldGroup.add(endGroup);
  }

  // Recess structural rings into the shell, leaving the walking surface clear.
  const endRingY = LENGTH / 2 - 15;
  const ringGirdersY = [
    -endRingY,
    -LENGTH / 3,
    -LENGTH / 6,
    0,
    LENGTH / 6,
    LENGTH / 3,
    endRingY,
  ];
  for (const ry of ringGirdersY) {
    const thickness = Math.abs(ry) >= endRingY - 1 ? 3.0 : 1.6;
    const ringTorus = new THREE.TorusGeometry(
      RADIUS + thickness - 0.15,
      thickness,
      16,
      96,
    );
    const ringTorusMesh = new THREE.Mesh(ringTorus, ringGirdMat);
    ringTorusMesh.rotation.x = Math.PI / 2;
    ringTorusMesh.position.set(0, ry, 0);
    worldGroup.add(ringTorusMesh);
  }

  const sunline = createSunline(worldGroup, saved.sunlinePhase);
  const districtGroup = new THREE.Group();
  districtGroup.name = "inhabited_districts";
  worldGroup.add(districtGroup);

  const greenwayGroup = new THREE.Group();
  greenwayGroup.name = "greenway_district";
  greenwayGroup.position.y = GREENWAY_PLACEMENT.offsetY;
  districtGroup.add(greenwayGroup);

  const meridianGroup = new THREE.Group();
  meridianGroup.name = "meridian_district";
  meridianGroup.position.y = MERIDIAN_PLACEMENT.offsetY;
  districtGroup.add(meridianGroup);

  const village = createVillage(greenwayGroup);
  const farm = createFarm(greenwayGroup);
  const residents = createResidents(districtGroup);
  const delivery = createDelivery(districtGroup, camera, saved.deliveryPhase, saved.supplyPhase);
  const cityStreets = createCityStreets(meridianGroup);
  const cityTower = createCityTower(meridianGroup);
  const maintenance = createMaintenance(districtGroup, saved.maintenancePhase);
  const service = createServiceLevel(meridianGroup);
  const tram = createTram(districtGroup);
  obstacles.push(
    ...copyTranslatedObstacles(village.obstacles, GREENWAY_PLACEMENT),
    ...copyTranslatedObstacles(farm.obstacles, GREENWAY_PLACEMENT),
    ...delivery.obstacles,
    ...copyTranslatedObstacles(cityStreets.obstacles, MERIDIAN_PLACEMENT),
    ...copyTranslatedObstacles(cityTower.obstacles, MERIDIAN_PLACEMENT),
    ...maintenance.obstacles,
    ...copyTranslatedObstacles(service.obstacles, MERIDIAN_PLACEMENT),
    ...sunline.obstacles,
    ...tram.obstacles,
    // The living surface is a deck, not the outermost pressure-hull floor.
    // Its underside stays solid above the enclosed service spaces.
    {
      theta: 0,
      y: 0,
      width: Math.PI * 2 * RADIUS,
      depth: LENGTH,
      base: -0.6,
      height: 0.6,
    },
  );
  applyAtmosphere(scene, districtGroup, terrainMesh, obstacles);
  const districtLighting = createDistrictLighting(
    scene,
    sunline.getDistrictStatus().online,
  );

  // Return API
  function update(dt, elapsed, playerState) {
    farm.update(dt, elapsed);
    residents.update(dt, elapsed);
    delivery.update(dt, elapsed);
    maintenance.update(dt, elapsed);
    service.update(dt, elapsed);
    sunline.update(dt, elapsed, playerState);
    districtLighting.update(dt, sunline.getDistrictStatus().online);
    for (let i = 0; i < beaconAnims.length; i++) {
      const b = beaconAnims[i];
      if (b.crystal) {
        b.crystal.rotation.y = elapsed * 1.3;
        b.crystal.rotation.x = elapsed * 0.6;
      }
      if (b.ring1) {
        b.ring1.rotation.z = elapsed * 0.9;
      }
      if (b.ring2) {
        b.ring2.rotation.x = elapsed * -0.7;
        b.ring2.rotation.y = elapsed * 0.5;
      }
      if (b.crystal?.material) {
        b.crystal.material.emissiveIntensity =
          1.1 + 0.35 * Math.sin(elapsed * 2.8 + i * 2.1);
      }
      if (b.beamMat) {
        b.beamMat.opacity = 0.28 + 0.12 * Math.sin(elapsed * 3.4 + i * 1.8);
      }
    }
  }

  return {
    groundHeight: SERVICE_FLOOR,
    obstacles,
    stops: LANDMARKS,
    delivery,
    maintenance,
    sunline,
    residents,
    tram,
    update,
  };
}
