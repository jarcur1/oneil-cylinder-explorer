import { Vector3 } from "three";
import { RADIUS, LENGTH } from "./habitat.js";
import { wrappedDeltaTheta } from "./cylinder-math.js";
import { DRONE_LAUNCH } from "./drone-layout.js";

const TWO_PI = Math.PI * 2;
const HALF_CIRCUMFERENCE = Math.PI * RADIUS;
const FULL_CIRCUMFERENCE = TWO_PI * RADIUS;

const HALF_LENGTH = LENGTH * 0.5;
const AXIAL_MARGIN = 4.0;
const MIN_Y = -HALF_LENGTH + AXIAL_MARGIN;
const MAX_Y = HALF_LENGTH - AXIAL_MARGIN;

const MIN_HEIGHT = 1.25;
const MAX_HEIGHT = 325;
const DRONE_RADIUS = 0.6;

const CRUISE_SPEED = 20.0;
const BOOST_SPEED = 50.0;

const MOUSE_SENSITIVITY = 0.0022;
const KEY_LOOK_SPEED = 2.0;
const MAX_PITCH = 1.55;

const MAX_DELTA = 0.1;
const SUBSTEP_DELTA = 0.01;
const CONTACT_EPSILON = 1e-9;

const _eye = new Vector3();
const _target = new Vector3();
const _up = new Vector3();

function wrapTheta(t) {
  t = (t + Math.PI) % TWO_PI;
  return t < 0 ? t + Math.PI : t - Math.PI;
}

function clampY(value) {
  return Math.max(MIN_Y, Math.min(MAX_Y, value));
}

function clampHeight(value) {
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, value));
}

function clampPitch(value) {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, value));
}

function normalizeAnglePreserveSeam(angle) {
  return angle >= -Math.PI && angle <= Math.PI ? angle : wrapTheta(angle);
}

function buildCollisionBoxes(obstacles) {
  const boxes = [];
  if (!obstacles) return boxes;
  for (const obs of obstacles) {
    if (!obs) continue;
    const base = obs.base ?? 0;
    const { theta, y, width, depth, height } = obs;
    if (
      !Number.isFinite(theta) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(depth) ||
      !Number.isFinite(height) ||
      !Number.isFinite(base)
    ) {
      continue;
    }
    const top = base + height;
    boxes.push({
      theta: wrapTheta(theta),
      y,
      hw: Math.abs(width) * 0.5,
      hl: Math.abs(depth) * 0.5,
      minH: base < top ? base : top,
      maxH: base < top ? top : base,
    });
  }
  return boxes;
}

export function createSurveyDrone(camera, obstacles = []) {
  const collisionBoxes = buildCollisionBoxes(obstacles);

  let theta = 0;
  let y = 0;
  let h = MIN_HEIGHT;
  let yaw = 0;
  let pitch = 0;

  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    ascend: false,
    descend: false,
    boostLeft: false,
    boostRight: false,
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
    keys.ascend = false;
    keys.descend = false;
    keys.boostLeft = false;
    keys.boostRight = false;
    keys.lookLeft = false;
    keys.lookRight = false;
    keys.lookUp = false;
    keys.lookDown = false;
  }

  function updateCamera() {
    const r = RADIUS - h;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    const eyeX = r * sinT;
    const eyeY = y;
    const eyeZ = -r * cosT;

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

  function start() {
    theta = normalizeAnglePreserveSeam(DRONE_LAUNCH.theta);
    y = clampY(DRONE_LAUNCH.y);
    h = clampHeight(DRONE_LAUNCH.height);
    yaw = normalizeAnglePreserveSeam(DRONE_LAUNCH.yaw);
    pitch = clampPitch(DRONE_LAUNCH.pitch);
    clearInput();
    updateCamera();
  }

  function key(code, down) {
    const isDown = Boolean(down);
    switch (code) {
      case "KeyW": keys.forward = isDown; break;
      case "KeyS": keys.backward = isDown; break;
      case "KeyA": keys.left = isDown; break;
      case "KeyD": keys.right = isDown; break;
      case "Space": keys.ascend = isDown; break;
      case "KeyQ": keys.descend = isDown; break;
      case "ShiftLeft": keys.boostLeft = isDown; break;
      case "ShiftRight": keys.boostRight = isDown; break;
      case "ArrowUp": keys.lookUp = isDown; break;
      case "ArrowDown": keys.lookDown = isDown; break;
      case "ArrowLeft": keys.lookLeft = isDown; break;
      case "ArrowRight": keys.lookRight = isDown; break;
      default: return false;
    }
    return true;
  }

  function look(dx, dy) {
    if (Number.isFinite(dx)) {
      yaw = wrapTheta(yaw + dx * MOUSE_SENSITIVITY);
    }
    if (Number.isFinite(dy)) {
      pitch = clampPitch(pitch - dy * MOUSE_SENSITIVITY);
    }
    updateCamera();
  }

  function overlapsBoxHorizAtHeight(box, testTheta, testY, padArc) {
    if (Math.abs(testY - box.y) >= box.hl + DRONE_RADIUS - CONTACT_EPSILON) {
      return false;
    }
    const dArc = wrappedDeltaTheta(testTheta, box.theta) * RADIUS;
    return Math.abs(dArc) < box.hw + padArc - CONTACT_EPSILON;
  }

  function resolveAxisY(dy) {
    const targetY = clampY(y + dy);
    if (targetY === y) return;

    const dir = targetY > y ? 1 : -1;
    let bestY = targetY;
    const padArc = (DRONE_RADIUS * RADIUS) / (RADIUS - h);

    for (let i = 0; i < collisionBoxes.length; i++) {
      const box = collisionBoxes[i];
      if (
        h + DRONE_RADIUS - box.minH <= CONTACT_EPSILON ||
        box.maxH - (h - DRONE_RADIUS) <= CONTACT_EPSILON
      ) {
        continue;
      }

      const minBlockY = box.y - box.hl - DRONE_RADIUS;
      const maxBlockY = box.y + box.hl + DRONE_RADIUS;

      if (dir > 0) {
        if (bestY <= minBlockY || y > minBlockY + CONTACT_EPSILON) continue;
      } else {
        if (bestY >= maxBlockY || y < maxBlockY - CONTACT_EPSILON) continue;
      }

      const dArc = wrappedDeltaTheta(theta, box.theta) * RADIUS;
      if (Math.abs(dArc) >= box.hw + padArc - CONTACT_EPSILON) continue;

      if (dir > 0) {
        const clamped = y > minBlockY ? y : minBlockY;
        if (clamped < bestY) bestY = clamped;
      } else {
        const clamped = y < maxBlockY ? y : maxBlockY;
        if (clamped > bestY) bestY = clamped;
      }
    }

    y = bestY;
  }

  function resolveAxisTheta(dArc) {
    if (dArc === 0) return;

    const r = RADIUS - h;
    const dTheta = dArc / r;
    const dir = dTheta > 0 ? 1 : -1;
    let bestDTheta = dTheta;
    const padArc = (DRONE_RADIUS * RADIUS) / r;

    for (let i = 0; i < collisionBoxes.length; i++) {
      const box = collisionBoxes[i];
      if (
        h + DRONE_RADIUS - box.minH <= CONTACT_EPSILON ||
        box.maxH - (h - DRONE_RADIUS) <= CONTACT_EPSILON
      ) {
        continue;
      }
      if (Math.abs(y - box.y) >= box.hl + DRONE_RADIUS - CONTACT_EPSILON) {
        continue;
      }

      const limitArc = box.hw + padArc;
      if (limitArc >= HALF_CIRCUMFERENCE) continue;

      const relArc = wrappedDeltaTheta(theta, box.theta) * RADIUS;

      if (dir > 0) {
        let startArc = NaN;
        if (relArc <= -limitArc + CONTACT_EPSILON) {
          startArc = relArc;
        } else if (relArc - FULL_CIRCUMFERENCE <= -limitArc + CONTACT_EPSILON) {
          startArc = relArc - FULL_CIRCUMFERENCE;
        }
        if (Number.isFinite(startArc) && startArc + bestDTheta * RADIUS > -limitArc) {
          const allowed = Math.max(0, (-limitArc - startArc) / RADIUS);
          if (allowed < bestDTheta) bestDTheta = allowed;
        }
      } else {
        let startArc = NaN;
        if (relArc >= limitArc - CONTACT_EPSILON) {
          startArc = relArc;
        } else if (relArc + FULL_CIRCUMFERENCE >= limitArc - CONTACT_EPSILON) {
          startArc = relArc + FULL_CIRCUMFERENCE;
        }
        if (Number.isFinite(startArc) && startArc + bestDTheta * RADIUS < limitArc) {
          const allowed = Math.min(0, (limitArc - startArc) / RADIUS);
          if (allowed > bestDTheta) bestDTheta = allowed;
        }
      }
    }

    theta = wrapTheta(theta + bestDTheta);
  }

  function resolveAxisH(dh) {
    const targetH = clampHeight(h + dh);
    if (targetH === h) return;

    const dir = targetH > h ? 1 : -1;
    let bestH = targetH;

    for (let i = 0; i < collisionBoxes.length; i++) {
      const box = collisionBoxes[i];
      const minBlockH = box.minH - DRONE_RADIUS;
      const maxBlockH = box.maxH + DRONE_RADIUS;

      if (dir > 0) {
        if (bestH <= minBlockH || h > minBlockH + CONTACT_EPSILON) continue;
      } else {
        if (bestH >= maxBlockH || h < maxBlockH - CONTACT_EPSILON) continue;
      }

      if (Math.abs(y - box.y) >= box.hl + DRONE_RADIUS - CONTACT_EPSILON) {
        continue;
      }

      const contactH = dir > 0 ? minBlockH : maxBlockH;
      const contactR = Math.max(1, RADIUS - contactH);
      const padArc = (DRONE_RADIUS * RADIUS) / contactR;
      const dArc = wrappedDeltaTheta(theta, box.theta) * RADIUS;
      if (Math.abs(dArc) >= box.hw + padArc - CONTACT_EPSILON) continue;

      if (dir > 0) {
        const clamped = h > minBlockH ? h : minBlockH;
        if (clamped < bestH) bestH = clamped;
      } else {
        const clamped = h < maxBlockH ? h : maxBlockH;
        if (clamped > bestH) bestH = clamped;
      }
    }

    // Ascending shrinks physical radius (RADIUS - h), widening angular clearance.
    // Slide theta outward along any adjacent side wall, or arrest ascent if pinched.
    if (bestH > h) {
      const newPadArc = (DRONE_RADIUS * RADIUS) / (RADIUS - bestH);
      if (newPadArc < HALF_CIRCUMFERENCE) {
        const savedTheta = theta;
        for (let i = 0; i < collisionBoxes.length; i++) {
          const box = collisionBoxes[i];
          if (
            bestH + DRONE_RADIUS - box.minH <= CONTACT_EPSILON ||
            box.maxH - (bestH - DRONE_RADIUS) <= CONTACT_EPSILON
          ) {
            continue;
          }
          if (Math.abs(y - box.y) >= box.hl + DRONE_RADIUS - CONTACT_EPSILON) {
            continue;
          }
          const limitArc = box.hw + newPadArc;
          if (limitArc >= HALF_CIRCUMFERENCE) continue;
          const dArc = wrappedDeltaTheta(theta, box.theta) * RADIUS;
          if (Math.abs(dArc) < limitArc - CONTACT_EPSILON) {
            const sign = dArc >= 0 ? 1 : -1;
            theta = wrapTheta(box.theta + (sign * limitArc) / RADIUS);
          }
        }
        if (theta !== savedTheta) {
          for (let i = 0; i < collisionBoxes.length; i++) {
            const box = collisionBoxes[i];
            if (
              bestH + DRONE_RADIUS - box.minH <= CONTACT_EPSILON ||
              box.maxH - (bestH - DRONE_RADIUS) <= CONTACT_EPSILON
            ) {
              continue;
            }
            if (overlapsBoxHorizAtHeight(box, theta, y, newPadArc)) {
              theta = savedTheta;
              bestH = h;
              break;
            }
          }
        }
      }
    }

    h = bestH;
  }

  function stepDrone(dArc, dy, dh) {
    resolveAxisY(dy);
    resolveAxisTheta(dArc);
    resolveAxisH(dh);
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) {
      updateCamera();
      return;
    }

    const clampedDt = dt > MAX_DELTA ? MAX_DELTA : dt;

    if (keys.lookLeft) yaw -= KEY_LOOK_SPEED * clampedDt;
    if (keys.lookRight) yaw += KEY_LOOK_SPEED * clampedDt;
    if (keys.lookUp) pitch += KEY_LOOK_SPEED * clampedDt;
    if (keys.lookDown) pitch -= KEY_LOOK_SPEED * clampedDt;
    yaw = wrapTheta(yaw);
    pitch = clampPitch(pitch);

    let dx = 0;
    let dz = 0;
    let dh = 0;
    if (keys.forward) dz += 1;
    if (keys.backward) dz -= 1;
    if (keys.right) dx += 1;
    if (keys.left) dx -= 1;
    if (keys.ascend) dh += 1;
    if (keys.descend) dh -= 1;

    const moveLen = Math.hypot(dx, dz, dh);
    if (moveLen > 0) {
      dx /= moveLen;
      dz /= moveLen;
      dh /= moveLen;

      const moveSpeed = keys.boostLeft || keys.boostRight ? BOOST_SPEED : CRUISE_SPEED;
      const velCirc = (dz * Math.sin(yaw) + dx * Math.cos(yaw)) * moveSpeed;
      const velLong = (dz * Math.cos(yaw) - dx * Math.sin(yaw)) * moveSpeed;
      const velRad = dh * moveSpeed;

      const substeps = Math.max(1, Math.ceil(clampedDt / SUBSTEP_DELTA));
      const subDt = clampedDt / substeps;
      const stepArc = velCirc * subDt;
      const stepY = velLong * subDt;
      const stepH = velRad * subDt;

      for (let s = 0; s < substeps; s++) {
        stepDrone(stepArc, stepY, stepH);
      }
    }

    updateCamera();
  }

  function getState(out = {}) {
    out.theta = theta;
    out.y = y;
    out.height = h;
    out.yaw = yaw;
    out.pitch = pitch;
    return out;
  }

  start();

  return {
    start,
    update,
    key,
    look,
    clearInput,
    getState,
  };
}
