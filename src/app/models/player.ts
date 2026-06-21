import { Point } from './point';

export interface Player {
  readonly position: Point;
  readonly radius: number;
}
