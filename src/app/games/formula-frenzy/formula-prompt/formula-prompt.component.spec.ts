import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormulaPromptComponent, renderFormulaPrompt } from './formula-prompt.component';

describe('FormulaPromptComponent', () => {
  let fixture: ComponentFixture<FormulaPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormulaPromptComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FormulaPromptComponent);
  });

  it('renders division prompts as stacked fractions', () => {
    fixture.componentRef.setInput('prompt', '10 / 2');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.formula-fraction__numerator')?.textContent?.trim()).toBe('10');
    expect(root.querySelector('.formula-fraction__denominator')?.textContent?.trim()).toBe('2');
    expect(root.querySelector('.formula-prompt')?.getAttribute('aria-label')).toBe('10 / 2');
  });

  it('renders multiplication with the multiplication sign', () => {
    fixture.componentRef.setInput('prompt', '2 * 3');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('×');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('*');
  });

  it('keeps compound operators around fractions', () => {
    expect(renderFormulaPrompt('10 / 2 + 4')).toEqual([
      { kind: 'fraction', numerator: '10', denominator: '2' },
      { kind: 'operator', value: '+', multiply: false },
      { kind: 'text', value: '4' },
    ]);
  });
});
