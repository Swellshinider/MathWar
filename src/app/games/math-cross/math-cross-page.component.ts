import {
  AfterViewChecked,
  Component,
  ElementRef,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
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

type MathCrossMode = 'single-player';

const COMPLETION_MESSAGES = [
  'Clean solve. Every crossing checks out.',
  'Puzzle complete. The grid balances perfectly.',
  'Nice finish. Every equation is locked in.',
  'Solved. The whole board adds up.',
  'Math Cross cleared. That grid had nowhere left to hide.',
  'Complete. Rows and columns are in agreement.',
  'Well calculated. The board is fully solved.',
  'Finished. Every blank earned its place.',
  'Sharp work. The crossword equations all hold.',
  'Victory. The numbers and operators line up.',
] as const;

@Component({
  selector: 'app-math-cross-page',
  imports: [GameFrameComponent],
  templateUrl: './math-cross-page.component.html',
  styleUrl: './math-cross-page.component.scss',
})
export class MathCrossPageComponent implements AfterViewChecked {
  @ViewChild('completionDialog') private completionDialog?: ElementRef<HTMLDialogElement>;

  readonly completionMessages = COMPLETION_MESSAGES;
  readonly gameMode = signal<MathCrossMode>('single-player');
  readonly level = signal<MathCrossLevel>(1);
  readonly puzzle = signal(generateMathCrossPuzzle(1, this.newSeed()));
  readonly entries = signal<MathCrossEntries>({});
  readonly completionMessage = signal<string | null>(null);
  readonly completionDialogDismissed = signal(false);
  readonly validation = computed(() => validateMathCrossPuzzle(this.puzzle(), this.entries()));
  readonly rows = computed(() => {
    const puzzle = this.puzzle();
    return Array.from({ length: puzzle.size }, (_, row) =>
      puzzle.cells.filter((cell) => cell.row === row),
    );
  });

  ngAfterViewChecked(): void {
    this.syncCompletionDialog();
  }

  selectSinglePlayerMode(): void {
    this.gameMode.set('single-player');
  }

  newPuzzle(): void {
    this.resetCompletionDialog();
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
    this.syncCompletionState();
  }

  clearCell(cell: MathCrossCell): void {
    if (!cell.editable) return;
    this.entries.update((entries) => {
      const next = { ...entries };
      delete next[cell.id];
      return next;
    });
    this.syncCompletionState();
  }

  clearPuzzle(): void {
    this.resetCompletionDialog();
    this.entries.set({});
  }

  revealHint(): void {
    const hint = nextMathCrossHint(this.puzzle(), this.entries());
    if (!hint) return;
    this.entries.update((entries) => ({ ...entries, [hint.cellId]: hint.value }));
    this.syncCompletionState();
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

    const relatedSlots = this.validation().slots.filter((result) =>
      result.slot.cellIds.includes(cell.id),
    );
    if (relatedSlots.some((result) => result.status === 'incomplete')) return 'incomplete';
    return relatedSlots.some((result) => result.status === 'incorrect') ? 'incorrect' : 'correct';
  }

  closeCompletionDialog(): void {
    this.completionDialogDismissed.set(true);
    this.closeCompletionDialogElement();
  }

  private syncCompletionDialog(): void {
    this.syncCompletionState();
    if (!this.validation().complete) return;

    if (this.completionDialogDismissed()) {
      this.closeCompletionDialogElement();
      return;
    }
    this.openCompletionDialogElement();
  }

  private syncCompletionState(): void {
    if (!this.validation().complete) {
      this.resetCompletionDialog();
      return;
    }
    if (!this.completionMessage()) this.completionMessage.set(this.randomCompletionMessage());
    if (!this.completionDialogDismissed()) this.openCompletionDialogElement();
  }

  private openCompletionDialogElement(): void {
    const dialog = this.completionDialog?.nativeElement;
    if (!dialog || dialog.open) return;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      if (!dialog.open) dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
  }

  private resetCompletionDialog(): void {
    this.completionDialogDismissed.set(false);
    this.completionMessage.set(null);
    this.closeCompletionDialogElement();
  }

  private closeCompletionDialogElement(): void {
    const dialog = this.completionDialog?.nativeElement;
    if (!dialog?.open) return;
    dialog.close?.();
    dialog.removeAttribute('open');
  }

  private randomCompletionMessage(): string {
    return COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)];
  }

  private newSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
