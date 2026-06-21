export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export const WORLD_BOUNDS: WorldBounds = {
  minX: -12,
  maxX: 12,
  minY: -7.5,
  maxY: 7.5,
};
