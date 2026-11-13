import { RADIUS } from "./habitat.js";

const TWO_PI = Math.PI * 2;

export function wrappedDeltaTheta(a, b) {
  let dt = (a - b) % TWO_PI;
  if (dt > Math.PI) dt -= TWO_PI;
  if (dt < -Math.PI) dt += TWO_PI;
  return dt;
}

export function horizontalDistance(
  theta,
  y,
  targetTheta,
  targetY,
  targetHeight = 0,
) {
  const ds =
    wrappedDeltaTheta(theta, targetTheta) * Math.max(1, RADIUS - targetHeight);
  return Math.hypot(ds, y - targetY);
}

export function spatialDistance(
  theta,
  y,
  height,
  targetTheta,
  targetY,
  targetHeight = 0,
) {
  const ds =
    wrappedDeltaTheta(theta, targetTheta) * Math.max(1, RADIUS - targetHeight);
  return Math.hypot(ds, y - targetY, height - targetHeight);
}
