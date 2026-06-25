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
    description: 'Sine wave. Angles are measured in radians.',
    category: 'trigonometry',
  },
  {
    name: 'sen',
    evaluatorName: 'sin',
    syntax: 'sen(x)',
    description: 'Alias for sin(x).',
    category: 'trigonometry',
  },
  {
    name: 'cos',
    evaluatorName: 'cos',
    syntax: 'cos(x)',
    description: 'Cosine wave. Angles are measured in radians.',
    category: 'trigonometry',
  },
  {
    name: 'tan',
    evaluatorName: 'tan',
    syntax: 'tan(x)',
    description: 'Tangent curve. Angles are measured in radians.',
    category: 'trigonometry',
  },
  {
    name: 'tg',
    evaluatorName: 'tan',
    syntax: 'tg(x)',
    description: 'Alias for tan(x).',
    category: 'trigonometry',
  },
  {
    name: 'asin',
    evaluatorName: 'asin',
    syntax: 'asin(x)',
    description: 'Inverse sine. Use inputs from -1 to 1.',
    category: 'trigonometry',
  },
  {
    name: 'acos',
    evaluatorName: 'acos',
    syntax: 'acos(x)',
    description: 'Inverse cosine. Use inputs from -1 to 1.',
    category: 'trigonometry',
  },
  {
    name: 'atan',
    evaluatorName: 'atan',
    syntax: 'atan(x)',
    description: 'Inverse tangent.',
    category: 'trigonometry',
  },
  {
    name: 'sinh',
    evaluatorName: 'sinh',
    syntax: 'sinh(x)',
    description: 'Hyperbolic sine, useful for fast-growing curves.',
    category: 'trigonometry',
  },
  {
    name: 'cosh',
    evaluatorName: 'cosh',
    syntax: 'cosh(x)',
    description: 'Hyperbolic cosine, useful for fast-growing bowl shapes.',
    category: 'trigonometry',
  },
  {
    name: 'tanh',
    evaluatorName: 'tanh',
    syntax: 'tanh(x)',
    description: 'Hyperbolic tangent, an S-shaped curve from -1 to 1.',
    category: 'trigonometry',
  },
  {
    name: 'sqrt',
    evaluatorName: 'sqrt',
    syntax: 'sqrt(x)',
    description: 'Square root. Negative inputs are not valid.',
    category: 'numeric',
  },
  {
    name: 'abs',
    evaluatorName: 'abs',
    syntax: 'abs(x)',
    description: 'Distance from zero, always zero or positive.',
    category: 'numeric',
  },
  {
    name: 'exp',
    evaluatorName: 'exp',
    syntax: 'exp(x)',
    description: 'Euler’s number raised to x. Grows very quickly.',
    category: 'numeric',
  },
  {
    name: 'log',
    evaluatorName: 'log',
    syntax: 'log(x)',
    description: 'Natural logarithm. Inputs must be greater than zero.',
    category: 'numeric',
  },
  {
    name: 'ln',
    evaluatorName: 'log',
    syntax: 'ln(x)',
    description: 'Alias for log(x).',
    category: 'numeric',
  },
  {
    name: 'log2',
    evaluatorName: 'log2',
    syntax: 'log2(x)',
    description: 'Base-2 logarithm. Inputs must be greater than zero.',
    category: 'numeric',
  },
  {
    name: 'log10',
    evaluatorName: 'log10',
    syntax: 'log10(x)',
    description: 'Base-10 logarithm. Inputs must be greater than zero.',
    category: 'numeric',
  },
  {
    name: 'floor',
    evaluatorName: 'floor',
    syntax: 'floor(x)',
    description: 'Rounds down to the next whole number.',
    category: 'numeric',
  },
  {
    name: 'ceil',
    evaluatorName: 'ceil',
    syntax: 'ceil(x)',
    description: 'Rounds up to the next whole number.',
    category: 'numeric',
  },
  {
    name: 'round',
    evaluatorName: 'round',
    syntax: 'round(x)',
    description: 'Rounds to the nearest whole number.',
    category: 'numeric',
  },
  {
    name: 'sign',
    evaluatorName: 'sign',
    syntax: 'sign(x)',
    description: 'Returns -1, 0, or 1 depending on the sign of the input.',
    category: 'numeric',
  },
] as const;

export const CONSTANT_REFERENCES = [
  { syntax: 'pi', description: 'The circle constant π, about 3.14159.' },
  { syntax: 'e', description: 'Euler’s number, about 2.71828.' },
] as const;

export const OPERATOR_REFERENCES = [
  { syntax: '+', description: 'Add two values.' },
  { syntax: '-', description: 'Subtract one value from another.' },
  {
    syntax: '*',
    description: 'Multiply two values. You can also write implicit multiplication., such as xx',
  },
  { syntax: '/', description: 'Divide one value by another.' },
  { syntax: '^', description: 'Raise a value to a power, such as x^2.' },
] as const;
