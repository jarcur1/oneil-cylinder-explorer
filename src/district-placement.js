export function createYPlacement(authoredAnchorY, worldAnchorY) {
  const offsetY = worldAnchorY - authoredAnchorY;
  return Object.freeze({
    offsetY,
    toWorldY: (localY) => localY + offsetY,
    toLocalY: (worldY) => worldY - offsetY,
  });
}
