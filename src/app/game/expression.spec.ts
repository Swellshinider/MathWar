import {
  compileExpression,
  ExpressionError,
  MAX_EXPRESSION_LENGTH,
  normalizeExpression,
} from './expression';

describe('expression compiler', () => {
  it.each([
    ['xx', 3, 9],
    ['xxx', 2, 8],
    ['2x', 3, 6],
    ['x2', 3, 6],
    ['x(x+1)', 2, 6],
    ['2(x+1)', 2, 6],
    ['(x+1)(x-1)', 3, 8],
    ['2sin(x)', Math.PI / 2, 2],
    ['xsin(x)', Math.PI / 2, Math.PI / 2],
    ['sin(x)cos(x)', Math.PI / 4, 0.5],
  ])('normalizes implicit multiplication in %s', (source, x, expected) => {
    expect(compileExpression(source).evaluate(x)).toBeCloseTo(expected);
  });

  it('normalizes case and common Unicode operators', () => {
    expect(normalizeExpression('2×X − π ÷ 2')).toBe('2*x-pi/2');
  });

  it.each(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'log', 'ln', 'exp'])(
    'allows %s',
    (name) => {
      expect(compileExpression(`${name}(1)`).evaluate(1)).toEqual(expect.any(Number));
    },
  );

  it.each(['x=2', 'foo(x)', 'x.y', '[x]', 'x<2', 'min(x)', '2 cm'])(
    'rejects unsupported AST or tokens in %s',
    (source) => {
      expect(() => compileExpression(source)).toThrow(ExpressionError);
    },
  );

  it('rejects invalid syntax and oversized expressions', () => {
    expect(() => compileExpression('x+(')).toThrow('invalid syntax');
    expect(() => compileExpression('x'.repeat(MAX_EXPRESSION_LENGTH + 1))).toThrow('too long');
  });

  it('rejects a non-finite launch value', () => {
    expect(() => compileExpression('sqrt(-1)')).toThrow('non-finite');
  });

  it('reports non-finite values encountered after launch', () => {
    const expression = compileExpression('1/(x-1)');
    expect(() => expression.evaluate(1)).toThrow('non-finite');
  });
});
