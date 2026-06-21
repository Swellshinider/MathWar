import { canvasToWorld, worldToCanvas } from './coordinates';
import { WORLD_BOUNDS } from '../models/world-bounds';

describe('coordinate conversion', () => {
  const canvas = { width: 800, height: 500 };

  it('maps the world origin to the canvas center', () => {
    expect(worldToCanvas({ x: 0, y: 0 }, WORLD_BOUNDS, canvas)).toEqual({ x: 400, y: 250 });
  });

  it('round-trips arbitrary points', () => {
    const point = { x: -7.25, y: 3.75 };
    const result = canvasToWorld(worldToCanvas(point, WORLD_BOUNDS, canvas), WORLD_BOUNDS, canvas);
    expect(result.x).toBeCloseTo(point.x);
    expect(result.y).toBeCloseTo(point.y);
  });
});
