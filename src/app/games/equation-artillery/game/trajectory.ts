import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall, WallPiece } from '../models/wall';
import { WorldBounds } from '../models/world-bounds';
import { damageWalls, pointHitsTarget, pointHitsWallPiece } from './collision';
import { CompiledExpression, ExpressionError } from './expression';
import { createGraphShotCursor, GraphShotCursor } from '@math-war/game-engine';

export const WALL_BLAST_RADIUS = 0.75;
export type ShotImpact = 'target' | 'wall' | 'bounds' | 'invalid' | null;

export interface ShotState {
  readonly bullet: Bullet;
  readonly trail: readonly Point[];
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
  readonly active: boolean;
  readonly error: string | null;
  readonly impact: ShotImpact;
  readonly cursor: GraphShotCursor | null;
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
    impact: null,
    cursor: null,
  };
}

export function advanceShot(
  state: ShotState,
  player: Player,
  expression: CompiledExpression,
  bounds: WorldBounds,
  step: number,
  direction: 1 | -1 = 1,
): ShotState {
  if (!state.active) return state;
  let cursor = state.cursor;
  let next;
  try {
    cursor ??= createGraphShotCursor({
      expression,
      shooter: player.position,
      shooterRadius: player.radius,
      direction,
      bounds,
      step,
      maxSegmentLength: state.bullet.radius * 2,
    });
    next = cursor.next();
  } catch (error) {
    return {
      ...state,
      active: false,
      error: error instanceof ExpressionError ? error.message : 'The equation became invalid.',
      impact: 'invalid',
    };
  }

  if (next.kind === 'invalid') {
    return {
      ...state,
      cursor,
      active: false,
      error: next.error,
      impact: 'invalid',
    };
  }

  if (next.kind === 'done') {
    return {
      ...state,
      cursor,
      active: false,
      impact: 'bounds',
    };
  }

  const point = next.point;
  if (next.kind === 'bounds') {
    return {
      ...state,
      cursor,
      bullet: { ...state.bullet, position: point },
      trail: [...state.trail, point],
      active: false,
      impact: 'bounds',
    };
  }
  let hitPiece: WallPiece | undefined;
  for (const wall of state.walls) {
    hitPiece = wall.pieces.find((piece) => pointHitsWallPiece(point, piece, state.bullet.radius));
    if (hitPiece) break;
  }
  if (hitPiece) {
    return {
      ...state,
      cursor,
      bullet: { ...state.bullet, position: point },
      trail: [...state.trail, point],
      walls: damageWalls(state.walls, point, WALL_BLAST_RADIUS),
      active: false,
      impact: 'wall',
    };
  }
  const targets = state.targets.filter((target) => !pointHitsTarget(point, target));
  return {
    ...state,
    cursor,
    bullet: { ...state.bullet, position: point },
    trail: [...state.trail, point],
    targets,
    impact: targets.length < state.targets.length ? 'target' : null,
  };
}
