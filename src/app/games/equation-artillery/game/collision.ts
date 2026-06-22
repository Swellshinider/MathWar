import { Point } from '../models/point';
import { Player } from '../models/player';
import { Target } from '../models/target';
import { Wall, WallPiece } from '../models/wall';

export function pointHitsTarget(point: Point, target: Target): boolean {
  const halfWidth = target.width / 2;
  const halfHeight = target.height / 2;
  return (
    point.x >= target.center.x - halfWidth &&
    point.x <= target.center.x + halfWidth &&
    point.y >= target.center.y - halfHeight &&
    point.y <= target.center.y + halfHeight
  );
}

export function targetsOverlap(first: Target, second: Target, padding = 0): boolean {
  return (
    Math.abs(first.center.x - second.center.x) < (first.width + second.width) / 2 + padding &&
    Math.abs(first.center.y - second.center.y) < (first.height + second.height) / 2 + padding
  );
}

export function pointHitsWallPiece(point: Point, piece: WallPiece, radius = 0): boolean {
  const halfSize = piece.size / 2;
  const nearestX = Math.max(
    piece.center.x - halfSize,
    Math.min(point.x, piece.center.x + halfSize),
  );
  const nearestY = Math.max(
    piece.center.y - halfSize,
    Math.min(point.y, piece.center.y + halfSize),
  );
  return Math.hypot(point.x - nearestX, point.y - nearestY) <= radius;
}

export function wallPiecesOverlap(first: WallPiece, second: WallPiece, padding = 0): boolean {
  return (
    Math.abs(first.center.x - second.center.x) < (first.size + second.size) / 2 + padding &&
    Math.abs(first.center.y - second.center.y) < (first.size + second.size) / 2 + padding
  );
}

export function wallPieceOverlapsTarget(piece: WallPiece, target: Target, padding = 0): boolean {
  return (
    Math.abs(piece.center.x - target.center.x) < piece.size / 2 + target.width / 2 + padding &&
    Math.abs(piece.center.y - target.center.y) < piece.size / 2 + target.height / 2 + padding
  );
}

export function wallPieceOverlapsPlayer(piece: WallPiece, player: Player, padding = 0): boolean {
  return pointHitsWallPiece(player.position, piece, player.radius + padding);
}

export function damageWalls(
  walls: readonly Wall[],
  impact: Point,
  blastRadius: number,
): readonly Wall[] {
  return walls
    .map((wall) => ({
      ...wall,
      pieces: wall.pieces.filter(
        (piece) => Math.hypot(piece.center.x - impact.x, piece.center.y - impact.y) > blastRadius,
      ),
    }))
    .filter((wall) => wall.pieces.length > 0);
}
