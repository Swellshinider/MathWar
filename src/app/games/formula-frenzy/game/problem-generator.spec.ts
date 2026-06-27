import { createFormulaProblem } from './problem-generator';

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
});
