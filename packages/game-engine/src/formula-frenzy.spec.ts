import {
  FORMULA_LEVELS,
  createFormulaFrenzyMatchState,
  createFormulaProblemForLevel,
  expireFormulaFrenzyPlayer,
  formulaProgress,
  resolveFormulaFrenzyAnswer,
  scoreFormulaAnswer,
  startFormulaFrenzyMatch,
} from './index.js';
import { describe, expect, it } from 'vitest';

describe('formula frenzy multiplayer simulation', () => {
  it('defines the 25-level progression table', () => {
    expect(FORMULA_LEVELS).toHaveLength(25);
    expect(FORMULA_LEVELS.map((level) => level.name)).toEqual([
      'Number Scout',
      'Sum Sprinter',
      'Difference Dasher',
      'Factor Runner',
      'Quotient Climber',
      'Bracket Bender',
      'Prime Tracker',
      'Timesmith',
      'Fraction Tamer',
      'Pattern Pilot',
      'Exponent Spark',
      'Radical Rookie',
      'Power Adept',
      'Root Ranger',
      'Equation Strider',
      'Order Keeper',
      'Integer Sage',
      'Algebra Ace',
      'Variable Virtuoso',
      'Formula Expert',
      'Proof Runner',
      'Theorem Tactician',
      'Axiom Master',
      'Frenzy Champion',
      'MathWar Legend',
    ]);
  });

  it('creates integer problems from level rules', () => {
    for (const config of FORMULA_LEVELS) {
      const problem = createFormulaProblemForLevel(config.level, () => 0.5);

      expect(problem.level).toBe(config.level);
      expect(problem.levelName).toBe(config.name);
      expect(Number.isInteger(problem.answer)).toBe(true);
    }
  });

  it('tracks xp progress and score from speed, level, and streak', () => {
    expect(formulaProgress(0)).toEqual({ level: 1, xp: 0, xpRequired: 2, percent: 0 });
    expect(formulaProgress(2)).toEqual({ level: 2, xp: 0, xpRequired: 3, percent: 0 });
    expect(scoreFormulaAnswer(1, 5000, 10000, 1)).toBe(165);
    expect(scoreFormulaAnswer(5, 1000, 10000, 10)).toBe(532);
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
      '16 + 20',
      '15 - 10',
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
      score: 198,
      experience: 1,
      xp: 1,
      streak: 1,
      totalCorrect: 1,
      totalSolveTimeMs: 2000,
    });
    expect(
      result.state.formulaPlayers.find((player) => player.userId === 'left')?.currentProblem.prompt,
    ).not.toBe(state.formulaPlayers[0].currentProblem.prompt);
    expect(result.state.formulaPlayers.find((player) => player.userId === 'right')?.score).toBe(0);
  });

  it('recovers a heart on every five-answer streak', () => {
    let state = {
      ...startFormulaFrenzyMatch(
        createFormulaFrenzyMatchState(
          'match-1',
          'FORM-FREN',
          'seed',
          { userId: 'left', displayName: 'Left' },
          { userId: 'right', displayName: 'Right' },
        ),
      ),
      formulaPlayers: startFormulaFrenzyMatch(
        createFormulaFrenzyMatchState(
          'match-1',
          'FORM-FREN',
          'seed',
          { userId: 'left', displayName: 'Left' },
          { userId: 'right', displayName: 'Right' },
        ),
      ).formulaPlayers.map((player) =>
        player.userId === 'left' ? { ...player, hearts: 2 } : player,
      ),
    };

    for (let index = 0; index < 5; index += 1) {
      state = resolveFormulaFrenzyAnswer(
        state,
        'left',
        state.formulaPlayers[0].currentProblem.answer!,
      ).state;
    }

    expect(state.formulaPlayers.find((player) => player.userId === 'left')).toMatchObject({
      hearts: 3,
      streak: 5,
      experience: 5,
    });
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

  it('ends the match when one player times out', () => {
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

    expect(expired.status).toBe('ended');
    expect(expired.winnerUserId).toBe('right');
    expect(expired.endReason).toBe('timeout');
  });

  it('ends the match when a wrong answer spends the last heart', () => {
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
    const result = resolveFormulaFrenzyAnswer(lowHearts, 'left', 999);

    expect(result.ok).toBe(false);
    expect(result.state.status).toBe('ended');
    expect(result.state.endReason).toBe('out-of-hearts');
    expect(result.state.winnerUserId).toBe('right');
  });

  it('generates integer power and root answers', () => {
    const power = createFormulaProblemForLevel(11, () => 0);
    const root = createFormulaProblemForLevel(12, () => 0);

    expect(power.prompt).toContain('^');
    expect(root.prompt).toContain('sqrt');
    expect(Number.isInteger(power.answer)).toBe(true);
    expect(Number.isInteger(root.answer)).toBe(true);
  });
});
