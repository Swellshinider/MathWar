import { compileExpression, ExpressionError } from './expression.js';
import { createSeededRandom } from './random.js';
import { MatchState, PlayerState, Point, ShotResolvedEvent, Wall, WorldBounds } from './types.js';

export const WORLD_BOUNDS: WorldBounds = { minX: -12, maxX: 12, minY: -7.5, maxY: 7.5 };
export const SHOT_STEP = 0.08;
const BULLET_RADIUS = 0.18;
const WALL_BLAST_RADIUS = 0.75;

function integerBetween(random: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function spawnWalls(random: () => number, players: readonly PlayerState[]): readonly Wall[] {
  const walls: Wall[] = [];
  for (let wallId = 1; wallId <= 3; wallId += 1) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const x = integerBetween(random, -4, 4);
      const y = integerBetween(random, -4, 2);
      const height = integerBetween(random, 3, 6);
      const pieces = Array.from({ length: height }, (_, index) => ({
        id: wallId * 100 + index,
        center: { x, y: y + index * 0.5 },
        size: 0.5,
      }));
      const overlaps =
        players.some((player) =>
          pieces.some(
            (piece) =>
              Math.hypot(piece.center.x - player.position.x, piece.center.y - player.position.y) <
              1,
          ),
        ) ||
        walls.some((wall) =>
          wall.pieces.some((existing) =>
            pieces.some(
              (piece) =>
                Math.hypot(existing.center.x - piece.center.x, existing.center.y - piece.center.y) <
                0.75,
            ),
          ),
        );
      if (!overlaps) {
        walls.push({ id: wallId, shape: 'vertical', pieces });
        break;
      }
    }
  }
  return walls;
}

export function createMatchState(
  id: string,
  roomCode: string,
  seed: string,
  first: Pick<PlayerState, 'userId' | 'displayName'>,
  second?: Pick<PlayerState, 'userId' | 'displayName'>,
  now = new Date(),
): MatchState {
  const random = createSeededRandom(seed);
  const players: PlayerState[] = [
    {
      ...first,
      position: { x: -9, y: integerBetween(random, -4, 4) },
      radius: 0.32,
      direction: 1,
      connected: true,
    },
  ];
  if (second)
    players.push({
      ...second,
      position: { x: 9, y: integerBetween(random, -4, 4) },
      radius: 0.32,
      direction: -1,
      connected: true,
    });
  const timestamp = now.toISOString();
  return {
    id,
    roomCode,
    seed,
    version: second ? 1 : 0,
    status: second ? 'active' : 'waiting',
    players,
    walls: second ? spawnWalls(random, players) : [],
    equationHistory: [],
    turnUserId: second ? first.userId : null,
    winnerUserId: null,
    endReason: null,
    disconnectedUserId: null,
    reconnectDeadline: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function pointHitsPlayer(point: Point, player: PlayerState): boolean {
  return (
    Math.hypot(point.x - player.position.x, point.y - player.position.y) <=
    player.radius + BULLET_RADIUS
  );
}

function pointHitsPiece(point: Point, center: Point, size: number): boolean {
  const half = size / 2;
  const nearestX = Math.max(center.x - half, Math.min(point.x, center.x + half));
  const nearestY = Math.max(center.y - half, Math.min(point.y, center.y + half));
  return Math.hypot(point.x - nearestX, point.y - nearestY) <= BULLET_RADIUS;
}

export function resolveShot(
  state: MatchState,
  shooterUserId: string,
  commandId: string,
  equation: string,
  now = new Date(),
): ShotResolvedEvent {
  const shooter = state.players.find((player) => player.userId === shooterUserId);
  const opponent = state.players.find((player) => player.userId !== shooterUserId);
  if (!shooter || !opponent) throw new Error('Both players are required to fire.');
  let expression;
  try {
    expression = compileExpression(equation);
  } catch (error) {
    return {
      commandId,
      matchId: state.id,
      version: state.version,
      shooterUserId,
      equation,
      trail: [shooter.position],
      impact: 'invalid',
      error: error instanceof ExpressionError ? error.message : 'The equation is invalid.',
      state,
    };
  }
  const trail: Point[] = [shooter.position];
  let walls = state.walls;
  let impact: ShotResolvedEvent['impact'] = 'bounds';
  let winnerUserId: string | null = null;
  for (let sample = 1; sample <= 1000; sample += 1) {
    const distance = sample * SHOT_STEP;
    let y: number;
    try {
      y = shooter.position.y + expression.evaluate(distance) - expression.originValue;
    } catch (error) {
      return {
        commandId,
        matchId: state.id,
        version: state.version,
        shooterUserId,
        equation,
        trail,
        impact: 'invalid',
        error: error instanceof Error ? error.message : 'The equation is invalid.',
        state,
      };
    }
    const point = { x: shooter.position.x + distance * shooter.direction, y };
    if (
      point.x < WORLD_BOUNDS.minX ||
      point.x > WORLD_BOUNDS.maxX ||
      point.y < WORLD_BOUNDS.minY ||
      point.y > WORLD_BOUNDS.maxY
    )
      break;
    trail.push(point);
    if (pointHitsPlayer(point, opponent)) {
      impact = 'opponent';
      winnerUserId = shooterUserId;
      break;
    }
    const hitPiece = walls
      .flatMap((wall) => wall.pieces)
      .find((piece) => pointHitsPiece(point, piece.center, piece.size));
    if (hitPiece) {
      impact = 'wall';
      walls = walls
        .map((wall) => ({
          ...wall,
          pieces: wall.pieces.filter(
            (piece) =>
              Math.hypot(piece.center.x - point.x, piece.center.y - point.y) > WALL_BLAST_RADIUS,
          ),
        }))
        .filter((wall) => wall.pieces.length > 0);
      break;
    }
  }
  const nextState: MatchState = {
    ...state,
    walls,
    equationHistory: [
      ...(state.equationHistory ?? []),
      { commandId, shooterUserId, equation: expression.source },
    ],
    version: state.version + 1,
    updatedAt: now.toISOString(),
    status: winnerUserId ? 'ended' : 'active',
    winnerUserId,
    endReason: winnerUserId ? 'hit' : null,
    turnUserId: winnerUserId ? null : opponent.userId,
  };
  return {
    commandId,
    matchId: state.id,
    version: nextState.version,
    shooterUserId,
    equation: expression.source,
    trail,
    impact,
    error: null,
    state: nextState,
  };
}
