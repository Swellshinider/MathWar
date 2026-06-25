import { FunctionNode, MathNode, OperatorNode, parse, SymbolNode } from 'mathjs/number';

export const MAX_EXPRESSION_LENGTH = 180;
const ORIGIN_FALLBACK_SAMPLES = [0.08, 0.16, 0.32, 0.64, 1] as const;
const FUNCTIONS = new Map([
  ['sin', 'sin'],
  ['cos', 'cos'],
  ['tan', 'tan'],
  ['asin', 'asin'],
  ['acos', 'acos'],
  ['atan', 'atan'],
  ['sinh', 'sinh'],
  ['cosh', 'cosh'],
  ['tanh', 'tanh'],
  ['sqrt', 'sqrt'],
  ['abs', 'abs'],
  ['exp', 'exp'],
  ['log', 'log'],
  ['ln', 'log'],
  ['log2', 'log2'],
  ['log10', 'log10'],
  ['floor', 'floor'],
  ['ceil', 'ceil'],
  ['round', 'round'],
  ['sign', 'sign'],
]);
const EVALUATOR_FUNCTIONS = new Set(FUNCTIONS.values());
const SYMBOLS = new Set(['x', 'pi', 'e', ...EVALUATOR_FUNCTIONS]);
const OPERATORS = new Set(['+', '-', '*', '/', '^']);
const WORDS = [...FUNCTIONS.keys(), 'pi', 'x', 'e'].sort((a, b) => b.length - a.length);

interface Token {
  readonly text: string;
  readonly kind: 'number' | 'symbol' | 'function' | 'open' | 'close' | 'operator';
}

export interface CompiledExpression {
  readonly source: string;
  readonly originValue: number;
  evaluate(x: number): number;
}

export class ExpressionError extends Error {}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/.exec(rest);
    if (number) {
      tokens.push({ text: number[0], kind: 'number' });
      index += number[0].length;
      continue;
    }
    const word = WORDS.find((candidate) => rest.startsWith(candidate));
    if (word) {
      const evaluatorName = FUNCTIONS.get(word);
      tokens.push({
        text: evaluatorName ?? word,
        kind: evaluatorName ? 'function' : 'symbol',
      });
      index += word.length;
      continue;
    }
    const character = source[index];
    if (character === '(') tokens.push({ text: character, kind: 'open' });
    else if (character === ')') tokens.push({ text: character, kind: 'close' });
    else if (OPERATORS.has(character)) tokens.push({ text: character, kind: 'operator' });
    else throw new ExpressionError(`Unsupported token near "${rest.slice(0, 12)}".`);
    index += 1;
  }
  return tokens;
}

function needsMultiplication(left: Token, right: Token): boolean {
  const endsValue = left.kind === 'number' || left.kind === 'symbol' || left.kind === 'close';
  const startsValue =
    right.kind === 'number' ||
    right.kind === 'symbol' ||
    right.kind === 'function' ||
    right.kind === 'open';
  return endsValue && startsValue;
}

export function normalizeExpression(value: string): string {
  const compact = value
    .toLowerCase()
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/\s+/g, '');
  if (!compact) throw new ExpressionError('Enter an equation before firing.');
  if (compact.length > MAX_EXPRESSION_LENGTH)
    throw new ExpressionError('The equation is too long.');
  const tokens = tokenize(compact);
  return tokens
    .map((token, index) => {
      const previous = tokens[index - 1];
      return `${previous && needsMultiplication(previous, token) ? '*' : ''}${token.text}`;
    })
    .join('');
}

function validateAst(root: MathNode): void {
  root.traverse((node: MathNode) => {
    if (node.type === 'ConstantNode' || node.type === 'ParenthesisNode') return;
    if (node.type === 'SymbolNode') {
      if (!SYMBOLS.has((node as SymbolNode).name))
        throw new ExpressionError(`Symbol "${(node as SymbolNode).name}" is not supported.`);
      return;
    }
    if (node.type === 'OperatorNode') {
      if (!OPERATORS.has((node as OperatorNode).op))
        throw new ExpressionError(`Operator "${(node as OperatorNode).op}" is not supported.`);
      return;
    }
    if (node.type === 'FunctionNode') {
      const fn = node as FunctionNode;
      if (fn.fn.type !== 'SymbolNode' || !EVALUATOR_FUNCTIONS.has((fn.fn as SymbolNode).name))
        throw new ExpressionError('Only supported named functions may be called.');
      if (fn.args.length !== 1)
        throw new ExpressionError('Functions require exactly one argument.');
      return;
    }
    throw new ExpressionError(`Expression feature "${node.type}" is not supported.`);
  });
}

export function compileExpression(value: string): CompiledExpression {
  const source = normalizeExpression(value);
  let node: MathNode;
  try {
    node = parse(source);
  } catch {
    throw new ExpressionError('The equation has invalid syntax.');
  }
  validateAst(node);
  const compiled = node.compile();
  let originValue = 0;
  let usesOriginFallback = false;
  const evaluate = (x: number): number => {
    if (usesOriginFallback && x === 0) return originValue;
    let result: unknown;
    try {
      result = compiled.evaluate({ x });
    } catch {
      throw new ExpressionError('The equation could not be evaluated.');
    }
    if (typeof result !== 'number' || !Number.isFinite(result))
      throw new ExpressionError('The equation produced a non-finite number.');
    return result;
  };
  try {
    originValue = evaluate(0);
  } catch (originError) {
    const hasFiniteForwardSample = ORIGIN_FALLBACK_SAMPLES.some((sample) => {
      try {
        evaluate(sample);
        return true;
      } catch {
        return false;
      }
    });
    if (!hasFiniteForwardSample) throw originError;
    usesOriginFallback = true;
  }
  return { source, originValue, evaluate };
}
