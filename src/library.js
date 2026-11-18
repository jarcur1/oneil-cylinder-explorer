import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { LIBRARY_LAYOUT } from "./library-layout.js";
import { addCivicSolid } from "./civic-primitives.js";
import { addSurfaceBox, addOrientedPanel, setSurfaceMatrix, surfacePos } from "./surface.js";

// Static, local Meridian geometry. The district parent applies its Y offset once.
export function createLibrary(parent) {
  const group = new THREE.Group();
  group.name = "libraryReadingRoom";
  parent.add(group);
  const obstacles = [];
  const layout = LIBRARY_LAYOUT;
  const { minS, maxS, minY, maxY } = layout.bounds;
  const centerS = (minS + maxS) / 2;
  const centerY = (minY + maxY) / 2;
  const width = maxS - minS;
  const depth = maxY - minY;
  const wall = layout.wallThickness;
  const mats = {
    plaster: new THREE.MeshStandardMaterial({ color: 0xd8cfb9, roughness: 0.92 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x8c7660, roughness: 0.86 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xd9d0ba, roughness: 0.94 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x654535, roughness: 0.72 }),
    table: new THREE.MeshStandardMaterial({ color: 0xa47a50, roughness: 0.66 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x52716a, roughness: 0.91 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x514739, metalness: 0.55, roughness: 0.48 }),
    shade: new THREE.MeshStandardMaterial({
      color: 0xffe4b5, emissive: 0xffcc88, emissiveIntensity: 0.8, roughness: 0.65,
    }),
    paper: new THREE.MeshStandardMaterial({ color: 0xf1e5c7, roughness: 0.95 }),
    cover: new THREE.MeshStandardMaterial({ color: 0x2c5a59, roughness: 0.8 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x564c40, roughness: 0.95 }),
  };

  function collision(name, s, y, w, d, h, base) {
    obstacles.push({ name, theta: s / RADIUS, y, width: w, depth: d, height: h, base });
  }
  function solid(name, material, s, y, w, d, h, base) {
    const mesh = addCivicSolid(group, material, obstacles, s, y, w, d, h, base);
    mesh.name = name;
    obstacles[obstacles.length - 1].name = name;
    return mesh;
  }
  function box(parentGroup, name, material, s, y, w, d, h, base, collidable = true) {
    const mesh = addSurfaceBox(parentGroup, material, s, y, w, d, h, base);
    mesh.name = name;
    if (collidable) collision(name, s, y, w, d, h, base);
    return mesh;
  }

  solid("libraryFloor", mats.floor, centerS, centerY, width, depth, layout.floor, 0);
  solid("libraryCeiling", mats.ceiling, centerS, centerY, width, depth,
    layout.upperBase - layout.ceiling, layout.ceiling);
  const wallHeight = layout.ceiling - layout.floor;
  solid("libraryWallWest", mats.plaster, minS + wall / 2, centerY,
    wall, depth, wallHeight, layout.floor);
  solid("libraryWallNorth", mats.plaster, centerS, maxY - wall / 2,
    width - 2 * wall, wall, wallHeight, layout.floor);
  solid("libraryWallSouth", mats.plaster, centerS, minY + wall / 2,
    width - 2 * wall, wall, wallHeight, layout.floor);
  const doorSouth = layout.door.y - layout.door.width / 2;
  const doorNorth = layout.door.y + layout.door.width / 2;
  solid("libraryWallEastSouth", mats.plaster, maxS - wall / 2, (minY + doorSouth) / 2,
    wall, doorSouth - minY, wallHeight, layout.floor);
  solid("libraryWallEastNorth", mats.plaster, maxS - wall / 2, (maxY + doorNorth) / 2,
    wall, maxY - doorNorth, wallHeight, layout.floor);
  solid("libraryEntranceLintel", mats.plaster, maxS - wall / 2, layout.door.y,
    wall, layout.door.width, layout.ceiling - layout.door.top, layout.door.top);

  // Shelving occupies these case envelopes; books and shelves share geometry.
  const bookGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bookMaterial = new THREE.MeshStandardMaterial({ roughness: 0.83 });
  const bookColors = [0x405b60, 0xa47752, 0x77826a, 0xb39a6c, 0x724f46, 0x566278];
  const bookMatrix = new THREE.Matrix4();
  const bookColor = new THREE.Color();
  function shelf(name, s, y, w, d, alongS) {
    const shelfGroup = new THREE.Group();
    shelfGroup.name = name;
    group.add(shelfGroup);
    const top = 2.75;
    collision(name, s, y, w, d, top - layout.floor, layout.floor);
    const board = (suffix, x, z, bw, bd, bh, base) =>
      box(shelfGroup, `${name}${suffix}`, mats.wood, x, z, bw, bd, bh, base, false);
    if (alongS) {
      board("Back", s, y + d / 2 - 0.04, w, 0.08, top - layout.floor, layout.floor);
      for (const side of [-1, 1]) {
        board(`Side${side}`, s + side * (w / 2 - 0.04), y, 0.08, d, top - layout.floor, layout.floor);
      }
    } else {
      board("Back", s - w / 2 + 0.04, y, 0.08, d, top - layout.floor, layout.floor);
      for (const side of [-1, 1]) {
        board(`Side${side}`, s, y + side * (d / 2 - 0.04), w, 0.08, top - layout.floor, layout.floor);
      }
    }
    const levels = [0.15, 0.76, 1.37, 1.98];
    for (let row = 0; row < levels.length; row++) {
      board(`Shelf${row}`, s, y, w, d, 0.08, levels[row]);
    }
    board("Cap", s, y, w, d, 0.08, top - 0.08);
    const length = alongS ? w : d;
    const count = Math.floor((length - 0.3) / 0.25);
    const books = new THREE.InstancedMesh(bookGeometry, bookMaterial, count * levels.length);
    books.name = `${name}Books`;
    for (let row = 0; row < levels.length; row++) {
      for (let i = 0; i < count; i++) {
        const index = row * count + i;
        const coordinate = -length / 2 + 0.23 + i * 0.25;
        const bookS = alongS ? s + coordinate : s + 0.22;
        const bookY = alongS ? y - 0.16 : y + coordinate;
        const height = 0.35 + ((i + row * 3) % 5) * 0.035;
        setSurfaceMatrix(bookMatrix, bookS / RADIUS, bookY, levels[row] + 0.08,
          alongS ? 0.18 : 0.4, alongS ? 0.4 : 0.18, height);
        books.setMatrixAt(index, bookMatrix);
        books.setColorAt(index, bookColor.setHex(bookColors[(i + row) % bookColors.length]));
      }
    }
    books.instanceMatrix.needsUpdate = true;
    books.instanceColor.needsUpdate = true;
    shelfGroup.add(books);
  }
  shelf("libraryShelfWestNorth", -46, -10.2, 1.2, 7, false);
  shelf("libraryShelfWestSouth", -46, -29.8, 1.2, 7, false);
  shelf("libraryShelfNorth", -39, -5.85, 8, 0.9, true);

  for (let i = 0; i < layout.tables.length; i++) {
    const table = layout.tables[i];
    const name = `libraryReadingTable${i + 1}`;
    const tableGroup = new THREE.Group();
    tableGroup.name = name;
    group.add(tableGroup);
    box(tableGroup, `${name}Top`, mats.table, table.s, table.y,
      table.width, table.depth, 0.1, table.top - 0.1);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        box(tableGroup, `${name}Leg${side}_${end}`, mats.wood,
          table.s + side * (table.width / 2 - 0.22), table.y + end * (table.depth / 2 - 0.22),
          0.12, 0.12, table.top - 0.1 - layout.floor, layout.floor);
      }
    }
  }
  function chair(name, s, y, facingNorth) {
    const chairGroup = new THREE.Group();
    chairGroup.name = name;
    group.add(chairGroup);
    const reader = layout.reader;
    const seatBase = reader.seatTop - 0.08;
    const seatName = name === "libraryReaderChair" ? "library_reader_seat" : `${name}Seat`;
    box(chairGroup, seatName, mats.seat, s, y,
      reader.seatWidth, reader.seatDepth, 0.08, seatBase);
    const backY = y + (facingNorth ? -1 : 1) * (reader.seatDepth / 2 - 0.04);
    box(chairGroup, `${name}Back`, mats.wood, s, backY,
      reader.seatWidth, 0.08, 0.6, reader.seatTop);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        box(chairGroup, `${name}Leg${side}_${end}`, mats.wood,
          s + side * (reader.seatWidth / 2 - 0.06), y + end * (reader.seatDepth / 2 - 0.06),
          0.07, 0.07, seatBase - layout.floor, layout.floor);
      }
    }
  }
  // Keep the entry corridor and the reader's south approach free of furniture.
  chair("libraryReaderChair", layout.reader.s, layout.reader.y, true);
  chair("libraryNorthChairWest", -39.3, -12.6, false);
  chair("libraryNorthChairEast", -36.7, -12.6, false);
  chair("librarySouthChairNorth", -38, -24.6, false);
  chair("librarySouthChairWest", -39.3, -27.4, true);
  chair("librarySouthChairEast", -36.7, -27.4, true);

  const book = layout.book;
  const readingBook = new THREE.Group();
  readingBook.name = "library_reading_book";
  group.add(readingBook);
  box(readingBook, "libraryReadingBookCover", mats.cover, book.s, book.y,
    book.width, book.depth, 0.008, book.height - 0.02, false);
  for (const side of [-1, 1]) {
    box(readingBook, `libraryReadingBookPages${side}`, mats.paper,
      book.s + side * book.width / 4, book.y, book.width / 2 - 0.018, book.depth - 0.024,
      0.012, book.height - 0.012, false);
    for (let line = 0; line < 7; line++) {
      box(readingBook, `libraryReadingBookInk${side}_${line}`, mats.ink,
        book.s + side * book.width / 4, book.y - 0.12 + line * 0.035,
        0.17 - (line % 3) * 0.015, 0.003, 0.001, book.height, false);
    }
  }
  collision("library_reading_book", book.s, book.y, book.width, book.depth, 0.021, book.height - 0.02);

  // Warm local illumination without shadow maps or a separate light layer.
  for (const [suffix, y] of [["North", -12], ["South", -28]]) {
    box(group, `libraryPendant${suffix}`, mats.metal, -35, y, 2.9, 1.3, 0.12, 4.2);
    box(group, `libraryPendantDiffuser${suffix}`, mats.shade, -35, y, 2.6, 1, 0.04, 4.16);
    for (const side of [-1, 1]) {
      box(group, `libraryPendantRod${suffix}${side}`, mats.metal,
        -35 + side, y, 0.04, 0.04, 0.48, 4.32);
    }
    const light = new THREE.PointLight(0xffd49a, 32, 17, 2);
    light.name = `libraryWarmLight${suffix}`;
    light.position.copy(surfacePos(-35 / RADIUS, y, 3.95));
    light.castShadow = false;
    light.layers.set(0);
    group.add(light);
  }

  function labelMaterial(title, subtitle, lines) {
    const canvas = document.createElement("canvas");
    canvas.width = 1536;
    canvas.height = lines.length ? 768 : 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#183d3c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#cbb58d";
    ctx.lineWidth = 5;
    ctx.strokeRect(24, 24, 1488, canvas.height - 48);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff0d2";
    ctx.font = lines.length ? "600 65px system-ui" : "600 82px system-ui";
    ctx.fillText(title, 75, lines.length ? 125 : 104, 1386);
    ctx.fillStyle = "#d6c499";
    ctx.font = lines.length ? "36px system-ui" : "52px system-ui";
    ctx.fillText(subtitle, 75, lines.length ? 191 : 189, 1386);
    ctx.fillStyle = "#fff3dc";
    ctx.font = "46px system-ui";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 75, 300 + i * 83, 1386);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return new THREE.MeshBasicMaterial({ map: texture });
  }
  function panel(name, title, subtitle, lines, s, y, h, facing, w, panelHeight) {
    const mesh = addOrientedPanel(group, labelMaterial(title, subtitle, lines),
      surfacePos(s / RADIUS, y, h), facing, w, panelHeight);
    mesh.name = name;
    return mesh;
  }
  // West exhibit faces the open central cross-aisle; view from (-43, -20).
  solid("libraryHabitatExhibitFrame", mats.wood, -46.52, -20, 0.2, 7.2, 3, 0.6);
  panel("libraryHabitatExhibit", "LIFE IN A ROTATING CYLINDER", "MERIDIAN CIVIC LIBRARY · HABITAT REFERENCE",
    ["Hull radius: 360 metres (R = 360 m).", "Rotation provides about 1 g at the surface.",
      "Closer to the axis, the same spin gives less gravity.", "Upper levels therefore have lower gravity.",
      "The hull curves overhead; the axis is inward."],
    -46.41, -20, 2.1, "east", 7, 2.8);
  // North exhibit faces south; approach via the east aisle to (-29, -9).
  solid("libraryLivingSystemsExhibitFrame", mats.wood, -29, -5.52, 6.2, 0.2, 3, 0.6);
  panel("libraryLivingSystemsExhibit", "GROW · RECOVER · ILLUMINATE", "EVERYDAY LIFE IN A CLOSED HABITAT",
    ["Farms grow food on the inhabited inner surface.", "Water is collected, treated and reused.",
      "Recovery reduces demand on stored supplies.", "The axial sunline illuminates the cylinder interior.",
      "Shared systems sustain the neighbourhoods."],
    -29, -5.63, 2.1, "south", 6, 2.8);
  panel("libraryPublicEntranceSign", "MERIDIAN CIVIC LIBRARY", "GROUND FLOOR · PUBLIC READING ROOM",
    ["Enter through the open east portico.", "Browse the shelves and habitat reference.",
      "Habitat-life exhibit inside.", "Upper archives are closed to public access."],
    maxS + 0.015, -11.5, 2.3, "east", 5.4, 2.4);
  panel("libraryArchivesNotice", "A QUIET PLACE TO READ", "PUBLIC READING ROOM · OPEN AT GROUND LEVEL",
    ["Books, reading tables and habitat reference.", "No archive pass is needed for this room.",
      "The upper archive floors remain closed.", "Please keep the entrance and aisles clear."],
    maxS + 0.015, -28.5, 2.3, "east", 5.4, 2.4);
  panel("libraryDoorSign", "PUBLIC READING ROOM", "UPPER ARCHIVES CLOSED", [],
    maxS + 0.015, layout.door.y, 3.95, "east", 3.5, 0.3);

  return { group, obstacles };
}
