import { CharacterState, MatchState, Point, resolveShot } from '@math-war/game-engine';

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
] as const;

interface ScoredEquation {
  readonly equation: string;
  readonly hit: boolean;
  readonly distance: number;
}

function clampDifficulty(difficulty: number): number {
  return Math.max(0, Math.min(10, Math.round(difficulty)));
}

function randomItem<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function livingCharactersFor(state: MatchState, userId: string): readonly CharacterState[] {
  return state.characters.filter(
    (character) => character.ownerUserId === userId && character.alive,
  );
}

function distanceToTargets(point: Point, targets: readonly CharacterState[]): number {
  return Math.min(
    ...targets.map((target) =>
      Math.hypot(point.x - target.position.x, point.y - target.position.y),
    ),
  );
}

function scoreEquation(state: MatchState, shooterUserId: string, equation: string): ScoredEquation {
  const shot = resolveShot(state, shooterUserId, `cpu-probe-${equation}`, equation);
  if (shot.error) return { equation, hit: false, distance: Number.POSITIVE_INFINITY };
  const targets = state.characters.filter(
    (character) => character.ownerUserId !== shooterUserId && character.alive,
  );
  const distance = Math.min(...shot.trail.map((point) => distanceToTargets(point, targets)));
  return { equation, hit: shot.impact === 'opponent', distance };
}

function formatSlope(value: number): string {
  if (Math.abs(value) < 0.005) return '0';
  return `${Number(value.toFixed(2))}x`;
}

function targetedEquations(
  state: MatchState,
  shooter: CharacterState,
  targets: readonly CharacterState[],
  difficulty: number,
  random: () => number,
): readonly string[] {
  const jitterScale = (10 - difficulty) * 0.035;
  return targets.map((target) => {
    const dx = target.position.x - shooter.position.x;
    const dy = target.position.y - shooter.position.y;
    const slope = dx === 0 ? 0 : dy / dx;
    const jitter = (random() - 0.5) * jitterScale;
    return formatSlope(slope + jitter);
  });
}

export function chooseCpuEquation(
  state: MatchState,
  difficulty: number,
  random: () => number = Math.random,
): string {
  const level = clampDifficulty(difficulty);
  const shooterUserId = state.turnUserId ?? 'cpu';
  const shooter = state.characters.find(
    (character) =>
      character.id === state.turnCharacterId &&
      character.ownerUserId === shooterUserId &&
      character.alive,
  );
  const targets = livingCharactersFor(state, shooterUserId).length
    ? state.characters.filter(
        (character) => character.ownerUserId !== shooterUserId && character.alive,
      )
    : [];

  if (level === 0 || !shooter || !targets.length) {
    return randomItem(RANDOM_EQUATIONS, random);
  }

  const exploratoryShot = random() > level / 10;
  if (exploratoryShot) return randomItem(RANDOM_EQUATIONS, random);

  const equations = [
    ...targetedEquations(state, shooter, targets, level, random),
    ...RANDOM_EQUATIONS,
  ];
  const searchCount =
    level === 10 ? equations.length : Math.max(3, Math.ceil((equations.length * level) / 10));
  const scored = equations
    .slice(0, searchCount)
    .map((equation) => scoreEquation(state, shooterUserId, equation))
    .filter((score) => Number.isFinite(score.distance));

  return (
    scored.sort((first, second) => {
      if (first.hit !== second.hit) return first.hit ? -1 : 1;
      return first.distance - second.distance;
    })[0]?.equation ?? randomItem(RANDOM_EQUATIONS, random)
  );
}
