import { Component, OnDestroy, effect, inject, input, untracked } from '@angular/core';
import { GameId } from '../../games/game-definition';
import { PlayFocusService } from './play-focus.service';

@Component({
  selector: 'app-game-frame',
  templateUrl: './game-frame.component.html',
  styleUrl: './game-frame.component.scss',
})
export class GameFrameComponent implements OnDestroy {
  protected readonly playFocus = inject(PlayFocusService);

  readonly gameId = input.required<GameId>();
  readonly eyebrow = input('');
  readonly title = input.required<string>();
  readonly objective = input('');
  readonly wide = input(false);
  readonly playing = input(false);

  constructor() {
    effect(() => {
      const context = { gameId: this.gameId(), title: this.title() };
      const playing = this.playing();
      untracked(() => this.playFocus.setPlaying(context, playing));
    });
  }

  ngOnDestroy(): void {
    this.playFocus.clear();
  }
}
