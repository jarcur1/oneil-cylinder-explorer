import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { AXIAL_HEIGHT } from "./sunline-layout.js";
import { getNavigationLayer } from "./navigation.js";

const _worldPos = new THREE.Vector3();
const _viewPos = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();

function formatLevel(height, layer) {
  if (layer === "service" || height < -1) {
    return `SERVICE · ${Math.round(height)} m`;
  }
  if (layer === "axial" || height >= AXIAL_HEIGHT - 1) {
    return "AXIAL";
  }
  if (height >= 1.5) {
    return `ELEVATED · +${Math.round(height)} m`;
  }
  return "SURFACE";
}

function ensureElements(container) {
  let indicator = container.querySelector("#waypoint-indicator");
  let arrow = indicator?.querySelector(".waypoint-arrow") ?? null;
  let pip = indicator?.querySelector(".waypoint-pip") ?? null;
  let labelEl = container.querySelector("#waypoint-label");
  let distanceEl = container.querySelector("#waypoint-distance");
  let levelEl = container.querySelector("#waypoint-level");
  let srStatusEl = container.querySelector("#waypoint-sr-status");

  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "waypoint-indicator";
    indicator.className = "waypoint-indicator";

    arrow = document.createElement("span");
    arrow.className = "waypoint-arrow";
    arrow.setAttribute("aria-hidden", "true");

    pip = document.createElement("span");
    pip.className = "waypoint-pip";
    pip.setAttribute("aria-hidden", "true");

    const chip = document.createElement("div");
    chip.className = "waypoint-chip";

    labelEl = document.createElement("span");
    labelEl.id = "waypoint-label";
    labelEl.className = "waypoint-label";

    const meta = document.createElement("span");
    meta.className = "waypoint-meta";

    distanceEl = document.createElement("span");
    distanceEl.id = "waypoint-distance";
    distanceEl.className = "waypoint-distance";

    levelEl = document.createElement("span");
    levelEl.id = "waypoint-level";
    levelEl.className = "waypoint-level";

    meta.append(distanceEl, levelEl);
    chip.append(labelEl, meta);
    indicator.append(arrow, pip, chip);
    container.appendChild(indicator);
  } else {
    if (!labelEl) {
      labelEl = document.createElement("span");
      labelEl.id = "waypoint-label";
      labelEl.className = "waypoint-label";
      indicator.appendChild(labelEl);
    }
    if (!distanceEl) {
      distanceEl = document.createElement("span");
      distanceEl.id = "waypoint-distance";
      distanceEl.className = "waypoint-distance";
      indicator.appendChild(distanceEl);
    }
    if (!levelEl) {
      levelEl = document.createElement("span");
      levelEl.id = "waypoint-level";
      levelEl.className = "waypoint-level";
      indicator.appendChild(levelEl);
    }
  }

  if (!srStatusEl) {
    srStatusEl = document.createElement("span");
    srStatusEl.id = "waypoint-sr-status";
    srStatusEl.className = "sr-only";
    srStatusEl.setAttribute("role", "status");
    srStatusEl.setAttribute("aria-live", "polite");
    container.appendChild(srStatusEl);
  }

  return {
    indicator,
    arrow,
    labelEl,
    distanceEl,
    levelEl,
    srStatusEl,
  };
}

export function createWaypoint(camera, container) {
  if (!container) {
    return {
      update() {},
      hide() {},
    };
  }

  const els = ensureElements(container);
  let lastHidden = container.hidden;
  let lastLabel = null;
  let lastDistance = null;
  let lastLevel = null;
  let lastX = null;
  let lastY = null;
  let lastBehind = null;
  let lastEdge = null;
  let lastArrived = null;
  let lastHAlign = null;
  let lastVAlign = null;
  let lastAngle = null;
  let lastSrKey = null;

  function setTextIfChanged(el, prev, next) {
    if (prev !== next) {
      el.textContent = next;
    }
    return next;
  }

  function hide() {
    if (!lastHidden || !container.hidden) {
      container.hidden = true;
      lastHidden = true;
    }
    if (lastSrKey !== "") {
      els.srStatusEl.textContent = "";
      lastSrKey = "";
    }
  }

  function update(_playerState, waypoint) {
    const pose = waypoint?.guidance || waypoint?.target;
    if (
      !camera ||
      !waypoint ||
      !pose ||
      !Number.isFinite(pose.theta) ||
      !Number.isFinite(pose.y)
    ) {
      hide();
      return;
    }

    const screenW = container.clientWidth || window.innerWidth || 0;
    const screenH = container.clientHeight || window.innerHeight || 0;
    if (screenW <= 0 || screenH <= 0) {
      hide();
      return;
    }

    const baseHeight = Number.isFinite(pose.height) ? pose.height : 0;
    const labelOffset = baseHeight >= AXIAL_HEIGHT - 1 ? 1.0 : 1.8;
    const labelHeight = Math.min(RADIUS - 1, baseHeight + labelOffset);
    const radius = Math.max(1, RADIUS - labelHeight);

    _worldPos.set(
      radius * Math.sin(pose.theta),
      pose.y,
      -radius * Math.cos(pose.theta),
    );

    camera.updateMatrixWorld();
    _invMatrix.copy(camera.matrixWorld).invert();
    _viewPos.copy(_worldPos).applyMatrix4(_invMatrix);

    const vx = _viewPos.x;
    const vy = _viewPos.y;
    const vz = _viewPos.z;
    const distToCamera = Math.hypot(vx, vy, vz);
    if (!Number.isFinite(distToCamera)) {
      hide();
      return;
    }

    const elements = camera.projectionMatrix?.elements;
    let p00 = elements?.[0];
    let p11 = elements?.[5];
    if (!Number.isFinite(p00) || p00 === 0 || !Number.isFinite(p11) || p11 === 0) {
      const fovRad = (((camera.fov || 75) * Math.PI) / 180) * 0.5;
      const tanHalf = Math.max(1e-4, Math.tan(fovRad));
      p11 = 1 / tanHalf;
      p00 = p11 / Math.max(0.1, camera.aspect || screenW / screenH);
    }

    const compact = screenW <= 520;
    const safeMinX = compact ? 14 : 24;
    const safeMaxX = Math.max(safeMinX, screenW - safeMinX);
    const safeMinY = compact ? 92 : 96;
    const safeMaxY = Math.max(safeMinY, screenH - (compact ? 86 : 92));
    const cx = screenW * 0.5;
    const cy = screenH * 0.5;

    const forward = -vz;
    const behind = vz > 1e-4;
    let edge = false;
    let px = cx;
    let py = cy;
    let dirX = 0;
    let dirY = 0;

    if (distToCamera >= 1e-3) {
      if (!behind && forward > 1e-3) {
        const ndcX = (vx * p00) / forward;
        const ndcY = (vy * p11) / forward;
        const rawX = (ndcX * 0.5 + 0.5) * screenW;
        const rawY = (-ndcY * 0.5 + 0.5) * screenH;

        if (
          Number.isFinite(rawX) &&
          Number.isFinite(rawY) &&
          rawX >= safeMinX &&
          rawX <= safeMaxX &&
          rawY >= safeMinY &&
          rawY <= safeMaxY
        ) {
          px = rawX;
          py = rawY;
          edge = false;
        } else {
          edge = true;
          dirX = rawX - cx;
          dirY = rawY - cy;
        }
      } else {
        edge = true;
        dirX = vx * p00 * cx;
        dirY = -vy * p11 * cy;
      }

      if (edge) {
        if (!Number.isFinite(dirX) || !Number.isFinite(dirY) || Math.hypot(dirX, dirY) < 1e-5) {
          dirX = 0;
          dirY = 1;
        }
        const tx =
          dirX > 1e-6
            ? (safeMaxX - cx) / dirX
            : dirX < -1e-6
              ? (safeMinX - cx) / dirX
              : Infinity;
        const ty =
          dirY > 1e-6
            ? (safeMaxY - cy) / dirY
            : dirY < -1e-6
              ? (safeMinY - cy) / dirY
              : Infinity;
        const t = Math.min(tx, ty);
        if (Number.isFinite(t) && t >= 0) {
          px = cx + dirX * t;
          py = cy + dirY * t;
        }
      }
    }

    px = Math.round(Math.max(safeMinX, Math.min(safeMaxX, px)));
    py = Math.round(Math.max(safeMinY, Math.min(safeMaxY, py)));

    const hAlign =
      px < Math.min(125, screenW * 0.3)
        ? "left"
        : px > screenW - Math.min(125, screenW * 0.3)
          ? "right"
          : "center";
    const vAlign = py > screenH - (compact ? 140 : 152) ? "above" : "below";

    const arrived = Boolean(waypoint.arrived);
    const targetName = waypoint.name || pose.name || "Waypoint";
    const labelText =
      !arrived && waypoint.guidance?.name && waypoint.guidance.name !== targetName
        ? `${waypoint.guidance.name} → ${targetName}`
        : targetName;

    const distanceText = arrived
      ? "ARRIVED"
      : Number.isFinite(waypoint.distance)
        ? `${Math.round(Math.max(0, waypoint.distance))} m`
        : "—";

    const poseLayer = pose.layer ?? waypoint.layer ?? getNavigationLayer(baseHeight);
    const baseLevelText = formatLevel(baseHeight, poseLayer);
    const levelText = behind ? `BEHIND · ${baseLevelText}` : baseLevelText;

    const angleDeg = edge
      ? Math.round((Math.atan2(dirY, dirX) * 180) / Math.PI)
      : 0;

    if (lastHidden || container.hidden) {
      container.hidden = false;
      lastHidden = false;
    }

    if (lastX !== px || lastY !== py) {
      els.indicator.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      lastX = px;
      lastY = py;
    }

    const behindStr = String(behind);
    if (lastBehind !== behindStr) {
      container.dataset.behind = behindStr;
      lastBehind = behindStr;
    }

    const edgeStr = String(edge);
    if (lastEdge !== edgeStr) {
      container.dataset.edge = edgeStr;
      lastEdge = edgeStr;
    }

    const arrivedStr = String(arrived);
    if (lastArrived !== arrivedStr) {
      container.dataset.arrived = arrivedStr;
      lastArrived = arrivedStr;
    }

    if (lastHAlign !== hAlign) {
      els.indicator.dataset.halign = hAlign;
      lastHAlign = hAlign;
    }

    if (lastVAlign !== vAlign) {
      els.indicator.dataset.valign = vAlign;
      lastVAlign = vAlign;
    }

    if (els.arrow && lastAngle !== angleDeg) {
      els.arrow.style.setProperty("--arrow-deg", `${angleDeg}deg`);
      lastAngle = angleDeg;
    }

    lastLabel = setTextIfChanged(els.labelEl, lastLabel, labelText);
    lastDistance = setTextIfChanged(els.distanceEl, lastDistance, distanceText);
    lastLevel = setTextIfChanged(els.levelEl, lastLevel, levelText);

    const srKey = `${waypoint.id ?? targetName}|${waypoint.guidance?.name ?? ""}|${arrived ? 1 : 0}|${baseLevelText}`;
    if (lastSrKey !== srKey) {
      lastSrKey = srKey;
      els.srStatusEl.textContent = arrived
        ? `Arrived at ${targetName}`
        : `Waypoint: ${labelText}, ${baseLevelText}`;
    }
  }

  return {
    update,
    hide,
  };
}
