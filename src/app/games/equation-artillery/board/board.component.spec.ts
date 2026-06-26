import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Point } from '../models/point';
import { BoardComponent } from './board.component';

@Component({
  imports: [BoardComponent],
  template: `
    <app-board
      [player]="player"
      [targets]="[]"
      [walls]="[]"
      [movementEnabled]="movementEnabled()"
      (move)="lastMove = $event"
    >
      <button boardActions type="button" aria-label="Open help">?</button>
    </app-board>
  `,
})
class BoardHostComponent {
  readonly player = { position: { x: 0, y: 0 }, radius: 0.3 };
  readonly movementEnabled = signal(false);
  lastMove: Point | null = null;
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

  it('emits a board coordinate from pointer movement when movement is enabled', () => {
    const fixture = TestBed.createComponent(BoardHostComponent);
    const host = fixture.componentInstance;
    host.movementEnabled.set(true);
    fixture.detectChanges();

    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 200 });
    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 320,
      height: 200,
      right: 320,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 160,
        clientY: 100,
        bubbles: true,
      }),
    );

    expect(host.lastMove).toEqual({ x: 0, y: 0 });
  });

  it('does not emit board movement when movement is disabled', () => {
    const fixture = TestBed.createComponent(BoardHostComponent);
    fixture.detectChanges();

    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 200 });
    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 320,
      height: 200,
      right: 320,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 160,
        clientY: 100,
        bubbles: true,
      }),
    );

    expect(fixture.componentInstance.lastMove).toBeNull();
  });
});
