import { TestBed } from '@angular/core/testing';
import { MathCrossPageComponent } from './math-cross-page.component';

describe('MathCrossPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MathCrossPageComponent],
    }).compileComponents();
  });

  it('renders the puzzle board and controls', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Math Cross');
    expect(root.textContent).toContain('Single Player');
    expect(root.textContent).toContain('New puzzle');
    expect(root.querySelector('.mode-tab--active')?.textContent?.trim()).toBe('Single Player');
    expect(root.querySelector('.difficulty-control input[type="range"]')).not.toBeNull();
    expect(root.textContent).not.toContain('Basic addition and subtraction');
    expect(root.querySelectorAll('.math-cross__cell--blank').length).toBeGreaterThan(0);
    expect(root.querySelector('app-game-frame article')?.classList).toContain(
      'game-frame--focused',
    );
  });

  it('leaves play focus when the puzzle is complete', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.completionMessage.set('Solved.');
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-game-frame article')?.classList,
    ).not.toContain('game-frame--focused');
  });

  it('renders hint and help as floating board actions with tooltips', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const actions = (fixture.nativeElement as HTMLElement).querySelector(
      '.math-cross__board-actions',
    );

    expect(actions).not.toBeNull();
    expect(actions?.querySelectorAll('.board-action').length).toBe(2);
    expect(actions?.querySelectorAll('.board-action__tooltip').length).toBe(2);
    expect(actions?.querySelector('.math-cross__hint-badge')?.textContent?.trim()).toBe(
      String(component.hintsRemaining()),
    );
  });

  it('creates a larger puzzle when the level changes', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const firstPuzzle = component.puzzle();

    component.setLevel(10);
    fixture.detectChanges();

    expect(component.puzzle()).not.toEqual(firstPuzzle);
    expect(component.puzzle().level).toBe(10);
    expect(component.puzzle().size).toBe(11);
    expect(
      fixture.nativeElement.querySelector('.difficulty-control output')?.textContent?.trim(),
    ).toBe('10');
  });

  it('keeps exact single-cell guesses neutral while related equations are incomplete', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const cellId = component.puzzle().blankCellIds[0];
    const cell = component.puzzle().cells.find((candidate) => candidate.id === cellId)!;

    component.updateCell(cell, cell.solution);
    fixture.detectChanges();

    const element = fixture.nativeElement.querySelector(
      `.math-cross__cell--blank input[aria-label="Blank cell row ${cell.row + 1} column ${
        cell.col + 1
      }"]`,
    )?.parentElement as HTMLElement;
    expect(element.getAttribute('data-status')).toBe('incomplete');
  });

  it('uses complete equation feedback instead of direct solution matching', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const entries = Object.fromEntries(
      component
        .puzzle()
        .blankCellIds.map((cellId) => [
          cellId,
          component.puzzle().cells.find((cell) => cell.id === cellId)?.solution ?? '',
        ]),
    );
    const wrongCellId = component.puzzle().blankCellIds[0];
    const wrongCell = component.puzzle().cells.find((cell) => cell.id === wrongCellId)!;

    component.entries.set({ ...entries, [wrongCellId]: '999' });
    fixture.detectChanges();

    expect(component.cellStatus(wrongCell)).toBe('incorrect');
  });

  it('reveals one hint at a time', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const firstBlank = component.puzzle().blankCellIds[0];

    component.revealHint();

    expect(component.entries()[firstBlank]).toBe(
      component.puzzle().cells.find((cell) => cell.id === firstBlank)?.solution,
    );
  });

  it('limits hints to three per puzzle', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.hintsRemaining()).toBe(3);
    for (let index = 0; index < 3; index += 1) {
      expect(component.revealHint()).toBe(true);
    }
    expect(component.hintsRemaining()).toBe(0);
    expect(component.canRequestHint()).toBe(false);

    const entriesBefore = { ...component.entries() };
    expect(component.revealHint()).toBe(false);
    expect(component.entries()).toEqual(entriesBefore);
  });

  it('refills hints when a new puzzle starts but not when clearing', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.revealHint();
    component.revealHint();
    expect(component.hintsRemaining()).toBe(1);

    component.clearPuzzle();
    expect(component.hintsRemaining()).toBe(1);

    component.newPuzzle();
    fixture.detectChanges();
    expect(component.hintsRemaining()).toBe(3);
  });

  it('reveals a hint on the H key and ignores modified H', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.handleHintKey(new KeyboardEvent('keydown', { key: 'h' }));
    expect(component.hintsRemaining()).toBe(2);

    component.handleHintKey(new KeyboardEvent('keydown', { key: 'H', ctrlKey: true }));
    expect(component.hintsRemaining()).toBe(2);
  });

  it('clears player entries', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.revealHint();
    expect(Object.keys(component.entries())).toHaveLength(1);

    component.clearPuzzle();

    expect(component.entries()).toEqual({});
  });

  it('reports completion when every blank is solved', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const entries = Object.fromEntries(
      component
        .puzzle()
        .blankCellIds.map((cellId) => [
          cellId,
          component.puzzle().cells.find((cell) => cell.id === cellId)?.solution ?? '',
        ]),
    );

    component.entries.set(entries);
    fixture.detectChanges();
    const blanks = fixture.nativeElement.querySelectorAll(
      '.math-cross__cell--blank',
    ) as NodeListOf<HTMLElement>;

    expect(component.validation().complete).toBe(true);
    expect(
      Array.from(blanks).every((element) => element.getAttribute('data-status') === 'correct'),
    ).toBe(true);
  });

  it('opens a randomized completion dialog when the puzzle is solved', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    solvePuzzle(component);
    fixture.detectChanges();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector(
      'dialog.completion-dialog',
    ) as HTMLDialogElement;
    const message = component.completionMessage();

    expect(component.completionMessages).toHaveLength(10);
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Puzzle complete');
    expect(message).not.toBeNull();
    expect(component.completionMessages).toContain(message!);
    expect(dialog.textContent).toContain(message!);
  });

  it('closes the completion dialog with OK', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    solvePuzzle(component);
    fixture.detectChanges();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog.completion-dialog') as HTMLDialogElement;
    root.querySelector<HTMLButtonElement>('dialog.completion-dialog .btn')?.click();
    fixture.detectChanges();

    expect(component.completionDialogDismissed()).toBe(true);
    expect(dialog.open).toBe(false);
  });

  it('resets the completion dialog when a new puzzle starts', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    solvePuzzle(component);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(component.completionMessage()).not.toBeNull();

    component.newPuzzle();
    fixture.detectChanges();

    expect(component.completionMessage()).toBeNull();
    expect(component.completionDialogDismissed()).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>(
        'dialog.completion-dialog',
      )?.open,
    ).toBe(false);
  });

  it('derives one run rail per equation slot with correct geometry', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const puzzle = component.puzzle();
    const rails = component.runRails();

    expect(rails.length).toBe(puzzle.slots.length);
    for (const rail of rails) {
      const slot = puzzle.slots.find((candidate) => candidate.id === rail.slotId)!;
      const cells = slot.cellIds.map((id) => puzzle.cells.find((cell) => cell.id === id)!);
      const expectedDirection =
        new Set(cells.map((cell) => cell.row)).size === 1 ? 'horizontal' : 'vertical';

      expect(rail.span).toBe(slot.cellIds.length);
      expect(rail.direction).toBe(expectedDirection);
      expect(rail.row).toBe(Math.min(...cells.map((cell) => cell.row)));
      expect(rail.col).toBe(Math.min(...cells.map((cell) => cell.col)));
    }
  });

  it('highlights the equation run of the active cell and clears it', () => {
    const fixture = TestBed.createComponent(MathCrossPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const blank = component
      .puzzle()
      .cells.find((cell) => cell.id === component.puzzle().blankCellIds[0])!;

    expect(component.activeSlotIds().size).toBe(0);

    component.activateCell(blank);
    expect(component.activeSlotIds().size).toBeGreaterThan(0);
    expect(component.isCellInActiveRun(blank)).toBe(true);

    component.deactivateCell();
    expect(component.activeSlotIds().size).toBe(0);
    expect(component.isCellInActiveRun(blank)).toBe(false);
  });
});

function solutionEntries(component: MathCrossPageComponent) {
  return Object.fromEntries(
    component
      .puzzle()
      .blankCellIds.map((cellId) => [
        cellId,
        component.puzzle().cells.find((cell) => cell.id === cellId)?.solution ?? '',
      ]),
  );
}

function solvePuzzle(component: MathCrossPageComponent): void {
  for (const cellId of component.puzzle().blankCellIds) {
    const cell = component.puzzle().cells.find((candidate) => candidate.id === cellId);
    if (cell) component.updateCell(cell, cell.solution);
  }
}
