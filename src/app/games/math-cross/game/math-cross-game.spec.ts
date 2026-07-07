import {
  generateMathCrossPuzzle,
  mathCrossDisplayValue,
  nextMathCrossHint,
  normalizeMathCrossEntry,
  validateMathCrossPuzzle,
  type MathCrossEntries,
  type MathCrossPuzzle,
} from './math-cross-game';

describe('Math Cross game logic', () => {
  it('generates deterministic puzzles for the same seed and level', () => {
    const first = generateMathCrossPuzzle(6, 'daily-seed');
    const second = generateMathCrossPuzzle(6, 'daily-seed');

    expect(second).toEqual(first);
  });

  it('generates solved puzzles with valid equations across the level range', () => {
    for (const level of [1, 4, 7, 10] as const) {
      const puzzle = generateMathCrossPuzzle(level, `seed-${level}`);
      const result = validateMathCrossPuzzle(puzzle, solutionEntries(puzzle));

      expect(result.complete).toBe(true);
      expect(result.correctCount).toBe(result.total);
      expect(puzzle.level).toBe(level);
      expect(puzzle.blankCellIds.length).toBeGreaterThan(0);
      expect(puzzle.blankCellIds.some((cellId) => cell(puzzle, cellId).kind === 'blank')).toBe(
        true,
      );
    }
  });

  it('scales the grid and leaves empty blocks on harder levels', () => {
    const low = generateMathCrossPuzzle(1, 'scale');
    const high = generateMathCrossPuzzle(10, 'scale');

    expect(low.size).toBe(5);
    expect(high.size).toBe(11);
    expect(high.slots.length).toBeGreaterThan(low.slots.length);
    expect(high.cells.some((cell) => cell.kind === 'block')).toBe(true);
  });

  it('generates connected puzzles with at least four slots across levels', () => {
    for (const level of [1, 4, 7, 10] as const) {
      for (let seed = 0; seed < 12; seed += 1) {
        const puzzle = generateMathCrossPuzzle(level, `connect-${level}-${seed}`);

        expect(puzzle.slots.length).toBeGreaterThanOrEqual(4);
        expect(slotGraphIsConnected(puzzle)).toBe(true);
      }
    }
  });

  it('masks both number and operator cells', () => {
    const puzzle = generateMathCrossPuzzle(10, 'mixed-blanks');
    const blanks = puzzle.blankCellIds.map((cellId) => cell(puzzle, cellId).solution);

    expect(blanks.some((value) => /^-?\d+$/.test(value))).toBe(true);
    expect(blanks.some((value) => ['+', '-', '*', '/', '^', '√'].includes(value))).toBe(true);
  });

  it('gives each equation at least two editable blanks when possible', () => {
    for (const level of [1, 4, 7, 10] as const) {
      const puzzle = generateMathCrossPuzzle(level, `multi-blank-${level}`);
      const blankIds = new Set(puzzle.blankCellIds);

      for (const slot of puzzle.slots) {
        const blankableCount = slot.cellIds.filter((cellId) =>
          ['number', 'operator'].includes(cell(puzzle, cellId).kind),
        ).length;
        const slotBlankCount = slot.cellIds.filter((cellId) => blankIds.has(cellId)).length;

        expect(slotBlankCount).toBeGreaterThanOrEqual(Math.min(2, blankableCount));
      }
    }
  });

  it('can generate advanced roots or powers at high levels', () => {
    const values = Array.from({ length: 12 }, (_, index) =>
      generateMathCrossPuzzle(10, `advanced-${index}`),
    ).flatMap((puzzle) => puzzle.cells.map((cell) => cell.solution));

    expect(values.some((value) => value === '√' || value === '^')).toBe(true);
  });

  it('marks incomplete, wrong, and solved entries correctly', () => {
    const puzzle = generateMathCrossPuzzle(1, 'validation');

    expect(validateMathCrossPuzzle(puzzle, {}).complete).toBe(false);
    expect(
      validateMathCrossPuzzle(puzzle, {}).slots.some((slot) => slot.status === 'incomplete'),
    ).toBe(true);

    const wrongEntries = { ...solutionEntries(puzzle), [puzzle.blankCellIds[0]]: '999' };
    expect(validateMathCrossPuzzle(puzzle, wrongEntries).complete).toBe(false);
    expect(
      validateMathCrossPuzzle(puzzle, wrongEntries).slots.some(
        (slot) => slot.status === 'incorrect',
      ),
    ).toBe(true);

    expect(validateMathCrossPuzzle(puzzle, solutionEntries(puzzle)).complete).toBe(true);
  });

  it('normalizes entry aliases and display values', () => {
    expect(normalizeMathCrossEntry(' × ')).toBe('*');
    expect(normalizeMathCrossEntry('x')).toBe('*');
    expect(normalizeMathCrossEntry('÷')).toBe('/');
    expect(normalizeMathCrossEntry('sqrt')).toBe('√');
    expect(normalizeMathCrossEntry('007')).toBe('7');
    expect(mathCrossDisplayValue('*')).toBe('×');
    expect(mathCrossDisplayValue('/')).toBe('÷');
  });

  it('returns the next unsolved blank as a hint', () => {
    const puzzle = generateMathCrossPuzzle(1, 'hint');
    const hint = nextMathCrossHint(puzzle, {});

    expect(hint).toEqual({
      cellId: puzzle.blankCellIds[0],
      value: cell(puzzle, puzzle.blankCellIds[0]).solution,
    });

    expect(nextMathCrossHint(puzzle, solutionEntries(puzzle))).toBeNull();
  });
});

function solutionEntries(puzzle: MathCrossPuzzle): MathCrossEntries {
  return Object.fromEntries(
    puzzle.blankCellIds.map((cellId) => [cellId, cell(puzzle, cellId).solution]),
  );
}

function cell(puzzle: MathCrossPuzzle, cellId: string) {
  const found = puzzle.cells.find((candidate) => candidate.id === cellId);
  if (!found) throw new Error(`Missing cell ${cellId}`);
  return found;
}

function slotGraphIsConnected(puzzle: MathCrossPuzzle): boolean {
  const slots = puzzle.slots.map((slot) => [...slot.cellIds]);
  if (slots.length <= 1) return true;
  const adjacency = slots.map(() => new Set<number>());
  for (let a = 0; a < slots.length; a += 1) {
    const cells = new Set(slots[a]);
    for (let b = a + 1; b < slots.length; b += 1) {
      if (slots[b].some((cellId) => cells.has(cellId))) {
        adjacency[a].add(b);
        adjacency[b].add(a);
      }
    }
  }
  const visited = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) {
    const node = stack.pop()!;
    adjacency[node].forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        stack.push(neighbor);
      }
    });
  }
  return visited.size === slots.length;
}
