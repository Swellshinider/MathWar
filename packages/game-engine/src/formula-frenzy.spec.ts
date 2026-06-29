import {
  FORMULA_LEVELS,
  createFormulaFrenzyMatchState,
  createFormulaProblemForLevel,
  expireFormulaFrenzyPlayer,
  resolveFormulaFrenzyAnswer,
  startFormulaFrenzyMatch,
} from './index.js';
import { describe, expect, it } from 'vitest';

describe('formula frenzy multiplayer simulation', () => {
  it('defines the 25-level progression table', () => {
    expect(FORMULA_LEVELS).toHaveLength(25);
    expect(FORMULA_LEVELS.map((level) => level.name)).toEqual([
      'Number Rookie',
      'Sum Sprinter',
      'Carry Cadet',
      'Product Initiate',
      'Timeslinger',
      'Mixed Recruit',
      'Precedence Scout',
      'Division Trainee',
      'Ratio Runner',
      'Combo Striker',
      'Bracket Novice',
      'Order Keeper',
      'Chain Solver',
      'Division Fighter',
      'Integer Tactician',
      'Bracket Adept',
      'Speed Operator',
      'Precision Solver',
      'Factor Hunter',
      'Equation Warrior',
      'Bracket Commander',
      'Chaos Calculator',
      'Mental Assassin',
      'Grand Operator',
      'Math Warlord',
    ]);
  });

  it('creates integer problems from level rules', () => {
    for (const config of FORMULA_LEVELS) {
      const problem = createFormulaProblemForLevel(config.level, () => 0.5);

      expect(problem.level).toBe(config.level);
      expect(problem.levelName).toBe(config.name);
      expect(problem.deadlineMs).toBe(config.timeLimitSeconds * 1000);
      expect(Number.isInteger(problem.answer)).toBe(true);
      if (!config.allowParentheses) expect(problem.prompt).not.toContain('(');
      if (!config.allowNegativeResults) expect(problem.answer).toBeGreaterThanOrEqual(0);
    }
  });

  it('creates deterministic active player problem streams', () => {
    const now = new Date('2026-06-28T12:00:00.000Z');
    const state = startFormulaFrenzyMatch(
      createFormulaFrenzyMatchState(
        'match-1',
        'FORM-FREN',
        'seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
        now,
      ),
      now,
    );

    expect(state.gameId).toBe('formula-frenzy');
    expect(state.status).toBe('active');
    expect(state.formulaPlayers.map((player) => player.currentProblem.prompt)).toEqual([
      '4 + 6',
      '3 - 1',
    ]);
    expect(state.formulaPlayers.map((player) => player.score)).toEqual([0, 0]);
    expect(state.formulaPlayers.map((player) => player.level)).toEqual([1, 1]);
    expect(
      state.formulaPlayers.every((player) => player.currentProblem.startedAt === now.toISOString()),
    ).toBe(true);
  });

  it('waits for the host to start after both players join', () => {
    const state = createFormulaFrenzyMatchState(
      'match-1',
      'FORM-FREN',
      'seed',
      { userId: 'left', displayName: 'Left' },
      { userId: 'right', displayName: 'Right' },
    );

    expect(state.status).toBe('waiting');
    expect(state.formulaPlayers).toEqual([]);
  });

  it('advances only the answering player after a correct answer', () => {
    const now = new Date('2026-06-28T12:00:00.000Z');
    const state = startFormulaFrenzyMatch(
      createFormulaFrenzyMatchState(
        'match-1',
        'FORM-FREN',
        'seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
        now,
      ),
      now,
    );

    const result = resolveFormulaFrenzyAnswer(
      state,
      'left',
      state.formulaPlayers[0].currentProblem.answer!,
      new Date('2026-06-28T12:00:02.000Z'),
    );

    expect(result.ok).toBe(true);
    expect(result.state.formulaPlayers.find((player) => player.userId === 'left')).toMatchObject({
      score: 205,
      xp: 27,
      streak: 1,
      totalCorrect: 1,
      totalSolveTimeMs: 2000,
    });
    expect(
      result.state.formulaPlayers.find((player) => player.userId === 'left')?.currentProblem.prompt,
    ).not.toBe(state.formulaPlayers[0].currentProblem.prompt);
    expect(result.state.formulaPlayers.find((player) => player.userId === 'right')?.score).toBe(0);
  });

  it('rejects wrong answers and removes one heart', () => {
    const state = startFormulaFrenzyMatch(
      createFormulaFrenzyMatchState(
        'match-1',
        'FORM-FREN',
        'seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
      ),
    );

    const result = resolveFormulaFrenzyAnswer(state, 'left', 999);

    expect(result.ok).toBe(false);
    expect(result.state.formulaPlayers.find((player) => player.userId === 'left')).toMatchObject({
      hearts: 2,
      streak: 0,
    });
    expect(result.state.status).toBe('active');
  });

  it('ends the match when one player times out on the last heart', () => {
    const state = {
      ...startFormulaFrenzyMatch(
        createFormulaFrenzyMatchState(
          'match-1',
          'FORM-FREN',
          'seed',
          { userId: 'left', displayName: 'Left' },
          { userId: 'right', displayName: 'Right' },
        ),
      ),
    };
    const lowHearts = {
      ...state,
      formulaPlayers: state.formulaPlayers.map((player) =>
        player.userId === 'left' ? { ...player, hearts: 1 } : player,
      ),
    };
    const expired = expireFormulaFrenzyPlayer(lowHearts, 'left');

    expect(expired.status).toBe('ended');
    expect(expired.winnerUserId).toBe('right');
    expect(expired.endReason).toBe('timeout');
  });

  it('moves to the next problem after a timeout when hearts remain', () => {
    const state = startFormulaFrenzyMatch(
      createFormulaFrenzyMatchState(
        'match-1',
        'FORM-FREN',
        'seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
      ),
    );

    const expired = expireFormulaFrenzyPlayer(state, 'left');

    expect(expired.status).toBe('active');
    expect(expired.formulaPlayers.find((player) => player.userId === 'left')).toMatchObject({
      hearts: 2,
      streak: 0,
    });
  });
});
