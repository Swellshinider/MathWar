import { compileExpression } from './expression';
import { advanceShot, createShot } from './trajectory';
import { Player } from '../models/player';
import { Target } from '../models/target';
import { WORLD_BOUNDS } from '../models/world-bounds';

describe('trajectory advancement', () => {
  const player: Player = { position: { x: -2, y: 3 }, radius: 0 };

  it('anchors the board-coordinate curve to the player and collects trail points', () => {
    let shot = createShot(player, [], []);
    const expression = compileExpression('x^2');
    shot = advanceShot(shot, player, expression, WORLD_BOUNDS, 0.08);
    expect(shot.bullet.position.x).toBeCloseTo(-1.92);
    expect(shot.bullet.position.y).toBeCloseTo(2.6864);
    expect(shot.trail).toEqual([player.position, shot.bullet.position]);
  });

  it('clips the trail to the board edge when a shot exits horizontally', () => {
    const edgePlayer: Player = { position: { x: 11.9, y: 0 }, radius: 0 };
    const shot = advanceShot(
      createShot(edgePlayer, [], []),
      edgePlayer,
      compileExpression('0'),
      WORLD_BOUNDS,
      0.2,
    );
    expect(shot.active).toBe(false);
    expect(shot.bullet.position).toEqual({ x: WORLD_BOUNDS.maxX, y: 0 });
    expect(shot.trail).toEqual([edgePlayer.position, shot.bullet.position]);
    expect(shot.impact).toBe('bounds');
  });

  it('reduces steep tangent shots instead of ending mid-board', () => {
    const originPlayer: Player = { position: { x: 0, y: 0 }, radius: 0 };
    const shot = advanceShot(
      createShot(originPlayer, [], []),
      originPlayer,
      compileExpression('tan(x + x)'),
      WORLD_BOUNDS,
      0.72,
    );
    expect(shot.active).toBe(true);
    expect(shot.bullet.position.x).toBeGreaterThan(0);
    expect(shot.bullet.position.x).toBeLessThan(0.72);
    expect(shot.trail).toEqual([originPlayer.position, shot.bullet.position]);
    expect(shot.impact).toBeNull();
  });

  it('rejects equations that are non-finite at the board-coordinate launch point', () => {
    const negativePlayer: Player = { position: { x: -1, y: 0 }, radius: 0 };
    const shot = advanceShot(
      createShot(negativePlayer, [], []),
      negativePlayer,
      compileExpression('log(x)'),
      WORLD_BOUNDS,
      0.1,
    );
    expect(shot.active).toBe(false);
    expect(shot.error).toContain('non-finite');
    expect(shot.impact).toBe('invalid');
  });

  it('removes every target hit at a sampled point and keeps flying', () => {
    const targets: Target[] = [
      { id: 1, center: { x: -1, y: 3 }, width: 1, height: 1 },
      { id: 2, center: { x: -1, y: 3 }, width: 0.5, height: 0.5 },
    ];
    let shot = createShot(player, targets, []);
    const expression = compileExpression('0');
    for (let index = 0; index < 10 && shot.targets.length > 0; index += 1) {
      shot = advanceShot(shot, player, expression, WORLD_BOUNDS, 1);
    }
    expect(shot.targets).toHaveLength(0);
    expect(shot.active).toBe(true);
    expect(shot.impact).toBe('target');
  });

  it('stops with an inline error when evaluation becomes non-finite', () => {
    const originPlayer: Player = { ...player, position: { x: 0, y: 0 } };
    const shot = advanceShot(
      createShot(originPlayer, [], []),
      originPlayer,
      compileExpression('1/(x-1)'),
      WORLD_BOUNDS,
      1,
    );
    expect(shot.active).toBe(false);
    expect(shot.error).toContain('non-finite');
    expect(shot.impact).toBe('invalid');
  });

  it('stops at a wall and removes only pieces within the blast radius', () => {
    const walls = [
      {
        id: 1,
        shape: 'vertical' as const,
        pieces: [
          { id: 1, center: { x: -1, y: 3 }, size: 0.5 },
          { id: 2, center: { x: -1, y: 4 }, size: 0.5 },
          { id: 3, center: { x: -1, y: 5 }, size: 0.5 },
        ],
      },
    ];
    let shot = createShot(player, [], walls);
    const expression = compileExpression('0');
    for (let index = 0; index < 10 && shot.active; index += 1) {
      shot = advanceShot(shot, player, expression, WORLD_BOUNDS, 1);
    }
    expect(shot.active).toBe(false);
    expect(shot.impact).toBe('wall');
    expect(shot.trail.at(-1)?.x).toBeCloseTo(-1.25);
    expect(shot.trail.at(-1)?.y).toBe(3);
    expect(shot.walls[0].pieces.map((piece) => piece.id)).toEqual([2, 3]);
  });

  it('does not damage targets when a wall blocks the same shot step', () => {
    const target: Target = { id: 1, center: { x: -1, y: 3 }, width: 1, height: 1 };
    const walls = [
      {
        id: 1,
        shape: 'square' as const,
        pieces: [{ id: 1, center: { x: -1, y: 3 }, size: 0.5 }],
      },
    ];
    const shot = advanceShot(
      createShot(player, [target], walls),
      player,
      compileExpression('0'),
      WORLD_BOUNDS,
      1,
    );
    expect(shot.targets).toEqual([target]);
  });
});
