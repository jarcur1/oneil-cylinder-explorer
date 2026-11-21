import { RADIUS, LENGTH } from "./habitat.js";
import { DISTRICT_NAME, DISTRICT_BOUNDS } from "./district-layout.js";
import { CITY_NAME, CITY_BOUNDS } from "./city-layout.js";
import { SERVICE_NAME, SERVICE_BOUNDS } from "./service-layout.js";
import { RESERVOIR_NAME, RESERVOIR_BOUNDS } from "./reservoir-layout.js";
import {
  ENDCAP_HUBS,
  SUNLINE_TRACK_MIN_Y,
  SUNLINE_TRACK_MAX_Y,
  SPINE_THETA,
} from "./sunline-layout.js";
import { TRAM_HEIGHT, TRAM_LINES } from "./tram-layout.js";
import {
  MAP_LAYERS,
  getNavigationLayer,
  projectMapPoint,
  NAV_TARGETS,
  NAV_CONNECTIONS,
} from "./navigation.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_WIDTH = 760;
const SVG_HEIGHT = 540;
const PLOT = Object.freeze({
  x: 64,
  y: 44,
  w: 640,
  h: 456,
});

const JOB_META = Object.freeze([
  { id: "delivery", fallbackTitle: "Neighborhood job" },
  { id: "maintenance", fallbackTitle: "Civic maintenance" },
  { id: "sunline", fallbackTitle: "Sunline engineering" },
]);

const TRAM_LINE_BY_ID = new Map(TRAM_LINES.map((line) => [line.id, line]));
const TRAM_LINE_BY_LINK = new Map(TRAM_LINES.map((line) => [line.linkId, line]));
const TRAM_STOP_BY_ID = new Map(TRAM_LINES.flatMap((line) => line.stops).map((stop) => [stop.id, stop]));

const _proj = { x: 0, y: 0 };

function svgEl(tag, attrs = {}, text = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      el.setAttribute(key, String(value));
    }
  }
  if (text !== null) {
    el.textContent = text;
  }
  return el;
}

function toSvg(theta, y) {
  projectMapPoint(theta, y, _proj);
  return {
    x: PLOT.x + _proj.x * PLOT.w,
    y: PLOT.y + _proj.y * PLOT.h,
  };
}

function hasFound(found, id) {
  if (!found || !id) return false;
  if (typeof found.has === "function") return found.has(id);
  if (Array.isArray(found)) return found.includes(id);
  return false;
}

function formatElevationBadge(height) {
  if (!Number.isFinite(height)) return null;
  if (height <= -1) return `${Math.round(height)} m`;
  if (height >= 1.5) return `+${Math.round(height)} m`;
  return null;
}

function formatDegrees(theta) {
  const deg = ((((theta * 180) / Math.PI) % 360) + 360) % 360;
  return `${Math.round(deg).toString().padStart(3, "0")}°`;
}

function formatAxialMetres(y) {
  return `${Math.round(y + LENGTH / 2)} m`;
}

function formatDurationSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const clamped = Math.max(0, seconds);
  return clamped < 1 && clamped > 0 ? `${clamped.toFixed(1)}s` : `${Math.ceil(clamped)}s`;
}

function formatTramStatus(tram, line) {
  const currentStop = tram.stationId
    ? TRAM_STOP_BY_ID.get(tram.stationId)?.name ?? tram.stationId
    : null;
  const nextStop = tram.nextStationId
    ? TRAM_STOP_BY_ID.get(tram.nextStationId)?.name ?? tram.nextStationId
    : null;
  const dirLabel = tram.direction < 0 ? line.directionLabels.reverse : line.directionLabels.forward;

  if (tram.phase === "dwell" && currentStop) {
    const dep = Number.isFinite(tram.departureIn)
      ? ` (${formatDurationSeconds(tram.departureIn)})`
      : "";
    return `Docked at ${currentStop}${dep}${nextStop ? ` · Next: ${nextStop} (${dirLabel})` : ""}`;
  }

  const speedText = Number.isFinite(tram.speed)
    ? `${Math.round(Math.max(0, tram.speed))} m/s`
    : "En route";
  const arr = Number.isFinite(tram.arrivalIn)
    ? ` in ${formatDurationSeconds(tram.arrivalIn)}`
    : "";
  return `${dirLabel} · ${speedText}${nextStop ? ` · Next: ${nextStop}${arr}` : ""}`;
}

export function createHabitatMap({ onSelect, onClose } = {}) {
  const host = document.getElementById("app") || document.body;

  const dialog = document.createElement("dialog");
  dialog.id = "habitat-map";
  dialog.className = "habitat-map";
  dialog.setAttribute("aria-labelledby", "habitat-map-title");
  dialog.setAttribute("aria-describedby", "habitat-map-subtitle");

  const shell = document.createElement("div");
  shell.className = "habitat-map-shell";

  // Header
  const header = document.createElement("header");
  header.className = "habitat-map-header";

  const heading = document.createElement("div");
  heading.className = "habitat-map-heading";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "HABITAT NAVIGATION";

  const title = document.createElement("h2");
  title.id = "habitat-map-title";
  title.textContent = "O’Neill Cylinder · Unrolled Map";

  const subtitle = document.createElement("p");
  subtitle.id = "habitat-map-subtitle";
  subtitle.className = "habitat-map-subtitle";
  subtitle.textContent =
    "1800 m axial length × 2262 m circumference · 360 m radius";

  heading.append(eyebrow, title, subtitle);

  const headerActions = document.createElement("div");
  headerActions.className = "habitat-map-header-actions";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.id = "map-clear";
  clearBtn.className = "glass-button";
  clearBtn.setAttribute("data-clear-waypoint", "");
  clearBtn.textContent = "CLEAR WAYPOINT";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.id = "map-close";
  closeBtn.className = "glass-button";
  closeBtn.textContent = "ESC · CLOSE";

  headerActions.append(clearBtn, closeBtn);
  header.append(heading, headerActions);

  // Layer tabs
  const layerBar = document.createElement("div");
  layerBar.className = "habitat-map-toolbar";
  layerBar.setAttribute("role", "group");
  layerBar.setAttribute("aria-label", "Habitat elevation layers");

  const layerButtons = new Map();
  for (const layer of MAP_LAYERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-layer-btn";
    btn.dataset.mapLayer = layer.id;
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = layer.label;
    btn.addEventListener("click", () => {
      if (activeLayer === layer.id) return;
      activeLayer = layer.id;
      redraw();
    });
    layerBar.appendChild(btn);
    layerButtons.set(layer.id, btn);
  }

  // Body (SVG panel + sidebar lists)
  const body = document.createElement("div");
  body.className = "habitat-map-body";

  const canvasPanel = document.createElement("section");
  canvasPanel.className = "habitat-map-canvas-panel";
  canvasPanel.setAttribute("aria-label", "Unrolled cylinder map");

  const statusBar = document.createElement("div");
  statusBar.className = "habitat-map-status-bar";

  const playerSummaryEl = document.createElement("span");
  playerSummaryEl.id = "habitat-map-player-summary";

  const waypointSummaryEl = document.createElement("span");
  waypointSummaryEl.id = "habitat-map-active-waypoint";
  waypointSummaryEl.className = "habitat-map-active-waypoint";

  statusBar.append(playerSummaryEl, waypointSummaryEl);

  const tramStatusBar = document.createElement("div");
  tramStatusBar.id = "habitat-map-tram-status";

  const svgWrap = document.createElement("div");
  svgWrap.className = "habitat-map-svg-wrap";

  const svg = svgEl("svg", {
    id: "habitat-map-svg",
    class: "habitat-map-svg",
    viewBox: `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`,
    role: "img",
    "aria-labelledby": "habitat-map-svg-title",
  });
  const svgTitle = svgEl(
    "title",
    { id: "habitat-map-svg-title" },
    "Unrolled O’Neill cylinder habitat map",
  );
  svg.appendChild(svgTitle);

  const svgContent = svgEl("g", { class: "map-svg-content" });
  svg.appendChild(svgContent);
  svgWrap.appendChild(svg);

  // Legend
  const legend = document.createElement("ul");
  legend.className = "habitat-map-legend";
  legend.setAttribute("aria-label", "Map legend");

  const legendItems = [
    { cls: "legend-player", label: "You" },
    { cls: "legend-selected", label: "Selected target" },
    { cls: "legend-visited", label: "Visited landmark" },
    { cls: "legend-unvisited", label: "Unvisited landmark" },
    { cls: "legend-access", label: "Lift / access / dock" },
    { cls: "legend-link", label: "Transit / rail link" },
    { cls: "legend-tram", label: "Tram route / car" },
  ];
  for (const item of legendItems) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `legend-swatch ${item.cls}`;
    swatch.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = item.label;
    li.append(swatch, text);
    legend.appendChild(li);
  }

  canvasPanel.append(statusBar, tramStatusBar, svgWrap, legend);

  // Sidebar: jobs + layer destination list
  const sidebar = document.createElement("aside");
  sidebar.className = "habitat-map-sidebar";

  const jobsSection = document.createElement("section");
  jobsSection.className = "habitat-map-section";
  jobsSection.setAttribute("aria-labelledby", "map-jobs-heading");
  const jobsHeading = document.createElement("h3");
  jobsHeading.id = "map-jobs-heading";
  jobsHeading.className = "eyebrow";
  jobsHeading.textContent = "TRACK ACTIVE JOB";
  const jobsList = document.createElement("div");
  jobsList.id = "habitat-map-jobs";
  jobsList.className = "habitat-map-list";
  jobsSection.append(jobsHeading, jobsList);

  const destSection = document.createElement("section");
  destSection.className = "habitat-map-section";
  destSection.setAttribute("aria-labelledby", "map-destinations-heading");
  const destHeading = document.createElement("h3");
  destHeading.id = "map-destinations-heading";
  destHeading.className = "eyebrow";
  destHeading.textContent = "LAYER DESTINATIONS & ACCESS";
  const destList = document.createElement("div");
  destList.id = "habitat-map-destinations";
  destList.className = "habitat-map-list";
  destSection.append(destHeading, destList);

  sidebar.append(jobsSection, destSection);
  body.append(canvasPanel, sidebar);
  shell.append(header, layerBar, body);
  dialog.appendChild(shell);
  host.appendChild(dialog);

  let activeLayer = MAP_LAYERS[0]?.id ?? "surface";
  let currentSnapshot = null;
  let pendingProgrammaticCloses = 0;

  clearBtn.addEventListener("click", () => {
    onSelect?.(null);
  });

  closeBtn.addEventListener("click", () => {
    if (!dialog.open) return;
    onClose?.();
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!dialog.open) return;
    onClose?.();
  });

  dialog.addEventListener("close", () => {
    if (pendingProgrammaticCloses > 0) {
      pendingProgrammaticCloses -= 1;
      return;
    }
    if (dialog.open) return;
    onClose?.();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && dialog.open) {
      onClose?.();
    }
  });

  function drawZoneRect(
    parent,
    bounds,
    label,
    className,
    labelYOffset = -6,
    occupiedBoxes = null,
  ) {
    const pTL = toSvg(bounds.minS / RADIUS, bounds.maxY);
    const pBR = toSvg(bounds.maxS / RADIUS, bounds.minY);
    const x = Math.min(pTL.x, pBR.x);
    const y = Math.min(pTL.y, pBR.y);
    const width = Math.max(4, Math.abs(pBR.x - pTL.x));
    const height = Math.max(4, Math.abs(pBR.y - pTL.y));

    parent.appendChild(
      svgEl("rect", {
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: width.toFixed(1),
        height: height.toFixed(1),
        rx: 4,
        class: className,
      }),
    );

    if (label) {
      const labelX = x;
      const labelY =
        labelYOffset < 0
          ? Math.max(PLOT.y + 13, y + labelYOffset)
          : Math.min(PLOT.y + PLOT.h - 6, y + height + labelYOffset);
      parent.appendChild(
        svgEl(
          "text",
          {
            x: labelX.toFixed(1),
            y: labelY.toFixed(1),
            class: "map-zone-label",
            "pointer-events": "none",
          },
          label,
        ),
      );
      if (occupiedBoxes) {
        const w = Math.max(24, label.length * 6.6 + 8);
        occupiedBoxes.push({
          left: labelX,
          top: labelY - 11,
          right: labelX + w,
          bottom: labelY + 3,
        });
      }
    }
    return { x, y, width, height };
  }

  function renderSvg(snapshot) {
    svgContent.replaceChildren();
    const occupiedLabelBoxes = [];

    function makeLabelBox(x, y, text, anchor) {
      const w = Math.max(24, text.length * 6.6 + 8);
      const left =
        anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
      return {
        left,
        top: y - 11,
        right: left + w,
        bottom: y + 4,
      };
    }

    function overlapsOccupied(box) {
      if (
        box.left < PLOT.x + 2 ||
        box.right > PLOT.x + PLOT.w - 2 ||
        box.top < PLOT.y + 2 ||
        box.bottom > PLOT.y + PLOT.h - 2
      ) {
        return true;
      }
      for (const other of occupiedLabelBoxes) {
        if (
          box.left - 2 < other.right &&
          box.right + 2 > other.left &&
          box.top - 2 < other.bottom &&
          box.bottom + 2 > other.top
        ) {
          return true;
        }
      }
      return false;
    }

    function placePointLabel(parent, px, py, text, className) {
      const preferLeft = px > 470;
      const sides = preferLeft
        ? [
            { anchor: "end", lx: px - 10 },
            { anchor: "start", lx: px + 10 },
          ]
        : [
            { anchor: "start", lx: px + 10 },
            { anchor: "end", lx: px - 10 },
          ];
      const dyOffsets = [0, -15, 15, -30, 30, -45, 45];

      let chosen = null;
      for (const side of sides) {
        for (const dy of dyOffsets) {
          const ly = py + 3 + dy;
          const box = makeLabelBox(side.lx, ly, text, side.anchor);
          if (!overlapsOccupied(box)) {
            chosen = { lx: side.lx, ly, anchor: side.anchor, box };
            break;
          }
        }
        if (chosen) break;
      }

      if (!chosen) {
        const side = sides[0];
        const ly = Math.max(PLOT.y + 13, Math.min(PLOT.y + PLOT.h - 6, py + 3));
        const box = makeLabelBox(side.lx, ly, text, side.anchor);
        chosen = { lx: side.lx, ly, anchor: side.anchor, box };
      }

      occupiedLabelBoxes.push(chosen.box);
      parent.appendChild(
        svgEl(
          "text",
          {
            x: chosen.lx.toFixed(1),
            y: chosen.ly.toFixed(1),
            "text-anchor": chosen.anchor,
            class: className,
            "pointer-events": "none",
          },
          text,
        ),
      );
    }
    const gridGroup = svgEl("g", { class: "map-grid-layer" });
    gridGroup.appendChild(
      svgEl("rect", {
        x: PLOT.x,
        y: PLOT.y,
        width: PLOT.w,
        height: PLOT.h,
        class: "map-plot-bg",
      }),
    );

    // Endcap axis labels
    gridGroup.appendChild(
      svgEl(
        "text",
        {
          x: PLOT.x + PLOT.w / 2,
          y: 24,
          "text-anchor": "middle",
          class: "map-axis-title",
          "pointer-events": "none",
        },
        "ENDCAP B · NORTH (+900 m)",
      ),
    );
    gridGroup.appendChild(
      svgEl(
        "text",
        {
          x: PLOT.x + PLOT.w / 2,
          y: PLOT.y + PLOT.h + 30,
          "text-anchor": "middle",
          class: "map-axis-title",
          "pointer-events": "none",
        },
        "ENDCAP A · SOUTH (-900 m)",
      ),
    );

    const thetaTicks = [
      { theta: -Math.PI / 2, label: "-90° SEAM" },
      { theta: 0, label: "0° PROMENADE" },
      { theta: Math.PI / 2, label: "+90°" },
      { theta: Math.PI, label: "180° SPINE" },
      { theta: (Math.PI * 3) / 2 - 1e-6, label: "+270° SEAM" },
    ];
    for (let i = 0; i < thetaTicks.length; i++) {
      const tick = thetaTicks[i];
      const pos = toSvg(tick.theta, 0);
      const x = i === thetaTicks.length - 1 ? PLOT.x + PLOT.w : pos.x;
      gridGroup.appendChild(
        svgEl("line", {
          x1: x.toFixed(1),
          y1: PLOT.y,
          x2: x.toFixed(1),
          y2: PLOT.y + PLOT.h,
          class:
            i === 0 || i === thetaTicks.length - 1
              ? "map-grid-seam"
              : "map-grid-line",
        }),
      );
      gridGroup.appendChild(
        svgEl(
          "text",
          {
            x: x.toFixed(1),
            y: PLOT.y + PLOT.h + 15,
            "text-anchor":
              i === 0 ? "start" : i === thetaTicks.length - 1 ? "end" : "middle",
            class: "map-axis-tick",
            "pointer-events": "none",
          },
          tick.label,
        ),
      );
    }

    const yTicks = [
      { y: LENGTH / 2, label: "1800 m" },
      { y: LENGTH / 4, label: "1350 m" },
      { y: 0, label: "900 m" },
      { y: -LENGTH / 4, label: "450 m" },
      { y: -LENGTH / 2, label: "0 m" },
    ];
    for (const tick of yTicks) {
      const pos = toSvg(0, tick.y);
      gridGroup.appendChild(
        svgEl("line", {
          x1: PLOT.x,
          y1: pos.y.toFixed(1),
          x2: PLOT.x + PLOT.w,
          y2: pos.y.toFixed(1),
          class: "map-grid-line",
        }),
      );
      gridGroup.appendChild(
        svgEl(
          "text",
          {
            x: PLOT.x - 8,
            y: (pos.y + 3).toFixed(1),
            "text-anchor": "end",
            class: "map-axis-tick",
            "pointer-events": "none",
          },
          tick.label,
        ),
      );
    }
    svgContent.appendChild(gridGroup);

    // Layer-specific district / facility bounds
    const zoneGroup = svgEl("g", { class: "map-zones-layer" });
    if (activeLayer === "surface") {
      drawZoneRect(
        zoneGroup,
        DISTRICT_BOUNDS,
        DISTRICT_NAME,
        "map-zone-district",
        -6,
        occupiedLabelBoxes,
      );
      drawZoneRect(
        zoneGroup,
        CITY_BOUNDS,
        CITY_NAME,
        "map-zone-city",
        -6,
        occupiedLabelBoxes,
      );
      drawZoneRect(
        zoneGroup,
        RESERVOIR_BOUNDS,
        RESERVOIR_NAME,
        "map-zone-district",
        -6,
        occupiedLabelBoxes,
      );

      const rimBandH = 12;
      const topA = toSvg(0, -LENGTH / 2 + 40);
      zoneGroup.appendChild(
        svgEl("rect", {
          x: PLOT.x + 2,
          y: (topA.y - rimBandH / 2).toFixed(1),
          width: PLOT.w - 4,
          height: rimBandH,
          class: "map-zone-rim",
        }),
      );
      const topB = toSvg(0, LENGTH / 2 - 40);
      zoneGroup.appendChild(
        svgEl("rect", {
          x: PLOT.x + 2,
          y: (topB.y - rimBandH / 2).toFixed(1),
          width: PLOT.w - 4,
          height: rimBandH,
          class: "map-zone-rim",
        }),
      );
    } else if (activeLayer === "service") {
      const cityGhostRect = drawZoneRect(
        zoneGroup,
        CITY_BOUNDS,
        `${CITY_NAME} (above)`,
        "map-zone-ghost",
        -6,
        occupiedLabelBoxes,
      );
      drawZoneRect(
        zoneGroup,
        SERVICE_BOUNDS,
        null,
        "map-zone-service",
      );
      const serviceLabel = `${SERVICE_NAME} · -8 m`;
      const serviceLabelX = cityGhostRect.x;
      const serviceLabelY = Math.min(
        PLOT.y + PLOT.h - 6,
        cityGhostRect.y + cityGhostRect.height + 14,
      );
      zoneGroup.appendChild(
        svgEl(
          "text",
          {
            x: serviceLabelX.toFixed(1),
            y: serviceLabelY.toFixed(1),
            class: "map-zone-label",
            "pointer-events": "none",
          },
          serviceLabel,
        ),
      );
      occupiedLabelBoxes.push({
        left: serviceLabelX,
        top: serviceLabelY - 11,
        right: serviceLabelX + Math.max(24, serviceLabel.length * 6.6 + 8),
        bottom: serviceLabelY + 3,
      });
    } else if (activeLayer === "axial") {
      const railTop = toSvg(SPINE_THETA, SUNLINE_TRACK_MAX_Y);
      const railBottom = toSvg(SPINE_THETA, SUNLINE_TRACK_MIN_Y);
      zoneGroup.appendChild(
        svgEl("line", {
          x1: railTop.x.toFixed(1),
          y1: railTop.y.toFixed(1),
          x2: railBottom.x.toFixed(1),
          y2: railBottom.y.toFixed(1),
          class: "map-axial-corridor",
        }),
      );
      for (const hub of ENDCAP_HUBS) {
        const tl = toSvg(SPINE_THETA - 0.5, hub.maxY);
        const br = toSvg(SPINE_THETA + 0.5, hub.minY);
        const rectW = Math.max(18, Math.abs(br.x - tl.x));
        const rectH = Math.max(12, Math.abs(br.y - tl.y));
        const rectX = Math.min(tl.x, br.x);
        const rectY = Math.max(
          PLOT.y + 2,
          Math.min(PLOT.y + PLOT.h - rectH - 2, Math.min(tl.y, br.y)),
        );
        zoneGroup.appendChild(
          svgEl("rect", {
            x: rectX.toFixed(1),
            y: rectY.toFixed(1),
            width: rectW.toFixed(1),
            height: rectH.toFixed(1),
            rx: 4,
            class: "map-zone-axial",
          }),
        );
        const hubLabel = `${hub.label} Hub`;
        const hubLabelX = rectX + rectW + 6;
        const hubLabelY = rectY + rectH / 2 + 3;
        zoneGroup.appendChild(
          svgEl(
            "text",
            {
              x: hubLabelX.toFixed(1),
              y: hubLabelY.toFixed(1),
              class: "map-zone-label",
              "pointer-events": "none",
            },
            hubLabel,
          ),
        );
        occupiedLabelBoxes.push({
          left: hubLabelX,
          top: hubLabelY - 11,
          right: hubLabelX + Math.max(24, hubLabel.length * 6.6 + 8),
          bottom: hubLabelY + 3,
        });
      }
    }
    svgContent.appendChild(zoneGroup);

    // Transit / lift / trolley links
    const linksGroup = svgEl("g", {
      class: "map-links-layer",
      "pointer-events": "none",
    });
    for (const conn of NAV_CONNECTIONS) {
      const fromPose = conn.from;
      const toPose = conn.to;
      if (!fromPose || !toPose) continue;
      const fromLayer = fromPose.layer ?? getNavigationLayer(fromPose.height ?? 0);
      const toLayer = toPose.layer ?? getNavigationLayer(toPose.height ?? 0);

      if (fromLayer === activeLayer && toLayer === activeLayer) {
        const p1 = toSvg(fromPose.theta, fromPose.y);
        const p2 = toSvg(toPose.theta, toPose.y);
        const span = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (span > 3) {
          const line = svgEl("line", {
            x1: p1.x.toFixed(1),
            y1: p1.y.toFixed(1),
            x2: p2.x.toFixed(1),
            y2: p2.y.toFixed(1),
            class: `map-link-line map-link-${conn.type || "link"}`,
            ...(conn.type === "tram" ? { "data-tram-line": TRAM_LINE_BY_LINK.get(conn.id)?.id } : {}),
          });
          if (conn.label) line.appendChild(svgEl("title", {}, conn.label));
          linksGroup.appendChild(line);
        } else {
          const ring = svgEl("circle", {
            cx: p1.x.toFixed(1),
            cy: p1.y.toFixed(1),
            r: 10,
            class: "map-link-vertical",
          });
          if (conn.label) ring.appendChild(svgEl("title", {}, conn.label));
          linksGroup.appendChild(ring);
        }
      } else if (fromLayer === activeLayer || toLayer === activeLayer) {
        const pose = fromLayer === activeLayer ? fromPose : toPose;
        const p = toSvg(pose.theta, pose.y);
        const portal = svgEl("circle", {
          cx: p.x.toFixed(1),
          cy: p.y.toFixed(1),
          r: 11,
          class: "map-link-portal",
        });
        if (conn.label) portal.appendChild(svgEl("title", {}, conn.label));
        linksGroup.appendChild(portal);
      }
    }
    svgContent.appendChild(linksGroup);

    // Waypoint guidance line if active and on current layer
    const waypoint = snapshot?.waypoint;
    if (waypoint?.target && waypoint?.guidance) {
      const targetLayer =
        waypoint.target.layer ?? getNavigationLayer(waypoint.target.height ?? 0);
      const guidanceLayer =
        waypoint.guidance.layer ?? getNavigationLayer(waypoint.guidance.height ?? 0);
      if (snapshot.player && guidanceLayer === activeLayer) {
        const pPlayer = toSvg(snapshot.player.theta, snapshot.player.y);
        const pGuide = toSvg(waypoint.guidance.theta, waypoint.guidance.y);
        linksGroup.appendChild(
          svgEl("line", {
            x1: pPlayer.x.toFixed(1),
            y1: pPlayer.y.toFixed(1),
            x2: pGuide.x.toFixed(1),
            y2: pGuide.y.toFixed(1),
            class: "map-guidance-line",
          }),
        );
      }
      if (
        targetLayer === activeLayer &&
        guidanceLayer === activeLayer &&
        Math.hypot(
          waypoint.target.y - waypoint.guidance.y,
          (waypoint.target.theta - waypoint.guidance.theta) * RADIUS,
        ) > 1
      ) {
        const pGuide = toSvg(waypoint.guidance.theta, waypoint.guidance.y);
        const pTarget = toSvg(waypoint.target.theta, waypoint.target.y);
        linksGroup.appendChild(
          svgEl("line", {
            x1: pGuide.x.toFixed(1),
            y1: pGuide.y.toFixed(1),
            x2: pTarget.x.toFixed(1),
            y2: pTarget.y.toFixed(1),
            class: "map-guidance-line map-guidance-final",
          }),
        );
      }
    }

    // Labels layer (strictly pointer-events: none so labels never block markers)
    const labelsGroup = svgEl("g", {
      class: "map-labels-layer",
      "pointer-events": "none",
    });
    const pinsGroup = svgEl("g", { class: "map-pins-layer" });

    const layerTargets = NAV_TARGETS.filter((t) => t.layer === activeLayer);
    const selectedDestId =
      snapshot?.selection?.kind === "destination" ? snapshot.selection.id : null;
    const activeWaypointId = waypoint?.id ?? null;
    const guidance = waypoint?.guidance ?? null;
    const guidanceLayer = guidance
      ? (guidance.layer ?? getNavigationLayer(guidance.height ?? 0))
      : null;
    const hasDistinctGuidance = Boolean(
      guidance &&
        guidanceLayer === activeLayer &&
        guidance.name &&
        guidance.name !== waypoint?.name,
    );

    const normalPins = [];
    const guidancePins = [];
    const selectedPins = [];
    const pendingPinLabels = [];
    let matchedGuidancePin = false;

    for (const target of layerTargets) {
      const p = toSvg(target.theta, target.y);
      const isLandmark = Boolean(target.landmarkId);
      const visited = isLandmark && hasFound(snapshot?.found, target.landmarkId);
      const isSelected =
        selectedDestId === target.id || activeWaypointId === target.id;
      const isActiveLeg =
        !isSelected &&
        hasDistinctGuidance &&
        target.name === guidance.name &&
        Math.abs(target.y - guidance.y) < 1 &&
        Math.abs(target.theta - guidance.theta) < 0.02;
      if (isActiveLeg) matchedGuidancePin = true;

      const elev =
        activeLayer === "surface" ? formatElevationBadge(target.height) : null;
      const pinLabelText = elev ? `${target.name} (${elev})` : target.name;

      if (isSelected) {
        pendingPinLabels.push({
          priority: 1,
          x: p.x,
          y: p.y,
          text: pinLabelText,
          className: "map-pin-label is-selected",
        });
      } else if (isActiveLeg) {
        pendingPinLabels.push({
          priority: 2,
          x: p.x,
          y: p.y,
          text: pinLabelText,
          className: "map-pin-label is-guidance",
        });
      }

      const pinGroup = svgEl("g", {
        class: `map-pin${isSelected ? " is-selected" : ""}${isActiveLeg ? " is-guidance" : ""}`,
        "data-marker-id": target.id,
        "data-kind": target.kind || "target",
        "data-visited": isLandmark ? String(visited) : undefined,
        role: "button",
        tabindex: "-1",
        "aria-label": pinLabelText,
      });
      pinGroup.appendChild(svgEl("title", {}, pinLabelText));

      if (isSelected) {
        pinGroup.appendChild(
          svgEl("circle", {
            cx: p.x.toFixed(1),
            cy: p.y.toFixed(1),
            r: 10.5,
            class: "map-pin-ring",
          }),
        );
      } else if (isActiveLeg) {
        pinGroup.appendChild(
          svgEl("circle", {
            cx: p.x.toFixed(1),
            cy: p.y.toFixed(1),
            r: 10,
            class: "map-pin-ring is-guidance",
          }),
        );
      }

      if (isLandmark) {
        const s = 5.2;
        const pts = `${p.x.toFixed(1)},${(p.y - s).toFixed(1)} ${(p.x + s).toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${(p.y + s).toFixed(1)} ${(p.x - s).toFixed(1)},${p.y.toFixed(1)}`;
        pinGroup.appendChild(
          svgEl("polygon", {
            points: pts,
            class: visited ? "map-glyph-visited" : "map-glyph-unvisited",
          }),
        );
      } else {
        pinGroup.appendChild(
          svgEl("rect", {
            x: (p.x - 4).toFixed(1),
            y: (p.y - 4).toFixed(1),
            width: 8,
            height: 8,
            rx: 1.5,
            class:
              target.kind === "tram"
                ? "map-glyph-access map-glyph-tram"
                : "map-glyph-access",
          }),
        );
      }

      // Generous invisible click target on top of the visual glyph
      pinGroup.appendChild(
        svgEl("circle", {
          cx: p.x.toFixed(1),
          cy: p.y.toFixed(1),
          r: 13,
          fill: "transparent",
          class: "map-pin-hit",
        }),
      );

      pinGroup.addEventListener("click", () => {
        onSelect?.({ kind: "destination", id: target.id });
      });

      if (isSelected) selectedPins.push(pinGroup);
      else if (isActiveLeg) guidancePins.push(pinGroup);
      else normalPins.push(pinGroup);
    }

    pinsGroup.append(...normalPins, ...guidancePins, ...selectedPins);

    if (hasDistinctGuidance && !matchedGuidancePin) {
      const gp = toSvg(guidance.theta, guidance.y);
      const guideMarker = svgEl("g", {
        class: "map-guidance-marker",
        "pointer-events": "none",
      });
      guideMarker.appendChild(
        svgEl("circle", {
          cx: gp.x.toFixed(1),
          cy: gp.y.toFixed(1),
          r: 10,
          class: "map-pin-ring is-guidance",
        }),
      );
      guideMarker.appendChild(
        svgEl("rect", {
          x: (gp.x - 3.5).toFixed(1),
          y: (gp.y - 3.5).toFixed(1),
          width: 7,
          height: 7,
          rx: 1.5,
          class: "map-glyph-access",
        }),
      );
      pinsGroup.appendChild(guideMarker);
      pendingPinLabels.push({
        priority: 2,
        x: gp.x,
        y: gp.y,
        text: guidance.name,
        className: "map-pin-label is-guidance",
      });
    }

    if (
      snapshot?.selection?.kind === "job" &&
      waypoint?.target &&
      (waypoint.target.layer ?? getNavigationLayer(waypoint.target.height ?? 0)) ===
        activeLayer
    ) {
      const jp = toSvg(waypoint.target.theta, waypoint.target.y);
      const jobRing = svgEl("g", {
        class: "map-job-target",
        "pointer-events": "none",
      });
      jobRing.appendChild(
        svgEl("circle", {
          cx: jp.x.toFixed(1),
          cy: jp.y.toFixed(1),
          r: 11,
          class: "map-pin-ring",
        }),
      );
      jobRing.appendChild(
        svgEl("circle", {
          cx: jp.x.toFixed(1),
          cy: jp.y.toFixed(1),
          r: 4.5,
          class: "map-glyph-job",
        }),
      );
      pinsGroup.appendChild(jobRing);
      pendingPinLabels.push({
        priority: 1,
        x: jp.x,
        y: jp.y,
        text: waypoint.name || "Job target",
        className: "map-pin-label is-selected",
      });
    }

    // Player marker
    const playerGroup = svgEl("g", {
      class: "map-player-layer",
      "pointer-events": "none",
    });
    if (snapshot?.player && Number.isFinite(snapshot.player.theta) && Number.isFinite(snapshot.player.y)) {
      const pp = toSvg(snapshot.player.theta, snapshot.player.y);
      const playerLayer = getNavigationLayer(snapshot.player.height ?? 0);
      const onLayer = playerLayer === activeLayer;

      playerGroup.appendChild(
        svgEl("circle", {
          cx: pp.x.toFixed(1),
          cy: pp.y.toFixed(1),
          r: onLayer ? 10 : 8,
          class: onLayer ? "map-player-halo" : "map-player-halo is-other-layer",
        }),
      );
      playerGroup.appendChild(
        svgEl("circle", {
          cx: pp.x.toFixed(1),
          cy: pp.y.toFixed(1),
          r: 5,
          class: onLayer ? "map-player-dot" : "map-player-dot is-other-layer",
        }),
      );
      pendingPinLabels.push({
        priority: 3,
        x: pp.x,
        y: pp.y,
        text: onLayer ? "YOU" : `YOU (${playerLayer.toUpperCase()})`,
        className: onLayer ? "map-player-label" : "map-player-label is-other-layer",
        targetGroup: playerGroup,
      });
    }

    // Read-only tram vehicle markers on their actual layer.
    const tramGroup = svgEl("g", {
      class: "map-tram-layer",
      "pointer-events": "none",
    });
    for (const entry of snapshot?.trams ?? []) {
      const line = TRAM_LINE_BY_ID.get(entry.lineId);
      const tram = entry.state;
      if (!line || !tram || !Number.isFinite(tram.theta) ||
          !Number.isFinite(tram.y) || !Number.isFinite(tram.height) ||
          getNavigationLayer(tram.height) !== activeLayer) continue;
      const tp = toSvg(tram.theta, tram.y);
      const horizontal = line.axis === "theta";
      const marker = svgEl("g", {
        class: `map-tram-marker${tram.phase === "dwell" ? " is-docked" : ""}`,
        "data-tram-marker": tram.stationId || line.sceneName.replaceAll("_", "-"),
        "data-tram-line": line.id,
        "data-tram-phase": tram.phase || "moving",
        "data-tram-direction": horizontal
          ? (tram.direction < 0 ? "west" : "east")
          : (tram.direction < 0 ? "south" : "north"),
      });
      marker.appendChild(svgEl("title", {}, formatTramStatus(tram, line)));
      marker.appendChild(svgEl("rect", {
        x: (tp.x - (horizontal ? 8 : 5)).toFixed(1),
        y: (tp.y - (horizontal ? 5 : 8)).toFixed(1),
        width: horizontal ? 16 : 10,
        height: horizontal ? 10 : 16,
        rx: 2.5,
        class: "map-tram-car",
      }));
      marker.appendChild(svgEl("circle", {
        cx: (tp.x + (horizontal ? (tram.direction < 0 ? -4 : 4) : 0)).toFixed(1),
        cy: (tp.y + (horizontal ? 0 : (tram.direction < 0 ? 4 : -4))).toFixed(1),
        r: 1.8,
        class: "map-tram-headlight",
      }));
      tramGroup.appendChild(marker);
      pendingPinLabels.push({
        priority: 4,
        x: tp.x,
        y: tp.y,
        text: `${line.id === "line-02" ? "LINE 02 " : ""}${tram.stationId ? "TRAM (DOCKED · +13 m)" : "TRAM (+13 m)"}`,
        className: "map-tram-label",
        targetGroup: tramGroup,
      });
    }

    pendingPinLabels.sort((a, b) => a.priority - b.priority);
    for (const label of pendingPinLabels) {
      placePointLabel(
        label.targetGroup || labelsGroup,
        label.x,
        label.y,
        label.text,
        label.className,
      );
    }

    svgContent.append(pinsGroup, labelsGroup, tramGroup, playerGroup);
  }

  function renderLists(snapshot) {
    const selection = snapshot?.selection ?? null;

    // Jobs buttons
    jobsList.replaceChildren();
    for (const meta of JOB_META) {
      const job = snapshot?.jobs?.[meta.id] ?? null;
      const isComplete = !job || job.phase === "complete" || !job.target;
      const isSelected =
        selection?.kind === "job" && selection?.id === meta.id;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-list-btn map-job-btn";
      btn.dataset.jobId = meta.id;
      btn.disabled = isComplete;
      btn.setAttribute("aria-pressed", String(isSelected));

      const topRow = document.createElement("span");
      topRow.className = "map-list-row";
      const nameSpan = document.createElement("strong");
      nameSpan.textContent = job?.title || meta.fallbackTitle;
      const distSpan = document.createElement("span");
      distSpan.className = "map-list-meta";
      distSpan.textContent = isComplete
        ? "COMPLETE"
        : Number.isFinite(job.distance)
          ? `${Math.round(job.distance)} m`
          : job.status || "ACTIVE";
      topRow.append(nameSpan, distSpan);

      const descSpan = document.createElement("span");
      descSpan.className = "map-list-sub";
      descSpan.textContent = job?.objective || "No active objective.";

      btn.append(topRow, descSpan);
      btn.addEventListener("click", () => {
        if (!isComplete) {
          onSelect?.({ kind: "job", id: meta.id });
        }
      });
      jobsList.appendChild(btn);
    }

    // Destination list buttons for activeLayer
    destList.replaceChildren();
    const layerTargets = NAV_TARGETS.filter((t) => t.layer === activeLayer);
    for (const target of layerTargets) {
      const isLandmark = Boolean(target.landmarkId);
      const visited = isLandmark && hasFound(snapshot?.found, target.landmarkId);
      const isSelected =
        selection?.kind === "destination" && selection?.id === target.id;
      const elev = formatElevationBadge(target.height);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-list-btn";
      btn.dataset.destinationId = target.id;
      if (isLandmark) {
        btn.dataset.visited = String(visited);
      }
      btn.setAttribute("aria-pressed", String(isSelected));

      const topRow = document.createElement("span");
      topRow.className = "map-list-row";

      const nameSpan = document.createElement("strong");
      nameSpan.textContent = target.name;

      const badges = document.createElement("span");
      badges.className = "map-list-badges";

      if (elev) {
        const elevTag = document.createElement("span");
        elevTag.className = "map-badge map-badge-elev";
        elevTag.textContent = elev;
        badges.appendChild(elevTag);
      }
      if (target.kind === "tram") {
        const tramLiftTag = document.createElement("span");
        tramLiftTag.className = "map-badge map-badge-elev";
        tramLiftTag.textContent = `LIFT TO ${formatElevationBadge(TRAM_HEIGHT) || "+13 m"}`;
        badges.appendChild(tramLiftTag);
      }

      const statusTag = document.createElement("span");
      statusTag.className = isLandmark
        ? visited
          ? "map-badge map-badge-visited"
          : "map-badge map-badge-unvisited"
        : target.kind === "tram"
          ? "map-badge map-badge-access map-badge-tram"
          : "map-badge map-badge-access";
      statusTag.textContent = isLandmark
        ? visited
          ? "VISITED"
          : "UNVISITED"
        : (target.kind || "ACCESS").toUpperCase();
      badges.appendChild(statusTag);

      topRow.append(nameSpan, badges);
      btn.appendChild(topRow);

      if (target.hint) {
        const hintSpan = document.createElement("span");
        hintSpan.className = "map-list-sub";
        hintSpan.textContent = target.hint;
        btn.appendChild(hintSpan);
      }

      btn.addEventListener("click", () => {
        onSelect?.({ kind: "destination", id: target.id });
      });
      destList.appendChild(btn);
    }
  }

  function captureFocusState() {
    if (!dialog.open) return null;
    const active = document.activeElement;
    if (!active || !dialog.contains(active)) return null;
    if (jobsList.contains(active) && active.dataset?.jobId) {
      return {
        kind: "job",
        id: active.dataset.jobId,
        index: Array.prototype.indexOf.call(jobsList.children, active),
      };
    }
    if (destList.contains(active) && active.dataset?.destinationId) {
      return {
        kind: "destination",
        id: active.dataset.destinationId,
        index: Array.prototype.indexOf.call(destList.children, active),
      };
    }
    if (svgContent.contains(active) && active.dataset?.markerId) {
      return {
        kind: "marker",
        id: active.dataset.markerId,
      };
    }
    if (active === clearBtn) {
      return { kind: "clear" };
    }
    return null;
  }

  function findNearestEnabledButton(container, preferredIndex) {
    const children = Array.from(container.children);
    if (children.length === 0) return null;
    const start = Math.max(0, Math.min(children.length - 1, preferredIndex));
    for (let offset = 0; offset < children.length; offset++) {
      const after = children[start + offset];
      if (after && !after.disabled && typeof after.focus === "function") {
        return after;
      }
      const before = children[start - offset];
      if (before && !before.disabled && typeof before.focus === "function") {
        return before;
      }
    }
    return null;
  }

  function focusInDialogFallback(preferredKind, preferredIndex = 0) {
    const listFallback =
      preferredKind === "job"
        ? findNearestEnabledButton(jobsList, preferredIndex) ||
          findNearestEnabledButton(destList, 0)
        : preferredKind === "destination"
          ? findNearestEnabledButton(destList, preferredIndex) ||
            findNearestEnabledButton(jobsList, 0)
          : null;
    const target = listFallback || layerButtons.get(activeLayer) || closeBtn;
    if (target && !target.disabled && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }

  function restoreFocusState(focusState) {
    if (!focusState || !dialog.open) return;
    if (focusState.kind === "job") {
      const nextBtn = Array.from(jobsList.children).find(
        (el) => el.dataset?.jobId === focusState.id,
      );
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.focus({ preventScroll: true });
      } else {
        focusInDialogFallback("job", focusState.index);
      }
      return;
    }
    if (focusState.kind === "destination") {
      const nextBtn = Array.from(destList.children).find(
        (el) => el.dataset?.destinationId === focusState.id,
      );
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.focus({ preventScroll: true });
      } else {
        focusInDialogFallback("destination", focusState.index);
      }
      return;
    }
    if (focusState.kind === "marker") {
      const nextPin = Array.from(
        svgContent.querySelectorAll("[data-marker-id]"),
      ).find((el) => el.dataset?.markerId === focusState.id);
      if (nextPin && typeof nextPin.focus === "function") {
        nextPin.focus({ preventScroll: true });
      } else {
        focusInDialogFallback(null);
      }
      return;
    }
    if (focusState.kind === "clear" && clearBtn.disabled) {
      focusInDialogFallback(null);
    }
  }

  function redraw() {
    const snapshot = currentSnapshot || {};
    const focusState = captureFocusState();
    for (const [layerId, btn] of layerButtons.entries()) {
      btn.setAttribute("aria-pressed", String(layerId === activeLayer));
    }

    clearBtn.disabled = !snapshot.selection;

    const p = snapshot.player;
    if (p && Number.isFinite(p.theta) && Number.isFinite(p.y)) {
      const h = Number.isFinite(p.height) ? p.height : 0;
      const layer = getNavigationLayer(h);
      const layerObj = MAP_LAYERS.find((l) => l.id === layer);
      const hText = `${h >= 0 ? "+" : ""}${h.toFixed(1)} m`;
      playerSummaryEl.textContent = `YOU: ${formatDegrees(p.theta)} · ${formatAxialMetres(p.y)} · ${hText} (${layerObj?.label ?? layer})`;
    } else {
      playerSummaryEl.textContent = "YOU: Position unavailable";
    }

    const wp = snapshot.waypoint;
    if (wp) {
      const distText = wp.arrived
        ? "ARRIVED"
        : Number.isFinite(wp.distance)
          ? `${Math.round(Math.max(0, wp.distance))} m`
          : "—";
      const step =
        !wp.arrived && wp.guidance?.name && wp.guidance.name !== wp.name
          ? ` via ${wp.guidance.name}`
          : "";
      waypointSummaryEl.textContent = `WAYPOINT: ${wp.name}${step} · ${distText}`;
    } else {
      waypointSummaryEl.textContent = "WAYPOINT: None selected";
    }

    tramStatusBar.replaceChildren();
    if (activeLayer === "surface") {
      for (const entry of snapshot.trams ?? []) {
        const line = TRAM_LINE_BY_ID.get(entry.lineId);
        const tram = entry.state;
        if (!line || !tram || !Number.isFinite(tram.theta) ||
            !Number.isFinite(tram.y) || !Number.isFinite(tram.height)) continue;
        const row = document.createElement("div");
        row.className = "habitat-map-tram-status";
        row.setAttribute("data-tram-status", "");
        row.setAttribute("data-tram-line", line.id);
        const head = document.createElement("span");
        head.className = "habitat-map-tram-head";
        const title = document.createElement("strong");
        title.textContent = line.axis === "y" ? "CIVILIAN TRAM" : line.title;
        const badge = document.createElement("span");
        badge.className = "map-badge map-badge-elev";
        badge.textContent = formatElevationBadge(tram.height) || "";
        badge.hidden = !badge.textContent;
        head.append(title, badge);
        const text = document.createElement("span");
        text.className = "habitat-map-tram-text";
        text.textContent = formatTramStatus(tram, line);
        row.append(head, text);
        tramStatusBar.appendChild(row);
      }
    }

    renderSvg(snapshot);
    renderLists(snapshot);
    restoreFocusState(focusState);
  }

  function open(snapshot) {
    currentSnapshot = snapshot || {};
    const playerHeight = currentSnapshot.player?.height ?? 0;
    activeLayer = getNavigationLayer(playerHeight);
    redraw();

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      const focusTarget = layerButtons.get(activeLayer) || closeBtn;
      focusTarget.focus();
    }
  }

  function render(snapshot) {
    currentSnapshot = snapshot || {};
    if (dialog.open) {
      redraw();
    }
  }

  function close() {
    if (!dialog.open) return;
    if (typeof dialog.close === "function") {
      pendingProgrammaticCloses += 1;
      try {
        dialog.close();
      } catch (err) {
        pendingProgrammaticCloses = Math.max(0, pendingProgrammaticCloses - 1);
        throw err;
      }
    } else {
      dialog.removeAttribute("open");
    }
  }

  function isOpen() {
    return Boolean(dialog.open);
  }

  return {
    open,
    render,
    close,
    isOpen,
  };
}
