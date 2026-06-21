import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { WorldBounds } from '../models/world-bounds';
import { pointHitsTarget } from './collision';
import { CompiledExpression, ExpressionError } from './expression';

export interface ShotState {
  readonly bullet: Bullet;
  readonly trail: readonly Point[];
  readonly targets: readonly Target[];
  readonly active: boolean;
  readonly error: string | null;
}

export function createShot(player: Player, targets: readonly Target[]): ShotState {
  return {
    bullet: { position: player.position, radius: 0.18 },
    trail: [player.position],
    targets,
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
  return {
    ...state,
    bullet: { ...state.bullet, position: point },
    trail: [...state.trail, point],
    targets: state.targets.filter((target) => !pointHitsTarget(point, target)),
  };
}
