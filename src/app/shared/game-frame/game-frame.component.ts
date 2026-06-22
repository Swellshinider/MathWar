import { Component, input } from '@angular/core';

@Component({
  selector: 'app-game-frame',
  templateUrl: './game-frame.component.html',
  styleUrl: './game-frame.component.scss',
})
export class GameFrameComponent {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly objective = input.required<string>();
}
