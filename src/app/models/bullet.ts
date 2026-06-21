import { Point } from './point';

export interface Bullet {
  readonly position: Point;
  readonly radius: number;
}
