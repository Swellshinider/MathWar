import { CompiledExpression, ExpressionError } from './expression.js';
import { Point, WorldBounds } from './types.js';

export const GRAPH_SHOT_STEP = 0.08;
export const GRAPH_SHOT_MAX_STEPS = 2000;

const DERIVATIVE_STEP = 0.01;
const MAX_TANGENT_LOOPS = 24;
const TANGENT_ERROR = Math.PI / 360;
const MIN_STEP = 0.00001;
const BOUNDS_EPSILON = 1e-9;

export interface GraphShotConfig {
  readonly expression: CompiledExpression;
  readonly shooter: Point;
  readonly shooterRadius: number;
  readonly direction: 1 | -1;
  readonly bounds: WorldBounds;
  readonly step?: number;
  readonly maxSteps?: number;
  readonly maxSegmentLength?: number;
  readonly minStep?: number;
}

export interface GraphShotCursor {
  readonly current: Point;
  readonly stepCount: number;
  next(): GraphShotAdvance;
}

export type GraphShotAdvance =
  | {
      readonly kind: 'point';
      readonly point: Point;
      readonly stepSize: number;
    }
  | {
      readonly kind: 'bounds';
      readonly point: Point;
    }
  | {
      readonly kind: 'invalid';
      readonly point: Point;
      readonly error: string;
    }
  | {
      readonly kind: 'done';
      readonly point: Point;
    };

function ensureFinite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new ExpressionError('The equation produced a non-finite number.');
  }
  return value;
}

function pointInsideBounds(point: Point, bounds: WorldBounds): boolean {
  return (
    point.x >= bounds.minX - BOUNDS_EPSILON &&
    point.x <= bounds.maxX + BOUNDS_EPSILON &&
    point.y >= bounds.minY - BOUNDS_EPSILON &&
    point.y <= bounds.maxY + BOUNDS_EPSILON
  );
}

export function segmentBoundsExitPoint(from: Point, to: Point, bounds: WorldBounds): Point {
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

function tangentAt(expression: CompiledExpression, x: number): number {
  return ensureFinite(expression.evaluate(x + DERIVATIVE_STEP) - expression.evaluate(x)) /
    DERIVATIVE_STEP;
}

function launchPoint(config: GraphShotConfig): Point {
  const { expression, shooter, shooterRadius, direction } = config;
  let slope = tangentAt(expression, shooter.x);
  let angle = Math.atan(slope * direction);

  for (let loop = 0; loop < MAX_TANGENT_LOOPS; loop += 1) {
    const candidateX = shooter.x + shooterRadius * Math.cos(angle) * direction;
    slope = tangentAt(expression, candidateX);
    const nextAngle = Math.atan(slope * direction);
    if (Math.abs(nextAngle - angle) <= TANGENT_ERROR) {
      angle = nextAngle;
      break;
    }
    angle = nextAngle;
  }

  return {
    x: shooter.x + shooterRadius * Math.cos(angle) * direction,
    y: shooter.y + shooterRadius * Math.sin(angle),
  };
}

export function createGraphShotCursor(config: GraphShotConfig): GraphShotCursor {
  const step = config.step ?? GRAPH_SHOT_STEP;
  const maxSteps = config.maxSteps ?? GRAPH_SHOT_MAX_STEPS;
  const maxSegmentLength = config.maxSegmentLength ?? Math.max(config.shooterRadius * 2, step);
  const minStep = config.minStep ?? MIN_STEP;
  const start = launchPoint(config);
  const offset = start.y - ensureFinite(config.expression.evaluate(start.x));
  let current = start;
  let stepCount = 0;

  return {
    get current() {
      return current;
    },
    get stepCount() {
      return stepCount;
    },
    next(): GraphShotAdvance {
      if (stepCount >= maxSteps) return { kind: 'done', point: current };
      let stepSize = step;
      let candidate: Point | null = null;

      while (stepSize >= minStep) {
        const x = current.x + stepSize * config.direction;
        try {
          candidate = { x, y: ensureFinite(config.expression.evaluate(x)) + offset };
        } catch (error) {
          return {
            kind: 'invalid',
            point: current,
            error: error instanceof Error ? error.message : 'The equation became invalid.',
          };
        }
        const distance = Math.hypot(candidate.x - current.x, candidate.y - current.y);
        if (distance <= maxSegmentLength) break;
        stepSize /= 2;
      }

      if (!candidate || stepSize < minStep) {
        return { kind: 'done', point: current };
      }

      if (!pointInsideBounds(candidate, config.bounds)) {
        const exitPoint = segmentBoundsExitPoint(current, candidate, config.bounds);
        current = exitPoint;
        return { kind: 'bounds', point: exitPoint };
      }

      current = candidate;
      stepCount += 1;
      return { kind: 'point', point: candidate, stepSize };
    },
  };
}
