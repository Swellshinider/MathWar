import { CharacterState, MatchState, Point, resolveShot } from '@math-war/game-engine';

const CPU_USER_ID = 'cpu';
const MAX_EQUATION_LENGTH = 180;
const RANDOM_EQUATIONS = [
  '0',
  '0.15x',
  '-0.15x',
  '0.35x',
  '-0.35x',
  '0.04x^2',
  '-0.04x^2',
  'sin(x)',
  'cos(x)',
  'abs(x)',
] as const;

interface CpuCandidate {
  readonly equation: string;
  readonly score: number;
}

interface DifficultyConfig {
  readonly populationSize: number;
  readonly generations: number;
  readonly eliteCount: number;
  readonly mutationCount: number;
  readonly randomCount: number;
  readonly maxDepth: number;
  readonly noise: number;
  readonly repeatPenalty: number;
  readonly complexityPenalty: number;
  readonly selectionWindow: number;
}

export interface CpuOpponentMemory {
  readonly populations: ReadonlyMap<number, readonly CpuCandidate[]>;
  readonly recentMisses: ReadonlyMap<number, readonly string[]>;
}

export interface CpuShotOutcome {
  readonly shooterCharacterId: number | null;
  readonly equation: string;
  readonly impact: 'opponent' | 'wall' | 'bounds' | 'invalid';
}

export interface CpuMoveDecision {
  readonly equation: string;
  readonly memory: CpuOpponentMemory;
  readonly diagnostics: {
    readonly evaluatedCandidates: number;
    readonly generations: number;
  };
}

function clampDifficulty(difficulty: number): number {
  return Math.max(0, Math.min(10, Math.round(difficulty)));
}

function difficultyConfig(level: number): DifficultyConfig {
  if (level === 0) {
    return {
      populationSize: 4,
      generations: 0,
      eliteCount: 1,
      mutationCount: 1,
      randomCount: 2,
      maxDepth: 1,
      noise: 200,
      repeatPenalty: 600,
      complexityPenalty: 1.4,
      selectionWindow: 4,
    };
  }

  const populationSize = Math.round(8 + level * 4.2);
  const generations = Math.max(1, Math.ceil(level / 2));
  const eliteCount = Math.max(2, Math.round(populationSize * 0.16));
  const mutationCount = Math.max(2, Math.round(populationSize * 0.48));
  return {
    populationSize,
    generations,
    eliteCount,
    mutationCount,
    randomCount: Math.max(2, populationSize - eliteCount - mutationCount),
    maxDepth: Math.min(6, 2 + Math.floor(level / 2)),
    noise: Math.max(0, (10 - level) * 35),
    repeatPenalty: 750 + level * 450,
    complexityPenalty: Math.max(0.08, (11 - level) * 0.18),
    selectionWindow: Math.max(1, Math.round(5 - level / 2.5)),
  };
}

function randomItem<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function formatNumber(value: number, decimals = 2): string {
  const rounded = Number(value.toFixed(decimals));
  if (Object.is(rounded, -0)) return '0';
  return String(rounded);
}

function formatTerm(coefficient: number, body: string): string {
  if (Math.abs(coefficient) < 0.005) return '0';
  const value = formatNumber(coefficient);
  if (value === '1') return body;
  if (value === '-1') return `-${body}`;
  return `${value}*${body}`;
}

function formatSlope(value: number): string {
  if (Math.abs(value) < 0.005) return '0';
  return formatTerm(value, 'x');
}

function livingCharactersFor(state: MatchState, userId: string): readonly CharacterState[] {
  return state.characters.filter(
    (character) => character.ownerUserId === userId && character.alive,
  );
}

function activeShooter(state: MatchState, shooterUserId: string): CharacterState | null {
  return (
    state.characters.find(
      (character) =>
        character.id === state.turnCharacterId &&
        character.ownerUserId === shooterUserId &&
        character.alive,
    ) ??
    state.characters.find(
      (character) => character.ownerUserId === shooterUserId && character.alive,
    ) ??
    null
  );
}

function distanceToTargets(point: Point, targets: readonly CharacterState[]): number {
  return Math.min(
    ...targets.map((target) =>
      Math.hypot(point.x - target.position.x, point.y - target.position.y),
    ),
  );
}

function uniqueCandidates(equations: readonly string[]): readonly CpuCandidate[] {
  const seen = new Set<string>();
  const candidates: CpuCandidate[] = [];
  for (const equation of equations) {
    const compact = equation.replace(/\s+/g, '');
    if (!compact || compact.length > MAX_EQUATION_LENGTH || seen.has(compact)) continue;
    seen.add(compact);
    candidates.push({ equation: compact, score: Number.NEGATIVE_INFINITY });
  }
  return candidates;
}

function targetedEquations(
  shooter: CharacterState,
  targets: readonly CharacterState[],
  level: number,
  random: () => number,
): readonly string[] {
  const jitterScale = (10 - level) * 0.035;
  return targets.flatMap((target) => {
    const dx = target.position.x - shooter.position.x;
    const dy = target.position.y - shooter.position.y;
    const slope = dx === 0 ? 0 : dy / dx;
    const jitter = (random() - 0.5) * jitterScale;
    const midpointX = (target.position.x + shooter.position.x) / 2;
    const bend = (random() - 0.5) * (0.05 + level * 0.01);
    return [
      formatSlope(slope + jitter),
      `${formatSlope(slope)}+${formatTerm(bend, `(x-${formatNumber(midpointX)})^2`)}`,
      `${formatSlope(slope)}+${formatTerm(0.35 + level * 0.03, `sin(${formatNumber(0.35 + level * 0.04)}*x)`)}`,
      `${formatSlope(slope)}+${formatTerm((random() - 0.5) * 3, `exp(-0.08*(x-${formatNumber(target.position.x)})^2)`)}`,
    ];
  });
}

function randomConstant(random: () => number): string {
  return formatNumber((random() - 0.5) * 12);
}

function randomLeaf(random: () => number): string {
  return random() < 0.68 ? 'x' : randomConstant(random);
}

function randomExpression(random: () => number, depth: number): string {
  if (depth <= 0 || random() < 0.28) return randomLeaf(random);
  const unary = ['sin', 'cos', 'tan', 'abs', 'sqrt', 'log', 'exp'] as const;
  const binary = ['+', '-', '*', '/', '^'] as const;
  if (random() < 0.42) {
    const fn = randomItem(unary, random);
    const inner = randomExpression(random, depth - 1);
    if (fn === 'sqrt') return `sqrt(abs(${inner}))`;
    if (fn === 'log') return `log(abs(${inner})+1)`;
    if (fn === 'exp') return `exp(${formatTerm(0.15, `(${inner})`)})`;
    return `${fn}(${inner})`;
  }
  const op = randomItem(binary, random);
  const left = randomExpression(random, depth - 1);
  const right = randomExpression(random, depth - 1);
  if (op === '/') return `((${left})/(${right}+0.5))`;
  if (op === '^') return `(abs(${left})^${formatNumber(1 + random() * 2, 1)})`;
  return `((${left})${op}(${right}))`;
}

function seedEquations(
  state: MatchState,
  shooter: CharacterState,
  targets: readonly CharacterState[],
  level: number,
  config: DifficultyConfig,
  random: () => number,
): readonly CpuCandidate[] {
  const equations: string[] = [
    ...targetedEquations(shooter, targets, level, random),
    ...RANDOM_EQUATIONS,
  ];
  while (equations.length < config.populationSize) {
    equations.push(randomExpression(random, config.maxDepth));
  }
  const previous = state.equationHistory
    .filter((entry) => entry.shooterCharacterId === shooter.id)
    .slice(-2)
    .map((entry) => entry.equation);
  return uniqueCandidates([...previous, ...equations]).slice(0, config.populationSize);
}

function mutateEquation(equation: string, config: DifficultyConfig, random: () => number): string {
  if (random() < 0.35) return randomExpression(random, config.maxDepth);
  const wrappers = [
    (value: string) => `${value}+${formatTerm((random() - 0.5) * 0.5, 'x')}`,
    (value: string) => `${formatNumber(0.75 + random() * 0.75)}*(${value})`,
    (value: string) =>
      `(${value})+${formatTerm((random() - 0.5) * 2, `sin(${formatNumber(0.2 + random() * 0.8)}*x)`)}`,
    (value: string) => `(${value})+${formatNumber((random() - 0.5) * 2)}`,
  ] as const;
  return randomItem(wrappers, random)(equation);
}

function crossoverEquation(first: string, second: string, random: () => number): string {
  const operators = ['+', '-', '*'] as const;
  const op = randomItem(operators, random);
  if (op === '*')
    return `(${formatNumber(0.35 + random() * 0.5)})*(${first})+(${formatNumber(0.35 + random() * 0.5)})*(${second})`;
  return `(${first})${op}(${second})`;
}

function scoreEquation(
  state: MatchState,
  shooterUserId: string,
  equation: string,
  recentMisses: ReadonlySet<string>,
  config: DifficultyConfig,
  random: () => number,
): CpuCandidate {
  const shot = resolveShot(state, shooterUserId, `cpu-probe-${equation}`, equation);
  if (shot.error) return { equation, score: Number.NEGATIVE_INFINITY };
  const targets = state.characters.filter(
    (character) => character.ownerUserId !== shooterUserId && character.alive,
  );
  const distance = Math.min(...shot.trail.map((point) => distanceToTargets(point, targets)));
  const wallDamage =
    state.walls.reduce((count, wall) => count + wall.pieces.length, 0) -
    shot.state.walls.reduce((count, wall) => count + wall.pieces.length, 0);
  const hitBonus = shot.impact === 'opponent' ? 2_000_000 : 0;
  const repeatPenalty = recentMisses.has(equation) ? config.repeatPenalty : 0;
  const complexityPenalty = equation.length * config.complexityPenalty;
  const noise = (random() - 0.5) * config.noise;
  return {
    equation: shot.equation,
    score:
      hitBonus + wallDamage * 75 - distance * 1_000 - repeatPenalty - complexityPenalty + noise,
  };
}

function evolvePopulation(
  scored: readonly CpuCandidate[],
  config: DifficultyConfig,
  random: () => number,
): readonly CpuCandidate[] {
  const ranked = [...scored].sort((first, second) => second.score - first.score);
  const elites = ranked.slice(0, config.eliteCount);
  const next = elites.map((candidate) => ({ ...candidate }));

  while (next.length < config.eliteCount + config.mutationCount && ranked.length) {
    const parent = randomItem(ranked.slice(0, Math.min(ranked.length, 12)), random);
    next.push({
      equation: mutateEquation(parent.equation, config, random),
      score: Number.NEGATIVE_INFINITY,
    });
  }

  while (next.length < config.populationSize && ranked.length) {
    if (random() < 0.65 && ranked.length > 1) {
      const pool = ranked.slice(0, Math.min(ranked.length, 12));
      next.push({
        equation: crossoverEquation(
          randomItem(pool, random).equation,
          randomItem(pool, random).equation,
          random,
        ),
        score: Number.NEGATIVE_INFINITY,
      });
    } else {
      next.push({
        equation: randomExpression(random, config.maxDepth),
        score: Number.NEGATIVE_INFINITY,
      });
    }
  }

  return uniqueCandidates(next.map((candidate) => candidate.equation)).slice(
    0,
    config.populationSize,
  );
}

function updatePopulation(
  memory: CpuOpponentMemory,
  shooterId: number,
  population: readonly CpuCandidate[],
): CpuOpponentMemory {
  const populations = new Map(memory.populations);
  populations.set(shooterId, population);
  return { ...memory, populations };
}

export function createCpuOpponentMemory(
  state: MatchState,
  random: () => number = Math.random,
): CpuOpponentMemory {
  const populations = new Map<number, readonly CpuCandidate[]>();
  for (const character of livingCharactersFor(state, CPU_USER_ID)) {
    const seeds = uniqueCandidates([
      ...RANDOM_EQUATIONS,
      ...Array.from({ length: 12 }, () => randomExpression(random, 3)),
    ]);
    populations.set(character.id, seeds);
  }
  return { populations, recentMisses: new Map() };
}

export function recordCpuShotOutcome(
  memory: CpuOpponentMemory,
  outcome: CpuShotOutcome,
): CpuOpponentMemory {
  if (typeof outcome.shooterCharacterId !== 'number' || outcome.impact === 'opponent')
    return memory;
  const recentMisses = new Map(memory.recentMisses);
  const previous = recentMisses.get(outcome.shooterCharacterId) ?? [];
  recentMisses.set(outcome.shooterCharacterId, [outcome.equation, ...previous].slice(0, 8));
  return { ...memory, recentMisses };
}

export function chooseCpuMove(
  state: MatchState,
  difficulty: number,
  memory: CpuOpponentMemory,
  random: () => number = Math.random,
): CpuMoveDecision {
  const level = clampDifficulty(difficulty);
  const config = difficultyConfig(level);
  const shooterUserId = state.turnUserId ?? CPU_USER_ID;
  const shooter = activeShooter(state, shooterUserId);
  const targets = shooter
    ? livingCharactersFor(state, shooterUserId).length
      ? state.characters.filter(
          (character) => character.ownerUserId !== shooterUserId && character.alive,
        )
      : []
    : [];

  if (!shooter || !targets.length || level === 0) {
    return {
      equation: randomItem(RANDOM_EQUATIONS, random),
      memory,
      diagnostics: { evaluatedCandidates: 0, generations: 0 },
    };
  }

  let nextMemory = memory;
  let population = memory.populations.get(shooter.id);
  if (!population?.length) {
    population = seedEquations(state, shooter, targets, level, config, random);
    nextMemory = updatePopulation(nextMemory, shooter.id, population);
  }

  const recentMisses = new Set(memory.recentMisses.get(shooter.id) ?? []);
  let evaluatedCandidates = 0;
  let scored: readonly CpuCandidate[] = [];
  for (let generation = 0; generation < config.generations; generation += 1) {
    const seeded = seedEquations(state, shooter, targets, level, config, random);
    const candidates = uniqueCandidates([
      ...population.map((candidate) => candidate.equation),
      ...seeded.map((candidate) => candidate.equation),
    ]).slice(0, config.populationSize);
    scored = candidates
      .map((candidate) =>
        scoreEquation(state, shooterUserId, candidate.equation, recentMisses, config, random),
      )
      .filter((candidate) => Number.isFinite(candidate.score));
    evaluatedCandidates += candidates.length;
    population = evolvePopulation(scored, config, random);
  }

  const ranked = [...scored].sort((first, second) => second.score - first.score);
  const selection = randomItem(
    ranked.slice(0, Math.min(config.selectionWindow, ranked.length)),
    random,
  );
  nextMemory = updatePopulation(nextMemory, shooter.id, population);

  return {
    equation: selection?.equation ?? randomItem(RANDOM_EQUATIONS, random),
    memory: nextMemory,
    diagnostics: { evaluatedCandidates, generations: config.generations },
  };
}

export function chooseCpuEquation(
  state: MatchState,
  difficulty: number,
  random: () => number = Math.random,
): string {
  const memory = createCpuOpponentMemory(state, random);
  return chooseCpuMove(state, difficulty, memory, random).equation;
}
