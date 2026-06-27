import { createFormulaPracticeProblem, createFormulaProblem } from './problem-generator';

describe('createFormulaProblem', () => {
  it('starts with addition or subtraction and a 10 second deadline', () => {
    const problem = createFormulaProblem(0, () => 0.1);

    expect(problem.level).toBe(1);
    expect(problem.deadlineMs).toBe(10000);
    expect(Number.isInteger(problem.answer)).toBe(true);
    expect(problem.prompt).toMatch(/^\d+ [+-] \d+$/);
  });

  it('raises the level at score thresholds', () => {
    expect(createFormulaProblem(4).level).toBe(1);
    expect(createFormulaProblem(5).level).toBe(2);
    expect(createFormulaProblem(10).level).toBe(3);
    expect(createFormulaProblem(20).level).toBe(4);
  });

  it('uses exact division when division is selected', () => {
    const problem = createFormulaProblem(10, () => 0.99);

    expect(problem.level).toBe(3);
    expect(problem.prompt).toMatch(/\d+ \/ \d+/);
    expect(Number.isInteger(problem.answer)).toBe(true);
  });

  it('never lowers the deadline below four seconds', () => {
    expect(createFormulaProblem(100).deadlineMs).toBe(4000);
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

    expect(problem.prompt).toBe('1 - 1');
    expect(problem.answer).toBe(0);
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
