export interface FormulaProblem {
  readonly prompt: string;
  readonly answer: number;
  readonly level: number;
  readonly deadlineMs: number;
}

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
