import { targetsOverlap } from './collision';
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

  it('places bounded integer entities on the correct halves', () => {
    const round = spawnRound(seededRandom(7));
    expect(round.player.position.x).toBeGreaterThanOrEqual(-10);
    expect(round.player.position.x).toBeLessThanOrEqual(-6);
    expect(Number.isInteger(round.player.position.y)).toBe(true);
    expect(round.targets).toHaveLength(3);
    round.targets.forEach((target) => {
      expect(target.center.x).toBeGreaterThanOrEqual(3);
      expect(target.center.x).toBeLessThanOrEqual(10);
      expect(target.center.y).toBeGreaterThanOrEqual(-5);
      expect(target.center.y).toBeLessThanOrEqual(5);
      expect(Number.isInteger(target.center.x)).toBe(true);
      expect(Number.isInteger(target.center.y)).toBe(true);
    });
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
