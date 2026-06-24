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
    const rightState = { ...state, turnUserId: 'right', turnCharacterId: 3 };
    const rightShot = resolveShot(rightState, 'right', 'right-command', '0');
    expect(leftShot.trail[1].x).toBeGreaterThan(leftShot.trail[0].x);
    expect(rightShot.trail[1].x).toBeLessThan(rightShot.trail[0].x);
  });

  it('creates six living characters and rotates through the squad turn order', () => {
    const state = createMatchState(
      '00000000-0000-4000-8000-000000000001',
      'ABC123',
      'squad',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );

    expect(state.characters.map((character) => character.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(state.characters.every((character) => character.alive)).toBe(true);
    expect(
      new Set(state.characters.slice(0, 3).map((character) => character.position.x)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(state.characters.slice(3).map((character) => character.position.x)).size,
    ).toBeGreaterThan(1);
    expect(state.turnCharacterId).toBe(0);

    const first = resolveShot({ ...state, walls: [] }, 'left', 'left-command', '50');
    const second = resolveShot(first.state, 'right', 'right-command', '50');

    expect(first.state.turnCharacterId).toBe(3);
    expect(first.state.turnUserId).toBe('right');
    expect(second.state.turnCharacterId).toBe(1);
    expect(second.state.turnUserId).toBe('left');
  });

  it('generates two to five multiplayer walls with varied shapes', () => {
    const counts = new Set<number>();
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 100; seed += 1) {
      const state = createMatchState(
        '00000000-0000-4000-8000-000000000001',
        'ABC123',
        `walls-${seed}`,
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
      );
      counts.add(state.walls.length);
      state.walls.forEach((wall) => {
        shapes.add(wall.shape);
        expect(wall.pieces.length).toBeGreaterThan(1);
        wall.pieces.forEach((piece) => {
          expect(piece.center.x - piece.size / 2).toBeGreaterThanOrEqual(-12);
          expect(piece.center.x + piece.size / 2).toBeLessThanOrEqual(12);
          expect(piece.center.y - piece.size / 2).toBeGreaterThanOrEqual(-7.5);
          expect(piece.center.y + piece.size / 2).toBeLessThanOrEqual(7.5);
        });
      });
    }

    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...counts)).toBeLessThanOrEqual(5);
    expect(counts.size).toBeGreaterThan(1);
    expect(shapes).toEqual(new Set(['vertical', 'circle', 'square', 'triangle']));
  });

  it('removes one character on hit and skips dead characters in turn order', () => {
    const created = createMatchState(
      '00000000-0000-4000-8000-000000000001',
      'ABC123',
      'hit',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );
    const state = {
      ...created,
      walls: [],
      turnCharacterId: 0,
      turnUserId: 'left',
      characters: created.characters.map((character) => {
        if (character.id === 0) return { ...character, position: { x: -9, y: 0 } };
        if (character.id === 3) return { ...character, position: { x: 9, y: 0 } };
        return { ...character, position: { x: character.position.x, y: 6 } };
      }),
    };
    const shot = resolveShot(state, 'left', 'command', '0');
    expect(shot.impact).toBe('opponent');
    expect(shot.state.status).toBe('active');
    expect(shot.state.winnerUserId).toBeNull();
    expect(shot.state.characters.find((character) => character.id === 3)?.alive).toBe(false);
    expect(shot.state.turnCharacterId).toBe(1);
    expect(shot.state.turnUserId).toBe('left');
  });

  it('ends the match after the last opposing character is hit', () => {
    const created = createMatchState(
      '00000000-0000-4000-8000-000000000001',
      'ABC123',
      'final-hit',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );
    const state = {
      ...created,
      walls: [],
      turnCharacterId: 0,
      turnUserId: 'left',
      characters: created.characters.map((character) => {
        if (character.id === 0) return { ...character, position: { x: -9, y: 0 } };
        if (character.id === 3) return { ...character, position: { x: 9, y: 0 }, alive: true };
        if (character.ownerUserId === 'right') return { ...character, alive: false };
        return character;
      }),
    };
    const shot = resolveShot(state, 'left', 'command', '0');
    expect(shot.impact).toBe('opponent');
    expect(shot.state.status).toBe('ended');
    expect(shot.state.winnerUserId).toBe('left');
    expect(shot.state.turnCharacterId).toBeNull();
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
