import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

export interface EquationHistoryMessage {
  readonly id: string;
  readonly equation: string;
  readonly senderName: string;
  readonly soldierName: string | null;
  readonly mine: boolean;
}

@Component({
  selector: 'app-equation-history',
  templateUrl: './equation-history.component.html',
  styleUrl: './equation-history.component.scss',
})
export class EquationHistoryComponent {
  readonly equations = input.required<readonly EquationHistoryMessage[]>();
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
