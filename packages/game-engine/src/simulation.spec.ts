import { createMatchState, resolveShot } from './index.js';
import { describe, expect, it } from 'vitest';

describe('shared multiplayer simulation', () => {
  it('creates identical state and shot trails for the same seed and equation', () => {
    const now = new Date('2026-06-22T12:00:00.000Z');
    const create = () =>
      createMatchState(
        '00000000-0000-4000-8000-000000000001',
        'ABC123',
        'fixed-seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
        now,
      );
    const first = resolveShot(create(), 'left', 'command', '0.02x^2', now);
    const second = resolveShot(create(), 'left', 'command', '0.02x^2', now);
    expect(first).toEqual(second);
  });

  it('moves shots toward the opponent from either side', () => {
    const state = createMatchState(
      '00000000-0000-4000-8000-000000000001',
      'ABC123',
      'directions',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );
    const leftShot = resolveShot(state, 'left', 'left-command', '0');
    const rightState = { ...state, turnUserId: 'right' };
    const rightShot = resolveShot(rightState, 'right', 'right-command', '0');
    expect(leftShot.trail[1].x).toBeGreaterThan(state.players[0].position.x);
    expect(rightShot.trail[1].x).toBeLessThan(state.players[1].position.x);
  });

  it('detects an opponent hit and ends the match', () => {
    const created = createMatchState(
      '00000000-0000-4000-8000-000000000001',
      'ABC123',
      'hit',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );
    const left = created.players[0];
    const right = created.players[1];
    const state = { ...created, walls: [] };
    const slope = (right.position.y - left.position.y) / 18;
    const shot = resolveShot(state, 'left', 'command', `${slope}x`);
    expect(shot.impact).toBe('opponent');
    expect(shot.state.status).toBe('ended');
    expect(shot.state.winnerUserId).toBe('left');
  });

  it('keeps both players valid equations in firing order', () => {
    const created = createMatchState(
      '00000000-0000-4000-8000-000000000001',
      'ABC123',
      'history',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );
    const withoutWalls = { ...created, walls: [] };
    const first = resolveShot(withoutWalls, 'left', 'left-command', 'x+1');
    const second = resolveShot(first.state, 'right', 'right-command', 'sin(x)');

    expect(second.state.equationHistory).toEqual([
      { commandId: 'left-command', shooterUserId: 'left', equation: 'x+1' },
      { commandId: 'right-command', shooterUserId: 'right', equation: 'sin(x)' },
    ]);
  });

  it('does not record invalid equations and accepts legacy states without history', () => {
    const created = createMatchState(
      '00000000-0000-4000-8000-000000000001',
      'ABC123',
      'legacy-history',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );
    const legacy = { ...created, equationHistory: undefined } as unknown as typeof created;
    const invalid = resolveShot(legacy, 'left', 'invalid-command', 'x+(');
    const valid = resolveShot(legacy, 'left', 'valid-command', '0');

    expect(invalid.state.equationHistory).toBeUndefined();
    expect(valid.state.equationHistory).toEqual([
      { commandId: 'valid-command', shooterUserId: 'left', equation: '0' },
    ]);
  });
});
