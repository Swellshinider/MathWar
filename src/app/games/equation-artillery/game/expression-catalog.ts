export type FunctionCategory = 'trigonometry' | 'numeric';

export interface FunctionReference {
  readonly name: string;
  readonly evaluatorName: string;
  readonly syntax: string;
  readonly description: string;
  readonly category: FunctionCategory;
}

export const FUNCTION_REFERENCES: readonly FunctionReference[] = [
  {
    name: 'sin',
    evaluatorName: 'sin',
    syntax: 'sin(x)',
    description: 'Sine',
    category: 'trigonometry',
  },
  {
    name: 'cos',
    evaluatorName: 'cos',
    syntax: 'cos(x)',
    description: 'Cosine',
    category: 'trigonometry',
  },
  {
    name: 'tan',
    evaluatorName: 'tan',
    syntax: 'tan(x)',
    description: 'Tangent',
    category: 'trigonometry',
  },
  {
    name: 'asin',
    evaluatorName: 'asin',
    syntax: 'asin(x)',
    description: 'Inverse sine',
    category: 'trigonometry',
  },
  {
    name: 'acos',
    evaluatorName: 'acos',
    syntax: 'acos(x)',
    description: 'Inverse cosine',
    category: 'trigonometry',
  },
  {
    name: 'atan',
    evaluatorName: 'atan',
    syntax: 'atan(x)',
    description: 'Inverse tangent',
    category: 'trigonometry',
  },
  {
    name: 'sinh',
    evaluatorName: 'sinh',
    syntax: 'sinh(x)',
    description: 'Hyperbolic sine',
    category: 'trigonometry',
  },
  {
    name: 'cosh',
    evaluatorName: 'cosh',
    syntax: 'cosh(x)',
    description: 'Hyperbolic cosine',
    category: 'trigonometry',
  },
  {
    name: 'tanh',
    evaluatorName: 'tanh',
    syntax: 'tanh(x)',
    description: 'Hyperbolic tangent',
    category: 'trigonometry',
  },
  {
    name: 'sqrt',
    evaluatorName: 'sqrt',
    syntax: 'sqrt(x)',
    description: 'Square root',
    category: 'numeric',
  },
  {
    name: 'abs',
    evaluatorName: 'abs',
    syntax: 'abs(x)',
    description: 'Absolute value',
    category: 'numeric',
  },
  {
    name: 'exp',
    evaluatorName: 'exp',
    syntax: 'exp(x)',
    description: 'e raised to x',
    category: 'numeric',
  },
  {
    name: 'log',
    evaluatorName: 'log',
    syntax: 'log(x)',
    description: 'Natural logarithm',
    category: 'numeric',
  },
  {
    name: 'ln',
    evaluatorName: 'log',
    syntax: 'ln(x)',
    description: 'Natural logarithm alias',
    category: 'numeric',
  },
  {
    name: 'log2',
    evaluatorName: 'log2',
    syntax: 'log2(x)',
    description: 'Base-2 logarithm',
    category: 'numeric',
  },
  {
    name: 'log10',
    evaluatorName: 'log10',
    syntax: 'log10(x)',
    description: 'Base-10 logarithm',
    category: 'numeric',
  },
  {
    name: 'floor',
    evaluatorName: 'floor',
    syntax: 'floor(x)',
    description: 'Round down',
    category: 'numeric',
  },
  {
    name: 'ceil',
    evaluatorName: 'ceil',
    syntax: 'ceil(x)',
    description: 'Round up',
    category: 'numeric',
  },
  {
    name: 'round',
    evaluatorName: 'round',
    syntax: 'round(x)',
    description: 'Nearest integer',
    category: 'numeric',
  },
  {
    name: 'sign',
    evaluatorName: 'sign',
    syntax: 'sign(x)',
    description: 'Sign of a number',
    category: 'numeric',
  },
] as const;

export const CONSTANT_REFERENCES = [
  { syntax: 'pi', description: 'π' },
  { syntax: 'e', description: "Euler's number" },
] as const;

export const OPERATOR_REFERENCES = [
  { syntax: '+', description: 'Add' },
  { syntax: '-', description: 'Subtract' },
  { syntax: '*', description: 'Multiply' },
  { syntax: '/', description: 'Divide' },
  { syntax: '^', description: 'Power' },
] as const;
