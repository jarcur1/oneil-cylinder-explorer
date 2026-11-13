import { RADIUS } from "./habitat.js";

export const SERVICE_FLOOR = -8;
export const SERVICE_NAME = "Meridian Service Level";
export const SERVICE_ACCESS = Object.freeze({
  theta: -14 / RADIUS,
  y: -30,
  height: 0,
  yaw: 0,
});

export const SERVICE_BOUNDS = Object.freeze({
  minS: -33.5,
  maxS: 7.5,
  minY: -34,
  maxY: 23,
});

export const SERVICE_STOPS = [
  {
    id: "meridian-water-plant",
    name: "Meridian water plant",
    theta: -25.5 / RADIUS,
    y: 6,
    color: 0x5bc0be,
    radius: 7,
    minHeight: -8.5,
    maxHeight: -3.5,
    hint: "Southwest of Meridian plaza, enter the service pavilion and take the lift down. Follow the corridor north, then turn west into the water plant.",
  },
  {
    id: "meridian-power-room",
    name: "Meridian power room",
    theta: -1.5 / RADIUS,
    y: 6,
    color: 0xf59e0b,
    radius: 7,
    minHeight: -8.5,
    maxHeight: -3.5,
    hint: "Southwest of Meridian plaza, enter the service pavilion and take the lift down. Follow the corridor north, then turn east into the power room.",
  },
];

/**
 * Checks whether coordinates lie within the underground service level.
 * Height-aware: player must be beneath the living surface and above the outer subfloor.
 *
 * @param {number} s Arc coordinate (metres)
 * @param {number} y Longitudinal coordinate (metres)
 * @param {number} height Radial height relative to living surface (metres, negative underground)
 * @returns {boolean}
 */
export function inServiceLevel(s, y, height) {
  const b = SERVICE_BOUNDS;
  return (
    height < -1 &&
    height >= SERVICE_FLOOR - 0.5 &&
    s >= b.minS &&
    s <= b.maxS &&
    y >= b.minY &&
    y <= b.maxY
  );
}
