import { createSeededRandom } from './random.js';
import {
  FormulaFrenzyMatchState,
  FormulaFrenzyPlayerState,
  FormulaOperation,
  FormulaProblem,
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
  if (!player || answer !== player.currentProblem.answer) return { ok: false, state };

  const timestamp = now.toISOString();
  const solveTimeMs = Math.max(
    0,
    now.getTime() - new Date(player.currentProblem.startedAt).getTime(),
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
              score: candidate.score + 1,
              totalSolveTimeMs: candidate.totalSolveTimeMs + solveTimeMs,
              currentProblem: nextProblemFor(candidate, state.seed, timestamp),
            }
          : candidate,
      ),
    },
  };
}

export function expireFormulaFrenzyPlayer(
  state: FormulaFrenzyMatchState,
  userId: string,
  now = new Date(),
): FormulaFrenzyMatchState {
  if (state.status !== 'active') return state;
  const winner = state.formulaPlayers.find((player) => player.userId !== userId);
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
  return {
    userId: player.userId,
    displayName: player.displayName,
    connected: player.connected,
    score: 0,
    totalSolveTimeMs: 0,
    currentProblem: {
      ...createFormulaProblem(0, randomFor(seed, player.userId, 0)),
      startedAt,
    },
  };
}

function nextProblemFor(
  player: FormulaFrenzyPlayerState,
  seed: string,
  startedAt: string,
): FormulaFrenzyPlayerState['currentProblem'] {
  const score = player.score + 1;
  return {
    ...createFormulaProblem(score, randomFor(seed, player.userId, score)),
    startedAt,
  };
}

function randomFor(seed: string, userId: string, score: number): () => number {
  return createSeededRandom(`${seed}:${userId}:${score}`);
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
    if (operation === 1) {
      return { prompt: `${left} + ${right} * ${third}`, answer: left + right * third };
    }
    return { prompt: `${left} * ${right} - ${third}`, answer: left * right - third };
  }

  const operation = Math.floor(random() * 3);
  const left = randomInt(random, 2, level === 3 ? 18 : 30);
  const right = randomInt(random, 2, level === 3 ? 12 : 20);
  const third = randomInt(random, 2, level === 3 ? 10 : 18);
  if (operation === 0) {
    return { prompt: `(${left} + ${right}) * ${third}`, answer: (left + right) * third };
  }
  if (operation === 1) {
    return { prompt: `${left} * (${right} + ${third})`, answer: left * (right + third) };
  }

  const answer = left + third;
  const divisor = right;
  return { prompt: `${answer * divisor} / ${divisor}`, answer };
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}
