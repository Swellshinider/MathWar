import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { FocusModeService } from './focus-mode.service';

@Component({
  selector: 'app-game-frame',
  templateUrl: './game-frame.component.html',
  styleUrl: './game-frame.component.scss',
})
export class GameFrameComponent implements OnDestroy {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly objective = input.required<string>();
  protected readonly focusMode = inject(FocusModeService);
  private readonly enterButton = viewChild<ElementRef<HTMLButtonElement>>('enterButton');
  private readonly exitButton = viewChild<ElementRef<HTMLButtonElement>>('exitButton');
  private restoreFocusOnExit = false;

  constructor() {
    effect(() => {
      const active = this.focusMode.active();
      const enterButton = this.enterButton();
      const exitButton = this.exitButton();
      if (active && exitButton) {
        queueMicrotask(() => exitButton.nativeElement.focus());
      } else if (!active && this.restoreFocusOnExit && enterButton) {
        this.restoreFocusOnExit = false;
        queueMicrotask(() => enterButton.nativeElement.focus());
      }
    });
  }

  enterFocus(): void {
    this.restoreFocusOnExit = true;
    this.focusMode.enter();
  }

  exitFocus(): void {
    if (this.focusMode.active()) this.focusMode.exit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: Event): void {
    if (!this.focusMode.active()) return;
    event.preventDefault();
    this.exitFocus();
  }

  ngOnDestroy(): void {
    this.restoreFocusOnExit = false;
    this.focusMode.exit();
  }
}
