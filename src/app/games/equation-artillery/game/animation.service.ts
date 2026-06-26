import { Injectable, OnDestroy } from '@angular/core';

@Injectable()
export class AnimationService implements OnDestroy {
  private frameId: number | null = null;

  startTimeline(render: (progress: number) => boolean, durationMs = 3000): void {
    this.cancel();
    let startTime: number | null = null;
    const frame = (time: number): void => {
      startTime ??= time;
      const progress = Math.min((time - startTime) / durationMs, 1);
      if (!render(progress) || progress >= 1) {
        this.frameId = null;
        return;
      }
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
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
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  ngOnDestroy(): void {
    this.cancel();
  }
}
