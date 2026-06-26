import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall, WallPiece, WallShape } from '../models/wall';
import { WORLD_BOUNDS, WorldBounds } from '../models/world-bounds';
import {
  targetsOverlap,
  wallPieceOverlapsPlayer,
  wallPieceOverlapsTarget,
  wallPiecesOverlap,
} from './collision';
import { compileExpression } from './expression';
import { advanceShot, createShot } from './trajectory';
import { buildWallShapeOffsets } from './wall-shape-offsets';

export type SandboxTool = 'move' | 'enemy' | 'wall' | 'delete';
export type SandboxWallSize = 'small' | 'medium' | 'large';

const TARGET_SIZE = 1;
const WALL_PIECE_SIZE = 0.5;
const WALL_SIZE_UNITS: Record<SandboxWallSize, number> = {
  small: 5,
  medium: 7,
  large: 9,
};
const PREVIEW_STEP = 0.08;
const PREVIEW_MAX_FRAMES = 2000;
const DELETE_RADIUS = 1;

export interface WallStampOptions {
  readonly id: number;
  readonly firstPieceId: number;
  readonly shape: WallShape;
  readonly size: SandboxWallSize;
  readonly center: Point;
}

export interface SandboxPlacementOptions {
  readonly point: Point;
  readonly player: Player;
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
}

export interface TargetPlacementOptions extends SandboxPlacementOptions {
  readonly nextTargetId?: number;
}

export interface WallPlacementOptions extends SandboxPlacementOptions {
  readonly shape: WallShape;
  readonly size: SandboxWallSize;
  readonly nextWallId?: number;
  readonly nextPieceId?: number;
}

export interface SandboxDeleteResult {
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
  readonly deleted: boolean;
}

export interface FreePracticePreviewOptions {
  readonly equation: string;
  readonly player: Player;
  readonly direction: 1 | -1;
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
  readonly bounds?: WorldBounds;
}

function buildLocalWallPoints(shape: WallShape, size: SandboxWallSize): readonly Point[] {
  return buildWallShapeOffsets(shape, WALL_SIZE_UNITS[size], WALL_PIECE_SIZE);
}

function nextTargetId(targets: readonly Target[]): number {
  return Math.max(0, ...targets.map((target) => target.id)) + 1;
}

function nextWallId(walls: readonly Wall[]): number {
  return Math.max(0, ...walls.map((wall) => wall.id)) + 1;
}

function nextPieceId(walls: readonly Wall[]): number {
  return Math.max(0, ...walls.flatMap((wall) => wall.pieces.map((piece) => piece.id))) + 1;
}

function targetFitsBounds(target: Target): boolean {
  const halfWidth = target.width / 2;
  const halfHeight = target.height / 2;
  return (
    target.center.x - halfWidth >= WORLD_BOUNDS.minX &&
    target.center.x + halfWidth <= WORLD_BOUNDS.maxX &&
    target.center.y - halfHeight >= WORLD_BOUNDS.minY &&
    target.center.y + halfHeight <= WORLD_BOUNDS.maxY
  );
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

function targetOverlapsPlayer(target: Target, player: Player): boolean {
  const halfWidth = target.width / 2;
  const halfHeight = target.height / 2;
  const nearestX = Math.max(
    target.center.x - halfWidth,
    Math.min(player.position.x, target.center.x + halfWidth),
  );
  const nearestY = Math.max(
    target.center.y - halfHeight,
    Math.min(player.position.y, target.center.y + halfHeight),
  );
  return Math.hypot(player.position.x - nearestX, player.position.y - nearestY) <= player.radius;
}

function wallsOverlap(first: readonly WallPiece[], second: readonly WallPiece[]): boolean {
  return first.some((firstPiece) =>
    second.some((secondPiece) => wallPiecesOverlap(firstPiece, secondPiece, 0.25)),
  );
}

export function buildWallStamp(options: WallStampOptions): Wall {
  return {
    id: options.id,
    shape: options.shape,
    pieces: buildLocalWallPoints(options.shape, options.size).map((point, index) => ({
      id: options.firstPieceId + index,
      center: { x: options.center.x + point.x, y: options.center.y + point.y },
      size: WALL_PIECE_SIZE,
    })),
  };
}

export function placeSandboxTarget(options: TargetPlacementOptions): Target | null {
  const target: Target = {
    id: options.nextTargetId ?? nextTargetId(options.targets),
    center: options.point,
    width: TARGET_SIZE,
    height: TARGET_SIZE,
  };
  if (!targetFitsBounds(target)) return null;
  if (targetOverlapsPlayer(target, options.player)) return null;
  if (options.targets.some((candidate) => targetsOverlap(candidate, target, 0.2))) return null;
  if (
    options.walls.some((wall) =>
      wall.pieces.some((piece) => wallPieceOverlapsTarget(piece, target, 0.2)),
    )
  ) {
    return null;
  }
  return target;
}

export function placeSandboxWall(options: WallPlacementOptions): Wall | null {
  const wall = buildWallStamp({
    id: options.nextWallId ?? nextWallId(options.walls),
    firstPieceId: options.nextPieceId ?? nextPieceId(options.walls),
    shape: options.shape,
    size: options.size,
    center: options.point,
  });
  if (!piecesFitBounds(wall.pieces)) return null;
  if (wall.pieces.some((piece) => wallPieceOverlapsPlayer(piece, options.player, 0.5))) {
    return null;
  }
  if (
    options.targets.some((target) =>
      wall.pieces.some((piece) => wallPieceOverlapsTarget(piece, target, 0.2)),
    )
  ) {
    return null;
  }
  if (options.walls.some((candidate) => wallsOverlap(wall.pieces, candidate.pieces))) return null;
  return wall;
}

export function deleteNearestSandboxObject(options: {
  readonly point: Point;
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
}): SandboxDeleteResult {
  const nearestTarget = options.targets
    .map((target) => ({
      target,
      distance: Math.hypot(target.center.x - options.point.x, target.center.y - options.point.y),
    }))
    .sort((first, second) => first.distance - second.distance)[0];
  const nearestWall = options.walls
    .map((wall) => ({
      wall,
      distance: Math.min(
        ...wall.pieces.map((piece) =>
          Math.hypot(piece.center.x - options.point.x, piece.center.y - options.point.y),
        ),
      ),
    }))
    .sort((first, second) => first.distance - second.distance)[0];

  if (
    nearestTarget &&
    nearestTarget.distance <= DELETE_RADIUS &&
    (!nearestWall || nearestTarget.distance <= nearestWall.distance)
  ) {
    return {
      targets: options.targets.filter((target) => target.id !== nearestTarget.target.id),
      walls: options.walls,
      deleted: true,
    };
  }
  if (nearestWall && nearestWall.distance <= DELETE_RADIUS) {
    return {
      targets: options.targets,
      walls: options.walls.filter((wall) => wall.id !== nearestWall.wall.id),
      deleted: true,
    };
  }
  return { targets: options.targets, walls: options.walls, deleted: false };
}

export function buildFreePracticePreviewTrail(
  options: FreePracticePreviewOptions,
): readonly Point[] {
  let expression;
  try {
    expression = compileExpression(options.equation);
  } catch {
    return [];
  }
  let shot = createShot(options.player, options.targets, options.walls);
  for (let index = 0; index < PREVIEW_MAX_FRAMES && shot.active; index += 1) {
    shot = advanceShot(
      shot,
      options.player,
      expression,
      options.bounds ?? WORLD_BOUNDS,
      PREVIEW_STEP,
      options.direction,
    );
  }
  return shot.error ? [] : shot.trail;
}
