import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { surfacePos } from "./surface.js";
import { inDistrict } from "./district-layout.js";
import { inCity } from "./city-layout.js";

/**
 * Creates a procedural box-falloff alpha texture for building contact footprints.
 * Darker in the center (ambient occlusion), fading softly to zero at the outer padding edge.
 * Generated via DataTexture to work seamlessly across browsers and headless test runners.
 */
function createBuildingFootprintTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const border = 14;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const d = Math.min(dx, dy);
      const t = Math.min(1, Math.max(0, d / border));
      const smooth = t * t * (3 - 2 * t);

      data[idx + 0] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = Math.round(smooth * 155);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a procedural radial-falloff alpha texture for human-scale resident footprints.
 * Soft circular contact shadow directly under the resident root.
 */
function createResidentFootprintTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const maxRadius = center - 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.hypot(x - center, y - center);
      const t = Math.min(1, Math.max(0, 1 - dist / maxRadius));
      const smooth = t * t * (3 - 2 * t);

      data[idx + 0] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = Math.round(smooth * 150);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a curved cylinder-conforming bent hull patch with UV coordinates.
 * Sits at height h = 0.10m to align cleanly above stone paving (0.04m - 0.065m).
 */
function createBentFootprintPatch(s, y, width, depth, h, material) {
  const segments = Math.max(2, Math.ceil(width / 2));
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const r = RADIUS - h;
  const halfW = width / 2;
  const halfD = depth / 2;
  const y0 = y - halfD;
  const y1 = y + halfD;

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const curS = s - halfW + (width * i) / segments;
    const theta = curS / RADIUS;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const nx = -sin;
    const nz = cos;

    // longitudinal y0 (v = 0)
    positions.push(r * sin, y0, -r * cos);
    normals.push(nx, 0, nz);
    uvs.push(u, 0);

    // longitudinal y1 (v = 1)
    positions.push(r * sin, y1, -r * cos);
    normals.push(nx, 0, nz);
    uvs.push(u, 1);

    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "contact_footprint";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Checks whether a material represents transparent glass, water, or emissive glow.
 * Excluded from shadow casting to prevent dark silhouettes from lanterns, canal water, or greenhouse glazing.
 */
function isMaterialExcludedFromCasting(mat) {
  if (!mat) return false;
  const mats = Array.isArray(mat) ? mat : [mat];
  for (const m of mats) {
    if (
      m.transparent === true ||
      (typeof m.opacity === "number" && m.opacity < 0.95)
    ) {
      return true;
    }
    if (m.emissive && m.emissive.getHex() > 0 && m.emissiveIntensity > 0.5) {
      return true;
    }
    // Canal water: standard material with slate-teal water color and smooth gloss
    if (
      m.roughness < 0.2 &&
      m.metalness > 0.5 &&
      m.color &&
      m.color.getHex() === 0x16525c
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Applies lighting, atmospheric haze, shadow camera configuration, and soft contact shading
 * across the district and terrain.
 *
 * @param {THREE.Scene} scene - The main habitat Three.js scene
 * @param {THREE.Group} district - The Greenway Commons district group
 * @param {THREE.Mesh} terrain - The inner cylinder terrain mesh
 * @param {Array<Object>} obstacles - Collision obstacles registered in the district
 */
export function applyAtmosphere(scene, district, terrain, obstacles) {
  // 2. Atmospheric Distance Haze & Skybox
  const HAZE_COLOR = 0x6d929b;
  const HAZE_DENSITY = 0.0017;
  scene.fog = new THREE.FogExp2(HAZE_COLOR, HAZE_DENSITY);
  scene.background = new THREE.Color(HAZE_COLOR);

  // One cached sunlight map covers Greenway and the civic district.
  const sunLight = new THREE.DirectionalLight(0xffeed6, 2.0);
  sunLight.name = "habitat_sunlight";

  const sunTarget = new THREE.Object3D();
  sunTarget.name = "habitat_sunlight_target";
  sunTarget.position.set(22, -80, -160);
  scene.add(sunTarget);
  sunLight.target = sunTarget;

  sunLight.position.set(12, 11, 115);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;

  // Covers both authored neighborhoods and Meridian's 60 m landmark.
  sunLight.shadow.camera.left = -160;
  sunLight.shadow.camera.right = 160;
  sunLight.shadow.camera.top = 250;
  sunLight.shadow.camera.bottom = -250;
  sunLight.shadow.camera.near = 90;
  sunLight.shadow.camera.far = 550;

  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.04;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.needsUpdate = true;
  scene.add(sunLight);

  // 4. Cool Diffuse Fill (Keeps overhead farmland visible across the cylinder)
  const hemiLight = new THREE.HemisphereLight(0xdbeaf2, 0x819981, 0.65);
  hemiLight.name = "habitat_diffuse_fill";
  hemiLight.position.set(0, 1, 0);
  scene.add(hemiLight);

  const ambientLight = new THREE.AmbientLight(0xd4e1e4, 0.75);
  ambientLight.name = "habitat_ambient_fill";
  scene.add(ambientLight);

  // Four Greenway accent lights; the civic tower supplies two interior lights.

  // PointLight 1: Greenhouse South planter beds
  const lightGreenhouseSouth = new THREE.PointLight(0xffd294, 18, 15.0, 2);
  lightGreenhouseSouth.name = "point_greenhouse_south";
  lightGreenhouseSouth.position.copy(surfacePos(64 / RADIUS, -223, 3.8));
  lightGreenhouseSouth.castShadow = false;
  scene.add(lightGreenhouseSouth);

  // PointLight 2: Greenhouse North planter beds
  const lightGreenhouseNorth = new THREE.PointLight(0xffd294, 18, 15.0, 2);
  lightGreenhouseNorth.name = "point_greenhouse_north";
  lightGreenhouseNorth.position.copy(surfacePos(64 / RADIUS, -205, 3.8));
  lightGreenhouseNorth.castShadow = false;
  scene.add(lightGreenhouseNorth);

  // PointLight 3: Village Square center lantern
  const lightSquare = new THREE.PointLight(0xffdc9e, 12, 16.0, 2);
  lightSquare.name = "point_square_market";
  lightSquare.position.copy(surfacePos(0 / RADIUS, -230, 3.2));
  lightSquare.castShadow = false;
  scene.add(lightSquare);

  // PointLight 4: Promenade / Bakery & Cafe storefront
  const lightBakery = new THREE.PointLight(0xffdc9e, 12, 15.0, 2);
  lightBakery.name = "point_promenade_bakery";
  lightBakery.position.copy(surfacePos(-8.5 / RADIUS, -268, 3.0));
  lightBakery.castShadow = false;
  scene.add(lightBakery);

  // 6. Contact Shading Footprint Textures & Materials
  const buildingFootprintTexture = createBuildingFootprintTexture();
  const buildingFootprintMat = new THREE.MeshBasicMaterial({
    map: buildingFootprintTexture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const residentFootprintTexture = createResidentFootprintTexture();
  const residentFootprintMat = new THREE.MeshBasicMaterial({
    map: residentFootprintTexture,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const residentFootprintGeo = new THREE.PlaneGeometry(0.55, 0.55);

  // Broad district structures only; background blocks do not add shadow draws.
  for (const obs of obstacles) {
    const s = Math.atan2(Math.sin(obs.theta), Math.cos(obs.theta)) * RADIUS;
    if (
      (obs.base ?? 0) > 0 ||
      obs.height < 2 ||
      obs.width < 3 ||
      obs.depth < 3 ||
      !(inDistrict(s, obs.y) || inCity(s, obs.y))
    )
      continue;
    district.add(
      createBentFootprintPatch(
        s,
        obs.y,
        obs.width + 1.2,
        obs.depth + 1.2,
        0.1,
        buildingFootprintMat,
      ),
    );
  }

  // 8. Add Soft Contact Footprint Under Each Resident Root
  // Attached directly to resident root: moves with root position, not body gait
  const residentsGroup = district.getObjectByName("residents");
  for (const root of residentsGroup.children) {
    const shadow = new THREE.Mesh(residentFootprintGeo, residentFootprintMat);
    shadow.name = "resident_footprint";
    shadow.position.set(0, 0, 0.035);
    root.add(shadow);
  }

  // 9. Configure Static Shadow Casters & Receivers
  // Terrain receives static shadows but does not cast
  terrain.receiveShadow = true;
  terrain.castShadow = false;

  // Traverse district:
  // - Descendants of 'residents' and 'delivery_stations' excluded from casting
  // - Descendants with userData.atmosphereDynamic === true excluded from casting
  // - Transparent glass/water/glow excluded from casting
  // - Static opaque village/farm meshes cast and receive
  // - Residents receive static shadows but don't cast

  district.traverse((child) => {
    if (!child.isMesh) return;

    // Contact footprints do not participate in shadow map
    if (
      child.name === "resident_footprint" ||
      child.name === "contact_footprint"
    ) {
      child.castShadow = false;
      child.receiveShadow = false;
      return;
    }

    let isResident = false;
    let isDelivery = false;
    let isDynamic = Boolean(child.userData?.atmosphereDynamic);

    let curr = child.parent;
    while (curr && curr !== district) {
      if (curr.name === "residents") isResident = true;
      if (curr.name === "delivery_stations") isDelivery = true;
      if (curr.userData && curr.userData.atmosphereDynamic === true) {
        isDynamic = true;
      }
      curr = curr.parent;
    }

    if (isResident) {
      child.castShadow = false;
      child.receiveShadow = true;
      return;
    }

    if (isDelivery || isDynamic) {
      child.castShadow = false;
      child.receiveShadow = true;
      return;
    }

    if (isMaterialExcludedFromCasting(child.material)) {
      child.castShadow = false;
      child.receiveShadow = true;
      return;
    }

    // Static opaque village and farm meshes
    child.castShadow = true;
    child.receiveShadow = true;
  });
}
