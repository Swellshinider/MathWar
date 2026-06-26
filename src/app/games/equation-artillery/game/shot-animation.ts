import { Point } from '../models/point';
import { WORLD_BOUNDS } from '../models/world-bounds';

const REFERENCE_SHOT_DURATION_MS = 3000;
const REFERENCE_SHOT_DISTANCE = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;

export function shotAnimationDuration(trail: readonly Point[]): number {
  if (trail.length < 2) return 0;
  const distance = trail.slice(1).reduce((sum, point, index) => {
    const previous = trail[index];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
  return Math.round((distance / REFERENCE_SHOT_DISTANCE) * REFERENCE_SHOT_DURATION_MS);
}
