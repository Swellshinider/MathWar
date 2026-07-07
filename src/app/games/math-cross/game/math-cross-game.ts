export type MathCrossLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type MathCrossCellKind = 'number' | 'operator' | 'equals' | 'blank' | 'block';
export type MathCrossSlotStatus = 'incomplete' | 'correct' | 'incorrect';

export interface MathCrossCell {
  readonly id: string;
  readonly row: number;
  readonly col: number;
  readonly kind: MathCrossCellKind;
  readonly solution: string;
  readonly editable: boolean;
}

export interface MathCrossEquationSlot {
  readonly id: string;
  readonly label: string;
  readonly cellIds: readonly string[];
}

export interface MathCrossPuzzle {
  readonly id: string;
  readonly seed: string;
  readonly level: MathCrossLevel;
  readonly size: number;
  readonly cells: readonly MathCrossCell[];
  readonly slots: readonly MathCrossEquationSlot[];
  readonly blankCellIds: readonly string[];
}

export interface MathCrossSlotResult {
  readonly slot: MathCrossEquationSlot;
  readonly status: MathCrossSlotStatus;
}

export interface MathCrossValidationResult {
  readonly slots: readonly MathCrossSlotResult[];
  readonly complete: boolean;
  readonly correctCount: number;
  readonly total: number;
}

export type MathCrossEntries = Readonly<Record<string, string>>;

type Operator = '+' | '-' | '*' | '/' | '^' | '√';
type BinaryOperator = Exclude<Operator, '√'>;
type Direction = 'horizontal' | 'vertical';

interface LevelConfig {
  readonly size: 5 | 7 | 9 | 11;
  readonly maxNumber: number;
  readonly equationCount: number;
  readonly blankRatio: number;
  readonly operators: readonly BinaryOperator[];
  readonly tripleTerms: boolean;
  readonly roots: boolean;
}

interface PlacedEquation {
  readonly tokens: readonly string[];
  readonly cellIds: readonly string[];
}

const BINARY_OPERATORS: readonly BinaryOperator[] = ['+', '-', '*', '/', '^'];
const OPERATORS: readonly Operator[] = [...BINARY_OPERATORS, '√'];

const LEVEL_CONFIG: Record<MathCrossLevel, LevelConfig> = {
  1: {
    size: 5,
    maxNumber: 9,
    equationCount: 4,
    blankRatio: 0.34,
    operators: ['+', '-'],
    tripleTerms: false,
    roots: false,
  },
  2: {
    size: 5,
    maxNumber: 18,
    equationCount: 5,
    blankRatio: 0.38,
    operators: ['+', '-'],
    tripleTerms: false,
    roots: false,
  },
  3: {
    size: 7,
    maxNumber: 24,
    equationCount: 7,
    blankRatio: 0.42,
    operators: ['+', '-', '*'],
    tripleTerms: false,
    roots: false,
  },
  4: {
    size: 7,
    maxNumber: 36,
    equationCount: 8,
    blankRatio: 0.44,
    operators: ['+', '-', '*', '/'],
    tripleTerms: false,
    roots: false,
  },
  5: {
    size: 7,
    maxNumber: 48,
    equationCount: 9,
    blankRatio: 0.46,
    operators: ['+', '-', '*', '/'],
    tripleTerms: true,
    roots: false,
  },
  6: {
    size: 9,
    maxNumber: 60,
    equationCount: 11,
    blankRatio: 0.48,
    operators: ['+', '-', '*', '/'],
    tripleTerms: true,
    roots: false,
  },
  7: {
    size: 9,
    maxNumber: 72,
    equationCount: 12,
    blankRatio: 0.5,
    operators: ['+', '-', '*', '/', '^'],
    tripleTerms: true,
    roots: false,
  },
  8: {
    size: 9,
    maxNumber: 81,
    equationCount: 13,
    blankRatio: 0.52,
    operators: ['+', '-', '*', '/', '^'],
    tripleTerms: true,
    roots: true,
  },
  9: {
    size: 11,
    maxNumber: 100,
    equationCount: 16,
    blankRatio: 0.54,
    operators: ['+', '-', '*', '/', '^'],
    tripleTerms: true,
    roots: true,
  },
  10: {
    size: 11,
    maxNumber: 144,
    equationCount: 18,
    blankRatio: 0.56,
    operators: ['+', '-', '*', '/', '^'],
    tripleTerms: true,
    roots: true,
  },
};

export function generateMathCrossPuzzle(
  level: MathCrossLevel,
  seed = `${Date.now()}`,
): MathCrossPuzzle {
  const config = LEVEL_CONFIG[level];
  const random = createSeededRandom(`${seed}:level-${level}`);
  const grid = createEmptyGrid(config.size);
  const placed = placeEquations(grid, config, random);
  const cells = cellsFromGrid(grid);
  const blankIds = chooseBlankCells(cells, placed, config.blankRatio, random);
  const puzzleCells = cells.map((cell) => ({
    ...cell,
    kind: blankIds.has(cell.id) ? 'blank' : cell.kind,
    editable: blankIds.has(cell.id),
  }));

  return {
    id: `level-${level}-${hashSeed(seed).toString(36)}`,
    seed,
    level,
    size: config.size,
    cells: puzzleCells,
    slots: placed.map((equation, index) => ({
      id: `slot-${index}`,
      label: `Equation ${index + 1}`,
      cellIds: equation.cellIds,
    })),
    blankCellIds: puzzleCells.filter((cell) => cell.editable).map((cell) => cell.id),
  };
}

export function validateMathCrossPuzzle(
  puzzle: MathCrossPuzzle,
  entries: MathCrossEntries,
): MathCrossValidationResult {
  const cellsById = new Map(puzzle.cells.map((cell) => [cell.id, cell]));
  const slots = puzzle.slots.map((slot) => {
    const values = slot.cellIds.map((cellId) => displayValue(cellsById.get(cellId), entries));
    return { slot, status: validateEquation(values) };
  });
  const correctCount = slots.filter((result) => result.status === 'correct').length;
  return {
    slots,
    complete: correctCount === slots.length,
    correctCount,
    total: slots.length,
  };
}

export function normalizeMathCrossEntry(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'x' || trimmed === '×') return '*';
  if (trimmed === '÷') return '/';
  if (trimmed === 'sqrt') return '√';
  if (/^-?\d{1,4}$/.test(trimmed)) return String(Number(trimmed));
  if (OPERATORS.includes(trimmed as Operator)) return trimmed;
  return trimmed.slice(0, 4);
}

export function mathCrossDisplayValue(value: string): string {
  if (value === '*') return '×';
  if (value === '/') return '÷';
  return value;
}

export function nextMathCrossHint(
  puzzle: MathCrossPuzzle,
  entries: MathCrossEntries,
): { readonly cellId: string; readonly value: string } | null {
  for (const cellId of puzzle.blankCellIds) {
    const cell = puzzle.cells.find((candidate) => candidate.id === cellId);
    if (cell && normalizeMathCrossEntry(entries[cellId] ?? '') !== cell.solution) {
      return { cellId, value: cell.solution };
    }
  }
  return null;
}

function placeEquations(
  grid: (string | null)[][],
  config: LevelConfig,
  random: () => number,
): readonly PlacedEquation[] {
  const placed: PlacedEquation[] = [];
  const totalAttempts = config.equationCount * 220;
  for (
    let attempt = 0;
    attempt < totalAttempts && placed.length < config.equationCount;
    attempt += 1
  ) {
    const tokens = createEquationTokens(config, random);
    const placement = findPlacement(grid, tokens, placed.length > 0, random);
    if (!placement) continue;
    applyPlacement(grid, tokens, placement);
    placed.push({
      tokens,
      cellIds: tokens.map((_, index) =>
        cellId(
          placement.row + (placement.direction === 'vertical' ? index : 0),
          placement.col + (placement.direction === 'horizontal' ? index : 0),
        ),
      ),
    });
  }

  if (placed.length < Math.max(4, Math.floor(config.equationCount * 0.6))) {
    throw new Error('Could not generate a Math Cross puzzle.');
  }
  return placed;
}

function findPlacement(
  grid: readonly (readonly (string | null)[])[],
  tokens: readonly string[],
  preferCrossing: boolean,
  random: () => number,
): { readonly row: number; readonly col: number; readonly direction: Direction } | null {
  const candidates = shuffle(
    allPlacements(grid.length, tokens.length).filter((placement) =>
      canPlace(grid, tokens, placement),
    ),
    random,
  );
  if (!preferCrossing) return candidates[0] ?? null;
  return (
    candidates.find((placement) => crossesExisting(grid, tokens, placement)) ??
    candidates[0] ??
    null
  );
}

function allPlacements(
  size: number,
  length: number,
): readonly { readonly row: number; readonly col: number; readonly direction: Direction }[] {
  const placements: {
    readonly row: number;
    readonly col: number;
    readonly direction: Direction;
  }[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (col + length <= size) placements.push({ row, col, direction: 'horizontal' });
      if (row + length <= size) placements.push({ row, col, direction: 'vertical' });
    }
  }
  return placements;
}

function canPlace(
  grid: readonly (readonly (string | null)[])[],
  tokens: readonly string[],
  placement: { readonly row: number; readonly col: number; readonly direction: Direction },
): boolean {
  return tokens.every((token, index) => {
    const row = placement.row + (placement.direction === 'vertical' ? index : 0);
    const col = placement.col + (placement.direction === 'horizontal' ? index : 0);
    return grid[row][col] === null || grid[row][col] === token;
  });
}

function crossesExisting(
  grid: readonly (readonly (string | null)[])[],
  tokens: readonly string[],
  placement: { readonly row: number; readonly col: number; readonly direction: Direction },
): boolean {
  return tokens.some((token, index) => {
    const row = placement.row + (placement.direction === 'vertical' ? index : 0);
    const col = placement.col + (placement.direction === 'horizontal' ? index : 0);
    return grid[row][col] === token;
  });
}

function applyPlacement(
  grid: (string | null)[][],
  tokens: readonly string[],
  placement: { readonly row: number; readonly col: number; readonly direction: Direction },
): void {
  tokens.forEach((token, index) => {
    const row = placement.row + (placement.direction === 'vertical' ? index : 0);
    const col = placement.col + (placement.direction === 'horizontal' ? index : 0);
    grid[row][col] = token;
  });
}

function createEquationTokens(config: LevelConfig, random: () => number): readonly string[] {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const expression = createExpression(config, random);
    const value = evaluateExpression(expression);
    if (value !== null && value >= 0 && value <= config.maxNumber * 6) {
      return [...expression, '=', String(value)];
    }
  }
  return ['2', '+', '2', '=', '4'];
}

function createExpression(config: LevelConfig, random: () => number): readonly string[] {
  if (config.roots && random() < 0.24) {
    const root = 2 + Math.floor(random() * 11);
    const base: string[] = ['√', String(root * root)];
    if (!config.tripleTerms || random() < 0.45) return base;
    return [
      ...base,
      randomBinaryOperator(config.operators, random),
      String(randomNumber(config.maxNumber, random)),
    ];
  }

  const first = String(randomNumber(config.maxNumber, random));
  const second = String(randomNumber(config.maxNumber, random));
  const left: string[] = [first, randomBinaryOperator(config.operators, random), second];
  if (!config.tripleTerms || random() < 0.48) return left;
  return [
    ...left,
    randomBinaryOperator(config.operators, random),
    String(randomNumber(config.maxNumber, random)),
  ];
}

function validateEquation(values: readonly string[]): MathCrossSlotStatus {
  if (values.some((value) => value === '')) return 'incomplete';
  const equalsIndex = values.indexOf('=');
  if (equalsIndex < 1 || equalsIndex !== values.length - 2) return 'incorrect';
  const left = evaluateExpression(values.slice(0, equalsIndex));
  const right = Number(values[equalsIndex + 1]);
  return left !== null && Number.isInteger(right) && left === right ? 'correct' : 'incorrect';
}

function evaluateExpression(tokens: readonly string[]): number | null {
  let index = 0;

  function parseExpression(): number | null {
    let value = parseTerm();
    while (value !== null && (tokens[index] === '+' || tokens[index] === '-')) {
      const operator = tokens[index] as '+' | '-';
      index += 1;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number | null {
    let value = parsePower();
    while (value !== null && (tokens[index] === '*' || tokens[index] === '/')) {
      const operator = tokens[index] as '*' | '/';
      index += 1;
      const right = parsePower();
      if (right === null) return null;
      if (operator === '/') {
        if (right === 0 || value % right !== 0) return null;
        value /= right;
      } else {
        value *= right;
      }
    }
    return value;
  }

  function parsePower(): number | null {
    let value = parseFactor();
    while (value !== null && tokens[index] === '^') {
      index += 1;
      const right = parseFactor();
      if (right === null || right < 0 || right > 4) return null;
      value = value ** right;
    }
    return value;
  }

  function parseFactor(): number | null {
    if (tokens[index] === '√') {
      index += 1;
      const value = parseFactor();
      if (value === null || value < 0) return null;
      const root = Math.sqrt(value);
      return Number.isInteger(root) ? root : null;
    }
    const value = Number(tokens[index]);
    if (!Number.isInteger(value)) return null;
    index += 1;
    return value;
  }

  const value = parseExpression();
  return value !== null && index === tokens.length && Number.isInteger(value) ? value : null;
}

function displayValue(cell: MathCrossCell | undefined, entries: MathCrossEntries): string {
  if (!cell || cell.kind === 'block') return '';
  return cell.editable ? normalizeMathCrossEntry(entries[cell.id] ?? '') : cell.solution;
}

function cellsFromGrid(grid: readonly (readonly (string | null)[])[]): readonly MathCrossCell[] {
  return grid.flatMap((row, rowIndex) =>
    row.map((value, colIndex) => {
      const solution = value ?? '';
      return {
        id: cellId(rowIndex, colIndex),
        row: rowIndex,
        col: colIndex,
        kind: value === null ? 'block' : cellKind(solution),
        solution,
        editable: false,
      };
    }),
  );
}

function cellKind(value: string): MathCrossCellKind {
  if (value === '=') return 'equals';
  if (OPERATORS.includes(value as Operator)) return 'operator';
  return 'number';
}

function chooseBlankCells(
  cells: readonly MathCrossCell[],
  equations: readonly PlacedEquation[],
  ratio: number,
  random: () => number,
): Set<string> {
  const usedIds = new Set(equations.flatMap((equation) => equation.cellIds));
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));
  const candidates = shuffle(
    cells.filter(
      (cell) => usedIds.has(cell.id) && (cell.kind === 'number' || cell.kind === 'operator'),
    ),
    random,
  );
  const count = Math.max(4, Math.round(candidates.length * ratio));
  const chosen = new Set<string>();

  for (const equation of equations) {
    const blankableIds = shuffle(
      equation.cellIds.filter((cellId) => {
        const cell = cellsById.get(cellId);
        return cell?.kind === 'number' || cell?.kind === 'operator';
      }),
      random,
    );
    for (const cellId of blankableIds.slice(0, Math.min(2, blankableIds.length))) {
      chosen.add(cellId);
    }
  }

  const operator = candidates.find((cell) => cell.kind === 'operator');
  const number = candidates.find((cell) => cell.kind === 'number');
  if (operator) chosen.add(operator.id);
  if (number) chosen.add(number.id);
  for (const cell of candidates) {
    if (chosen.size >= count) break;
    chosen.add(cell.id);
  }
  return chosen;
}

function createEmptyGrid(size: number): (string | null)[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

function cellId(row: number, col: number): string {
  return `r${row}c${col}`;
}

function randomNumber(maxNumber: number, random: () => number): number {
  return 1 + Math.floor(random() * maxNumber);
}

function randomBinaryOperator(
  operators: readonly BinaryOperator[],
  random: () => number,
): BinaryOperator {
  return operators[Math.floor(random() * operators.length)];
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
