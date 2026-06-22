import { TestBed } from '@angular/core/testing';
import { EquationHistoryComponent } from './equation-history.component';

describe('EquationHistoryComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquationHistoryComponent],
    }).compileComponents();
  });

  it('shows an empty state before the player fires', () => {
    const fixture = TestBed.createComponent(EquationHistoryComponent);
    fixture.componentRef.setInput('equations', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Fired equations will appear here.');
    expect(fixture.nativeElement.querySelector('[role="log"]')).toBeNull();
  });

  it('keeps duplicate equations in order and emits a selection', () => {
    const fixture = TestBed.createComponent(EquationHistoryComponent);
    const selected = vi.fn();
    fixture.componentInstance.selectEquation.subscribe(selected);
    fixture.componentRef.setInput('equations', ['sin(x)', 'x^2', 'sin(x)']);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('li button');
    expect(buttons).toHaveLength(3);
    expect(
      Array.from(buttons).map((button) => (button as HTMLElement).textContent?.trim()),
    ).toEqual(['f(x) = sin(x)', 'f(x) = x^2', 'f(x) = sin(x)']);

    buttons[1].click();
    expect(selected).toHaveBeenCalledWith('x^2');
  });
});
