import { Vector3 } from "three";
import {
  RADIUS,
  LENGTH,
  SPAWN,
  EYE_HEIGHT,
  gravityAtHeight,
} from "./habitat.js";

const TWO_PI = Math.PI * 2;
const HALF_LENGTH = LENGTH * 0.5;
const MARGIN = 4.0;
const MIN_Y = -HALF_LENGTH + MARGIN;
const MAX_Y = HALF_LENGTH - MARGIN;

const WALK_SPEED = 7.0;
const SPRINT_SPEED = 18.0;
const JUMP_VELOCITY = 6.0;
const PLAYER_RADIUS = 0.45;
const STEP_HEIGHT = 0.25;

const MOUSE_SENSITIVITY = 0.0022;
const DRAG_SENSITIVITY = 0.003;
const KEY_LOOK_SPEED = 2.0;
const MAX_PITCH = 1.55;

const MAX_DELTA = 0.1;
const SUBSTEP_DELTA = 0.02;

function wrapTheta(t) {
  t = (t + Math.PI) % TWO_PI;
  return t < 0 ? t + Math.PI : t - Math.PI;
}

function wrappedDeltaTheta(t1, t2) {
  let dt = (t1 - t2) % TWO_PI;
  if (dt > Math.PI) dt -= TWO_PI;
  if (dt < -Math.PI) dt += TWO_PI;
  return dt;
}

const _eye = new Vector3();
const _target = new Vector3();
const _up = new Vector3();

export function createPlayer(camera, domElement, options = {}) {
  const { onLockChange, groundHeight = 0 } = options;
  // Arc-coordinate prisms may be grounded or elevated (bridges, floors, roofs).
  const collisionBoxes = (options.obstacles ?? []).map(
    ({ theta, y, width, depth, height, base = 0 }) => ({
      theta,
      y,
      hw: width / 2,
      hl: depth / 2,
      minH: base,
      maxH: base + height,
    }),
  );

  let theta = SPAWN.theta;
  let y = SPAWN.y;
  let h = 0;
  let velH = 0;
  let yaw = 0;
  let pitch = 0;
  let speed = 0;
  let grounded = true;
  let enabled = false;

  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let wasLocked = false;

  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
    lookLeft: false,
    lookRight: false,
    lookUp: false,
    lookDown: false,
  };

  function clearInput() {
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
    keys.sprint = false;
    keys.jump = false;
    keys.lookLeft = false;
    keys.lookRight = false;
    keys.lookUp = false;
    keys.lookDown = false;
    isDragging = false;
  }

  function isGameplayKey(code, key) {
    switch (code) {
      case "KeyW":
      case "KeyA":
      case "KeyS":
      case "KeyD":
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
      case "Space":
      case "ShiftLeft":
      case "ShiftRight":
        return true;
    }
    const k = key ? key.toLowerCase() : "";
    if (
      k === "w" ||
      k === "a" ||
      k === "s" ||
      k === "d" ||
      k === " " ||
      k === "shift"
    ) {
      return true;
    }
    return false;
  }

  function setKeyState(code, key, isDown) {
    switch (code) {
      case "KeyW":
        keys.forward = isDown;
        return;
      case "KeyS":
        keys.backward = isDown;
        return;
      case "KeyA":
        keys.left = isDown;
        return;
      case "KeyD":
        keys.right = isDown;
        return;
      case "Space":
        keys.jump = isDown;
        return;
      case "ShiftLeft":
      case "ShiftRight":
        keys.sprint = isDown;
        return;
      case "ArrowUp":
        keys.lookUp = isDown;
        return;
      case "ArrowDown":
        keys.lookDown = isDown;
        return;
      case "ArrowLeft":
        keys.lookLeft = isDown;
        return;
      case "ArrowRight":
        keys.lookRight = isDown;
        return;
    }
    const k = key ? key.toLowerCase() : "";
    if (k === "w") keys.forward = isDown;
    else if (k === "s") keys.backward = isDown;
    else if (k === "a") keys.left = isDown;
    else if (k === "d") keys.right = isDown;
    else if (k === " ") keys.jump = isDown;
    else if (k === "shift") keys.sprint = isDown;
  }

  function onKeyDown(e) {
    if (!enabled) return;
    if (isGameplayKey(e.code, e.key)) {
      e.preventDefault();
      setKeyState(e.code, e.key, true);
    }
  }

  function onKeyUp(e) {
    if (!enabled) return;
    if (isGameplayKey(e.code, e.key)) {
      e.preventDefault();
      setKeyState(e.code, e.key, false);
    }
  }

  function onPointerDown(e) {
    if (!enabled) return;
    if (document.pointerLockElement === domElement) return;
    if (e.button === 0) {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  }

  function onPointerMove(e) {
    if (!enabled) return;
    const isLocked = document.pointerLockElement === domElement;
    if (isLocked) {
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      yaw += mx * MOUSE_SENSITIVITY;
      pitch -= my * MOUSE_SENSITIVITY;
    } else if (isDragging) {
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      yaw += dx * DRAG_SENSITIVITY;
      pitch -= dy * DRAG_SENSITIVITY;
    }
  }

  function onPointerUp(e) {
    if (e.button === 0) {
      isDragging = false;
    }
  }

  function onPointerCancel() {
    isDragging = false;
  }

  function onBlur() {
    clearInput();
  }

  function checkPointerLockChange() {
    const isLocked = document.pointerLockElement === domElement;
    if (isLocked) {
      isDragging = false;
    }
    if (isLocked !== wasLocked) {
      wasLocked = isLocked;
      onLockChange?.(isLocked);
    }
  }

  if (domElement) {
    domElement.addEventListener("pointerdown", onPointerDown);
  }
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("pointerlockchange", checkPointerLockChange);
  document.addEventListener("pointerlockerror", checkPointerLockChange);

  function updateCamera() {
    const eyeR = RADIUS - (h + EYE_HEIGHT);
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    const eyeX = eyeR * sinT;
    const eyeY = y;
    const eyeZ = -eyeR * cosT;

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    const dirX = cosP * sinY * cosT - sinP * sinT;
    const dirY = cosP * cosY;
    const dirZ = cosP * sinY * sinT + sinP * cosT;

    const upX = -sinT;
    const upY = 0;
    const upZ = cosT;

    _eye.set(eyeX, eyeY, eyeZ);
    _up.set(upX, upY, upZ);
    _target.set(eyeX + dirX, eyeY + dirY, eyeZ + dirZ);

    camera.position.copy(_eye);
    camera.up.copy(_up);
    camera.lookAt(_target);
  }

  function resolveObstacleCollisions(obsList, previousTheta, previousY) {
    if (!obsList || obsList.length === 0) return;
    const radius = Math.max(1, RADIUS - h);
    let corrected = false;

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < obsList.length; i++) {
        const {
          theta: oTheta,
          y: oY,
          hw: arcHalfWidth,
          hl,
          minH,
          maxH,
        } = obsList[i];

        const isBeside = h < maxH - STEP_HEIGHT && h + EYE_HEIGHT + 0.15 > minH;
        if (!isBeside) continue;

        const hw = (arcHalfWidth * radius) / RADIUS;
        const ds = wrappedDeltaTheta(theta, oTheta) * radius;
        const dy = y - oY;

        const cx = Math.max(-hw, Math.min(hw, ds));
        const cy = Math.max(-hl, Math.min(hl, dy));

        const vx = ds - cx;
        const vy = dy - cy;
        const distSq = vx * vx + vy * vy;

        if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
          corrected = true;
          let pushS = 0;
          let pushY = 0;

          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const pen = PLAYER_RADIUS - dist;
            pushS = (vx / dist) * pen;
            pushY = (vy / dist) * pen;
          } else {
            const penRight = hw - ds;
            const penLeft = ds + hw;
            const penTop = hl - dy;
            const penBottom = dy + hl;
            const minPen = Math.min(penRight, penLeft, penTop, penBottom);

            if (minPen === penRight) pushS = penRight + PLAYER_RADIUS;
            else if (minPen === penLeft) pushS = -(penLeft + PLAYER_RADIUS);
            else if (minPen === penTop) pushY = penTop + PLAYER_RADIUS;
            else pushY = -(penBottom + PLAYER_RADIUS);
          }

          theta += pushS / radius;
          theta = wrapTheta(theta);
          y += pushY;
          if (y < MIN_Y) y = MIN_Y;
          if (y > MAX_Y) y = MAX_Y;
        }
      }
    }
    // Sequential pushes can alternate between opposing walls forever. Never
    // commit an unresolved squeeze: retain the last valid horizontal pose.
    if (corrected) {
      for (const box of obsList) {
        if (
          h < box.maxH - STEP_HEIGHT &&
          h + EYE_HEIGHT + 0.15 > box.minH &&
          overlapsFootprint(box, 1e-8)
        ) {
          theta = previousTheta;
          y = previousY;
          return;
        }
      }
    }
  }

  function overlapsFootprint(box, tolerance = 0) {
    const radius = Math.max(1, RADIUS - h);
    const hw = (box.hw * radius) / RADIUS;
    const ds = wrappedDeltaTheta(theta, box.theta) * radius;
    const dy = y - box.y;
    const vx = ds - Math.max(-hw, Math.min(hw, ds));
    const vy = dy - Math.max(-box.hl, Math.min(box.hl, dy));
    return vx * vx + vy * vy < PLAYER_RADIUS * PLAYER_RADIUS - tolerance;
  }

  function computeFloorHeight(previousHeight) {
    let floor = groundHeight;
    for (const box of collisionBoxes) {
      // Use the previous height: a fast fall must not skip a thin raised deck.
      if (
        box.maxH <= previousHeight + STEP_HEIGHT &&
        box.maxH > floor &&
        overlapsFootprint(box)
      )
        floor = box.maxH;
    }
    return floor;
  }

  function resolveCeiling(previousHeight) {
    const bodyHeight = EYE_HEIGHT + 0.15;
    if (velH <= 0) return;
    for (const box of collisionBoxes) {
      if (
        previousHeight + bodyHeight <= box.minH &&
        h + bodyHeight >= box.minH &&
        overlapsFootprint(box)
      ) {
        h = box.minH - bodyHeight;
        velH = 0;
      }
    }
  }

  function update(dt) {
    const clampedDt = Math.max(0, Math.min(dt || 0, MAX_DELTA));

    if (enabled && clampedDt > 0) {
      if (keys.lookLeft) yaw -= KEY_LOOK_SPEED * clampedDt;
      if (keys.lookRight) yaw += KEY_LOOK_SPEED * clampedDt;
      if (keys.lookUp) pitch += KEY_LOOK_SPEED * clampedDt;
      if (keys.lookDown) pitch -= KEY_LOOK_SPEED * clampedDt;

      pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
      yaw = wrapTheta(yaw);

      const startTheta = theta;
      const startY = y;
      const startRadius = RADIUS - h;

      const substeps = Math.max(1, Math.ceil(clampedDt / SUBSTEP_DELTA));
      const subDt = clampedDt / substeps;

      let dx = 0;
      let dz = 0;
      if (keys.forward) dz += 1;
      if (keys.backward) dz -= 1;
      if (keys.right) dx += 1;
      if (keys.left) dx -= 1;

      const moveLen = Math.hypot(dx, dz);
      if (moveLen > 0) {
        dx /= moveLen;
        dz /= moveLen;
      }

      const moveSpeed = keys.sprint ? SPRINT_SPEED : WALK_SPEED;
      const velCirc = (dz * Math.sin(yaw) + dx * Math.cos(yaw)) * moveSpeed;
      const velLong = (dz * Math.cos(yaw) - dx * Math.sin(yaw)) * moveSpeed;

      for (let s = 0; s < substeps; s++) {
        const previousTheta = theta;
        const previousY = y;
        const walkRadius = Math.max(1.0, RADIUS - h);
        theta += (velCirc * subDt) / walkRadius;
        theta = wrapTheta(theta);
        y += velLong * subDt;

        if (y < MIN_Y) y = MIN_Y;
        if (y > MAX_Y) y = MAX_Y;

        resolveObstacleCollisions(collisionBoxes, previousTheta, previousY);

        if (keys.jump && grounded) {
          velH = JUMP_VELOCITY;
          grounded = false;
        }

        if (!grounded) {
          velH -= gravityAtHeight(h) * subDt;
        }

        const previousHeight = h;
        h += velH * subDt;
        resolveCeiling(previousHeight);

        const currentFloor = computeFloorHeight(previousHeight);

        if (h <= currentFloor) {
          h = currentFloor;
          velH = 0;
          grounded = true;
        } else {
          grounded = false;
        }
      }

      const dTh = wrappedDeltaTheta(theta, startTheta);
      const ds = dTh * (startRadius + RADIUS - h) * 0.5;
      const dy = y - startY;
      speed = Math.hypot(ds, dy) / clampedDt;
    } else {
      speed = 0;
    }

    updateCamera();
  }

  function teleport(pose) {
    theta = wrapTheta(pose.theta);
    y = Math.max(MIN_Y, Math.min(MAX_Y, pose.y));
    h = Math.max(groundHeight, Math.min(RADIUS - EYE_HEIGHT - 1, pose.height));
    velH = 0;
    yaw = pose.yaw ?? 0;
    pitch = 0;
    speed = 0;
    grounded = Math.abs(h - computeFloorHeight(h)) < 0.001;
    clearInput();
    updateCamera();
  }

  function reset() {
    teleport({ theta: SPAWN.theta, y: SPAWN.y, height: 0 });
  }

  async function requestLock() {
    if (!domElement) return false;
    if (document.pointerLockElement === domElement) return true;
    try {
      const p = domElement.requestPointerLock();
      if (p && typeof p.then === "function") {
        await p;
      }
      return document.pointerLockElement === domElement;
    } catch {
      return false;
    }
  }

  function setEnabled(bool) {
    enabled = !!bool;
    if (!enabled) {
      clearInput();
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock();
      }
    }
  }

  // Reuse a caller-owned snapshot for HUD and frame-rate audio updates.
  function getState(target) {
    target.theta = theta;
    target.y = y;
    target.height = h;
    target.speed = speed;
    target.grounded = grounded;
    target.locked = document.pointerLockElement === domElement;
    target.gravity = gravityAtHeight(h);
    return target;
  }

  function dispose() {
    setEnabled(false);
    if (domElement) {
      domElement.removeEventListener("pointerdown", onPointerDown);
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("pointerlockchange", checkPointerLockChange);
    document.removeEventListener("pointerlockerror", checkPointerLockChange);
  }

  updateCamera();

  return {
    update,
    reset,
    teleport,
    requestLock,
    setEnabled,
    getState,
    dispose,
  };
}
