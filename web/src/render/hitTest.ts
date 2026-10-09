export interface CarScreenPosition {
  code: string;
  x: number;
  y: number;
  index: number;
}

export function findNearestCar(
  screenX: number,
  screenY: number,
  carPositions: CarScreenPosition[],
  maxDistance = 16,
): { code: string; index: number } | null {
  let nearestCode: string | null = null;
  let nearestIndex = -1;
  let minDistanceSq = maxDistance * maxDistance;

  for (let i = 0; i < carPositions.length; i++) {
    const car = carPositions[i];
    const dx = screenX - car.x;
    const dy = screenY - car.y;
    const distSq = dx * dx + dy * dy;

    if (distSq <= minDistanceSq) {
      minDistanceSq = distSq;
      nearestCode = car.code;
      nearestIndex = car.index;
    }
  }

  if (nearestCode === null) return null;
  return { code: nearestCode, index: nearestIndex };
}
