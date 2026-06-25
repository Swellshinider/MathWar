import { describe, expect, it } from 'vitest';
import { compileExpression, ExpressionError } from './expression.js';
import { createGraphShotCursor } from './graph-shot.js';
import { WorldBounds } from './types.js';

const bounds: WorldBounds = { minX: -12, maxX: 12, minY: -7.5, maxY: 7.5 };

describe('graph shot cursor', () => {
  it('samples equations with board x and vertically anchors them to the shooter', () => {
    const cursor = createGraphShotCursor({
      expression: compileExpression('x^2'),
      shooter: { x: -2, y: 3 },
      shooterRadius: 0,
      direction: 1,
      bounds,
      step: 0.5,
      maxSegmentLength: 10,
    });

    expect(cursor.next()).toMatchObject({
      kind: 'point',
      point: { x: -1.5, y: 1.25 },
    });
  });

  it('samples right-side shots by decreasing board x', () => {
    const cursor = createGraphShotCursor({
      expression: compileExpression('x^2'),
      shooter: { x: 2, y: 3 },
      shooterRadius: 0,
      direction: -1,
      bounds,
      step: 0.5,
      maxSegmentLength: 10,
    });

    expect(cursor.next()).toMatchObject({
      kind: 'point',
      point: { x: 1.5, y: 1.25 },
    });
  });

  it('starts from the shooter edge along the curve tangent', () => {
    const cursor = createGraphShotCursor({
      expression: compileExpression('x'),
      shooter: { x: 0, y: 0 },
      shooterRadius: 1,
      direction: 1,
      bounds,
      step: 0.1,
    });

    expect(cursor.current.x).toBeCloseTo(Math.SQRT1_2);
    expect(cursor.current.y).toBeCloseTo(Math.SQRT1_2);
  });

  it('reduces step size for steep curves', () => {
    const cursor = createGraphShotCursor({
      expression: compileExpression('tan(x+x)'),
      shooter: { x: 0, y: 0 },
      shooterRadius: 0,
      direction: 1,
      bounds,
      step: 0.72,
      maxSegmentLength: 0.36,
    });

    const next = cursor.next();
    expect(next.kind).toBe('point');
    if (next.kind === 'point') expect(next.stepSize).toBeLessThan(0.72);
  });

  it('clips shots to the board bounds', () => {
    const cursor = createGraphShotCursor({
      expression: compileExpression('0'),
      shooter: { x: 11.9, y: 0 },
      shooterRadius: 0,
      direction: 1,
      bounds,
      step: 0.2,
    });

    expect(cursor.next()).toMatchObject({
      kind: 'bounds',
      point: { x: bounds.maxX, y: 0 },
    });
  });

  it('rejects equations that are non-finite at launch', () => {
    expect(() =>
      createGraphShotCursor({
        expression: compileExpression('log(x)'),
        shooter: { x: -1, y: 0 },
        shooterRadius: 0,
        direction: 1,
        bounds,
      }),
    ).toThrow(ExpressionError);
  });
});
