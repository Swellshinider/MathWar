import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-equation-history',
  templateUrl: './equation-history.component.html',
  styleUrl: './equation-history.component.scss',
})
export class EquationHistoryComponent {
  readonly equations = input.required<readonly string[]>();
  readonly selectEquation = output<string>();
  private readonly list = viewChild<ElementRef<HTMLOListElement>>('list');
  private renderedCount = 0;

  constructor() {
    effect(() => {
      const count = this.equations().length;
      const list = this.list();
      if (!list || count === this.renderedCount) return;
      this.renderedCount = count;
      queueMicrotask(() => {
        list.nativeElement.scrollTop = list.nativeElement.scrollHeight;
      });
    });
  }
}
