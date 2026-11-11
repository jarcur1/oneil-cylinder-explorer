import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import {
  addSurfaceBox,
  addSurfacePatch,
  addSurfaceSign,
  setSurfaceMatrix,
} from "./surface.js";

// Reusable unit geometries for shared details
const unitCylinderGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateX(
  Math.PI / 2,
);
const unitSphereGeo = new THREE.SphereGeometry(0.5, 8, 8);
const tempMatrix = new THREE.Matrix4();

/**
 * Builds the west-side village, central square, orchard, and orchard overlook platform.
 * Conforms to the cylinder habitat curvature with arc s and longitudinal y coordinates.
 *
 * @param {THREE.Object3D} parent
 * @returns {{ obstacles: Array<{ theta: number, y: number, width: number, depth: number, height: number }> }}
 */
export function createVillage(parent) {
  const obstacles = [];

  // ==========================================
  // SHARED MATERIALS (Earth tones, teal & warm accents)
  // ==========================================
  const mats = {
    // Paving
    promenadePaving: new THREE.MeshStandardMaterial({
      color: 0x82847c,
      roughness: 0.86,
      metalness: 0.08,
    }),
    plazaStone: new THREE.MeshStandardMaterial({
      color: 0x939187,
      roughness: 0.82,
      metalness: 0.06,
    }),
    plazaInlay: new THREE.MeshStandardMaterial({
      color: 0x5a5c56,
      roughness: 0.88,
      metalness: 0.1,
    }),
    crosslaneStone: new THREE.MeshStandardMaterial({
      color: 0x8a857b,
      roughness: 0.88,
      metalness: 0.05,
    }),
    woodDeck: new THREE.MeshStandardMaterial({
      color: 0x765438,
      roughness: 0.74,
      metalness: 0.08,
    }),
    stonePlinth: new THREE.MeshStandardMaterial({
      color: 0x5e5c56,
      roughness: 0.9,
      metalness: 0.04,
    }),
    orchardLoam: new THREE.MeshStandardMaterial({
      color: 0x47392b,
      roughness: 0.94,
      metalness: 0.02,
    }),

    // Walls & Plaster
    wallCream: new THREE.MeshStandardMaterial({
      color: 0xf1ecdf,
      roughness: 0.85,
      metalness: 0.05,
    }),
    wallWarm: new THREE.MeshStandardMaterial({
      color: 0xe6dabf,
      roughness: 0.85,
      metalness: 0.05,
    }),
    wallTerracotta: new THREE.MeshStandardMaterial({
      color: 0xc87152,
      roughness: 0.86,
      metalness: 0.04,
    }),
    wallSage: new THREE.MeshStandardMaterial({
      color: 0x6e8371,
      roughness: 0.84,
      metalness: 0.06,
    }),
    wallTealPlaster: new THREE.MeshStandardMaterial({
      color: 0x2e5c58,
      roughness: 0.8,
      metalness: 0.1,
    }),
    stoneBase: new THREE.MeshStandardMaterial({
      color: 0x615d55,
      roughness: 0.9,
      metalness: 0.06,
    }),

    // Roofs
    roofTeal: new THREE.MeshStandardMaterial({
      color: 0x265a56,
      roughness: 0.5,
      metalness: 0.22,
    }),
    roofTerracotta: new THREE.MeshStandardMaterial({
      color: 0xb55737,
      roughness: 0.6,
      metalness: 0.12,
    }),
    roofSlate: new THREE.MeshStandardMaterial({
      color: 0x333b41,
      roughness: 0.55,
      metalness: 0.2,
    }),
    roofCopperTrim: new THREE.MeshStandardMaterial({
      color: 0x437d74,
      roughness: 0.42,
      metalness: 0.35,
    }),

    // Wood & Trim
    woodDark: new THREE.MeshStandardMaterial({
      color: 0x483222,
      roughness: 0.82,
      metalness: 0.04,
    }),
    woodWarm: new THREE.MeshStandardMaterial({
      color: 0x8a5b36,
      roughness: 0.76,
      metalness: 0.06,
    }),
    doorDark: new THREE.MeshStandardMaterial({
      color: 0x3d2719,
      roughness: 0.72,
      metalness: 0.08,
    }),
    brassAccent: new THREE.MeshStandardMaterial({
      color: 0xd6a147,
      roughness: 0.35,
      metalness: 0.75,
    }),

    // Glazing & Warm Interior
    glassReflect: new THREE.MeshStandardMaterial({
      color: 0x9edbe0,
      roughness: 0.25,
      metalness: 0.75,
    }),
    windowLit: new THREE.MeshStandardMaterial({
      color: 0xfff0c4,
      emissive: 0xffc966,
      emissiveIntensity: 1.1,
      roughness: 0.3,
      metalness: 0.1,
    }),

    // Street Furniture & Metal
    wroughtIron: new THREE.MeshStandardMaterial({
      color: 0x24282a,
      roughness: 0.62,
      metalness: 0.7,
    }),
    lanternGlow: new THREE.MeshStandardMaterial({
      color: 0xfff1cf,
      emissive: 0xffb847,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.1,
    }),

    // Fabric Awnings
    awningTeal: new THREE.MeshStandardMaterial({
      color: 0x276662,
      roughness: 0.8,
      metalness: 0.05,
    }),
    awningGold: new THREE.MeshStandardMaterial({
      color: 0xd49735,
      roughness: 0.8,
      metalness: 0.05,
    }),
    awningRust: new THREE.MeshStandardMaterial({
      color: 0xa6452f,
      roughness: 0.8,
      metalness: 0.05,
    }),
    awningCream: new THREE.MeshStandardMaterial({
      color: 0xf5f0e1,
      roughness: 0.8,
      metalness: 0.05,
    }),

    // Foliage & Orchard
    foliageShrub: new THREE.MeshStandardMaterial({
      color: 0x436d39,
      roughness: 0.84,
      metalness: 0.04,
    }),
    flowerAccent: new THREE.MeshStandardMaterial({
      color: 0xd95b77,
      roughness: 0.8,
      metalness: 0.05,
    }),
    orchardBark: new THREE.MeshStandardMaterial({
      color: 0x513a29,
      roughness: 0.9,
      metalness: 0.05,
    }),
    orchardCanopy: new THREE.MeshStandardMaterial({
      color: 0x3e7136,
      roughness: 0.78,
      metalness: 0.04,
    }),
    appleRed: new THREE.MeshStandardMaterial({
      color: 0xd43328,
      roughness: 0.35,
      metalness: 0.1,
    }),
    citrusGold: new THREE.MeshStandardMaterial({
      color: 0xf2a424,
      roughness: 0.38,
      metalness: 0.1,
    }),
  };

  // ==========================================
  // 1. GROUND PAVING & THOROUGHFARES
  // ==========================================
  // Full-length promenade path s[-4, 4] through the village district
  addSurfacePatch(parent, mats.promenadePaving, 0, -203.5, 8.0, 171.0, 0.052);

  // Market Square paving around (s=0, y=-230), 34m wide x 32m deep (s[-17, 17], y[-246, -214])
  addSurfacePatch(parent, mats.plazaStone, 0, -230.0, 34.0, 32.0, 0.06);

  // Decorative inner plaza courtyard inlay outside radius 11
  addSurfacePatch(parent, mats.plazaInlay, 0, -230.0, 18.0, 18.0, 0.065);
  addSurfacePatch(parent, mats.plazaStone, 0, -230.0, 14.0, 14.0, 0.07);

  // East Crosslane at y=-246 leading from square (s=0..17..35) towards east glasshouse
  addSurfacePatch(parent, mats.crosslaneStone, 26.0, -246.0, 18.0, 6.0, 0.062);

  // Connect the farm's north lane to the promenade and orchard steps.
  addSurfacePatch(parent, mats.crosslaneStone, -11.5, -174.0, 93.0, 6.0, 0.062);

  // North-South approach path from crosslane y=-174 north into the overlook stairs (y=-162.6)
  addSurfacePatch(parent, mats.crosslaneStone, -58.0, -168.0, 6.0, 12.0, 0.064);

  // ==========================================
  // 2. ENTRY GATEWAY AT y = -285
  // ==========================================
  // Stately entrance archway marking Greenway Commons.
  addSurfaceBox(parent, mats.stoneBase, -4.6, -285.0, 0.9, 0.9, 4.6, 0);
  addSurfaceBox(parent, mats.stoneBase, 4.6, -285.0, 0.9, 0.9, 4.6, 0);
  obstacles.push(
    { theta: -4.6 / RADIUS, y: -285.0, width: 0.9, depth: 0.9, height: 4.6 },
    { theta: 4.6 / RADIUS, y: -285.0, width: 0.9, depth: 0.9, height: 4.6 },
  );

  // Pillar decorative capitals
  addSurfaceBox(parent, mats.stonePlinth, -4.6, -285.0, 1.1, 1.1, 0.3, 4.6);
  addSurfaceBox(parent, mats.stonePlinth, 4.6, -285.0, 1.1, 1.1, 0.3, 4.6);

  // Overhead crossbeam at base 4.2m spanning across the road
  addSurfaceBox(parent, mats.woodDark, 0, -285.0, 10.2, 0.7, 0.5, 4.2);
  addSurfaceBox(parent, mats.roofTeal, 0, -285.0, 10.6, 0.9, 0.25, 4.7);

  // Tasteful heraldic banners hanging on outer pillars
  addSurfaceBox(parent, mats.awningTeal, -4.6, -284.9, 0.5, 0.08, 1.6, 2.2);
  addSurfaceBox(parent, mats.awningGold, 4.6, -284.9, 0.5, 0.08, 1.6, 2.2);

  // Entry Signboard facing approaching players (+Y direction)
  addSurfaceSign(
    parent,
    "GREENWAY COMMONS\nVillage Square & Orchard",
    0,
    -285.0,
    7.2,
    4.25,
  );

  // ==========================================
  // 3. HAND-DESIGNED DETAILED BUILDINGS (11 Buildings)
  // ==========================================
  // Helper to construct architectural human-scale buildings
  function buildHouse(config) {
    const {
      s,
      y,
      width,
      depth,
      wallHeight,
      wallMat,
      roofMat,
      facing, // 'east', 'west', or 'south'
      doorOffset = 0,
      shopfrontAwningMat = null,
      twoStory = false,
      chimney = false,
    } = config;

    // Solid collision obstacle covering the ground-based building footprint
    obstacles.push({
      theta: s / RADIUS,
      y,
      width,
      depth,
      height: wallHeight,
    });

    // 1. Ground masonry base
    addSurfaceBox(
      parent,
      mats.stoneBase,
      s,
      y,
      width + 0.16,
      depth + 0.16,
      0.5,
      0,
    );

    // 2. Main walls
    addSurfaceBox(parent, wallMat, s, y, width, depth, wallHeight, 0);

    // 3. Roof eaves & pitched stepped tiers
    const eaveW = width + 0.8;
    const eaveD = depth + 0.8;
    addSurfaceBox(parent, mats.woodDark, s, y, eaveW, eaveD, 0.25, wallHeight);

    // Stepped pitch silhouette (mansard / hip tiers)
    addSurfaceBox(
      parent,
      roofMat,
      s,
      y,
      width - 0.4,
      depth - 0.4,
      0.7,
      wallHeight + 0.2,
    );
    addSurfaceBox(
      parent,
      roofMat,
      s,
      y,
      width - 1.8,
      depth - 1.6,
      0.7,
      wallHeight + 0.8,
    );
    addSurfaceBox(
      parent,
      mats.roofCopperTrim,
      s,
      y,
      width - 3.2,
      depth - 2.8,
      0.35,
      wallHeight + 1.4,
    );

    // Optional brick chimney
    if (chimney) {
      const chimS = s - width * 0.35;
      const chimY = y + depth * 0.25;
      addSurfaceBox(
        parent,
        mats.wallTerracotta,
        chimS,
        chimY,
        1.2,
        1.2,
        wallHeight + 2.2,
        0,
      );
      addSurfaceBox(
        parent,
        mats.stoneBase,
        chimS,
        chimY,
        1.4,
        1.4,
        0.2,
        wallHeight + 2.1,
      );
    }

    // 4. Human-scale Doors (~2.4m) and Windows based on orientation
    if (facing === "east") {
      // Facing east towards promenade (door on east wall: s + width/2)
      const wallFaceS = s + width / 2;
      const doorY = y + doorOffset;

      // Dark timber door with brass handle
      addSurfaceBox(
        parent,
        mats.doorDark,
        wallFaceS + 0.05,
        doorY,
        0.12,
        1.4,
        2.4,
        0,
      );
      addSurfaceBox(
        parent,
        mats.woodDark,
        wallFaceS + 0.06,
        doorY,
        0.16,
        1.6,
        2.5,
        0,
      );
      addSurfaceBox(
        parent,
        mats.brassAccent,
        wallFaceS + 0.12,
        doorY + 0.5,
        0.06,
        0.1,
        0.12,
        1.15,
      );

      // Windows
      const winOffsets = [-depth * 0.28, depth * 0.28];
      for (const wOff of winOffsets) {
        const winY = y + wOff;
        if (Math.abs(winY - doorY) > 1.2) {
          addSurfaceBox(
            parent,
            mats.windowLit,
            wallFaceS + 0.05,
            winY,
            0.1,
            1.5,
            1.5,
            1.0,
          );
          addSurfaceBox(
            parent,
            mats.woodDark,
            wallFaceS + 0.07,
            winY,
            0.14,
            1.7,
            0.1,
            0.95,
          );
          addSurfaceBox(
            parent,
            mats.woodDark,
            wallFaceS + 0.07,
            winY,
            0.14,
            1.7,
            0.1,
            2.5,
          );
          if (twoStory) {
            addSurfaceBox(
              parent,
              mats.glassReflect,
              wallFaceS + 0.05,
              winY,
              0.1,
              1.3,
              1.3,
              3.2,
            );
            addSurfaceBox(
              parent,
              mats.woodDark,
              wallFaceS + 0.07,
              winY,
              0.14,
              1.5,
              0.1,
              3.15,
            );
          }
        }
      }

      // Front awning
      if (shopfrontAwningMat) {
        addSurfaceBox(
          parent,
          shopfrontAwningMat,
          wallFaceS + 0.7,
          y,
          1.4,
          depth * 0.75,
          0.2,
          2.85,
        );
      }
    } else if (facing === "west") {
      // Facing west towards promenade (door on west wall: s - width/2)
      const wallFaceS = s - width / 2;
      const doorY = y + doorOffset;

      addSurfaceBox(
        parent,
        mats.doorDark,
        wallFaceS - 0.05,
        doorY,
        0.12,
        1.4,
        2.4,
        0,
      );
      addSurfaceBox(
        parent,
        mats.woodDark,
        wallFaceS - 0.06,
        doorY,
        0.16,
        1.6,
        2.5,
        0,
      );
      addSurfaceBox(
        parent,
        mats.brassAccent,
        wallFaceS - 0.12,
        doorY - 0.5,
        0.06,
        0.1,
        0.12,
        1.15,
      );

      const winOffsets = [-depth * 0.28, depth * 0.28];
      for (const wOff of winOffsets) {
        const winY = y + wOff;
        if (Math.abs(winY - doorY) > 1.2) {
          addSurfaceBox(
            parent,
            mats.windowLit,
            wallFaceS - 0.05,
            winY,
            0.1,
            1.5,
            1.5,
            1.0,
          );
          addSurfaceBox(
            parent,
            mats.woodDark,
            wallFaceS - 0.07,
            winY,
            0.14,
            1.7,
            0.1,
            0.95,
          );
          addSurfaceBox(
            parent,
            mats.woodDark,
            wallFaceS - 0.07,
            winY,
            0.14,
            1.7,
            0.1,
            2.5,
          );
          if (twoStory) {
            addSurfaceBox(
              parent,
              mats.glassReflect,
              wallFaceS - 0.05,
              winY,
              0.1,
              1.3,
              1.3,
              3.2,
            );
            addSurfaceBox(
              parent,
              mats.woodDark,
              wallFaceS - 0.07,
              winY,
              0.14,
              1.5,
              0.1,
              3.15,
            );
          }
        }
      }

      if (shopfrontAwningMat) {
        addSurfaceBox(
          parent,
          shopfrontAwningMat,
          wallFaceS - 0.7,
          y,
          1.4,
          depth * 0.75,
          0.2,
          2.85,
        );
      }
    } else if (facing === "south") {
      // Facing south towards square (door on south wall: y - depth/2)
      const wallFaceY = y - depth / 2;
      const doorS = s + doorOffset;

      addSurfaceBox(
        parent,
        mats.doorDark,
        doorS,
        wallFaceY - 0.05,
        1.4,
        0.12,
        2.4,
        0,
      );
      addSurfaceBox(
        parent,
        mats.woodDark,
        doorS,
        wallFaceY - 0.06,
        1.6,
        0.16,
        2.5,
        0,
      );

      const winOffsets = [-width * 0.28, width * 0.28];
      for (const wOff of winOffsets) {
        const winS = s + wOff;
        addSurfaceBox(
          parent,
          mats.windowLit,
          winS,
          wallFaceY - 0.05,
          1.5,
          0.1,
          1.5,
          1.0,
        );
        addSurfaceBox(
          parent,
          mats.woodDark,
          winS,
          wallFaceY - 0.07,
          1.7,
          0.14,
          0.1,
          0.95,
        );
        if (twoStory) {
          addSurfaceBox(
            parent,
            mats.glassReflect,
            winS,
            wallFaceY - 0.05,
            1.3,
            0.1,
            1.3,
            3.2,
          );
        }
      }

      if (shopfrontAwningMat) {
        addSurfaceBox(
          parent,
          shopfrontAwningMat,
          s,
          wallFaceY - 0.7,
          width * 0.75,
          1.4,
          0.2,
          2.85,
        );
      }
    }
  }

  // --- Building 1: "The Spindle Bakery & Cafe" (West promenade, South) ---
  buildHouse({
    s: -11.5,
    y: -272.0,
    width: 9.0,
    depth: 8.0,
    wallHeight: 4.2,
    wallMat: mats.wallCream,
    roofMat: mats.roofTeal,
    facing: "east",
    doorOffset: 0,
    shopfrontAwningMat: mats.awningTeal,
  });

  // --- Building 2: "Apothecary & Herbalist" (West promenade, Near Square) ---
  buildHouse({
    s: -12.0,
    y: -257.5,
    width: 8.5,
    depth: 7.5,
    wallHeight: 4.6,
    wallMat: mats.wallSage,
    roofMat: mats.roofSlate,
    facing: "east",
    doorOffset: 0.5,
    shopfrontAwningMat: mats.awningGold,
  });

  // --- Building 3: "Weaver's Atelier" (West village interior, South) ---
  buildHouse({
    s: -26.0,
    y: -266.0,
    width: 10.0,
    depth: 8.5,
    wallHeight: 5.0,
    wallMat: mats.wallTerracotta,
    roofMat: mats.roofTerracotta,
    facing: "east",
    doorOffset: -0.6,
    chimney: true,
  });

  // --- Building 4: "Outpost Provisioner" (East promenade, South) ---
  buildHouse({
    s: 13.0,
    y: -272.0,
    width: 8.0,
    depth: 8.0,
    wallHeight: 4.4,
    wallMat: mats.wallWarm,
    roofMat: mats.roofTeal,
    facing: "west",
    doorOffset: 0,
    shopfrontAwningMat: mats.awningRust,
  });

  // --- Building 5: "Greenway Seed & Tea Merchant" (East promenade, Near Square) ---
  buildHouse({
    s: 13.5,
    y: -257.5,
    width: 8.5,
    depth: 7.5,
    wallHeight: 4.5,
    wallMat: mats.wallCream,
    roofMat: mats.roofTerracotta,
    facing: "west",
    doorOffset: -0.4,
    shopfrontAwningMat: mats.awningTeal,
  });

  // --- Building 6: "The Meridian Tavern & Guest House" (Northwest Square) ---
  buildHouse({
    s: -13.0,
    y: -205.0,
    width: 9.5,
    depth: 9.0,
    wallHeight: 5.5,
    wallMat: mats.wallWarm,
    roofMat: mats.roofSlate,
    facing: "south",
    doorOffset: 0,
    twoStory: true,
    chimney: true,
    shopfrontAwningMat: mats.awningGold,
  });

  // --- Building 7: "Ceramics & Glassblower's Studio" (West promenade, Mid-North) ---
  buildHouse({
    s: -13.5,
    y: -189.0,
    width: 8.5,
    depth: 7.5,
    wallHeight: 4.2,
    wallMat: mats.wallTerracotta,
    roofMat: mats.roofTeal,
    facing: "east",
    doorOffset: 0,
  });
  // Dedicated kiln stack for the pottery
  addSurfaceBox(parent, mats.wallTerracotta, -17.2, -189.0, 1.8, 1.8, 6.2, 0);
  addSurfaceBox(parent, mats.stoneBase, -17.2, -189.0, 2.0, 2.0, 0.4, 6.0);
  obstacles.push({
    theta: -17.2 / RADIUS,
    y: -189.0,
    width: 1.8,
    depth: 1.8,
    height: 6.2,
  });

  // --- Building 8: "Greenway Botanical Archives" (East promenade, North of Square) ---
  // Sits at y=-205 (y[-209, -201]), strictly south of survey beacon reservation [8, 21], [-197, -183]
  buildHouse({
    s: 13.5,
    y: -205.0,
    width: 8.5,
    depth: 8.0,
    wallHeight: 5.0,
    wallMat: mats.wallCream,
    roofMat: mats.roofTeal,
    facing: "west",
    doorOffset: 0,
    twoStory: true,
  });

  // --- Building 9: "Cider Press & Orchard Store" (Northwest Promenade) ---
  buildHouse({
    s: -14.0,
    y: -151.0,
    width: 9.0,
    depth: 8.0,
    wallHeight: 4.5,
    wallMat: mats.wallWarm,
    roofMat: mats.roofTerracotta,
    facing: "east",
    doorOffset: 0,
  });

  // --- Building 10: "Horticultural Workshop" (Northwest Promenade End) ---
  buildHouse({
    s: -14.5,
    y: -132.0,
    width: 8.5,
    depth: 7.5,
    wallHeight: 4.2,
    wallMat: mats.wallSage,
    roofMat: mats.roofSlate,
    facing: "east",
    doorOffset: -0.4,
  });

  // --- Building 11: "Apiary & Meadow Honey House" (Northeast Promenade) ---
  // Sits at y=-145, strictly north of survey beacon reservation
  buildHouse({
    s: 14.5,
    y: -145.0,
    width: 8.5,
    depth: 8.0,
    wallHeight: 4.6,
    wallMat: mats.wallWarm,
    roofMat: mats.roofTerracotta,
    facing: "west",
    doorOffset: 0,
    shopfrontAwningMat: mats.awningGold,
  });

  // ==========================================
  // 4. MARKET SQUARE FIXTURES & FURNITURE
  // ==========================================
  // Square stop at (s=0, y=-230, radius 11) is kept completely unobstructed.
  // All market stalls, benches, planters, and lamps are strictly outside radius 11
  // and preserve the central s[-4, 4] promenade and the east lane at y=-246.

  // Helper for Market Stalls
  function createStall(s, y, canopyMat) {
    // Solid counter base
    addSurfaceBox(parent, mats.woodWarm, s, y, 3.4, 2.0, 0.9, 0);
    // Display crates with goods
    addSurfaceBox(parent, mats.woodDark, s - 0.7, y, 1.2, 1.4, 0.25, 0.9);
    addSurfaceBox(parent, mats.appleRed, s - 0.7, y, 1.0, 1.2, 0.15, 1.15);
    addSurfaceBox(parent, mats.woodDark, s + 0.7, y, 1.2, 1.4, 0.25, 0.9);
    addSurfaceBox(parent, mats.citrusGold, s + 0.7, y, 1.0, 1.2, 0.15, 1.15);

    // 4 Corner awning poles
    const poleOffsets = [
      [-1.5, -0.85],
      [1.5, -0.85],
      [-1.5, 0.85],
      [1.5, 0.85],
    ];
    for (const [ps, py] of poleOffsets) {
      addSurfaceBox(parent, mats.woodDark, s + ps, y + py, 0.1, 0.1, 1.8, 0.9);
    }
    // Canopy roof
    addSurfaceBox(parent, canopyMat, s, y, 3.8, 2.4, 0.22, 2.65);
    addSurfaceBox(parent, mats.awningCream, s, y, 3.5, 2.1, 0.15, 2.8);

    // Physical collision obstacle for the ground counter
    obstacles.push({
      theta: s / RADIUS,
      y,
      width: 3.4,
      depth: 2.0,
      height: 0.9,
    });
  }

  // 4 Charming Market Stalls at outer corners of the square (all > 14.7m from square center):
  // Stall 1 (NW): Orchard Fruits & Preserves
  createStall(-12.0, -218.0, mats.awningTeal);
  // Stall 2 (WNW): Village Bakery & Cheese
  createStall(-13.5, -224.0, mats.awningRust);
  // Stall 3 (WSW): Dried Herbs & Flower Bundles
  createStall(-13.0, -238.0, mats.awningGold);
  // Stall 4 (NE): Pottery, Glazes & Weavings
  createStall(12.0, -218.0, mats.awningTeal);

  // Decorative Benches (Seat height 0.45m - low jumpable street furniture)
  function createBench(s, y, width, depth, base = 0) {
    // Seat and supports share the same elevation as the supporting ground/deck.
    addSurfaceBox(parent, mats.woodWarm, s, y, width, depth, 0.1, base + 0.45);
    addSurfaceBox(
      parent,
      mats.wroughtIron,
      s - (width / 2 - 0.15),
      y,
      0.12,
      depth,
      0.45,
      base,
    );
    addSurfaceBox(
      parent,
      mats.wroughtIron,
      s + (width / 2 - 0.15),
      y,
      0.12,
      depth,
      0.45,
      base,
    );
    // Simple matching low collider
    obstacles.push({
      theta: s / RADIUS,
      y,
      width,
      depth,
      height: base + 0.55,
    });
  }

  // Square Benches placed outside radius 11
  createBench(-12.5, -231.0, 2.4, 0.8);
  createBench(-5.8, -218.5, 2.2, 0.8);
  createBench(5.8, -218.5, 2.2, 0.8);
  createBench(12.5, -226.0, 2.4, 0.8);

  // Stone Planters with Shrubs & Flowers
  function createPlanter(s, y) {
    addSurfaceBox(parent, mats.stonePlinth, s, y, 1.4, 1.4, 0.55, 0);
    addSurfaceBox(parent, mats.foliageShrub, s, y, 1.2, 1.2, 0.4, 0.55);
    addSurfaceBox(parent, mats.flowerAccent, s, y, 0.8, 0.8, 0.15, 0.9);
    obstacles.push({
      theta: s / RADIUS,
      y,
      width: 1.4,
      depth: 1.4,
      height: 0.55,
    });
  }

  createPlanter(-15.0, -215.0);
  createPlanter(15.0, -215.0);
  createPlanter(-15.0, -243.0);
  createPlanter(14.0, -236.0);

  // Wrought Iron Street Lamps with Warm Emissive Lanterns
  function createLamp(s, y) {
    addSurfaceBox(parent, mats.wroughtIron, s, y, 0.4, 0.4, 0.4, 0);
    addSurfaceBox(parent, mats.wroughtIron, s, y, 0.18, 0.18, 3.2, 0.4);
    addSurfaceBox(parent, mats.wroughtIron, s, y, 0.5, 0.5, 0.1, 3.55);
    addSurfaceBox(parent, mats.lanternGlow, s, y, 0.36, 0.36, 0.45, 3.65);
    addSurfaceBox(parent, mats.roofTeal, s, y, 0.55, 0.55, 0.2, 4.1);
    obstacles.push({
      theta: s / RADIUS,
      y,
      width: 0.4,
      depth: 0.4,
      height: 3.6,
    });
  }

  createLamp(-6.0, -242.0);
  createLamp(6.0, -242.0);
  createLamp(-6.0, -218.0);
  createLamp(6.0, -218.0);

  // ==========================================
  // 5. ACCESSIBLE ORCHARD OVERLOOK PLATFORM & STAIRS
  // ==========================================
  // Centered at s = -58, y = -145:
  // - Solid plinth: width 16 (s[-66, -50]), depth 16 (y[-153, -137]), height 2.16
  // - Curved deck paving patch at h = 2.18
  // - 12 cumulative solid steps approaching from south along s = -58
  //   Step centres: y = -162.2 + 0.8 * i for i = 0..11, widths 4, depths 0.8, heights 0.18 * (i + 1)
  //   Last step (i=11) adjoins platform south edge y = -153
  // - Railings on west, east, north, and south wings (leaving width 4 gap for stair entry)
  //   Railings collision obstacles are ground-based narrow boxes to height 3.2

  // Solid Plinth Base
  addSurfaceBox(parent, mats.stonePlinth, -58.0, -145.0, 16.0, 16.0, 2.16, 0);
  obstacles.push({
    theta: -58.0 / RADIUS,
    y: -145.0,
    width: 16.0,
    depth: 16.0,
    height: 2.16,
  });

  // Curved deck paving top surface at h = 2.18m
  addSurfacePatch(parent, mats.woodDeck, -58.0, -145.0, 16.0, 16.0, 2.18);

  // 12 Cumulative Solid Steps
  for (let i = 0; i < 12; i++) {
    const stepY = -162.2 + 0.8 * i;
    const stepH = 0.18 * (i + 1);

    // Stone step body
    addSurfaceBox(parent, mats.stonePlinth, -58.0, stepY, 4.0, 0.8, stepH, 0);
    // Non-slip wood nosing / tread
    addSurfaceBox(parent, mats.woodDeck, -58.0, stepY, 4.04, 0.82, 0.04, stepH);

    // Solid ground-based collision record for each step
    obstacles.push({
      theta: -58.0 / RADIUS,
      y: stepY,
      width: 4.0,
      depth: 0.8,
      height: stepH,
    });
  }

  // Overlook Railings (West, East, North, and South wings leaving width 4 gap)
  // Posts spaced every 2m, handrails above deck (base 2.16 to 3.2m).
  // Ground-based collision obstacles to height 3.2m prevent stepping off the deck.

  // Helper for railing segments
  function buildRailing(s1, y1, s2, y2, isNorthOrSouth) {
    const lenS = Math.abs(s2 - s1);
    const lenY = Math.abs(y2 - y1);
    const midS = (s1 + s2) / 2;
    const midY = (y1 + y2) / 2;

    if (isNorthOrSouth) {
      // Railing running along s (North or South)
      const w = lenS;
      const d = 0.14;
      const numPosts = Math.max(2, Math.round(w / 2) + 1);
      for (let k = 0; k < numPosts; k++) {
        const postS = s1 + (w * k) / (numPosts - 1);
        addSurfaceBox(
          parent,
          mats.wroughtIron,
          postS,
          midY,
          0.12,
          0.12,
          1.05,
          2.16,
        );
      }
      // Top handrail & mid rail
      addSurfaceBox(parent, mats.woodWarm, midS, midY, w, 0.16, 0.08, 3.13);
      addSurfaceBox(parent, mats.wroughtIron, midS, midY, w, 0.08, 0.04, 2.65);

      // Narrow ground-based collision strip to height 3.2
      obstacles.push({
        theta: midS / RADIUS,
        y: midY,
        width: w,
        depth: 0.45,
        height: 3.2,
      });
    } else {
      // Railing running along y (West or East)
      const w = 0.14;
      const d = lenY;
      const numPosts = Math.max(2, Math.round(d / 2) + 1);
      for (let k = 0; k < numPosts; k++) {
        const postY = y1 + (d * k) / (numPosts - 1);
        addSurfaceBox(
          parent,
          mats.wroughtIron,
          midS,
          postY,
          0.12,
          0.12,
          1.05,
          2.16,
        );
      }
      // Top handrail & mid rail
      addSurfaceBox(parent, mats.woodWarm, midS, midY, 0.16, d, 0.08, 3.13);
      addSurfaceBox(parent, mats.wroughtIron, midS, midY, 0.08, d, 0.04, 2.65);

      // Narrow ground-based collision strip to height 3.2
      obstacles.push({
        theta: midS / RADIUS,
        y: midY,
        width: 0.45,
        depth: d,
        height: 3.2,
      });
    }
  }

  // West Railing (s = -65.8, y from -153 to -137)
  buildRailing(-65.8, -153.0, -65.8, -137.0, false);

  // East Railing (s = -50.2, y from -153 to -137)
  buildRailing(-50.2, -153.0, -50.2, -137.0, false);

  // North Railing (y = -137.2, s from -66 to -50)
  buildRailing(-66.0, -137.2, -50.0, -137.2, true);

  // South Railing West Wing (y = -152.8, s from -66 to -60)
  buildRailing(-66.0, -152.8, -60.0, -152.8, true);

  // South Railing East Wing (y = -152.8, s from -56 to -50)
  buildRailing(-56.0, -152.8, -50.0, -152.8, true);
  // (Notice: stair entrance s[-60, -56] is kept completely open with no railing!)

  // Overlook Deck Furniture & Fixtures
  // Brass observation telescope fixture on north deck edge overlooking the orchard
  addSurfaceBox(parent, mats.wroughtIron, -58.0, -138.5, 0.35, 0.35, 1.1, 2.16);
  addSurfaceBox(parent, mats.brassAccent, -58.0, -138.5, 0.2, 0.65, 0.2, 3.26);

  // Deck wooden benches along west and east railings
  createBench(-64.5, -145.0, 1.0, 2.4, 2.18);
  createBench(-51.5, -145.0, 1.0, 2.4, 2.18);

  // ==========================================
  // 6. ORCHARD GROVE (s[-80, -36], y[-190, -165])
  // ==========================================
  // Rich earth ground patches for 4 orchard plots
  // Plot 1: SW (s[-80, -62], y[-192, -178])
  addSurfacePatch(parent, mats.orchardLoam, -71.0, -185.0, 18.0, 14.0, 0.055);
  // Plot 2: SE (s[-54, -36], y[-192, -178])
  addSurfacePatch(parent, mats.orchardLoam, -45.0, -185.0, 18.0, 14.0, 0.055);
  // Plot 3: NW (s[-80, -62], y[-171, -163])
  addSurfacePatch(parent, mats.orchardLoam, -71.0, -167.0, 18.0, 8.0, 0.055);
  // Plot 4: NE (s[-54, -36], y[-171, -163])
  addSurfacePatch(parent, mats.orchardLoam, -45.0, -167.0, 18.0, 8.0, 0.055);

  // Instanced orchard trees with trunks, lush canopies, and ripe fruit
  const treeCoords = [
    // South-West plot (Apples)
    { s: -76, y: -188, type: "apple" },
    { s: -67, y: -188, type: "apple" },
    { s: -76, y: -181, type: "apple" },
    { s: -67, y: -181, type: "apple" },
    // South-East plot (Citrus / Pears)
    { s: -49, y: -188, type: "citrus" },
    { s: -40, y: -188, type: "citrus" },
    { s: -49, y: -181, type: "citrus" },
    { s: -40, y: -181, type: "citrus" },
    // North-West plot (Apples)
    { s: -76, y: -167, type: "apple" },
    { s: -67, y: -167, type: "apple" },
    // North-East plot (Citrus)
    { s: -49, y: -167, type: "citrus" },
    { s: -40, y: -167, type: "citrus" },
    // Deep South boundary grove
    { s: -76, y: -193, type: "apple" },
    { s: -67, y: -193, type: "apple" },
    { s: -49, y: -193, type: "citrus" },
    { s: -40, y: -193, type: "citrus" },
  ];

  const numTrees = treeCoords.length;
  const trunkMesh = new THREE.InstancedMesh(
    unitCylinderGeo,
    mats.orchardBark,
    numTrees,
  );
  const canopyMesh = new THREE.InstancedMesh(
    unitSphereGeo,
    mats.orchardCanopy,
    numTrees * 2,
  );
  const fruitPerTree = 5;
  const appleMesh = new THREE.InstancedMesh(
    unitSphereGeo,
    mats.appleRed,
    numTrees * fruitPerTree,
  );
  const citrusMesh = new THREE.InstancedMesh(
    unitSphereGeo,
    mats.citrusGold,
    numTrees * fruitPerTree,
  );

  let canopyIdx = 0;
  let appleIdx = 0;
  let citrusIdx = 0;

  for (let t = 0; t < numTrees; t++) {
    const { s: ts, y: ty, type } = treeCoords[t];

    // Tree trunk (height 2.2m, diameter 0.38m)
    setSurfaceMatrix(tempMatrix, ts / RADIUS, ty, 0, 0.38, 0.38, 2.2);
    trunkMesh.setMatrixAt(t, tempMatrix);

    // Main canopy foliage (sphere radius ~1.5m at base 1.8m)
    setSurfaceMatrix(tempMatrix, ts / RADIUS, ty, 1.8, 2.8, 2.8, 2.4);
    canopyMesh.setMatrixAt(canopyIdx++, tempMatrix);

    // Secondary upper canopy layer
    setSurfaceMatrix(tempMatrix, ts / RADIUS, ty, 2.8, 2.0, 2.0, 1.8);
    canopyMesh.setMatrixAt(canopyIdx++, tempMatrix);

    // Fruit clusters in the foliage
    const isApple = type === "apple";
    const fruitOffsets = [
      [-0.8, -0.7, 2.1],
      [0.9, -0.6, 2.3],
      [-0.7, 0.8, 2.2],
      [0.8, 0.7, 2.4],
      [0.0, 1.0, 2.0],
    ];

    for (const [fs, fy, fh] of fruitOffsets) {
      setSurfaceMatrix(
        tempMatrix,
        (ts + fs) / RADIUS,
        ty + fy,
        fh,
        0.3,
        0.3,
        0.3,
      );
      if (isApple) {
        appleMesh.setMatrixAt(appleIdx++, tempMatrix);
      } else {
        citrusMesh.setMatrixAt(citrusIdx++, tempMatrix);
      }
    }
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  appleMesh.count = appleIdx;
  appleMesh.instanceMatrix.needsUpdate = true;
  citrusMesh.count = citrusIdx;
  citrusMesh.instanceMatrix.needsUpdate = true;

  parent.add(trunkMesh);
  parent.add(canopyMesh);
  if (appleIdx > 0) parent.add(appleMesh);
  if (citrusIdx > 0) parent.add(citrusMesh);

  // Low wooden orchard perimeter post & rail fence along outer edge
  for (let fy = -193; fy <= -165; fy += 4) {
    addSurfaceBox(parent, mats.woodDark, -80.0, fy, 0.15, 0.15, 0.9, 0);
    addSurfaceBox(parent, mats.woodDark, -80.0, fy + 2, 0.08, 4.0, 0.08, 0.75);
  }

  // ==========================================
  // 7. DIRECTIONAL WORLD SIGNS
  // ==========================================
  // 1. Sign pointing East towards Glasshouse 01 near Square entrance (s=4.2, y=-246.5)
  addSurfaceBox(parent, mats.woodDark, 4.2, -246.5, 0.22, 0.22, 2.4, 0);
  addSurfaceSign(
    parent,
    "GLASSHOUSE 01  -->\nEast Lane (s = 64)",
    4.2,
    -246.5,
    4.2,
    2.4,
  );

  // 2. Sign pointing West towards Orchard Overlook along Promenade (s=-4.2, y=-176.0)
  addSurfaceBox(parent, mats.woodDark, -4.2, -176.0, 0.22, 0.22, 2.4, 0);
  addSurfaceSign(
    parent,
    "<--  ORCHARD OVERLOOK\nWest Lane (s = -58)",
    -4.2,
    -176.0,
    4.2,
    2.4,
  );

  // 3. Sign at the Overlook stair approach (s=-55.5, y=-164.0)
  addSurfaceBox(parent, mats.woodDark, -55.5, -164.0, 0.2, 0.2, 2.2, 0);
  addSurfaceSign(
    parent,
    "ORCHARD OVERLOOK\nObservation Deck",
    -55.5,
    -164.0,
    3.4,
    2.2,
  );

  return { obstacles };
}
