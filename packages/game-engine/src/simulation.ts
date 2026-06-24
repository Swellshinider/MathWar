import { compileExpression, ExpressionError } from './expression.js';
import { createSeededRandom } from './random.js';
import {
  CharacterState,
  MatchState,
  PlayerState,
  Point,
  ShotResolvedEvent,
  Wall,
  WorldBounds,
} from './types.js';

export const WORLD_BOUNDS: WorldBounds = { minX: -12, maxX: 12, minY: -7.5, maxY: 7.5 };
export const SHOT_STEP = 0.08;
const BULLET_RADIUS = 0.18;
const WALL_BLAST_RADIUS = 0.75;
const WALL_PIECE_SIZE = 0.5;
const TURN_ORDER = [0, 3, 1, 4, 2, 5] as const;
const WALL_SHAPES: readonly Wall['shape'][] = ['vertical', 'circle', 'square', 'triangle'];

function integerBetween(random: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function halfStepBetween(random: () => number, minimum: number, maximum: number): number {
  return integerBetween(random, minimum * 2, maximum * 2) / 2;
}

function centeredOffset(index: number, count: number): number {
  return (index - (count - 1) / 2) * WALL_PIECE_SIZE;
}

function createLocalWallPieces(shape: Wall['shape'], random: () => number): readonly Point[] {
  if (shape === 'vertical') {
    const height = integerBetween(random, 8, 13);
    return Array.from({ length: height }, (_, row) => ({
      x: 0,
      y: centeredOffset(row, height),
    }));
  }

  if (shape === 'square') {
    const side = integerBetween(random, 5, 8);
    return Array.from({ length: side * side }, (_, index) => ({
      x: centeredOffset(index % side, side),
      y: centeredOffset(Math.floor(index / side), side),
    }));
  }

  if (shape === 'circle') {
    const radius = integerBetween(random, 3, 4);
    const diameter = radius * 2 + 1;
    const points: Point[] = [];
    for (let row = 0; row < diameter; row += 1) {
      for (let column = 0; column < diameter; column += 1) {
        const x = column - radius;
        const y = row - radius;
        if (x * x + y * y <= radius * radius) {
          points.push({ x: x * WALL_PIECE_SIZE, y: y * WALL_PIECE_SIZE });
        }
      }
    }
    return points;
  }

  const height = integerBetween(random, 6, 9);
  const points: Point[] = [];
  for (let row = 0; row < height; row += 1) {
    const width = row + 1;
    for (let column = 0; column < width; column += 1) {
      points.push({
        x: centeredOffset(column, width),
        y: centeredOffset(row, height),
      });
    }
  }
  return points;
}

function selectWallShape(random: () => number): Wall['shape'] {
  return WALL_SHAPES[integerBetween(random, 0, WALL_SHAPES.length - 1)];
}

function pieceFitsBounds(piece: { readonly center: Point; readonly size: number }): boolean {
  const halfSize = piece.size / 2;
  return (
    piece.center.x - halfSize >= WORLD_BOUNDS.minX &&
    piece.center.x + halfSize <= WORLD_BOUNDS.maxX &&
    piece.center.y - halfSize >= WORLD_BOUNDS.minY &&
    piece.center.y + halfSize <= WORLD_BOUNDS.maxY
  );
}

function piecesOverlap(
  first: { readonly center: Point; readonly size: number },
  second: { readonly center: Point; readonly size: number },
  padding = 0,
): boolean {
  return (
    Math.abs(first.center.x - second.center.x) < first.size / 2 + second.size / 2 + padding &&
    Math.abs(first.center.y - second.center.y) < first.size / 2 + second.size / 2 + padding
  );
}

function spawnWalls(
  random: () => number,
  characters: readonly Pick<CharacterState, 'position'>[],
): readonly Wall[] {
  const walls: Wall[] = [];
  let nextPieceId = 1;
  const wallCount = integerBetween(random, 2, 5);

  for (let wallId = 1; wallId <= wallCount; wallId += 1) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const shape = selectWallShape(random);
      const center = {
        x: halfStepBetween(random, -5, 5),
        y: halfStepBetween(random, -5, 5),
      };
      const pieces = createLocalWallPieces(shape, random).map((point, pieceIndex) => ({
        id: nextPieceId + pieceIndex,
        center: { x: point.x + center.x, y: point.y + center.y },
        size: WALL_PIECE_SIZE,
      }));
      const overlaps =
        !pieces.every((piece) => pieceFitsBounds(piece)) ||
        characters.some((character) =>
          pieces.some(
            (piece) =>
              Math.hypot(
                piece.center.x - character.position.x,
                piece.center.y - character.position.y,
              ) < 1,
          ),
        ) ||
        walls.some((wall) =>
          wall.pieces.some((existing) =>
            pieces.some((piece) => piecesOverlap(existing, piece, WALL_PIECE_SIZE)),
          ),
        );
      if (!overlaps) {
        walls.push({ id: wallId, shape, pieces });
        nextPieceId += pieces.length;
        break;
      }
    }
  }
  if (walls.length !== wallCount) {
    throw new Error(`Unable to place ${wallCount} multiplayer walls without overlap.`);
  }
  return walls;
}

function randomCharacterPosition(
  random: () => number,
  minimumX: number,
  maximumX: number,
  used: readonly Point[],
): Point {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const x = integerBetween(random, minimumX, maximumX);
    const y = integerBetween(random, -5, 5);
    if (
      used.every((existing) => existing.x !== x) &&
      used.every((existing) => Math.hypot(existing.x - x, existing.y - y) >= 1.5)
    ) {
      return { x, y };
    }
  }
  return {
    x:
      Array.from({ length: maximumX - minimumX + 1 }, (_, index) => minimumX + index).find(
        (candidate) => used.every((existing) => existing.x !== candidate),
      ) ?? integerBetween(random, minimumX, maximumX),
    y: [-4, 0, 4][used.length % 3],
  };
}

function spawnCharacters(
  random: () => number,
  first: PlayerState,
  second?: PlayerState,
): readonly CharacterState[] {
  const firstPositions: Point[] = [];
  const secondPositions: Point[] = [];
  const characters: CharacterState[] = [];
  for (let index = 0; index < 3; index += 1) {
    const position = randomCharacterPosition(random, -10, -7, firstPositions);
    firstPositions.push(position);
    characters.push({
      id: index,
      ownerUserId: first.userId,
      displayName: first.displayName,
      position,
      radius: first.radius,
      direction: first.direction,
      alive: true,
    });
  }
  if (second) {
    for (let index = 0; index < 3; index += 1) {
      const position = randomCharacterPosition(random, 7, 10, secondPositions);
      secondPositions.push(position);
      characters.push({
        id: index + 3,
        ownerUserId: second.userId,
        displayName: second.displayName,
        position,
        radius: second.radius,
        direction: second.direction,
        alive: true,
      });
    }
  }
  return characters;
}

function normalizeCharacters(state: MatchState): readonly CharacterState[] {
  if (state.characters?.length) return state.characters;
  return state.players.map((player, index) => ({
    id: index === 0 ? 0 : 3,
    ownerUserId: player.userId,
    displayName: player.displayName,
    position: player.position,
    radius: player.radius,
    direction: player.direction,
    alive: true,
  }));
}

function nextTurnCharacterId(
  characters: readonly CharacterState[],
  currentCharacterId: number,
): number | null {
  const currentIndex = TURN_ORDER.indexOf(currentCharacterId as (typeof TURN_ORDER)[number]);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  for (let offset = 1; offset <= TURN_ORDER.length; offset += 1) {
    const candidateId = TURN_ORDER[(startIndex + offset) % TURN_ORDER.length];
    const candidate = characters.find((character) => character.id === candidateId);
    if (candidate?.alive) return candidate.id;
  }
  return null;
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
  const characters = second ? spawnCharacters(random, players[0], players[1]) : [];
  const timestamp = now.toISOString();
  return {
    id,
    roomCode,
    seed,
    version: second ? 1 : 0,
    status: second ? 'active' : 'waiting',
    players,
    characters,
    walls: second ? spawnWalls(random, characters) : [],
    equationHistory: [],
    turnUserId: second ? first.userId : null,
    turnCharacterId: second ? 0 : null,
    winnerUserId: null,
    endReason: null,
    disconnectedUserId: null,
    reconnectDeadline: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function pointHitsCharacter(point: Point, character: CharacterState): boolean {
  return (
    Math.hypot(point.x - character.position.x, point.y - character.position.y) <=
    character.radius + BULLET_RADIUS
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
  const characters = normalizeCharacters(state);
  const fallbackShooter = state.players.find((player) => player.userId === shooterUserId);
  const shooter =
    characters.find(
      (character) =>
        character.id === state.turnCharacterId &&
        character.ownerUserId === shooterUserId &&
        character.alive,
    ) ?? characters.find((character) => character.ownerUserId === shooterUserId && character.alive);
  const opponents = characters.filter(
    (character) => character.ownerUserId !== shooterUserId && character.alive,
  );
  if (!shooter || !fallbackShooter || opponents.length === 0) {
    throw new Error('Both players require living characters to fire.');
  }
  let expression;
  try {
    expression = compileExpression(equation);
  } catch (error) {
    return {
      commandId,
      matchId: state.id,
      version: state.version,
      shooterUserId,
      shooterCharacterId: shooter.id,
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
  let nextCharacters = characters;
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
        shooterCharacterId: shooter.id,
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
    const hitCharacter = opponents.find((opponent) => pointHitsCharacter(point, opponent));
    if (hitCharacter) {
      impact = 'opponent';
      nextCharacters = characters.map((character) =>
        character.id === hitCharacter.id ? { ...character, alive: false } : character,
      );
      const opponentStillAlive = nextCharacters.some(
        (character) => character.ownerUserId === hitCharacter.ownerUserId && character.alive,
      );
      winnerUserId = opponentStillAlive ? null : shooterUserId;
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
  const turnCharacterId = winnerUserId ? null : nextTurnCharacterId(nextCharacters, shooter.id);
  const turnUserId =
    turnCharacterId === null
      ? null
      : (nextCharacters.find((character) => character.id === turnCharacterId)?.ownerUserId ?? null);
  const nextState: MatchState = {
    ...state,
    characters: nextCharacters,
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
    turnUserId,
    turnCharacterId,
  };
  return {
    commandId,
    matchId: state.id,
    version: nextState.version,
    shooterUserId,
    shooterCharacterId: shooter.id,
    equation: expression.source,
    trail,
    impact,
    error: null,
    state: nextState,
  };
}
