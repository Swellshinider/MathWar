import { TestBed } from '@angular/core/testing';
import { MathCrossHelpDialogComponent } from './math-cross-help-dialog.component';

describe('MathCrossHelpDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MathCrossHelpDialogComponent],
    }).compileComponents();
  });

  it('renders the how-to-play, color, and operation sections', () => {
    const fixture = TestBed.createComponent(MathCrossHelpDialogComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('dialog')).not.toBeNull();
    expect(root.textContent).toContain('How to play Math Cross');
    expect(root.textContent).toContain('Cell colors');
    expect(root.textContent).toContain('Operations and aliases');
    expect(root.querySelectorAll('.math-cross-help__swatch').length).toBe(5);
    expect(root.textContent).toContain('Multiplication. Type *, x, or ×.');
  });

  it('opens and closes the dialog element', () => {
    const fixture = TestBed.createComponent(MathCrossHelpDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

    component.open();
    expect(dialog.open).toBe(true);

    component.close();
    expect(dialog.open).toBe(false);
  });
});
