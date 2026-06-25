import { createMatchState, MatchState, resolveShot } from '@math-war/game-engine';
import { chooseCpuEquation } from './cpu-opponent';

function clearLaneState(overrides: Partial<MatchState> = {}): MatchState {
  const created = createMatchState(
    'local-cpu-match',
    'LOCALCPU',
    'cpu-test-seed',
    { userId: 'human', displayName: 'You' },
    { userId: 'cpu', displayName: 'CPU' },
    new Date('2026-06-25T12:00:00.000Z'),
  );

  return {
    ...created,
    walls: [],
    turnUserId: 'cpu',
    turnCharacterId: 3,
    characters: created.characters.map((character) => {
      if (character.id === 3) return { ...character, position: { x: 9, y: 0 } };
      if (character.id === 0) return { ...character, position: { x: -9, y: 0 } };
      return { ...character, position: { x: character.position.x, y: 8 } };
    }),
    ...overrides,
  };
}

describe('chooseCpuEquation', () => {
  it('chooses a valid random equation at difficulty 0', () => {
    const state = clearLaneState();

    const equation = chooseCpuEquation(state, 0, () => 0);
    const shot = resolveShot(state, 'cpu', 'cpu-command', equation);

    expect(equation).toBe('0');
    expect(shot.error).toBeNull();
  });

  it('chooses a hitting equation at difficulty 10 when one is available', () => {
    const state = clearLaneState();

    const equation = chooseCpuEquation(state, 10, () => 0.99);
    const shot = resolveShot(state, 'cpu', 'cpu-command', equation);

    expect(shot.impact).toBe('opponent');
  });

  it('uses injected randomness deterministically for intermediate difficulties', () => {
    const state = clearLaneState();
    const randomValues = [0.62, 0.14, 0.91, 0.3];
    const random = vi.fn(() => randomValues.shift() ?? 0.5);
    const repeatedValues = [0.62, 0.14, 0.91, 0.3];
    const repeatedRandom = vi.fn(() => repeatedValues.shift() ?? 0.5);

    const first = chooseCpuEquation(state, 5, random);
    const second = chooseCpuEquation(state, 5, repeatedRandom);

    expect(first).toBe(second);
  });
});
