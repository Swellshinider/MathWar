import { compileExpression } from './expression';
import { advanceShot, createShot } from './trajectory';
import { Player } from '../models/player';
import { Target } from '../models/target';
import { WORLD_BOUNDS } from '../models/world-bounds';

describe('trajectory advancement', () => {
  const player: Player = { position: { x: -2, y: 3 }, radius: 0.3 };

  it('anchors the curve to the player and collects fixed-step trail points', () => {
    let shot = createShot(player, [], []);
    const expression = compileExpression('x^2+10');
    shot = advanceShot(shot, player, expression, WORLD_BOUNDS, 0.5);
    expect(shot.bullet.position).toEqual({ x: -1.5, y: 3.25 });
    expect(shot.trail).toEqual([player.position, shot.bullet.position]);
  });

  it('clips the trail to the board edge when a shot exits horizontally', () => {
    const edgePlayer: Player = { ...player, position: { x: 11.9, y: 0 } };
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

  it('clips steep tangent shots to the board edge instead of ending mid-board', () => {
    const originPlayer: Player = { ...player, position: { x: 0, y: 0 } };
    const shot = advanceShot(
      createShot(originPlayer, [], []),
      originPlayer,
      compileExpression('tan(x + x)'),
      WORLD_BOUNDS,
      0.72,
    );
    expect(shot.active).toBe(false);
    expect(shot.bullet.position.x).toBeCloseTo(0.711);
    expect(shot.bullet.position.y).toBe(WORLD_BOUNDS.maxY);
    expect(shot.trail).toEqual([originPlayer.position, shot.bullet.position]);
    expect(shot.impact).toBe('bounds');
  });

  it('clips launch-singular logarithmic shots to the board edge', () => {
    const originPlayer: Player = { ...player, position: { x: 0, y: 0 } };
    const shot = advanceShot(
      createShot(originPlayer, [], []),
      originPlayer,
      compileExpression('log(x)'),
      WORLD_BOUNDS,
      0.0001,
    );
    expect(shot.active).toBe(false);
    expect(shot.bullet.position.x).toBeCloseTo(0.000081);
    expect(shot.bullet.position.y).toBe(WORLD_BOUNDS.minY);
    expect(shot.trail).toEqual([originPlayer.position, shot.bullet.position]);
    expect(shot.impact).toBe('bounds');
  });

  it('keeps launch-singular logarithmic shots valid at the launch point', () => {
    const originPlayer: Player = { ...player, position: { x: 0, y: 0 } };
    const shot = advanceShot(
      createShot(originPlayer, [], []),
      originPlayer,
      compileExpression('log(x)'),
      WORLD_BOUNDS,
      0,
    );
    expect(shot.active).toBe(true);
    expect(shot.error).toBeNull();
    expect(shot.bullet.position).toEqual(originPlayer.position);
  });

  it('removes every target hit at a sampled point and keeps flying', () => {
    const targets: Target[] = [
      { id: 1, center: { x: -1, y: 3 }, width: 1, height: 1 },
      { id: 2, center: { x: -1, y: 3 }, width: 0.5, height: 0.5 },
    ];
    const shot = advanceShot(
      createShot(player, targets, []),
      player,
      compileExpression('0'),
      WORLD_BOUNDS,
      1,
    );
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
    const shot = advanceShot(
      createShot(player, [], walls),
      player,
      compileExpression('0'),
      WORLD_BOUNDS,
      1,
    );
    expect(shot.active).toBe(false);
    expect(shot.impact).toBe('wall');
    expect(shot.trail.at(-1)).toEqual({ x: -1, y: 3 });
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
