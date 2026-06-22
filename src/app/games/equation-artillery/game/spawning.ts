import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall, WallPiece, WallShape } from '../models/wall';
import { WORLD_BOUNDS } from '../models/world-bounds';
import {
  targetsOverlap,
  wallPieceOverlapsPlayer,
  wallPieceOverlapsTarget,
  wallPiecesOverlap,
} from './collision';

export interface RoundEntities {
  readonly player: Player;
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
}

export const WALL_PIECE_SIZE = 0.5;
const WALL_SHAPES: readonly WallShape[] = ['vertical', 'circle', 'square', 'triangle'];

const integerBetween = (random: () => number, minimum: number, maximum: number): number =>
  minimum + Math.floor(random() * (maximum - minimum + 1));

const halfStepBetween = (random: () => number, minimum: number, maximum: number): number =>
  integerBetween(random, minimum * 2, maximum * 2) / 2;

function centeredOffset(index: number, count: number): number {
  return (index - (count - 1) / 2) * WALL_PIECE_SIZE;
}

function createLocalPieces(shape: WallShape, random: () => number): readonly Point[] {
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

function selectWallShapes(random: () => number): readonly WallShape[] {
  const firstIndex = integerBetween(random, 0, WALL_SHAPES.length - 1);
  const remaining = WALL_SHAPES.filter((_, index) => index !== firstIndex);
  return [WALL_SHAPES[firstIndex], remaining[integerBetween(random, 0, remaining.length - 1)]];
}

function piecesFitBounds(pieces: readonly WallPiece[]): boolean {
  const halfSize = WALL_PIECE_SIZE / 2;
  return pieces.every(
    (piece) =>
      piece.center.x - halfSize >= WORLD_BOUNDS.minX &&
      piece.center.x + halfSize <= WORLD_BOUNDS.maxX &&
      piece.center.y - halfSize >= WORLD_BOUNDS.minY &&
      piece.center.y + halfSize <= WORLD_BOUNDS.maxY,
  );
}

function wallsOverlap(first: readonly WallPiece[], second: readonly WallPiece[]): boolean {
  return first.some((firstPiece) =>
    second.some((secondPiece) => wallPiecesOverlap(firstPiece, secondPiece, 0.25)),
  );
}

function spawnWalls(player: Player, random: () => number): readonly Wall[] {
  const walls: Wall[] = [];
  let nextPieceId = 1;

  selectWallShapes(random).forEach((shape, index) => {
    const localPieces = createLocalPieces(shape, random);
    for (let attempts = 0; attempts < 500; attempts += 1) {
      const center = {
        x: halfStepBetween(random, -4, 2),
        y: halfStepBetween(random, -5, 5),
      };
      const pieces = localPieces.map((point, pieceIndex) => ({
        id: nextPieceId + pieceIndex,
        center: { x: point.x + center.x, y: point.y + center.y },
        size: WALL_PIECE_SIZE,
      }));
      const overlapsPlayer = pieces.some((piece) => wallPieceOverlapsPlayer(piece, player, 0.5));
      const overlapsWall = walls.some((wall) => wallsOverlap(pieces, wall.pieces));
      if (piecesFitBounds(pieces) && !overlapsPlayer && !overlapsWall) {
        walls.push({ id: index + 1, shape, pieces });
        nextPieceId += pieces.length;
        break;
      }
    }
  });

  if (walls.length !== 2) throw new Error('Unable to place two walls without overlap.');
  return walls;
}

export function spawnRound(random: () => number = Math.random): RoundEntities {
  const player: Player = {
    position: { x: integerBetween(random, -10, -6), y: integerBetween(random, -5, 5) },
    radius: 0.32,
  };
  const walls = spawnWalls(player, random);
  const targets: Target[] = [];

  for (let attempts = 0; targets.length < 3 && attempts < 500; attempts += 1) {
    const candidate: Target = {
      id: targets.length + 1,
      center: { x: integerBetween(random, 3, 10), y: integerBetween(random, -5, 5) },
      width: 1,
      height: 1,
    };
    const overlapsWall = walls.some((wall) =>
      wall.pieces.some((piece) => wallPieceOverlapsTarget(piece, candidate, 0.2)),
    );
    if (!overlapsWall && !targets.some((target) => targetsOverlap(target, candidate, 0.2))) {
      targets.push(candidate);
    }
  }

  if (targets.length !== 3) {
    throw new Error('Unable to place three targets without overlap.');
  }
  return { player, targets, walls };
}
