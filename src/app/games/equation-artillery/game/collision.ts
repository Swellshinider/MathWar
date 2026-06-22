import { Point } from '../models/point';
import { Target } from '../models/target';

export function pointHitsTarget(point: Point, target: Target): boolean {
  const halfWidth = target.width / 2;
  const halfHeight = target.height / 2;
  return (
    point.x >= target.center.x - halfWidth &&
    point.x <= target.center.x + halfWidth &&
    point.y >= target.center.y - halfHeight &&
    point.y <= target.center.y + halfHeight
  );
}

export function targetsOverlap(first: Target, second: Target, padding = 0): boolean {
  return (
    Math.abs(first.center.x - second.center.x) < (first.width + second.width) / 2 + padding &&
    Math.abs(first.center.y - second.center.y) < (first.height + second.height) / 2 + padding
  );
}
