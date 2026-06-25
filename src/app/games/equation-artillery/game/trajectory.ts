import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall } from '../models/wall';
import { WorldBounds } from '../models/world-bounds';
import { damageWalls, pointHitsTarget, pointHitsWallPiece } from './collision';
import { CompiledExpression, ExpressionError } from './expression';

export const WALL_BLAST_RADIUS = 0.75;
const BOUNDS_EPSILON = 1e-9;

export type ShotImpact = 'target' | 'wall' | 'bounds' | 'invalid' | null;

export interface ShotState {
  readonly bullet: Bullet;
  readonly trail: readonly Point[];
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
  readonly active: boolean;
  readonly error: string | null;
  readonly impact: ShotImpact;
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
  };
}

function pointInsideBounds(point: Point, bounds: WorldBounds): boolean {
  return (
    point.x >= bounds.minX - BOUNDS_EPSILON &&
    point.x <= bounds.maxX + BOUNDS_EPSILON &&
    point.y >= bounds.minY - BOUNDS_EPSILON &&
    point.y <= bounds.maxY + BOUNDS_EPSILON
  );
}

function segmentBoundsExitPoint(from: Point, to: Point, bounds: WorldBounds): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const candidates: Point[] = [];
  const addCandidate = (t: number): void => {
    if (t <= 0 || t > 1 || !Number.isFinite(t)) return;
    const point = { x: from.x + dx * t, y: from.y + dy * t };
    if (pointInsideBounds(point, bounds)) candidates.push(point);
  };

  if (dx !== 0) {
    addCandidate((bounds.minX - from.x) / dx);
    addCandidate((bounds.maxX - from.x) / dx);
  }
  if (dy !== 0) {
    addCandidate((bounds.minY - from.y) / dy);
    addCandidate((bounds.maxY - from.y) / dy);
  }

  return (
    candidates.sort((first, second) => {
      const firstDistance = Math.hypot(first.x - from.x, first.y - from.y);
      const secondDistance = Math.hypot(second.x - from.x, second.y - from.y);
      return firstDistance - secondDistance;
    })[0] ?? {
      x: Math.min(Math.max(to.x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(to.y, bounds.minY), bounds.maxY),
    }
  );
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
      impact: 'invalid',
    };
  }
  const point = { x: nextX, y: nextY };
  if (!pointInsideBounds(point, bounds)) {
    const exitPoint = segmentBoundsExitPoint(state.bullet.position, point, bounds);
    return {
      ...state,
      bullet: { ...state.bullet, position: exitPoint },
      trail: [...state.trail, exitPoint],
      active: false,
      impact: 'bounds',
    };
  }
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
      impact: 'wall',
    };
  }
  const targets = state.targets.filter((target) => !pointHitsTarget(point, target));
  return {
    ...state,
    bullet: { ...state.bullet, position: point },
    trail: [...state.trail, point],
    targets,
    impact: targets.length < state.targets.length ? 'target' : null,
  };
}
