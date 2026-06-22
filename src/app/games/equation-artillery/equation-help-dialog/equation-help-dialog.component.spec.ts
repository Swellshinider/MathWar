import { TestBed } from '@angular/core/testing';
import { FUNCTION_REFERENCES } from '../game/expression-catalog';
import { EquationHelpDialogComponent } from './equation-help-dialog.component';

describe('EquationHelpDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquationHelpDialogComponent],
    }).compileComponents();
  });

  it('renders all equation reference information', () => {
    const fixture = TestBed.createComponent(EquationHelpDialogComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Equation help');
    expect(text).toContain('Trigonometry');
    expect(text).toContain('Numbers and logs');
    expect(text).toContain('Constants');
    expect(text).toContain('Operators');
    FUNCTION_REFERENCES.forEach((reference) => expect(text).toContain(reference.syntax));
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
