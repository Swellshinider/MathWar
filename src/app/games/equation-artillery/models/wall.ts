import { Point } from './point';

export type WallShape = 'vertical' | 'circle' | 'square' | 'triangle';

export interface WallPiece {
  readonly id: number;
  readonly center: Point;
  readonly size: number;
}

export interface Wall {
  readonly id: number;
  readonly shape: WallShape;
  readonly pieces: readonly WallPiece[];
}
