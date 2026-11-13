// Compact game-scale habitat; metres, Y is the cylinder's longitudinal axis.
export const RADIUS = 180;
export const LENGTH = 900;
export const SPAWN = Object.freeze({ theta: 0, y: -310 });
export const EYE_HEIGHT = 1.7;
export const GRAVITY = 9.81;

export function gravityAtHeight(height) {
  return (GRAVITY * Math.max(0, RADIUS - height)) / RADIUS;
}
