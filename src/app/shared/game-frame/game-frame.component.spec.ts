import { TestBed } from '@angular/core/testing';
import { FocusModeService } from './focus-mode.service';
import { GameFrameComponent } from './game-frame.component';

describe('GameFrameComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameFrameComponent],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(GameFrameComponent);
    fixture.componentRef.setInput('eyebrow', 'Functions and graphs');
    fixture.componentRef.setInput('title', 'Equation Artillery');
    fixture.componentRef.setInput('objective', 'Destroy every target.');
    fixture.detectChanges();
    return fixture;
  }

  it('enters focus mode and explains how to leave it', async () => {
    const fixture = createFixture();
    const focusMode = TestBed.inject(FocusModeService);

    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    await Promise.resolve();

    const exitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(focusMode.active()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Press Esc');
    expect(exitButton.textContent).toContain('Exit focus');
    expect(document.activeElement).toBe(exitButton);
  });

  it('exits focus mode with Escape and restores the entry control', async () => {
    const fixture = createFixture();
    const focusMode = TestBed.inject(FocusModeService);
    const enterButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    enterButton.click();
    fixture.detectChanges();
    await Promise.resolve();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    fixture.detectChanges();
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(focusMode.active()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Focus on game');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('button'));
  });

  it('clears focus mode when the game frame is destroyed', () => {
    const fixture = createFixture();
    const focusMode = TestBed.inject(FocusModeService);
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();

    fixture.destroy();

    expect(focusMode.active()).toBe(false);
  });
});
