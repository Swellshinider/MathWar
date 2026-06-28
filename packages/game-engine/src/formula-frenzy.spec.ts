import {
  createFormulaFrenzyMatchState,
  expireFormulaFrenzyPlayer,
  resolveFormulaFrenzyAnswer,
  startFormulaFrenzyMatch,
} from './index.js';
import { describe, expect, it } from 'vitest';

describe('formula frenzy multiplayer simulation', () => {
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
      '4 - 9',
      '20 - 8',
    ]);
    expect(state.formulaPlayers.map((player) => player.score)).toEqual([0, 0]);
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
      score: 1,
      totalSolveTimeMs: 2000,
    });
    expect(
      result.state.formulaPlayers.find((player) => player.userId === 'left')?.currentProblem.prompt,
    ).not.toBe(state.formulaPlayers[0].currentProblem.prompt);
    expect(result.state.formulaPlayers.find((player) => player.userId === 'right')?.score).toBe(0);
  });

  it('rejects wrong answers without advancing state', () => {
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
    expect(result.state).toEqual(state);
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
});
