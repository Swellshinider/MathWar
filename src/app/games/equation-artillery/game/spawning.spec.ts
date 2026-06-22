import { targetsOverlap, wallPieceOverlapsTarget, wallPiecesOverlap } from './collision';
import { spawnRound } from './spawning';

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

describe('spawnRound', () => {
  it('is deterministic with an injected random source', () => {
    expect(spawnRound(seededRandom(42))).toEqual(spawnRound(seededRandom(42)));
  });

  it('generates valid rounds across a range of seeded random sources', () => {
    const shapes = new Set<string>();
    const shapeSequences = new Set<string>();
    for (let seed = 1; seed <= 500; seed += 1) {
      const round = spawnRound(seededRandom(seed));
      expect(round.walls).toHaveLength(4);
      round.walls.forEach((wall) => shapes.add(wall.shape));
      shapeSequences.add(round.walls.map((wall) => wall.shape).join(','));
    }
    expect(shapes).toEqual(new Set(['vertical', 'circle', 'square', 'triangle']));
    expect(shapeSequences.size).toBeGreaterThan(1);
  });

  it('places bounded integer entities on the correct halves', () => {
    const round = spawnRound(seededRandom(7));
    expect(round.player.position.x).toBeGreaterThanOrEqual(-10);
    expect(round.player.position.x).toBeLessThanOrEqual(-6);
    expect(Number.isInteger(round.player.position.y)).toBe(true);
    expect(round.targets).toHaveLength(3);
    expect(round.walls).toHaveLength(4);
    expect(new Set(round.walls.map((wall) => wall.shape)).size).toBe(4);
    round.targets.forEach((target) => {
      expect(target.center.x).toBeGreaterThanOrEqual(3);
      expect(target.center.x).toBeLessThanOrEqual(10);
      expect(target.center.y).toBeGreaterThanOrEqual(-5);
      expect(target.center.y).toBeLessThanOrEqual(5);
      expect(Number.isInteger(target.center.x)).toBe(true);
      expect(Number.isInteger(target.center.y)).toBe(true);
    });
  });

  it('places filled wall pieces within bounds without overlaps', () => {
    const round = spawnRound(seededRandom(21));
    round.walls.forEach((wall) => {
      expect(wall.pieces.length).toBeGreaterThan(1);
      wall.pieces.forEach((piece) => {
        expect(piece.center.x - piece.size / 2).toBeGreaterThanOrEqual(-12);
        expect(piece.center.x + piece.size / 2).toBeLessThanOrEqual(12);
        expect(piece.center.y - piece.size / 2).toBeGreaterThanOrEqual(-7.5);
        expect(piece.center.y + piece.size / 2).toBeLessThanOrEqual(7.5);
        expect(round.targets.some((target) => wallPieceOverlapsTarget(piece, target, 0.2))).toBe(
          false,
        );
      });
    });
    for (let firstWall = 0; firstWall < round.walls.length; firstWall += 1) {
      for (let secondWall = firstWall + 1; secondWall < round.walls.length; secondWall += 1) {
        expect(
          round.walls[firstWall].pieces.some((first) =>
            round.walls[secondWall].pieces.some((second) => wallPiecesOverlap(first, second, 0.25)),
          ),
        ).toBe(false);
      }
    }
  });

  it('prevents target overlap', () => {
    const targets = spawnRound(seededRandom(99)).targets;
    for (let first = 0; first < targets.length; first += 1) {
      for (let second = first + 1; second < targets.length; second += 1) {
        expect(targetsOverlap(targets[first], targets[second], 0.2)).toBe(false);
      }
    }
  });
});
