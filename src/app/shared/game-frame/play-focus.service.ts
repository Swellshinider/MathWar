import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { GameId } from '../../games/game-definition';

export interface PlayFocusContext {
  readonly gameId: GameId;
  readonly title: string;
}

@Injectable({ providedIn: 'root' })
export class PlayFocusService {
  private readonly document = inject(DOCUMENT);
  private readonly contextState = signal<PlayFocusContext | null>(null);
  private readonly playingState = signal(false);
  private readonly suspendedState = signal(false);

  readonly context = this.contextState.asReadonly();
  readonly playing = this.playingState.asReadonly();
  readonly suspended = this.suspendedState.asReadonly();
  readonly active = computed(() => this.playingState() && !this.suspendedState());
  readonly canResume = computed(() => this.playingState() && this.suspendedState());

  constructor() {
    effect(() => {
      const active = this.active();
      this.document.documentElement.classList.toggle('play-focus', active);
      this.document.body?.classList.toggle('play-focus', active);
    });
  }

  setPlaying(context: PlayFocusContext, playing: boolean): void {
    const previous = this.contextState();
    const contextChanged = previous?.gameId !== context.gameId || previous?.title !== context.title;
    const started = playing && !this.playingState();
    if (contextChanged || started) this.suspendedState.set(false);

    this.contextState.set(playing ? context : null);
    this.playingState.set(playing);
    if (!playing) this.suspendedState.set(false);
  }

  suspend(): void {
    if (this.playingState()) this.suspendedState.set(true);
  }

  resume(): void {
    if (this.playingState()) this.suspendedState.set(false);
  }

  clear(): void {
    this.contextState.set(null);
    this.playingState.set(false);
    this.suspendedState.set(false);
  }
}
