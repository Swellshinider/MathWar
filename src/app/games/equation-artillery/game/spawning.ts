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
import { buildWallShapeOffsets } from './wall-shape-offsets';

export interface RoundEntities {
  readonly player: Player;
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
}

export const WALL_PIECE_SIZE = 0.5;
const WALL_COUNT = 4;
const WALL_SHAPES: readonly WallShape[] = ['vertical', 'circle', 'square', 'triangle'];

const integerBetween = (random: () => number, minimum: number, maximum: number): number =>
  minimum + Math.floor(random() * (maximum - minimum + 1));

const halfStepBetween = (random: () => number, minimum: number, maximum: number): number =>
  integerBetween(random, minimum * 2, maximum * 2) / 2;

function createLocalPieces(shape: WallShape, random: () => number): readonly Point[] {
  if (shape === 'vertical') {
    return buildWallShapeOffsets(shape, integerBetween(random, 8, 13), WALL_PIECE_SIZE);
  }

  if (shape === 'square') {
    return buildWallShapeOffsets(shape, integerBetween(random, 5, 8), WALL_PIECE_SIZE);
  }

  if (shape === 'circle') {
    const radius = integerBetween(random, 3, 4);
    return buildWallShapeOffsets(shape, radius * 2 + 1, WALL_PIECE_SIZE);
  }

  return buildWallShapeOffsets(shape, integerBetween(random, 6, 9), WALL_PIECE_SIZE);
}

function selectWallShapes(random: () => number): readonly WallShape[] {
  const shapes = [...WALL_SHAPES];
  for (let index = shapes.length - 1; index > 0; index -= 1) {
    const swapIndex = integerBetween(random, 0, index);
    [shapes[index], shapes[swapIndex]] = [shapes[swapIndex], shapes[index]];
  }
  return shapes;
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
        x: halfStepBetween(random, -7, 9),
        y: halfStepBetween(random, -7, 7),
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

  if (walls.length !== WALL_COUNT) {
    throw new Error(`Unable to place ${WALL_COUNT} walls without overlap.`);
  }
  return walls;
}

export function spawnRound(random: () => number = Math.random): RoundEntities {
  const player: Player = {
    position: { x: integerBetween(random, -14, -9), y: integerBetween(random, -7, 7) },
    radius: 0.32,
  };
  const walls = spawnWalls(player, random);
  const targets: Target[] = [];

  for (let attempts = 0; targets.length < 3 && attempts < 500; attempts += 1) {
    const candidate: Target = {
      id: targets.length + 1,
      center: { x: integerBetween(random, 5, 14), y: integerBetween(random, -7, 7) },
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
