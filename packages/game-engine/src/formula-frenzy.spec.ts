import {
  FORMULA_LEVELS,
  FORMULA_INITIAL_HINTS,
  createFormulaFrenzyMatchState,
  createFormulaProblem,
  createFormulaPracticeProblem,
  createFormulaProblemForLevel,
  expireFormulaFrenzyPlayer,
  formulaProgress,
  requestFormulaFrenzyHint,
  resolveFormulaFrenzyAnswer,
  scoreFormulaAnswer,
  soloFormulaProblemRandom,
  startFormulaFrenzyMatch,
} from './index.js';
import { describe, expect, it } from 'vitest';

function seededRandom(seed = 1): () => number {
  let value = seed;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

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

  it('generates correct factorial problems', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const problem = createFormulaPracticeProblem(['factorial'], seededRandom(seed));
      const match = /^(?<n>\d+)!$/.exec(problem.prompt);
      expect(match, problem.prompt).not.toBeNull();
      const n = Number(match!.groups!.n);
      let expected = 1;
      for (let value = 2; value <= n; value += 1) expected *= value;

      expect(problem.answer).toBe(expected);
      expect(problem.answer).toBeGreaterThan(0);
    }
  });

  it('generates correct calculator-style percentage problems', () => {
    const innerPattern = /^(?<a>\d+) \* (?<b>\d+) (?<innerSign>[+-]) (?<c>\d+)$/;
    const promptPattern = /^\((?<inner>.+)\) (?<sign>[+-]) (?<percent>\d+)%$/;
    for (let seed = 1; seed <= 50; seed += 1) {
      const problem = createFormulaPracticeProblem(['percentage'], seededRandom(seed));
      const promptMatch = promptPattern.exec(problem.prompt);
      expect(promptMatch, problem.prompt).not.toBeNull();
      const inner = innerPattern.exec(promptMatch!.groups!.inner);
      expect(inner, problem.prompt).not.toBeNull();
      const a = Number(inner!.groups!.a);
      const b = Number(inner!.groups!.b);
      const c = Number(inner!.groups!.c);
      const value = inner!.groups!.innerSign === '+' ? a * b + c : a * b - c;
      const percent = Number(promptMatch!.groups!.percent);
      const delta = (value * percent) / 100;
      const expected = promptMatch!.groups!.sign === '+' ? value + delta : value - delta;

      expect(problem.answer).toBe(expected);
      expect(Number.isInteger(problem.answer)).toBe(true);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.prompt).toMatch(/^\(.+\) [+-] \d+%$/);
    }
  });

  it('keeps new-operator answers integer at advanced levels', () => {
    // Levels 17+ allow negative compound results, so only integer-ness is guaranteed.
    for (const levelNumber of [19, 20, 21, 22, 23, 24, 25]) {
      const random = seededRandom(levelNumber);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const problem = createFormulaProblemForLevel(levelNumber, random);

        expect(Number.isInteger(problem.answer)).toBe(true);
      }
    }
  });

  it('tracks xp progress and score from speed, level, and streak', () => {
    expect(formulaProgress(0)).toEqual({ level: 1, xp: 0, xpRequired: 2, percent: 0 });
    expect(formulaProgress(2)).toEqual({ level: 2, xp: 0, xpRequired: 3, percent: 0 });
    expect(scoreFormulaAnswer(1, 5000, 10000, 1)).toBe(165);
    expect(scoreFormulaAnswer(5, 1000, 10000, 10)).toBe(532);
    expect(scoreFormulaAnswer(1, 5000, 10000, 1, true)).toBe(82);
  });

  it('creates deterministic problem hints', () => {
    const addition = createFormulaProblemForLevel(1, () => 0);
    const root = createFormulaProblemForLevel(12, () => 0);

    expect(addition.hint).toEqual(expect.any(String));
    expect(root.hint).toBe('4 * 4 + 2 * 2');
  });

  it('simplifies multiplication hints instead of restating the factors', () => {
    const randomValues = [0, 0.385, 0.584];
    const problem = createFormulaProblemForLevel(4, () => randomValues.shift() ?? 0);

    expect(problem.prompt).toBe('7 * 9');
    expect(problem.answer).toBe(63);
    expect(problem.hint).toBe('70 - 7');
    expect(problem.hint).not.toContain('groups of');
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
    expect(state.formulaPlayers.map((player) => player.hintsRemaining)).toEqual([
      FORMULA_INITIAL_HINTS,
      FORMULA_INITIAL_HINTS,
    ]);
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

  it('reveals one hint per problem and halves hinted answer score', () => {
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

    const hinted = requestFormulaFrenzyHint(state, 'left', now);
    const duplicate = requestFormulaFrenzyHint(hinted.state, 'left', now);
    const answered = resolveFormulaFrenzyAnswer(
      hinted.state,
      'left',
      hinted.state.formulaPlayers[0].currentProblem.answer!,
      new Date('2026-06-28T12:00:02.000Z'),
    );

    expect(hinted.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    expect(hinted.state.formulaPlayers[0]).toMatchObject({
      hintsRemaining: FORMULA_INITIAL_HINTS - 1,
      currentHint: expect.any(String),
    });
    expect(answered.state.formulaPlayers[0]).toMatchObject({
      score: 99,
      currentHint: null,
      totalCorrect: 1,
    });
  });

  it('restores one hint on every ten-answer streak up to the maximum', () => {
    let state = startFormulaFrenzyMatch(
      createFormulaFrenzyMatchState(
        'match-1',
        'FORM-FREN',
        'seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
      ),
    );
    state = requestFormulaFrenzyHint(state, 'left').state;

    for (let index = 0; index < 10; index += 1) {
      state = resolveFormulaFrenzyAnswer(
        state,
        'left',
        state.formulaPlayers[0].currentProblem.answer!,
      ).state;
    }

    expect(state.formulaPlayers[0]).toMatchObject({
      hintsRemaining: FORMULA_INITIAL_HINTS,
      streak: 10,
    });
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

  it('uses score, then level, then average solve time when a player times out', () => {
    const state = startFormulaFrenzyMatch(
      createFormulaFrenzyMatchState(
        'match-1',
        'FORM-FREN',
        'seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
      ),
    );
    const withHigherExpiredScore = {
      ...state,
      formulaPlayers: state.formulaPlayers.map((player) =>
        player.userId === 'left'
          ? { ...player, score: 500, level: 2, totalCorrect: 5, totalSolveTimeMs: 5000 }
          : player,
      ),
    };
    const withHigherExpiredLevel = {
      ...state,
      formulaPlayers: state.formulaPlayers.map((player) =>
        player.userId === 'left'
          ? { ...player, score: 500, level: 3, totalCorrect: 5, totalSolveTimeMs: 5000 }
          : { ...player, score: 500, level: 2, totalCorrect: 5, totalSolveTimeMs: 1000 },
      ),
    };
    const withFasterExpiredAverage = {
      ...state,
      formulaPlayers: state.formulaPlayers.map((player) =>
        player.userId === 'left'
          ? { ...player, score: 500, level: 2, totalCorrect: 5, totalSolveTimeMs: 5000 }
          : { ...player, score: 500, level: 2, totalCorrect: 5, totalSolveTimeMs: 6000 },
      ),
    };

    expect(expireFormulaFrenzyPlayer(withHigherExpiredScore, 'left').winnerUserId).toBe('left');
    expect(expireFormulaFrenzyPlayer(withHigherExpiredLevel, 'left').winnerUserId).toBe('left');
    expect(expireFormulaFrenzyPlayer(withFasterExpiredAverage, 'left').winnerUserId).toBe('left');
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

  it('uses match stats when a wrong answer spends the last heart', () => {
    const state = startFormulaFrenzyMatch(
      createFormulaFrenzyMatchState(
        'match-1',
        'FORM-FREN',
        'seed',
        { userId: 'left', displayName: 'Left' },
        { userId: 'right', displayName: 'Right' },
      ),
    );
    const lowHearts = {
      ...state,
      formulaPlayers: state.formulaPlayers.map((player) =>
        player.userId === 'left'
          ? { ...player, hearts: 1, score: 500, level: 2, totalCorrect: 5, totalSolveTimeMs: 5000 }
          : player,
      ),
    };
    const result = resolveFormulaFrenzyAnswer(lowHearts, 'left', 999);

    expect(result.state.winnerUserId).toBe('left');
  });

  it('generates integer power and root answers', () => {
    const power = createFormulaProblemForLevel(11, () => 0);
    const root = createFormulaProblemForLevel(12, () => 0);

    expect(power.prompt).toBe('4² + 4');
    expect(root.prompt).toBe('√16 + 4');
    expect(Number.isInteger(power.answer)).toBe(true);
    expect(Number.isInteger(root.answer)).toBe(true);
  });

  it('groups compound prompts once parentheses unlock', () => {
    const randomValues = [0.55, 0.42, 0.2, 0.8, 0.05, 0.9, 0.8];
    const problem = createFormulaProblemForLevel(15, () => randomValues.shift() ?? 0);

    expect(problem.prompt).toBe('(10 * 6) - (41 - 1)');
    expect(problem.answer).toBe(20);
  });

  it('avoids tiny arithmetic prompts at level 8', () => {
    const random = seededRandom(8);

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const problem = createFormulaProblemForLevel(8, random);

      expect(problem.prompt).toMatch(/[*/!]/);
      expect(problem.prompt).toMatch(/ [+-] /);
      // `!` legitimately suffixes small factorials (2!, 3!), so allow a digit before it.
      expect(problem.prompt).not.toMatch(/(?<!\d)[123](?![!\d])/);
    }
  });

  it('keeps parentheses out of pre-parentheses levels', () => {
    for (let level = 6; level < 15; level += 1) {
      const random = seededRandom(level);

      for (let attempt = 0; attempt < 25; attempt += 1) {
        const prompt = createFormulaProblemForLevel(level, random).prompt;
        // Percentage deliberately wraps its first term in parentheses.
        if (prompt.includes('%')) continue;

        expect(prompt).not.toContain('(');
      }
    }
  });

  it('uses precedence prompts at level 10 without parentheses', () => {
    const random = seededRandom(10);

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const problem = createFormulaProblemForLevel(10, random);

      expect(problem.prompt).toMatch(/[*/²³√∛]/);
      expect(problem.prompt).toMatch(/ [+-] /);
      expect(problem.prompt).not.toContain('(');
    }
  });

  it('prevents negative answers before negative results unlock', () => {
    for (let level = 1; level < 17; level += 1) {
      const random = seededRandom(level * 31);

      for (let attempt = 0; attempt < 25; attempt += 1) {
        expect(createFormulaProblemForLevel(level, random).answer).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('avoids zero-value grouped subtraction filler', () => {
    const random = seededRandom(15);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const problem = createFormulaProblemForLevel(15, random);

      expect(problem.prompt).not.toMatch(/\((\d+) - \1\)/);
    }
  });
});

describe('soloFormulaProblemRandom', () => {
  it('produces identical problems for the same seed and experience', () => {
    const first = createFormulaProblem(3, soloFormulaProblemRandom('run-abc', 3));
    const second = createFormulaProblem(3, soloFormulaProblemRandom('run-abc', 3));

    expect(second).toEqual(first);
  });

  it('produces different problems across seeds', () => {
    const a = createFormulaProblem(0, soloFormulaProblemRandom('run-a', 0));
    const b = createFormulaProblem(0, soloFormulaProblemRandom('run-b', 0));

    expect(b).not.toEqual(a);
  });
});
