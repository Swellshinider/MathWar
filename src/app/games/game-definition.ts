export type GameId = 'equation-artillery' | 'formula-frenzy' | 'math-cross';

export interface GameDefinition {
  readonly id: GameId;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly image: string;
  readonly route: string;
}
