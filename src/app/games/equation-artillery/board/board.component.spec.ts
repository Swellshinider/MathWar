import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BoardComponent } from './board.component';

@Component({
  imports: [BoardComponent],
  template: `
    <app-board [player]="player" [targets]="[]" [walls]="[]">
      <button boardActions type="button" aria-label="Open help">?</button>
    </app-board>
  `,
})
class BoardHostComponent {
  readonly player = { position: { x: 0, y: 0 }, radius: 0.3 };
}

describe('BoardComponent', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);

    await TestBed.configureTestingModule({
      imports: [BoardHostComponent],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('projects board actions into an overlay above the canvas', () => {
    const fixture = TestBed.createComponent(BoardHostComponent);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.board-actions');
    const action = overlay?.querySelector('button[boardActions]');

    expect(overlay).not.toBeNull();
    expect(action?.getAttribute('aria-label')).toBe('Open help');
  });
});
