import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FocusModeService {
  private readonly activeState = signal(false);
  readonly active = this.activeState.asReadonly();

  enter(): void {
    this.activeState.set(true);
  }

  exit(): void {
    this.activeState.set(false);
  }
}
