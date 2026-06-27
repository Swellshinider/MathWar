import { Injectable, OnDestroy } from '@angular/core';

@Injectable()
export class AnimationService implements OnDestroy {
  private frameId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private timelineTick: (() => void) | null = null;
  private listeningForPageState = false;
  private windowFocused = true;

  startTimeline(render: (progress: number) => boolean, durationMs = 3000): void {
    this.cancel();
    const startTime = performance.now();
    const tick = (): void => {
      const progress = Math.min((performance.now() - startTime) / durationMs, 1);
      if (!render(progress) || progress >= 1) {
        this.clearScheduled();
        this.timelineTick = null;
        this.stopPageStateListeners();
        return;
      }
      this.scheduleTimelineTick();
    };
    this.timelineTick = tick;
    this.windowFocused =
      typeof document === 'undefined' || typeof document.hasFocus !== 'function'
        ? true
        : document.hasFocus();
    this.startPageStateListeners();
    this.scheduleTimelineTick();
  }

  start(advance: (distance: number) => boolean, speed = 5, substep = 0.08): void {
    this.cancel();
    let previousTime: number | null = null;
    let accumulatedDistance = 0;
    const frame = (time: number): void => {
      if (previousTime !== null) {
        const elapsedSeconds = Math.min((time - previousTime) / 1000, 0.1);
        accumulatedDistance += elapsedSeconds * speed;
        while (accumulatedDistance >= substep) {
          accumulatedDistance -= substep;
          if (!advance(substep)) {
            this.frameId = null;
            return;
          }
        }
      }
      previousTime = time;
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  cancel(): void {
    this.clearScheduled();
    this.timelineTick = null;
    this.stopPageStateListeners();
  }

  ngOnDestroy(): void {
    this.cancel();
  }

  private scheduleTimelineTick(): void {
    if (!this.timelineTick) return;
    this.clearScheduled();
    if (
      (typeof document !== 'undefined' && document.visibilityState === 'hidden') ||
      !this.windowFocused
    ) {
      this.timeoutId = setTimeout(() => this.timelineTick?.(), 50);
      return;
    }
    this.frameId = requestAnimationFrame(() => this.timelineTick?.());
  }

  private clearScheduled(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    this.frameId = null;
    this.timeoutId = null;
  }

  private startPageStateListeners(): void {
    if (
      this.listeningForPageState ||
      typeof document === 'undefined' ||
      typeof window === 'undefined'
    ) {
      return;
    }
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);
    this.listeningForPageState = true;
  }

  private stopPageStateListeners(): void {
    if (
      !this.listeningForPageState ||
      typeof document === 'undefined' ||
      typeof window === 'undefined'
    ) {
      return;
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('focus', this.handleWindowFocus);
    this.listeningForPageState = false;
  }

  private readonly handleVisibilityChange = (): void => this.scheduleTimelineTick();

  private readonly handleWindowBlur = (): void => {
    this.windowFocused = false;
    this.scheduleTimelineTick();
  };

  private readonly handleWindowFocus = (): void => {
    this.windowFocused = true;
    this.scheduleTimelineTick();
  };
}
