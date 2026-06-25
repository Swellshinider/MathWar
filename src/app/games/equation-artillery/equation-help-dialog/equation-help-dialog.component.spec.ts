import { TestBed } from '@angular/core/testing';
import {
  CONSTANT_REFERENCES,
  FUNCTION_REFERENCES,
  OPERATOR_REFERENCES,
} from '../game/expression-catalog';
import { EquationHelpDialogComponent } from './equation-help-dialog.component';

describe('EquationHelpDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquationHelpDialogComponent],
    }).compileComponents();
  });

  it('renders help sections in the expected order', () => {
    const fixture = TestBed.createComponent(EquationHelpDialogComponent);
    fixture.detectChanges();
    const headings = [...fixture.nativeElement.querySelectorAll('h3 strong')].map((heading) =>
      heading.textContent.trim(),
    );

    expect(fixture.nativeElement.textContent).toContain('Equation help');
    expect(headings).toEqual([
      'How to play',
      'Constants and operators',
      'Trigonometric functions',
      'Numeric functions',
    ]);
  });

  it('renders how to play and syntax guidance by default', () => {
    const fixture = TestBed.createComponent(EquationHelpDialogComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('same trajectory as the function graph');
    expect(text).toContain('y = f(x) + c');
    expect(text).toContain('2x + 3');
    CONSTANT_REFERENCES.forEach((reference) => expect(text).toContain(reference.syntax));
    OPERATOR_REFERENCES.forEach((reference) => expect(text).toContain(reference.syntax));
  });

  it('renders every function reference when function sections are expanded', () => {
    const fixture = TestBed.createComponent(EquationHelpDialogComponent);
    fixture.detectChanges();

    fixture.componentInstance.toggleSection('trigonometry');
    fixture.componentInstance.toggleSection('numeric');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Trigonometric functions');
    expect(text).toContain('Numeric functions');
    FUNCTION_REFERENCES.forEach((reference) => expect(text).toContain(reference.syntax));
  });

  it('filters references by search query', () => {
    const fixture = TestBed.createComponent(EquationHelpDialogComponent);
    fixture.detectChanges();

    fixture.componentInstance.setSearchQuery('base-10');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Numeric functions');
    expect(text).toContain('log10(x)');
    expect(text).not.toContain('sin(x)');
  });

  it('shows an empty state when search has no matches', () => {
    const fixture = TestBed.createComponent(EquationHelpDialogComponent);
    fixture.detectChanges();

    fixture.componentInstance.setSearchQuery('no matching function');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('No matching references.');
    expect(text).not.toContain('How to play');
  });

  it('opens and closes the native modal', () => {
    const fixture = TestBed.createComponent(EquationHelpDialogComponent);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const showModal = vi.fn();
    const close = vi.fn();
    dialog.showModal = showModal;
    dialog.close = close;

    fixture.componentInstance.open();
    fixture.componentInstance.close();

    expect(showModal).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
