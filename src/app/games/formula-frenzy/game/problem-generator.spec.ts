import {
  FORMULA_LEVELS,
  createFormulaPracticeProblem,
  createFormulaProblemForLevel,
} from './problem-generator';

describe('createFormulaProblemForLevel', () => {
  it('starts with addition or subtraction and a 10 second deadline', () => {
    const problem = createFormulaProblemForLevel(1, () => 0.1);

    expect(problem.level).toBe(1);
    expect(problem.levelName).toBe('Number Scout');
    expect(problem.deadlineMs).toBe(10000);
    expect(Number.isInteger(problem.answer)).toBe(true);
    expect(problem.prompt).toMatch(/^\d+ [+-] \d+$/);
  });

  it('has 25 named levels', () => {
    expect(FORMULA_LEVELS).toHaveLength(25);
    expect(FORMULA_LEVELS[24].name).toBe('MathWar Legend');
  });

  it('uses exact division when division is selected', () => {
    const problem = createFormulaProblemForLevel(8, () => 0.99);

    expect(problem.level).toBe(8);
    expect(problem.prompt).toMatch(/\d+ \/ \d+/);
    expect(Number.isInteger(problem.answer)).toBe(true);
  });

  it('uses each level timer from configuration', () => {
    expect(createFormulaProblemForLevel(25).deadlineMs).toBe(4000);
  });

  it('creates integer power and root practice problems', () => {
    const power = createFormulaPracticeProblem(['power'], () => 0);
    const root = createFormulaPracticeProblem(['root'], () => 0);

    expect(power.prompt).toBe('2 ^ 2');
    expect(power.answer).toBe(4);
    expect(root.prompt).toBe('sqrt(4)');
    expect(root.answer).toBe(2);
  });

  it('creates simple addition practice problems', () => {
    const problem = createFormulaPracticeProblem(['addition'], () => 0);

    expect(problem.prompt).toBe('1 + 1');
    expect(problem.answer).toBe(2);
    expect(problem.level).toBe(1);
    expect(problem.deadlineMs).toBe(0);
  });

  it('creates simple subtraction practice problems', () => {
    const problem = createFormulaPracticeProblem(['subtraction'], () => 0);

    expect(problem.prompt).toBe('2 - 1');
    expect(problem.answer).toBe(1);
  });

  it('creates simple multiplication practice problems', () => {
    const problem = createFormulaPracticeProblem(['multiplication'], () => 0);

    expect(problem.prompt).toBe('2 * 2');
    expect(problem.answer).toBe(4);
  });

  it('creates exact division practice problems', () => {
    const problem = createFormulaPracticeProblem(['division'], () => 0);

    expect(problem.prompt).toBe('2 / 2');
    expect(problem.answer).toBe(1);
    expect(Number.isInteger(problem.answer)).toBe(true);
  });

  it('chooses from enabled practice operations only', () => {
    const problem = createFormulaPracticeProblem(['addition', 'multiplication'], () => 0.99);

    expect(problem.prompt).toBe('12 * 12');
    expect(problem.answer).toBe(144);
  });

  it('requires at least one practice operation', () => {
    expect(() => createFormulaPracticeProblem([], () => 0)).toThrow(
      'Choose at least one calculation type.',
    );
  });
});
