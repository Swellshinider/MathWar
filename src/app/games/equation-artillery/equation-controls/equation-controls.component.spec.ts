import { TestBed } from '@angular/core/testing';
import { EquationControlsComponent } from './equation-controls.component';

describe('EquationControlsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquationControlsComponent],
    }).compileComponents();
  });

  it('submits the equation without allowing native navigation', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    const emitted = vi.fn();
    fixture.componentInstance.fire.subscribe(emitted);
    fixture.detectChanges();
    fixture.componentInstance.equationControl.setValue('sin(x)');
    fixture.detectChanges();
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    const allowed = fixture.nativeElement.querySelector('form').dispatchEvent(event);
    expect(emitted).toHaveBeenCalledWith('sin(x)');
    expect(allowed).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('disables Fire during a shot and exposes status and errors', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    fixture.componentRef.setInput('active', true);
    fixture.componentRef.setInput('status', 'Shot in flight.');
    fixture.componentRef.setInput('error', 'Invalid value.');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Shot in flight.');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Invalid value.',
    );
  });

  it('shows New Round only after completion', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    fixture.componentRef.setInput('roundComplete', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('New Round');
  });

  it('updates the separate shape preview as the equation changes', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    fixture.detectChanges();
    const initialPath = fixture.nativeElement
      .querySelector('app-function-preview path')
      .getAttribute('d');

    fixture.componentInstance.equationControl.setValue('x^2');
    fixture.detectChanges();

    const updatedPath = fixture.nativeElement
      .querySelector('app-function-preview path')
      .getAttribute('d');
    const preview = fixture.nativeElement.querySelector('app-function-preview');
    expect(updatedPath).not.toBe(initialPath);
    expect(fixture.nativeElement.querySelector('.controls-layout').firstElementChild).toBe(preview);
    expect(preview.querySelector('svg')).not.toBeNull();
    expect(preview.querySelectorAll('line, text, circle, rect')).toHaveLength(0);
    expect(preview.textContent).not.toContain('Position and scale hidden');
  });

  it('can hide the separate function preview for canvas-based previews', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    fixture.componentRef.setInput('showPreview', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-function-preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('.control-content')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.controls-layout').classList).toContain(
      'controls-layout--full',
    );
  });

  it('explains that the shape preview is visually stretched', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'app-function-preview .info-button',
    ) as HTMLButtonElement;
    const note = fixture.nativeElement.querySelector('#function-preview-note') as HTMLElement;

    expect(button.textContent?.trim()).toBe('?');
    expect(button.getAttribute('aria-label')).toBe('About the function shape preview');
    expect(button.getAttribute('aria-describedby')).toBe('function-preview-note');
    expect(note.getAttribute('role')).toBe('tooltip');
    expect(note.textContent).toContain('Preview is stretched to show the function shape clearly.');
    expect(note.textContent).toContain('Shots still start at the player');
  });

  it('clears the preview for an incomplete expression', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    fixture.componentInstance.equationControl.setValue('x+(');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-function-preview svg')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Complete the function');
  });

  it('loads a selected history equation into the form and preview', () => {
    const fixture = TestBed.createComponent(EquationControlsComponent);
    fixture.detectChanges();
    const initialPath = fixture.nativeElement
      .querySelector('app-function-preview path')
      .getAttribute('d');

    fixture.componentRef.setInput('equation', 'cos(x)');
    fixture.detectChanges();

    expect(fixture.componentInstance.equationControl.value).toBe('cos(x)');
    expect(
      fixture.nativeElement.querySelector('app-function-preview path').getAttribute('d'),
    ).not.toBe(initialPath);
  });
});
