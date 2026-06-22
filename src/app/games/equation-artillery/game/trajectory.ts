import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall } from '../models/wall';
import { WorldBounds } from '../models/world-bounds';
import { damageWalls, pointHitsTarget, pointHitsWallPiece } from './collision';
import { CompiledExpression, ExpressionError } from './expression';

export const WALL_BLAST_RADIUS = 1.5;

export interface ShotState {
  readonly bullet: Bullet;
  readonly trail: readonly Point[];
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
  readonly active: boolean;
  readonly error: string | null;
}

export function createShot(
  player: Player,
  targets: readonly Target[],
  walls: readonly Wall[],
): ShotState {
  return {
    bullet: { position: player.position, radius: 0.18 },
    trail: [player.position],
    targets,
    walls,
    active: true,
    error: null,
  };
}

export function advanceShot(
  state: ShotState,
  player: Player,
  expression: CompiledExpression,
  bounds: WorldBounds,
  step: number,
): ShotState {
  if (!state.active) return state;
  const nextX = state.bullet.position.x + step;
  let nextY: number;
  try {
    nextY =
      player.position.y + expression.evaluate(nextX - player.position.x) - expression.originValue;
  } catch (error) {
    return {
      ...state,
      active: false,
      error: error instanceof ExpressionError ? error.message : 'The equation became invalid.',
    };
  }
  const point = { x: nextX, y: nextY };
  const inside =
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY;
  if (!inside) return { ...state, bullet: { ...state.bullet, position: point }, active: false };
  const hitPiece = state.walls
    .flatMap((wall) => wall.pieces)
    .find((piece) => pointHitsWallPiece(point, piece, state.bullet.radius));
  if (hitPiece) {
    return {
      ...state,
      bullet: { ...state.bullet, position: point },
      trail: [...state.trail, point],
      walls: damageWalls(state.walls, point, WALL_BLAST_RADIUS),
      active: false,
    };
  }
  return {
    ...state,
    bullet: { ...state.bullet, position: point },
    trail: [...state.trail, point],
    targets: state.targets.filter((target) => !pointHitsTarget(point, target)),
  };
}
