import { createMatchState, MatchState, resolveShot } from '@math-war/game-engine';
import {
  chooseCpuEquation,
  chooseCpuMove,
  createCpuOpponentMemory,
  recordCpuShotOutcome,
} from './cpu-opponent';

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

  it('keeps deterministic CPU memory for equivalent random streams', () => {
    const state = clearLaneState();
    const firstMemory = createCpuOpponentMemory(state, () => 0.42);
    const secondMemory = createCpuOpponentMemory(state, () => 0.42);

    const first = chooseCpuMove(state, 8, firstMemory, () => 0.35);
    const second = chooseCpuMove(state, 8, secondMemory, () => 0.35);

    expect(first.equation).toBe(second.equation);
    expect(first.memory.populations).toEqual(second.memory.populations);
  });

  it('searches more candidates at high difficulty than low difficulty', () => {
    const state = clearLaneState();
    const lowMemory = createCpuOpponentMemory(state, () => 0.25);
    const highMemory = createCpuOpponentMemory(state, () => 0.25);

    const low = chooseCpuMove(state, 2, lowMemory, () => 0.5);
    const high = chooseCpuMove(state, 10, highMemory, () => 0.5);

    expect(high.diagnostics.evaluatedCandidates).toBeGreaterThan(
      low.diagnostics.evaluatedCandidates,
    );
    expect(high.diagnostics.generations).toBeGreaterThanOrEqual(low.diagnostics.generations);
  });

  it('penalizes a repeated missed CPU equation when a better candidate exists', () => {
    const state = clearLaneState();
    const memory = recordCpuShotOutcome(
      createCpuOpponentMemory(state, () => 0.3),
      {
        shooterCharacterId: 3,
        equation: '0',
        impact: 'bounds',
      },
    );

    const decision = chooseCpuMove(state, 10, memory, () => 0.5);
    const shot = resolveShot(state, 'cpu', 'cpu-command', decision.equation);

    expect(decision.equation).not.toBe('0');
    expect(shot.impact).toBe('opponent');
  });
});
