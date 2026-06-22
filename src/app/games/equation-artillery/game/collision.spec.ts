import { Wall } from '../models/wall';
import { damageWalls, pointHitsWallPiece } from './collision';

describe('wall collisions', () => {
  const piece = { id: 1, center: { x: 2, y: 3 }, size: 0.5 };

  it('detects points and projectile radii touching a wall piece', () => {
    expect(pointHitsWallPiece({ x: 2, y: 3 }, piece)).toBe(true);
    expect(pointHitsWallPiece({ x: 2.4, y: 3 }, piece, 0.15)).toBe(true);
    expect(pointHitsWallPiece({ x: 2.5, y: 3 }, piece, 0.15)).toBe(false);
  });

  it('removes pieces by center distance and drops empty walls', () => {
    const walls: readonly Wall[] = [
      {
        id: 1,
        shape: 'circle',
        pieces: [piece, { id: 2, center: { x: 3.5, y: 3 }, size: 0.5 }],
      },
      {
        id: 2,
        shape: 'triangle',
        pieces: [{ id: 3, center: { x: 8, y: 3 }, size: 0.5 }],
      },
    ];
    const damaged = damageWalls(walls, { x: 2, y: 3 }, 1.5);
    expect(damaged).toHaveLength(1);
    expect(damaged[0].pieces.map((remaining) => remaining.id)).toEqual([3]);
  });
});
