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

    expect(fixture.nativeElement.textContent).toContain('Math Cross');
    expect(fixture.nativeElement.textContent).toContain('New puzzle');
    expect(
      fixture.nativeElement.querySelectorAll('.math-cross__cell--blank').length,
    ).toBeGreaterThan(0);
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
    expect(fixture.nativeElement.textContent).toContain('Level 10');
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
});
