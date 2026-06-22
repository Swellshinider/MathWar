import { FunctionNode, MathNode, OperatorNode, parse, SymbolNode } from 'mathjs/number';
import { FUNCTION_REFERENCES } from './expression-catalog';

export const MAX_EXPRESSION_LENGTH = 180;
const FUNCTION_BY_NAME = new Map(
  FUNCTION_REFERENCES.map((reference) => [reference.name, reference] as const),
);
const EVALUATOR_FUNCTIONS = new Set(
  FUNCTION_REFERENCES.map((reference) => reference.evaluatorName),
);
const SYMBOLS = new Set(['x', 'pi', 'e', ...EVALUATOR_FUNCTIONS]);
const OPERATORS = new Set(['+', '-', '*', '/', '^']);
const WORDS = [...FUNCTION_BY_NAME.keys(), 'pi', 'x', 'e'].sort((a, b) => b.length - a.length);

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
      const functionReference = FUNCTION_BY_NAME.get(word);
      tokens.push({
        text: functionReference?.evaluatorName ?? word,
        kind: functionReference ? 'function' : 'symbol',
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
      const symbol = node as SymbolNode;
      if (!SYMBOLS.has(symbol.name))
        throw new ExpressionError(`Symbol "${symbol.name}" is not supported.`);
      return;
    }
    if (node.type === 'OperatorNode') {
      const operator = node as OperatorNode;
      if (!OPERATORS.has(operator.op))
        throw new ExpressionError(`Operator "${operator.op}" is not supported.`);
      return;
    }
    if (node.type === 'FunctionNode') {
      const functionNode = node as FunctionNode;
      if (
        functionNode.fn.type !== 'SymbolNode' ||
        !EVALUATOR_FUNCTIONS.has((functionNode.fn as SymbolNode).name)
      ) {
        throw new ExpressionError('Only supported named functions may be called.');
      }
      if (functionNode.args.length !== 1)
        throw new ExpressionError('Functions require exactly one argument.');
      return;
    }
    throw new ExpressionError(`Expression feature "${node.type}" is not supported.`);
  });
}

function requireFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExpressionError('The equation produced a non-finite number.');
  }
  return value;
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
  const evaluate = (x: number): number => {
    try {
      return requireFiniteNumber(compiled.evaluate({ x }));
    } catch (error) {
      if (error instanceof ExpressionError) throw error;
      throw new ExpressionError('The equation could not be evaluated.');
    }
  };
  const originValue = evaluate(0);
  return { source, originValue, evaluate };
}
