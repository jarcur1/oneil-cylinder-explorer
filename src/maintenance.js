import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { surfacePos } from "./surface.js";
import { addCivicBlock } from "./civic-primitives.js";
import { VENTILATION_UNIT } from "./maintenance-layout.js";
import { createMaintenanceState } from "./maintenance-state.js";

/**
 * Creates the Skywalk ventilation unit visual machine, collision obstacles,
 * and maintenance gameplay coordinator.
 *
 * Visual Machine:
 * - Raised solid casing at north Skywalk branch leaving west-side pedestrian passage
 * - Excluded from static shadowmap via ancestor userData.atmosphereDynamic = true
 * - Rotor with fan blades spinning in 'repaired' and 'complete' phases
 * - Red/green status indicator reflecting current maintenance state
 * - Zero additional lights created
 *
 * @param {THREE.Object3D} parent
 * @param {'available' | 'assigned' | 'repaired' | 'complete'} [initialPhase='available']
 * @returns {{ getPhase: () => string, getView: (playerState?: object) => object, interact: (playerState: object) => object|null, update: (dt: number, elapsed?: number) => void, obstacles: Array<object> }}
 */
export function createMaintenance(parent, initialPhase = "available") {
  const state = createMaintenanceState(initialPhase);

  // Moving/new quest visuals ancestor flagged to avoid stale static shadows
  const maintenanceGroup = new THREE.Group();
  maintenanceGroup.name = "maintenance_quest";
  maintenanceGroup.userData.atmosphereDynamic = true;
  parent.add(maintenanceGroup);

  // 1. Collision obstacle matching physical casing
  // Raised prop at height 9 (Skywalk deck), leaves >= 2.6m west-side pedestrian walkway
  const obstacles = [
    {
      theta: VENTILATION_UNIT.s / RADIUS,
      y: VENTILATION_UNIT.y,
      width: VENTILATION_UNIT.width,
      depth: VENTILATION_UNIT.depth,
      height: VENTILATION_UNIT.casingHeight,
      base: VENTILATION_UNIT.height,
    },
  ];

  // 2. Solid curved radial casing (broad structural block)
  const casingMat = new THREE.MeshLambertMaterial({ color: 0x243338 });
  addCivicBlock(
    maintenanceGroup,
    casingMat,
    VENTILATION_UNIT.s,
    VENTILATION_UNIT.y,
    VENTILATION_UNIT.width,
    VENTILATION_UNIT.depth,
    VENTILATION_UNIT.casingHeight,
    VENTILATION_UNIT.height,
  );

  // 3. Local rig for unit hardware and dynamic visual attachments
  const theta = VENTILATION_UNIT.s / RADIUS;
  const unitRig = new THREE.Group();
  unitRig.name = "ventilation_rig";
  unitRig.position.copy(
    surfacePos(theta, VENTILATION_UNIT.y, VENTILATION_UNIT.height),
  );
  unitRig.rotation.y = -theta;
  maintenanceGroup.add(unitRig);

  // Top perimeter trim / cowl hood
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x1b282d });
  const topTrimGeo = new THREE.BoxGeometry(
    VENTILATION_UNIT.width + 0.04,
    VENTILATION_UNIT.depth + 0.04,
    0.06,
  );
  const topTrim = new THREE.Mesh(topTrimGeo, trimMat);
  topTrim.position.set(0, 0, VENTILATION_UNIT.casingHeight);
  unitRig.add(topTrim);

  // West-side maintenance access panel (facing pedestrian walkway)
  const hatchMat = new THREE.MeshLambertMaterial({ color: 0x2a3d42 });
  const hatchGeo = new THREE.BoxGeometry(0.03, 1.2, 0.9);
  const hatch = new THREE.Mesh(hatchGeo, hatchMat);
  hatch.position.set(-VENTILATION_UNIT.width / 2 - 0.01, 0, 0.8);
  unitRig.add(hatch);

  // South face intake duct / shroud (facing approaching player from south)
  const shroudMat = new THREE.MeshLambertMaterial({ color: 0x152024 });
  // Local Y already points along the cylinder: an open Y-axis sleeve leaves
  // the south-facing fan aperture visible rather than capping it with a disk.
  const shroudGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.08, 16, 1, true);
  const shroud = new THREE.Mesh(shroudGeo, shroudMat);
  shroud.name = "ventilation_intake";
  shroud.position.set(0, -VENTILATION_UNIT.depth / 2 - 0.02, 0.85);
  unitRig.add(shroud);

  // Protective grille bars over intake
  const grilleMat = new THREE.MeshLambertMaterial({ color: 0x152024 });
  const grilleGeoH = new THREE.BoxGeometry(0.82, 0.02, 0.02);
  const grilleH = new THREE.Mesh(grilleGeoH, grilleMat);
  grilleH.position.set(0, -VENTILATION_UNIT.depth / 2 - 0.05, 0.85);
  unitRig.add(grilleH);

  const grilleGeoV = new THREE.BoxGeometry(0.02, 0.02, 0.82);
  const grilleV = new THREE.Mesh(grilleGeoV, grilleMat);
  grilleV.position.set(0, -VENTILATION_UNIT.depth / 2 - 0.05, 0.85);
  unitRig.add(grilleV);

  // 4. Rotor assembly with fan blades
  const fanGroup = new THREE.Group();
  fanGroup.name = "ventilation_rotor";
  fanGroup.position.set(0, -VENTILATION_UNIT.depth / 2 - 0.03, 0.85);
  unitRig.add(fanGroup);

  const rotor = new THREE.Group();
  rotor.name = "rotor";
  fanGroup.add(rotor);

  // Spinner hub
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x304248 });
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12);
  const hub = new THREE.Mesh(hubGeo, hubMat);
  rotor.add(hub);

  // Fan turbine blades (6 radial blades with pitch)
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0xc8d8dc });
  const bladeGeo = new THREE.BoxGeometry(0.3, 0.05, 0.015);
  const numBlades = 6;
  for (let i = 0; i < numBlades; i++) {
    const angle = (i * Math.PI * 2) / numBlades;
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    const r = 0.22;
    bladeMesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    bladeMesh.rotation.y = -angle;
    bladeMesh.rotation.x = 0.35;
    rotor.add(bladeMesh);
  }

  // 5. Status indicator on south face near walkway
  const indicatorGroup = new THREE.Group();
  indicatorGroup.name = "ventilation_indicator";
  indicatorGroup.position.set(-0.45, -VENTILATION_UNIT.depth / 2 - 0.02, 1.25);
  unitRig.add(indicatorGroup);

  const bezelMat = new THREE.MeshLambertMaterial({ color: 0x182024 });
  const bezelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12);
  const bezel = new THREE.Mesh(bezelGeo, bezelMat);
  indicatorGroup.add(bezel);

  let fanRunning = false;
  const indicatorMat = new THREE.MeshBasicMaterial({
    color: 0xee2222,
  });
  const indicatorGeo = new THREE.SphereGeometry(0.05, 12, 12);
  const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
  indicator.name = "indicator";
  indicator.position.set(0, -0.02, 0);
  indicatorGroup.add(indicator);

  // Visual synchronization: applied immediately on state changes & restoration
  function syncVisuals() {
    const phase = state.getPhase();
    fanRunning = phase === "repaired" || phase === "complete";
    indicator.material.color.setHex(fanRunning ? 0x22ee55 : 0xee2222);
  }

  // Restored states correct on first frame
  syncVisuals();

  function interact(playerState) {
    const result = state.interact(playerState);
    if (result && result.changed) {
      syncVisuals();
    }
    return result;
  }

  function update(dt = 0, _elapsed = 0) {
    if (fanRunning && dt > 0) {
      rotor.rotation.y += dt * 12.0;
    }
  }

  function getView(playerState) {
    return state.getView(playerState);
  }

  function getPhase() {
    return state.getPhase();
  }

  return {
    getPhase,
    getView,
    interact,
    update,
    obstacles,
  };
}
