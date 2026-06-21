import { Point } from './point';

export interface Target {
  readonly id: number;
  readonly center: Point;
  readonly width: number;
  readonly height: number;
}
