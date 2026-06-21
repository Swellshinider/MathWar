import { Point } from '../models/point';
import { WorldBounds } from '../models/world-bounds';

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export function worldToCanvas(point: Point, bounds: WorldBounds, canvas: CanvasSize): Point {
  return {
    x: ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * canvas.width,
    y: ((bounds.maxY - point.y) / (bounds.maxY - bounds.minY)) * canvas.height,
  };
}

export function canvasToWorld(point: Point, bounds: WorldBounds, canvas: CanvasSize): Point {
  return {
    x: bounds.minX + (point.x / canvas.width) * (bounds.maxX - bounds.minX),
    y: bounds.maxY - (point.y / canvas.height) * (bounds.maxY - bounds.minY),
  };
}
