import { compileExpression } from './expression';
import { advanceShot, createShot } from './trajectory';
import { Player } from '../models/player';
import { Target } from '../models/target';
import { WORLD_BOUNDS } from '../models/world-bounds';

describe('trajectory advancement', () => {
  const player: Player = { position: { x: -2, y: 3 }, radius: 0.3 };

  it('anchors the curve to the player and collects fixed-step trail points', () => {
    let shot = createShot(player, []);
    const expression = compileExpression('x^2+10');
    shot = advanceShot(shot, player, expression, WORLD_BOUNDS, 0.5);
    expect(shot.bullet.position).toEqual({ x: -1.5, y: 3.25 });
    expect(shot.trail).toEqual([player.position, shot.bullet.position]);
  });

  it('ends without adding an out-of-bounds point to the trail', () => {
    const edgePlayer: Player = { ...player, position: { x: 11.9, y: 0 } };
    const shot = advanceShot(
      createShot(edgePlayer, []),
      edgePlayer,
      compileExpression('0'),
      WORLD_BOUNDS,
      0.2,
    );
    expect(shot.active).toBe(false);
    expect(shot.trail).toHaveLength(1);
  });

  it('removes every target hit at a sampled point and keeps flying', () => {
    const targets: Target[] = [
      { id: 1, center: { x: -1, y: 3 }, width: 1, height: 1 },
      { id: 2, center: { x: -1, y: 3 }, width: 0.5, height: 0.5 },
    ];
    const shot = advanceShot(
      createShot(player, targets),
      player,
      compileExpression('0'),
      WORLD_BOUNDS,
      1,
    );
    expect(shot.targets).toHaveLength(0);
    expect(shot.active).toBe(true);
  });

  it('stops with an inline error when evaluation becomes non-finite', () => {
    const originPlayer: Player = { ...player, position: { x: 0, y: 0 } };
    const shot = advanceShot(
      createShot(originPlayer, []),
      originPlayer,
      compileExpression('1/(x-1)'),
      WORLD_BOUNDS,
      1,
    );
    expect(shot.active).toBe(false);
    expect(shot.error).toContain('non-finite');
  });
});
