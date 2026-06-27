export interface FormulaProblem {
  readonly prompt: string;
  readonly answer: number;
  readonly level: number;
  readonly deadlineMs: number;
}

export type FormulaOperation = 'addition' | 'subtraction' | 'multiplication' | 'division';

export const FORMULA_OPERATION_OPTIONS: readonly {
  readonly operation: FormulaOperation;
  readonly label: string;
}[] = [
  { operation: 'addition', label: 'Addition' },
  { operation: 'subtraction', label: 'Subtraction' },
  { operation: 'multiplication', label: 'Multiplication' },
  { operation: 'division', label: 'Division' },
];

const BASE_DEADLINE_MS = 10000;
const DEADLINE_DROP_MS = 750;
const MIN_DEADLINE_MS = 4000;

export function createFormulaProblem(
  score: number,
  random: () => number = Math.random,
): FormulaProblem {
  const level = levelForScore(score);
  const deadlineMs = Math.max(
    MIN_DEADLINE_MS,
    BASE_DEADLINE_MS - Math.floor(score / 5) * DEADLINE_DROP_MS,
  );

  return { ...problemForLevel(level, random), level, deadlineMs };
}

export function createFormulaPracticeProblem(
  operations: readonly FormulaOperation[],
  random: () => number = Math.random,
): FormulaProblem {
  if (operations.length === 0) throw new Error('Choose at least one calculation type.');

  const operation = operations[Math.floor(random() * operations.length)];
  if (operation === 'addition') {
    const left = randomInt(random, 1, 20);
    const right = randomInt(random, 1, 20);
    return { prompt: `${left} + ${right}`, answer: left + right, level: 1, deadlineMs: 0 };
  }
  if (operation === 'subtraction') {
    const left = randomInt(random, 1, 20);
    const right = randomInt(random, 1, 20);
    return { prompt: `${left} - ${right}`, answer: left - right, level: 1, deadlineMs: 0 };
  }
  if (operation === 'multiplication') {
    const left = randomInt(random, 2, 12);
    const right = randomInt(random, 2, 12);
    return { prompt: `${left} * ${right}`, answer: left * right, level: 1, deadlineMs: 0 };
  }

  const divisor = randomInt(random, 2, 12);
  const answer = randomInt(random, 1, 12);
  return { prompt: `${answer * divisor} / ${divisor}`, answer, level: 1, deadlineMs: 0 };
}

function levelForScore(score: number): number {
  if (score >= 20) return 4;
  if (score >= 10) return 3;
  if (score >= 5) return 2;
  return 1;
}

function problemForLevel(
  level: number,
  random: () => number,
): Pick<FormulaProblem, 'prompt' | 'answer'> {
  if (level === 1) {
    const left = randomInt(random, 2, 20);
    const right = randomInt(random, 1, 12);
    if (random() < 0.5) return { prompt: `${left} + ${right}`, answer: left + right };
    return { prompt: `${left} - ${right}`, answer: left - right };
  }

  if (level === 2) {
    const operation = Math.floor(random() * 3);
    const left = randomInt(random, 3, 14);
    const right = randomInt(random, 2, 12);
    const third = randomInt(random, 1, 10);
    if (operation === 0) return { prompt: `${left} * ${right}`, answer: left * right };
    if (operation === 1)
      return { prompt: `${left} + ${right} * ${third}`, answer: left + right * third };
    return { prompt: `${left} * ${right} - ${third}`, answer: left * right - third };
  }

  const operation = Math.floor(random() * 3);
  const left = randomInt(random, 2, level === 3 ? 18 : 30);
  const right = randomInt(random, 2, level === 3 ? 12 : 20);
  const third = randomInt(random, 2, level === 3 ? 10 : 18);
  if (operation === 0)
    return { prompt: `(${left} + ${right}) * ${third}`, answer: (left + right) * third };
  if (operation === 1)
    return { prompt: `${left} * (${right} + ${third})`, answer: left * (right + third) };

  const answer = left + third;
  const divisor = right;
  return { prompt: `${answer * divisor} / ${divisor}`, answer };
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}
