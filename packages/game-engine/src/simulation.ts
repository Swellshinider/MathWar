import { compileExpression, ExpressionError } from './expression.js';
import { createGraphShotCursor, GRAPH_SHOT_STEP } from './graph-shot.js';
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

export const WORLD_BOUNDS: WorldBounds = { minX: -16, maxX: 16, minY: -10, maxY: 10 };
export const SHOT_STEP = GRAPH_SHOT_STEP;
const BULLET_RADIUS = 0.18;
const WALL_BLAST_RADIUS = 0.75;
const WALL_PIECE_SIZE = 0.5;
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
        x: halfStepBetween(random, -8, 8),
        y: halfStepBetween(random, -7, 7),
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
    const y = integerBetween(random, -7, 7);
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
    y: [-6, 0, 6][used.length % 3],
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
    const position = randomCharacterPosition(random, -14, -10, firstPositions);
    firstPositions.push(position);
    characters.push({
      id: index,
      ownerUserId: first.userId,
      displayName: `${first.displayName}-${index + 1}`,
      position,
      radius: first.radius,
      direction: first.direction,
      alive: true,
    });
  }
  if (second) {
    for (let index = 0; index < 3; index += 1) {
      const position = randomCharacterPosition(random, 10, 14, secondPositions);
      secondPositions.push(position);
      characters.push({
        id: index + 3,
        ownerUserId: second.userId,
        displayName: `${second.displayName}-${index + 1}`,
        position,
        radius: second.radius,
        direction: second.direction,
        alive: true,
      });
    }
  }
  return characters;
}

function normalizeCharacterNames(
  characters: readonly CharacterState[],
  players: readonly PlayerState[],
): readonly CharacterState[] {
  return players.flatMap((player) =>
    characters
      .filter((character) => character.ownerUserId === player.userId)
      .sort((first, second) => first.id - second.id)
      .map((character, index) => ({
        ...character,
        displayName: `${player.displayName}-${index + 1}`,
      })),
  );
}

function normalizeCharacters(state: MatchState): readonly CharacterState[] {
  if (state.characters?.length) return normalizeCharacterNames(state.characters, state.players);
  return normalizeCharacterNames(
    state.players.map((player, index) => ({
      id: index === 0 ? 0 : 3,
      ownerUserId: player.userId,
      displayName: player.displayName,
      position: player.position,
      radius: player.radius,
      direction: player.direction,
      alive: true,
    })),
    state.players,
  );
}

function nextLivingCharacterForOwner(
  characters: readonly CharacterState[],
  ownerUserId: string,
  previousCharacterId: number | null,
): number | null {
  const livingCharacters = characters
    .filter((character) => character.ownerUserId === ownerUserId && character.alive)
    .sort((first, second) => first.id - second.id);
  if (!livingCharacters.length) return null;
  const previousIndex = livingCharacters.findIndex(
    (character) => character.id === previousCharacterId,
  );
  if (previousIndex < 0) return livingCharacters[0].id;
  return livingCharacters[(previousIndex + 1) % livingCharacters.length].id;
}

function lastShooterCharacterIdForOwner(state: MatchState, ownerUserId: string): number | null {
  for (let index = (state.equationHistory?.length ?? 0) - 1; index >= 0; index -= 1) {
    const entry = state.equationHistory[index];
    if (entry?.shooterUserId === ownerUserId && typeof entry.shooterCharacterId === 'number') {
      return entry.shooterCharacterId;
    }
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
      position: { x: -12, y: integerBetween(random, -6, 6) },
      radius: 0.32,
      direction: 1,
      connected: true,
    },
  ];
  if (second)
    players.push({
      ...second,
      position: { x: 12, y: integerBetween(random, -6, 6) },
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
  let cursor;
  try {
    cursor = createGraphShotCursor({
      expression,
      shooter: shooter.position,
      shooterRadius: shooter.radius,
      direction: shooter.direction,
      bounds: WORLD_BOUNDS,
      step: SHOT_STEP,
      maxSteps: 1000,
      maxSegmentLength: BULLET_RADIUS * 2,
    });
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
  while (true) {
    const next = cursor.next();
    if (next.kind === 'done') break;
    if (next.kind === 'invalid') {
      return {
        commandId,
        matchId: state.id,
        version: state.version,
        shooterUserId,
        shooterCharacterId: shooter.id,
        equation,
        trail,
        impact: 'invalid',
        error: next.error,
        state,
      };
    }
    const point = next.point;
    trail.push(point);
    if (next.kind === 'bounds') break;
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
  const nextTurnUserId = state.players.find((player) => player.userId !== shooterUserId)?.userId;
  const turnCharacterId =
    winnerUserId || !nextTurnUserId
      ? null
      : nextLivingCharacterForOwner(
          nextCharacters,
          nextTurnUserId,
          lastShooterCharacterIdForOwner(state, nextTurnUserId),
        );
  const turnUserId =
    turnCharacterId === null || winnerUserId
      ? null
      : (nextCharacters.find((character) => character.id === turnCharacterId)?.ownerUserId ?? null);
  const nextState: MatchState = {
    ...state,
    characters: nextCharacters,
    walls,
    equationHistory: [
      ...(state.equationHistory ?? []),
      { commandId, shooterUserId, shooterCharacterId: shooter.id, equation: expression.source },
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
