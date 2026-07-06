import { createSeededRandom } from './random.js';
import {
  FormulaFrenzyMatchState,
  FormulaFrenzyPlayerState,
  FormulaLevelConfig,
  FormulaOperation,
  FormulaProblem,
  PlayerState,
} from './types.js';

export const FORMULA_MAX_HEARTS = 3;
export const FORMULA_INITIAL_HINTS = 3;

export const FORMULA_OPERATION_OPTIONS: readonly {
  readonly operation: FormulaOperation;
  readonly label: string;
}[] = [
  { operation: 'addition', label: 'Addition' },
  { operation: 'subtraction', label: 'Subtraction' },
  { operation: 'multiplication', label: 'Multiplication' },
  { operation: 'division', label: 'Division' },
  { operation: 'power', label: 'Power' },
  { operation: 'root', label: 'Root' },
];

export const FORMULA_LEVELS: readonly FormulaLevelConfig[] = [
  level(1, 'Number Scout', ['addition', 'subtraction'], 2),
  level(2, 'Sum Sprinter', ['addition', 'subtraction'], 3),
  level(3, 'Difference Dasher', ['addition', 'subtraction'], 3),
  level(4, 'Factor Runner', ['multiplication'], 4),
  level(5, 'Quotient Climber', ['division'], 4),
  level(6, 'Bracket Bender', ['addition', 'subtraction', 'multiplication'], 4),
  level(7, 'Prime Tracker', ['addition', 'subtraction', 'multiplication'], 5),
  level(8, 'Timesmith', ['multiplication', 'division'], 5),
  level(9, 'Fraction Tamer', ['division', 'addition', 'subtraction'], 5),
  level(10, 'Pattern Pilot', ['addition', 'subtraction', 'multiplication', 'division'], 5),
  level(11, 'Exponent Spark', ['power', 'addition', 'subtraction'], 6),
  level(12, 'Radical Rookie', ['root', 'addition', 'subtraction'], 6),
  level(13, 'Power Adept', ['power', 'multiplication'], 6),
  level(14, 'Root Ranger', ['root', 'division'], 6),
  level(15, 'Equation Strider', ['addition', 'subtraction', 'multiplication', 'division'], 7),
  level(16, 'Order Keeper', ['addition', 'subtraction', 'multiplication', 'division'], 7),
  level(17, 'Integer Sage', ['addition', 'subtraction', 'multiplication', 'division'], 7),
  level(18, 'Algebra Ace', ['addition', 'subtraction', 'multiplication', 'division'], 7),
  level(19, 'Variable Virtuoso', ['power', 'root', 'addition', 'subtraction'], 8),
  level(20, 'Formula Expert', ['power', 'root', 'multiplication', 'division'], 8),
  level(21, 'Proof Runner', ['addition', 'subtraction', 'multiplication', 'division', 'power'], 8),
  level(
    22,
    'Theorem Tactician',
    ['addition', 'subtraction', 'multiplication', 'division', 'root'],
    8,
  ),
  level(23, 'Axiom Master', ['addition', 'subtraction', 'multiplication', 'division', 'power'], 9),
  level(
    24,
    'Frenzy Champion',
    ['addition', 'subtraction', 'multiplication', 'division', 'root'],
    9,
  ),
  level(
    25,
    'MathWar Legend',
    ['addition', 'subtraction', 'multiplication', 'division', 'power', 'root'],
    0,
  ),
];

export function createFormulaProblem(
  experience = 0,
  random: () => number = Math.random,
): FormulaProblem {
  return createFormulaProblemForLevel(levelForExperience(experience), random);
}

// Deterministic RNG for solo runs so the client and server generate the same
// problem for a given (seed, experience). Mirrors the multiplayer randomFor.
export function soloFormulaProblemRandom(seed: string, experience: number): () => number {
  return createSeededRandom(`${seed}:solo:${experience}`);
}

export function createFormulaProblemForLevel(
  levelNumber: number,
  random: () => number = Math.random,
): FormulaProblem {
  const config = formulaLevel(levelNumber);
  const problem = problemForLevel(config, random);
  return {
    ...problem,
    level: config.level,
    levelName: config.name,
    deadlineMs: Math.max(4000, 10000 - (config.level - 1) * 250),
  };
}

export function createFormulaPracticeProblem(
  operations: readonly FormulaOperation[],
  random: () => number = Math.random,
): FormulaProblem {
  if (operations.length === 0) throw new Error('Choose at least one calculation type.');
  const operation = operations[Math.floor(random() * operations.length)];
  return {
    ...problemForOperation(operation, random, 1),
    level: 1,
    levelName: FORMULA_LEVELS[0].name,
    deadlineMs: 0,
  };
}

export function levelForExperience(experience: number): number {
  let levelNumber = 1;
  let remaining = Math.max(0, Math.floor(experience));
  while (levelNumber < 25 && remaining >= formulaLevel(levelNumber).xpRequired) {
    remaining -= formulaLevel(levelNumber).xpRequired;
    levelNumber += 1;
  }
  return levelNumber;
}

export function formulaProgress(experience: number): {
  readonly level: number;
  readonly xp: number;
  readonly xpRequired: number;
  readonly percent: number;
} {
  const levelNumber = levelForExperience(experience);
  let xp = Math.max(0, Math.floor(experience));
  for (let index = 1; index < levelNumber; index += 1) xp -= formulaLevel(index).xpRequired;
  const xpRequired = formulaLevel(levelNumber).xpRequired;
  return {
    level: levelNumber,
    xp,
    xpRequired,
    percent: levelNumber === 25 ? 100 : Math.min(100, Math.round((xp / xpRequired) * 100)),
  };
}

export function scoreFormulaAnswer(
  streak: number,
  solveTimeMs: number,
  deadlineMs: number,
  levelNumber: number,
  hintUsed = false,
): number {
  const remainingRatio = clamp((deadlineMs - solveTimeMs) / deadlineMs, 0, 1);
  const streakMultiplier = Math.min(3, 1 + Math.max(0, streak - 1) * 0.1);
  const score = Math.round((100 + levelNumber * 10) * (1 + remainingRatio) * streakMultiplier);
  return hintUsed ? Math.floor(score / 2) : score;
}

export function createFormulaFrenzyMatchState(
  id: string,
  roomCode: string,
  seed: string,
  first: Pick<PlayerState, 'userId' | 'displayName'>,
  second?: Pick<PlayerState, 'userId' | 'displayName'>,
  now = new Date(),
): FormulaFrenzyMatchState {
  const timestamp = now.toISOString();
  const players: PlayerState[] = [
    {
      ...first,
      position: { x: 0, y: 0 },
      radius: 0,
      direction: 1,
      connected: true,
    },
  ];
  if (second) {
    players.push({
      ...second,
      position: { x: 0, y: 0 },
      radius: 0,
      direction: -1,
      connected: true,
    });
  }

  return {
    gameId: 'formula-frenzy',
    id,
    roomCode,
    seed,
    version: second ? 1 : 0,
    status: 'waiting',
    players,
    formulaPlayers: [],
    winnerUserId: null,
    endReason: null,
    disconnectedUserId: null,
    reconnectDeadline: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function startFormulaFrenzyMatch(
  state: FormulaFrenzyMatchState,
  now = new Date(),
): FormulaFrenzyMatchState {
  if (state.players.length < 2) return state;
  const timestamp = now.toISOString();
  return {
    ...state,
    version: state.version + 1,
    status: 'active',
    winnerUserId: null,
    endReason: null,
    updatedAt: timestamp,
    formulaPlayers: state.players.map((player) =>
      createFormulaPlayerState(player, state.seed, timestamp),
    ),
  };
}

export function resolveFormulaFrenzyAnswer(
  state: FormulaFrenzyMatchState,
  userId: string,
  answer: number,
  now = new Date(),
): { readonly ok: boolean; readonly state: FormulaFrenzyMatchState } {
  if (state.status !== 'active') return { ok: false, state };
  const player = state.formulaPlayers.find((candidate) => candidate.userId === userId);
  if (!player) return { ok: false, state };
  if (answer !== player.currentProblem.answer) {
    return { ok: false, state: missFormulaFrenzyPlayer(state, userId, now) };
  }

  const timestamp = now.toISOString();
  const solveTimeMs = Math.max(
    0,
    now.getTime() - new Date(player.currentProblem.startedAt).getTime(),
  );
  const streak = player.streak + 1;
  const experience = player.experience + 1;
  const progress = formulaProgress(experience);
  return {
    ok: true,
    state: {
      ...state,
      version: state.version + 1,
      updatedAt: timestamp,
      formulaPlayers: state.formulaPlayers.map((candidate) =>
        candidate.userId === userId
          ? {
              ...candidate,
              score:
                candidate.score +
                scoreFormulaAnswer(
                  streak,
                  solveTimeMs,
                  candidate.currentProblem.deadlineMs,
                  candidate.currentProblem.level,
                  candidate.currentHint !== null,
                ),
              experience,
              level: progress.level,
              xp: progress.xp,
              xpRequired: progress.xpRequired,
              streak,
              bestStreak: Math.max(candidate.bestStreak, streak),
              hearts:
                streak % 5 === 0
                  ? Math.min(FORMULA_MAX_HEARTS, candidate.hearts + 1)
                  : candidate.hearts,
              hintsRemaining:
                streak % 10 === 0
                  ? Math.min(FORMULA_INITIAL_HINTS, candidate.hintsRemaining + 1)
                  : candidate.hintsRemaining,
              highestLevel: Math.max(candidate.highestLevel, progress.level),
              totalCorrect: candidate.totalCorrect + 1,
              totalSolveTimeMs: candidate.totalSolveTimeMs + solveTimeMs,
              currentHint: null,
              currentProblem: nextProblemFor(candidate, state.seed, timestamp, experience),
            }
          : candidate,
      ),
    },
  };
}

export function requestFormulaFrenzyHint(
  state: FormulaFrenzyMatchState,
  userId: string,
  now = new Date(),
): { readonly ok: boolean; readonly state: FormulaFrenzyMatchState } {
  if (state.status !== 'active') return { ok: false, state };
  const player = state.formulaPlayers.find((candidate) => candidate.userId === userId);
  if (!player || player.hintsRemaining <= 0 || player.currentHint !== null) {
    return { ok: false, state };
  }
  const hint = player.currentProblem.hint;
  if (!hint) return { ok: false, state };
  return {
    ok: true,
    state: {
      ...state,
      version: state.version + 1,
      updatedAt: now.toISOString(),
      formulaPlayers: state.formulaPlayers.map((candidate) =>
        candidate.userId === userId
          ? {
              ...candidate,
              hintsRemaining: candidate.hintsRemaining - 1,
              currentHint: hint,
            }
          : candidate,
      ),
    },
  };
}

export function missFormulaFrenzyPlayer(
  state: FormulaFrenzyMatchState,
  userId: string,
  now = new Date(),
): FormulaFrenzyMatchState {
  if (state.status !== 'active') return state;
  const player = state.formulaPlayers.find((candidate) => candidate.userId === userId);
  if (!player) return state;
  const hearts = Math.max(0, player.hearts - 1);
  const timestamp = now.toISOString();
  const formulaPlayers = state.formulaPlayers.map((candidate) =>
    candidate.userId === userId ? { ...candidate, hearts, streak: 0 } : candidate,
  );

  if (hearts > 0)
    return { ...state, version: state.version + 1, updatedAt: timestamp, formulaPlayers };

  const winner = formulaFrenzyWinner(formulaPlayers, userId);
  return {
    ...state,
    version: state.version + 1,
    status: 'ended',
    winnerUserId: winner?.userId ?? null,
    endReason: 'out-of-hearts',
    updatedAt: timestamp,
    formulaPlayers,
  };
}

export function expireFormulaFrenzyPlayer(
  state: FormulaFrenzyMatchState,
  userId: string,
  now = new Date(),
): FormulaFrenzyMatchState {
  if (state.status !== 'active') return state;
  const winner = formulaFrenzyWinner(state.formulaPlayers, userId);
  return {
    ...state,
    version: state.version + 1,
    status: 'ended',
    winnerUserId: winner?.userId ?? null,
    endReason: 'timeout',
    updatedAt: now.toISOString(),
  };
}

export function sanitizeFormulaFrenzyState(
  state: FormulaFrenzyMatchState,
): FormulaFrenzyMatchState {
  return {
    ...state,
    formulaPlayers: state.formulaPlayers.map((player) => ({
      ...player,
      currentProblem: {
        prompt: player.currentProblem.prompt,
        level: player.currentProblem.level,
        levelName: player.currentProblem.levelName,
        deadlineMs: player.currentProblem.deadlineMs,
        startedAt: player.currentProblem.startedAt,
      },
    })),
  };
}

export function expiredFormulaFrenzyPlayer(
  state: FormulaFrenzyMatchState,
  now = new Date(),
): string | null {
  if (state.status !== 'active') return null;
  return (
    state.formulaPlayers.find(
      (player) =>
        new Date(player.currentProblem.startedAt).getTime() + player.currentProblem.deadlineMs <=
        now.getTime(),
    )?.userId ?? null
  );
}

function formulaFrenzyWinner(
  players: readonly FormulaFrenzyPlayerState[],
  expiredUserId: string,
): FormulaFrenzyPlayerState | null {
  const [first, second] = players;
  if (!first || !second) return players.find((player) => player.userId !== expiredUserId) ?? null;

  const scoreDiff = first.score - second.score;
  if (scoreDiff !== 0) return scoreDiff > 0 ? first : second;

  const levelDiff = first.level - second.level;
  if (levelDiff !== 0) return levelDiff > 0 ? first : second;

  const averageDiff = averageSolveTime(first) - averageSolveTime(second);
  if (averageDiff !== 0) return averageDiff < 0 ? first : second;

  return players.find((player) => player.userId !== expiredUserId) ?? null;
}

function averageSolveTime(player: FormulaFrenzyPlayerState): number {
  if (player.totalCorrect === 0) return Number.POSITIVE_INFINITY;
  return player.totalSolveTimeMs / player.totalCorrect;
}

function createFormulaPlayerState(
  player: Pick<PlayerState, 'userId' | 'displayName' | 'connected'>,
  seed: string,
  startedAt: string,
): FormulaFrenzyPlayerState {
  const currentProblem = createFormulaProblem(0, randomFor(seed, player.userId, 0));
  return {
    userId: player.userId,
    displayName: player.displayName,
    connected: player.connected,
    score: 0,
    experience: 0,
    level: 1,
    xp: 0,
    xpRequired: FORMULA_LEVELS[0].xpRequired,
    streak: 0,
    bestStreak: 0,
    hearts: FORMULA_MAX_HEARTS,
    hintsRemaining: FORMULA_INITIAL_HINTS,
    currentHint: null,
    highestLevel: 1,
    totalCorrect: 0,
    totalSolveTimeMs: 0,
    currentProblem: {
      ...currentProblem,
      startedAt,
    },
  };
}

function nextProblemFor(
  player: FormulaFrenzyPlayerState,
  seed: string,
  startedAt: string,
  experience: number,
): FormulaFrenzyPlayerState['currentProblem'] {
  return {
    ...createFormulaProblem(experience, randomFor(seed, player.userId, experience)),
    startedAt,
  };
}

function randomFor(seed: string, userId: string, experience: number): () => number {
  return createSeededRandom(`${seed}:${userId}:${experience}`);
}

function formulaLevel(levelNumber: number): FormulaLevelConfig {
  return FORMULA_LEVELS[Math.max(1, Math.min(25, levelNumber)) - 1];
}

function problemForLevel(
  config: FormulaLevelConfig,
  random: () => number,
): Pick<FormulaProblem, 'prompt' | 'answer' | 'hint'> {
  const operation = primaryOperationForLevel(config, random);
  const first = problemForOperation(operation, random, config.level);
  if (config.level < 6) return first;

  if (!config.allowParentheses) {
    return flatCompoundProblem(first, config, random);
  }

  const secondOperation = random() < 0.5 ? 'addition' : 'subtraction';
  const second = nonZeroProblemForOperation(secondOperation, random, config.level);
  const operationSign =
    !config.allowNegativeResults &&
    secondOperation === 'subtraction' &&
    first.answer! < second.answer!
      ? '+'
      : secondOperation === 'addition'
        ? '+'
        : '-';
  const secondPrompt = groupCompoundPrompt(second.prompt);
  const groupFirst = random() < 0.5;
  return {
    prompt: `${groupFirst ? `(${first.prompt})` : first.prompt} ${operationSign} ${secondPrompt}`,
    answer: operationSign === '+' ? first.answer! + second.answer! : first.answer! - second.answer!,
    hint:
      operationSign === '+'
        ? `${hintForProblem(first)} + ${hintForProblem(second)}`
        : `${hintForProblem(first)} - ${groupCompoundPrompt(hintForProblem(second))}`,
  };
}

function primaryOperationForLevel(
  config: FormulaLevelConfig,
  random: () => number,
): FormulaOperation {
  const operation =
    config.allowedOperations[Math.floor(random() * config.allowedOperations.length)];
  if (!config.requirePrecedence) return operation;

  const precedenceOperations: FormulaOperation[] = config.allowedOperations.filter(
    (candidate) =>
      candidate === 'multiplication' ||
      candidate === 'division' ||
      candidate === 'power' ||
      candidate === 'root',
  );
  if (precedenceOperations.length === 0 || precedenceOperations.includes(operation)) {
    return operation;
  }
  return precedenceOperations[Math.floor(random() * precedenceOperations.length)];
}

function flatCompoundProblem(
  first: Pick<FormulaProblem, 'prompt' | 'answer' | 'hint'>,
  config: FormulaLevelConfig,
  random: () => number,
): Pick<FormulaProblem, 'prompt' | 'answer' | 'hint'> {
  const min = minimumOperandForLevel(config.level);
  const max = Math.min(20 + config.level * 2, 80);
  const wantsSubtraction = random() >= 0.5;
  const canSubtract = config.allowNegativeResults || first.answer! > 1;
  const operationSign = wantsSubtraction && canSubtract ? '-' : '+';
  const upperBound =
    operationSign === '-' && !config.allowNegativeResults ? Math.min(max, first.answer!) : max;
  const operand = randomInt(random, Math.min(min, upperBound), Math.max(min, upperBound));
  return {
    prompt: `${first.prompt} ${operationSign} ${operand}`,
    answer: operationSign === '+' ? first.answer! + operand : first.answer! - operand,
    hint: `${hintForProblem(first)} ${operationSign} ${hintForAnswer(operand)}`,
  };
}

function nonZeroProblemForOperation(
  operation: FormulaOperation,
  random: () => number,
  levelNumber: number,
): Pick<FormulaProblem, 'prompt' | 'answer' | 'hint'> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const problem = problemForOperation(operation, random, levelNumber);
    if (problem.answer !== 0) return problem;
  }
  return operation === 'subtraction'
    ? { prompt: '2 - 1', answer: 1, hint: '1' }
    : { prompt: '1 + 1', answer: 2, hint: '2' };
}

function groupCompoundPrompt(prompt: string): string {
  return prompt.includes(' + ') || prompt.includes(' - ') ? `(${prompt})` : prompt;
}

function problemForOperation(
  operation: FormulaOperation,
  random: () => number,
  levelNumber: number,
): Pick<FormulaProblem, 'prompt' | 'answer' | 'hint'> {
  const min = minimumOperandForLevel(levelNumber);
  const max = Math.min(20 + levelNumber * 2, 80);
  if (operation === 'subtraction') {
    const left = randomInt(random, Math.max(2, min), max);
    const right = randomInt(random, 1, Math.min(left, max));
    const answer = left - right;
    return { prompt: `${left} - ${right}`, answer, hint: hintForAnswer(answer) };
  }
  if (operation === 'multiplication') {
    const left = randomInt(random, min, Math.min(12 + Math.floor(levelNumber / 2), 24));
    const right = randomInt(random, min, Math.min(12 + Math.floor(levelNumber / 3), 20));
    return {
      prompt: `${left} * ${right}`,
      answer: left * right,
      hint: hintForMultiplication(left, right),
    };
  }
  if (operation === 'division') {
    const divisor = randomInt(random, min, Math.min(12 + Math.floor(levelNumber / 3), 20));
    const answer = randomInt(
      random,
      levelNumber >= 8 ? min : 1,
      Math.min(12 + Math.floor(levelNumber / 2), 24),
    );
    return {
      prompt: `${answer * divisor} / ${divisor}`,
      answer,
      hint: `${divisor} * ? = ${answer * divisor}`,
    };
  }
  if (operation === 'power') {
    const exponent = levelNumber >= 18 && random() < 0.35 ? 3 : 2;
    const base = randomInt(random, min, exponent === 3 ? 6 : 12);
    const prompt = `${base}${exponent === 3 ? '³' : '²'}`;
    const hint = exponent === 3 ? `${base} * ${base} * ${base}` : `${base} * ${base}`;
    return { prompt, answer: base ** exponent, hint };
  }
  if (operation === 'root') {
    const cube = levelNumber >= 20 && random() < 0.35;
    const answer = randomInt(random, min, cube ? 6 : 12);
    return cube
      ? { prompt: `∛${answer ** 3}`, answer, hint: `${answer} * ${answer} * ${answer}` }
      : { prompt: `√${answer ** 2}`, answer, hint: `${answer} * ${answer}` };
  }

  const left = randomInt(random, 1, max);
  const right = randomInt(random, 1, max);
  const answer = left + right;
  return { prompt: `${left} + ${right}`, answer, hint: hintForAnswer(answer) };
}

function minimumOperandForLevel(levelNumber: number): number {
  if (levelNumber >= 8) return 4;
  if (levelNumber >= 6) return 3;
  return 2;
}

function hintForProblem(problem: Pick<FormulaProblem, 'prompt' | 'answer' | 'hint'>): string {
  return problem.hint ?? hintForAnswer(problem.answer ?? 0);
}

function hintForMultiplication(left: number, right: number): string {
  const nearRight = right - 10;
  if (nearRight !== 0 && Math.abs(nearRight) <= 4) {
    return nearRight > 0
      ? `${left * 10} + ${left * nearRight}`
      : `${left * 10} - ${left * Math.abs(nearRight)}`;
  }

  const nearLeft = left - 10;
  if (nearLeft !== 0 && Math.abs(nearLeft) <= 4) {
    return nearLeft > 0
      ? `${right * 10} + ${right * nearLeft}`
      : `${right * 10} - ${right * Math.abs(nearLeft)}`;
  }

  if (right >= 10) {
    const tens = Math.floor(right / 10) * 10;
    const ones = right - tens;
    if (ones > 0) return `${left * tens} + ${left * ones}`;
  }

  if (left >= 10) {
    const tens = Math.floor(left / 10) * 10;
    const ones = left - tens;
    if (ones > 0) return `${right * tens} + ${right * ones}`;
  }

  if (right % 2 === 0) return `${left * (right / 2)} * 2`;
  if (left % 2 === 0) return `${right * (left / 2)} * 2`;
  return hintForAnswer(left * right);
}

function hintForAnswer(answer: number): string {
  if (answer === 0) return '0';
  const sign = answer < 0 ? '-' : '';
  const absolute = Math.abs(answer);
  if (absolute % 2 === 0 && absolute > 2) return `${sign}${absolute / 2} * 2`;
  const parts: number[] = [];
  let place = 1;
  let remaining = absolute;
  while (remaining > 0) {
    const digit = remaining % 10;
    if (digit > 0) parts.unshift(digit * place);
    remaining = Math.floor(remaining / 10);
    place *= 10;
  }
  return `${sign}${parts.join(' + ')}`;
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function level(
  levelNumber: number,
  name: string,
  allowedOperations: readonly FormulaOperation[],
  xpRequired: number,
): FormulaLevelConfig {
  return {
    level: levelNumber,
    name,
    allowedOperations,
    minNumber: 1,
    maxNumber: 100,
    expressionLength: levelNumber >= 15 ? 3 : 2,
    allowParentheses: levelNumber >= 15,
    allowNestedParentheses: false,
    requirePrecedence: levelNumber >= 10,
    allowNegativeResults: levelNumber >= 17,
    exactDivisionOnly: true,
    timeLimitSeconds: Math.max(4, 10 - Math.floor((levelNumber - 1) / 4)),
    xpRequired,
    examples: [],
  };
}
