import { Component, computed, signal } from '@angular/core';
import { GameFrameComponent } from '../../shared/game-frame/game-frame.component';
import {
  generateMathCrossPuzzle,
  mathCrossDisplayValue,
  nextMathCrossHint,
  normalizeMathCrossEntry,
  validateMathCrossPuzzle,
  type MathCrossCell,
  type MathCrossEntries,
  type MathCrossLevel,
  type MathCrossSlotStatus,
} from './game/math-cross-game';

@Component({
  selector: 'app-math-cross-page',
  imports: [GameFrameComponent],
  templateUrl: './math-cross-page.component.html',
  styleUrl: './math-cross-page.component.scss',
})
export class MathCrossPageComponent {
  readonly level = signal<MathCrossLevel>(1);
  readonly puzzle = signal(generateMathCrossPuzzle(1, this.newSeed()));
  readonly entries = signal<MathCrossEntries>({});
  readonly validation = computed(() => validateMathCrossPuzzle(this.puzzle(), this.entries()));
  readonly rows = computed(() => {
    const puzzle = this.puzzle();
    return Array.from({ length: puzzle.size }, (_, row) =>
      puzzle.cells.filter((cell) => cell.row === row),
    );
  });
  readonly levelSummary = computed(() =>
    this.level() < 3
      ? 'Basic addition and subtraction'
      : this.level() < 5
        ? 'Multiplication and division'
        : this.level() < 8
          ? 'Triple-term equations'
          : 'Powers, roots, and larger grids',
  );

  newPuzzle(): void {
    this.puzzle.set(generateMathCrossPuzzle(this.level(), this.newSeed()));
    this.entries.set({});
  }

  setLevel(value: string | number): void {
    const level = Math.min(10, Math.max(1, Number(value))) as MathCrossLevel;
    if (this.level() === level) return;
    this.level.set(level);
    this.newPuzzle();
  }

  updateCell(cell: MathCrossCell, value: string): void {
    if (!cell.editable) return;
    const normalized = normalizeMathCrossEntry(value);
    this.entries.update((entries) => ({ ...entries, [cell.id]: normalized }));
  }

  clearCell(cell: MathCrossCell): void {
    if (!cell.editable) return;
    this.entries.update((entries) => {
      const next = { ...entries };
      delete next[cell.id];
      return next;
    });
  }

  clearPuzzle(): void {
    this.entries.set({});
  }

  revealHint(): void {
    const hint = nextMathCrossHint(this.puzzle(), this.entries());
    if (!hint) return;
    this.entries.update((entries) => ({ ...entries, [hint.cellId]: hint.value }));
  }

  entryFor(cell: MathCrossCell): string {
    return mathCrossDisplayValue(this.entries()[cell.id] ?? '');
  }

  displayValue(cell: MathCrossCell): string {
    return mathCrossDisplayValue(cell.solution);
  }

  cellStatus(cell: MathCrossCell): MathCrossSlotStatus | 'fixed' | 'empty' {
    if (!cell.editable) return cell.kind === 'block' ? 'empty' : 'fixed';
    const entry = normalizeMathCrossEntry(this.entries()[cell.id] ?? '');
    if (!entry) return 'incomplete';
    return entry === cell.solution ? 'correct' : 'incorrect';
  }

  private newSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
