import { createSeededRandom } from './random.js';
import {
  FormulaFrenzyMatchState,
  FormulaFrenzyPlayerState,
  FormulaGameMode,
  FormulaLevelConfig,
  FormulaOperation,
  FormulaProblem,
  MatchEndReason,
  PlayerState,
} from './types.js';

export const FORMULA_OPERATION_OPTIONS: readonly {
  readonly operation: FormulaOperation;
  readonly label: string;
}[] = [
  { operation: 'addition', label: 'Addition' },
  { operation: 'subtraction', label: 'Subtraction' },
  { operation: 'multiplication', label: 'Multiplication' },
  { operation: 'division', label: 'Division' },
];

export const FORMULA_LEVELS: readonly FormulaLevelConfig[] = [
  level(
    1,
    'Number Rookie',
    ['addition', 'subtraction'],
    0,
    9,
    2,
    false,
    false,
    false,
    false,
    10,
    60,
  ),
  level(
    2,
    'Sum Sprinter',
    ['addition', 'subtraction'],
    10,
    99,
    2,
    false,
    false,
    false,
    false,
    10,
    90,
  ),
  level(
    3,
    'Carry Cadet',
    ['addition', 'subtraction'],
    10,
    99,
    2,
    false,
    false,
    false,
    false,
    9,
    120,
  ),
  level(4, 'Product Initiate', ['multiplication'], 2, 5, 2, false, false, false, false, 9, 150),
  level(5, 'Timeslinger', ['multiplication'], 2, 10, 2, false, false, false, false, 8, 180),
  level(
    6,
    'Mixed Recruit',
    ['addition', 'subtraction', 'multiplication'],
    1,
    20,
    3,
    false,
    false,
    false,
    false,
    8,
    220,
  ),
  level(
    7,
    'Precedence Scout',
    ['addition', 'subtraction', 'multiplication'],
    1,
    20,
    3,
    false,
    false,
    true,
    false,
    8,
    280,
  ),
  level(8, 'Division Trainee', ['division'], 1, 144, 2, false, false, false, false, 8, 340),
  level(
    9,
    'Ratio Runner',
    ['addition', 'subtraction', 'division'],
    1,
    100,
    3,
    false,
    false,
    false,
    false,
    8,
    400,
  ),
  level(
    10,
    'Combo Striker',
    ['multiplication', 'division'],
    1,
    120,
    3,
    false,
    false,
    false,
    false,
    7,
    460,
  ),
  level(
    11,
    'Bracket Novice',
    ['addition', 'subtraction', 'multiplication'],
    1,
    25,
    3,
    true,
    false,
    false,
    false,
    8,
    540,
  ),
  level(
    12,
    'Order Keeper',
    ['addition', 'subtraction', 'multiplication'],
    1,
    30,
    3,
    true,
    false,
    true,
    false,
    7,
    620,
  ),
  level(
    13,
    'Chain Solver',
    ['addition', 'subtraction', 'multiplication'],
    1,
    40,
    4,
    true,
    false,
    true,
    false,
    7,
    700,
  ),
  level(
    14,
    'Division Fighter',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    120,
    4,
    true,
    false,
    true,
    false,
    7,
    800,
  ),
  level(
    15,
    'Integer Tactician',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    60,
    4,
    true,
    false,
    true,
    true,
    7,
    900,
  ),
  level(
    16,
    'Bracket Adept',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    120,
    4,
    true,
    true,
    true,
    true,
    6,
    1000,
  ),
  level(
    17,
    'Speed Operator',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    80,
    4,
    true,
    true,
    true,
    true,
    5,
    1100,
  ),
  level(
    18,
    'Precision Solver',
    ['addition', 'subtraction', 'multiplication', 'division'],
    10,
    150,
    4,
    true,
    true,
    true,
    true,
    6,
    1250,
  ),
  level(
    19,
    'Factor Hunter',
    ['addition', 'subtraction', 'multiplication', 'division'],
    2,
    200,
    4,
    true,
    true,
    true,
    true,
    6,
    1400,
  ),
  level(
    20,
    'Equation Warrior',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    200,
    4,
    true,
    true,
    true,
    true,
    6,
    1550,
  ),
  level(
    21,
    'Bracket Commander',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    200,
    5,
    true,
    true,
    true,
    true,
    6,
    1700,
  ),
  level(
    22,
    'Chaos Calculator',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    250,
    5,
    true,
    true,
    true,
    true,
    5,
    1900,
  ),
  level(
    23,
    'Mental Assassin',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    100,
    4,
    true,
    true,
    true,
    true,
    4,
    2100,
  ),
  level(
    24,
    'Grand Operator',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    250,
    5,
    false,
    false,
    true,
    true,
    5,
    2300,
  ),
  level(
    25,
    'Math Warlord',
    ['addition', 'subtraction', 'multiplication', 'division'],
    1,
    300,
    5,
    true,
    true,
    true,
    true,
    4,
    0,
  ),
];

export function createFormulaProblem(
  levelOrScore = 1,
  random: () => number = Math.random,
): FormulaProblem {
  const levelNumber = Math.max(1, Math.min(25, levelOrScore));
  return createFormulaProblemForLevel(levelNumber, random);
}

export function createFormulaProblemForLevel(
  levelNumber: number,
  random: () => number = Math.random,
): FormulaProblem {
  const config = formulaLevel(levelNumber);
  const expression = generateExpression(config, random);
  return {
    prompt: expression.prompt,
    answer: expression.answer,
    level: config.level,
    levelName: config.name,
    deadlineMs: config.timeLimitSeconds * 1000,
  };
}

export function createFormulaPracticeProblem(
  operations: readonly FormulaOperation[],
  random: () => number = Math.random,
): FormulaProblem {
  if (operations.length === 0) throw new Error('Choose at least one calculation type.');

  const operation = operations[Math.floor(random() * operations.length)];
  const config = {
    ...FORMULA_LEVELS[0],
    allowedOperations: [operation],
    minNumber: operation === 'multiplication' || operation === 'division' ? 2 : 1,
    maxNumber: operation === 'addition' || operation === 'subtraction' ? 20 : 12,
    exactDivisionOnly: true,
  };
  const expression = generateBinaryExpression(config, random, operation);
  return {
    prompt: expression.prompt,
    answer: expression.answer,
    level: 1,
    levelName: FORMULA_LEVELS[0].name,
    deadlineMs: 0,
  };
}

export function gainFormulaXp(streak: number, remainingSeconds: number): number {
  return 10 + streak + Math.floor(Math.max(0, remainingSeconds) * 2);
}

export function scoreFormulaAnswer(
  streak: number,
  remainingSeconds: number,
  levelNumber: number,
): number {
  return 100 + Math.floor(Math.max(0, remainingSeconds) * 10) + streak * 5 + levelNumber * 20;
}

export function advanceFormulaProgress(
  levelNumber: number,
  xp: number,
  gainedXp: number,
): { readonly level: number; readonly xp: number; readonly xpRequired: number } {
  let levelValue = Math.max(1, Math.min(25, levelNumber));
  let xpValue = xp + gainedXp;
  while (levelValue < 25 && xpValue >= formulaLevel(levelValue).xpRequired) {
    xpValue -= formulaLevel(levelValue).xpRequired;
    levelValue += 1;
  }
  if (levelValue === 25) xpValue = Math.max(0, xpValue);
  return {
    level: levelValue,
    xp: xpValue,
    xpRequired: formulaLevel(levelValue).xpRequired,
  };
}

export function createFormulaFrenzyMatchState(
  id: string,
  roomCode: string,
  seed: string,
  first: Pick<PlayerState, 'userId' | 'displayName'>,
  second?: Pick<PlayerState, 'userId' | 'displayName'>,
  now = new Date(),
  mode: FormulaGameMode = 'progression',
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
    mode,
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
    return { ok: false, state: missFormulaFrenzyPlayer(state, userId, 'wrong-answer', now) };
  }

  const timestamp = now.toISOString();
  const solveTimeMs = Math.max(
    0,
    now.getTime() - new Date(player.currentProblem.startedAt).getTime(),
  );
  const remainingSeconds = Math.max(0, player.currentProblem.deadlineMs - solveTimeMs) / 1000;
  const streak = player.streak + 1;
  const progress = advanceFormulaProgress(
    player.level,
    player.xp,
    gainFormulaXp(streak, remainingSeconds),
  );
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
                scoreFormulaAnswer(streak, remainingSeconds, candidate.currentProblem.level),
              level: progress.level,
              xp: progress.xp,
              xpRequired: progress.xpRequired,
              streak,
              bestStreak: Math.max(candidate.bestStreak, streak),
              highestLevel: Math.max(candidate.highestLevel, progress.level),
              totalCorrect: candidate.totalCorrect + 1,
              totalSolveTimeMs: candidate.totalSolveTimeMs + solveTimeMs,
              currentProblem: nextProblemFor(candidate, state.seed, timestamp, progress.level),
            }
          : candidate,
      ),
    },
  };
}

export function missFormulaFrenzyPlayer(
  state: FormulaFrenzyMatchState,
  userId: string,
  reason: MatchEndReason,
  now = new Date(),
): FormulaFrenzyMatchState {
  if (state.status !== 'active') return state;
  const player = state.formulaPlayers.find((candidate) => candidate.userId === userId);
  if (!player) return state;
  const nextHearts = state.mode === 'hardcore' ? 0 : player.hearts - 1;
  const timestamp = now.toISOString();
  if (nextHearts <= 0) {
    const winner = state.formulaPlayers.find((candidate) => candidate.userId !== userId);
    return {
      ...state,
      version: state.version + 1,
      status: 'ended',
      winnerUserId: winner?.userId ?? null,
      endReason: reason,
      updatedAt: timestamp,
      formulaPlayers: state.formulaPlayers.map((candidate) =>
        candidate.userId === userId ? { ...candidate, hearts: 0, streak: 0 } : candidate,
      ),
    };
  }

  return {
    ...state,
    version: state.version + 1,
    updatedAt: timestamp,
    formulaPlayers: state.formulaPlayers.map((candidate) =>
      candidate.userId === userId
        ? {
            ...candidate,
            hearts: nextHearts,
            streak: 0,
            currentProblem:
              reason === 'timeout'
                ? nextProblemFor(candidate, state.seed, timestamp, candidate.level)
                : candidate.currentProblem,
          }
        : candidate,
    ),
  };
}

export function expireFormulaFrenzyPlayer(
  state: FormulaFrenzyMatchState,
  userId: string,
  now = new Date(),
): FormulaFrenzyMatchState {
  return missFormulaFrenzyPlayer(state, userId, 'timeout', now);
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

function createFormulaPlayerState(
  player: Pick<PlayerState, 'userId' | 'displayName' | 'connected'>,
  seed: string,
  startedAt: string,
): FormulaFrenzyPlayerState {
  const currentProblem = createFormulaProblemForLevel(1, randomFor(seed, player.userId, 1, 0));
  return {
    userId: player.userId,
    displayName: player.displayName,
    connected: player.connected,
    score: 0,
    level: 1,
    xp: 0,
    xpRequired: FORMULA_LEVELS[0].xpRequired,
    streak: 0,
    bestStreak: 0,
    hearts: 3,
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
  levelNumber: number,
): FormulaFrenzyPlayerState['currentProblem'] {
  return {
    ...createFormulaProblemForLevel(
      levelNumber,
      randomFor(seed, player.userId, levelNumber, player.totalCorrect + 1),
    ),
    startedAt,
  };
}

function randomFor(
  seed: string,
  userId: string,
  levelNumber: number,
  problemIndex: number,
): () => number {
  return createSeededRandom(`${seed}:${userId}:${levelNumber}:${problemIndex}`);
}

function formulaLevel(levelNumber: number): FormulaLevelConfig {
  return FORMULA_LEVELS[Math.max(1, Math.min(25, levelNumber)) - 1];
}

function generateExpression(
  config: FormulaLevelConfig,
  random: () => number,
): Pick<FormulaProblem, 'prompt' | 'answer'> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const expression =
      config.expressionLength === 2
        ? generateBinaryExpression(config, random)
        : generateChainExpression(config, random);
    if (config.allowNegativeResults || expression.answer! >= 0) return expression;
  }
  const fallback = Math.max(0, randomInt(random, config.minNumber, config.maxNumber));
  return { prompt: String(fallback), answer: fallback };
}

function generateChainExpression(
  config: FormulaLevelConfig,
  random: () => number,
): Pick<FormulaProblem, 'prompt' | 'answer'> {
  let expression = atom(config, random);
  let usedMultiplyOrDivide = false;
  let usedDivision = false;

  for (let index = 1; index < config.expressionLength; index += 1) {
    const remaining = config.expressionLength - index;
    let operation = chooseOperation(config.allowedOperations, random);
    if (config.requirePrecedence && !usedMultiplyOrDivide && remaining === 1) {
      operation = config.allowedOperations.includes('multiplication')
        ? 'multiplication'
        : operation;
    }
    if (config.allowedOperations.includes('division') && !usedDivision && remaining === 1) {
      operation = 'division';
    }
    const right = atom(config, random);
    expression = combine(expression, right, operation, config, random, index);
    usedMultiplyOrDivide ||= operation === 'multiplication' || operation === 'division';
    usedDivision ||= operation === 'division';
  }

  return expression;
}

function generateBinaryExpression(
  config: Pick<
    FormulaLevelConfig,
    'minNumber' | 'maxNumber' | 'allowParentheses' | 'allowedOperations'
  >,
  random: () => number,
  requestedOperation?: FormulaOperation,
): Pick<FormulaProblem, 'prompt' | 'answer'> {
  return combine(
    atom(config, random),
    atom(config, random),
    requestedOperation ?? chooseOperation(config.allowedOperations, random),
    { ...config, allowNestedParentheses: false },
    random,
    1,
  );
}

function combine(
  left: Pick<FormulaProblem, 'prompt' | 'answer'>,
  right: Pick<FormulaProblem, 'prompt' | 'answer'>,
  operation: FormulaOperation,
  config: Pick<
    FormulaLevelConfig,
    'minNumber' | 'maxNumber' | 'allowParentheses' | 'allowNestedParentheses'
  >,
  random: () => number,
  index: number,
): Pick<FormulaProblem, 'prompt' | 'answer'> {
  if (operation === 'subtraction') {
    return maybeGrouped(
      `${left.prompt} - ${right.prompt}`,
      left.answer! - right.answer!,
      config,
      random,
      index,
    );
  }
  if (operation === 'multiplication') {
    return maybeGrouped(
      `${left.prompt} * ${right.prompt}`,
      left.answer! * right.answer!,
      config,
      random,
      index,
    );
  }
  if (operation === 'division') {
    const divisor = randomInt(random, Math.max(1, config.minNumber), config.maxNumber);
    if (index > 1) {
      return maybeGrouped(
        `${left.prompt} * ${divisor} / ${divisor}`,
        left.answer!,
        config,
        random,
        index,
      );
    }
    const answer = randomInt(random, 1, Math.max(1, Math.floor(config.maxNumber / divisor)));
    return maybeGrouped(`${answer * divisor} / ${divisor}`, answer, config, random, index);
  }
  if (operation === 'power') {
    const base = Math.max(2, Math.min(12, Math.abs(left.answer!)));
    return maybeGrouped(`${base}^2`, base * base, config, random, index);
  }
  if (operation === 'root') {
    const root = Math.max(2, Math.min(12, Math.abs(left.answer!)));
    return maybeGrouped(`sqrt(${root * root})`, root, config, random, index);
  }
  return maybeGrouped(
    `${left.prompt} + ${right.prompt}`,
    left.answer! + right.answer!,
    config,
    random,
    index,
  );
}

function maybeGrouped(
  prompt: string,
  answer: number,
  config: Pick<FormulaLevelConfig, 'allowParentheses' | 'allowNestedParentheses'>,
  random: () => number,
  index: number,
): Pick<FormulaProblem, 'prompt' | 'answer'> {
  if (!config.allowParentheses) return { prompt, answer };
  if (!config.allowNestedParentheses && prompt.includes('(')) return { prompt, answer };
  if (index > 1 && random() < 0.55) return { prompt: `(${prompt})`, answer };
  return { prompt, answer };
}

function atom(
  config: Pick<FormulaLevelConfig, 'minNumber' | 'maxNumber'>,
  random: () => number,
): Pick<FormulaProblem, 'prompt' | 'answer'> {
  const value = randomInt(random, config.minNumber, config.maxNumber);
  return { prompt: String(value), answer: value };
}

function chooseOperation(
  operations: readonly FormulaOperation[],
  random: () => number,
): FormulaOperation {
  return operations[Math.floor(random() * operations.length)];
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function level(
  levelNumber: number,
  name: string,
  allowedOperations: readonly FormulaOperation[],
  minNumber: number,
  maxNumber: number,
  expressionLength: number,
  allowParentheses: boolean,
  allowNestedParentheses: boolean,
  requirePrecedence: boolean,
  allowNegativeResults: boolean,
  timeLimitSeconds: number,
  xpRequired: number,
): FormulaLevelConfig {
  return {
    level: levelNumber,
    name,
    allowedOperations,
    minNumber,
    maxNumber,
    expressionLength,
    allowParentheses,
    allowNestedParentheses,
    requirePrecedence,
    allowNegativeResults,
    exactDivisionOnly: allowedOperations.includes('division'),
    timeLimitSeconds,
    xpRequired,
    examples: [],
  };
}
