import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { addCivicBlock, addCivicSolid } from "./civic-primitives.js";
import {
  addOrientedPanel,
  addSurfaceBox,
  addSurfacePatch,
  setSurfaceMatrix,
  surfacePos,
  surfaceUp,
} from "./surface.js";

// Shared unit primitives reused across instanced lane details and small props.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateX(
  Math.PI / 2,
);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 8, 8);
const UNIT_WHEEL = new THREE.TorusGeometry(0.43, 0.07, 8, 18).rotateY(
  Math.PI / 2,
);
const TEMP_MATRIX = new THREE.Matrix4();

function createCanvasMaterial(
  canvasWidth,
  canvasHeight,
  draw,
  { unlit = true, offset = false, roughness = 0.72, metalness = 0.08 } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  draw(ctx, canvasWidth, canvasHeight);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const params = {
    map: texture,
    polygonOffset: offset,
    polygonOffsetFactor: offset ? -1 : 0,
    polygonOffsetUnits: offset ? -2 : 0,
  };
  return unlit
    ? new THREE.MeshBasicMaterial(params)
    : new THREE.MeshStandardMaterial({ ...params, roughness, metalness });
}

function drawShopBanner(
  ctx,
  w,
  h,
  { bg, accent, text, badge, title, subtitle },
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.strokeStyle = "rgba(255, 245, 224, 0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, w - 56, h - 56);

  // Left unit ID badge pill
  ctx.fillStyle = accent;
  ctx.fillRect(46, 48, 180, h - 96);
  ctx.fillStyle = bg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 62px system-ui";
  ctx.fillText(badge, 136, h / 2 + 2);

  // Storefront title & trade subtitle
  ctx.textAlign = "left";
  ctx.fillStyle = text;
  ctx.font = "700 76px system-ui";
  ctx.fillText(title, 260, h * 0.4, w - 300);
  ctx.fillStyle = accent;
  ctx.font = "600 34px system-ui";
  ctx.fillText(subtitle, 262, h * 0.73, w - 300);
}

function drawUnitPlaque(ctx, w, h, { bg, accent, badge, label }) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  ctx.font = "700 84px system-ui";
  ctx.fillText(badge, w / 2, h * 0.42);
  ctx.fillStyle = "#f4edd9";
  ctx.font = "600 34px system-ui";
  ctx.fillText(label, w / 2, h * 0.77, w - 32);
}

function drawInfoBoard(
  ctx,
  w,
  h,
  { bg, border, headingColor, lineColor, heading, subheading, rows },
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = headingColor;
  ctx.font = "700 44px system-ui";
  ctx.fillText(heading, w / 2, 74, w - 64);

  ctx.fillStyle = border;
  ctx.font = "600 26px system-ui";
  ctx.fillText(subheading, w / 2, 120, w - 64);

  ctx.fillRect(48, 148, w - 96, 4);

  ctx.font = "600 30px system-ui";
  rows.forEach(([left, right], index) => {
    const rowY = 200 + index * 66;
    ctx.textAlign = "left";
    ctx.fillStyle = lineColor;
    ctx.fillText(left, 48, rowY, w * 0.62);
    if (right) {
      ctx.textAlign = "right";
      ctx.fillStyle = headingColor;
      ctx.fillText(right, w - 48, rowY, w * 0.28);
    }
  });
}

function drawBackWallGraphic(ctx, w, h, kind) {
  ctx.fillStyle = kind === "repair" ? "#263238" : kind === "cafe" ? "#2d1f1d" : "#243b30";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = kind === "repair" ? "#d49a3a" : kind === "cafe" ? "#d9b478" : "#9dc08b";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  if (kind === "produce") {
    // Painted orchard crate shelves & market awning stripes behind the counter
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = 70 + shelf * 70;
      ctx.fillStyle = "#5c422a";
      ctx.fillRect(28, sy + 42, w - 56, 10);
      const colors = ["#c84b31", "#e5a93c", "#5b8c4a", "#d96b38"];
      for (let col = 0; col < 6; col++) {
        ctx.fillStyle = "#7a5837";
        ctx.fillRect(40 + col * 74, sy + 12, 60, 30);
        ctx.fillStyle = colors[(shelf + col) % colors.length];
        ctx.beginPath();
        ctx.arc(70 + col * 74, sy + 12, 14, Math.PI, 0);
        ctx.fill();
      }
    }
    return;
  }

  if (kind === "repair") {
    // Pegboard grid with wrench, wheel, and caliper silhouettes
    ctx.fillStyle = "#34444c";
    ctx.fillRect(24, 24, w - 48, h - 48);
    ctx.fillStyle = "rgba(220, 232, 236, 0.16)";
    for (let y = 40; y < h - 36; y += 22) {
      for (let x = 40; x < w - 36; x += 22) {
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.strokeStyle = "#c9d4d8";
    ctx.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      const x = 75 + i * 62;
      ctx.beginPath();
      ctx.moveTo(x, 56);
      ctx.lineTo(x, 152);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, 54, 12, 0.3, Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.strokeStyle = "#e0a43b";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(390, 118, 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let spoke = 0; spoke < 8; spoke++) {
      const a = (spoke * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(390, 118);
      ctx.lineTo(390 + Math.cos(a) * 52, 118 + Math.sin(a) * 52);
      ctx.stroke();
    }
    ctx.fillStyle = "#d95d39";
    ctx.fillRect(46, 186, 180, 44);
    ctx.fillStyle = "#4b7b7d";
    ctx.fillRect(244, 186, 222, 44);
    return;
  }

  // Warm café shelf & glassware silhouettes
  ctx.fillStyle = "#422a24";
  ctx.fillRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = "#7a5234";
  ctx.fillRect(36, 98, w - 72, 10);
  ctx.fillRect(36, 182, w - 72, 10);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? "#c79e63" : "#6c8c84";
    ctx.fillRect(54 + i * 86, 46, 42, 52);
  }
  ctx.fillStyle = "#efe5cf";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(52 + i * 70, 152, 28, 30);
  }
}

/**
 * Builds the Meridian Market Lane pedestrian storefront row (produce, cycle/utility repair,
 * and café) along the east side of the clear s=19..23 aisle in Meridian-local coordinates.
 *
 * @param {THREE.Object3D} parent Meridian-local district group (rendered at y + 455)
 * @returns {{ obstacles: Array<{ name: string, theta: number, y: number, width: number, depth: number, height: number, base: number }> }}
 */
export function createMeridianMarket(parent) {
  const root = new THREE.Group();
  root.name = "meridian_market_lane";
  parent.add(root);

  const obstacles = [];

  const mats = {
    // Paving & masonry
    lanePaving: new THREE.MeshStandardMaterial({
      color: 0x8f8a81,
      roughness: 0.88,
      metalness: 0.04,
    }),
    terracePaving: new THREE.MeshStandardMaterial({
      color: 0xa59d8f,
      roughness: 0.84,
      metalness: 0.05,
    }),
    curbSlate: new THREE.MeshStandardMaterial({
      color: 0x67655e,
      roughness: 0.86,
      metalness: 0.06,
    }),
    paverAccent: new THREE.MeshStandardMaterial({
      color: 0x777167,
      roughness: 0.86,
      metalness: 0.05,
    }),
    thresholdWarm: new THREE.MeshStandardMaterial({
      color: 0xb78b5d,
      roughness: 0.84,
      metalness: 0.04,
    }),
    plinth: new THREE.MeshStandardMaterial({
      color: 0x76726a,
      roughness: 0.9,
      metalness: 0.05,
    }),

    // Shop walls & roofs
    produceWall: new THREE.MeshStandardMaterial({
      color: 0xe6decb,
      roughness: 0.84,
      metalness: 0.04,
    }),
    produceRoof: new THREE.MeshStandardMaterial({
      color: 0x3b664f,
      roughness: 0.72,
      metalness: 0.14,
    }),
    repairWall: new THREE.MeshStandardMaterial({
      color: 0xb6b2a8,
      roughness: 0.8,
      metalness: 0.14,
    }),
    repairRoof: new THREE.MeshStandardMaterial({
      color: 0x35474e,
      roughness: 0.56,
      metalness: 0.34,
    }),
    cafeWall: new THREE.MeshStandardMaterial({
      color: 0xd9bfa3,
      roughness: 0.84,
      metalness: 0.04,
    }),
    cafeRoof: new THREE.MeshStandardMaterial({
      color: 0x8d4537,
      roughness: 0.68,
      metalness: 0.12,
    }),

    // Timber, metals, awnings & accents
    woodWarm: new THREE.MeshStandardMaterial({
      color: 0x845836,
      roughness: 0.76,
      metalness: 0.05,
    }),
    woodDark: new THREE.MeshStandardMaterial({
      color: 0x4b3321,
      roughness: 0.8,
      metalness: 0.06,
    }),
    crateWood: new THREE.MeshStandardMaterial({
      color: 0xa4794b,
      roughness: 0.82,
      metalness: 0.03,
    }),
    tealMetal: new THREE.MeshStandardMaterial({
      color: 0x1d4749,
      roughness: 0.42,
      metalness: 0.58,
    }),
    steelDark: new THREE.MeshStandardMaterial({
      color: 0x2f3538,
      roughness: 0.48,
      metalness: 0.62,
    }),
    steelBright: new THREE.MeshStandardMaterial({
      color: 0xb9c2c7,
      roughness: 0.32,
      metalness: 0.78,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xc9a14e,
      roughness: 0.34,
      metalness: 0.76,
    }),
    awningSage: new THREE.MeshStandardMaterial({
      color: 0x3b6e52,
      roughness: 0.8,
      metalness: 0.05,
    }),
    awningCream: new THREE.MeshStandardMaterial({
      color: 0xf1ead8,
      roughness: 0.82,
      metalness: 0.04,
    }),
    awningOchre: new THREE.MeshStandardMaterial({
      color: 0xc5742c,
      roughness: 0.52,
      metalness: 0.36,
    }),
    awningBurgundy: new THREE.MeshStandardMaterial({
      color: 0x7d3230,
      roughness: 0.78,
      metalness: 0.06,
    }),

    // Wares, food, foliage & lighting
    appleRed: new THREE.MeshStandardMaterial({
      color: 0xc8372d,
      roughness: 0.44,
      metalness: 0.06,
    }),
    citrusGold: new THREE.MeshStandardMaterial({
      color: 0xe69f28,
      roughness: 0.46,
      metalness: 0.05,
    }),
    produceGreen: new THREE.MeshStandardMaterial({
      color: 0x487d3d,
      roughness: 0.74,
      metalness: 0.02,
    }),
    produceAmber: new THREE.MeshStandardMaterial({
      color: 0xb86b35,
      roughness: 0.78,
      metalness: 0.02,
    }),
    toolboxRed: new THREE.MeshStandardMaterial({
      color: 0xb5392c,
      roughness: 0.45,
      metalness: 0.35,
    }),
    rubberBlack: new THREE.MeshStandardMaterial({
      color: 0x1e2022,
      roughness: 0.86,
      metalness: 0.08,
    }),
    bikeBlue: new THREE.MeshStandardMaterial({
      color: 0x2d6d7c,
      roughness: 0.42,
      metalness: 0.48,
    }),
    bikeRust: new THREE.MeshStandardMaterial({
      color: 0xb35235,
      roughness: 0.44,
      metalness: 0.42,
    }),
    pastryGold: new THREE.MeshStandardMaterial({
      color: 0xd99b4e,
      roughness: 0.68,
      metalness: 0.02,
    }),
    ceramicCup: new THREE.MeshStandardMaterial({
      color: 0xf4efe2,
      roughness: 0.36,
      metalness: 0.05,
    }),
    glassCase: new THREE.MeshStandardMaterial({
      color: 0xaad4d6,
      roughness: 0.18,
      metalness: 0.16,
      transparent: true,
      opacity: 0.45,
    }),
    foliage: new THREE.MeshStandardMaterial({
      color: 0x3b693c,
      roughness: 0.84,
      metalness: 0.02,
    }),
    earth: new THREE.MeshStandardMaterial({
      color: 0x3f3327,
      roughness: 0.95,
      metalness: 0.0,
    }),
    warmGlobe: new THREE.MeshStandardMaterial({
      color: 0xfff3d4,
      emissive: 0xffc978,
      emissiveIntensity: 1.15,
      roughness: 0.25,
      metalness: 0.05,
    }),
  };

  function pushObstacle(name, s, y, width, depth, height, base = 0) {
    obstacles.push({
      name,
      theta: s / RADIUS,
      y,
      width,
      depth,
      height,
      base,
    });
  }

  function solid(group, name, material, s, y, width, depth, height, base = 0) {
    const mesh = addCivicSolid(
      group,
      material,
      obstacles,
      s,
      y,
      width,
      depth,
      height,
      base,
    );
    mesh.name = name;
    obstacles[obstacles.length - 1].name = name;
    return mesh;
  }

  function block(group, name, material, s, y, width, depth, height, base = 0) {
    const mesh = addCivicBlock(
      group,
      material,
      s,
      y,
      width,
      depth,
      height,
      base,
    );
    mesh.name = name;
    return mesh;
  }

  function box(
    group,
    name,
    material,
    s,
    y,
    width,
    depth,
    height,
    base = 0,
    collidable = true,
  ) {
    const mesh = addSurfaceBox(group, material, s, y, width, depth, height, base);
    mesh.name = name;
    if (collidable) pushObstacle(name, s, y, width, depth, height, base);
    return mesh;
  }

  function addSign(
    group,
    name,
    s,
    y,
    h,
    facing,
    width,
    height,
    canvasW,
    canvasH,
    drawFn,
    options,
  ) {
    const mat = createCanvasMaterial(canvasW, canvasH, drawFn, options);
    const mesh = addOrientedPanel(
      group,
      mat,
      surfacePos(s / RADIUS, y, h),
      facing,
      width,
      height,
    );
    mesh.name = name;
    return mesh;
  }

  function addInstanced(group, name, geometry, material, placements) {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = name;
    for (let i = 0; i < placements.length; i++) {
      const [s, y, base, width, depth, height] = placements[i];
      setSurfaceMatrix(TEMP_MATRIX, s / RADIUS, y, base, width, depth, height);
      mesh.setMatrixAt(i, TEMP_MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }

  // ==========================================
  // 1. PAVING & PEDESTRIAN MARKINGS (s=19..35.5, y=-90..-53)
  // Connects seamlessly to the y=-49 housing lane at y=-53 while keeping aisle s=19..23 clear.
  // ==========================================
  const pavingGroup = new THREE.Group();
  pavingGroup.name = "meridian_market_paving";
  root.add(pavingGroup);

  // Flush radial paving link from just north of Line 02 pad (s=16, world y=337.3 / local y=-117.7)
  // to the market aisle start (s=21, local y=-90), aligned with the passenger path.
  const LINK_Y0 = -116.5;
  const LINK_Y1 = -111.5;
  const LINK_Y2 = -94.5;
  const LINK_Y3 = -90.0;
  const LINK_S0 = 16.0;
  const LINK_S1 = 16.6;
  const LINK_S2 = 20.4;
  const LINK_S3 = 21.0;
  const LINK_SLOPE = (LINK_S2 - LINK_S1) / (LINK_Y2 - LINK_Y1);

  function hermite1D(t, p0, m0, p1, m1) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * p0 +
      (t3 - 2 * t2 + t) * m0 +
      (-2 * t3 + 3 * t2) * p1 +
      (t3 - t2) * m1
    );
  }

  function tramLinkCenterS(y) {
    if (y <= LINK_Y1) {
      const span = LINK_Y1 - LINK_Y0;
      const t = Math.max(0, Math.min(1, (y - LINK_Y0) / span));
      return hermite1D(t, LINK_S0, 0, LINK_S1, LINK_SLOPE * span);
    }
    if (y <= LINK_Y2) {
      return LINK_S1 + LINK_SLOPE * (y - LINK_Y1);
    }
    const span = LINK_Y3 - LINK_Y2;
    const t = Math.max(0, Math.min(1, (y - LINK_Y2) / span));
    return hermite1D(t, LINK_S2, LINK_SLOPE * span, LINK_S3, 0);
  }

  function addRadialPathRibbon(
    group,
    name,
    material,
    centerlineFn,
    yValues,
    width,
    hStart,
    hEnd,
    sSteps = 3,
  ) {
    const positions = [];
    const normals = [];
    const indices = [];
    const yStart = yValues[0];
    const ySpan = yValues[yValues.length - 1] - yStart;
    for (let j = 0; j < yValues.length; j++) {
      const y = yValues[j];
      const ty = (y - yStart) / ySpan;
      const h = hStart + (hEnd - hStart) * ty;
      const centerS = centerlineFn(y);
      for (let i = 0; i <= sSteps; i++) {
        const s = centerS - width / 2 + (width * i) / sSteps;
        const theta = s / RADIUS;
        const pos = surfacePos(theta, y, h);
        const up = surfaceUp(theta);
        positions.push(pos.x, pos.y, pos.z);
        normals.push(up.x, up.y, up.z);
      }
    }
    const stride = sSteps + 1;
    for (let j = 0; j < yValues.length - 1; j++) {
      for (let i = 0; i < sSteps; i++) {
        const a = j * stride + i;
        const b = a + 1;
        const c = (j + 1) * stride + i + 1;
        const d = (j + 1) * stride + i;
        indices.push(a, b, c, a, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }

  const linkYValues = [LINK_Y0];
  for (const [endY, steps] of [
    [LINK_Y1, 6],
    [LINK_Y2, 8],
    [LINK_Y3, 6],
  ]) {
    const startY = linkYValues[linkYValues.length - 1];
    for (let i = 1; i <= steps; i++) {
      linkYValues.push(startY + ((endY - startY) * i) / steps);
    }
  }
  addRadialPathRibbon(
    pavingGroup,
    "meridian_market_tram_link_paving",
    mats.lanePaving,
    tramLinkCenterS,
    linkYValues,
    3.0,
    0.028,
    0.048,
  );

  addSurfacePatch(pavingGroup, mats.lanePaving, 21.0, -71.5, 4.0, 37.0, 0.048).name =
    "meridian_market_aisle_paving";
  addSurfacePatch(pavingGroup, mats.terracePaving, 29.25, -71.5, 12.5, 37.0, 0.052).name =
    "meridian_market_terrace_paving";
  addSurfacePatch(pavingGroup, mats.curbSlate, 19.15, -71.5, 0.3, 36.4, 0.054).name =
    "meridian_market_west_curb";
  addSurfacePatch(pavingGroup, mats.curbSlate, 23.2, -71.5, 0.4, 36.4, 0.055).name =
    "meridian_market_east_curb";

  const paverInlays = [];
  for (let y = -88; y <= -54; y += 2.0) {
    paverInlays.push([21.0, y, 0.052, 0.85, 0.42, 0.005]);
  }
  for (const shopY of [-82, -70, -58]) {
    for (const stepS of [24.1, 25.0, 25.9, 26.8]) {
      paverInlays.push([stepS, shopY, 0.053, 0.62, 2.8, 0.005]);
    }
  }
  for (const crossS of [19.8, 20.6, 21.4, 22.2]) {
    paverInlays.push([crossS, -53.35, 0.053, 0.48, 0.85, 0.005]);
  }
  addInstanced(
    pavingGroup,
    "meridian_market_paver_inlays",
    UNIT_BOX,
    mats.paverAccent,
    paverInlays,
  );

  const thresholdStrips = [-82, -70, -58].map((shopY) => [
    27.15,
    shopY,
    0.054,
    0.55,
    5.4,
    0.005,
  ]);
  addInstanced(
    pavingGroup,
    "meridian_market_shop_thresholds",
    UNIT_BOX,
    mats.thresholdWarm,
    thresholdStrips,
  );

  // ==========================================
  // 2. SHARED SHOP SHELL BUILDER
  // Low single-story pavilions inside s=27..35, y=-90..-53 (west of Lantern Court s>=36)
  // ==========================================
  function buildStorefrontShell(
    group,
    prefix,
    {
      y,
      depth,
      wallHeight,
      wallMat,
      roofMat,
      fasciaMat,
      trimMat,
      counterDepth,
      counterY = y,
      counterHeight,
      awningMat,
      awningBase,
      badge,
      title,
      subtitle,
      signBg,
      signAccent,
      signText,
      graphicKind,
      plaqueLabel,
    },
  ) {
    // Ground plinth & rear enclosure (s = 28.7..34.9)
    solid(
      group,
      `${prefix}_plinth`,
      mats.plinth,
      31.8,
      y,
      6.4,
      depth + 0.2,
      0.14,
      0,
    );
    solid(
      group,
      `${prefix}_body`,
      wallMat,
      31.8,
      y,
      6.2,
      depth,
      wallHeight - 0.14,
      0.14,
    );

    // Low stepped roof & cornice
    solid(
      group,
      `${prefix}_roof_eave`,
      trimMat,
      31.7,
      y,
      6.8,
      depth + 0.6,
      0.22,
      wallHeight,
    );
    block(
      group,
      `${prefix}_roof_tier`,
      roofMat,
      31.8,
      y,
      6.0,
      depth - 0.4,
      0.28,
      wallHeight + 0.22,
    );
    block(
      group,
      `${prefix}_roof_cap`,
      trimMat,
      32.0,
      y,
      4.4,
      depth - 1.8,
      0.26,
      wallHeight + 0.5,
    );

    // West wall display alcove graphic behind the walk-up counter
    addSign(
      group,
      `${prefix}_backwall_display`,
      28.67,
      counterY,
      1.82,
      "west",
      Math.min(4.2, counterDepth - 0.4),
      1.55,
      512,
      256,
      (ctx, cw, ch) => drawBackWallGraphic(ctx, cw, ch, graphicKind),
      { unlit: false, offset: true, roughness: 0.72, metalness: 0.08 },
    );

    // Front fascia posts framing the shopfront around s=27.45
    const postOffset = depth / 2 - 0.4;
    for (const side of [-1, 1]) {
      const py = y + side * postOffset;
      box(
        group,
        `${prefix}_post_${side < 0 ? "south" : "north"}`,
        trimMat,
        27.45,
        py,
        0.22,
        0.22,
        wallHeight,
        0,
      );
    }

    // Pedestrian-scale unit ID plaque on the north front post
    box(
      group,
      `${prefix}_id_plaque_backing`,
      trimMat,
      27.33,
      y + postOffset,
      0.04,
      0.56,
      0.46,
      1.42,
      false,
    );
    addSign(
      group,
      `${prefix}_unit_id_${badge.toLowerCase()}`,
      27.3,
      y + postOffset,
      1.65,
      "west",
      0.52,
      0.42,
      256,
      208,
      (ctx, cw, ch) =>
        drawUnitPlaque(ctx, cw, ch, {
          bg: signBg,
          accent: signAccent,
          badge,
          label: plaqueLabel,
        }),
      { unlit: true, offset: true },
    );

    // Walk-up counter centered around s = 28.0
    solid(
      group,
      `${prefix}_counter_base`,
      trimMat,
      28.0,
      counterY,
      1.2,
      counterDepth,
      counterHeight - 0.08,
      0,
    );
    solid(
      group,
      `${prefix}_counter_top`,
      mats.woodWarm,
      27.95,
      counterY,
      1.34,
      counterDepth + 0.16,
      0.08,
      counterHeight - 0.08,
    );

    // Overhanging awning (base >= 2.65m so standing players pass cleanly underneath)
    solid(
      group,
      `${prefix}_awning`,
      awningMat,
      27.4,
      y,
      2.6,
      depth - 0.4,
      0.16,
      awningBase,
    );
    block(
      group,
      `${prefix}_awning_valance`,
      trimMat,
      26.14,
      y,
      0.08,
      depth - 0.4,
      0.22,
      awningBase - 0.14,
    );

    // Prominent west-facing shop name sign above the awning
    box(
      group,
      `${prefix}_sign_backing`,
      fasciaMat,
      27.44,
      y,
      0.14,
      5.7,
      1.15,
      wallHeight - 0.62,
      false,
    );
    addSign(
      group,
      `${prefix}_name_sign`,
      27.35,
      y,
      wallHeight - 0.04,
      "west",
      5.5,
      1.04,
      1024,
      224,
      (ctx, cw, ch) =>
        drawShopBanner(ctx, cw, ch, {
          bg: signBg,
          accent: signAccent,
          text: signText,
          badge,
          title,
          subtitle,
        }),
      { unlit: true, offset: true },
    );
  }

  // ==========================================
  // 3. STOREFRONT M-01: PRODUCE ("MERIDIAN HARVEST", y = -82)
  // ==========================================
  const produceGroup = new THREE.Group();
  produceGroup.name = "meridian_market_produce";
  root.add(produceGroup);

  buildStorefrontShell(produceGroup, "produce", {
    y: -82,
    depth: 8.4,
    wallHeight: 3.5,
    wallMat: mats.produceWall,
    roofMat: mats.produceRoof,
    fasciaMat: mats.woodDark,
    trimMat: mats.woodDark,
    counterDepth: 5.4,
    counterHeight: 0.96,
    awningMat: mats.awningSage,
    awningBase: 2.68,
    badge: "M-01",
    title: "MERIDIAN HARVEST",
    subtitle: "FRESH PRODUCE · GREENS · ORCHARD FRUIT",
    signBg: "#1b3b2c",
    signAccent: "#e4c271",
    signText: "#f6efe0",
    graphicKind: "produce",
    plaqueLabel: "PRODUCE",
  });

  // Striped cream awning ribs & front crates
  const produceStripes = [];
  for (let i = -3; i <= 3; i += 2) {
    produceStripes.push([27.4, -82 + i * 1.0, 2.84, 2.52, 0.72, 0.05]);
  }
  addInstanced(
    produceGroup,
    "produce_awning_stripes",
    UNIT_BOX,
    mats.awningCream,
    produceStripes,
  );

  // Two low front produce display bins flanking the walk-up center (s = 27.05)
  const cratePositions = [
    [-84.0, mats.appleRed],
    [-80.0, mats.citrusGold],
  ];
  for (const [cy, fruitMat] of cratePositions) {
    const tag = cy < -82 ? "south" : "north";
    box(
      produceGroup,
      `produce_front_bin_${tag}`,
      mats.crateWood,
      27.05,
      cy,
      0.66,
      1.3,
      0.48,
      0,
    );
    // Slanted display bed & fruit fill
    box(
      produceGroup,
      `produce_front_bed_${tag}`,
      fruitMat,
      27.05,
      cy,
      0.56,
      1.18,
      0.08,
      0.48,
      false,
    );
  }

  // Countertop produce crates, brass balance scale & instanced fruit/greens
  const appleCoords = [];
  const citrusCoords = [];
  const greenCoords = [];
  const amberCoords = [];

  for (const [idx, cy, kind] of [
    [0, -84.0, "apple"],
    [1, -82.8, "greens"],
    [2, -81.1, "amber"],
    [3, -79.9, "citrus"],
  ]) {
    box(
      produceGroup,
      `produce_counter_crate_${idx}`,
      mats.crateWood,
      27.95,
      cy,
      0.72,
      1.02,
      0.18,
      0.96,
      false,
    );
    const target =
      kind === "apple"
        ? appleCoords
        : kind === "citrus"
          ? citrusCoords
          : kind === "greens"
            ? greenCoords
            : amberCoords;
    for (let sx = -1; sx <= 1; sx++) {
      for (let sy = -2; sy <= 2; sy++) {
        target.push([
          27.95 + sx * 0.18,
          cy + sy * 0.18,
          1.12,
          0.14,
          0.14,
          kind === "greens" ? 0.16 : 0.13,
        ]);
      }
    }
  }
  // Extra fruit mounds in front bins
  for (let i = -2; i <= 2; i++) {
    appleCoords.push([27.05, -84.0 + i * 0.21, 0.54, 0.15, 0.15, 0.14]);
    citrusCoords.push([27.05, -80.0 + i * 0.21, 0.54, 0.15, 0.15, 0.14]);
  }
  addInstanced(produceGroup, "produce_apples", UNIT_SPHERE, mats.appleRed, appleCoords);
  addInstanced(produceGroup, "produce_citrus", UNIT_SPHERE, mats.citrusGold, citrusCoords);
  addInstanced(produceGroup, "produce_greens", UNIT_SPHERE, mats.produceGreen, greenCoords);
  addInstanced(produceGroup, "produce_roots", UNIT_SPHERE, mats.produceAmber, amberCoords);

  // Brass hanging/counter balance scale at center of produce counter
  box(produceGroup, "produce_scale_base", mats.brass, 27.95, -81.95, 0.24, 0.28, 0.05, 0.96, false);
  box(produceGroup, "produce_scale_post", mats.brass, 27.95, -81.95, 0.04, 0.04, 0.42, 1.01, false);
  box(produceGroup, "produce_scale_beam", mats.brass, 27.95, -81.95, 0.04, 0.42, 0.03, 1.4, false);

  // Sidewalk chalkboard price sign (east of s=24)
  box(produceGroup, "produce_board_frame", mats.woodDark, 26.5, -78.4, 0.36, 0.78, 1.24, 0);
  addSign(
    produceGroup,
    "produce_price_board",
    26.31,
    -78.4,
    0.72,
    "west",
    0.7,
    0.92,
    512,
    512,
    (ctx, cw, ch) =>
      drawInfoBoard(ctx, cw, ch, {
        bg: "#1e3229",
        border: "#d8bd77",
        headingColor: "#f7eed7",
        lineColor: "#cbe0c6",
        heading: "HARVEST M-01",
        subheading: "DAILY CRATE PRICES",
        rows: [
          ["CRISP APPLES", "2 CR"],
          ["SUN CITRUS", "3 CR"],
          ["LEAFY GREENS", "2 CR"],
          ["ROOT BASKETS", "4 CR"],
        ],
      }),
    { unlit: true, offset: true },
  );

  // ==========================================
  // 4. STOREFRONT M-02: CYCLE & UTILITY REPAIR ("AXLE & SPANNER", y = -70)
  // ==========================================
  const repairGroup = new THREE.Group();
  repairGroup.name = "meridian_market_repair";
  root.add(repairGroup);

  buildStorefrontShell(repairGroup, "repair", {
    y: -70,
    depth: 8.4,
    wallHeight: 3.6,
    wallMat: mats.repairWall,
    roofMat: mats.repairRoof,
    fasciaMat: mats.steelDark,
    trimMat: mats.steelDark,
    counterDepth: 4.4,
    counterY: -70.8,
    counterHeight: 0.96,
    awningMat: mats.awningOchre,
    awningBase: 2.74,
    badge: "M-02",
    title: "AXLE & SPANNER",
    subtitle: "CYCLE & UTILITY REPAIR · PARTS · AIR",
    signBg: "#1f2e36",
    signAccent: "#e2a23b",
    signText: "#f2eee4",
    graphicKind: "repair",
    plaqueLabel: "REPAIR",
  });

  // Corrugated steel canopy ribs & diagonal steel brackets (distinct from produce & café)
  const repairRibs = [];
  for (let dy = -3.6; dy <= 3.6; dy += 0.9) {
    repairRibs.push([27.4, -70 + dy, 2.9, 2.58, 0.14, 0.08]);
  }
  addInstanced(repairGroup, "repair_canopy_ribs", UNIT_BOX, mats.steelDark, repairRibs);

  // Workbench tools: red toolbox, bench vise, spare wheel & air pump
  box(repairGroup, "repair_toolbox_body", mats.toolboxRed, 28.05, -72.1, 0.44, 0.72, 0.34, 0.96, false);
  box(repairGroup, "repair_toolbox_handle", mats.steelBright, 28.05, -72.1, 0.08, 0.32, 0.08, 1.3, false);
  box(repairGroup, "repair_vise_base", mats.tealMetal, 27.8, -69.5, 0.24, 0.26, 0.18, 0.96, false);
  box(repairGroup, "repair_vise_jaw", mats.steelBright, 27.72, -69.5, 0.14, 0.22, 0.12, 1.12, false);
  box(repairGroup, "repair_battery_pack", mats.tealMetal, 28.1, -70.8, 0.36, 0.44, 0.26, 0.96, false);

  // Floor tire pump beside north end of workbench
  box(repairGroup, "repair_pump_base", mats.steelDark, 26.85, -68.4, 0.28, 0.28, 0.06, 0, false);
  box(repairGroup, "repair_pump_cylinder", mats.toolboxRed, 26.85, -68.4, 0.1, 0.1, 0.76, 0.06, false);
  box(repairGroup, "repair_pump_handle", mats.woodDark, 26.85, -68.4, 0.08, 0.32, 0.06, 0.82, false);
  pushObstacle("repair_pump", 26.85, -68.4, 0.28, 0.32, 0.88, 0);

  // Helper to construct a recognizable parked/mounted bicycle (aligned along y)
  const wheelPlacements = [];
  function buildCycle(namePrefix, s, y, baseH, frameMat) {
    wheelPlacements.push([s, y - 0.56, baseH, 0.68, 0.68, 0.68]);
    wheelPlacements.push([s, y + 0.56, baseH, 0.68, 0.68, 0.68]);
    box(repairGroup, `${namePrefix}_top_tube`, frameMat, s, y, 0.06, 0.68, 0.06, baseH + 0.66, false);
    box(repairGroup, `${namePrefix}_seat_tube`, frameMat, s, y - 0.16, 0.06, 0.06, 0.46, baseH + 0.32, false);
    box(repairGroup, `${namePrefix}_fork`, frameMat, s, y + 0.42, 0.08, 0.08, 0.56, baseH + 0.34, false);
    box(repairGroup, `${namePrefix}_saddle`, mats.rubberBlack, s, y - 0.18, 0.14, 0.24, 0.06, baseH + 0.78, false);
    box(repairGroup, `${namePrefix}_bars`, mats.steelBright, s, y + 0.42, 0.46, 0.06, 0.05, baseH + 0.88, false);
  }

  // Repair stand + elevated work bike in the north bay (s=27.8, y=-67.2)
  box(repairGroup, "repair_stand_base", mats.steelDark, 27.8, -67.2, 0.68, 1.55, 0.12, 0);
  box(repairGroup, "repair_stand_post", mats.steelDark, 28.05, -67.2, 0.1, 0.1, 1.12, 0.12, false);
  box(repairGroup, "repair_stand_clamp", mats.brass, 27.88, -67.2, 0.34, 0.08, 0.08, 1.04, false);
  buildCycle("repair_bay_cycle", 27.72, -67.2, 0.42, mats.bikeBlue);
  pushObstacle("repair_bay_cycle_zone", 27.75, -67.2, 0.72, 1.85, 1.25, 0);

  // Public U-loop cycle rack & docked commuter cycle at s=25.4, y=-66.7 (east of s=24)
  for (const ry of [-67.25, -66.15]) {
    box(repairGroup, `repair_rack_loop_${ry}`, mats.steelBright, 25.4, ry, 0.64, 0.07, 0.72, 0, false);
  }
  buildCycle("repair_rack_cycle", 25.4, -66.7, 0.0, mats.bikeRust);
  pushObstacle("repair_cycle_rack", 25.4, -66.7, 0.74, 1.85, 0.95, 0);

  // Spare tire rims racked on the west workshop wall
  wheelPlacements.push([28.56, -67.5, 1.5, 0.64, 0.64, 0.64]);
  wheelPlacements.push([28.56, -66.8, 1.5, 0.64, 0.64, 0.64]);
  addInstanced(repairGroup, "repair_cycle_wheels", UNIT_WHEEL, mats.rubberBlack, wheelPlacements);

  // Service rate placard stand (east of s=24)
  box(repairGroup, "repair_board_frame", mats.steelDark, 26.5, -73.6, 0.36, 0.78, 1.24, 0);
  addSign(
    repairGroup,
    "repair_rate_board",
    26.31,
    -73.6,
    0.72,
    "west",
    0.7,
    0.92,
    512,
    512,
    (ctx, cw, ch) =>
      drawInfoBoard(ctx, cw, ch, {
        bg: "#212d33",
        border: "#e2a23b",
        headingColor: "#f4eee1",
        lineColor: "#cdd8dc",
        heading: "REPAIR M-02",
        subheading: "CYCLE & UTILITY BENCH",
        rows: [
          ["TIRE AIR", "FREE"],
          ["BRAKE TUNE", "5 CR"],
          ["WHEEL TRUE", "8 CR"],
          ["TOOL LOAN", "BADGE"],
        ],
      }),
    { unlit: true, offset: true },
  );

  // ==========================================
  // 5. STOREFRONT M-03: CAFÉ ("SUNLINE ROASTERY", y = -58)
  // ==========================================
  const cafeGroup = new THREE.Group();
  cafeGroup.name = "meridian_market_cafe";
  root.add(cafeGroup);

  buildStorefrontShell(cafeGroup, "cafe", {
    y: -58,
    depth: 8.2,
    wallHeight: 3.55,
    wallMat: mats.cafeWall,
    roofMat: mats.cafeRoof,
    fasciaMat: mats.woodDark,
    trimMat: mats.tealMetal,
    counterDepth: 4.6,
    counterHeight: 0.96,
    awningMat: mats.awningBurgundy,
    awningBase: 2.7,
    badge: "M-03",
    title: "SUNLINE ROASTERY",
    subtitle: "CAFÉ · ESPRESSO · WARM PASTRIES",
    signBg: "#3d1e20",
    signAccent: "#e6be72",
    signText: "#f8efe0",
    graphicKind: "cafe",
    plaqueLabel: "CAFÉ",
  });

  // Gold awning border stripe & warm under-canopy pendant globes
  block(cafeGroup, "cafe_awning_gold_trim", mats.brass, 26.22, -58, 0.12, 7.82, 0.08, 2.74);
  const cafeGlobes = [];
  for (const gy of [-60.2, -58.0, -55.8]) {
    cafeGlobes.push([26.8, gy, 2.38, 0.22, 0.22, 0.22]);
  }
  addInstanced(cafeGroup, "cafe_pendant_globes", UNIT_SPHERE, mats.warmGlobe, cafeGlobes);

  // Espresso machine, grinder & glass pastry display case on counter (base = 0.96)
  box(cafeGroup, "cafe_espresso_body", mats.steelBright, 28.1, -58.5, 0.48, 0.72, 0.42, 0.96, false);
  box(cafeGroup, "cafe_espresso_top", mats.brass, 28.1, -58.5, 0.5, 0.74, 0.06, 1.38, false);
  box(cafeGroup, "cafe_grinder", mats.steelDark, 28.1, -59.35, 0.26, 0.26, 0.38, 0.96, false);
  box(cafeGroup, "cafe_pastry_tray", mats.woodDark, 27.82, -56.9, 0.48, 0.88, 0.06, 0.96, false);
  box(cafeGroup, "cafe_pastry_case", mats.glassCase, 27.82, -56.9, 0.46, 0.86, 0.34, 1.02, false);

  const pastryPlacements = [];
  for (let i = -1; i <= 1; i++) {
    pastryPlacements.push([27.82, -56.9 + i * 0.24, 1.04, 0.16, 0.16, 0.1]);
  }
  addInstanced(cafeGroup, "cafe_pastries", UNIT_SPHERE, mats.pastryGold, pastryPlacements);

  // Prominent wall-mounted café menu board beside pass-through (y = -60.9)
  box(cafeGroup, "cafe_wall_menu_frame", mats.woodDark, 28.64, -60.9, 0.06, 1.72, 1.38, 1.12, false);
  addSign(
    cafeGroup,
    "cafe_wall_menu",
    28.6,
    -60.9,
    1.81,
    "west",
    1.6,
    1.26,
    640,
    512,
    (ctx, cw, ch) =>
      drawInfoBoard(ctx, cw, ch, {
        bg: "#2b1d1c",
        border: "#e3bc74",
        headingColor: "#f9eed7",
        lineColor: "#ebd7be",
        heading: "SUNLINE ROASTERY",
        subheading: "CAFÉ MENU · M-03",
        rows: [
          ["FILTER COFFEE", "2 CR"],
          ["CARDAMOM LATTE", "3 CR"],
          ["ORCHARD TART", "3 CR"],
          ["OAT CROISSANT", "2 CR"],
        ],
      }),
    { unlit: true, offset: true },
  );

  // Sidewalk A-frame menu board at north café entrance (east of s=24)
  box(cafeGroup, "cafe_aframe_stand", mats.woodDark, 26.5, -54.7, 0.36, 0.78, 1.24, 0);
  addSign(
    cafeGroup,
    "cafe_sidewalk_menu",
    26.31,
    -54.7,
    0.72,
    "west",
    0.7,
    0.92,
    512,
    512,
    (ctx, cw, ch) =>
      drawInfoBoard(ctx, cw, ch, {
        bg: "#341d1e",
        border: "#e6be72",
        headingColor: "#fbf1dd",
        lineColor: "#ecd6ba",
        heading: "CAFÉ M-03",
        subheading: "OPEN WALK-UP BAR",
        rows: [
          ["ESPRESSO", "2 CR"],
          ["HERBAL TEA", "2 CR"],
          ["WARM TART", "3 CR"],
          ["SEATS HERE →", ""],
        ],
      }),
    { unlit: true, offset: true },
  );

  // Café outdoor bistro tables & seats (flanking counter approach, east of s=24)
  const bistroCenters = [
    [25.4, -55.2],
    [25.4, -60.8],
  ];
  const tablePedestals = [];
  const tableTops = [];
  const chairSeats = [];
  const chairBacks = [];
  const chairLegs = [];
  const cupPlacements = [
    [27.8, -57.75, 0.96, 0.11, 0.11, 0.12],
    [27.8, -57.95, 0.96, 0.11, 0.11, 0.12],
  ];

  for (let i = 0; i < bistroCenters.length; i++) {
    const [ts, ty] = bistroCenters[i];
    tablePedestals.push([ts, ty, 0, 0.12, 0.12, 0.72]);
    tableTops.push([ts, ty, 0.72, 0.76, 0.76, 0.05]);
    cupPlacements.push([ts + 0.1, ty + 0.08, 0.77, 0.1, 0.1, 0.1]);
    pushObstacle(`cafe_bistro_table_${i + 1}`, ts, ty, 0.78, 0.78, 0.77, 0);

    for (const [sideTag, dirY] of [
      ["south", -1],
      ["north", 1],
    ]) {
      const cy = ty + dirY * 0.78;
      chairSeats.push([ts, cy, 0.42, 0.44, 0.44, 0.05]);
      chairBacks.push([ts, cy + dirY * 0.19, 0.47, 0.44, 0.06, 0.36]);
      for (const ls of [-0.18, 0.18]) {
        for (const ly of [-0.18, 0.18]) {
          chairLegs.push([ts + ls, cy + ly, 0, 0.05, 0.05, 0.42]);
        }
      }
      pushObstacle(`cafe_seat_${i + 1}_${sideTag}`, ts, cy, 0.48, 0.48, 0.83, 0);
    }
  }

  addInstanced(cafeGroup, "cafe_table_pedestals", UNIT_CYLINDER, mats.steelDark, tablePedestals);
  addInstanced(cafeGroup, "cafe_table_tops", UNIT_CYLINDER, mats.woodWarm, tableTops);
  addInstanced(cafeGroup, "cafe_chair_seats", UNIT_BOX, mats.woodWarm, chairSeats);
  addInstanced(cafeGroup, "cafe_chair_backs", UNIT_BOX, mats.tealMetal, chairBacks);
  addInstanced(cafeGroup, "cafe_chair_legs", UNIT_BOX, mats.steelDark, chairLegs);
  addInstanced(cafeGroup, "cafe_cups", UNIT_CYLINDER, mats.ceramicCup, cupPlacements);

  // ==========================================
  // 6. PEDESTRIAN-SCALE WAYFINDING & LANE PROPS (all solid props east of s=24)
  // ==========================================
  const wayfindingGroup = new THREE.Group();
  wayfindingGroup.name = "meridian_market_wayfinding";
  root.add(wayfindingGroup);

  // North & south pedestrian-scale market lane directory posts
  const lanePosts = [
    {
      name: "market_north_directory",
      s: 24.8,
      y: -53.8,
      outerFacing: "north",
      outerY: -53.52,
      title: "MERIDIAN MARKET",
      sub: "SOUTH ALONG LANE ↓",
    },
    {
      name: "market_south_directory",
      s: 24.8,
      y: -88.2,
      outerFacing: "south",
      outerY: -88.48,
      title: "MERIDIAN MARKET",
      sub: "NORTH ALONG LANE ↑",
    },
  ];
  for (const post of lanePosts) {
    box(wayfindingGroup, `${post.name}_plinth`, mats.plinth, post.s, post.y, 0.62, 0.62, 0.32, 0);
    box(wayfindingGroup, `${post.name}_post`, mats.tealMetal, post.s, post.y, 0.52, 0.52, 1.9, 0.32);
    box(wayfindingGroup, `${post.name}_cap`, mats.brass, post.s, post.y, 0.58, 0.58, 0.08, 2.22, false);

    const drawDir = (ctx, cw, ch) =>
      drawInfoBoard(ctx, cw, ch, {
        bg: "#163839",
        border: "#dec27d",
        headingColor: "#f7eed8",
        lineColor: "#d9e4d7",
        heading: post.title,
        subheading: post.sub,
        rows: [
          ["M-01 · HARVEST", "SOUTH"],
          ["M-02 · REPAIR", "MID-LANE"],
          ["M-03 · CAFÉ", "NORTH"],
        ],
      });

    addSign(
      wayfindingGroup,
      `${post.name}_west_face`,
      post.s - 0.28,
      post.y,
      1.58,
      "west",
      0.56,
      0.95,
      512,
      512,
      drawDir,
      { unlit: true, offset: true },
    );
    addSign(
      wayfindingGroup,
      `${post.name}_approach_face`,
      post.s,
      post.outerY,
      1.58,
      post.outerFacing,
      0.56,
      0.95,
      512,
      512,
      drawDir,
      { unlit: true, offset: true },
    );
  }

  const propsGroup = new THREE.Group();
  propsGroup.name = "meridian_market_props";
  root.add(propsGroup);

  // Low pedestrian bollard lanterns along apron margin (s = 24.6, east of s = 24)
  const bollardPosts = [];
  const bollardGlobes = [];
  for (const by of [-85.8, -76.0, -64.0]) {
    bollardPosts.push([24.6, by, 0, 0.24, 0.24, 0.96]);
    bollardGlobes.push([24.6, by, 0.96, 0.22, 0.22, 0.22]);
    pushObstacle(`market_bollard_${by}`, 24.6, by, 0.3, 0.3, 1.2, 0);
  }
  addInstanced(propsGroup, "market_bollard_posts", UNIT_BOX, mats.tealMetal, bollardPosts);
  addInstanced(propsGroup, "market_bollard_globes", UNIT_BOX, mats.warmGlobe, bollardGlobes);

  // Between-shop pocket planters & utility bins (y = -76 and y = -64)
  for (const [idx, py] of [
    [1, -76.0],
    [2, -64.0],
  ]) {
    box(propsGroup, `market_pocket_planter_${idx}`, mats.plinth, 29.8, py, 1.6, 1.8, 0.52, 0);
    box(propsGroup, `market_pocket_soil_${idx}`, mats.earth, 29.8, py, 1.42, 1.62, 0.06, 0.5, false);
    box(propsGroup, `market_pocket_shrub_${idx}`, mats.foliage, 29.8, py, 1.2, 1.35, 0.55, 0.56, false);
  }
  // Extra stacked crates in south pocket & sorting bins in north pocket
  box(propsGroup, "market_pocket_crate_stack", mats.crateWood, 32.2, -76.0, 1.1, 1.3, 0.9, 0);
  box(propsGroup, "market_pocket_compost_bin", mats.produceRoof, 32.0, -64.45, 0.72, 0.72, 0.95, 0);
  box(propsGroup, "market_pocket_recycle_bin", mats.tealMetal, 32.0, -63.55, 0.72, 0.72, 0.95, 0);

  return { obstacles };
}
